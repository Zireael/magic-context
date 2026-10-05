import { expect, it } from "bun:test";
import { join } from "node:path";
import { updateSessionMeta } from "@magic-context/core/features/magic-context/storage";
import { getTemporalDecisions } from "@magic-context/core/features/magic-context/temporal-decisions";
import { temporalLegacyTree } from "@magic-context/core/shared/temporal-legacy-test-fixture";
import { createTestTempDir } from "@magic-context/core/shared/test-temp-dir";
import {
	clearContextHandlerSession,
	registerPiContextHandler,
} from "./context-handler";
import {
	createFakePi,
	createTestDb,
	fakeContext,
	textOf,
} from "./test-utils.test";

it("Pi upgrade preserves every previously served marker on the first defer", async () => {
	const old = await import(
		join(temporalLegacyTree(), "packages/pi-plugin/src/context-handler.ts")
	);
	const oldUtils = await import(
		join(temporalLegacyTree(), "packages/pi-plugin/src/test-utils.test.ts")
	);
	const root = createTestTempDir("pi-temporal-upgrade-");
	const sessionId = "pi-temporal-upgrade";
	const dbPath = join(root.dir, "context.db");
	let db = oldUtils.createTestDb(dbPath);
	const raw = [
		oldUtils.assistantMessage("answer", 300_000),
		oldUtils.userMessage("question", 600_000),
		oldUtils.userMessage("follow up", 1_200_000),
	];
	const ids = ["prior", "user", "later"];
	try {
		const fake = oldUtils.createFakePi();
		old.registerPiContextHandler(fake.pi, {
			db,
			protectedTags: 0,
			heuristics: {},
			injection: { injectionBudgetTokens: 10_000, temporalAwareness: true },
		});
		const initial = structuredClone(raw);
		const served = await fake.handlers.get("context")(
			{ messages: initial },
			oldUtils.fakeContext(sessionId, root.dir, ids, initial),
		);
		const before = served.messages
			.filter((m: { role: string }) => m.role === "user")
			.map(oldUtils.textOf);
		expect(before.join("\n")).toContain("<!-- +5m -->");
		expect(before.join("\n")).toContain("<!-- +10m -->");
		updateSessionMeta(db, sessionId, {
			lastResponseTime: Date.now(),
			cacheTtl: "59m",
			lastContextPercentage: 1,
			lastInputTokens: 100,
		});
		const prefix = db
			.prepare(
				"SELECT cached_m0_bytes, cached_m1_bytes FROM session_meta WHERE session_id=?",
			)
			.get(sessionId);
		old.clearContextHandlerSession(sessionId);
		db.close();
		db = createTestDb(dbPath);
		const next = createFakePi();
		registerPiContextHandler(next.pi as never, {
			db,
			protectedTags: 0,
			heuristics: {},
			injection: { injectionBudgetTokens: 10_000, temporalAwareness: true },
		});
		const continued = structuredClone(raw);
		const handler = next.handlers.get("context") as (
			event: { messages: unknown[] },
			ctx: unknown,
		) => Promise<{ messages: unknown[] }>;
		const replay = await handler(
			{ messages: continued },
			fakeContext(sessionId, root.dir, ids, continued),
		);
		expect(
			replay.messages
				.filter((m) => (m as { role?: string }).role === "user")
				.map((m) => textOf(m as never)),
		).toEqual(before);
		expect(
			db
				.prepare(
					"SELECT cached_m0_bytes, cached_m1_bytes FROM session_meta WHERE session_id=?",
				)
				.get(sessionId),
		).toEqual(prefix);
		expect(getTemporalDecisions(db, sessionId).get("user")).toBe(
			"<!-- +5m -->\n",
		);
		expect(getTemporalDecisions(db, sessionId).get("later")).toBe(
			"<!-- +10m -->\n",
		);
	} finally {
		clearContextHandlerSession(sessionId);
		db.close();
		root.cleanup();
	}
}, 60_000);
