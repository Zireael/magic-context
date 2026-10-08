import { randomUUID } from "node:crypto";
import { Worker } from "node:worker_threads";
import {
    embedBatchForProject,
    getProjectEmbeddingSnapshot,
} from "../../features/magic-context/memory/embedding";
import type { EmbeddingPurpose } from "../../features/magic-context/memory/embedding-provider";
import type {
    CapturedQueryEmbedding,
    UnifiedSearchOptions,
    UnifiedSearchResult,
} from "../../features/magic-context/search";
import {
    type AutoSearchHintDecision,
    appendAutoSearchHintDecision,
} from "../../features/magic-context/storage-meta-persisted";
import {
    markAutoSearchHintPending,
    settleAutoSearchHint,
} from "../../shared/auto-search-hint-fence";
import { isEmbeddingHostBusy } from "../../shared/embedding-activity";
import { getHarness, type HarnessId } from "../../shared/harness";
import { log } from "../../shared/logger";
import { type Database, getSqliteDatabasePath } from "../../shared/sqlite";
import {
    AUTO_SEARCH_TIMEOUT_MS,
    autoSearchDeadlineUnixMs,
    withAutoSearchDeadline,
} from "./auto-search-deadline";

const pendingRegistrations = new WeakMap<Database, Set<string>>();
const pendingTurns = new WeakMap<Database, Map<string, Map<string, Promise<unknown>>>>();

function retireRejectedHint(
    db: Database,
    path: string,
    sessionId: string,
    decision: AutoSearchHintDecision,
): void {
    const worker = new Worker(
        new URL(
            new URL(import.meta.url).pathname.endsWith(".ts")
                ? "./auto-search-worker.ts"
                : "./auto-search-worker.js",
            import.meta.url,
        ),
        {
            workerData: {
                path,
                sessionId,
                harness: getHarness(),
                retireDecision: decision,
                retireUntil: Date.now() + 10_000,
            },
        },
    );
    const finish = (retired: boolean) => {
        if (retired) settleAutoSearchHint(db, sessionId, decision.messageId);
        void worker.terminate();
    };
    worker.on("message", (reply: { retired?: boolean }) => finish(reply.retired === true));
    worker.on("error", () => finish(false));
    worker.unref();
}

/** A committed row may still be awaiting its owner's deadline acknowledgement.
 * Other passes of that same turn must join the owner, not replay a provisional
 * hint directly from SQLite. Each caller replays into its own message array. */
export async function coalesceAutoSearchTurn<T>(
    db: Database,
    sessionId: string,
    messageId: string,
    operation: () => Promise<T>,
    replay: () => void,
): Promise<T> {
    let sessions = pendingTurns.get(db);
    if (!sessions) {
        sessions = new Map();
        pendingTurns.set(db, sessions);
    }
    let turns = sessions.get(sessionId);
    if (!turns) {
        turns = new Map();
        sessions.set(sessionId, turns);
    }
    const pending = turns.get(messageId);
    if (pending) {
        const result = await pending;
        replay();
        return result as T;
    }
    const work = Promise.resolve().then(operation);
    turns.set(messageId, work);
    try {
        return await work;
    } finally {
        turns.delete(messageId);
        if (turns.size === 0) sessions.delete(sessionId);
    }
}

/** Cold optional hints skip immediately. Registration starts after the served
 * stage, and is deduplicated until it settles; warm hints never load config or
 * drain embedding-identity maintenance. Startup/tools own configuration refresh. */
export function queueAutoSearchRegistration(
    db: Database,
    projectPath: string,
    register?: () => Promise<void>,
): void {
    if (!register) return;
    let pending = pendingRegistrations.get(db);
    if (!pending) {
        pending = new Set();
        pendingRegistrations.set(db, pending);
    }
    if (pending.has(projectPath)) return;
    pending.add(projectPath);
    const timer = setTimeout(() => {
        if (getProjectEmbeddingSnapshot(projectPath)) {
            pending.delete(projectPath);
            return;
        }
        void Promise.resolve()
            .then(register)
            .catch((error) =>
                log(
                    `[auto-search] background registration failed: ${error instanceof Error ? error.message : String(error)}`,
                ),
            )
            .finally(() => pending.delete(projectPath));
    }, 0);
    timer.unref?.();
}

/** Decision writes can checkpoint a large WAL. Give them the remaining search
 * budget too, without blocking the prompt thread on SQLite or filesystem I/O. */
