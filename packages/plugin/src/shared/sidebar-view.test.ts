import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import packageJson from "../../package.json";
import type { SidebarSnapshot } from "./rpc-types";
import {
    type BuildSidebarViewOptions,
    buildMagicContextSidebarView,
    SIDEBAR_TOKEN_CATEGORIES,
} from "./sidebar-view";

/**
 * Semantic golden fixtures for the persistent-sidebar model (IMPL-008).
 *
 * The expected objects below are the exact semantics the pre-refactor OpenCode
 * sidebar-content.tsx rendered (extracted branch by branch from that file
 * before it became a drawing layer). A drift in element presence, ordering,
 * labels, tones, category colors, warning order, compact-vs-expanded content,
 * or recomp wording fails one of these fixtures. The last test additionally
 * fails if the OpenCode renderer bypasses the shared builder.
 */

const NOW = 1_730_000_000_000;

function makeSnapshot(overrides: Partial<SidebarSnapshot> = {}): SidebarSnapshot {
    return {
        sessionId: "ses_golden",
        usagePercentage: 43.8,
        inputTokens: 68_000,
        contextLimit: 155_000,
        compaction_enabled: true,
        systemPromptTokens: 8_000,
        compartmentCount: 12,
        archivedCompartmentCount: 0,
        memoryCount: 42,
        memoryBlockCount: 3,
        pendingOpsCount: 2,
        historianRunning: false,
        compartmentInProgress: false,
        sessionNoteCount: 5,
        readySmartNoteCount: 4,
        cacheTtl: "1h",
        lastTransformError: null,
        lastDreamerRunAt: NOW - 300_000, // 5m ago
        projectIdentity: null,
        compartmentTokens: 12_000,
        factTokens: 3_000,
        memoryTokens: 6_000,
        docsTokens: 4_000,
        profileTokens: 1_000,
        conversationTokens: 30_000,
        toolCallTokens: 4_000,
        toolDefinitionTokens: 0,
        executeThreshold: 65,
        ...overrides,
    };
}

const EXPANDED: BuildSidebarViewOptions = {
    collapsed: false,
    sections: { historian: true, memory: true, status: true, dreamer: true, stats: true },
    headerLabel: "Magic Context",
    now: NOW,
};
const COLLAPSED: BuildSidebarViewOptions = { ...EXPANDED, collapsed: true };

const GOLDEN_TOKEN_BAR = {
    segments: [
        { key: "sys", color: "#c084fc", weight: 8_000 },
        { key: "docs", color: "#22d3ee", weight: 4_000 },
        { key: "comp", color: "#60a5fa", weight: 12_000 },
        { key: "fact", color: "#fbbf24", weight: 3_000 },
        { key: "mem", color: "#34d399", weight: 6_000 },
        { key: "profile", color: "#a3e635", weight: 1_000 },
        { key: "conv", color: "#f87171", weight: 30_000 },
        { key: "tool-calls", color: "#fb923c", weight: 4_000 },
    ],
    legend: [
        { key: "sys", label: "System", color: "#c084fc", valueText: "8K", percentText: "12" },
        { key: "docs", label: "Docs", color: "#22d3ee", valueText: "4K", percentText: "6" },
        {
            key: "comp",
            label: "Compartments",
            color: "#60a5fa",
            valueText: "12K",
            percentText: "18",
        },
        { key: "fact", label: "Facts", color: "#fbbf24", valueText: "3K", percentText: "4" },
        { key: "mem", label: "Memories", color: "#34d399", valueText: "6K", percentText: "9" },
        {
            key: "profile",
            label: "User Profile",
            color: "#a3e635",
            valueText: "1K",
            percentText: "1",
        },
        {
            key: "conv",
            label: "Conversation",
            color: "#f87171",
            valueText: "30K",
            percentText: "44",
        },
        {
            key: "tool-calls",
            label: "Tool Calls",
            color: "#fb923c",
            valueText: "4K",
            percentText: "6",
        },
    ],
};

