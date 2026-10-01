/**
 * Host-neutral presentation model for the persistent Magic Context sidebar.
 *
 * Source of truth for WHICH semantic elements the sidebar shows, their order,
 * labels, token-category identity/colors, warning ordering, and
 * compact-vs-expanded content (IMPL-008 / ADR-MC-001 / REQ-MC2-001..003).
 * Host renderers receive a fully resolved {@link MagicContextSidebarView} and
 * only draw it: state acquisition/refresh and drawing stay host-local, while
 * everything a user can read is decided here so OpenCode and Pi/OMP cannot
 * drift.
 *
 * Shared-plugin module: no OpenTUI/Solid/Pi/Atelier imports (same rule as
 * status-view.ts).
 */
import packageJson from "../../package.json";
import { formatThresholdPercent } from "./format-threshold";
import type { SidebarSnapshot } from "./rpc-types";
import { STATUS_CATEGORY_COLORS } from "./status-view";
import { renderUserFacingFailure } from "./user-facing-codes";

/** Tone of one sidebar line; the host renderer maps it to theme colors. */
export type SidebarTone = "text" | "muted" | "accent" | "warning" | "error" | "success";

/**
 * One label/value line. `bold` preserves the pre-refactor split between
 * bold-value StatRow lines and the plain (non-bold) compact summary rows.
 */
export interface SidebarViewRow {
    readonly label: string;
    readonly value: string;
    readonly tone: SidebarTone;
    readonly bold: boolean;
}

/**
 * Persistent failure, host limitation, or live-task warning. All warnings draw
 * above every other element in this exact order: transform error, host
 * limitations, Dreamer progress.
 */
export interface SidebarViewWarning {
    readonly text: string;
    readonly tone: "error" | "warning";
}

/**
 * Context-pressure line. `primary` draws bold, `detail` continues the same
 * text after the bold run (threshold suffix / clamp marker), `right` is the
 * absolute input/limit token pair.
 */
export interface SidebarPressureRow {
    readonly primary: string;
    readonly detail: string;
    readonly right: string;
    readonly tone: SidebarTone;
}

export interface SidebarTokenLegendEntry {
    readonly key: string;
    readonly label: string;
    readonly color: string;
    /** Compact token count, e.g. "68K". */
    readonly valueText: string;
    /** Integer percent of the legend total, without the "%" sign. */
    readonly percentText: string;
}

export interface SidebarTokenSegment {
    readonly key: string;
    readonly color: string;
    /** flexGrow weight: Math.max(1, tokens), matching the pre-refactor bar. */
    readonly weight: number;
}

export interface SidebarTokenBar {
    /** Zero-token categories pruned so they claim no width. */
    readonly segments: readonly SidebarTokenSegment[];
    /** Canonical full legend — Conversation stays listed at zero tokens. */
    readonly legend: readonly SidebarTokenLegendEntry[];
}

/** Pressure bar + hygiene, grouped in the same block as before the refactor. */
export interface SidebarOverview {
    readonly pressure?: SidebarPressureRow;
    readonly tokenBar: SidebarTokenBar;
    readonly hygiene?: SidebarViewRow;
}

/**
 * Live recomp/upgrade progress. Wording is owned here: verb, phase label,
 * determinate bar, transient note, progress rows, and the terminal reason.
 */
export interface SidebarRecompStatus {
    readonly verb: string;
    readonly statusText: string;
    readonly statusTone: SidebarTone;
    /** Present only during the determinate rebuild phase with a known range. */
    readonly bar?: { readonly barText: string; readonly percentText: string };
    readonly note?: string;
    readonly rows: readonly SidebarViewRow[];
    /** Terminal failure/skip reason; drawn on its own line while visible. */
    readonly message?: string;
}

export interface SidebarSectionHeader {
    readonly title: string;
    /** Present only for the Historian header (live activity right-aligned). */
    readonly status?: { readonly text: string; readonly tone: SidebarTone };
}

export interface SidebarSection {
    readonly header: SidebarSectionHeader;
    readonly rows: readonly SidebarViewRow[];
    readonly recomp?: SidebarRecompStatus;
}

export interface SidebarCollapsedSummary {
    readonly rows: readonly SidebarViewRow[];
    readonly recomp?: SidebarRecompStatus;
}

/**
 * Fully resolved persistent-sidebar semantics for one paint. Optional
 * sections are absent when their pref gate (or a value gate) fails;
 * `collapsedSummary` exists exactly when the panel is collapsed, the five
 * named sections exactly when it is expanded — renderers draw whichever arm
 * is present and never re-derive content from the snapshot.
 */
