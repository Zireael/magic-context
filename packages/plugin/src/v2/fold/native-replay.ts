import { getOrCreateSessionMeta } from "../../features/magic-context/storage";
import { HEAD_IDS } from "../hooks/payload";
import type { SessionContext, V2Message } from "../hooks/types";
import {
    RAW_MESSAGE_TYPES,
    type StoreRow,
    type V2RowStamp,
    type V2StoreReader,
} from "../store-reader";
import { hostMediaAsset, hostUsesMediaAssets, rememberHostMedia } from "./host-media";
import type { NativeFoldCache, NativeRowRecord } from "./memory-cache";
import { encodeNative, NativeReplayUnavailable, reviveNative } from "./native-codec";
import { foldDigest } from "./owner";
import { restoreRow } from "./restore";

interface NativeTail {
    model: string;
    sourceSeq: number;
    baseline?: string;
}
interface Snapshot {
    source: string;
    sessionID: string;
    admissionID: string;
    summary: string;
}
const coordinates = new WeakMap<V2Message, string>();
export function nativeRowID(message: V2Message): string | undefined {
    return coordinates.get(message) ?? message.id;
}
export function copyNativeInput(messages: readonly V2Message[]): V2Message[] {
    const copies = reviveNative(encodeNative(messages));
    copies.forEach((copy, i) => {
        const original = messages[i];
        const id = original && nativeRowID(original);
        if (id !== undefined) coordinates.set(copy, id);
    });
    return copies;
}
export function isLocalCheckpoint(row: StoreRow): row is StoreRow<"compaction"> {
    return (
        row.type === "compaction" &&
        row.data.status === "completed" &&
        row.data.providerContext === undefined
    );
}
const conversational = (row: { type: string }) =>
    (RAW_MESSAGE_TYPES as readonly string[]).includes(row.type) || row.type === "location-switched";

/** A disposable per-session row cache, never a second history authority. The host
 * owns edits and reverts; its events invalidate hidden rows, and visible rows are
 * replaced from each incoming draft. Cold or invalidated spans use restoreRow once.
 */
export class NativeFoldReplay {
    private readonly changed = new Set<string>();
    private readonly dirty = new Set<string>();
    private readonly unavailable = new Set<string>();
    private readonly metadata = new Map<string, V2RowStamp[]>();
    private readonly loaded = new Map<string, number>();
    private readonly sources = new Map<string, string>();
    constructor(
        readonly storage: NativeFoldCache,
        private readonly openReader: (sessionID: string) => V2StoreReader,
    ) {}