describe("canonical token categories", () => {
    test("fixed order, keys, labels and status-view-shared colors", () => {
        expect(SIDEBAR_TOKEN_CATEGORIES.map((c) => [c.key, c.label, c.color])).toEqual([
            ["sys", "System", "#c084fc"],
            ["docs", "Docs", "#22d3ee"],
            ["comp", "Compartments", "#60a5fa"],
            ["fact", "Facts", "#fbbf24"],
            ["mem", "Memories", "#34d399"],
            ["profile", "User Profile", "#a3e635"],
            ["conv", "Conversation", "#f87171"],
            ["tool-calls", "Tool Calls", "#fb923c"],
            ["tool-defs", "Tool Defs", "#f472b6"],
        ]);
        expect(SIDEBAR_TOKEN_CATEGORIES.find((c) => c.key === "conv")?.includeWhenZero).toBe(true);
    });
});

describe("expanded golden", () => {
    test("full snapshot renders every section in canonical order", () => {
        const view = buildMagicContextSidebarView(makeSnapshot(), EXPANDED);
        expect(view).toEqual({
            header: { glyph: "▼ ", label: "Magic Context", version: packageJson.version },
            warnings: [],
            overview: {
                pressure: {
                    primary: "43.8%",
                    detail: " / 65%",
                    right: "68K / 155K",
                    tone: "accent",
                },
                tokenBar: GOLDEN_TOKEN_BAR,
            },
            historian: {
                header: { title: "Historian", status: { text: "idle", tone: "muted" } },
                rows: [{ label: "Compartments", value: "12", tone: "text", bold: true }],
            },
            memory: {
                header: { title: "Memory" },
                rows: [
                    { label: "Memories", value: "42", tone: "accent", bold: true },
                    { label: "Injected", value: "3", tone: "muted", bold: true },
                ],
            },
            status: {
                header: { title: "Status" },
                rows: [
                    { label: "Queue", value: "2 pending", tone: "warning", bold: true },
                    { label: "Notes", value: "5", tone: "text", bold: true },
                    { label: "Smart Notes", value: "4 ready", tone: "accent", bold: true },
                ],
            },
            dreamer: {
                header: { title: "Dreamer" },
                rows: [{ label: "Last run", value: "5m ago", tone: "muted", bold: true }],
            },
        });
        expect(view.collapsedSummary).toBeUndefined();
        expect(view.stats).toBeUndefined();
    });

    test("running historian turns the status line into live activity", () => {
        const view = buildMagicContextSidebarView(
            makeSnapshot({ historianRunning: true }),
            EXPANDED,
        );
        expect(view.historian?.header.status).toEqual({ text: "comparting ⟳", tone: "warning" });
    });

    test("totalInputTokens gates the stats section", () => {
        const view = buildMagicContextSidebarView(
            makeSnapshot({ totalInputTokens: 1_048_576 }),
            EXPANDED,
        );
        expect(view.stats).toEqual({
            header: { title: "Stats" },
            rows: [{ label: "Total tokens", value: "1.0M", tone: "muted", bold: true }],
        });
    });

    test("section pref gates remove sections without touching the rest", () => {
        const view = buildMagicContextSidebarView(makeSnapshot(), {
            ...EXPANDED,
            sections: {
                historian: false,
                memory: false,
                status: false,
                dreamer: false,
                stats: false,
            },
        });
        expect(view.historian).toBeUndefined();
        expect(view.memory).toBeUndefined();
        expect(view.status).toBeUndefined();
        expect(view.dreamer).toBeUndefined();
        expect(view.stats).toBeUndefined();
        expect(view.overview).toBeDefined();
        expect(view.warnings).toEqual([]);
    });

    test("status section hides when queue/notes/smart notes are all zero", () => {
        const view = buildMagicContextSidebarView(
            makeSnapshot({ pendingOpsCount: 0, sessionNoteCount: 0, readySmartNoteCount: 0 }),
            EXPANDED,
        );
        expect(view.status).toBeUndefined();
        expect(view.historian).toBeDefined();
    });

    test("dreamer backlog rows follow Last run", () => {
        const view = buildMagicContextSidebarView(
            makeSnapshot({
                dreamerBacklog: {
                    recall: { pending: 2, total: 5 },
                    sweep: { pending: 0, total: 9 },
                },
            }),
            EXPANDED,
        );
        expect(view.dreamer?.rows).toEqual([
            { label: "Last run", value: "5m ago", tone: "muted", bold: true },
            { label: "recall", value: "2/5", tone: "muted", bold: true },
            { label: "sweep", value: "0/9", tone: "muted", bold: true },
        ]);
    });

    test("live dreamer task surfaces as a warning and a Current row", () => {
        const view = buildMagicContextSidebarView(
            makeSnapshot({ dreamerProgress: { task: "recall", processed: 3, total: 10 } }),
            EXPANDED,
        );
        expect(view.warnings).toEqual([
            { text: "Dreamer recall: 3/10 processed", tone: "warning" },
        ]);
        expect(view.dreamer?.rows).toEqual([
            { label: "Current", value: "recall 3/10", tone: "warning", bold: true },
            { label: "Last run", value: "5m ago", tone: "muted", bold: true },
        ]);
    });
});

