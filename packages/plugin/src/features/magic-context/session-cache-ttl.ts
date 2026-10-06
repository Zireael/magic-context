import {
    type CacheTtlConfig,
    type ResolvedCacheTtl,
    resolveModelCacheTtl,
} from "../../shared/model-cache-ttl";
import type { ContextDatabase } from "./storage-db";
import { getOrCreateSessionMeta, updateSessionMeta } from "./storage-meta";
import { readReplayEnvelope, updateReplayDocument } from "./storage-replay-document";

interface SessionCacheTtl extends ResolvedCacheTtl {
    config: CacheTtlConfig;
    /** Kept separately so removing a user override restores the session's original default. */
    builtInDefault?: ResolvedCacheTtl;
}

export function readSessionCacheTtl(
    db: ContextDatabase,
    sessionId: string,
): SessionCacheTtl | undefined {
    const saved = readReplayEnvelope(db, sessionId).cacheTtlPolicy as SessionCacheTtl | undefined;
    return saved && typeof saved.value === "string" && saved.config !== undefined
        ? saved
        : undefined;
}

/** User policy is live; only the built-in lifetime is frozen once the model is known. */
export function resolveSessionCacheTtl(
    db: ContextDatabase,
    sessionId: string,
    config: CacheTtlConfig | undefined,
    modelKey: string | undefined,
    configuredExplicitly?: boolean,
): ResolvedCacheTtl {
    const meta = getOrCreateSessionMeta(db, sessionId);
    const saved = readSessionCacheTtl(db, sessionId);
    const key = modelKey ?? saved?.modelKey;
    const live = resolveModelCacheTtl(config, key, configuredExplicitly);
    // Legacy policies already record their source. Preserve a saved built-in value,
    // but never reuse their frozen copy of the user's config for a new resolution.
    const builtInDefault =
        saved && saved.modelKey === key
            ? (saved.builtInDefault ??
              (saved.source !== "config"
                  ? { value: saved.value, source: saved.source, modelKey: saved.modelKey }
                  : resolveModelCacheTtl(undefined, key)))
            : resolveModelCacheTtl(live.source === "config" ? undefined : config, key, false);
    const resolved = live.source === "config" ? live : builtInDefault;
    if (!key) {
        if (meta.cacheTtl !== resolved.value)
            updateSessionMeta(db, sessionId, { cacheTtl: resolved.value });
        return resolved;
    }
    const next = { ...resolved, config: config ?? "5m", builtInDefault };
    if (JSON.stringify(saved) !== JSON.stringify(next)) {
        // Reuse the extensible replay document so restart preserves the decision
        // without a schema migration or a process-local session cache.
        if (
            !updateReplayDocument(db, sessionId, (doc) => {
                doc.version = 2;
                doc.cacheTtlPolicy = next;
                return true;
            })
        )
            throw new Error("cannot persist session cache TTL policy");
    }
    if (meta.cacheTtl !== next.value) updateSessionMeta(db, sessionId, { cacheTtl: next.value });
    return next;
}
