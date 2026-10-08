import { afterEach, expect, spyOn, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import ts from "typescript";
import * as embedding from "../../features/magic-context/memory/embedding";
import { invalidateProject } from "../../features/magic-context/memory/embedding-cache";
import { insertMemory } from "../../features/magic-context/memory/storage-memory";
import { runMigrations } from "../../features/magic-context/migrations";
import { unifiedSearch } from "../../features/magic-context/search";
import { initializeDatabase } from "../../features/magic-context/storage-db";
import {
    type AutoSearchHintDecision,
    appendAutoSearchHintDecision,
    getAutoSearchHintDecisions,
} from "../../features/magic-context/storage-meta-persisted";
import {
    clearSession,
    getOrCreateSessionMeta,
} from "../../features/magic-context/storage-meta-session";
import { _resetHarnessForTesting, setHarness } from "../../shared/harness";
import { Database, withSqliteTransformPass } from "../../shared/sqlite";
import { createTestTempDirFromPath } from "../../shared/test-temp-dir";
import { createCtxSearchTools } from "../../tools/ctx-search/tools";
import { clearAutoSearchTimeoutForSession } from "./auto-search-deadline";
import { buildAutoSearchHint } from "./auto-search-hint";
import { clearAutoSearchForSession, runAutoSearchHint } from "./auto-search-runner";
import { autoSearchTestSnapshot } from "./auto-search-snapshot.fixture";
import { persistAutoSearchDecision, searchAutoHint } from "./auto-search-worker-client";

const root = join(tmpdir(), "magic-context", "bg_a0f7b373d3df719d");
mkdirSync(root, { recursive: true });
const dbs: Database[] = [];
const workers: Worker[] = [];
function fixture() {
    setHarness("pi");
    const path = join(createTestTempDirFromPath(join(root, "re-review-")), "context.db");
    const db = new Database(path);
    dbs.push(db);
    initializeDatabase(db);
    runMigrations(db);
    return { db, path };
}
afterEach(async () => {
    clearAutoSearchTimeoutForSession();
    for (const worker of workers.splice(0)) await worker.terminate();
    for (const db of dbs.splice(0)) db.close();
    _resetHarnessForTesting();
});
function messages() {
    return [
        { info: { id: "user", role: "user" }, parts: [{ type: "text", text: "question" }] },
        { info: { id: "assistant", role: "assistant" }, parts: [{ type: "text", text: "answer" }] },
    ];
}

// Execute the actual old getter/validator, not a reimplementation of its semantics.
// Pin the comparison master so a subsequent fix cannot silently change this reader.
function olderGetter() {
    const source = execFileSync(
        "git",
        [
            "show",
            "41eedb38821dba886ce8ea1c65963eab54bf52f3:packages/plugin/src/features/magic-context/storage-meta-persisted.ts",
        ],
        {
            cwd: fileURLToPath(new URL("../../../../../", import.meta.url)),
            encoding: "utf8",
            windowsHide: true,
        },
    );
    const parsed = ts.createSourceFile("old.ts", source, ts.ScriptTarget.Latest, true);
    const names = new Set([
        "AUTO_SEARCH_NO_HINT_REASONS",
        "isValidAutoSearchHintDecision",
        "parseJsonArray",
        "getAutoSearchHintDecisions",
    ]);
    const selected = parsed.statements.filter((node) =>
        ts.isFunctionDeclaration(node)
            ? names.has(node.name?.text ?? "")
            : ts.isVariableStatement(node) &&
              node.declarationList.declarations.some((item) =>
                  names.has(item.name.getText(parsed)),
              ),
    );
    expect(selected.length).toBe(4);
    const javascript = ts.transpileModule(
        selected.map((node) => node.getText(parsed).replace(/^export /, "")).join("\n"),
        {
            compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
        },
    ).outputText;
    return new Function(`${javascript}\nreturn getAutoSearchHintDecisions;`)() as (
        db: Database,
        sessionId: string,
    ) => AutoSearchHintDecision[];
}

test("re-review: an older master reader must not expose a provisional publication", () => {
    const { db } = fixture();
    expect(
        appendAutoSearchHintDecision(db, "mixed-version", {
            messageId: "user",
            decision: "hint",
            text: "unserved",
            publication: { token: "owner-token", state: "provisional" },
        }).ok,
    ).toBe(true);
    expect(getAutoSearchHintDecisions(db, "mixed-version")).toEqual([]);
    expect(olderGetter()(db, "mixed-version")).toEqual([]);
});

test("re-review: an accepted commit with a late final ack must remain invisible to a second owner", async () => {
    const { db, path } = fixture();
    const reader = new Database(path);
    dbs.push(reader);
    const sessionId = "late-publication-ack";
    const pending = persistAutoSearchDecision(
        db,
        sessionId,
        {
            messageId: "user",
            decision: "hint",
            text: "\n\n<ctx-search-hint>unserved</ctx-search-hint>",
        },
        performance.now() - 2000,
        new URL("./auto-search-publication-ack-review.fixture.ts", import.meta.url),
    );
    const until = performance.now() + 900;
    while (!existsSync(`${path}.accepted`) && performance.now() < until)
        await new Promise((resolve) => setTimeout(resolve, 5));
    expect(existsSync(`${path}.accepted`)).toBe(true);
    // Hold retirement behind an ordinary independent writer while a WAL reader
    // replays. The final ack, not the provisional ack, is the delayed one.
    reader.exec("BEGIN IMMEDIATE");
    try {
        expect(await pending).toBeNull();
        expect(getAutoSearchHintDecisions(db, sessionId)).toEqual([]);
        const output = messages();
        const before = JSON.stringify(output);
        await runAutoSearchHint({
            db: reader,
            sessionId,
            messages: output,
            options: {
                enabled: true,
                projectPath: "git:review",
                scoreThreshold: 0,
                minPromptChars: 1,
            },
        });
        expect(JSON.stringify(output)).toBe(before);
    } finally {
        reader.exec("ROLLBACK");
        await pending;
    }
}, 7000);

test("re-review: pending hint publication must not recreate a cleared session", async () => {
    const { db, path } = fixture();
    const sessionId = "deleted-hint-owner";
    getOrCreateSessionMeta(db, sessionId);
    const writer = new Database(path);
    dbs.push(writer);
    writer.exec("BEGIN IMMEDIATE");
    const pending = persistAutoSearchDecision(
        db,
        sessionId,
        {
            messageId: "user",
            decision: "hint",
            text: "orphan hint",
        },
        performance.now(),
    );
    try {
        clearSession(writer, sessionId);
        clearAutoSearchForSession(sessionId);
        expect(
            writer.prepare("SELECT 1 FROM session_meta WHERE session_id=?").get(sessionId),
        ).toBeFalsy();
    } finally {
        writer.exec("COMMIT");
    }
    await pending;
    expect(db.prepare("SELECT 1 FROM session_meta WHERE session_id=?").get(sessionId)).toBeFalsy();
});

test("re-review: another owner's old skip must not contaminate a recreated session with a reused rowid", async () => {
    const { db, path } = fixture();
    const sessionId = "reused-incarnation";
    getOrCreateSessionMeta(db, sessionId);
    const oldId = db.prepare("SELECT rowid FROM session_meta WHERE session_id=?").get(sessionId);
    db.exec("BEGIN IMMEDIATE");
    const owner = new Worker(
        new URL("./auto-search-skip-owner-review.fixture.ts", import.meta.url),
        {
            workerData: { path, sessionId },
        },
    );
    workers.push(owner);
    const queued = new Promise<void>((resolve, reject) => {
        owner.on("message", (reply) => {
            if (reply.queued) resolve();
        });
        owner.on("error", reject);
        owner.on("exit", () => reject(new Error("skip owner exited before reply")));
    });
    const finished = new Promise<boolean>((resolve, reject) => {
        owner.on("message", (reply) => {
            if (reply.finished) resolve(reply.ok);
        });
        owner.on("error", reject);
        owner.on("exit", () => reject(new Error("skip owner exited before reply")));
    });
    try {
        await queued;
        clearSession(db, sessionId);
        clearAutoSearchForSession(sessionId);
        getOrCreateSessionMeta(db, sessionId);
        expect(
            db.prepare("SELECT rowid FROM session_meta WHERE session_id=?").get(sessionId),
        ).toEqual(oldId);
    } finally {
        db.exec("COMMIT");
    }
    expect(await finished).toBe(true);
    expect(getAutoSearchHintDecisions(db, sessionId)).toEqual([]);
});

test("re-review control: exhausted publication budget returns no hint without waiting for a writer", async () => {
    const { db, path } = fixture();
    const writer = new Database(path);
    dbs.push(writer);
    writer.exec("BEGIN IMMEDIATE");
    try {
        const start = performance.now();
        const result = await persistAutoSearchDecision(
            db,
            "spent",
            {
                messageId: "user",
                decision: "hint",
                text: "never published",
            },
            start - 3001,
        );
        expect(result).toBeNull();
        expect(performance.now() - start).toBeLessThan(100);
    } finally {
        writer.exec("ROLLBACK");
    }
});

test("re-review control: publication contention cannot overrun the remaining stage budget", async () => {
    const { db, path } = fixture();
    const writer = new Database(path);
    dbs.push(writer);
    writer.exec("BEGIN IMMEDIATE");
    try {
        const start = performance.now();
        const result = await persistAutoSearchDecision(
            db,
            "short-budget",
            {
                messageId: "user",
                decision: "hint",
                text: "never published",
            },
            start - 2750,
        );
        expect(result).toBeNull();
        expect(performance.now() - start).toBeLessThan(600);
        expect(getAutoSearchHintDecisions(db, "short-budget")).toEqual([]);
    } finally {
        writer.exec("ROLLBACK");
    }
});

test("re-review control: an expired background skip budget still permits an uncontended freeze", async () => {
    const { db, path } = fixture();
    const sessionId = "expired-skip-budget";
    getOrCreateSessionMeta(db, sessionId);
    const row = db
        .prepare("SELECT rowid AS id FROM session_meta WHERE session_id=?")
        .get(sessionId) as { id: number };
    const worker = new Worker(new URL("./auto-search-worker.ts", import.meta.url), {
        workerData: {
            path,
            sessionId,
            harness: "pi",
            expectedRowid: row.id,
            deadlineUnixMs: Date.now() - 1,
            skipDecision: { messageId: "user", decision: "no-hint", reason: "timeout" },
        },
    });
    workers.push(worker);
    const outcome = await new Promise<{ ok?: boolean }>((resolve, reject) => {
        worker.once("message", resolve);
        worker.once("error", reject);
        worker.once("exit", () => reject(new Error("skip worker exited before reply")));
    });
    expect(outcome.ok).toBe(true);
    expect(getAutoSearchHintDecisions(db, sessionId)).toEqual([
        { messageId: "user", decision: "no-hint", reason: "timeout" },
    ]);
});

test("re-review control: publication metadata is absent from public decisions, served bytes and ctx_search", async () => {
    const { db } = fixture();
    const sessionId = "metadata-public-surface";
    const projectPath = "git:publication-surface";
    insertMemory(db, {
        projectPath,
        category: "ARCHITECTURE_DECISIONS",
        content: "historian cache wiring details",
    });
    const decision = {
        messageId: "user",
        decision: "hint" as const,
        text: "\n\n<ctx-search-hint>accepted</ctx-search-hint>",
    };
    appendAutoSearchHintDecision(db, sessionId, {
        ...decision,
        publication: { token: "internal-marker-7e41", state: "accepted" },
    });
    expect(getAutoSearchHintDecisions(db, sessionId)).toEqual([decision]);
    const output = messages();
    await runAutoSearchHint({
        db,
        sessionId,
        messages: output,
        options: { enabled: true, projectPath, minPromptChars: 1, scoreThreshold: 0 },
    });
    expect(output[0].parts[0].text).toBe(`question${decision.text}`);
    const tools = createCtxSearchTools({
        db,
        resolveProjectPath: () => projectPath,
        memoryEnabled: true,
        embeddingEnabled: false,
        readMessages: () => [],
    });
    const result = await tools.ctx_search.execute(
        { query: "historian cache wiring", sources: ["memory"] },
        { sessionID: sessionId, directory: root } as never,
    );
    expect(result).toContain("historian cache wiring details");
    expect(result).not.toContain("internal-marker-7e41");
    expect(result).not.toContain("publication");
});

test("re-review: successful hint bytes must match master when a backfill lock exceeds the foreground lease", async () => {
    const project = "git:review-long-backfill-lock";
    const initial = autoSearchTestSnapshot(project);
    const snapshot = spyOn(embedding, "getProjectEmbeddingSnapshot").mockReturnValue(initial);
    let lock: Worker | undefined;
    const batch = spyOn(embedding, "embedBatchForProject").mockImplementation(
        async (_project, texts) => {
            lock?.postMessage("release");
            return {
                vectors: texts.map(
                    (text) => new Float32Array(text.includes("details") ? [-1, 0] : [1, 0]),
                ),
                modelId: initial.modelId,
                generation: 1,
            };
        },
    );
    const payloads: string[] = [];
    try {
        for (const offThread of [false, true]) {
            const { db, path } = fixture();
            db.exec("PRAGMA busy_timeout = 2000");
            insertMemory(db, {
                projectPath: project,
                category: "ARCHITECTURE_DECISIONS",
                content: "historian cache wiring details",
            });
            insertMemory(db, {
                projectPath: project,
                category: "ARCHITECTURE_DECISIONS",
                content: "historian cache wiring retry correctness budgeting",
            });
            invalidateProject(project);
            const lockWorker = new Worker(
                new URL("./auto-search-long-lock-review.fixture.ts", import.meta.url),
                { workerData: { path } },
            );
            lock = lockWorker;
            workers.push(lockWorker);
            const finished = new Promise<void>((resolve, reject) => {
                lockWorker.on("exit", (code) =>
                    code === 0 ? resolve() : reject(new Error(`lock worker exited ${code}`)),
                );
                lockWorker.on("error", reject);
            });
            await new Promise<void>((resolve, reject) => {
                lockWorker.once("message", () => resolve());
                lockWorker.once("error", reject);
            });
            const startedAt = performance.now();
            const results = await withSqliteTransformPass(() =>
                (offThread ? searchAutoHint : unifiedSearch)(
                    db,
                    "long-backfill-lock",
                    project,
                    "historian cache wiring",
                    {
                        sources: ["memory"],
                        embeddingEnabled: true,
                        countRetrievals: false,
                        measurementDisabled: true,
                        isEmbeddingRuntimeEnabled: () => true,
                        embedQuery: async () => ({
                            vector: new Float32Array([1, 0]),
                            modelId: initial.modelId,
                            chunkModelId: initial.chunkModelId,
                            generation: 1,
                        }),
                    },
                ),
            );
            await finished;
            expect(results.length).toBeGreaterThan(0);
            expect(results[0].score).toBeGreaterThan(0.6);
            const text = `\n\n${buildAutoSearchHint(results)}`;
            const decision = { messageId: "user", decision: "hint" as const, text };
            const outcome = offThread
                ? await persistAutoSearchDecision(db, "long-backfill-lock", decision, startedAt)
                : appendAutoSearchHintDecision(db, "long-backfill-lock", decision);
            expect(outcome?.ok).toBe(true);
            expect(performance.now() - startedAt).toBeLessThan(3000);
            payloads.push(text);
        }
        expect(batch).toHaveBeenCalledTimes(2);
        expect(payloads[1]).toBe(payloads[0]);
    } finally {
        batch.mockRestore();
        snapshot.mockRestore();
    }
});