export async function persistAutoSearchDecision(
    db: Database,
    sessionId: string,
    decision: AutoSearchHintDecision,
    startedAt: number,
    entry = new URL(
        new URL(import.meta.url).pathname.endsWith(".ts")
            ? "./auto-search-worker.ts"
            : "./auto-search-worker.js",
        import.meta.url,
    ),
): Promise<ReturnType<typeof appendAutoSearchHintDecision> | null> {
    const path = getSqliteDatabasePath(db);
    const fenced = path !== null && decision.decision === "hint";
    const reserved: AutoSearchHintDecision =
        fenced && decision.decision === "hint"
            ? { ...decision, publication: { token: randomUUID(), state: "provisional" } }
            : decision;
    let rejected = false;
    let retirementQueued = false;
    // A rejected publication can be retired immediately: its durable provisional
    // state cannot be promoted without a timely owner command.
    const retireIfReady = () => {
        if (fenced && path && rejected && !retirementQueued) {
            retirementQueued = true;
            retireRejectedHint(db, path, sessionId, reserved);
        }
    };
    const result = await withAutoSearchDeadline(
        async (signal): Promise<ReturnType<typeof appendAutoSearchHintDecision> | null> => {
            if (fenced) markAutoSearchHintPending(db, sessionId, decision.messageId);
            if (!path) return appendAutoSearchHintDecision(db, sessionId, decision);
            const write = (command: Record<string, AutoSearchHintDecision>, target = entry) =>
                new Promise<ReturnType<typeof appendAutoSearchHintDecision> | null>((resolve) => {
                    const worker = new Worker(target, {
                        workerData: {
                            path,
                            sessionId,
                            harness: getHarness(),
                            ...command,
                            deadlineUnixMs:
                                Date.now() +
                                Math.max(
                                    0,
                                    AUTO_SEARCH_TIMEOUT_MS - (performance.now() - startedAt),
                                ),
                        },
                    });
                    const abort = () => {
                        // Do not kill a worker in COMMIT: it must be allowed to retire a
                        // hint whose commit completed after the served-turn deadline.
                        worker.unref();
                        resolve(null);
                    };
                    let finished = false;
                    const finish = (
                        outcome: ReturnType<typeof appendAutoSearchHintDecision> | null,
                    ) => {
                        if (finished) return;
                        finished = true;
                        signal.removeEventListener("abort", abort);
                        resolve(signal.aborted ? null : outcome);
                        void worker.terminate();
                        retireIfReady();
                    };
                    signal.addEventListener("abort", abort, { once: true });
                    worker.on(
                        "message",
                        (
                            reply:
                                | ReturnType<typeof appendAutoSearchHintDecision>
                                | { kind: "error"; error: string }
                                | null,
                        ) => {
                            if (
                                reply &&
                                "ok" in reply &&
                                reply.ok &&
                                reply.decision.decision === "hint" &&
                                reply.decision.publication?.state === "provisional" &&
                                !signal.aborted
                            ) {
                                if (
                                    reserved.decision !== "hint" ||
                                    reply.decision.publication.token !== reserved.publication?.token
                                ) {
                                    finish({ ok: false, kind: "cas-exhausted" });
                                } else
                                    worker.postMessage({
                                        kind: "publish",
                                        token: reserved.publication.token,
                                    });
                                return;
                            }
                            finish(
                                reply === null
                                    ? null
                                    : "ok" in reply
                                      ? reply
                                      : { ok: false, kind: "cas-exhausted" },
                            );
                        },
                    );
                    worker.on("error", () => finish({ ok: false, kind: "cas-exhausted" }));
                    worker.on("exit", () => finish({ ok: false, kind: "cas-exhausted" }));
                    if (signal.aborted) abort();
                });
            return write({ decision: reserved });
        },
        startedAt,
    );
    rejected = result === null || !result.ok;
    if (rejected) retireIfReady();
    else if (fenced) settleAutoSearchHint(db, sessionId, decision.messageId);
    return result;
}

export interface AutoSearchWorkerInput {
    path: string;
    harness: HarnessId;
    sessionId: string;
    projectPath: string;
    query: string;
    options: Omit<
        UnifiedSearchOptions,
        "embedQuery" | "isEmbeddingRuntimeEnabled" | "signal" | "readMessages"
    >;
    embeddingRuntimeEnabled: boolean;
    embeddingHostBusy: boolean;
    snapshot: ReturnType<typeof getProjectEmbeddingSnapshot>;
    deadlineUnixMs?: number;
}
export type AutoSearchWorkerReply =
    | { kind: "result"; results: UnifiedSearchResult[] }
    | { kind: "error"; error: string }
    | { kind: "query"; id: number; text: string }
    | { kind: "batch"; id: number; texts: string[]; purpose: EmbeddingPurpose };
