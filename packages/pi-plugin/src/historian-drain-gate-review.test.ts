import { expect, it, mock, spyOn } from "bun:test";
import { createHash } from "node:crypto";
import {
	getOrCreateSessionMeta,
	getPendingOps,
	getTagsBySession,
	queuePendingOp,
	updateSessionMeta,
} from "@magic-context/core/features/magic-context/storage";
import { closeQuietly } from "@magic-context/core/shared/sqlite-helpers";
import type { SubagentRunner } from "@magic-context/core/shared/subagent-runner";
import {
	__test,
	awaitInFlightHistorians,
	clearContextHandlerSession,
	recordPiLiveModel,
	registerPiContextHandler,
	signalPiPendingMaterialization,
} from "./context-handler";
import * as historian from "./pi-historian-runner";
import {
	assistantMessage,
	createFakePi,
	createTestDb,
	fakeContext,
	userMessage,
} from "./test-utils.test";

for (const lane of ["defer", "flush", "fold", "force"] as const) {
	it(`review mutation contract: Pi ${lane} pass during a registered historian`, async () => {
		const db = createTestDb();
		const sessionId = `review-pi-wire-${lane}`;
		const fake = createFakePi();
		let release!: () => void;
		let remove = () => {};
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		try {
			updateSessionMeta(db, sessionId, { piStableIdScheme: 1 });
			registerPiContextHandler(fake.pi as never, {
				db,
				protectedTags: 0,
				protectedTokens: 0,
				injection: {
					memoryEnabled: false,
					injectDocs: false,
					injectionBudgetTokens: 2000,
				},
				scheduler: { executeThresholdPercentage: 65 },
			});
			const handler = fake.handlers.get("context") as (
				event: { messages: never[] },
				ctx: never,
			) => Promise<{ messages: unknown[] }>;
			const raw = [
				userMessage("old instruction", 1),
				assistantMessage("old answer", 2),
				userMessage("current instruction", 3),
			];
			let tokens = 40_000;
			let model = "anthropic/claude-sonnet-4-6";
			const pass = async () => {
				const messages = structuredClone(raw);
				recordPiLiveModel(sessionId, model);
				const result = await handler({ messages: messages as never[] }, {
					...fakeContext(
						sessionId,
						process.cwd(),
						["entry-1", "entry-2", "entry-3"],
						messages,
					),
					getContextUsage: () => ({
						tokens,
						percent: tokens / 2000,
						contextWindow: 200_000,
					}),
				} as never);
				return JSON.stringify(result.messages);
			};
			const baseline = await pass();
			const old = getTagsBySession(db, sessionId).find(
				(tag) => tag.tagNumber === 1,
			);
			if (!old) throw new Error("Expected the old instruction to have tag 1");
			queuePendingOp(db, sessionId, old.tagNumber, "drop");
			remove = __test.setInFlightHistorianForTests(sessionId, held);
			if (lane === "flush") signalPiPendingMaterialization(sessionId);
			if (lane === "fold") model = "anthropic/claude-opus-4-6";
			if (lane === "force") tokens = 170_000;
			updateSessionMeta(db, sessionId, { lastResponseTime: Date.now() });
			const served = await pass();
			expect(
				db
					.prepare(
						"SELECT cached_m0_model_key AS model FROM session_meta WHERE session_id = ?",
					)
					.get(sessionId),
			).toEqual({ model });
			const pending = getPendingOps(db, sessionId).length;
			console.log(
				`REVIEW_PI_WIRE ${JSON.stringify({ lane, pending, sameBytes: served === baseline, digest: createHash("sha256").update(served).digest("hex") })}`,
			);
			if (lane === "fold" || lane === "force") {
				expect(pending).toBe(0);
				expect(served).not.toBe(baseline);
			} else {
				expect(pending).toBe(1);
				expect(served).toBe(baseline);
			}
		} finally {
			release();
			remove();
			clearContextHandlerSession(sessionId);
			closeQuietly(db);
		}
	});
}

