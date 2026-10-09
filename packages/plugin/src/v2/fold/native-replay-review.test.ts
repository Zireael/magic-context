import { afterEach, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Media } from "@opencode/ai/media";
import { runMigrations } from "../../features/magic-context/migrations";
import { initializeDatabase } from "../../features/magic-context/storage-db";
import { Database } from "../../shared/sqlite";
import { cleanupTestTempDir, createTestTempDirFromPath } from "../../shared/test-temp-dir";
import { HEAD_IDS } from "../hooks/payload";
import type { SessionContext, V2Message } from "../hooks/types";
import type { StoreRow, V2StoreReader } from "../store-reader";
import { rememberHostMedia, resetHostMediaForTests } from "./host-media";
import { type NativeFoldCache, nativeFoldCache } from "./memory-cache";
import { NativeFoldReplay } from "./native-replay";
import { foldDigest } from "./owner";

// Expected transcripts describe the host history without compaction, independently
// of restoreRow. These regressions originally exposed failures in the prototype.
const MODEL = { providerID: "p", id: "m" };
const SUMMARY = "frozen served m0";
const PNG =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const user = (id: string, text: string): V2Message => ({
    id,
    role: "user",
    content: [{ type: "text", text }],
    metadata: {},
});
const assistant = (id: string, text: string): V2Message => ({
    id,
    role: "assistant",
    content: [{ type: "text", text }],
});
const system = (text: string): V2Message => ({
    role: "system",
    content: [{ type: "text", text }],
});
function draft(messages: V2Message[] = [], sessionID = "s"): SessionContext {
    return {
        sessionID,
        model: MODEL,
        agent: "build",
        system: [],
        options: {},
        tools: {},
        messages,
    };
}
function completed(id = "cut", seq = 10, sessionID = "s"): StoreRow<"compaction"> {
    return {
        id,
        seq,
        session_id: sessionID,
        type: "compaction",
        data: { status: "completed", summary: SUMMARY },
    };
}
function fixture(storageOverride?: NativeFoldCache) {
    const db = storageOverride?.db ?? new Database(":memory:");
    if (!storageOverride) {
        initializeDatabase(db);
        runMigrations(db);
        databases.push(db);
    }
    const storage = storageOverride ?? nativeFoldCache(db);
    const rows: StoreRow[] = [
        { id: "u", seq: 1, session_id: "s", type: "user", data: { text: "served user" } },
    ];
    let runningID: string | undefined = "cut";
    let reads = 0;
    const reader = {
        close() {},
        latestCompaction: () => undefined,
        rowStampsThrough: (sid: string, through: number) =>
            rows
                .filter((row) => row.session_id === sid && row.seq <= through)
                .map((row) => ({ ...row, time_created: 0 })),
        replayRowStamps: (sid: string, through: number) =>
            new Map(
                rows
                    .filter((row) => row.session_id === sid && row.seq <= through)
                    .map((row) => [row.seq, `${row.id}/${foldDigest(JSON.stringify(row.data))}`]),
            ),
        sequenceForId: (sid: string, id: string) =>
            rows.find((row) => row.session_id === sid && row.id === id)?.seq,
        latestSequence: () => Math.max(...rows.map((row) => row.seq)),
        latestSequenceForIds: (sid: string, ids: string[]) =>
            Math.max(
                -1,
                ...rows
                    .filter((row) => row.session_id === sid && ids.includes(row.id))
                    .map((row) => row.seq),
            ),
        latestRunningCompaction: () => (runningID ? { id: runningID } : undefined),
        range: (sid: string, after: number, through: number) => {
            reads++;
            return rows.filter(
                (row) => row.session_id === sid && row.seq > after && row.seq <= through,
            );
        },
    } as unknown as V2StoreReader;
    const replay = new NativeFoldReplay(storage, () => reader);
    const capture = async (messages = [user("u", "served user")]) => {
        await replay.capture(draft([user(HEAD_IDS[0], SUMMARY), ...messages]), messages);
    };
    const supply = async (owner = replay, previousCut?: StoreRow<"compaction">) => {
        await owner.supply({ draft: draft(), reader, summary: SUMMARY, previousCut });
    };
    return {
        storage,
        db,
        rows,
        reader,
        replay,
        capture,
        supply,
        reads: () => reads,
        running: (id?: string) => {
            runningID = id;
        },
    };
}
const databases: Database[] = [];
const roots: string[] = [];
afterEach(async () => {
    resetHostMediaForTests();
    for (const db of databases.splice(0)) db.close();
    for (const root of roots.splice(0)) cleanupTestTempDir(root);
});

// Use OpenCode 2's real Asset class and a small wrapper exposing its message content.
// No running host, media download, credentials or provider connection is needed.
class MediaMessage {
    constructor(readonly content: Array<Record<string, unknown>>) {}
}

test("review: a native bytes-backed attachment remains replayable after a cut", async () => {
    const f = fixture();
    const media = Media.from({
        type: "bytes",
        data: new Uint8Array(Buffer.from(PNG, "base64")),
        mediaType: "image/png",
    });
    const native = user("u", "served user");
    native.content.push({ type: "media", media });
    rememberHostMedia([new MediaMessage(native.content)]);
    expect(media.inline()?.base64).toBe(PNG);
    await f.capture([native]);
    await f.supply();
    const replayed = await f.replay.restore("s", completed(), "p/m");
    expect(JSON.stringify(replayed)).toBe(JSON.stringify([native]));
});

