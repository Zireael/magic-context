import { Worker } from "node:worker_threads";
import {
    type AutoSearchHintNoHintReason,
    appendAutoSearchHintDecision,
} from "../../features/magic-context/storage-meta-persisted";
import { getHarness } from "../../shared/harness";
import { type Database, getSqliteDatabasePath } from "../../shared/sqlite";

export const AUTO_SEARCH_TIMEOUT_MS = 3_000;

const skippedTurns = new Map<
    string,
    WeakMap<Database, { messageId: string; persistence: Promise<boolean> }>
>();

export function wasAutoSearchSkipped(db: Database, sessionId: string, messageId: string): boolean {
    return skippedTurns.get(sessionId)?.get(db)?.messageId === messageId;
}

export function clearAutoSearchTimeoutForSession(sessionId?: string): void {
    if (sessionId === undefined) skippedTurns.clear();
    else skippedTurns.delete(sessionId);
}

/** Freeze the skip even if another writer owns SQLite at the deadline. */
export function persistAutoSearchSkip(
    db: Database,
    sessionId: string,
    messageId: string,
    reason: AutoSearchHintNoHintReason = "timeout",
): Promise<boolean> {
    let turns = skippedTurns.get(sessionId);
    if (!turns) {
        turns = new WeakMap();
        skippedTurns.set(sessionId, turns);
    }
    const prior = turns.get(db);
    if (prior?.messageId === messageId) return prior.persistence;
    const path = getSqliteDatabasePath(db);
    // In-memory databases have neither file locks nor WAL checkpoint I/O. They
    // are used by isolated tests; runtime stores use the off-thread path below.
    const persistence = path
        ? new Promise<boolean>((resolve) => {
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
                          skipDecision: { messageId, decision: "no-hint", reason },
                      },
                  },
              );
              const finish = (ok: boolean) => {
                  resolve(ok);
                  void worker.terminate();
              };
              worker.on("message", (reply: { ok?: boolean }) => finish(reply.ok === true));
              worker.on("error", () => finish(false));
              worker.on("exit", () => resolve(false));
              worker.unref();
          })
        : Promise.resolve(
              appendAutoSearchHintDecision(db, sessionId, {
                  messageId,
                  decision: "no-hint",
                  reason,
              }).ok,
          );
    turns.set(db, { messageId, persistence });
    return persistence;
}

/**
 * Preparation and search share one deadline. Check elapsed time as well as
 * the timer: a synchronous SQLite call can prevent an overdue timer from
 * firing before the search promise resolves. Checkpoints after preparation or
 * embedding abort expired work before its next synchronous database scan;
 * overdue search results are discarded before hint persistence.
 */
export async function withAutoSearchDeadline<T>(
    operation: (signal: AbortSignal, checkDeadline: () => boolean) => Promise<T>,
    startedAt = performance.now(),
): Promise<T | null> {
    const deadline = startedAt + AUTO_SEARCH_TIMEOUT_MS;
    const remaining = deadline - performance.now();
    if (remaining <= 0) return null;
    const controller = new AbortController();
    const checkDeadline = (): boolean => {
        if (!controller.signal.aborted && performance.now() >= deadline) controller.abort();
        return controller.signal.aborted;
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => {
        timer = setTimeout(() => {
            resolve(null);
            controller.abort();
        }, remaining);
    });
    try {
        return await Promise.race([
            Promise.resolve()
                .then(() => operation(controller.signal, checkDeadline))
                .then((result) => {
                    if (checkDeadline()) {
                        return null;
                    }
                    return result;
                }),
            timeout,
        ]);
    } finally {
        if (timer !== undefined) clearTimeout(timer);
    }
}
