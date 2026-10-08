import { parentPort, workerData } from "node:worker_threads";
import { installProjectEmbeddingSearchBridge } from "../../features/magic-context/project-embedding-registry";
import { unifiedSearch } from "../../features/magic-context/search";
import {
    type AutoSearchHintDecision,
    acceptAutoSearchHintDecision,
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
    acceptDecision?: AutoSearchHintDecision;
    retireDecision?: AutoSearchHintDecision;
    retireUntil?: number;
    deadlineUnixMs?: number;
    cancellation?: SharedArrayBuffer;
    expectedRowid?: number | null;
};
// Workers have their own module globals; session rows must retain their owner's
// harness identity, and Pi/OMP must never inherit OpenCode-store ownership.
setHarness(input.harness);
setEmbeddingSessionBusy(input.sessionId, input.embeddingHostBusy === true);
let nextId = 0;
const pending = new Map<number, (reply: AutoSearchEmbeddingReply) => void>();
let publicationApproval: ((token: string) => void) | undefined;
let queryDimensions: number | null = null;
let db: Database;
const deadline = input.deadlineUnixMs ?? input.retireUntil ?? Date.now() + 3000;
const setBusyBudget = () =>
    db.exec(`PRAGMA busy_timeout = ${Math.max(0, Math.floor(deadline - Date.now()))}`);
port.on("message", (reply: AutoSearchEmbeddingReply | { kind: "publish"; token: string }) => {
    if ("kind" in reply) {
        publicationApproval?.(reply.token);
        return;
    }
    // Backfill's busy-host gate is owner state, not this worker's empty activity
    // tracker. Refresh it when an embedding continuation is about to resume SQL.
    if (reply.embeddingHostBusy !== undefined)
        setEmbeddingSessionBusy(input.sessionId, reply.embeddingHostBusy);
    const vector = reply.result instanceof Float32Array ? reply.result : reply.result?.vector;
    if (vector) queryDimensions = vector.length;
    setBusyBudget();
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
        embedBatch: async (texts, _signal, purpose = "passage") => {
            const passage = (await request({ kind: "batch", texts, purpose })).passage;
            const captured = input.snapshot;
            if (
                !passage ||
                !captured ||
                passage.generation !== captured.generation ||
                passage.modelId !== captured.modelId ||
                passage.providerIdentity !== captured.providerIdentity ||
                passage.runtimeFingerprint !== captured.runtimeFingerprint ||
                !queryDimensions ||
                passage.dimensions !== queryDimensions ||
                passage.vectors.length !== texts.length
            )
                return texts.map(() => null);
            return passage.vectors.map((vector) =>
                vector && vector.length === queryDimensions && vector.every(Number.isFinite)
                    ? vector
                    : null,
            );
        },
    });
}
// No bootstrap or migration here. Backfill uses its ordinary guarded transaction;
// terminating this owner rolls an in-flight transaction back through SQLite.
db = new Database(input.path);
setBusyBudget();
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
    } else if (input.acceptDecision) {
        const outcome = acceptAutoSearchHintDecision(
            db,
            input.sessionId,
            input.acceptDecision,
            deadline,
        );
        if (Date.now() >= deadline) {
            retireUnservedAutoSearchHintDecision(db, input.sessionId, input.acceptDecision);
            port.postMessage(null);
        } else port.postMessage(outcome);
    } else if (input.decision) {
        const decision = input.decision;
        if (Date.now() >= (input.deadlineUnixMs ?? 0)) {
            port.postMessage(null);
        } else {
            const outcome = appendAutoSearchHintDecision(db, input.sessionId, decision);
            if (Date.now() >= (input.deadlineUnixMs ?? 0)) {
                if (outcome.ok && outcome.kind === "appended")
                    retireUnservedAutoSearchHintDecision(db, input.sessionId, input.decision);
                port.postMessage(null);
            } else if (
                outcome.ok &&
                outcome.decision.decision === "hint" &&
                decision.decision === "hint" &&
                outcome.decision.publication?.state === "provisional" &&
                outcome.decision.publication.token === decision.publication?.token
            ) {
                // Keep this connection: publication is a second IMMEDIATE transaction
                // after the owner received the provisional acknowledgement on time.
                const approved = await new Promise<boolean>((resolve) => {
                    const timer = setTimeout(
                        () => resolve(false),
                        Math.max(0, deadline - Date.now()),
                    );
                    publicationApproval = (token) => {
                        clearTimeout(timer);
                        resolve(token === decision.publication?.token);
                    };
                    port.postMessage(outcome);
                });
                setBusyBudget();
                if (!approved || Date.now() >= deadline) {
                    retireUnservedAutoSearchHintDecision(db, input.sessionId, decision);
                    port.postMessage(null);
                } else {
                    const published = acceptAutoSearchHintDecision(
                        db,
                        input.sessionId,
                        decision,
                        deadline,
                    );
                    if (Date.now() >= deadline) {
                        retireUnservedAutoSearchHintDecision(db, input.sessionId, decision);
                        port.postMessage(null);
                    } else port.postMessage(published);
                }
            } else port.postMessage(outcome);
        }
    } else if (input.skipDecision) {
        const skippedDecision = input.skipDecision;
        const outcome = db
            .transaction(() => {
                if (input.cancellation && Atomics.load(new Int32Array(input.cancellation), 0) !== 0)
                    return { ok: false, kind: "cas-exhausted" };
                const current = db
                    .prepare("SELECT rowid AS id FROM session_meta WHERE session_id = ?")
                    .get(input.sessionId) as { id: number } | undefined;
                if (input.expectedRowid != null && current?.id !== input.expectedRowid)
                    return { ok: false, kind: "cas-exhausted" };
                return appendAutoSearchHintDecision(db, input.sessionId, skippedDecision, {
                    ensureRow: input.expectedRowid == null,
                });
            })
            .immediate();
        port.postMessage(outcome);
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