describe("collapsed golden", () => {
    test("summary rows with plain (non-bold) compact semantics", () => {
        const view = buildMagicContextSidebarView(makeSnapshot(), COLLAPSED);
        expect(view.header.glyph).toBe("▶ ");
        expect(view.collapsedSummary).toEqual({
            rows: [
                { label: "Historian", value: "idle", tone: "muted", bold: false },
                { label: "Memories", value: "3/42", tone: "muted", bold: false },
                { label: "Status", value: "C:12 Q:2 N:5", tone: "muted", bold: false },
            ],
        });
        expect(view.historian).toBeUndefined();
        expect(view.memory).toBeUndefined();
        expect(view.status).toBeUndefined();
        expect(view.dreamer).toBeUndefined();
        expect(view.stats).toBeUndefined();
    });

    test("zero injected blocks collapse Memories to the plain total", () => {
        const view = buildMagicContextSidebarView(makeSnapshot({ memoryBlockCount: 0 }), COLLAPSED);
        expect(view.collapsedSummary?.rows[1]).toEqual({
            label: "Memories",
            value: "42",
            tone: "muted",
            bold: false,
        });
    });

    test("running historian and live dreamer rows join the summary", () => {
        const view = buildMagicContextSidebarView(
            makeSnapshot({
                historianRunning: true,
                dreamerProgress: { task: "sweep", processed: 1, total: 4 },
            }),
            COLLAPSED,
        );
        expect(view.collapsedSummary?.rows).toEqual([
            { label: "Historian", value: "comparting ⟳", tone: "warning", bold: false },
            { label: "Dreamer", value: "sweep 1/4", tone: "warning", bold: false },
            { label: "Memories", value: "3/42", tone: "muted", bold: false },
            { label: "Status", value: "C:12 Q:2 N:5", tone: "muted", bold: false },
        ]);
    });
});

describe("warnings", () => {
    test("transform error, then host limitations, then dreamer progress", () => {
        const view = buildMagicContextSidebarView(
            makeSnapshot({
                lastTransformError: "fence write failed",
                hostLimitations: ["context_service_unavailable", "dreamer_task_failing"],
                dreamerProgress: { task: "recall", processed: 3, total: 10 },
            }),
            EXPANDED,
        );
        expect(view.warnings).toEqual([
            { text: "fence write failed", tone: "error" },
            {
                text: "Magic Context is temporarily unavailable. Retry in a moment. (MC-C10)",
                tone: "warning",
            },
            {
                text: "A background maintenance task keeps failing on its schedule. Check the Magic Context log for the failing task and its error. (MC-S05)",
                tone: "warning",
            },
            { text: "Dreamer recall: 3/10 processed", tone: "warning" },
        ]);
    });
});

