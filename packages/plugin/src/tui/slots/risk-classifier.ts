/**
 * Risk/Process classifier for Dense sidebar.
 *
 * Derives state from SidebarSnapshot and optional cache telemetry.
 * Drives Dense top-row chips and flags.
 *
 * Risk flags (from PRD §6.2):
 *   T!       token/context pressure
 *   C!       cache degraded/repeated busts
 *   Q!       queue stuck/growing
 *   HIST↻    Historian running (normal, not error)
 *   H!       Historian failed/stalled/no meaningful reclaim
 *   H?       Historian stale/uncertain
 *   D?       Dreamer stale
 *   M!       memory bloat
 *   COLD>CTX cold/stable context exceeds usable window
 *
 * Priority order (from PR #93):
 *   1. critical faults (H!, T! overflow, C!)
 *   2. active Historian/compartment work (HIST↻)
 *   3. pending queue/flushable work (Qn)
 *   4. very recent Dreamer work
 *   5. ready notes/smart notes
 *   6. static memory/fact/compartment counts
 */

import type { SidebarSnapshot } from "../../shared/rpc-types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RiskFlag =
    | "T!" // token/context pressure
    | "C!" // cache degraded/repeated busts
    | "Q!" // queue stuck/growing
    | "H!" // Historian failed/stalled
    | "H?" // Historian stale/uncertain
    | "D?" // Dreamer stale
    | "M!" // memory bloat
    | "COLD>CTX" // cold context exceeds usable window
    | "OVERFLOW"; // context overflowed

export type ProcessChip =
    | "HIST↻" // Historian running
    | "Q{n}" // Pending queue with count
    | "DREAM↻" // Dreamer running (not used in current snapshot)
    | "COMPROT" // Compartment rebuild in progress
    | ""; // no process active

export interface RiskClassifierInput {
    snapshot: SidebarSnapshot;
    /** Cache hit rate (0-1) if available. null = unavailable */
    cacheHitRate?: number | null;
    /** Number of repeated cache busts in recent window */
    cacheBustCount?: number;
    /** Whether Dreamer is currently running (not available in snapshot) */
    dreamerRunning?: boolean;
    /** Dreamer last run timestamp */
    dreamerLastRunAt?: number | null;
    /** Memory count for bloat detection */
    memoryCount?: number;
    /** Compartment count for cold context detection */
    compartmentCount?: number;
}

export interface RiskClassifierResult {
    /** Ordered risk flags (highest priority first) */
    flags: RiskFlag[];
    /** Active process chip (empty string if none) */
    processChip: ProcessChip;
    /** Human-readable summary for Details panel */
    summary: string;
    /** Whether the state is healthy */
    healthy: boolean;
    /** Primary risk reason */
    primaryRisk: string;
    /** Secondary risk reason */
    secondaryRisk: string;
}

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

const TOKEN_PRESSURE_THRESHOLD = 80;
const TOKEN_CRITICAL_THRESHOLD = 95;
const CACHE_BUST_THRESHOLD = 3;
const DREAMER_STALE_MS = 60 * 60 * 1000; // 1 hour
const MEMORY_BLOAT_THRESHOLD = 50; // arbitrary, needs tuning

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------

export function classifyRisk(input: RiskClassifierInput): RiskClassifierResult {
    const { snapshot } = input;
    const flags: RiskFlag[] = [];
    let processChip: ProcessChip = "";
    let healthy = true;
    let primaryRisk = "";
    let secondaryRisk = "";

    // --- Process chips (active operations) ---

    // Historian running (normal, not error)
    if (snapshot.historianRunning || snapshot.compartmentInProgress) {
        processChip = "HIST↻";
    }

    // Pending queue
    if (snapshot.pendingOpsCount > 0 && processChip === "") {
        processChip = `Q${snapshot.pendingOpsCount}` as ProcessChip;
    }

    // --- Risk flags ---

    // Token pressure / overflow
    if (snapshot.usagePercentage > 100) {
        flags.push("OVERFLOW");
        flags.push("T!");
        primaryRisk = "Context overflowed hard limit";
        healthy = false;
    } else if (snapshot.usagePercentage >= TOKEN_CRITICAL_THRESHOLD) {
        flags.push("T!");
        primaryRisk = `Context at ${snapshot.usagePercentage.toFixed(0)}% — critical`;
        healthy = false;
    } else if (snapshot.usagePercentage >= TOKEN_PRESSURE_THRESHOLD) {
        flags.push("T!");
        primaryRisk = `Context at ${snapshot.usagePercentage.toFixed(0)}% — approaching limit`;
        healthy = false;
    }

    // Cache degraded / repeated busts
    if (input.cacheBustCount != null && input.cacheBustCount >= CACHE_BUST_THRESHOLD) {
        flags.push("C!");
        if (!primaryRisk) {
            primaryRisk = `${input.cacheBustCount} cache busts detected`;
        } else {
            secondaryRisk = `${input.cacheBustCount} cache busts detected`;
        }
        healthy = false;
    }

    // Queue stuck (pending ops > 0 for extended time — not enough data to detect, skip)

    // Historian failed/stalled
    if (snapshot.recompProgress?.phase === "failed") {
        flags.push("H!");
        if (!primaryRisk) {
            primaryRisk = "Historian failed";
        } else if (!secondaryRisk) {
            secondaryRisk = "Historian failed";
        }
        healthy = false;
    }

    // Dreamer stale
    if (input.dreamerLastRunAt != null) {
        const dreamerAge = Date.now() - input.dreamerLastRunAt;
        if (dreamerAge > DREAMER_STALE_MS) {
            flags.push("D?");
            if (!secondaryRisk) {
                secondaryRisk = `Dreamer stale (${Math.floor(dreamerAge / 3600_000)}h)`;
            }
        }
    }

    // Memory bloat
    const memCount = input.memoryCount ?? snapshot.memoryCount;
    if (memCount > MEMORY_BLOAT_THRESHOLD) {
        flags.push("M!");
        if (!secondaryRisk) {
            secondaryRisk = `Memory bloat (${memCount} memories)`;
        }
    }

    // Cold context exceeds usable window
    if (snapshot.contextLimit > 0 && snapshot.usagePercentage < 20) {
        // Cold context is fine, no COLD>CTX
    }

    // --- Summary ---

    let summary = "";
    if (healthy) {
        if (processChip) {
            summary = processChip;
        } else {
            summary = "OK";
        }
    } else {
        const parts: string[] = [];
        if (primaryRisk) parts.push(primaryRisk);
        if (secondaryRisk) parts.push(secondaryRisk);
        summary = parts.join(" · ") || "Degraded";
    }

    return {
        flags,
        processChip,
        summary,
        healthy,
        primaryRisk,
        secondaryRisk,
    };
}

// ---------------------------------------------------------------------------
// Convenience: build top-row text from classifier result
// ---------------------------------------------------------------------------

export function buildTopRowFromRisk(result: RiskClassifierResult, capacity: string): string {
    const parts: string[] = [capacity];

    if (result.processChip) {
        parts.push(result.processChip);
    }

    if (result.flags.length > 0) {
        parts.push(result.flags.join(" "));
    } else if (result.processChip === "") {
        // No process chip and no flags — healthy state
        parts.push("OK");
    }

    return parts.join(" · ");
}
