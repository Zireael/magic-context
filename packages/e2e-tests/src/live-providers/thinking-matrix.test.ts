import { describe, expect, it } from "bun:test";
import { requireSignedHistory, thinkingVariants, type ThinkingRequest } from "./thinking-matrix";

const fixture = (): ThinkingRequest => ({
    model: "fixture", thinking: { type: "adaptive" }, system: "fixed", tools: ["echo"],
    messages: [
        { role: "user", content: [{ type: "text", text: "first user" }] },
        { role: "assistant", content: [{ type: "thinking", thinking: "t0", signature: "s0" }, { type: "tool_use", id: "a", input: { value: "original" } }] },
        { role: "user", content: [{ type: "tool_result", tool_use_id: "a", content: "original" }] },
        { role: "assistant", content: [{ type: "thinking", thinking: "t1", signature: "s1" }, { type: "text", text: "done 1" }] },
        { role: "user", content: [{ type: "text", text: "second user" }] },
        { role: "assistant", content: [{ type: "thinking", thinking: "t2", signature: "s2" }, { type: "tool_use", id: "b", input: { value: "next" } }] },
        { role: "user", content: [{ type: "tool_result", tool_use_id: "b", content: "next" }] },
        { role: "assistant", content: [{ type: "thinking", thinking: "t3", signature: "s3" }, { type: "text", text: "done 2" }] },
        { role: "user", content: [{ type: "text", text: "next request" }] },
    ],
});
const signatures = (r: ThinkingRequest) => r.messages.flatMap((m) => m.content).filter((b) => b.type === "thinking").map((b) => b.signature);
const nonThinking = (r: ThinkingRequest) => r.messages.map((m) => ({ ...m, content: m.content.filter((b) => b.type !== "thinking") }));

describe("signed-thinking request matrix", () => {
    it("refuses insufficient or unsigned history before constructing variants", () => {
        const short = fixture();
        short.messages[7]!.content.shift();
        expect(() => requireSignedHistory(short)).toThrow("got 3");
        const unsigned = fixture();
        unsigned.messages[1]!.content[0]!.signature = "";
        expect(() => requireSignedHistory(unsigned)).toThrow("got 3");
    });
    it("constructs exact prefix, middle, suffix and full removals without changing other content", () => {
        const original = fixture();
        const rows = thinkingVariants(original);
        const expected: Record<string, string[]> = {
            control: ["s0", "s1", "s2", "s3"], "oldest-1": ["s1", "s2", "s3"],
            "oldest-2": ["s2", "s3"], "middle-kept": ["s0", "s2", "s3"],
            "middle-suffix-stripped": ["s0"], "all-stripped": [],
        };
        for (const row of rows.filter((r) => r.variant in expected)) {
            expect(signatures(row.request)).toEqual(expected[row.variant]!);
            expect(nonThinking(row.request)).toEqual(nonThinking(original));
            expect(row.request.system).toBe("fixed");
            expect(row.request.tools).toEqual(["echo"]);
        }
        expect(original).toEqual(fixture());
    });
    it("changes only the early tool result and strips precisely its later thinking in the pair", () => {
        const rows = thinkingVariants(fixture());
        const kept = rows.find((r) => r.variant === "tool-edit-kept")!.request;
        const stripped = rows.find((r) => r.variant === "tool-edit-suffix-stripped")!.request;
        expect(signatures(kept)).toEqual(["s0", "s1", "s2", "s3"]);
        expect(signatures(stripped)).toEqual(["s0"]);
        expect(kept.messages[1]!.content[1]!.input).toEqual({ value: "original" });
        expect(kept.messages[2]!.content[0]!.content).toBe("edited earlier echo result");
        expect(kept.messages[6]!.content[0]!.content).toBe("next");
        expect(nonThinking(kept)).toEqual(nonThinking(stripped));
    });
    it("re-renders the first user text, with all later thinking stripped only in its paired request", () => {
        const rows = thinkingVariants(fixture());
        const kept = rows.find((r) => r.variant === "first-user-edit-kept")!.request;
        const stripped = rows.find((r) => r.variant === "first-user-edit-suffix-stripped")!.request;
        expect(kept.messages[0]!.content[0]!.text).toBe("first user\nRendered context marker: m0 -> m1.");
        expect(signatures(kept)).toEqual(["s0", "s1", "s2", "s3"]);
        expect(signatures(stripped)).toEqual([]);
        expect(nonThinking(kept)).toEqual(nonThinking(stripped));
    });
    it("writes literal cleared text without replacing its original signature", () => {
        const row = thinkingVariants(fixture()).find((r) => r.variant === "cleared-text")!;
        expect(row.request.messages[1]!.content[0]).toEqual({ type: "thinking", thinking: "[cleared]", signature: "s0" });
        expect(row.request.messages.slice(2)).toEqual(fixture().messages.slice(2));
    });
});
