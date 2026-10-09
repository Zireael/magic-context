import { randomUUID } from "node:crypto";
import type { Database } from "../../shared/sqlite";
import { foldDigest } from "./owner";

export interface FoldRecord {
    revision: number;
    data: string;
    digest: string;
}
export interface NativeRowRecord extends FoldRecord {
    id: string;
    type: string;
    seq: number;
}
export interface AdmissionRecord {
    admission_id: string;
    revision: number;
    status: string;
    owner_token: string | null;
    data: string;
    payload: string | null;
    digest: string | null;
    logged_at: number | null;
}

/** Optional process-local state. Encoded strings own the captured message bytes;
 * returned records are copies. A new instance reloads missing rows from opencode.db
 * through a read-only reader. context.db supplies the existing history-summary end
 * message id, so replay can omit rows already represented by that summary.
 */
export class NativeFoldCache {
    readonly sourceID = randomUUID();
    private readonly tails = new Map<string, FoldRecord>();
    private readonly nativeRows = new Map<string, Map<string, NativeRowRecord>>();
    private readonly admissions = new Map<string, Map<string, AdmissionRecord>>();
    constructor(private readonly resolveDB: () => Database) {}
    get db(): Database {
        return this.resolveDB();
    }
    tail(sessionID: string): FoldRecord | undefined {
        const record = this.tails.get(sessionID);
        return record && { ...record };
    }
    async saveTail(
        sessionID: string,
        data: string,
        rows: Omit<NativeRowRecord, "revision">[],
    ): Promise<void> {
        this.tails.set(sessionID, {
            revision: (this.tails.get(sessionID)?.revision ?? -1) + 1,
            data,
            digest: foldDigest(data),
        });
        const kept = this.nativeRows.get(sessionID) ?? new Map<string, NativeRowRecord>();
        for (const row of rows)
            kept.set(
                row.id,
                Object.freeze({ ...row, revision: (kept.get(row.id)?.revision ?? -1) + 1 }),
            );
        this.nativeRows.set(sessionID, kept);
    }
    replaceRows(
        sessionID: string,
        through: number,
        rows: Omit<NativeRowRecord, "revision">[],
        after = -1,
    ): void {
        const kept = this.nativeRows.get(sessionID) ?? new Map<string, NativeRowRecord>();
        for (const [id, row] of kept) if (row.seq > after && row.seq <= through) kept.delete(id);
        for (const row of rows) kept.set(row.id, Object.freeze({ ...row, revision: 0 }));
        this.nativeRows.set(sessionID, kept);
    }
    truncate(sessionID: string, through: number): void {
        const kept = this.nativeRows.get(sessionID);
        if (kept) for (const [id, row] of kept) if (row.seq > through) kept.delete(id);
    }
    sequenceForID(sessionID: string, id: string): number | undefined {
        return this.nativeRows.get(sessionID)?.get(id)?.seq;
    }
    containsRows(sessionID: string, ids: readonly string[]): boolean {
        const kept = this.nativeRows.get(sessionID);
        return ids.every((id) => kept?.has(id));
    }
    rows(sessionID: string, after: number, through: number): NativeRowRecord[] {
        return [...(this.nativeRows.get(sessionID)?.values() ?? [])]
            .filter((row) => row.seq > after && row.seq <= through)
            .sort((a, b) => a.seq - b.seq)
            .map((row) => ({ ...row }));
    }
    admission(sessionID: string, id: string): AdmissionRecord | undefined {
        const record = this.admissions.get(sessionID)?.get(id);
        return record && { ...record };
    }
    private put(sessionID: string, id: string, record: AdmissionRecord): void {
        const kept = this.admissions.get(sessionID) ?? new Map<string, AdmissionRecord>();
        kept.set(id, Object.freeze({ ...record }));
        this.admissions.set(sessionID, kept);
    }
    async supply(sessionID: string, id: string, payload: string): Promise<void> {
        const old = this.admission(sessionID, id);
        this.put(sessionID, id, {
            admission_id: id,
            revision: (old?.revision ?? -1) + 1,
            status: old?.status ?? "supplied",
            owner_token: old?.owner_token ?? null,
            data: old?.data ?? "{}",
            payload,
            digest: foldDigest(payload),
            logged_at: old?.logged_at ?? null,
        });
    }
    latestAttempt(sessionID: string): AdmissionRecord | undefined {
        const record = [...(this.admissions.get(sessionID)?.values() ?? [])]
            .reverse()
            .find((row) => JSON.parse(row.data).after !== undefined);
        return record && { ...record };
    }
    async claim(
        sessionID: string,
        id: string,
        data: string,
        owner: string,
        _now: number,
    ): Promise<boolean> {
        const old = this.admission(sessionID, id);
        if (old?.owner_token || (old?.logged_at !== null && old?.logged_at !== undefined))
            return false;
        this.put(sessionID, id, {
            admission_id: id,
            revision: 0,
            status: "pending",
            owner_token: owner,
            data,
            payload: old?.payload ?? null,
            digest: old?.digest ?? null,
            logged_at: null,
        });
        return true;
    }
    async finish(
        sessionID: string,
        id: string,
        owner: string,
        status: string,
        now: number,
    ): Promise<boolean> {
        const old = this.admission(sessionID, id);
        if (!old || old.owner_token !== owner || old.status !== "pending") return false;
        this.put(sessionID, id, { ...old, status, owner_token: null, logged_at: now });
        return true;
    }
    async forget(sessionID: string): Promise<void> {
        this.tails.delete(sessionID);
        this.nativeRows.delete(sessionID);
        this.admissions.delete(sessionID);
    }
}
export function nativeFoldCache(db: Database | (() => Database)): NativeFoldCache {
    return new NativeFoldCache(typeof db === "function" ? db : () => db);
}
