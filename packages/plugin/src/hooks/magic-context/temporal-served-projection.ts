import type { Database } from "../../shared/sqlite";
import { loadPersistedLkgSlot } from "./lkg-persist";
import { getInMemorySlot } from "./lkg-slot";
import { peelLeadingMcTagNotation } from "./tag-content-primitives";
import { TEMPORAL_MARKER_REPLAY_PATTERN } from "./temporal-awareness";

/** Prefer served bytes over a neighbour walk when an upgrade coincides with a cut. */
export function readServedTemporalDecisions(
    db: Database,
    sessionId: string,
    runtime: "pi" | "opencode",
): Map<string, string> {
    const slot = getInMemorySlot(sessionId) ?? loadPersistedLkgSlot(db, sessionId);
    if (!slot) return new Map();
    let messages: unknown;
    try {
        messages = JSON.parse(slot.jsonPrefix);
    } catch {
        return new Map();
    }
    if (!Array.isArray(messages)) return new Map();
    const result = new Map<string, string>();
    const tagOwner = db.prepare("SELECT message_id FROM tags WHERE session_id=? AND tag_number=?");
    for (let index = 0; index < messages.length; index++) {
        const raw = messages[index];
        if (!raw || typeof raw !== "object") continue;
        const message = raw as {
            role?: string;
            info?: { id?: string; role?: string };
            content?: unknown;
            parts?: Array<{ type?: string; text?: string; ignored?: boolean }>;
        };
        const role = runtime === "pi" ? message.role : message.info?.role;
        if (role !== "user") continue;
        const parts = runtime === "pi" ? message.content : message.parts;
        const text =
            typeof parts === "string"
                ? parts
                : Array.isArray(parts)
                  ? parts.find((part) => part?.type === "text" && part.ignored !== true)?.text
                  : undefined;
        if (typeof text !== "string") continue;
        let id = runtime === "pi" ? slot.piOutputEntryIds?.[index] : message.info?.id;
        if (!id && runtime === "pi") {
            // Older Pi snapshots lacked an output-ownership vector. Their §N§
            // prefix still names an unambiguous persisted tag in this session.
            const tag = /^§(\d+)§/.exec(text);
            const owner = tag
                ? (tagOwner.get(sessionId, Number(tag[1])) as { message_id: string } | undefined)
                : undefined;
            id = owner?.message_id.replace(/:p\d+$/, "");
        }
        if (!id) continue;
        const marker = peelLeadingMcTagNotation(text).body.match(
            TEMPORAL_MARKER_REPLAY_PATTERN,
        )?.[0];
        result.set(id, marker ? `${marker.trimEnd()}\n` : "");
    }
    return result;
}