describe("pressure", () => {
    test("warning at 65% and error at 80% of the model window", () => {
        const warning = buildMagicContextSidebarView(
            makeSnapshot({ usagePercentage: 70 }),
            EXPANDED,
        );
        expect(warning.overview?.pressure?.tone).toBe("warning");
        const error = buildMagicContextSidebarView(makeSnapshot({ usagePercentage: 85 }), EXPANDED);
        expect(error.overview?.pressure?.tone).toBe("error");
    });

    test("clamped execute threshold appends the marker", () => {
        const view = buildMagicContextSidebarView(
            makeSnapshot({ executeThresholdClamped: true, executeThreshold: 58.4 }),
            EXPANDED,
        );
        expect(view.overview?.pressure).toEqual({
            primary: "43.8%",
            detail: " / 58.4%*",
            right: "68K / 155K",
            tone: "accent",
        });
    });

    test("native-compaction label replaces the threshold line in accent", () => {
        const view = buildMagicContextSidebarView(
            makeSnapshot({ compaction_enabled: false }),
            EXPANDED,
        );
        expect(view.overview?.pressure).toEqual({
            primary: "Context: 43.9% · native compaction",
            detail: "",
            right: "68K / 155K",
            tone: "accent",
        });
    });

    test("no pressure row without a context limit; no overview without input", () => {
        const noLimit = buildMagicContextSidebarView(makeSnapshot({ contextLimit: 0 }), EXPANDED);
        expect(noLimit.overview?.pressure).toBeUndefined();
        expect(noLimit.overview?.tokenBar).toBeDefined();
        const noInput = buildMagicContextSidebarView(makeSnapshot({ inputTokens: 0 }), EXPANDED);
        expect(noInput.overview).toBeUndefined();
    });
});

describe("token legend", () => {
    test("Conversation stays listed at zero tokens but claims no bar width", () => {
        const view = buildMagicContextSidebarView(
            makeSnapshot({
                conversationTokens: 0,
                toolCallTokens: 0,
                toolDefinitionTokens: 4_000,
            }),
            EXPANDED,
        );
        const bar = view.overview?.tokenBar;
        expect(bar?.legend.map((e) => e.key)).toEqual([
            "sys",
            "docs",
            "comp",
            "fact",
            "mem",
            "profile",
            "conv",
            "tool-defs",
        ]);
        const conv = bar?.legend.find((e) => e.key === "conv");
        expect(conv).toEqual({
            key: "conv",
            label: "Conversation",
            color: "#f87171",
            valueText: "0",
            percentText: "0",
        });
        expect(bar?.segments.map((s) => s.key)).toEqual([
            "sys",
            "docs",
            "comp",
            "fact",
            "mem",
            "profile",
            "tool-defs",
        ]);
    });
});

describe("hygiene", () => {
    test("evaluable reading in text tone, unevaluable in warning tone", () => {
        const ok = buildMagicContextSidebarView(
            makeSnapshot({ tailHygiene: { u: 14_400, t: 48_000, severity: 0.3, evaluable: true } }),
            EXPANDED,
        );
        expect(ok.overview?.hygiene).toEqual({
            label: "Hygiene",
            value: "30.0% · 14K/48K",
            tone: "text",
            bold: true,
        });
        const bad = buildMagicContextSidebarView(
            makeSnapshot({
                tailHygiene: { u: 14_400, t: 48_000, severity: 0.3, evaluable: false },
            }),
            EXPANDED,
        );
        expect(bad.overview?.hygiene?.tone).toBe("warning");
    });
});

