/**
 * Dense Collapsed Strip renderer.
 *
 * Renders the PRD instrument strip:
 *   180K · HIST↻ · Q3
 *   ████▒▒|░░      61%
 *   [D] [S] [A] [F]3
 *
 * Pure render model — no side effects, no React/Solid dependencies.
 */

import type { SidebarSnapshot } from "../../shared/rpc-types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ContextStability = "cold" | "warm" | "hot";

export interface ContextCategory {
    key: string;
    tokens: number;
    stability: ContextStability;
    label: string;
}

export interface DenseStripSnapshot {
    inputTokens: number;
    contextLimit: number;
    usagePercentage: number;
    executeThreshold: number;
    historianRunning: boolean;
    compartmentInProgress: boolean;
    pendingOpsCount: number;
    recompProgress?: SidebarSnapshot["recompProgress"];
    systemPromptTokens: number;
    docsTokens: number;
    compartmentTokens: number;
    factTokens: number;
    memoryTokens: number;
    profileTokens: number;
    conversationTokens: number;
    toolCallTokens: number;
    toolDefinitionTokens: number;
}

export interface DenseStripState {
    topRow: string;
    barRow: string;
    actionRow: string;
}

// ---------------------------------------------------------------------------
// Stability classification
// ---------------------------------------------------------------------------

export const CATEGORY_STABILITY: Record<string, ContextStability> = {
    system: "cold",
    toolDefs: "cold",
    docs: "warm", // Docs can be cold or warm; default to warm for display
    compartments: "warm",
    memories: "cold",
    profile: "cold",
    conversation: "warm",
    toolCalls: "hot",
};

export function getContextCategories(snap: DenseStripSnapshot): ContextCategory[] {
    const categories: ContextCategory[] = [];

    if (snap.systemPromptTokens > 0) {
        categories.push({
            key: "system",
            tokens: snap.systemPromptTokens,
            stability: CATEGORY_STABILITY.system,
            label: "System",
        });
    }
    if (snap.toolDefinitionTokens > 0) {
        categories.push({
            key: "toolDefs",
            tokens: snap.toolDefinitionTokens,
            stability: CATEGORY_STABILITY.toolDefs,
            label: "Tool Defs",
        });
    }
    if (snap.docsTokens > 0) {
        categories.push({
            key: "docs",
            tokens: snap.docsTokens,
            stability: CATEGORY_STABILITY.docs,
            label: "Docs",
        });
    }
    if (snap.compartmentTokens > 0) {
        categories.push({
            key: "compartments",
            tokens: snap.compartmentTokens,
            stability: CATEGORY_STABILITY.compartments,
            label: "Compartments",
        });
    }
    if (snap.memoryTokens > 0) {
        categories.push({
            key: "memories",
            tokens: snap.memoryTokens,
            stability: CATEGORY_STABILITY.memories,
            label: "Memories",
        });
    }
    if (snap.profileTokens > 0) {
        categories.push({
            key: "profile",
            tokens: snap.profileTokens,
            stability: CATEGORY_STABILITY.profile,
            label: "Profile",
        });
    }
    if (snap.conversationTokens > 0) {
        categories.push({
            key: "conversation",
            tokens: snap.conversationTokens,
            stability: CATEGORY_STABILITY.conversation,
            label: "Conversation",
        });
    }
    if (snap.toolCallTokens > 0) {
        categories.push({
            key: "toolCalls",
            tokens: snap.toolCallTokens,
            stability: CATEGORY_STABILITY.toolCalls,
            label: "Tool Calls",
        });
    }

    return categories;
}

// ---------------------------------------------------------------------------
// Token formatting
// ---------------------------------------------------------------------------

