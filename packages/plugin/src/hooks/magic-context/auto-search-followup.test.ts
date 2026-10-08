import { afterEach, expect, spyOn, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as embedding from "../../features/magic-context/memory/embedding";
import { insertMemory } from "../../features/magic-context/memory/storage-memory";
import { loadAllEmbeddings } from "../../features/magic-context/memory/storage-memory-embeddings";
import { runMigrations } from "../../features/magic-context/migrations";
import { initializeDatabase } from "../../features/magic-context/storage-db";
import {
    appendAutoSearchHintDecision,
    getAutoSearchHintDecisions,
} from "../../features/magic-context/storage-meta-persisted";
import { Database } from "../../shared/sqlite";
import { createTestTempDirFromPath } from "../../shared/test-temp-dir";
import { runAutoSearchHint } from "./auto-search-runner";
import { autoSearchTestSnapshot } from "./auto-search-snapshot.fixture";
import { persistAutoSearchDecision, searchAutoHint } from "./auto-search-worker-client";

const root = join(tmpdir(), "magic-context", "auto-search-followup");
mkdirSync(root, { recursive: true });
const dbs: Database[] = [];
function fixture() {
    const path = join(createTestTempDirFromPath(join(root, "contract-")), "context.db");
    const db = new Database(path);
    dbs.push(db);
    initializeDatabase(db);
    runMigrations(db);
    return { db, path };
}
afterEach(() => {
    for (const db of dbs.splice(0)) db.close();
});

for (const mismatch of ["provider", "dimensions"] as const) {
    test(`passage RPC rejects mismatched ${mismatch} before storing a vector`, async () => {
        const { db } = fixture();
        const project = `git:contract-${mismatch}`;
        const initial = autoSearchTestSnapshot(project);
        const memory = insertMemory(db, {
            projectPath: project,
            category: "ARCHITECTURE_DECISIONS",
            content: "historian cache wiring",
        });
        const snapshot = spyOn(embedding, "getProjectEmbeddingSnapshot").mockReturnValue(initial);
        const batch = spyOn(embedding, "embedBatchForProject").mockImplementation(async () => {
            if (mismatch === "provider")
                snapshot.mockReturnValue({ ...initial, providerIdentity: "another-provider" });
            return {
                vectors: [new Float32Array(mismatch === "dimensions" ? [1, 0, 0] : [1, 0])],
                modelId: initial.modelId,
                generation: initial.generation,
            };
        });
        try {
            await searchAutoHint(db, "contract", project, "historian cache wiring", {
                sources: ["memory"],
                embeddingEnabled: true,
                isEmbeddingRuntimeEnabled: () => true,
                embedQuery: async () => ({
                    vector: new Float32Array([1, 0]),
                    modelId: initial.modelId,
                    chunkModelId: initial.chunkModelId,
                    generation: 1,
                }),
            });
            expect(batch).toHaveBeenCalledTimes(1);
            expect(loadAllEmbeddings(db, project, initial.modelId).has(memory.id)).toBe(false);
        } finally {
            batch.mockRestore();
            snapshot.mockRestore();
        }
    });
}

test("durably accepted publication has identical SOFT replay on two connections", async () => {
    const { db, path } = fixture();
    const reader = new Database(path);
    dbs.push(reader);
    const sessionId = "accepted-two-connections";
    const decision = {
        messageId: "user",
        decision: "hint" as const,
        text: "\n\n<ctx-search-hint>accepted fragment</ctx-search-hint>",
    };
    expect((await persistAutoSearchDecision(db, sessionId, decision, performance.now()))?.ok).toBe(
        true,
    );
    expect(getAutoSearchHintDecisions(reader, sessionId)).toEqual([decision]);
    const raw = db
        .prepare(
            "SELECT auto_search_hint_decisions AS decisions FROM session_meta WHERE session_id=?",
        )
        .get(sessionId) as { decisions: string };
    expect(JSON.parse(raw.decisions)[0].publication.state).toBe("accepted");
    const outputs: string[] = [];
    for (const connection of [db, reader]) {
        const messages = [
            { info: { id: "user", role: "user" }, parts: [{ type: "text", text: "question" }] },
            {
                info: { id: "assistant", role: "assistant" },
                parts: [{ type: "text", text: "answer" }],
            },
        ];
        await runAutoSearchHint({
            db: connection,
            sessionId,
            messages,
            options: {
                enabled: true,
                projectPath: "git:accepted",
                scoreThreshold: 0,
                minPromptChars: 1,
            },
        });
        outputs.push(JSON.stringify(messages));
    }
    expect(outputs[1]).toBe(outputs[0]);
    expect(outputs[0]).toContain("accepted fragment");
});

test("a different process cannot see a provisional JSON decision", async () => {
    const { db, path } = fixture();
    expect(
        appendAutoSearchHintDecision(db, "process-reader", {
            messageId: "user",
            decision: "hint",
            text: "unserved",
            publication: { token: "process-token", state: "provisional" },
        }).ok,
    ).toBe(true);
    const storage = new URL(
        "../../features/magic-context/storage-meta-persisted.ts",
        import.meta.url,
    ).href;
    const sqlite = new URL("../../shared/sqlite.ts", import.meta.url).href;
    const code = `import {Database} from ${JSON.stringify(sqlite)}; import {getAutoSearchHintDecisions} from ${JSON.stringify(storage)}; const db=new Database(${JSON.stringify(path)},{readonly:true}); console.log(JSON.stringify(getAutoSearchHintDecisions(db,"process-reader"))); db.close();`;
    const child = Bun.spawn([process.execPath, "-e", code], {
        windowsHide: true,
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, MAGIC_CONTEXT_LOG_PATH: join(root, "process-reader.log") },
    });
    const [output, error, exit] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
    ]);
    expect({ exit, error: exit === 0 ? "" : error }).toEqual({ exit: 0, error: "" });
    expect(JSON.parse(output.trim())).toEqual([]);
});
