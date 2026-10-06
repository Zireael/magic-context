import { createHash } from "node:crypto";
import { getMeasuredToolDefinitionTokens } from "../../features/magic-context/tool-definition-tokens";
import { BoundedSessionMap } from "../../shared/bounded-session-map";
import { providerResponseFailed } from "../../shared/provider-response-completion";
import type { LkgSlot } from "./lkg-slot";
import type { MessageLike } from "./transform-operations";

export type LkgRequestIdentity =
    | { kind: "v1"; responseId: string; modelKey: string }
    | { kind: "v2"; previousResponseId: string | undefined; startedAt: number; modelKey: string };

const requests = new BoundedSessionMap<LkgRequestIdentity>(1000);
const claimedRequests = new WeakSet<LkgRequestIdentity>();
const captures = new BoundedSessionMap<{
    request: LkgRequestIdentity;
    slot: string;
    prefixCount: number;
    envelope: string;
    usage?: { responseId: string; inputTokens: number };
}>(1000);

export function lkgProviderInputTotal(tokens?: {
    input?: number;
    cache?: { read?: number; write?: number };
}): number {
    const counts = [tokens?.input ?? 0, tokens?.cache?.read ?? 0, tokens?.cache?.write ?? 0];
    return counts.every((count) => Number.isSafeInteger(count) && count >= 0)
        ? counts.reduce((sum, count) => sum + count, 0)
        : Number.NaN;
}

function identity(slot: LkgSlot): string {
    return createHash("sha256")
        .update(
            JSON.stringify([
                slot.capturedAt,
                slot.captureSequence,
                slot.rowVersion,
                slot.modelKey,
                slot.providerKey,
                slot.inputIdSeq,
                slot.inputContentDigests,
            ]),
        )
        .update(slot.jsonPrefix)
        .digest("hex");
}

function envelope(modelKey: string, systemPromptTokens: number, agentName?: string): string {
    const slash = modelKey.indexOf("/");
    return JSON.stringify([
        modelKey,
        systemPromptTokens,
        agentName,
        getMeasuredToolDefinitionTokens(
            modelKey.slice(0, slash),
            modelKey.slice(slash + 1),
            agentName,
        ),
    ]);
}

/** OpenCode 2 creates its reply row after context. The previous row is a fence:
 * rereading its usage must never attribute it to the new request. */
export function beginV2LkgRequest(
    sessionId: string,
    modelKey: string,
    previousResponseId?: string,
): void {
    requests.set(sessionId, { kind: "v2", previousResponseId, startedAt: Date.now(), modelKey });
}

/** Freeze at preparation, not asynchronous commit: the next turn may start before
 * a deferred Rust snapshot is installed. */
export function claimLkgRequestIdentity(sessionId: string): LkgRequestIdentity | undefined {
    const request = requests.get(sessionId);
    if (!request || claimedRequests.has(request)) return;
    claimedRequests.add(request);
    return request;
}

export function noteCapturedLkgRequest(args: {
    sessionId: string;
    slot: LkgSlot;
    request?: LkgRequestIdentity;
    systemPromptTokens: number;
    agentName?: string;
}): void {
    const request = args.request;
    if (!request || request.modelKey !== args.slot.modelKey) {
        captures.delete(args.sessionId);
        return;
    }
    captures.set(args.sessionId, {
        request,
        slot: identity(args.slot),
        prefixCount: (JSON.parse(args.slot.jsonPrefix) as unknown[]).length,
        envelope: envelope(request.modelKey, args.systemPromptTokens, args.agentName),
    });
}

/** Bind provider input (including cache reads/writes, system and tools) to the
 * request that captured this slot, never to the session's latest pressure value. */
export function noteLkgProviderResponse(args: {
    sessionId: string;
    responseId?: string;
    modelKey?: string;
    inputTokens: number;
    completedAt?: number;
    finish?: string;
    error?: unknown;
    v2?: boolean;
    createdAt?: number;
}): void {
    if (!args.responseId || !args.modelKey) return;
    if (!args.v2 && args.inputTokens === 0 && !args.completedAt && !args.finish && !args.error) {
        const previous = requests.get(args.sessionId);
        if (
            previous?.kind === "v1" &&
            previous.responseId === args.responseId &&
            previous.modelKey === args.modelKey
        )
            return;
        requests.set(args.sessionId, {
            kind: "v1",
            responseId: args.responseId,
            modelKey: args.modelKey,
        });
        return;
    }
    const capture = captures.get(args.sessionId);
    if (
        !capture ||
        capture.usage ||
        capture.request.modelKey !== args.modelKey ||
        !Number.isSafeInteger(args.inputTokens) ||
        args.inputTokens <= 0 ||
        providerResponseFailed(args) ||
        (!args.completedAt && !args.finish)
    )
        return;
    const request = capture.request;
    if (request.kind === "v1") {
        if (args.v2 || request.responseId !== args.responseId) return;
    } else if (
        !args.v2 ||
        requests.get(args.sessionId) !== request ||
        request.previousResponseId === args.responseId ||
        args.createdAt === undefined ||
        args.createdAt < request.startedAt
    )
        return;
    capture.usage = { responseId: args.responseId, inputTokens: args.inputTokens };
}

export function measuredLkgPrefix(args: {
    sessionId: string;
    slot: LkgSlot | undefined;
    messages: readonly MessageLike[];
    modelKey: string;
    systemPromptTokens: number;
    agentName?: string;
}): { inputTokens: number; appendedMessages: readonly MessageLike[] } | undefined {
    const capture = captures.get(args.sessionId);
    if (
        !capture?.usage ||
        !args.slot ||
        capture.slot !== identity(args.slot) ||
        capture.request.modelKey !== args.modelKey ||
        capture.envelope !== envelope(args.modelKey, args.systemPromptTokens, args.agentName)
    )
        return;
    const appendedMessages = args.messages.slice(capture.prefixCount);
    // The reply whose usage was recorded is itself new input on the replay. The
    // exact prefix check also rejects a reasoning strip or any other prefix edit.
    if (
        appendedMessages[0]?.info.id !== capture.usage.responseId ||
        appendedMessages[0]?.info.role !== "assistant" ||
        JSON.stringify(args.messages.slice(0, capture.prefixCount)) !== args.slot.jsonPrefix
    )
        return;
    return { inputTokens: capture.usage.inputTokens, appendedMessages };
}

export function clearLkgMeasuredRequest(sessionId: string): void {
    requests.delete(sessionId);
    captures.delete(sessionId);
}

/** A priced pass drops the old slot before capturing the current request. Keep
 * the current response identity so that new capture can still bind its usage. */
export function clearCapturedLkgMeasurement(sessionId: string): void {
    captures.delete(sessionId);
}
