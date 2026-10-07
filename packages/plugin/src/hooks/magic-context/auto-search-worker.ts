import { parentPort, workerData } from "node:worker_threads";
import { installProjectEmbeddingSearchBridge } from "../../features/magic-context/project-embedding-registry";
import { unifiedSearch } from "../../features/magic-context/search";
import {
    type AutoSearchHintDecision,
    appendAutoSearchHintDecision,
    retireUnservedAutoSearchHintDecision,
} from "../../features/magic-context/storage-meta-persisted";
import { setEmbeddingSessionBusy } from "../../shared/embedding-activity";
import { setHarness } from "../../shared/harness";
import { Database } from "../../shared/sqlite";
import type {
    AutoSearchEmbeddingReply,
    AutoSearchWorkerInput,
    AutoSearchWorkerReply,
} from "./auto-search-worker-client";

const port = parentPort;
if (!port) throw new Error("auto-search worker requires a parent port");
const input = workerData as AutoSearchWorkerInput & {
    skipDecision?: AutoSearchHintDecision;
    decision?: AutoSearchHintDecision;
    retireDecision?: AutoSearchHintDecision;
    retireUntil?: number;
    deadlineUnixMs?: number;
};
// Workers have their own module globals; session rows must retain their owner's
// harness identity, and Pi/OMP must never inherit OpenCode-store ownership.
setHarness(input.harness);
setEmbeddingSessionBusy(input.sessionId, input.embeddingHostBusy === true);
let nextId = 0;
const pending = new Map<number, (reply: AutoSearchEmbeddingReply) => void>();
port.on("message", (reply: AutoSearchEmbeddingReply) => {
    // Backfill's busy-host gate is owner state, not this worker's empty activity
    // tracker. Refresh it when an embedding continuation is about to resume SQL.
    if (reply.embeddingHostBusy !== undefined)
        setEmbeddingSessionBusy(input.sessionId, reply.embeddingHostBusy);
    pending.get(reply.id)?.(reply);
    pending.delete(reply.id);
});
function request(
    message:
        | Omit<Extract<AutoSearchWorkerReply, { kind: "query" }>, "id">
        | Omit<Extract<AutoSearchWorkerReply, { kind: "batch" }>, "id">,
): Promise<AutoSearchEmbeddingReply> {
    return new Promise((resolve, reject) => {
        const id = ++nextId;
        pending.set(id, (reply) => (reply.error ? reject(new Error(reply.error)) : resolve(reply)));
        port?.postMessage({ ...message, id });
    });
}
if (input.snapshot) {
    installProjectEmbeddingSearchBridge(input.snapshot, {
        modelId: input.snapshot.modelId,
        initialize: async () => true,
        isLoaded: () => true,
        dispose: async () => {},
        embed: async (text) => {
            const result = (await request({ kind: "query", text })).result;
            return result instanceof Float32Array ? result : (result?.vector ?? null);
        },
        embedBatch: async (texts, _signal, purpose = "passage") =>
            (await request({ kind: "batch", texts, purpose })).vectors ?? texts.map(() => null),
    });
}
// No bootstrap or migration here. Backfill uses its ordinary guarded transaction;
// terminating this owner rolls an in-flight transaction back through SQLite.
const db = new Database(input.path);
db.exec("PRAGMA busy_timeout = 0");
try {
    if (input.retireDecision) {
        let retired = false;
        do {
            try {
                retired = retireUnservedAutoSearchHintDecision(
                    db,
                    input.sessionId,
                    input.retireDecision,
                );
            } catch {
                /* Another writer may own the short metadata transaction. */
            }
            if (retired || Date.now() >= (input.retireUntil ?? 0)) break;
            await new Promise((resolve) => setTimeout(resolve, 50));
        } while (Date.now() < (input.retireUntil ?? 0));
        port.postMessage({ retired });
    } else if (input.decision) {
        if (Date.now() >= (input.deadlineUnixMs ?? 0)) {
            port.postMessage(null);
        } else {
            const outcome = appendAutoSearchHintDecision(db, input.sessionId, input.decision);
            if (Date.now() >= (input.deadlineUnixMs ?? 0)) {
                if (outcome.ok && outcome.kind === "appended")
                    retireUnservedAutoSearchHintDecision(db, input.sessionId, input.decision);
                port.postMessage(null);
            } else port.postMessage(outcome);
        }
    } else if (input.skipDecision) {
        port.postMessage(appendAutoSearchHintDecision(db, input.sessionId, input.skipDecision));
    } else {
        const results = await unifiedSearch(db, input.sessionId, input.projectPath, input.query, {
            ...input.options,
            embedQuery: async (text) => (await request({ kind: "query", text })).result ?? null,
            isEmbeddingRuntimeEnabled: () => input.embeddingRuntimeEnabled,
        });
        port.postMessage({ kind: "result", results } satisfies AutoSearchWorkerReply);
    }
} catch (error) {
    port.postMessage({
        kind: "error",
        error: error instanceof Error ? error.message : String(error),
    } satisfies AutoSearchWorkerReply);
} finally {
    db.close();
    port.close();
}
