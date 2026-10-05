/// <reference types="bun-types" />

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RustTestHarness } from "../src/rust-harness";
import { rustPrereqs } from "../src/rust-scenario-support";

interface SqliteRow {
    id: string;
    message_id?: string;
    session_id: string;
    time_created: number;
    time_updated: number;
    data: string;
}

const FOLD_CONFIG = {
    execute_threshold_tokens: { default: 20_000 },
    protected_tokens: 4_000,
    cache_ttl: "0",
    compressor: { enabled: false },
};

function assertHermeticStores(h: RustTestHarness): void {
    const pidFile = JSON.parse(readFileSync(join(h.env.dataDir, "cortexkit", "rust-e2e-pids.json"), "utf8")) as { pids: Array<{ pid: number }> };
    const pids = [h.opencode.pid, ...pidFile.pids.map(row => row.pid)];
    const files = spawnSync("timeout", ["20s", "lsof", "-p", pids.join(","), "-Fn"], { encoding: "utf8" });
    expect(files.status).toBe(0);
    const stores = [...new Set(files.stdout.split("\n").filter(line => /^n.*\.db(?:$|-)/.test(line)).map(line => line.slice(1)))];
    expect(stores.length).toBeGreaterThan(0);
    expect(stores.every(path => path.startsWith(`${h.env.dataDir}/`))).toBe(true);
    expect(stores.some(path => path.endsWith("opencode.db"))).toBe(true);
    expect(stores.some(path => path.endsWith("store.db"))).toBe(true);
    console.log(`lsof pids=${pids.join(",")} isolated stores=${JSON.stringify(stores.filter(path => path.endsWith(".db")))}`);
}

function sha256(value: string): string {
    return createHash("sha256").update(value).digest("hex");
}

/** The session's published compartments, in order. */
function contextHistoryRows(path: string, sessionId: string): Array<{ sequence: number; title: string }> {
    const db = new Database(path, { readonly: true });
    try {
        return db
            .query("SELECT sequence, title FROM compartments WHERE session_id = ? ORDER BY sequence")
            .all(sessionId) as Array<{ sequence: number; title: string }>;
    } finally {
        db.close();
    }
}

