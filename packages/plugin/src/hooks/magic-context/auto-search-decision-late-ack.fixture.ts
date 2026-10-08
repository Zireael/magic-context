import { parentPort, workerData } from "node:worker_threads";
import {
    type AutoSearchHintDecision,
    appendAutoSearchHintDecision,
} from "../../features/magic-context/storage-meta-persisted";
import { type HarnessId, setHarness } from "../../shared/harness";
import { Database } from "../../shared/sqlite";

const input = workerData as {
    path: string;
    sessionId: string;
    decision: AutoSearchHintDecision;
    harness: HarnessId;
    deadlineUnixMs: number;
};
setHarness(input.harness);
const db = new Database(input.path);
db.exec(`PRAGMA busy_timeout = ${Math.max(0, Math.floor(input.deadlineUnixMs - Date.now()))}`);
const outcome = appendAutoSearchHintDecision(db, input.sessionId, input.decision);
// The commit was timely but its acknowledgement reaches the owner too late.
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3600);
parentPort?.postMessage(outcome);
db.close();
parentPort?.close();
