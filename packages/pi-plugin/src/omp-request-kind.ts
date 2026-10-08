import type { ContextEvent } from "@earendil-works/pi-coding-agent";

// Oh My Pi 18.8.6 inserts this reminder in every ephemeral snapshot before its
// side prompt. It is an opt-out signature, never authority to admit a main turn.
const SIDE_REMINDER =
	"Ephemeral side-channel turn; reuses current conversation context.";

function textContainsReminder(value: unknown): boolean {
	if (typeof value === "string") return value.includes(SIDE_REMINDER);
	if (!Array.isArray(value)) return false;
	return value.some((block) => {
		if (!block || typeof block !== "object") return false;
		const part = block as { text?: unknown; content?: unknown };
		return typeof part.text === "string" && part.text.includes(SIDE_REMINDER);
	});
}

export function isOmpSideContext(event: ContextEvent): boolean {
	return event.messages.some((message) => {
		const row = message as {
			role?: unknown;
			attribution?: unknown;
			content?: unknown;
		};
		return (
			row.role === "developer" &&
			row.attribution === "agent" &&
			textContainsReminder(row.content)
		);
	});
}

/** Inspect known provider message containers without serializing or hashing history. */
export function classifyOmpPayload(
	payload: unknown,
): "main" | "side" | "unknown" {
	if (!payload || typeof payload !== "object") return "unknown";
	const body = payload as {
		messages?: unknown;
		input?: unknown;
		contents?: unknown;
	};
	const messages = body.messages ?? body.input ?? body.contents;
	if (!Array.isArray(messages)) return "unknown";
	for (const message of messages) {
		if (!message || typeof message !== "object") continue;
		const row = message as { content?: unknown; parts?: unknown };
		if (textContainsReminder(row.content ?? row.parts)) return "side";
	}
	return "main";
}
