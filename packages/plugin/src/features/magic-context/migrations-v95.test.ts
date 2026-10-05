import { describe, expect, test } from "bun:test";
import { Database } from "../../shared/sqlite";
import { enforceProjectCap, upsertCommits } from "./git-commits/storage-git-commits";
import {
    installV95PerfSchema,
    tagOrderConstraintIndex,
    V95_REDUNDANT_INDEXES,
} from "./migration-v95-perf-indexes";
import { MIGRATIONS, runMigrations } from "./migrations";
import { initializeDatabase, LATEST_SUPPORTED_VERSION } from "./storage-db";
import { getOrCreateSessionMeta, updateSessionMeta } from "./storage-meta-session";
import { insertTag, markTagsCompactedByMessageIds, updateTagStatus } from "./storage-tags";

function v94(): Database {
    const db = new Database(":memory:");
    initializeDatabase(db);
    for (const name of [
        "idx_message_fts_rowid_map_session_rowid",
        "idx_transform_decisions_retention",
        "idx_plugin_messages_session",
        "idx_user_memory_candidates_session",
    ])
        db.exec(`DROP INDEX IF EXISTS ${name}`);
    db.exec(
        "CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL, description TEXT)",
    );
    for (const migration of MIGRATIONS.filter((m) => m.version <= 94)) {
        migration.up(db);
        db.prepare("INSERT INTO schema_migrations(version,applied_at) VALUES (?,0)").run(
            migration.version,
        );
    }
    for (const [name, table, columns] of [
        ["idx_tags_session_tag_number", "tags", "session_id,tag_number"],
        ["idx_compartments_session", "compartments", "session_id"],
        ["idx_pending_ops_session", "pending_ops", "session_id"],
        ["idx_source_contents_session", "source_contents", "session_id"],
        ["idx_compression_depth_session", "compression_depth", "session_id"],
        ["idx_transform_decisions_session_harness", "transform_decisions", "session_id,harness"],
        ["idx_project_key_files_project", "project_key_files", "project_path"],
    ])
        db.exec(`CREATE INDEX IF NOT EXISTS ${name} ON ${table}(${columns})`);
    expect(
        db.prepare("SELECT name FROM sqlite_master WHERE name='git_commit_fts_rowid_map'").get(),
    ).toBeNull();
    return db;
}

const commit = {
    sha: "sha-a",
    shortSha: "a",
    message: "cache same score",
    author: "author",
    committedAtMs: 100,
};
const fts = (db: Database) =>
    db.prepare("SELECT rowid,sha,project_path,message FROM git_commits_fts ORDER BY rowid").all();
const map = (db: Database) =>
    db
        .prepare("SELECT fts_rowid AS rowid,sha FROM git_commit_fts_rowid_map ORDER BY fts_rowid")
        .all();
const identities = (db: Database) =>
    db.prepare("SELECT rowid,sha FROM git_commits_fts ORDER BY rowid").all();

