import type { Database } from "./sqlite";

const pendingHints = new WeakMap<Database, Map<string, Set<string>>>();

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
