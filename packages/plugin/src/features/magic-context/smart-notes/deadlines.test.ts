import { afterEach, beforeEach, expect, jest, spyOn, test } from "bun:test";
import { timeoutTestDatabase } from "./__tests__/http-timeout-fixture.test";
import { addNote, getPendingSmartNotes } from "../storage-notes";
import { runDueCompiledSmartNoteChecks } from "./runner";
import { __sandboxRunnerTest, runCompiledSmartNoteCheck } from "./sandbox-runner";
import { SMART_NOTE_CHECK_POLICY_VERSION } from "./types";
import { __wakePlaneTest } from "./wake-plane";

const PROJECT = "git:smart-note-deadlines";
let fixture: ReturnType<typeof timeoutTestDatabase>;
const capabilities = {
    readFile: async () => null,
    gitHeadSha: async () => null,
    gitTag: async () => null,
    gitLog: async () => [],
    httpGet: async () => ({ status: 200, body: "ok" }),
};

beforeEach(async () => {
    __wakePlaneTest.reset();
    __wakePlaneTest.setCatalogProbe(async () => []);
    fixture = timeoutTestDatabase();
    // Instantiate the real VM before installing the virtual clock. The seam
    // controls availability, not QuickJS's implementation or interrupt handler.
    expect(
        await runCompiledSmartNoteCheck({
            compiledCheck: "function check() { return { met: false }; }",
            capabilities,
        }),
    ).toEqual({ ok: true, result: { met: false } });
});

afterEach(() => {
    __sandboxRunnerTest.reset();
    __wakePlaneTest.reset();
    jest.useRealTimers();
    fixture.dispose();
});

function seed(compiledCheck: string): number {
    const note = addNote(fixture.db, "smart", {
        projectPath: PROJECT,
        content: "watch state",
        surfaceCondition: "later",
    });
    fixture.db
        .prepare(`UPDATE notes SET compiled_check=?, check_hash='hash', check_status='compiled',
            check_cron='* * * * *', check_next_due_at=0, policy_version=? WHERE id=?`)
        .run(compiledCheck, SMART_NOTE_CHECK_POLICY_VERSION, note.id);
    return note.id;
}

test("slow module acquisition gives the first busy check its full CPU budget and one logic strike", async () => {
    seed("function check() { while (true) {} }");
    seed("function check() { return { met: true }; }");
    jest.useFakeTimers();
    jest.setSystemTime(0);
    __sandboxRunnerTest.setBeforeModuleAcquisition(async () => {
        await Promise.resolve();
        jest.advanceTimersByTime(4_500);
    });
    let executionStarted = false;
    const clock = spyOn(performance, "now").mockImplementation(() => {
        // Deliver eligible timers at interrupt polls, including the sweep timer
        // while JavaScript is running. No machine-speed-dependent sleeps needed.
        if (executionStarted) jest.advanceTimersByTime(250);
        executionStarted = true;
        return Date.now();
    });
    try {
        const result = await runDueCompiledSmartNoteChecks({
            db: fixture.db,
            projectIdentity: PROJECT,
            projectRoot: process.cwd(),
            sweepBudgetMs: 5_000,
        });
        expect(result).toEqual({ ran: 1, surfaced: 0, failed: 1, networkFailed: 0 });
        expect(getPendingSmartNotes(fixture.db, PROJECT).map((note) => note.checkFailureCount)).toEqual([
            1, 0,
        ]);
        expect(Date.now()).toBeGreaterThanOrEqual(6_500);
        expect(Date.now()).toBeLessThanOrEqual(11_000);
    } finally {
        clock.mockRestore();
    }
});