describe("migration 95", () => {
    test("populated v94 preserves metadata, tags and ordered FTS bytes through v95", () => {
        const db = v94();
        try {
            getOrCreateSessionMeta(db, "session");
            updateSessionMeta(db, "session", {
                cachedM0Bytes: Buffer.from("frozen m0\0😀"),
                cachedM1Bytes: Buffer.from("frozen m1"),
                counter: 4,
            });
            insertTag(db, "session", "m1:p0", "message", 30, 1);
            updateTagStatus(db, "session", 1, "dropped");
            upsertCommits(db, "project", [commit, { ...commit, sha: "sha-b", shortSha: "b" }]);
            const meta = db.prepare("SELECT * FROM session_meta").all();
            const tags = db.prepare("SELECT * FROM tags").all();
            const before = fts(db);
            const ranked = () =>
                db
                    .prepare(
                        "SELECT rowid,bm25(git_commits_fts) AS rank FROM git_commits_fts WHERE git_commits_fts MATCH 'cache' ORDER BY bm25(git_commits_fts)",
                    )
                    .all();
            const ranks = ranked();
            runMigrations(db);
            expect(LATEST_SUPPORTED_VERSION).toBe(95);
            expect(db.prepare("SELECT MAX(version) AS v FROM schema_migrations").get()).toEqual({
                v: 95,
            });
            expect(db.prepare("SELECT * FROM session_meta").all()).toEqual(meta);
            expect(db.prepare("SELECT * FROM tags").all()).toEqual(tags);
            expect(fts(db)).toEqual(before);
            expect(ranked()).toEqual(ranks);
            expect(map(db)).toEqual(identities(db));
            expect(markTagsCompactedByMessageIds(db, "session", ["m1"])).toBe(1);
        } finally {
            db.close();
        }
    });

    test("FTS point triggers preserve duplicate cleanup, actual rowids, replacement and eviction", () => {
        const db = v94();
        try {
            upsertCommits(db, "project", [commit]);
            db.prepare(
                "INSERT INTO git_commits_fts(rowid,sha,project_path,message) VALUES (77,?,?,?)",
            ).run("sha-a", "project", "duplicate cache");
            const before = fts(db);
            runMigrations(db);
            expect(fts(db)).toEqual(before);
            expect(map(db)).toEqual(identities(db));
            upsertCommits(db, "project", [{ ...commit, message: "amended cache" }]);
            expect(map(db)).toEqual(identities(db));
            expect(fts(db)).toHaveLength(1);
            for (const recursive of [0, 1]) {
                db.exec(`PRAGMA recursive_triggers=${recursive}`);
                db.prepare(
                    "INSERT OR REPLACE INTO git_commits(sha,short_sha,project_path,message,committed_at,indexed_at) VALUES (?,?,?,?,?,?)",
                ).run("sha-a", "a", "project", `replace ${recursive}`, 100, 100);
                expect(map(db)).toEqual(identities(db));
                expect(fts(db)).toHaveLength(1);
            }
            upsertCommits(db, "project", [{ ...commit, sha: "sha-new", committedAtMs: 200 }]);
            expect(enforceProjectCap(db, "project", 1)).toBe(1);
            expect(map(db)).toEqual(identities(db));
            expect(fts(db)).toHaveLength(1);
            db.exec("DELETE FROM git_commits");
            expect(map(db)).toEqual([]);
            expect(fts(db)).toEqual([]);
        } finally {
            db.close();
        }
    });

    test("covering and retention plans replace redundant indexes without losing constraints", () => {
        const db = v94();
        try {
            runMigrations(db);
            const plan = db
                .prepare(
                    "EXPLAIN QUERY PLAN SELECT rowid FROM transform_decisions WHERE session_id=? AND harness=? ORDER BY ts_ms DESC,rowid DESC LIMIT 2000",
                )
                .all("s", "opencode") as Array<{ detail: string }>;
            expect(plan.some((r) => r.detail.includes("idx_transform_decisions_retention"))).toBe(
                true,
            );
            expect(plan.some((r) => r.detail.includes("TEMP B-TREE"))).toBe(false);
            const covering = db
                .prepare(
                    "EXPLAIN QUERY PLAN SELECT fts_rowid FROM message_fts_rowid_map WHERE session_id=?",
                )
                .all("s") as Array<{ detail: string }>;
            expect(
                covering.some((r) =>
                    r.detail.includes("COVERING INDEX idx_message_fts_rowid_map_session_rowid"),
                ),
            ).toBe(true);
            for (const name of V95_REDUNDANT_INDEXES)
                expect(db.prepare("SELECT 1 FROM sqlite_master WHERE name=?").get(name)).toBeNull();
            expect(tagOrderConstraintIndex(db)).toContain("sqlite_autoindex_tags");
            insertTag(db, "s", "m", "message", 1, 1);
            expect(() => insertTag(db, "s", "other", "message", 1, 1)).toThrow();
            for (const table of ["plugin_messages", "user_memory_candidates"]) {
                const cleanup = db
                    .prepare(`EXPLAIN QUERY PLAN DELETE FROM ${table} WHERE session_id=?`)
                    .all("absent") as Array<{ detail: string }>;
                expect(cleanup.some((r) => r.detail.includes("USING INDEX"))).toBe(true);
            }
        } finally {
            db.close();
        }
    });

    test("git FTS delete bytecode uses rowid constraints", () => {
        const db = v94();
        try {
            upsertCommits(db, "project", [commit]);
            runMigrations(db);
            const code = db
                .prepare("EXPLAIN DELETE FROM git_commits WHERE sha=?")
                .all("sha-a") as Array<{ opcode: string; p4: string | null }>;
            const filters = code.filter((row) => row.opcode === "VFilter");
            expect(filters.length).toBeGreaterThan(0);
            expect(filters.every((row) => row.p4?.includes("="))).toBe(true);
            db.prepare("DELETE FROM git_commits WHERE sha=?").run("sha-a");
            expect(fts(db)).toEqual([]);
            expect(map(db)).toEqual([]);
        } finally {
            db.close();
        }
    });

    test("current initializer does not recreate dropped indexes or rewrite FTS rows", () => {
        const db = v94();
        try {
            upsertCommits(db, "project", [commit]);
            runMigrations(db);
            const before = fts(db);
            const changes = db.prepare("SELECT total_changes() AS n").get();
            installV95PerfSchema(db);
            expect(db.prepare("SELECT total_changes() AS n").get()).toEqual(changes);
            initializeDatabase(db);
            expect(fts(db)).toEqual(before);
            expect(map(db)).toEqual(identities(db));
            for (const name of V95_REDUNDANT_INDEXES)
                expect(db.prepare("SELECT 1 FROM sqlite_master WHERE name=?").get(name)).toBeNull();
        } finally {
            db.close();
        }
    });

    test("failed migration rolls back indexes, FTS map and version row", () => {
        const db = v94();
        try {
            upsertCommits(db, "project", [commit]);
            const before = fts(db);
            const migrate = MIGRATIONS.find((m) => m.version === 95)!;
            expect(() =>
                db
                    .transaction(() => {
                        migrate.up(db);
                        throw new Error("injected failure");
                    })
                    .immediate(),
            ).toThrow("injected failure");
            expect(fts(db)).toEqual(before);
            expect(
                db
                    .prepare("SELECT 1 FROM sqlite_master WHERE name='git_commit_fts_rowid_map'")
                    .get(),
            ).toBeNull();
            expect(db.prepare("SELECT MAX(version) AS v FROM schema_migrations").get()).toEqual({
                v: 94,
            });
            for (const name of V95_REDUNDANT_INDEXES)
                expect(
                    db.prepare("SELECT 1 FROM sqlite_master WHERE name=?").get(name),
                ).not.toBeNull();
        } finally {
            db.close();
        }
    });

    test("lost-ledger replay validates the existing FTS inventory instead of trusting it", () => {
        const db = v94();
        try {
            upsertCommits(db, "project", [commit]);
            runMigrations(db);
            db.exec("DELETE FROM schema_migrations WHERE version=95");
            runMigrations(db);
            expect(map(db)).toEqual(identities(db));
            db.exec(
                "DELETE FROM schema_migrations WHERE version=95; DELETE FROM git_commit_fts_rowid_map",
            );
            expect(() => runMigrations(db)).toThrow("git FTS rowid inventory differs");
            expect(db.prepare("SELECT MAX(version) AS v FROM schema_migrations").get()).toEqual({
                v: 94,
            });
        } finally {
            db.close();
        }
    });

    test("tag ordering index discovery does not retain rollback-local names", () => {
        const db = new Database(":memory:");
        try {
            db.exec(
                "CREATE TABLE tags(session_id TEXT,tag_number INTEGER,other TEXT,UNIQUE(session_id,tag_number))",
            );
            const original = tagOrderConstraintIndex(db);
            expect(() =>
                db
                    .transaction(() => {
                        db.exec(
                            "DROP TABLE tags; CREATE TABLE tags(session_id TEXT,tag_number INTEGER,other TEXT,UNIQUE(other),UNIQUE(session_id,tag_number))",
                        );
                        expect(tagOrderConstraintIndex(db)).not.toBe(original);
                        throw new Error("rollback");
                    })
                    .immediate(),
            ).toThrow("rollback");
            db.exec("ALTER TABLE tags ADD COLUMN extra TEXT; CREATE INDEX other ON tags(other)");
            expect(tagOrderConstraintIndex(db)).toBe(original);
        } finally {
            db.close();
        }
    });
});
