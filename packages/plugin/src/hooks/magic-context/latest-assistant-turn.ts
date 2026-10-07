import { isRecord } from "../../shared/record-type-guard";
import { isAnthropicFamilyRoute } from "./sentinel";

const THINKING_TYPES = new Set(["reasoning", "thinking", "redacted_thinking"]);
const METADATA_TYPES = new Set(["step-start", "step-finish", "snapshot", "patch"]);

function role(message: unknown): unknown {
    if (!isRecord(message)) return undefined;
    return isRecord(message.info) ? message.info.role : message.role;
}

function content(message: unknown): unknown {
    if (!isRecord(message)) return undefined;
    return Array.isArray(message.parts) ? message.parts : message.content;
}

/** A tool-result-only user entry continues the assistant turn, on both hosts. */
export function latestAssistantTurnStart(messages: readonly unknown[]): number {
    for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        if (role(message) !== "user") continue;
        const parts = content(message);
        if (typeof parts === "string") return i + 1;
        if (
            Array.isArray(parts) &&
            parts.some(
                (part) =>
                    isRecord(part) &&
                    part.type !== "tool_result" &&
                    part.type !== "tool-result" &&
                    part.type !== "tool" &&
                    part.kind !== "tool_result" &&
                    !METADATA_TYPES.has(String(part.type ?? part.kind)),
            )
        )
            return i + 1;
    }
    return 0;
}

/** Signed blocks are frozen for the whole tool loop, not just its newest step. */
export function latestAssistantTurnMessages<T>(messages: readonly T[]): Set<T> {
    return new Set(messages.slice(latestAssistantTurnStart(messages)));
}

export function hasActiveAnthropicThinkingTurn(
    messages: readonly unknown[],
    provider?: string,
    model?: string,
): boolean {
    const familyRoute = isAnthropicFamilyRoute(provider, model);
    for (const message of messages.slice(latestAssistantTurnStart(messages))) {
        if (role(message) !== "assistant") continue;
        const parts = content(message);
        if (!Array.isArray(parts)) continue;
        if (
            parts.some(
                (part) =>
                    isRecord(part) &&
                    THINKING_TYPES.has(String(part.type ?? part.kind)) &&
                    (familyRoute || (isRecord(part.metadata) && isRecord(part.metadata.anthropic))),
            )
        )
            return true;
    }
    return false;
}

export const ANTHROPIC_LATEST_TURN_FULL =
    "ANTHROPIC_LATEST_TURN_FULL: Context reached 95% within a thinking-bearing assistant turn. Its signed thinking cannot be reduced safely; end the tool loop and send a new user message, or /clear to continue.";