describe("recomp progress wording", () => {
    const base = {
        processedMessages: 4,
        totalMessages: 10,
        passCount: 2,
        compartmentsCreated: 5,
    };

    test("upgrade recomp: verb, active label, bar, note and pass row", () => {
        const view = buildMagicContextSidebarView(
            makeSnapshot({
                recompProgress: { ...base, kind: "upgrade", phase: "recomp", note: "Starting…" },
            }),
            EXPANDED,
        );
        expect(view.historian?.recomp).toEqual({
            verb: "Upgrade",
            statusText: "upgrading ⟳",
            statusTone: "warning",
            bar: { barText: "[██████░░░░░░░░]", percentText: "40" },
            note: "Starting…",
            rows: [{ label: "Compartments", value: "5 (2 passes)", tone: "muted", bold: true }],
        });
        expect(view.memory?.recomp).toBeUndefined();
        expect(view.status?.recomp).toBeUndefined();
    });

    test("embed recomp reports embedded progress instead of passes", () => {
        const view = buildMagicContextSidebarView(
            makeSnapshot({ recompProgress: { ...base, kind: "embed", phase: "recomp" } }),
            EXPANDED,
        );
        expect(view.historian?.recomp?.statusText).toBe("embedding ⟳");
        expect(view.historian?.recomp?.rows).toEqual([
            { label: "Compartments", value: "4/10 embedded", tone: "muted", bold: true },
        ]);
    });

    test("migration, done, skipped and failed phases", () => {
        const migration = buildMagicContextSidebarView(
            makeSnapshot({
                recompProgress: {
                    ...base,
                    kind: "recomp",
                    phase: "migration",
                    note: "Moving rows",
                },
            }),
            EXPANDED,
        );
        expect(migration.historian?.recomp).toEqual({
            verb: "Recomp",
            statusText: "Migrating memories ⟳",
            statusTone: "warning",
            bar: undefined,
            note: "Moving rows",
            rows: [],
        });

        const done = buildMagicContextSidebarView(
            makeSnapshot({ recompProgress: { ...base, kind: "upgrade", phase: "done" } }),
            EXPANDED,
        );
        expect(done.historian?.recomp).toEqual({
            verb: "Upgrade",
            statusText: "✓ Upgrade complete",
            statusTone: "success",
            rows: [],
        });

        const skipped = buildMagicContextSidebarView(
            makeSnapshot({
                recompProgress: {
                    ...base,
                    kind: "embed",
                    phase: "skipped",
                    message: "try again shortly",
                },
            }),
            EXPANDED,
        );
        expect(skipped.historian?.recomp?.statusText).toBe("stopped");
        expect(skipped.historian?.recomp?.statusTone).toBe("muted");
        expect(skipped.historian?.recomp?.message).toBe("try again shortly");

        const failed = buildMagicContextSidebarView(
            makeSnapshot({
                recompProgress: {
                    ...base,
                    kind: "recomp",
                    phase: "failed",
                    message: "provider 500",
                },
            }),
            EXPANDED,
        );
        expect(failed.historian?.recomp?.statusText).toBe("✗ Recomp failed");
        expect(failed.historian?.recomp?.statusTone).toBe("error");
        expect(failed.historian?.recomp?.message).toBe("provider 500");
    });

    test("collapsed carries the same progress; compaction-off suppresses it", () => {
        const collapsed = buildMagicContextSidebarView(
            makeSnapshot({ recompProgress: { ...base, kind: "wrapup", phase: "recomp" } }),
            COLLAPSED,
        );
        expect(collapsed.collapsedSummary?.recomp?.statusText).toBe("wrapping ⟳");

        const compactionOff = buildMagicContextSidebarView(
            makeSnapshot({
                compaction_enabled: false,
                recompProgress: { ...base, phase: "recomp" },
            }),
            EXPANDED,
        );
        expect(compactionOff.historian).toBeUndefined();
        const compactionOffCollapsed = buildMagicContextSidebarView(
            makeSnapshot({
                compaction_enabled: false,
                recompProgress: { ...base, phase: "recomp" },
            }),
            COLLAPSED,
        );
        expect(compactionOffCollapsed.collapsedSummary?.recomp).toBeUndefined();
    });
});

