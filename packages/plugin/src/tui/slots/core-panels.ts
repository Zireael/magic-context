/**
 * Core panel renderers for Dense sidebar.
 *
 * Panels: Details/Overview, Status/Allocation, Mode/Automation, Flush.
 *
 * Pure render model — no side effects, no React/Solid dependencies.
 */

import { formatThresholdPercent } from "../../shared/format-threshold";
import type { SidebarSnapshot } from "../../shared/rpc-types";
import { type ContextStability, compactTokens, getContextCategories } from "./dense-strip";
import { classifyRisk } from "./risk-classifier";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PanelContent {
    title: string;
    sections: PanelSection[];
}

export interface PanelSection {
    heading?: string;
    rows: PanelRow[];
}

export interface PanelRow {
    label: string;
    value: string;
    accent?: boolean;
    warning?: boolean;
    dim?: boolean;
}

// ---------------------------------------------------------------------------
// Stability glyphs for legend
// ---------------------------------------------------------------------------

const STABILITY_GLYPH: Record<ContextStability, string> = {
    cold: "█",
    warm: "▒",
    hot: "░",
};

// ---------------------------------------------------------------------------
// Details / Overview Panel
// ---------------------------------------------------------------------------

export function renderDetailsPanel(
    snap: SidebarSnapshot,
    cacheHitRate?: number | null,
): PanelContent {
    const risk = classifyRisk({
        snapshot: snap,
        cacheHitRate,
    });

    const contextLimit = snap.contextLimit || 0;
    const free = Math.max(0, contextLimit - snap.inputTokens);
    const margin = Math.max(0, (snap.executeThreshold / 100) * contextLimit - snap.inputTokens);

    const sections: PanelSection[] = [];

    // Context section
    sections.push({
        heading: "Context",
        rows: [
            { label: "Used", value: `${compactTokens(snap.inputTokens)} tokens` },
            {
                label: "Model window",
                value: contextLimit > 0 ? compactTokens(contextLimit) : "unknown",
            },
            { label: "Percent", value: `${snap.usagePercentage.toFixed(1)}%` },
            { label: "Threshold", value: `${formatThresholdPercent(snap.executeThreshold)}%` },
            { label: "Margin", value: `${compactTokens(Math.max(0, margin))} tokens` },
            { label: "Free", value: `${compactTokens(free)} tokens`, accent: free > 0 },
        ],
    });

    // State section
    sections.push({
        heading: "State",
        rows: [
            {
                label: "Historian",
                value: snap.historianRunning ? "running ⟳" : "idle",
                warning: snap.historianRunning,
            },
            {
                label: "Queue",
                value: snap.pendingOpsCount > 0 ? `${snap.pendingOpsCount} pending` : "empty",
                warning: snap.pendingOpsCount > 0,
            },
            {
                label: "Mode",
                value: risk.healthy ? "OK" : "degraded",
                accent: risk.healthy,
                warning: !risk.healthy,
            },
        ],
    });

    // Cache summary (placeholder — full cache panel is separate)
    sections.push({
        heading: "Cache",
        rows: [
            {
                label: "Hit rate",
                value: cacheHitRate != null ? `${(cacheHitRate * 100).toFixed(1)}%` : "unavailable",
                dim: cacheHitRate == null,
            },
        ],
    });

    // Memory summary
    sections.push({
        heading: "Memory",
        rows: [
            { label: "Memories", value: String(snap.memoryCount), accent: true },
            { label: "Smart notes", value: String(snap.readySmartNoteCount) },
        ],
    });

    // Risk
    sections.push({
        heading: "Risk",
        rows: [
            {
                label: "Primary",
                value: risk.primaryRisk || "none",
                warning: !!risk.primaryRisk,
            },
            {
                label: "Secondary",
                value: risk.secondaryRisk || "none",
                dim: !risk.secondaryRisk,
            },
        ],
    });

    // Suggestion
    const suggestion = getSuggestion(snap, risk);
    sections.push({
        heading: "Suggestion",
        rows: [{ label: "Action", value: suggestion }],
    });

    return { title: "Details / Overview", sections };
}

// ---------------------------------------------------------------------------
// Status / Allocation Panel
// ---------------------------------------------------------------------------

export function renderStatusPanel(snap: SidebarSnapshot): PanelContent {
    const categories = getContextCategories(snap);
    const total = snap.contextLimit || snap.inputTokens || 1;

    // Add free space
    const freeTokens = Math.max(0, (snap.contextLimit || 0) - snap.inputTokens);

    const sections: PanelSection[] = [];

    // Context allocation rows
    const allocRows: PanelRow[] = [];
    for (const cat of categories) {
        const pct = ((cat.tokens / total) * 100).toFixed(1);
        allocRows.push({
            label: `${STABILITY_GLYPH[cat.stability]} ${cat.label}`,
            value: `${compactTokens(cat.tokens)} (${pct}%)`,
        });
    }
    // Free row
    if (freeTokens > 0 && snap.contextLimit > 0) {
        const freePct = ((freeTokens / total) * 100).toFixed(1);
        allocRows.push({
            label: `░ Free`,
            value: `${compactTokens(freeTokens)} (${freePct}%)`,
            dim: true,
        });
    }

    if (allocRows.length > 0) {
        sections.push({ heading: "Context Allocation", rows: allocRows });
    }

    // Legend
    sections.push({
        heading: "Legend",
        rows: [
            { label: "█ cold/stable", value: "System, Tool Defs, Memories, Profile" },
            { label: "▒ warm/movable", value: "Compartments, Conversation, Docs" },
            { label: "░ hot/volatile", value: "Tool Calls, Free" },
            { label: "| threshold", value: "Compaction trigger point" },
            { label: "> overflow", value: "Beyond hard context limit" },
        ],
    });

    return { title: "Status / Allocation", sections };
}

