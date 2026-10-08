import { expect, test } from "bun:test";
import {
	getOrCreateSessionMeta,
	getPendingOps,
	queuePendingOp,
	updateSessionMeta,
} from "@magic-context/core/features/magic-context/storage";
import { createTagger } from "@magic-context/core/features/magic-context/tagger";
import { closeQuietly } from "@magic-context/core/shared/sqlite-helpers";
import {
	clearContextHandlerSession,
	registerPiContextHandler,
} from "./context-handler";
import { applyPiProactiveThinkingStrip } from "./provider-error-recovery-pi";
import { clearOldReasoningPi } from "./reasoning-replay-pi";
import {
	assistantMessage,
	createFakePi,
	createTestDb,
	fakeContext,
	userMessage,
} from "./test-utils.test";

test("Pi thinking spans every tool round until the next real user", () => {
	const messages = [
		{ role: "user", content: "task" },
		{
			role: "assistant",
			content: [
				{
					type: "thinking",
					thinking: "first",
					thinkingSignature: "signed-first",
				},
				{ type: "toolCall", id: "t1" },
			],
		},
		{
			role: "toolResult",
			toolCallId: "t1",
			content: [{ type: "text", text: "result" }],
		},
		{
			role: "assistant",
			content: [
				{
					type: "thinking",
					thinking: "last",
					thinkingSignature: "signed-last",
				},
				{ type: "text", text: "done" },
			],
		},
	];
	const before = JSON.stringify(messages);
	const db = createTestDb();
	try {
		applyPiProactiveThinkingStrip({
			db,
			sessionId: "latest-turn",
			messages,
			entryIds: ["u", "a", "r", "b"],
			provider: "anthropic",
			model: "claude-opus-5-5",
			cacheBustingPass: true,
		});
		clearOldReasoningPi({
			protectLatestTurn: true,
			messages,
			messageIdToMaxTag: new Map([
				["a", 2],
				["b", 80],
			]),
			clearReasoningAge: 5,
			piMessageStableId: (_m, i) => ["u", "a", "r", "b"][i],
		});
		expect(JSON.stringify(messages)).toBe(before);
	} finally {
		closeQuietly(db);
	}
});

test("Pi Anthropic task retains queued drops at execute, force and 95% without refusing", async () => {
	const db = createTestDb();
	const sessionId = "pi-latest-turn-pipeline";
	getOrCreateSessionMeta(db, sessionId);
	updateSessionMeta(db, sessionId, {
		isSubagent: true,
		lastResponseTime: Date.now(),
		cacheTtl: "59m",
	});
	const fake = createFakePi();
	registerPiContextHandler(fake.pi as never, {
		db,
		tagger: createTagger(),
		protectedTokens: 4000,
		heuristics: { clearReasoningAge: 1 },
	});
	const handler = fake.handlers.get("context") as (
		event: { messages: never[] },
		ctx: never,
	) => Promise<{ messages: unknown[] }>;
	let tokens = 20_000;
	const ctx = {
		...fakeContext(sessionId),
		model: {
			provider: "anthropic",
			id: "claude-opus-5-5",
			api: "anthropic-messages",
			contextWindow: 100_000,
		},
		getContextUsage: () => ({
			tokens,
			percent: tokens / 1000,
			contextWindow: 100_000,
		}),
	};
	const messages = [
		userMessage("task", 1),
		assistantMessage("spent", 2, {
			provider: "anthropic",
			model: "claude-opus-5-5",
			content: [
				{
					type: "thinking",
					thinking: "signed-one",
					thinkingSignature: "signature-one",
				},
				{ type: "text", text: "spent" },
			],
		}),
		assistantMessage("newest", 3, {
			provider: "anthropic",
			model: "claude-opus-5-5",
			content: [
				{
					type: "thinking",
					thinking: "signed-two",
					thinkingSignature: "signature-two",
				},
				{ type: "text", text: "newest" },
			],
		}),
	];
	const pass = () =>
		handler({ messages: structuredClone(messages) as never[] }, ctx as never);
	try {
		await pass();
		const before = JSON.stringify((await pass()).messages);
		queuePendingOp(db, sessionId, 2, "drop");
		for (const n of [76_000, 85_000]) {
			tokens = n;
			expect(JSON.stringify((await pass()).messages)).toBe(before);
			expect(getPendingOps(db, sessionId).map((op) => op.tagId)).toContain(2);
		}
		tokens = 95_000;
		// Holding the unsafe drop never refuses the turn on its own: the unchanged
		// turn is served, because only a proven final-wire overflow refuses.
		expect(JSON.stringify((await pass()).messages)).toBe(before);
		expect(getPendingOps(db, sessionId).map((op) => op.tagId)).toContain(2);
		messages.push(userMessage("next real user", 4));
		tokens = 76_000;
		await pass();
		expect(getPendingOps(db, sessionId)).toHaveLength(0);
	} finally {
		clearContextHandlerSession(sessionId);
		closeQuietly(db);
	}
});
