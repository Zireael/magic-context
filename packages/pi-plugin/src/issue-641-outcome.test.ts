import { expect, spyOn, test } from "bun:test";
import {
	getSlot,
	resetLkgSlotsForTest,
} from "@magic-context/core/hooks/magic-context/lkg-slot";
import {
	__test,
	clearContextHandlerSession,
	registerPiContextHandler,
} from "./context-handler";
import { __setPiHarnessKindForTesting } from "./pi-harness-kind";
import { getPiServedTagNumbers } from "./served-array-ledger";
import {
	createFakePi,
	createTestDb,
	fakeContext,
	userMessage,
} from "./test-utils.test";

test("mandatory work beyond 25s refuses without storage waits or managed publication", async () => {
	const db = createTestDb();
	const sessionId = "outcome-641";
	let now = 0;
	let aborted = false;
	const calls: string[] = [];
	const clock = spyOn(performance, "now").mockImplementation(() => now);
	const prepare = db.prepare.bind(db);
	const sql = spyOn(db, "prepare").mockImplementation((statement) => {
		if (now >= 25000 && !aborted) calls.push("storage");
		return prepare(statement);
	});
	const restore = __test.setBeforePipelineForTests(async () => {
		now = 26000;
	});
	__setPiHarnessKindForTesting("omp");
	try {
		const fake = createFakePi();
		const entries: Array<{ message: string }> = [];
		registerPiContextHandler(
			{
				...fake.pi,
				appendEntry: (_name: string, data: { message: string }) => {
					calls.push("entry");
					entries.push(data);
				},
			} as never,
			{ db },
		);
		const raw = [userMessage("never publish this overrun")];
		const ctx = {
			...fakeContext(sessionId, process.cwd(), ["u"], raw),
			ui: {
				notify: () => {
					calls.push("notice");
				},
			},
			abort: () => {
				aborted = true;
				calls.push("abort");
			},
		};
		const handler = fake.handlers.get("context");
		if (!handler) throw new Error("context handler missing");
		await handler({ messages: raw } as never, ctx as never);
		expect(calls).toEqual(["notice", "entry", "abort"]);
		expect(entries[0].message).toContain("elapsed=26000ms");
		expect(entries[0].message).toContain("recovery=no managed result; refused");
		expect(
			db.prepare("SELECT * FROM tags WHERE session_id=?").all(sessionId),
		).toEqual([]);
		expect(
			db
				.prepare("SELECT * FROM transform_decisions WHERE session_id=?")
				.all(sessionId),
		).toEqual([]);
		expect(getSlot(sessionId)).toBeUndefined();
		expect(getPiServedTagNumbers(sessionId).size).toBe(0);
	} finally {
		restore();
		sql.mockRestore();
		clock.mockRestore();
		__setPiHarnessKindForTesting(undefined);
		clearContextHandlerSession(sessionId);
		resetLkgSlotsForTest();
		db.close();
	}
});