export interface MagicContextSidebarView {
    readonly header: { readonly glyph: string; readonly label: string; readonly version: string };
    readonly warnings: readonly SidebarViewWarning[];
    readonly overview?: SidebarOverview;
    readonly collapsedSummary?: SidebarCollapsedSummary;
    readonly historian?: SidebarSection;
    readonly memory?: SidebarSection;
    readonly status?: SidebarSection;
    readonly dreamer?: SidebarSection;
    readonly stats?: SidebarSection;
}

export interface BuildSidebarViewOptions {
    readonly collapsed: boolean;
    readonly sections: {
        readonly historian: boolean;
        readonly memory: boolean;
        readonly status: boolean;
        readonly dreamer: boolean;
        readonly stats: boolean;
    };
    readonly headerLabel: string;
    /** Fixed clock for deterministic fixtures; defaults to Date.now(). */
    readonly now?: number;
}

export interface CompactionOffSidebarRow {
    label: "Memories" | "Notes" | "Archived compartments";
    value: string;
}

/**
 * Formats context pressure from the current wire input and the model context
 * limit. It deliberately does not use the stored Magic Context threshold
 * percentage, because native compaction acts on the model window instead.
 */
export function nativeCompactionContextLabel(snapshot: SidebarSnapshot): string {
    if (snapshot.contextLimit <= 0) return "Context: unknown · native compaction";
    const percentage = (snapshot.inputTokens / snapshot.contextLimit) * 100;
    return `Context: ${percentage.toFixed(1)}% · native compaction`;
}

export function compactionOffSidebarRows(snapshot: SidebarSnapshot): CompactionOffSidebarRow[] {
    const rows: CompactionOffSidebarRow[] = [
        { label: "Memories", value: String(snapshot.memoryCount) },
        { label: "Notes", value: String(snapshot.sessionNoteCount) },
    ];
    const archivedCount = snapshot.archivedCompartmentCount ?? 0;
    if (archivedCount > 0) {
        rows.push({ label: "Archived compartments", value: String(archivedCount) });
    }
    return rows;
}

/** Sidebar form of a token count: 1_048_576 → "1.0M", 68_400 → "68K", 522 → "522". */
export function compactSidebarTokens(value: number): string {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
    // Token counts are whole numbers to the reader even when the tokenizer
    // calibration leaves them fractional; a raw `522.4` beside a `63K` reads as
    // a measurement error rather than as precision.
    return String(Math.round(value));
}

/**
 * Sidebar form of the tail-hygiene reading: the reclaimable share and the
 * two masses it is computed from, in the same compact token unit as the
 * breakdown rows so the value fits beside its label at sidebar width. The
 * long, unit-spelled form stays in the status dialog.
 */
export function sidebarHygieneValue(status: { severity: number; u: number; t: number }): string {
    return `${(status.severity * 100).toFixed(1)}% · ${compactSidebarTokens(status.u)}/${compactSidebarTokens(status.t)}`;
}

/** "just now" / "5m ago" / "3h ago" / "2d ago", relative to `now`. */
export function sidebarRelativeTime(ms: number, now: number): string {
    const diff = now - ms;
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
}

/** Text progress bar, e.g. [██████░░░░] for the recomp/upgrade live indicator. */
export function formatSidebarProgressBar(fraction: number, width = 14): string {
    const clamped = Math.max(0, Math.min(1, fraction));
    const filled = Math.round(clamped * width);
    return `[${"█".repeat(filled)}${"░".repeat(width - filled)}]`;
}

/**
 * Canonical persistent-sidebar token categories: the single source of truth
 * for order, keys, display labels, and colors (shared with the /ctx-status
 * status view through STATUS_CATEGORY_COLORS). `includeWhenZero` marks the
 * Conversation row, which stays in the legend even at zero tokens because the
 * calibrator can round it away — suppressing it made the legend read truncated.
 */
export interface SidebarTokenCategory {
    readonly key: string;
    readonly label: string;
    readonly color: string;
    readonly tokens: (snapshot: SidebarSnapshot) => number;
    readonly includeWhenZero?: boolean;
}

