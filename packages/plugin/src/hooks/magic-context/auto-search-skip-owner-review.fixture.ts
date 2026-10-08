import { parentPort, workerData } from "node:worker_threads";
import { setHarness } from "../../shared/harness";
import { Database } from "../../shared/sqlite";
import { persistAutoSearchSkip } from "./auto-search-deadline";

// Each owner has its own module globals, just as two hosts sharing a store do.
setHarness("pi");
// Keep the owner alive despite the deliberately unreferenced persistence worker.
parentPort?.on("message", () => {});
const db = new Database(workerData.path);
const pending = persistAutoSearchSkip(db, workerData.sessionId, "old-user");
parentPort?.postMessage({ queued: true });
parentPort?.postMessage({ finished: true, ok: await pending });
db.close();
parentPort?.close();
