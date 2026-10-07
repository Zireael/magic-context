/** Independent request variants, all derived from the same completed conversation. */
export interface Block {
    type: string;
    [key: string]: unknown;
}
export interface Message {
    role: "user" | "assistant";
    content: Block[];
}
export interface ThinkingRequest {
    messages: Message[];
    [key: string]: unknown;
}
export const isThinking = (block: Block) => block.type === "thinking" || block.type === "redacted_thinking";
export const isSigned = (block: Block) => isThinking(block) &&
    ((typeof block.signature === "string" && block.signature.length > 0) ||
        (typeof block.data === "string" && block.data.length > 0));

export function requireSignedHistory(request: ThinkingRequest): void {
    const count = request.messages.flatMap((m) => m.content).filter(isSigned).length;
    if (count < 4) throw new Error(`Need at least four signed thinking blocks; got ${count}`);
    if (!request.messages.some((m) => m.content.some((b) => b.type === "tool_result"))) {
        throw new Error("Need a real tool-result history");
    }
}

export function thinkingVariants(request: ThinkingRequest): Array<{ variant: string; expected: string; request: ThinkingRequest }> {
    requireSignedHistory(request);
    const signedMessages = request.messages.flatMap((m, i) => m.content.filter(isSigned).map(() => i));
    const toolIndex = request.messages.findIndex((m) => m.content.some((b) => b.type === "tool_result"));
    const variants: Array<{ variant: string; expected: string; request: ThinkingRequest }> = [];
    const add = (variant: string, expected: string, change: (copy: ThinkingRequest) => void) => {
        const copy = structuredClone(request);
        change(copy);
        variants.push({ variant, expected, request: copy });
    };
    const strip = (copy: ThinkingRequest, remove: (ordinal: number, messageIndex: number) => boolean) => {
        let ordinal = 0;
        copy.messages.forEach((m, i) => {
            m.content = m.content.filter((b) => !isThinking(b) || !remove(ordinal++, i));
        });
    };
    add("control", "200", () => {});
    add("oldest-1", "200 (#23609)", (c) => strip(c, (n) => n === 0));
    add("oldest-2", "200 (#23609)", (c) => strip(c, (n) => n < 2));
    add("middle-kept", "400/signature error (#23609)", (c) => strip(c, (n) => n === 1));
    add("middle-suffix-stripped", "200 (#23609)", (c) => strip(c, (n) => n >= 1));
    add("all-stripped", "200 (#23609)", (c) => strip(c, () => true));
    const editTool = (c: ThinkingRequest) => {
        const block = c.messages[toolIndex]!.content.find((b) => b.type === "tool_result")!;
        block.content = "edited earlier echo result";
    };
    add("tool-edit-kept", "400/signature error (#23609)", editTool);
    add("tool-edit-suffix-stripped", "200 (#23609)", (c) => {
        editTool(c);
        strip(c, (_, i) => i > toolIndex);
    });
    const editFirst = (c: ThinkingRequest) => {
        const block = c.messages[0]!.content.find((b) => b.type === "text");
        if (!block) throw new Error("First user message needs a text block");
        block.text = `${block.text}\nRendered context marker: m0 -> m1.`;
    };
    add("first-user-edit-kept", "400/signature error (#23609)", editFirst);
    add("first-user-edit-suffix-stripped", "200 (#23609)", (c) => {
        editFirst(c);
        strip(c, () => true);
    });
    add("cleared-text", "400 (Anthropic analogue of #22050)", (c) => {
        const block = c.messages[signedMessages[0]!]!.content.find((b) => b.type === "thinking" && isSigned(b));
        if (!block) throw new Error("Need a text thinking block for [cleared]");
        block.thinking = "[cleared]";
    });
    return variants;
}