export type AutoSearchEmbeddingReply = {
    id: number;
    embeddingHostBusy?: boolean;
    result?: CapturedQueryEmbedding | Float32Array | null;
    passage?: {
        vectors: (Float32Array | null)[];
        modelId: string;
        generation: number;
        providerIdentity: string;
        runtimeFingerprint: string;
        dimensions: number | null;
    } | null;
    error?: string;
};

/**
 * Keep every search SELECT, vector scan and memory backfill off the prompt thread.
 * Termination is deliberately not awaited: a blocked SQLite worker must not hold
 * the served turn hostage. It owns its connection and cannot persist hint decisions.
 * All provider calls stay with the owner and share the caller's abort signal.
 */
export async function searchAutoHint(
    db: Database,
    sessionId: string,
    projectPath: string,
    query: string,
    options: UnifiedSearchOptions,
    entry = new URL(
        new URL(import.meta.url).pathname.endsWith(".ts")
            ? "./auto-search-worker.ts"
            : "./auto-search-worker.js",
        import.meta.url,
    ),
): Promise<UnifiedSearchResult[]> {
    if (options.signal?.aborted) return [];
    const path = getSqliteDatabasePath(db);
    if (!path) throw new Error("auto-search requires a file-backed database for off-thread search");
    const {
        embedQuery,
        isEmbeddingRuntimeEnabled,
        signal,
        readMessages: _readMessages,
        ...serializable
    } = options;
    const snapshot = getProjectEmbeddingSnapshot(projectPath);
    const input: AutoSearchWorkerInput = {
        path,
        harness: getHarness(),
        sessionId,
        projectPath,
        query,
        options: { ...serializable, countRetrievals: false, measurementDisabled: true },
        embeddingRuntimeEnabled: isEmbeddingRuntimeEnabled?.() ?? false,
        embeddingHostBusy: isEmbeddingHostBusy(),
        snapshot,
        deadlineUnixMs: autoSearchDeadlineUnixMs(signal),
    };
    return new Promise((resolve, reject) => {
        const worker = new Worker(entry, { workerData: input });
        let settled = false;
        const finish = (results: UnifiedSearchResult[], error?: Error) => {
            if (settled) return;
            settled = true;
            signal?.removeEventListener("abort", abort);
            void worker.terminate();
            worker.unref();
            if (error) reject(error);
            else resolve(results);
        };
        const abort = () => finish([]);
        signal?.addEventListener("abort", abort, { once: true });
        worker.on("error", (error) => finish([], error));
        worker.on("exit", (code) => finish([], new Error(`auto-search worker exited (${code})`)));
        worker.on("message", async (reply: AutoSearchWorkerReply) => {
            if (settled) return;
            if (reply.kind === "result") {
                // A registration can change while the worker is ranking. Never serve
                // vectors from a generation that the owner has since replaced.
                if (
                    snapshot &&
                    getProjectEmbeddingSnapshot(projectPath)?.generation !== snapshot.generation
                )
                    finish([]);
                else finish(reply.results);
                return;
            }
            if (reply.kind === "error") {
                finish([], new Error(reply.error));
                return;
            }
            const response: AutoSearchEmbeddingReply = { id: reply.id };
            try {
                if (reply.kind === "query")
                    response.result = (await embedQuery?.(reply.text, signal)) ?? null;
                else {
                    const passage = await embedBatchForProject(
                        projectPath,
                        reply.texts,
                        signal,
                        reply.purpose,
                    );
                    const current = getProjectEmbeddingSnapshot(projectPath);
                    response.passage =
                        passage && current
                            ? {
                                  ...passage,
                                  providerIdentity: current.providerIdentity,
                                  runtimeFingerprint: current.runtimeFingerprint,
                                  dimensions:
                                      passage.vectors.find((vector) => vector !== null)?.length ??
                                      null,
                              }
                            : null;
                }
            } catch (error) {
                response.error = error instanceof Error ? error.message : String(error);
            }
            response.embeddingHostBusy = isEmbeddingHostBusy();
            // Providers that ignore abort can complete late. Never send their
            // continuation into a dead worker or a subsequent turn's request.
            if (!settled && !signal?.aborted) worker.postMessage(response);
        });
        if (signal?.aborted) abort();
    });
}
