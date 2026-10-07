import { parentPort, workerData } from "node:worker_threads";
import {
    type AutoSearchHintDecision,
    appendAutoSearchHintDecision,
    retireUnservedAutoSearchHintDecision,
} from "../../features/magic-context/storage-meta-persisted";
import { Database } from "../../shared/sqlite";

const input = workerData as {
    path: string;
    sessionId: string;
    decision: AutoSearchHintDecision;
    deadlineUnixMs: number;
};
const db = new Database(input.path);
const outcome = appendAutoSearchHintDecision(db, input.sessionId, input.decision);
// Emulate a slow COMMIT/checkpoint acknowledgement after the hint row was written.
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3600);
if (Date.now() >= input.deadlineUnixMs && outcome.ok && outcome.kind === "appended") {
    retireUnservedAutoSearchHintDecision(db, input.sessionId, input.decision);
    parentPort?.postMessage(null);
} else parentPort?.postMessage(outcome);
db.close();
parentPort?.close();
