import type { Database } from "../../shared/sqlite";
import { ensureSessionMetaRow } from "./storage-meta-shared";

// Versioned exact-byte decisions share the session's additive replay ledger.
// Empty strings are decisions too: a later neighbour must not create a marker.
const PREFIX = "temporal-message-v1:";

export function encodeTemporalDecision(messageId: string, marker: string): string {
    return PREFIX + JSON.stringify([messageId, marker]);
}

export function decodeTemporalDecision(entry: string): [string, string] | null {
    if (!entry.startsWith(PREFIX)) return null;
    try {
        const pair: unknown = JSON.parse(entry.slice(PREFIX.length));
        if (
            Array.isArray(pair) &&
            pair.length === 2 &&
            typeof pair[0] === "string" &&
            pair[0] &&
            typeof pair[1] === "string"
        )
            return [pair[0], pair[1]];
    } catch {
        /* Invalid entries are not rendering instructions. */
    }
    return null;
}

function readLedger(db: Database, sessionId: string): string[] {
    const row = db
        .prepare(
            "SELECT merged_reasoning_stripped_ids AS entries FROM session_meta WHERE session_id = ?",
        )
        .get(sessionId) as { entries: string | null } | undefined;
    if (!row?.entries) return [];
    const entries: unknown = JSON.parse(row.entries);
    if (!Array.isArray(entries) || !entries.every((entry) => typeof entry === "string"))
        throw new Error("Invalid temporal replay ledger");
    return entries;
}

function decisions(entries: string[]): Map<string, string> {
    const result = new Map<string, string>();
    for (const entry of entries) {
        const pair = decodeTemporalDecision(entry);
        if (pair && !result.has(pair[0])) result.set(...pair);
    }
    return result;
}

export function getTemporalDecisions(db: Database, sessionId: string): Map<string, string> {
    return decisions(readLedger(db, sessionId));
}

/** First writer wins by message identity. Never change served bytes before commit. */
export function freezeTemporalDecisions(
    db: Database,
    sessionId: string,
    candidates: ReadonlyMap<string, string>,
): Map<string, string> {
    if (candidates.size === 0) return getTemporalDecisions(db, sessionId);
    ensureSessionMetaRow(db, sessionId);
    return db
        .transaction(() => {
            const ledger = readLedger(db, sessionId);
            const frozen = decisions(ledger);
            let changed = false;
            for (const [id, marker] of candidates) {
                if (frozen.has(id)) continue;
                ledger.push(encodeTemporalDecision(id, marker));
                frozen.set(id, marker);
                changed = true;
            }
            if (changed)
                db.prepare(
                    "UPDATE session_meta SET merged_reasoning_stripped_ids = ? WHERE session_id = ?",
                ).run(JSON.stringify(ledger), sessionId);
            return frozen;
        })
        .immediate();
}
