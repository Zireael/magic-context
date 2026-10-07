import { armThinkingBindingRecovery, getMergedReasoningStrippedIds, getThinkingBindingRecoveryTarget } from "../../features/magic-context/storage-meta-persisted";
import { decodeMergedReasoningParts } from "../../features/magic-context/merged-reasoning-decisions";
import { ensureSessionMetaRow } from "../../features/magic-context/storage-meta-shared";
import type { ContextDatabase } from "../../features/magic-context/storage";
import { isRecord } from "../../shared/record-type-guard";
import { TOOL_SWEEP_SCOPED_MARKER } from "./tool-sweep-policy";
import { contextRefusalError } from "./emergency-fail-closed";
import { latestAssistantTurnStart } from "./latest-assistant-turn";
import type { MessageLike } from "./tag-messages";

export const LATEST_THINKING_RESTORE = "latest_thinking_original";
const ACTIVE = `${LATEST_THINKING_RESTORE}:`;
const UNRECOVERABLE = `${LATEST_THINKING_RESTORE}_unavailable`;
export const LATEST_THINKING_UNSAFE = "ANTHROPIC_LATEST_TURN_EDIT_UNSAFE: The provider rejected edits to this thinking turn and its original context cannot be safely replayed. Send a new user message or /clear to continue.";

/** Use the existing recovery column; accepted legacy replay never arms this path. */
export function armLatestThinkingRecovery(db: ContextDatabase, sessionId: string): void {
    ensureSessionMetaRow(db, sessionId);
    const current = getThinkingBindingRecoveryTarget(db, sessionId);
    const next = current?.startsWith(ACTIVE) ? UNRECOVERABLE + ":" + current.slice(ACTIVE.length) : current?.startsWith(UNRECOVERABLE) ? current : LATEST_THINKING_RESTORE;
    db.prepare("UPDATE session_meta SET thinking_binding_recovery_target = ? WHERE session_id = ?").run(next, sessionId);
}

function clone<T>(value: T): T {
    if (Array.isArray(value)) return value.map(clone) as T;
    if (!isRecord(value)) return value;
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])) as T;
}

export function isThinkingPart(part: unknown): boolean {
    return isRecord(part) && ["thinking", "reasoning", "redacted_thinking"].includes(String(part.type));
}

function replayableOriginal(part: unknown): boolean {
    if (!isThinkingPart(part) || !isRecord(part)) return false;
    const metadata = isRecord(part.metadata) && isRecord(part.metadata.anthropic) ? part.metadata.anthropic : {};
    const signature = part.signature ?? part.thinkingSignature ?? metadata.signature ?? part.data ?? metadata.redactedData;
    return typeof signature === "string" && signature.length > 0 && part.text !== "[cleared]" && part.thinking !== "[cleared]";
}

export interface LatestThinkingRecovery {
    restore: boolean;
    ended: boolean;
}

/**
 * Only a provider rejection authorizes restoration. Keep the override durable
 * for the rest of this turn; a second rejection fails locally rather than looping.
 */
export function prepareLatestThinkingRecovery(args: {
    db: ContextDatabase; sessionId: string; messages: readonly unknown[];
    id: (message: unknown, index: number) => string | undefined;
    parts: (message: unknown) => readonly unknown[];
}): LatestThinkingRecovery {
    const target = getThinkingBindingRecoveryTarget(args.db, args.sessionId);
    if (!target || (!target.startsWith(LATEST_THINKING_RESTORE))) return { restore: false, ended: false };
    const start = latestAssistantTurnStart(args.messages);
    const anchor = start > 0 ? args.id(args.messages[start - 1], start - 1) : undefined;
    const savedAnchor = target.startsWith(ACTIVE) ? target.slice(ACTIVE.length) : target.startsWith(UNRECOVERABLE + ":") ? target.slice(UNRECOVERABLE.length + 1) : undefined;
    if (savedAnchor !== undefined && savedAnchor !== anchor) {
        args.db.prepare("UPDATE session_meta SET thinking_binding_recovery_target = '' WHERE session_id = ? AND thinking_binding_recovery_target = ?").run(args.sessionId, target);
        return { restore: false, ended: true };
    }
    if (target.startsWith(UNRECOVERABLE) || !anchor) throw contextRefusalError(LATEST_THINKING_UNSAFE);
    if (target === LATEST_THINKING_RESTORE) {
        args.db.prepare("UPDATE session_meta SET thinking_binding_recovery_target = ? WHERE session_id = ? AND thinking_binding_recovery_target = ?").run(ACTIVE + anchor, args.sessionId, target);
    }
    const active = args.messages.slice(start);
    if (!active.some(message => args.parts(message).some(replayableOriginal))) throw contextRefusalError(LATEST_THINKING_UNSAFE + " [missing-thinking-original]");
    const ids = new Map(args.messages.map((message, index) => [args.id(message, index), index]));
    for (const decision of getMergedReasoningStrippedIds(args.db, args.sessionId)) {
        if (decision === "binding_mismatch_order:end" || decision === TOOL_SWEEP_SCOPED_MARKER) continue;
        const id = decodeMergedReasoningParts(decision)?.[0] ?? (decision.startsWith("binding_mismatch:") ? decision.slice("binding_mismatch:".length) : decision);
        const index = ids.get(id);
        if (index === undefined || (index >= start && !args.parts(args.messages[index]).some(replayableOriginal))) throw contextRefusalError(LATEST_THINKING_UNSAFE + ` [missing-original:${id}]`);
    }
    return { restore: true, ended: false };
}

/** Capture after tagging, before destructive legacy replay, to retain wire tags. */
export function captureOriginalTurn<T>(messages: T[], parts: (message: T) => unknown, setParts: (message: T, parts: unknown) => void): (target?: T[]) => void {
    const start = Math.max(0, latestAssistantTurnStart(messages) - 1);
    const originals = messages.slice(start).map(message => ({ message, parts: clone(parts(message)) }));
    const before = messages.slice(0, start);
    return (target = messages) => {
        const first = target.findIndex(message => originals.some(original => original.message === message || (isRecord(message) && isRecord(original.message) && ((isRecord(message.info) && isRecord(original.message.info) && message.info.id === original.message.info.id) || (message.role === original.message.role && message.timestamp !== undefined && message.timestamp === original.message.timestamp)))));
        const prefix = first >= 0 ? target.slice(0, first) : target === messages ? before : target.slice();
        for (const original of originals) {
            setParts(original.message, clone(original.parts));
        }
        target.length = 0;
        target.push(...prefix, ...originals.map(original => original.message));
    };
}

export function captureLatestTurnOriginals(messages: MessageLike[]): (target?: MessageLike[]) => void {
    return captureOriginalTurn(messages, message => message.parts, (message, parts) => { message.parts = parts as unknown[]; });
}

export function armBindingRecoverySafely(db: ContextDatabase, sessionId: string): void {
    if (getThinkingBindingRecoveryTarget(db, sessionId)?.startsWith(LATEST_THINKING_RESTORE)) armLatestThinkingRecovery(db, sessionId);
    else armThinkingBindingRecovery(db, sessionId);
}