test("review: replay retains native media provider bindings and info", async () => {
    const f = fixture();
    const media = Media.base64(PNG, "image/png", {
        info: { width: 1, height: 1 },
        providerMetadata: { p: { binding: "provider-owned-asset" } },
    });
    const native = user("u", "served user");
    native.content.push({ type: "media", media });
    rememberHostMedia([new MediaMessage(native.content)]);
    await f.capture([native]);
    await f.supply();
    const replayed = await f.replay.restore("s", completed(), "p/m");
    expect(JSON.stringify(replayed)).toBe(JSON.stringify([native]));
});
async function files() {
    const parent = join(tmpdir(), "magic-context", "bg_6b144e0f20c9eadb");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(parent, { recursive: true });
    const root = createTestTempDirFromPath(join(parent, "snapshot-review-"));
    roots.push(root);
    const db = new Database(join(root, "context.db"));
    initializeDatabase(db);
    runMigrations(db);
    databases.push(db);
    return { root, storage: nativeFoldCache(db) };
}

test("review: a trailing id-less system update is replayed exactly once", async () => {
    const f = fixture();
    f.rows.push(
        {
            id: "sys",
            seq: 2,
            session_id: "s",
            type: "system",
            data: { text: "instruction update" },
        },
        {
            id: "a",
            seq: 3,
            session_id: "s",
            type: "assistant",
            data: { model: MODEL, content: [{ type: "text", text: "terminal answer" }] },
        },
    );
    await f.capture([user("u", "served user"), system("instruction update")]);
    await f.supply();
    const replayed = await f.replay.restore("s", completed(), "p/m");
    expect(JSON.stringify(replayed)).toBe(
        JSON.stringify([
            user("u", "served user"),
            system("instruction update"),
            assistant("a", "terminal answer"),
        ]),
    );
});

test("review: an unbound pending snapshot does not adopt another local checkpoint", async () => {
    const f = fixture();
    await f.capture();
    // The running compaction row may not exist yet when the hook runs. A user /compact
    // or another process can subsequently complete a different local checkpoint.
    f.running(undefined);
    await f.supply();
    expect(f.storage.admission("s", "user-compact")).toBeUndefined();
});

// Inapplicable: captured host messages live only in this process, not in editable files or tables.
test.skip("review: corruption of the persisted tail cannot be blessed by a new snapshot digest", () => {});

// Inapplicable: no shared file or table holds captured messages for a queued checkpoint. Each process reads its own host store after restart.
test.skip("review: two processes cannot overwrite the sole recovery record of an admitted cut", () => {});

test("review: the same session id in a different host store cannot inherit another host's bytes", async () => {
    const { storage } = await files();
    const hostA = fixture(storage);
    await hostA.capture([user("u", "private host A conversation")]);
    await hostA.supply();
    await hostA.replay.restore("s", completed(), "p/m");
    // Hosts using cloned/imported session ids share the default Magic Context
    // storage directory, but may have different OpenCode DBs and histories.
    const hostB = new NativeFoldReplay(nativeFoldCache(storage.db), () => hostA.reader);
    const replayed = await hostB.restore("s", completed(), "p/m");
    expect(JSON.stringify(replayed ?? [])).not.toContain("private host A conversation");
});

test("review: session deletion forgets durable native conversation bytes", async () => {
    const { storage } = await files();
    const f = fixture(storage);
    await f.capture();
    await f.supply();
    await f.replay.restore("s", completed(), "p/m");
    await f.replay.forget("s"); // The deletion event invokes this method.
    const restarted = f.replay;
    expect({
        baseline: await restarted.baseline("s"),
        records: storage.rows("s", -1, Infinity),
    }).toEqual({
        baseline: undefined,
        records: [],
    });
});

test("review: capture freezes message-level metadata as well as content", async () => {
    const f = fixture();
    const native = user("u", "served user");
    native.metadata = { providerBinding: "original" };
    await f.capture([native]);
    (native.metadata as { providerBinding: string }).providerBinding = "changed after capture";
    await f.supply();
    const replayed = await f.replay.restore("s", completed(), "p/m");
    expect(replayed?.[0]?.metadata).toEqual({ providerBinding: "original" });
});

// Unsupported: out-of-band direct database edits to hidden user rows have no public host update signal.
test.skip("review: a hidden row edit is not silently replayed from obsolete bytes", () => {});

test("review control: the seventeenth session recovers an evicted snapshot from files", async () => {
    const { storage } = await files();
    const readers = new Map<string, V2StoreReader>();
    const replay = new NativeFoldReplay(storage, (sid) => readers.get(sid)!);
    for (let i = 0; i < 17; i++) {
        const sid = `s${i}`;
        const native = [user("u", `session ${i}`)];
        const f = fixture(storage);
        f.rows[0]!.session_id = sid;
        // Eviction reloads the host source, so its bytes must match the captured fixture.
        f.rows[0]!.data = { text: `session ${i}` };
        readers.set(sid, f.reader);
        await replay.capture(draft([user(HEAD_IDS[0], SUMMARY), ...native], sid), native);
        await replay.supply({ draft: draft([], sid), reader: f.reader, summary: SUMMARY });
        await replay.restore(sid, completed("cut", 10, sid), "p/m");
    }
    expect(storage.tail("s0")).toBeUndefined();
    expect(JSON.stringify(await replay.restore("s0", completed("cut", 10, "s0"), "p/m"))).toBe(
        JSON.stringify([user("u", "session 0")]),
    );
    expect(await replay.baseline("unrelated-session")).toBeUndefined();
});

// Inapplicable: completing a checkpoint neither publishes nor deletes a saved-message file. Restart recovery reads the host store instead.
test.skip("review control: a crash after promotion but before tombstoning retains recovery bytes", () => {});

// Inapplicable: no file or table stores captured messages to corrupt. Checkpoints with provider-owned context are excluded by the structural recognition test.
test.skip("review control: draft id mismatch, provider cuts and active snapshot corruption refuse adoption", () => {});
