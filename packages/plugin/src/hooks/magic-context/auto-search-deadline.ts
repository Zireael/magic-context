import { Worker } from "node:worker_threads";
import {
    type AutoSearchHintDecision,
    type AutoSearchHintNoHintReason,
    appendAutoSearchHintDecision,
} from "../../features/magic-context/storage-meta-persisted";
import {
    cancelAutoSearchSessionWrites,
    registerAutoSearchWriter,
} from "../../shared/auto-search-hint-fence";
import { getHarness } from "../../shared/harness";
import { type Database, getSqliteDatabasePath } from "../../shared/sqlite";

export const AUTO_SEARCH_TIMEOUT_MS = 3_000;
const operationDeadlines = new WeakMap<AbortSignal, number>();

export function autoSearchDeadlineUnixMs(signal?: AbortSignal): number {
    const deadline = signal && operationDeadlines.get(signal);
    return (
        Date.now() +
        (deadline === undefined
            ? AUTO_SEARCH_TIMEOUT_MS
            : Math.max(0, deadline - performance.now()))
    );
}

const skippedTurns = new Map<string, WeakMap<Database, Map<string, Promise<boolean>>>>();

export function wasAutoSearchSkipped(db: Database, sessionId: string, messageId: string): boolean {
    return skippedTurns.get(sessionId)?.get(db)?.has(messageId) ?? false;
}

export function clearAutoSearchTimeoutForSession(sessionId?: string): void {
    cancelAutoSearchSessionWrites(sessionId);
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
    let messages = turns.get(db);
    if (!messages) {
        messages = new Map();
        turns.set(db, messages);
    }
    const prior = messages.get(messageId);
    if (prior) return prior;
    const path = getSqliteDatabasePath(db);
    const incarnation = db
        .prepare("SELECT rowid AS id FROM session_meta WHERE session_id = ?")
        .get(sessionId) as { id: number } | undefined;
    // In-memory databases have neither file locks nor WAL checkpoint I/O. They
    // are used by isolated tests; runtime stores use the off-thread path below.
    const persistence = path
        ? new Promise<boolean>((resolve) => {
              const registration = registerAutoSearchWriter(sessionId);
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
                          cancellation: registration.cancellation,
                          expectedRowid: incarnation?.id ?? null,
                          deadlineUnixMs: Date.now() + 250,
                      },
                  },
              );
              const finish = (ok: boolean) => {
                  registration.done();
                  resolve(ok);
                  void worker.terminate();
              };
              worker.on("message", (reply: { ok?: boolean; decision?: AutoSearchHintDecision }) =>
                  finish(reply.ok === true && reply.decision?.decision === "no-hint"),
              );
              worker.on("error", () => finish(false));
              worker.on("exit", () => {
                  registration.done();
                  resolve(false);
              });
              worker.unref();
          })
        : Promise.resolve(
              appendAutoSearchHintDecision(db, sessionId, {
                  messageId,
                  decision: "no-hint",
                  reason,
              }).ok,
          );
    messages.set(messageId, persistence);
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
    operationDeadlines.set(controller.signal, deadline);
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
