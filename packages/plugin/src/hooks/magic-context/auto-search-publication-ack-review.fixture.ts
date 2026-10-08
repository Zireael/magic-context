import { writeFileSync } from "node:fs";
import { parentPort, workerData } from "node:worker_threads";

// Delay transport only after the real worker has committed its accepted state.
// A second SQLite connection can read that state while the owner is still waiting.
const port = parentPort;
if (!port) throw new Error("publication acknowledgement probe requires a parent port");
const post = port.postMessage.bind(port);
port.postMessage = (reply) => {
    if (reply?.ok && reply.decision?.decision === "hint" && !reply.decision.publication) {
        writeFileSync(`${workerData.path}.accepted`, "accepted commit before acknowledgement");
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500);
    }
    post(reply);
};
await import("./auto-search-worker");