export const SIDEBAR_TOKEN_CATEGORIES: readonly SidebarTokenCategory[] = [
    {
        key: "sys",
        label: "System",
        color: STATUS_CATEGORY_COLORS.system,
        tokens: (s) => s.systemPromptTokens,
    },
    { key: "docs", label: "Docs", color: STATUS_CATEGORY_COLORS.docs, tokens: (s) => s.docsTokens },
    {
        key: "comp",
        label: "Compartments",
        color: STATUS_CATEGORY_COLORS.compartments,
        tokens: (s) => s.compartmentTokens,
    },
    {
        key: "fact",
        label: "Facts",
        color: STATUS_CATEGORY_COLORS.facts,
        tokens: (s) => s.factTokens,
    },
    {
        key: "mem",
        label: "Memories",
        color: STATUS_CATEGORY_COLORS.memories,
        tokens: (s) => s.memoryTokens,
    },
    {
        key: "profile",
        label: "User Profile",
        color: STATUS_CATEGORY_COLORS.profile,
        tokens: (s) => s.profileTokens,
    },
    {
        key: "conv",
        label: "Conversation",
        color: STATUS_CATEGORY_COLORS.conversation,
        tokens: (s) => s.conversationTokens,
        includeWhenZero: true,
    },
    {
        key: "tool-calls",
        label: "Tool Calls",
        color: STATUS_CATEGORY_COLORS.toolCalls,
        tokens: (s) => s.toolCallTokens,
    },
    {
        key: "tool-defs",
        label: "Tool Defs",
        color: STATUS_CATEGORY_COLORS.toolDefs,
        tokens: (s) => s.toolDefinitionTokens,
    },
];

function pressureRow(
    snapshot: SidebarSnapshot,
    compactionOff: boolean,
): SidebarPressureRow | undefined {
    if ((snapshot.contextLimit ?? 0) <= 0) return undefined;
    const tone: SidebarTone = compactionOff
        ? "accent"
        : snapshot.usagePercentage >= 80
          ? "error"
          : snapshot.usagePercentage >= 65
            ? "warning"
            : "accent";
    const right = `${compactSidebarTokens(snapshot.inputTokens)} / ${compactSidebarTokens(snapshot.contextLimit)}`;
    if (compactionOff)
        return { primary: nativeCompactionContextLabel(snapshot), detail: "", right, tone };
    return {
        primary: `${snapshot.usagePercentage.toFixed(1)}%`,
        detail: ` / ${formatThresholdPercent(snapshot.executeThreshold)}%${snapshot.executeThresholdClamped ? "*" : ""}`,
        right,
        tone,
    };
}

function buildTokenBar(snapshot: SidebarSnapshot): SidebarTokenBar {
    const total = snapshot.inputTokens || 1;
    const present = SIDEBAR_TOKEN_CATEGORIES.map((category) => ({
        category,
        tokens: category.tokens(snapshot),
    })).filter(({ category, tokens }) => tokens > 0 || category.includeWhenZero);
    return {
        segments: present
            .filter(({ tokens }) => tokens > 0)
            .map(({ category, tokens }) => ({
                key: category.key,
                color: category.color,
                weight: Math.max(1, tokens),
            })),
        legend: present.map(({ category, tokens }) => ({
            key: category.key,
            label: category.label,
            color: category.color,
            valueText: compactSidebarTokens(tokens),
            percentText: ((tokens / total) * 100).toFixed(0),
        })),
    };
}

type SidebarRecompProgress = NonNullable<SidebarSnapshot["recompProgress"]>;

function buildRecompStatus(progress: SidebarRecompProgress): SidebarRecompStatus {
    // "Recomp" vs "Upgrade" vs "Embed" wording follows the flow that started
    // this run, so a plain /ctx-recomp never renders as an "Upgrade".
    const verb =
        progress.kind === "upgrade"
            ? "Upgrade"
            : progress.kind === "embed"
              ? "Embed"
              : progress.kind === "wrapup"
                ? "Wrapup"
                : "Recomp";
    const activeText =
        progress.kind === "upgrade"
            ? "upgrading ⟳"
            : progress.kind === "embed"
              ? "embedding ⟳"
              : progress.kind === "wrapup"
                ? "wrapping ⟳"
                : "comparting ⟳";

    let statusText: string;
    let statusTone: SidebarTone;
    switch (progress.phase) {
        case "recomp":
            statusText = activeText;
            statusTone = "warning";
            break;
        case "migration":
            statusText = "Migrating memories ⟳";
            statusTone = "warning";
            break;
        case "done":
            statusText = `✓ ${verb} complete`;
            statusTone = "success";
            break;
        case "skipped":
            // Neutral terse status next to the bold verb header; the full,
            // self-contained reason renders on its own line below.
            statusText = "stopped";
            statusTone = "muted";
            break;
        case "failed":
            statusText = `✗ ${verb} failed`;
            statusTone = "error";
            break;
    }

    const fraction =
        progress.totalMessages > 0 ? progress.processedMessages / progress.totalMessages : 0;
    const bar =
        progress.phase === "recomp" && progress.totalMessages > 0
            ? {
                  barText: formatSidebarProgressBar(fraction),
                  percentText: `${Math.round(fraction * 100)}`,
              }
            : undefined;
    const note =
        (progress.phase === "recomp" || progress.phase === "migration") && progress.note
            ? progress.note
            : undefined;

    const rows: SidebarViewRow[] = [];
    if (progress.phase === "recomp") {
        rows.push({
            label: "Compartments",
            value:
                progress.kind !== "embed"
                    ? `${progress.compartmentsCreated} (${progress.passCount} pass${progress.passCount === 1 ? "" : "es"})`
                    : `${progress.processedMessages}/${progress.totalMessages} embedded`,
            tone: "muted",
            bold: true,
        });
    }
    // Terminal reason (failed/skipped) — kept visible so the user sees WHY.
    const message =
        (progress.phase === "failed" || progress.phase === "skipped") && progress.message
            ? progress.message
            : undefined;

    return { verb, statusText, statusTone, bar, note, rows, message };
}

