import { expect, it } from "bun:test";
import { join } from "node:path";
import { getTemporalDecisions } from "@magic-context/core/features/magic-context/temporal-decisions";
import { seedTemporalUpgradeFixture } from "@magic-context/core/shared/temporal-upgrade-fixture";
import { createTestTempDir } from "@magic-context/core/shared/test-temp-dir";
import {
	clearContextHandlerSession,
	registerPiContextHandler,
} from "./context-handler";
import { createFakePi, createTestDb, fakeContext } from "./test-utils.test";

it("Pi upgrade preserves every previously served marker on the first defer", async () => {
	const root = createTestTempDir("pi-temporal-upgrade-");
	const dbPath = join(root.dir, "context.db");
	let db = createTestDb(dbPath);
	const captured = seedTemporalUpgradeFixture(db, "Pi");
	const sessionId = captured.sessionId;
	try {
		if (!captured.cwd || !captured.entryIds)
			throw new Error("Pi fixture lacks its captured context");
		expect(captured.projectionJson).toContain("<!-- +5m -->");
		expect(captured.projectionJson).toContain("<!-- +10m -->");
		expect(getTemporalDecisions(db, sessionId).size).toBe(0);
		const prefix = db
			.prepare(
				"SELECT cached_m0_bytes, cached_m1_bytes FROM session_meta WHERE session_id=?",
			)
			.get(sessionId);
		db.close();
		db = createTestDb(dbPath);
		const next = createFakePi();
		registerPiContextHandler(next.pi as never, {
			db,
			protectedTags: 0,
			heuristics: {},
			injection: { injectionBudgetTokens: 10_000, temporalAwareness: true },
		});
		const continued = structuredClone(captured.input);
		const handler = next.handlers.get("context") as (
			event: { messages: unknown[] },
			ctx: unknown,
		) => Promise<{ messages: unknown[] }>;
		const replay = await handler(
			{ messages: continued },
			fakeContext(
				sessionId,
				captured.cwd,
				captured.entryIds,
				continued as never,
			),
		);
		expect(JSON.stringify(replay.messages)).toBe(captured.projectionJson);
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
});
