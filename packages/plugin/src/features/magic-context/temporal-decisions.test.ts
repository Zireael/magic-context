import { expect, it } from "bun:test";
import { Database } from "../../shared/sqlite";
import { runMigrations } from "./migrations";
import { initializeDatabase } from "./storage-db";
import { addMergedReasoningStrippedIds } from "./storage-meta-persisted";
import { freezeTemporalDecisions, getTemporalDecisions } from "./temporal-decisions";

it("temporal choices freeze absence as well as marker bytes and preserve other replay entries", () => {
    const db = new Database(":memory:");
    initializeDatabase(db);
    runMigrations(db);
    try {
        addMergedReasoningStrippedIds(db, "session", ["assistant"]);
        freezeTemporalDecisions(
            db,
            "session",
            new Map([
                ["none", ""],
                ["gap", "<!-- +5m -->\n"],
            ]),
        );
        freezeTemporalDecisions(
            db,
            "session",
            new Map([
                ["none", "<!-- +2h -->\n"],
                ["gap", ""],
            ]),
        );
        expect(getTemporalDecisions(db, "session")).toEqual(
            new Map([
                ["none", ""],
                ["gap", "<!-- +5m -->\n"],
            ]),
        );
        const row = db
            .prepare(
                "SELECT merged_reasoning_stripped_ids AS entries FROM session_meta WHERE session_id = 'session'",
            )
            .get() as { entries: string };
        expect(JSON.parse(row.entries)).toContain("assistant");
        db.exec(
            "CREATE TRIGGER refuse_temporal BEFORE UPDATE ON session_meta BEGIN SELECT RAISE(FAIL, 'refused temporal freeze'); END",
        );
        expect(() =>
            freezeTemporalDecisions(db, "session", new Map([["new", "<!-- +1h -->\n"]])),
        ).toThrow("refused temporal freeze");
        expect(getTemporalDecisions(db, "session").has("new")).toBe(false);
    } finally {
        db.close();
    }
});