describe.skipIf(!rustPrereqs.ok)("rust invariant: compaction marker byte identity", () => {
    let h: RustTestHarness;

    beforeEach(async () => {
        h = await RustTestHarness.create({
            modelContextLimit: 1_000_000,
            historianModelContextLimit: 1_000_000,
            magicContextConfig: FOLD_CONFIG,
        });
        h.subc.writeModuleConfig(FOLD_CONFIG);
    });

    afterEach(async () => {
        if (h) {
            console.log(h.diagnosticLog().split("\n").filter(line => /rust pass:|compaction-marker drain:|rust transform failed/.test(line)).slice(-4).join("\n"));
            console.log(h.subc.moduleLog().split("\n").filter(line => /ERROR|historian firing failed/.test(line)).slice(-4).join("\n"));
        }
        await h?.dispose();
    });

    it(
        "advances indexed Rust markers on busts and resyncs a 12900-message cut without changing ordinary wire bytes",
        async () => {
            const health = await fetch(`${h.opencode.url}/global/health`).then(response => response.json()) as { version: string };
            expect(health.version).toMatch(/^1\./);
            const sessionId = await h.createSession();
            await h.sendPrompt(sessionId, "seed the long session");
            assertHermeticStores(h);
            h.setSessionCacheTtl(sessionId, "0");
            h.appendSyntheticHistory(sessionId, { count: 12_900, textBytes: 64 });
            // These rows precede the seed. Refresh raw ordinals before the module
            // starts folding, rather than presenting a reordered incremental tail.
            await h.restart({ rust: true, magicContextConfig: FOLD_CONFIG });
            assertHermeticStores(h);
            console.log(`OpenCode ${health.version}`);
            const opencodeDb = new Database(join(h.env.dataDir, "opencode", "opencode.db"));
            // The harness's OpenCode server writes this database concurrently; bun:sqlite
            // defaults to no busy wait, so the marker deletes below would fail on the
            // first overlapping host write (seen as SQLITE_BUSY in release run r2).
            opencodeDb.exec("PRAGMA busy_timeout = 30000");

            const markerOrdinals = new Set<number>();
            for (let turn = 1; turn <= 90; turn += 1) {
                h.mock.setDefault({
                    text: `fold reply ${turn}`,
                    usage: {
                        input_tokens: 60_000,
                        output_tokens: 20,
                        cache_creation_input_tokens: 2_000,
                    },
                });
                await h.sendPrompt(sessionId, `marker fold turn ${turn}: ${h.ballast(400)}`, { timeoutMs: 300_000 });
                const row = h.contextDb().query("SELECT compaction_marker_state FROM session_meta WHERE session_id=?").get(sessionId) as { compaction_marker_state: string };
                const ordinal = row.compaction_marker_state ? (JSON.parse(row.compaction_marker_state) as { boundaryOrdinal: number }).boundaryOrdinal : 0;
                if (ordinal > 0) markerOrdinals.add(ordinal);
                const published = (h.contextDb().query("SELECT count(*) AS n FROM compartments WHERE session_id=?").get(sessionId) as { n: number }).n;
                if (turn >= 4 && published >= 3) expect(markerOrdinals.size).toBeGreaterThan(0);
                if (turn % 10 === 0) console.log(`fold turn=${turn} ordinal=${ordinal}; compartments=${JSON.stringify(h.contextDb().query("SELECT sequence,end_message,end_block_index FROM compartments WHERE session_id=? ORDER BY sequence DESC LIMIT 3").all(sessionId))}`);
                if (markerOrdinals.size >= 3 && ordinal > 12_700) break;
                await Bun.sleep(100);
            }

            expect(markerOrdinals.size).toBeGreaterThanOrEqual(3);
            const indexedCount = (h.contextDb().query("SELECT count(*) AS n FROM compartments WHERE session_id=? AND end_block_index IS NOT NULL").get(sessionId) as { n: number }).n;
            expect(indexedCount).toBeGreaterThanOrEqual(3);
            console.log(`indexed compartments=${indexedCount}; marker ordinals=${JSON.stringify([...markerOrdinals])}`);
            h.mock.setDefault({ text: "ordinary probe", usage: { input_tokens: 500, output_tokens: 20 } });
            h.setSessionCacheTtl(sessionId, "5m");
            const ordinaryConfig = { ...FOLD_CONFIG, cache_ttl: "5m", execute_threshold_tokens: { default: 800_000 } };
            h.subc.writeModuleConfig(ordinaryConfig);

            // The three probe passes below must all render the same session history.
            // A historian run still in flight when the fixture loop above stops (on a
            // slow runner the run covering the newest turn often is) would publish a
            // compartment between the control pass and the marker pass, and the two
            // would differ by that compartment rather than by the marker. Let every
            // run finish, then stop the producer so no later run can publish while
            // the passes are compared. Keep the module running so the one-step host
            // cut exercises its full-resync path rather than a cold module boot.
            const historianDeadline = Date.now() + 120_000;
            let historianState: string | undefined;
            while (Date.now() < historianDeadline) {
                const status = (await h.subc.moduleStatus(sessionId, h.env.workdir)) as {
                    historian?: { state?: string };
                };
                historianState = status.historian?.state;
                if (historianState === "idle") break;
                await Bun.sleep(100);
            }
            expect(historianState).toBe("idle");
            h.subc.killProducer();
            await h.subc.waitForProducerDeath();
            // Runtime config is also sent by the host; changing only the module's
            // file would leave the host's zero-TTL bust permission in force.
            await h.restart({ rust: true, magicContextConfig: ordinaryConfig });
            assertHermeticStores(h);
            // TTL policy freezes on the first model pass, independently of the
            // config file. End the fixture's zero-TTL setup explicitly so the
            // comparison really observes ordinary passes, not repeated idle busts.
            const contextWriter = new Database(join(h.env.dataDir, "cortexkit", "magic-context", "context.db"));
            try {
                contextWriter.exec("PRAGMA busy_timeout=5000");
                contextWriter.query(`UPDATE session_meta SET cache_ttl='5m',
                    trailing_blank_decisions=json_set(trailing_blank_decisions,
                        '$.cacheTtlPolicy.value', '5m', '$.cacheTtlPolicy.config', '5m')
                    WHERE session_id=?`).run(sessionId);
            } finally { contextWriter.close(); }
            // A publication can finish after the last fold turn. Consume that
            // coverage on its bust before taking the marker snapshot, or the first
            // comparison would measure a new history render instead of SOFT+ replay.
            const settlingPasses = h.readRustPasses().length;
            await h.sendPrompt(sessionId, "settle the last published coverage");
            await h.waitForRustPasses(settlingPasses + 1);
            const summaryRows = opencodeDb.query(`SELECT * FROM message
                WHERE session_id=? AND json_extract(data, '$.summary')=1
                AND json_extract(data, '$.providerID')='magic-context'`).all(sessionId) as SqliteRow[];
            const compactionRows = opencodeDb.query(`SELECT * FROM part
                WHERE session_id=? AND json_extract(data, '$.type')='compaction'
                AND json_extract(data, '$.auto')=1`).all(sessionId) as SqliteRow[];
            expect(summaryRows).toHaveLength(1);
            expect(compactionRows).toHaveLength(1);
            const summaryPartRows = opencodeDb.query("SELECT * FROM part WHERE session_id=? AND message_id=?").all(sessionId, summaryRows[0]!.id) as SqliteRow[];
            // Simulate the frozen host cut without altering any indexed ends or
            // module state. Restoring these same rows is the one-step input shrink.
            opencodeDb.transaction(() => {
                for (const row of [...compactionRows, ...summaryPartRows]) {
                    opencodeDb.prepare("DELETE FROM part WHERE id=?").run(row.id);
                }
                opencodeDb.prepare("DELETE FROM message WHERE id=?").run(summaryRows[0]!.id);
            })();
            const publishedHistory = () =>
                contextHistoryRows(join(h.env.dataDir, "cortexkit", "magic-context", "context.db"), sessionId);
            const historyBeforeComparison = publishedHistory();

            const probe = "byte identity marker probe";
            const probeMessageId = "msg_01MKRBYT3ID3NT1TYPR0BE0000";
            await Bun.sleep(700);
            const controlPassesBefore = h.readRustPasses().length;
            await h.sendPrompt(sessionId, probe, { messageID: probeMessageId });
            const controlPasses = await h.waitForRustPasses(controlPassesBefore + 1);
            const controlInput = controlPasses.at(-1)!.inputCount;
            const controlSerialized = h.lastMainWireSerialized();
            const controlHash = sha256(controlSerialized);
            const exactPrefix = () => {
                const body = h.mainRequests().at(-1)!.body;
                return JSON.stringify({ system: body.system, messages: body.messages });
            };
            const exactControl = exactPrefix();
            const controlProbe = (await h.listMessages(sessionId))
                .filter(
                    (message) =>
                        message.info?.role === "user" &&
                        message.parts?.some((part) => part.type === "text" && part.text === probe),
                )
                .at(-1)?.info?.id;
            expect(controlProbe).toBe(probeMessageId);
            await h.revertMessage(sessionId, controlProbe!);

            opencodeDb.transaction(() => {
                for (const row of summaryRows) {
                    opencodeDb
                        .prepare(
                            "INSERT OR REPLACE INTO message (id, session_id, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?)",
                        )
                        .run(row.id, row.session_id, row.time_created, row.time_updated, row.data);
                }
                for (const row of [...compactionRows, ...summaryPartRows]) {
                    opencodeDb
                        .prepare(
                            "INSERT OR REPLACE INTO part (id, message_id, session_id, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?, ?)",
                        )
                        .run(
                            row.id,
                            row.message_id!,
                            row.session_id,
                            row.time_created,
                            row.time_updated,
                            row.data,
                        );
                }
            })();

            await Bun.sleep(700);
            const markerPassesBefore = h.readRustPasses().length;
            await h.sendPrompt(sessionId, probe, { messageID: probeMessageId });
            const markerPasses = await h.waitForRustPasses(markerPassesBefore + 1);
            const markerInput = markerPasses.at(-1)!.inputCount;
            const markerSerialized = h.lastMainWireSerialized();
            const markerHash = sha256(markerSerialized);
            const exactMarker = exactPrefix();
            const markerProbe = (await h.listMessages(sessionId))
                .filter(
                    (message) =>
                        message.info?.role === "user" &&
                        message.parts?.some((part) => part.type === "text" && part.text === probe),
                )
                .at(-1)?.info?.id;
            expect(markerProbe).toBe(probeMessageId);
            await h.revertMessage(sessionId, markerProbe!);

            const replayPassesBefore = h.readRustPasses().length;
            await h.sendPrompt(sessionId, probe, { messageID: probeMessageId });
            const replayPasses = await h.waitForRustPasses(replayPassesBefore + 1);
            const replaySerialized = h.lastMainWireSerialized();
            const replayHash = sha256(replaySerialized);
            expect(exactMarker).toBe(exactControl);
            expect(exactPrefix()).toBe(exactControl);

            // No compartment may land while the passes are compared; the producer is
            // gone, so a change here means the drain above missed a run.
            expect(publishedHistory()).toEqual(historyBeforeComparison);
            console.log(`rust marker byte identity control sha256=${controlHash}`);
            console.log(`rust marker byte identity post-cut-1 sha256=${markerHash}`);
            console.log(`rust marker byte identity post-cut-2 sha256=${replayHash}`);
            expect(controlInput).toBeGreaterThan(markerInput);
            expect(controlInput).toBeGreaterThan(12_900);
            expect(markerInput).toBeLessThan(400);
            expect(replayPasses.at(-1)!.inputCount).toBe(markerInput);
            const comparedPasses = [controlPasses.at(-1)!, markerPasses.at(-1)!, replayPasses.at(-1)!];
            expect(comparedPasses.every(pass => pass.applied && pass.servedFrom === "transform")).toBe(true);
            expect(comparedPasses.every(pass => pass.decision === "SOFT+" || pass.decision === "DEFER")).toBe(true);
            // The first smaller input is sent whole, not mistaken for an append
            // delta against the thousands of messages the module saw before it.
            expect(markerPasses.at(-1)!.wireMessages).toBe(markerInput);
            const ordinaryBefore = h.readRustPasses().length;
            await h.sendPrompt(sessionId, "ordinary append after the input cut");
            const ordinaryPass = (await h.waitForRustPasses(ordinaryBefore + 1)).at(-1)!;
            expect(ordinaryPass.servedFrom).toBe("transform");
            expect(ordinaryPass.applied).toBe(true);
            expect(ordinaryPass.decision).toBe("SOFT+");
            expect(ordinaryPass.wireMessages).toBeLessThanOrEqual(4);
            const replayArray = JSON.parse(replaySerialized) as unknown[];
            expect((JSON.parse(h.lastMainWireSerialized()) as unknown[]).slice(0, replayArray.length)).toEqual(replayArray);
            const sessionLines = h.diagnosticLog().split("\n").filter(line => line.includes(`[${sessionId}]`));
            const moves = sessionLines.flatMap((line, index) => line.includes("compaction-marker drain: applied") ? [index] : []);
            expect(moves.length).toBeGreaterThanOrEqual(3);
            for (const index of moves) {
                const consumingPass = sessionLines.slice(index + 1).find(line => line.includes("rust pass:"));
                expect(consumingPass).toMatch(/decision=(?:HARD|SOFT)\s/);
            }
            expect(sessionLines.filter(line => /rust transform failed|lkg_replay_served|mc_rust_\w*refusal|served_from=refused|replaying LKG/.test(line))).toEqual([]);
            console.log(`one-step input shrink=${controlInput}->${markerInput}; full cut send=${markerPasses.at(-1)!.wireMessages}; next ordinary delta=${ordinaryPass.wireMessages}`);
            if (controlHash !== markerHash || markerHash !== replayHash) {
                const firstDifference =
                    controlHash !== markerHash
                        ? [...controlSerialized].findIndex(
                              (character, index) => character !== markerSerialized[index],
                          )
                        : [...markerSerialized].findIndex(
                              (character, index) => character !== replaySerialized[index],
                          );
                throw new Error(
                    `wire bytes diverged at ${firstDifference}: ` +
                        `control=${JSON.stringify(controlSerialized.slice(firstDifference, firstDifference + 500))} ` +
                        `postRestart1=${JSON.stringify(markerSerialized.slice(firstDifference, firstDifference + 500))} ` +
                        `postRestart2=${JSON.stringify(replaySerialized.slice(firstDifference, firstDifference + 500))}`,
                );
            }
            opencodeDb.close();
        },
        600_000,
    );
});