    async observeSource(sessionID: string, reader: V2StoreReader): Promise<void> {
        const source = reader.hostIdentity();
        const prior = this.sources.get(sessionID);
        if (prior && prior !== source) await this.forget(sessionID);
        this.sources.set(sessionID, source);
    }
    onEvent(event: { type?: string; data?: { sessionID?: string; to?: string } }): void {
        const sessionID = event.data?.sessionID;
        if (
            sessionID &&
            (event.type?.startsWith("session.revert.") ||
                event.type === "session.message.content.updated")
        )
            this.invalidate(sessionID);
    }
    invalidate(sessionID: string, suppressNomination = false): void {
        if (suppressNomination) this.unavailable.add(sessionID);
        this.dirty.add(sessionID);
        this.changed.add(sessionID);
        this.metadata.delete(sessionID);
    }
    private tail(sessionID: string): NativeTail | undefined {
        const record = this.storage.tail(sessionID);
        return record ? (JSON.parse(record.data) as NativeTail) : undefined;
    }
    async baseline(sessionID: string): Promise<string | undefined> {
        return this.tail(sessionID)?.baseline;
    }
    private rendered(row: StoreRow, model: SessionContext["model"]): V2Message[] {
        return restoreRow(
            row,
            model,
            hostUsesMediaAssets()
                ? {
                      asset: hostMediaAsset,
                      unavailable: () => {},
                  }
                : undefined,
        );
    }
    private record(
        row: Pick<StoreRow, "id" | "seq" | "type">,
        messages: readonly V2Message[],
    ): Omit<NativeRowRecord, "revision"> {
        const data = JSON.stringify(encodeNative(messages));
        return { id: row.id, type: row.type, seq: row.seq, data, digest: foldDigest(data) };
    }
    private records(
        sessionID: string,
        native: readonly V2Message[],
        reader: V2StoreReader,
    ): Omit<NativeRowRecord, "revision">[] {
        let metadata = this.metadata.get(sessionID);
        const known = new Set(metadata?.map((row) => row.id));
        if (!metadata || native.some((message) => message.id && !known.has(message.id))) {
            metadata = reader
                .rowStampsThrough(sessionID, reader.latestSequence(sessionID))
                .filter(conversational);
            this.metadata.set(sessionID, metadata);
        }
        const byID = new Map(metadata.map((row) => [row.id, row]));
        const grouped = new Map<V2RowStamp, V2Message[]>();
        let cursor = -1;
        let owner: string | undefined;
        for (const message of native) {
            let id = nativeRowID(message);
            if (!id && message.role === "system")
                id = metadata.find((row) => row.type === "system" && row.seq > cursor)?.id;
            if (!id && message.role === "tool") id = owner;
            const row = id ? byID.get(id) : undefined;
            if (!row)
                throw new NativeReplayUnavailable("Native carrier has no source row coordinate");
            cursor = row.seq;
            coordinates.set(message, row.id);
            if (message.role !== "tool") owner = row.id;
            const messages = grouped.get(row) ?? [];
            messages.push(message);
            grouped.set(row, messages);
        }
        return [...grouped].map(([row, messages]) => this.record(row, messages));
    }
    async capture(draft: SessionContext, native: readonly V2Message[]): Promise<void> {
        // Capture is optional and runs after a servable transform. Cache trouble
        // cannot undo that transform or turn a usable request into an interruption.
        try {
            rememberHostMedia(native);
            const reader = this.openReader(draft.sessionID);
            try {
                const rows = this.records(draft.sessionID, native, reader);
                const baseline = draft.messages
                    .find((message) => message.id === HEAD_IDS[0])
                    ?.content.find((part) => part.type === "text")?.text;
                const through = Math.max(-1, ...rows.map((row) => row.seq));
                const tail: NativeTail = {
                    model: `${draft.model.providerID}/${draft.model.id}`,
                    sourceSeq: through,
                    baseline:
                        typeof baseline === "string"
                            ? baseline
                            : this.tail(draft.sessionID)?.baseline,
                };
                await this.storage.saveTail(draft.sessionID, JSON.stringify(tail), rows);
                this.storage.truncate(draft.sessionID, through);
                this.loaded.set(draft.sessionID, through);
                this.unavailable.delete(draft.sessionID);
                this.changed.delete(draft.sessionID);
            } finally {
                reader.close();
            }
        } catch {
            this.unavailable.add(draft.sessionID);
            this.invalidate(draft.sessionID);
        }
    }
    async canReplay(sessionID: string, _reader: V2StoreReader): Promise<boolean> {
        return (
            !this.unavailable.has(sessionID) && typeof (await this.baseline(sessionID)) === "string"
        );
    }
    async supply(args: {
        draft: SessionContext;
        reader: V2StoreReader;
        summary: string;
        previousCut?: StoreRow<"compaction">;
    }): Promise<boolean> {
        const { draft, reader, summary } = args;
        const tail = this.tail(draft.sessionID);
        const id = reader.latestRunningCompaction(draft.sessionID)?.id;
        if (!id || !tail || tail.model !== `${draft.model.providerID}/${draft.model.id}`)
            return false;
        const through = reader.latestSequence(draft.sessionID);
        const after = this.dirty.has(draft.sessionID) ? -1 : tail.sourceSeq;
        const fresh = reader.range(draft.sessionID, after, through).filter(conversational);
        const records = fresh.map((row) => this.record(row, this.rendered(row, draft.model)));
        if (this.dirty.has(draft.sessionID))
            this.storage.replaceRows(draft.sessionID, through, records);
        await this.storage.saveTail(
            draft.sessionID,
            JSON.stringify({
                ...tail,
                sourceSeq: Math.max(tail.sourceSeq, ...fresh.map((row) => row.seq)),
            }),
            records,
        );
        this.dirty.delete(draft.sessionID);
        this.metadata.delete(draft.sessionID);
        this.loaded.set(draft.sessionID, through);
        const snapshot: Snapshot = {
            source: this.storage.sourceID,
            sessionID: draft.sessionID,
            admissionID: id,
            summary,
        };
        await this.storage.supply(draft.sessionID, id, JSON.stringify(snapshot));
        return true;
    }
    async restore(
        sessionID: string,
        cut: StoreRow<"compaction">,
        model: string,
        options: { bounded?: boolean; after?: number } = {},
    ): Promise<V2Message[] | undefined> {
        if (!isLocalCheckpoint(cut)) return undefined;
        const resolvedModel = {
            providerID: model.slice(0, model.indexOf("/")),
            id: model.slice(model.indexOf("/") + 1),
        };
        const tail = this.tail(sessionID);
        if (tail && tail.model !== model) this.invalidate(sessionID);
        if (
            this.dirty.has(sessionID) ||
            ((this.loaded.get(sessionID) ?? -1) < cut.seq - 1 &&
                !this.storage.admission(sessionID, cut.id))
        ) {
            const reader = this.openReader(sessionID);
            try {
                const fresh = reader.range(sessionID, -1, cut.seq - 1).filter(conversational);
                const records = fresh.map((row) =>
                    this.record(row, this.rendered(row, resolvedModel)),
                );
                this.storage.replaceRows(sessionID, cut.seq - 1, records);
                await this.storage.saveTail(
                    sessionID,
                    JSON.stringify({
                        model,
                        sourceSeq: cut.seq - 1,
                        baseline: tail?.baseline ?? cut.data.summary,
                    }),
                    [],
                );
                this.metadata.set(
                    sessionID,
                    fresh.map((row) => ({ ...row, time_created: row.time_created ?? 0 })),
                );
                this.loaded.set(sessionID, cut.seq - 1);
                this.dirty.delete(sessionID);
            } finally {
                reader.close();
            }
        }
        let after = options.after ?? -1;
        if (options.bounded && options.after === undefined && !this.changed.has(sessionID)) {
            const state = getOrCreateSessionMeta(this.storage.db, sessionID);
            const max = this.storage.db
                .prepare("SELECT COALESCE(MAX(id),0) AS id FROM m0_mutation_log WHERE session_id=?")
                .get(sessionID) as { id: number };
            const boundary = (
                this.storage.db
                    .prepare(
                        "SELECT cached_m0_last_baseline_end_message_id AS id FROM session_meta WHERE session_id=?",
                    )
                    .get(sessionID) as { id: string | null } | undefined
            )?.id;
            if (max.id <= (state.cachedM0MaxMutationId ?? 0) && boundary)
                after = this.storage.sequenceForID(sessionID, boundary) ?? -1;
        }
        const messages: V2Message[] = [];
        for (const row of this.storage.rows(sessionID, after, cut.seq - 1)) {
            const revived = reviveNative(JSON.parse(row.data) as V2Message[]);
            for (const message of revived) coordinates.set(message, row.id);
            messages.push(...revived);
        }
        return messages;
    }
    async restoreRead(
        sessionID: string,
        cut: StoreRow<"compaction">,
        model: SessionContext["model"],
    ): Promise<V2Message[]> {
        const reader = this.openReader(sessionID);
        try {
            return reader
                .range(sessionID, -1, cut.seq - 1)
                .filter(conversational)
                .flatMap((row) => {
                    const messages = this.rendered(row, model);
                    for (const message of messages) coordinates.set(message, row.id);
                    return messages;
                });
        } finally {
            reader.close();
        }
    }
    sourceChanged(sessionID: string): boolean {
        return this.changed.has(sessionID);
    }
    async forget(sessionID: string): Promise<void> {
        this.sources.delete(sessionID);
        this.metadata.delete(sessionID);
        this.loaded.delete(sessionID);
        this.unavailable.delete(sessionID);
        this.dirty.delete(sessionID);
        this.changed.delete(sessionID);
        await this.storage.forget(sessionID);
    }
}
