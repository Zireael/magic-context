/** Reproducible disk-backed fold/refresh/defer differential; never opens host stores. */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { injectM0M1Pi } from "../packages/pi-plugin/src/inject-compartments-pi";
import { appendCompartments } from "../packages/plugin/src/features/magic-context/compartment-storage";
import { insertMemory } from "../packages/plugin/src/features/magic-context/memory/storage-memory";
import { getOrCreateSessionMeta } from "../packages/plugin/src/features/magic-context/storage";
import { initializeDatabase } from "../packages/plugin/src/features/magic-context/storage-db";
import { prepareLegacyToolSkeletonConversions } from "../packages/plugin/src/hooks/magic-context/apply-operations";
import {
	injectM0M1,
	type M0M1State,
} from "../packages/plugin/src/hooks/magic-context/inject-compartments";
import type { TagTarget } from "../packages/plugin/src/hooks/magic-context/tag-messages";
import { setLogLineForwarder } from "../packages/plugin/src/shared/logger";
import { Database } from "../packages/plugin/src/shared/sqlite";

const root = process.env.FOLD_FIXTURE_ROOT;
if (!root?.includes("/magic-context/"))
	throw new Error(
		"FOLD_FIXTURE_ROOT must be a throwaway magic-context directory",
	);
for (const key of [
	"HOME",
	"XDG_DATA_HOME",
	"XDG_CONFIG_HOME",
	"XDG_STATE_HOME",
	"XDG_RUNTIME_DIR",
	"OPENCODE_DB",
	"MAGIC_CONTEXT_STORAGE_DIR",
]) {
	if (!process.env[key]?.startsWith(`${root}/`))
		throw new Error(`unsafe ${key}`);
}
mkdirSync(root, { recursive: true });
const fixedNow = 1_790_000_000_000;
Date.now = () => fixedNow;
const lines: string[] = [];
setLogLineForwarder((line) => {
	if (line.includes("slow write transaction:")) lines.push(line.trim());
});
const project = "git:fold-fixture";
const mural = {
	enabled: true,
	supportsVision: true,
	dataUrl: `data:image/png;base64,${"A".repeat(2 * 1024 * 1024)}`,
	contentHash: "fixture-mural",
};
function compartments(start: number, count: number) {
	return Array.from({ length: count }, (_, offset) => {
		const i = start + offset;
		return {
			sequence: i,
			startMessage: i * 10,
			endMessage: i * 10 + 9,
			startMessageId: `start-${i}`,
			endMessageId: `end-${i}`,
			title: `Implementation episode ${i}`,
			content: `History ${i}: ${"Investigated schema and verified deployment. ".repeat(100)}`,
			p1: `History ${i}: ${"Investigated schema and verified deployment. ".repeat(100)}`,
			p2: `Summary ${i}: ${"Verified deployment. ".repeat(30)}`,
			p3: `Outcome ${i}: schema verified`,
			p4: `Episode ${i}`,
			importance: 70,
			episodeType: "feature",
			legacy: 0,
		};
	});
}
function seed(db: Database, session: string) {
	getOrCreateSessionMeta(db, session);
	db.exec("BEGIN");
	for (let i = 0; i < 1352; i++)
		insertMemory(db, {
			projectPath: project,
			category: "ARCHITECTURE",
			content: `Project memory ${i}: ${"Keep the protocol stable and use explicit snapshot markers. ".repeat(12)}`,
			importance: 40 + (i % 50),
		});
	db.exec("COMMIT");
	appendCompartments(db, session, compartments(0, 300));
}
function delta(db: Database, session: string) {
	for (let i = 0; i < 30; i++)
		insertMemory(db, {
			projectPath: project,
			category: "ARCHITECTURE",
			content: `New memory ${i}: preserve these semantics`,
		});
	appendCompartments(db, session, compartments(300, 3));
}
function digest(value: unknown): string {
	return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
const records: Record<string, unknown> = {};
for (const host of ["opencode", "pi"] as const) {
	const session = `fixture-${host}`;
	const path = join(root, `${host}.db`);
	if (existsSync(path)) throw new Error(`fixture needs a fresh root: ${path}`);
	const db = new Database(path);
	initializeDatabase(db);
	db.exec("PRAGMA journal_mode=WAL");
	seed(db, session);
	const lsof = spawnSync("lsof", ["-p", String(process.pid)], {
		encoding: "utf8",
	});
	if (lsof.status !== 0 || !lsof.stdout.includes(join(root, `${host}.db`)))
		throw new Error("lsof did not prove fixture database isolation");
	const openStores = lsof.stdout
		.split("\n")
		.filter((line) => /\.(db|sqlite)(?:-wal|-shm)?(?:\s|$)/.test(line));
	if (openStores.some((line) => !line.includes(root)))
		throw new Error(`unexpected store: ${openStores.join("\n")}`);
	console.log(`lsof isolation ${host}: ${openStores.join("\n")}`);
	const state = getOrCreateSessionMeta(db, session) as M0M1State;
	const piState = {
		sessionId: session,
		projectIdentity: project,
		projectDirectory: root,
		injectDocs: false,
		mural,
		historyBudgetTokens: 60000,
		injectionBudgetTokens: 8000,
	};
	const targets = new Map<number, TagTarget>();
	for (let i = 1; i <= 1200; i++) {
		db.prepare(
			"INSERT INTO tags (session_id, tag_number, type, status, drop_mode) VALUES (?, ?, 'tool', 'dropped', 'truncated')",
		).run(session, i);
		targets.set(i, {
			canDrop: () => true,
			cannotRemove: () => false,
			wouldStrandConversationEnd: () => false,
			inputStringBytes: () => 80,
		} as unknown as TagTarget);
	}
	const holds: number[] = [];
	let admittedAt: number | undefined;
	const exec = db.exec.bind(db);
	db.exec = (sql: string) => {
		const result = exec(sql);
		if (sql === "BEGIN IMMEDIATE") admittedAt = performance.now();
		if ((sql === "COMMIT" || sql === "ROLLBACK") && admittedAt !== undefined) {
			holds.push(performance.now() - admittedAt);
			admittedAt = undefined;
		}
		return result;
	};
	for (const phase of ["fold", "refresh", "defer"] as const) {
		if (phase === "refresh") delta(db, session);
		const holdsBefore = holds.length;
		const before = lines.length;
		const output =
			host === "opencode"
				? injectM0M1({
						db,
						sessionId: session,
						state,
						projectPath: project,
						projectDirectory: root,
						injectDocs: false,
						mural,
						isCacheBustingPass: phase !== "defer",
						onFoldPrepare: () => {
							const prepared = prepareLegacyToolSkeletonConversions(
								db,
								session,
								targets,
							);
							return (connection) => {
								if (!prepared.isCurrent(connection))
									throw new Error("conversion contention");
								prepared.persist(connection);
							};
						},
					})
				: injectM0M1Pi(piState, db, [], undefined, phase !== "defer");
		const row = db
			.prepare("SELECT * FROM session_meta WHERE session_id = ?")
			.get(session);
		const tags = db
			.prepare("SELECT * FROM tags WHERE session_id = ? ORDER BY tag_number")
			.all(session);
		records[`${host}-${phase}`] = {
			outputHash: digest(output),
			rowHash: digest(row),
			tagsHash: digest(tags),
		};
		console.log(
			`${host} ${phase}: ${JSON.stringify(records[`${host}-${phase}`])}`,
		);
		console.log(
			`${host} ${phase} writer holds (ms): ${
				holds
					.slice(holdsBefore)
					.map((ms) => ms.toFixed(1))
					.join(", ") || "none"
			}`,
		);
		console.log(lines.slice(before).join("\n"));
	}
	db.close();
}
const baseline =
	process.env.FOLD_FIXTURE_BASELINE ??
	join(import.meta.dir, "fold-lock-fixture-baseline.json");
if (baseline) {
	const expected = JSON.parse(readFileSync(baseline, "utf8"));
	if (JSON.stringify(records) !== JSON.stringify(expected))
		throw new Error("fold/refresh/defer differential mismatch");
	console.log(
		"Differential: 6 served outputs, 6 complete session_meta rows, 6 tag manifests byte-identical",
	);
}
writeFileSync(join(root, "result.json"), JSON.stringify(records, null, 2));
