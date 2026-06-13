/**
 * Token usage ledger and Tokens panel.
 *
 * Implements PRD §7.6 and §9.
 *
 * Distinguishes:
 *   - Provider usage ledger (exact events from OpenCode/provider)
 *   - Current context estimate (Magic Context snapshot)
 *
 * Every displayed token value must be labeled as one of:
 *   - exact (from provider usage events)
 *   - estimated (from visible messages or snapshot)
 *   - unavailable (no data)
 */

import type { SidebarSnapshot } from "../../shared/rpc-types";
import { compactTokens } from "./dense-strip";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TokenConfidence = "exact" | "estimated" | "unavailable";

export interface UsageLedgerEvent {
    id: string;
    sessionId: string;
    parentSessionId?: string | null;
    turnId?: string | null;
    assistantMessageId?: string | null;
    providerId: string;
    modelId: string;
    agentName?: string | null;
    timestamp: number;

    inputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    cacheReadInputTokens: number;
    cacheWriteInputTokens: number;

    source: "opencode_step_finish" | "provider_usage" | "estimated";
    confidence: "exact" | "estimated";
}

export interface UsageLedgerAggregate {
    inputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    cacheReadInputTokens: number;
    cacheWriteInputTokens: number;
    eventCount: number;
    confidence: TokenConfidence;
}

export interface TokensPanelRow {
    label: string;
    value: string;
    confidence: TokenConfidence;
    accent?: boolean;
    warning?: boolean;
    dim?: boolean;
}

export interface TokensPanelSection {
    heading?: string;
    rows: TokensPanelRow[];
}

export interface TokensPanelContent {
    title: string;
    sections: TokensPanelSection[];
}

// ---------------------------------------------------------------------------
// Ledger aggregation
// ---------------------------------------------------------------------------

/**
 * Aggregate usage events for a session.
 */
export function aggregateLedger(events: UsageLedgerEvent[]): UsageLedgerAggregate {
    const agg: UsageLedgerAggregate = {
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        cacheReadInputTokens: 0,
        cacheWriteInputTokens: 0,
        eventCount: events.length,
        confidence: events.length > 0 ? "exact" : "unavailable",
    };

    for (const event of events) {
        agg.inputTokens += event.inputTokens;
        agg.outputTokens += event.outputTokens;
        agg.reasoningTokens += event.reasoningTokens;
        agg.cacheReadInputTokens += event.cacheReadInputTokens;
        agg.cacheWriteInputTokens += event.cacheWriteInputTokens;
    }

    return agg;
}

// ---------------------------------------------------------------------------
// Tokens Panel
// ---------------------------------------------------------------------------

/**
 * Render Tokens panel with provider ledger and current context estimate.
 */
export function renderTokensPanel(
    snap: SidebarSnapshot,
    ledgerEvents: UsageLedgerEvent[] = [],
): TokensPanelContent {
    const sections: TokensPanelSection[] = [];

    // Provider usage ledger section
    const ledger = aggregateLedger(ledgerEvents);
    const ledgerRows: TokensPanelRow[] = [];

    if (ledger.eventCount > 0) {
        ledgerRows.push({
            label: "Input tokens",
            value: `${compactTokens(ledger.inputTokens)} (exact)`,
            confidence: "exact",
        });
        ledgerRows.push({
            label: "Output tokens",
            value: `${compactTokens(ledger.outputTokens)} (exact)`,
            confidence: "exact",
        });
        if (ledger.reasoningTokens > 0) {
            ledgerRows.push({
                label: "Reasoning tokens",
                value: `${compactTokens(ledger.reasoningTokens)} (exact)`,
                confidence: "exact",
            });
        }
        if (ledger.cacheReadInputTokens > 0) {
            ledgerRows.push({
                label: "Cache read",
                value: `${compactTokens(ledger.cacheReadInputTokens)} (exact)`,
                confidence: "exact",
            });
        }
        if (ledger.cacheWriteInputTokens > 0) {
            ledgerRows.push({
                label: "Cache write",
                value: `${compactTokens(ledger.cacheWriteInputTokens)} (exact)`,
                confidence: "exact",
            });
        }
        ledgerRows.push({
            label: "Events",
            value: String(ledger.eventCount),
            confidence: "exact",
            dim: true,
        });
    } else {
        ledgerRows.push({
            label: "Status",
            value: "No provider usage events recorded",
            confidence: "unavailable",
            dim: true,
        });
    }

    sections.push({ heading: "Provider Usage Ledger", rows: ledgerRows });

    // Current context estimate section
    const estimateRows: TokensPanelRow[] = [];
    estimateRows.push({
        label: "Input tokens",
        value: `${compactTokens(snap.inputTokens)} (estimated)`,
        confidence: "estimated",
    });
    if (snap.contextLimit > 0) {
        estimateRows.push({
            label: "Context limit",
            value: compactTokens(snap.contextLimit),
            confidence: "estimated",
        });
        estimateRows.push({
            label: "Free",
            value: compactTokens(Math.max(0, snap.contextLimit - snap.inputTokens)),
            confidence: "estimated",
        });
    }
    estimateRows.push({
        label: "Usage",
        value: `${snap.usagePercentage.toFixed(1)}%`,
        confidence: "estimated",
    });

    sections.push({ heading: "Current Context Estimate", rows: estimateRows });

    return { title: "Tokens", sections };
}