/**
 * Builds the complete host-neutral persistent-sidebar view for one paint.
 *
 * Element presence/order and all wording come from this function alone;
 * callers pass only host state (collapse flag, section prefs, header label).
 */
export function buildMagicContextSidebarView(
    snapshot: SidebarSnapshot | null | undefined,
    options: BuildSidebarViewOptions,
): MagicContextSidebarView {
    const now = options.now ?? Date.now();
    const s = snapshot ?? null;
    const compactionOff = s?.compaction_enabled === false;

    const warnings: SidebarViewWarning[] = [];
    if (s?.lastTransformError) warnings.push({ text: s.lastTransformError, tone: "error" });
    for (const key of s?.hostLimitations ?? []) {
        warnings.push({ text: renderUserFacingFailure(key, "plain"), tone: "warning" });
    }
    if (s?.dreamerProgress) {
        warnings.push({
            text: `Dreamer ${s.dreamerProgress.task}: ${s.dreamerProgress.processed}/${s.dreamerProgress.total} processed`,
            tone: "warning",
        });
    }

    let overview: SidebarOverview | undefined;
    if (s && s.inputTokens > 0) {
        const hygiene: SidebarViewRow | undefined =
            s.tailHygiene !== undefined
                ? {
                      label: "Hygiene",
                      value: sidebarHygieneValue(s.tailHygiene),
                      tone: s.tailHygiene.evaluable ? "text" : "warning",
                      bold: true,
                  }
                : undefined;
        overview = { pressure: pressureRow(s, compactionOff), tokenBar: buildTokenBar(s), hygiene };
    }

    let collapsedSummary: SidebarCollapsedSummary | undefined;
    if (options.collapsed) {
        if (compactionOff && s) {
            collapsedSummary = {
                rows: compactionOffSidebarRows(s).map((row) => ({
                    label: row.label,
                    value: row.value,
                    tone:
                        row.label === "Memories"
                            ? ("accent" as SidebarTone)
                            : ("muted" as SidebarTone),
                    bold: true,
                })),
            };
        } else {
            const rows: SidebarViewRow[] = [
                {
                    label: "Historian",
                    value: s?.historianRunning ? "comparting ⟳" : "idle",
                    tone: s?.historianRunning ? "warning" : "muted",
                    bold: false,
                },
            ];
            if (s?.dreamerProgress) {
                rows.push({
                    label: "Dreamer",
                    value: `${s.dreamerProgress.task} ${s.dreamerProgress.processed}/${s.dreamerProgress.total}`,
                    tone: "warning",
                    bold: false,
                });
            }
            const blockCount = s?.memoryBlockCount ?? 0;
            const memoryCount = s?.memoryCount ?? 0;
            rows.push({
                label: "Memories",
                value: blockCount > 0 ? `${blockCount}/${memoryCount}` : String(memoryCount),
                tone: "muted",
                bold: false,
            });
            rows.push({
                label: "Status",
                value: `C:${s?.compartmentCount ?? 0} Q:${s?.pendingOpsCount ?? 0} N:${s?.sessionNoteCount ?? 0}`,
                tone: "muted",
                bold: false,
            });
            collapsedSummary = {
                rows,
                recomp:
                    s?.recompProgress && !compactionOff
                        ? buildRecompStatus(s.recompProgress)
                        : undefined,
            };
        }
    }

    let historian: SidebarSection | undefined;
    let memory: SidebarSection | undefined;
    let status: SidebarSection | undefined;
    let dreamer: SidebarSection | undefined;
    let stats: SidebarSection | undefined;

    if (!options.collapsed) {
        const recomp =
            s?.recompProgress && !compactionOff ? buildRecompStatus(s.recompProgress) : undefined;

        if (!compactionOff && options.sections.historian) {
            historian = {
                header: {
                    title: "Historian",
                    status: {
                        text: s?.historianRunning ? "comparting ⟳" : "idle",
                        tone: s?.historianRunning ? "warning" : "muted",
                    },
                },
                rows: [
                    {
                        label: "Compartments",
                        value: String(s?.compartmentCount ?? 0),
                        tone: "text",
                        bold: true,
                    },
                ],
                recomp,
            };
        }

        if (options.sections.memory) {
            const rows: SidebarViewRow[] = [];
            if (compactionOff && s) {
                for (const row of compactionOffSidebarRows(s)) {
                    if (row.label === "Memories")
                        rows.push({
                            label: row.label,
                            value: row.value,
                            tone: "accent",
                            bold: true,
                        });
                }
            } else {
                rows.push({
                    label: "Memories",
                    value: String(s?.memoryCount ?? 0),
                    tone: "accent",
                    bold: true,
                });
                if ((s?.memoryBlockCount ?? 0) > 0) {
                    rows.push({
                        label: "Injected",
                        value: String(s?.memoryBlockCount),
                        tone: "muted",
                        bold: true,
                    });
                }
            }
            memory = { header: { title: "Memory" }, rows };
        }

        if (
            options.sections.status &&
            (compactionOff ||
                (s?.pendingOpsCount ?? 0) > 0 ||
                (s?.sessionNoteCount ?? 0) > 0 ||
                (s?.readySmartNoteCount ?? 0) > 0)
        ) {
            const rows: SidebarViewRow[] = [];
            if (compactionOff && s) {
                for (const row of compactionOffSidebarRows(s)) {
                    if (row.label !== "Memories")
                        rows.push({
                            label: row.label,
                            value: row.value,
                            tone: "muted",
                            bold: true,
                        });
                }
            } else {
                if ((s?.pendingOpsCount ?? 0) > 0) {
                    rows.push({
                        label: "Queue",
                        value: `${s?.pendingOpsCount} pending`,
                        tone: "warning",
                        bold: true,
                    });
                }
                if ((s?.sessionNoteCount ?? 0) > 0) {
                    rows.push({
                        label: "Notes",
                        value: String(s?.sessionNoteCount),
                        tone: "text",
                        bold: true,
                    });
                }
                if ((s?.readySmartNoteCount ?? 0) > 0) {
                    rows.push({
                        label: "Smart Notes",
                        value: `${s?.readySmartNoteCount} ready`,
                        tone: "accent",
                        bold: true,
                    });
                }
            }
            status = { header: { title: "Status" }, rows };
        }

        if (options.sections.dreamer && (s?.lastDreamerRunAt || s?.dreamerProgress)) {
            const rows: SidebarViewRow[] = [];
            if (s?.dreamerProgress) {
                rows.push({
                    label: "Current",
                    value: `${s.dreamerProgress.task} ${s.dreamerProgress.processed}/${s.dreamerProgress.total}`,
                    tone: "warning",
                    bold: true,
                });
            }
            if (s?.lastDreamerRunAt) {
                rows.push({
                    label: "Last run",
                    value: sidebarRelativeTime(s.lastDreamerRunAt, now),
                    tone: "muted",
                    bold: true,
                });
            }
            for (const [task, backlog] of Object.entries(s?.dreamerBacklog ?? {})) {
                rows.push({
                    label: task,
                    value: `${backlog.pending}/${backlog.total}`,
                    tone: "muted",
                    bold: true,
                });
            }
            dreamer = { header: { title: "Dreamer" }, rows };
        }

        if (options.sections.stats && s?.totalInputTokens != null) {
            stats = {
                header: { title: "Stats" },
                rows: [
                    {
                        label: "Total tokens",
                        value: compactSidebarTokens(s.totalInputTokens ?? 0),
                        tone: "muted",
                        bold: true,
                    },
                ],
            };
        }
    }

    return {
        header: {
            glyph: options.collapsed ? "▶ " : "▼ ",
            label: options.headerLabel,
            version: packageJson.version,
        },
        warnings,
        overview,
        collapsedSummary,
        historian,
        memory,
        status,
        dreamer,
        stats,
    };
}