describe("compaction-off semantics", () => {
    test("expanded: no historian, Memories split out of the shared rows", () => {
        const view = buildMagicContextSidebarView(
            makeSnapshot({ compaction_enabled: false }),
            EXPANDED,
        );
        expect(view.historian).toBeUndefined();
        expect(view.memory).toEqual({
            header: { title: "Memory" },
            rows: [{ label: "Memories", value: "42", tone: "accent", bold: true }],
        });
        expect(view.status).toEqual({
            header: { title: "Status" },
            rows: [{ label: "Notes", value: "5", tone: "muted", bold: true }],
        });
    });

    test("collapsed: shared row list with Memories accented", () => {
        const view = buildMagicContextSidebarView(
            makeSnapshot({ compaction_enabled: false }),
            COLLAPSED,
        );
        expect(view.collapsedSummary?.rows).toEqual([
            { label: "Memories", value: "42", tone: "accent", bold: true },
            { label: "Notes", value: "5", tone: "muted", bold: true },
        ]);
    });

    test("archived compartments appear only above zero", () => {
        const view = buildMagicContextSidebarView(
            makeSnapshot({ compaction_enabled: false, archivedCompartmentCount: 7 }),
            COLLAPSED,
        );
        expect(view.collapsedSummary?.rows).toEqual([
            { label: "Memories", value: "42", tone: "accent", bold: true },
            { label: "Notes", value: "5", tone: "muted", bold: true },
            { label: "Archived compartments", value: "7", tone: "muted", bold: true },
        ]);
    });
});

describe("empty snapshots", () => {
    test("expanded with no data still shows the fixed skeleton", () => {
        const view = buildMagicContextSidebarView(null, EXPANDED);
        expect(view).toEqual({
            header: { glyph: "▼ ", label: "Magic Context", version: packageJson.version },
            warnings: [],
            historian: {
                header: { title: "Historian", status: { text: "idle", tone: "muted" } },
                rows: [{ label: "Compartments", value: "0", tone: "text", bold: true }],
            },
            memory: {
                header: { title: "Memory" },
                rows: [{ label: "Memories", value: "0", tone: "accent", bold: true }],
            },
        });
    });

    test("collapsed with no data shows zeroed summary rows", () => {
        const view = buildMagicContextSidebarView(null, COLLAPSED);
        expect(view.collapsedSummary?.rows).toEqual([
            { label: "Historian", value: "idle", tone: "muted", bold: false },
            { label: "Memories", value: "0", tone: "muted", bold: false },
            { label: "Status", value: "C:0 Q:0 N:0", tone: "muted", bold: false },
        ]);
    });
});

describe("renderer bypass guard", () => {
    const rendererPath = path.join(import.meta.dir, "..", "tui", "slots", "sidebar-content.tsx");
    const renderer = fs.readFileSync(rendererPath, "utf8");

    test("OpenCode derives every paint from the shared builder", () => {
        expect(renderer).toContain("buildMagicContextSidebarView");
    });

    test("no semantic literals or snapshot semantics are re-derived in the renderer", () => {
        // State ACQUISITION may keep touching snapshot fields (refresh/poll
        // control); presentation semantics must not.
        const banned = [
            "comparting",
            "Historian ",
            "Smart Notes",
            "Total tokens",
            "Hygiene",
            "#c084fc",
            "#f87171",
            "usagePercentage",
            "executeThreshold",
            "compaction_enabled",
            "historianRunning",
            "memoryBlockCount",
            "sessionNoteCount",
            "readySmartNoteCount",
            "pendingOpsCount",
            "dreamerBacklog",
            "tailHygiene",
            "hostLimitations",
            "lastTransformError",
            "formatThresholdPercent",
            "renderUserFacingFailure",
            "nativeCompactionContextLabel",
            "compactionOffSidebarRows",
            "contextSummaryColor",
            "function compactTokens",
            "function relativeTime",
            "function progressBar",
            "function hygieneValue",
            "SectionHeader",
            "StatRow",
        ];
        const hits = banned.filter((token) => renderer.includes(token));
        expect(hits).toEqual([]);
    });

    test("shared model imports no host frameworks", () => {
        const shared = fs.readFileSync(path.join(import.meta.dir, "sidebar-view.ts"), "utf8");
        const forbidden = ["@opentui", "solid-js", "pi-atelier", "@cortexkit/pi", "node:"];
        const hits = forbidden.filter(
            (token) => shared.includes(`"${token}`) || shared.includes(`from "${token}`),
        );
        expect(hits).toEqual([]);
    });
});
