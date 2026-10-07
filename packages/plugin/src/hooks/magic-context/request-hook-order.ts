/**
 * Which of OpenCode's two per-request hooks ran first for the request being built.
 *
 * OpenCode 1 builds every provider request in the same order: the prompt loop runs
 * `experimental.chat.messages.transform`, converts the messages, re-reads AGENTS.md
 * and configured instruction files, and only then runs
 * `experimental.chat.system.transform` inside the LLM request builder. So when the
 * system hook sees a changed system prompt, the messages of that same request are
 * already final, and the new system text is already going to the provider. That
 * request rewrites the provider's prompt cache from the system block onward.
 * Scheduling a Magic Context rebuild for the following request would make the
 * provider rewrite its cache a second time one request later.
 *
 * A host that ran the system hook first would let the following messages transform
 * fold Magic Context's rebuild into the same request. Both orders alternate
 * messages/system hooks per session; what differs is whether a provider response
 * lands between a messages pass and the next system hook. So the messages pass
 * leaves a marker, a completed assistant reply removes it, and the system hook
 * consumes it:
 *   - messages first: messages(N), system(N) — the marker is still there;
 *   - system first:   messages(N-1), reply(N-1), system(N) — the reply removed it.
 *
 * Only a reply newer than every assistant message the messages pass saw removes the
 * marker. A late completion event for an earlier reply therefore cannot make a
 * messages-first request look system-first.
 */
export interface RequestHookOrder {
    /** The messages transform is preparing a provider request for this session. */
    messagesPrepared(
        sessionId: string,
        messages: readonly { info?: { id?: unknown; role?: unknown } }[],
    ): void;
    /** An assistant message finished (served, failed or aborted). */
    assistantCompleted(sessionId: string, messageId: string | undefined): void;
    /**
     * Called by the system hook. True when this request's messages transform already
     * ran, so its messages can no longer change. Consumes the marker.
     */
    consumeMessagesPrepared(sessionId: string): boolean;
    clearSession(sessionId: string): void;
}

export function createRequestHookOrder(): RequestHookOrder {
    // Value: the newest assistant message id the messages pass saw ("" when none).
    const prepared = new Map<string, string>();
    return {
        messagesPrepared(sessionId, messages) {
            let newestAssistant = "";
            for (const message of messages) {
                const id = message.info?.id;
                if (message.info?.role !== "assistant" || typeof id !== "string") continue;
                if (id > newestAssistant) newestAssistant = id;
            }
            prepared.set(sessionId, newestAssistant);
        },
        assistantCompleted(sessionId, messageId) {
            const newestSeen = prepared.get(sessionId);
            if (newestSeen === undefined) return;
            // OpenCode message ids sort by creation time. An id we cannot compare is
            // treated as a newer reply: the fallback is the system-first path.
            if (messageId === undefined || messageId > newestSeen) prepared.delete(sessionId);
        },
        consumeMessagesPrepared(sessionId) {
            const had = prepared.has(sessionId);
            prepared.delete(sessionId);
            return had;
        },
        clearSession(sessionId) {
            prepared.delete(sessionId);
        },
    };
}
