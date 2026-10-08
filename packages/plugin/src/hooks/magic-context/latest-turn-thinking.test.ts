import { expect, test } from "bun:test";
import {
    hasActiveAnthropicThinkingTurn,
    latestAssistantTurnMessages,
    latestAssistantTurnStart,
} from "./latest-assistant-turn";
import type { MessageLike } from "./tag-messages";
import { finalizeMessageRepresentation } from "./transform-postprocess-phase";

const fixture = (): MessageLike[] => [
    { info: { id: "u", role: "user" }, parts: [{ type: "text", text: "Task" }] },
    {
        info: { id: "a1", role: "assistant" },
        parts: [
            { type: "reasoning", text: "one", signature: "signed-one" },
            { type: "tool", callID: "t1" },
        ],
    },
    {
        info: { id: "r", role: "user" },
        parts: [{ type: "tool_result", tool_use_id: "t1", content: "result" }],
    },
    {
        info: { id: "a2", role: "assistant" },
        parts: [
            { type: "reasoning", text: "two", signature: "signed-two" },
            { type: "redacted_thinking", data: "opaque" },
            { type: "tool", callID: "t2" },
        ],
    },
    { info: { id: "shell", role: "assistant" }, parts: [{ type: "step-start" }] },
];

for (const provider of ["anthropic", "vertex-eu-anthropic"]) {
    test(`latest thinking turn survives frozen representation strips on ${provider}`, () => {
        const messages = fixture();
        const before = JSON.stringify(messages);
        finalizeMessageRepresentation(messages, provider, {
            protectedThinkingMessages: latestAssistantTurnMessages(messages),
            thinkingBindingRecoveryMessageIds: new Set(["a1", "a2"]),
            mergedReasoningStrippedIds: new Set(["a1", "a2"]),
        });
        expect(JSON.stringify(messages)).toBe(before);
    });
}

test("completed primary turns keep the existing representation bytes", () => {
    const messages = fixture();
    messages.push({
        info: { id: "next", role: "user" },
        parts: [{ type: "text", text: "New turn" }],
    });
    const expected = structuredClone(messages);
    // Existing binding-recovery representation: the canonical adapter filters
    // these exact empty sentinels; all other parts and ordering stay unchanged.
    expected[1]!.parts[0] = { type: "text", text: "" };
    expected[3]!.parts[0] = { type: "text", text: "" };
    expected[3]!.parts[1] = { type: "text", text: "" };
    finalizeMessageRepresentation(messages, "anthropic", {
        thinkingBindingRecoveryMessageIds: new Set(["a1", "a2"]),
        mergedReasoningStrippedIds: new Set(),
    });
    expect(JSON.stringify(messages)).toBe(JSON.stringify(expected));
});

test("tool results and request shells do not end thinking on Anthropic-family serializers", () => {
    const messages = fixture();
    expect(latestAssistantTurnStart(messages)).toBe(1);
    for (const [provider, model] of [
        ["anthropic", "claude-sonnet-5"],
        ["vertex-eu-anthropic", "claude-sonnet-5"],
        ["google-vertex", "claude-sonnet-5"],
        ["amazon-bedrock", "us.anthropic.claude-sonnet-5-v1:0"],
    ]) {
        expect(hasActiveAnthropicThinkingTurn(messages, provider, model)).toBe(true);
    }
    expect(hasActiveAnthropicThinkingTurn(messages, "openai", "gpt-5")).toBe(false);
    messages[1]!.parts = [
        { type: "reasoning", text: "signed", metadata: { anthropic: { signature: "opaque" } } },
    ];
    expect(hasActiveAnthropicThinkingTurn(messages, "custom", "renamed")).toBe(true);
    messages.push({
        info: { role: "user" },
        parts: [{ type: "tool-result", toolCallId: "t2", output: "result" }],
    });
    expect(latestAssistantTurnStart(messages)).toBe(1);
    messages.push({ info: { role: "user" }, parts: [{ type: "text", text: "Next real user" }] });
    expect(hasActiveAnthropicThinkingTurn(messages, "anthropic", "claude-sonnet-5")).toBe(false);
});
