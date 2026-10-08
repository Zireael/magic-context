import type { Database } from "./sqlite";

const pendingHints = new WeakMap<Database, Map<string, Set<string>>>();
const pendingWriters = new Map<string, Set<Int32Array>>();

/** Shared cancellation is checked inside the worker's IMMEDIATE transaction. */
export function registerAutoSearchWriter(sessionId: string): {
    cancellation: SharedArrayBuffer;
    done: () => void;
} {
    const cancellation = new SharedArrayBuffer(4);
    const flag = new Int32Array(cancellation);
    let writers = pendingWriters.get(sessionId);
    if (!writers) {
        writers = new Set();
        pendingWriters.set(sessionId, writers);
    }
    writers.add(flag);
    let finished = false;
    return {
        cancellation,
        done: () => {
            if (finished) return;
            finished = true;
            writers.delete(flag);
            if (writers.size === 0) pendingWriters.delete(sessionId);
        },
    };
}

export function cancelAutoSearchSessionWrites(sessionId?: string): void {
    for (const [id, writers] of pendingWriters) {
        if (sessionId !== undefined && id !== sessionId) continue;
        for (const flag of writers) Atomics.store(flag, 0, 1);
    }
}

/** Unacknowledged worker writes are not provider-visible decisions. */
export function markAutoSearchHintPending(
    db: Database,
    sessionId: string,
    messageId: string,
): void {
    let sessions = pendingHints.get(db);
    if (!sessions) {
        sessions = new Map();
        pendingHints.set(db, sessions);
    }
    let messages = sessions.get(sessionId);
    if (!messages) {
        messages = new Set();
        sessions.set(sessionId, messages);
    }
    messages.add(messageId);
}

export function isAutoSearchHintPending(
    db: Database,
    sessionId: string,
    messageId: string,
): boolean {
    return pendingHints.get(db)?.get(sessionId)?.has(messageId) ?? false;
}

/** Release only after an accepted acknowledgement or durable retirement. Session
 * switching must not expose an unserved hint while its writer is still finishing. */
export function settleAutoSearchHint(db: Database, sessionId: string, messageId: string): void {
    const sessions = pendingHints.get(db);
    const messages = sessions?.get(sessionId);
    messages?.delete(messageId);
    if (messages?.size === 0) sessions?.delete(sessionId);
}