it("review comparison: Pi firing and immediately following defer pass keep one pending run and identical served bytes", async () => {
	const db = createTestDb();
	const sessionId = "review-pi-firing";
	const fake = createFakePi();
	let release!: () => void;
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	const start = spyOn(historian, "runPiHistorian").mockImplementation(
		async () => {
			await held;
		},
	);
	try {
		updateSessionMeta(db, sessionId, { piStableIdScheme: 1 });
		registerPiContextHandler(fake.pi as never, {
			db,
			protectedTags: 0,
			historian: {
				runner: {
					harness: "pi",
					run: mock(async () => ({
						ok: true,
						assistantText: "",
						durationMs: 1,
					})),
				} as unknown as SubagentRunner,
				model: "test/historian",
				historianChunkTokens: 20_000,
				executeThresholdPercentage: 80,
				protectedTags: 0,
			},
		});
		const handler = fake.handlers.get("context") as (
			event: { messages: never[] },
			ctx: never,
		) => Promise<{ messages: unknown[] }>;
		const raw = [
			...Array.from({ length: 12 }, (_, i) =>
				i % 2
					? assistantMessage("history ".repeat(6000), i + 1)
					: userMessage("history ".repeat(6000), i + 1),
			),
			...Array.from({ length: 5 }, (_, i) => userMessage("protected", i + 13)),
		];
		const pass = async () => {
			const messages = structuredClone(raw);
			const result = await handler({ messages: messages as never[] }, {
				...fakeContext(
					sessionId,
					process.cwd(),
					messages.map((_, i) => `entry-${i + 1}`),
					messages,
				),
				getContextUsage: () => ({
					tokens: 156_000,
					percent: 78,
					contextWindow: 200_000,
				}),
			} as never);
			return JSON.stringify(result.messages);
		};
		const first = await pass();
		updateSessionMeta(db, sessionId, { lastResponseTime: Date.now() });
		const second = await pass();
		expect(second).toBe(first);
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		expect(start).toHaveBeenCalledTimes(1);
		console.log(
			`REVIEW_PI_FIRING ${JSON.stringify({ starts: start.mock.calls.length, sameBytes: first === second, inProgress: getOrCreateSessionMeta(db, sessionId).compartmentInProgress, digest: createHash("sha256").update(first).digest("hex") })}`,
		);
	} finally {
		release();
		await awaitInFlightHistorians(sessionId);
		start.mockRestore();
		clearContextHandlerSession(sessionId);
		closeQuietly(db);
	}
});

it("review startup: Pi runner errors settle registration so a later pass can start again", async () => {
	const db = createTestDb();
	const sessionId = "review-pi-startup-error";
	const fake = createFakePi();
	const start = spyOn(historian, "runPiHistorian").mockImplementation(
		async () => {
			throw new Error("review historian startup failed");
		},
	);
	try {
		updateSessionMeta(db, sessionId, { piStableIdScheme: 1 });
		registerPiContextHandler(fake.pi as never, {
			db,
			protectedTags: 0,
			historian: {
				runner: {
					harness: "pi",
					run: mock(async () => ({
						ok: true,
						assistantText: "",
						durationMs: 1,
					})),
				} as unknown as SubagentRunner,
				model: "test/historian",
				historianChunkTokens: 20_000,
				executeThresholdPercentage: 80,
				protectedTags: 0,
			},
		});
		const handler = fake.handlers.get("context") as (
			event: { messages: never[] },
			ctx: never,
		) => Promise<{ messages: unknown[] }>;
		const raw = [
			...Array.from({ length: 12 }, (_, i) =>
				i % 2
					? assistantMessage("history ".repeat(6000), i + 1)
					: userMessage("history ".repeat(6000), i + 1),
			),
			...Array.from({ length: 5 }, (_, i) => userMessage("protected", i + 13)),
		];
		for (let i = 0; i < 2; i++) {
			const messages = structuredClone(raw);
			await handler({ messages: messages as never[] }, {
				...fakeContext(
					sessionId,
					process.cwd(),
					messages.map((_, index) => `entry-${index + 1}`),
					messages,
				),
				getContextUsage: () => ({
					tokens: 156_000,
					percent: 78,
					contextWindow: 200_000,
				}),
			} as never);
			await awaitInFlightHistorians(sessionId);
			expect(start).toHaveBeenCalledTimes(i + 1);
			expect(getOrCreateSessionMeta(db, sessionId).compartmentInProgress).toBe(
				false,
			);
		}
	} finally {
		await awaitInFlightHistorians(sessionId);
		start.mockRestore();
		clearContextHandlerSession(sessionId);
		closeQuietly(db);
	}
});