export function compactTokens(value: number): string {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${Math.floor(value / 1_000)}K`;
    return String(value);
}

// ---------------------------------------------------------------------------
// Top row
// ---------------------------------------------------------------------------

function buildTopRow(snap: DenseStripSnapshot): string {
    const capacity = compactTokens(snap.contextLimit || snap.inputTokens);
    const parts: string[] = [capacity];

    // Historian state
    if (snap.historianRunning || snap.compartmentInProgress) {
        parts.push("HIST↻");
    }

    // Pending queue
    if (snap.pendingOpsCount > 0) {
        parts.push(`Q${snap.pendingOpsCount}`);
    }

    // Overflow or free headroom
    if (snap.usagePercentage > 100) {
        parts.push("OVERFLOW");
    } else if (snap.contextLimit > 0) {
        const free = snap.contextLimit - snap.inputTokens;
        if (free > 0) {
            parts.push(`${compactTokens(free)} free`);
        } else {
            parts.push("OVERFLOW");
        }
    }

    // Risk flags (appended at end)
    const flags: string[] = [];
    if (snap.usagePercentage >= 80) {
        flags.push("T!");
    }
    if (flags.length > 0) {
        parts.push(flags.join(" "));
    }

    return parts.join(" · ");
}

// ---------------------------------------------------------------------------
// Context bar
// ---------------------------------------------------------------------------

const STABILITY_GLYPH: Record<ContextStability, string> = {
    cold: "█",
    warm: "▒",
    hot: "░",
};

function buildBarRow(snap: DenseStripSnapshot): string {
    const categories = getContextCategories(snap);
    if (categories.length === 0) return "";

    const total = snap.contextLimit || snap.inputTokens || 1;
    const barWidth = 12; // Fixed bar width for consistent layout

    // Calculate segment widths proportional to token counts
    const freeTokens = Math.max(0, (snap.contextLimit || 0) - snap.inputTokens);

    // Build bar segments
    let bar = "";
    for (const cat of categories) {
        const fraction = cat.tokens / total;
        const width = Math.max(1, Math.round(fraction * barWidth));
        bar += STABILITY_GLYPH[cat.stability].repeat(width);
    }

    // Add free segment if there's headroom
    if (freeTokens > 0 && snap.contextLimit > 0) {
        const freeFraction = freeTokens / total;
        const freeWidth = Math.max(0, Math.round(freeFraction * barWidth));
        if (freeWidth > 0) {
            bar += "░".repeat(freeWidth);
        }
    }

    // Trim to barWidth
    bar = bar.slice(0, barWidth);

    // Add threshold marker if usage exceeds threshold
    if (snap.usagePercentage >= snap.executeThreshold && bar.length > 0) {
        const thresholdPos = Math.min(
            Math.round((snap.executeThreshold / 100) * barWidth),
            bar.length - 1,
        );
        bar = `${bar.slice(0, thresholdPos)}|${bar.slice(thresholdPos + 1)}`;
    }

    // Add overflow marker if over 100%
    if (snap.usagePercentage > 100 && bar.length > 0) {
        bar = `${bar.slice(0, -1)}>`;
    }

    // Pad to fixed width and add percentage suffix
    const paddedBar = bar.padEnd(barWidth);
    const pct = snap.usagePercentage.toFixed(0);
    return `${paddedBar} ${pct}%`;
}

// ---------------------------------------------------------------------------
// Action row
// ---------------------------------------------------------------------------

function buildActionRow(snap: DenseStripSnapshot): string {
    const actions = ["[D]", "[S]", "[A]"];

    // [F]n only appears when pending ops exist
    if (snap.pendingOpsCount > 0) {
        actions.push(`[F]${snap.pendingOpsCount}`);
    }

    return actions.join(" ");
}

// ---------------------------------------------------------------------------
// Main renderer
// ---------------------------------------------------------------------------

export function renderDenseStrip(snap: DenseStripSnapshot): DenseStripState {
    return {
        topRow: buildTopRow(snap),
        barRow: buildBarRow(snap),
        actionRow: buildActionRow(snap),
    };
}

// ---------------------------------------------------------------------------
// Snapshot adapter — converts SidebarSnapshot to DenseStripSnapshot
// ---------------------------------------------------------------------------

export function toDenseStripSnapshot(snap: SidebarSnapshot): DenseStripSnapshot {
    return {
        inputTokens: snap.inputTokens,
        contextLimit: snap.contextLimit,
        usagePercentage: snap.usagePercentage,
        executeThreshold: snap.executeThreshold,
        historianRunning: snap.historianRunning,
        compartmentInProgress: snap.compartmentInProgress,
        pendingOpsCount: snap.pendingOpsCount,
        recompProgress: snap.recompProgress,
        systemPromptTokens: snap.systemPromptTokens,
        docsTokens: snap.docsTokens,
        compartmentTokens: snap.compartmentTokens,
        factTokens: snap.factTokens,
        memoryTokens: snap.memoryTokens,
        profileTokens: snap.profileTokens,
        conversationTokens: snap.conversationTokens,
        toolCallTokens: snap.toolCallTokens,
        toolDefinitionTokens: snap.toolDefinitionTokens,
    };
}
