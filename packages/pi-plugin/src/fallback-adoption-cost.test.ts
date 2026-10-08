import { expect, it, spyOn } from "bun:test";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTagger } from "@magic-context/core/features/magic-context/tagger";
import { Database } from "@magic-context/core/shared/sqlite";
import { createTestTempDirFromPath } from "../../plugin/src/shared/test-temp-dir";
import { __test } from "./context-handler";
import { createTestDb } from "./test-utils.test";

it("fallback discovery revalidates a sibling commit after its revision snapshot", () => {
	const dir = createTestTempDirFromPath(
		join(tmpdir(), "pi-adoption-revision-"),
	);
	const path = join(dir, "context.db");
	const db = createTestDb(path);
	const sibling = new Database(path);
	const exec = db.exec.bind(db);
	const spy = spyOn(db, "exec").mockImplementation((sql) => {
		if (sql === "BEGIN IMMEDIATE")
			sibling
				.prepare(
					"INSERT INTO tags (message_id,type,status,session_id,tag_number,byte_size,entry_fingerprint) VALUES ('pi-msg-sibling:p0','message','dropped','session',9,0,'late')",
				)
				.run();
		return exec(sql);
	});
	try {
		__test.adoptPiFallbackTags(
			db,
			"session",
			createTagger(),
			new Map([["real", "late"]]),
		);
		expect(
			db.prepare("SELECT message_id,tag_number,status FROM tags").get(),
		).toEqual({ message_id: "real:p0", tag_number: 9, status: "dropped" });
	} finally {
		spy.mockRestore();
		sibling.close();
		db.close();
		rmSync(dir, { recursive: true, force: true });
	}
});

it("fallback adoption revalidates a negative discovery at the acquired writer", () => {
	const db = createTestDb();
	const originalExec = db.exec.bind(db);
	const exec = spyOn(db, "exec").mockImplementation((sql) => {
		originalExec(sql);
		if (sql === "BEGIN IMMEDIATE")
			db.prepare(
				"INSERT INTO tags (message_id, type, status, session_id, tag_number, byte_size, entry_fingerprint) VALUES ('pi-msg-late:p0', 'message', 'dropped', 'session', 7, 0, 'late')",
			).run();
	});
	try {
		__test.adoptPiFallbackTags(
			db,
			"session",
			createTagger(),
			new Map([["real", "late"]]),
			{ hasFallbackMessageTags: false },
		);
		expect(
			db.prepare("SELECT message_id, tag_number, status FROM tags").get(),
		).toEqual({ message_id: "real:p0", tag_number: 7, status: "dropped" });
	} finally {
		exec.mockRestore();
		db.close();
	}
});

it("fallback tool ownership is prepared before the writer lock", () => {
	const db = createTestDb();
	let resolved = 0;
	try {
		__test.adoptPiFallbackTags(db, "session", createTagger(), new Map(), {
			messages: [
				{
					role: "assistant",
					timestamp: 1,
					content: [
						{ type: "toolCall", id: "call", name: "read", arguments: {} },
					],
				} as never,
			],
			resolveStableId: () => {
				expect(db.inTransaction).toBe(false);
				resolved++;
				return "real";
			},
		});
		expect(resolved).toBe(1);
	} finally {
		db.close();
	}
});

it("unmatchable historical fallback tags use bounded fingerprint probes", () => {
	const db = createTestDb();
	try {
		db.prepare(
			"INSERT INTO tags (message_id, type, status, session_id, tag_number, byte_size, entry_fingerprint) VALUES ('pi-msg-old:p0', 'message', 'active', 'session', 1, 0, 'orphan')",
		).run();
		const fingerprints = new Map(
			Array.from({ length: 2400 }, (_, i) => [`entry-${i}`, `fp-${i}`]),
		);
		const prepare = spyOn(db, "prepare");
		try {
			__test.adoptPiFallbackTags(db, "session", createTagger(), fingerprints);
			const probes = prepare.mock.calls.filter(([sql]) =>
				sql.includes("entry_fingerprint"),
			);
			// Three fingerprint-discovery batches; an unchanged store needs no
			// second candidate query while holding the writer.
			expect(probes).toHaveLength(3);
		} finally {
			prepare.mockRestore();
		}
		expect(db.prepare("SELECT message_id FROM tags").get()).toEqual({
			message_id: "pi-msg-old:p0",
		});
	} finally {
		db.close();
	}
});

it("a newly resolvable fallback is adopted without probing every historical message", () => {
	const db = createTestDb();
	try {
		db.prepare(
			"INSERT INTO tags (message_id, type, status, session_id, tag_number, byte_size, entry_fingerprint) VALUES ('pi-msg-new:p0', 'message', 'dropped', 'session', 1, 0, 'fp-2399')",
		).run();
		const fingerprints = new Map(
			Array.from({ length: 2400 }, (_, i) => [`entry-${i}`, `fp-${i}`]),
		);
		const prepare = spyOn(db, "prepare");
		try {
			__test.adoptPiFallbackTags(db, "session", createTagger(), fingerprints);
			expect(
				prepare.mock.calls.filter(([sql]) => sql.includes("entry_fingerprint"))
					.length,
			).toBeLessThan(15);
		} finally {
			prepare.mockRestore();
		}
		expect(
			db.prepare("SELECT message_id, status, tag_number FROM tags").get(),
		).toEqual({
			message_id: "entry-2399:p0",
			status: "dropped",
			tag_number: 1,
		});
	} finally {
		db.close();
	}
});