// ---------------------------------------------------------------------------
// Mode / Automation Panel
// ---------------------------------------------------------------------------

export interface ModeOption {
    id: string;
    label: string;
    description: string;
    active: boolean;
}

export function renderModePanel(displayMode: string): PanelContent {
    const sections: PanelSection[] = [];

    // Operating modes (placeholder — no backend yet)
    sections.push({
        heading: "Operating Mode",
        rows: [
            { label: "Auto", value: "default", accent: true },
            { label: "Conserve", value: "reduce context aggressively" },
            { label: "Aggressive", value: "maximize context usage" },
            { label: "Observe", value: "no auto-actions" },
        ],
    });

    // Display mode controls
    const modes: Array<{ label: string; active: boolean }> = [
        { label: "Classic", active: displayMode === "classic_collapsed" },
        { label: "Dense", active: displayMode === "dense_collapsed" },
        { label: "Expanded", active: displayMode === "expanded" },
    ];

    sections.push({
        heading: "Display Mode",
        rows: modes.map((m) => ({
            label: m.label,
            value: m.active ? "●" : "○",
            accent: m.active,
        })),
    });

    // Reset option
    sections.push({
        rows: [{ label: "Reset to default", value: "clears user override" }],
    });

    return { title: "Mode / Automation", sections };
}

// ---------------------------------------------------------------------------
// Memory / Maintenance Panel
// ---------------------------------------------------------------------------

function relativeTime(ms: number): string {
    const diff = Date.now() - ms;
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function renderMemoryPanel(snap: SidebarSnapshot): PanelContent {
    const sections: PanelSection[] = [];

    // Memories section
    const memRows: PanelRow[] = [];
    if (snap.memoryCount > 0) {
        memRows.push({ label: "Memories", value: String(snap.memoryCount), accent: true });
    }
    if (snap.memoryTokens > 0) {
        memRows.push({ label: "Memory tokens", value: compactTokens(snap.memoryTokens) });
    }
    if (snap.readySmartNoteCount > 0) {
        memRows.push({ label: "Smart notes", value: `${snap.readySmartNoteCount} ready`, accent: true });
    }
    if (snap.profileTokens > 0) {
        memRows.push({ label: "User profile", value: compactTokens(snap.profileTokens) });
    }
    if (snap.compartmentCount > 0) {
        memRows.push({ label: "Compartments", value: String(snap.compartmentCount) });
    }

    if (memRows.length > 0) {
        sections.push({ heading: "Memory", rows: memRows });
    } else {
        sections.push({
            heading: "Memory",
            rows: [{ label: "Status", value: "No memories yet", dim: true }],
        });
    }

    // Dreamer section
    const dreamerRows: PanelRow[] = [];
    if (snap.lastDreamerRunAt) {
        dreamerRows.push({
            label: "Last run",
            value: relativeTime(snap.lastDreamerRunAt),
        });
        // Check if stale (>1 hour)
        const age = Date.now() - snap.lastDreamerRunAt;
        if (age > 60 * 60 * 1000) {
            dreamerRows.push({
                label: "Status",
                value: "stale",
                warning: true,
            });
        }
    } else {
        dreamerRows.push({
            label: "Last run",
            value: "never",
            dim: true,
        });
    }
    sections.push({ heading: "Dreamer", rows: dreamerRows });

    // Historian section
    const histRows: PanelRow[] = [];
    if (snap.historianRunning) {
        histRows.push({
            label: "State",
            value: "running ⟳",
            warning: true,
        });
    } else if (snap.recompProgress?.phase === "failed") {
        histRows.push({
            label: "State",
            value: "failed",
            warning: true,
        });
    } else {
        histRows.push({
            label: "State",
            value: "idle",
        });
    }
    if (snap.pendingOpsCount > 0) {
        histRows.push({
            label: "Pending drops",
            value: String(snap.pendingOpsCount),
            warning: true,
        });
    }
    sections.push({ heading: "Historian", rows: histRows });

    return { title: "Memory / Maintenance", sections };
}

// ---------------------------------------------------------------------------
// Flush Panel
// ---------------------------------------------------------------------------

export function renderFlushPanel(snap: SidebarSnapshot): PanelContent {
    const sections: PanelSection[] = [];

    if (snap.pendingOpsCount === 0) {
        sections.push({
            rows: [{ label: "Status", value: "No pending operations", accent: true }],
        });
    } else {
        sections.push({
            heading: "Pending Operations",
            rows: [
                {
                    label: "Count",
                    value: `${snap.pendingOpsCount} pending`,
                    warning: true,
                },
                {
                    label: "Action",
                    value: "Flush will process pending operations",
                },
            ],
        });
    }

    return { title: "Flush", sections };
}

// ---------------------------------------------------------------------------
// Suggestion helper
// ---------------------------------------------------------------------------

function getSuggestion(snap: SidebarSnapshot, risk: ReturnType<typeof classifyRisk>): string {
    if (risk.flags.includes("OVERFLOW")) {
        return "Context overflowed — run /ctx-reduce or switch model";
    }
    if (risk.flags.includes("T!") && snap.usagePercentage >= 95) {
        return "Critical pressure — run /ctx-reduce immediately";
    }
    if (risk.flags.includes("T!")) {
        return "High usage — consider /ctx-reduce";
    }
    if (snap.historianRunning) {
        return "Historian running — wait for completion";
    }
    if (snap.pendingOpsCount > 0) {
        return "Pending operations — flush or wait";
    }
    return "All clear — no action needed";
}
