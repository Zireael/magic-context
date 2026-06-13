import { describe, expect, it } from "bun:test";
import {
    renderDetailsPanel,
    renderFlushPanel,
    renderModePanel,
    renderStatusPanel,
    type SidebarSnapshot,
} from "./core-panels";

function makeSnapshot(overrides: Partial<SidebarSnapshot> = {}): SidebarSnapshot {
    return {
        sessionId: "test",
        usagePercentage: 50,
        inputTokens: 100_000,
        contextLimit: 200_000,
        systemPromptTokens: 10_000,
        compartmentCount: 5,
        factCount: 10,
        memoryCount: 3,
        memoryBlockCount: 1,
        pendingOpsCount: 0,
        historianRunning: false,
        compartmentInProgress: false,
        sessionNoteCount: 0,
        readySmartNoteCount: 0,
        cacheTtl: "5m",
        lastDreamerRunAt: null,
        projectIdentity: null,
        compartmentTokens: 20_000,
        factTokens: 0,
        memoryTokens: 15_000,
        docsTokens: 5_000,
        profileTokens: 0,
        conversationTokens: 30_000,
        toolCallTokens: 20_000,
        toolDefinitionTokens: 0,
        executeThreshold: 65,
        ...overrides,
    };
}

describe("renderDetailsPanel", () => {
    it("renders context section", () => {
        const snap = makeSnapshot();
        const panel = renderDetailsPanel(snap);
        expect(panel.title).toBe("Details / Overview");
        const ctxSection = panel.sections.find((s) => s.heading === "Context");
        expect(ctxSection).toBeTruthy();
        expect(ctxSection!.rows.length).toBeGreaterThan(0);
    });

    it("shows used tokens", () => {
        const snap = makeSnapshot({ inputTokens: 150_000 });
        const panel = renderDetailsPanel(snap);
        const ctxSection = panel.sections.find((s) => s.heading === "Context");
        const usedRow = ctxSection!.rows.find((r) => r.label === "Used");
        expect(usedRow!.value).toContain("150K");
    });

    it("shows free tokens", () => {
        const snap = makeSnapshot({ inputTokens: 100_000, contextLimit: 200_000 });
        const panel = renderDetailsPanel(snap);
        const ctxSection = panel.sections.find((s) => s.heading === "Context");
        const freeRow = ctxSection!.rows.find((r) => r.label === "Free");
        expect(freeRow!.value).toContain("100K");
    });

    it("shows Historian running state", () => {
        const snap = makeSnapshot({ historianRunning: true });
        const panel = renderDetailsPanel(snap);
        const stateSection = panel.sections.find((s) => s.heading === "State");
        const histRow = stateSection!.rows.find((r) => r.label === "Historian");
        expect(histRow!.value).toContain("running");
    });

    it("shows memory count", () => {
        const snap = makeSnapshot({ memoryCount: 15 });
        const panel = renderDetailsPanel(snap);
        const memSection = panel.sections.find((s) => s.heading === "Memory");
        const memRow = memSection!.rows.find((r) => r.label === "Memories");
        expect(memRow!.value).toBe("15");
    });

    it("shows risk primary when degraded", () => {
        const snap = makeSnapshot({ usagePercentage: 85 });
        const panel = renderDetailsPanel(snap);
        const riskSection = panel.sections.find((s) => s.heading === "Risk");
        const primaryRow = riskSection!.rows.find((r) => r.label === "Primary");
        expect(primaryRow!.value).toContain("85%");
    });
});

describe("renderStatusPanel", () => {
    it("renders allocation rows for non-zero categories", () => {
        const snap = makeSnapshot();
        const panel = renderStatusPanel(snap);
        const allocSection = panel.sections.find((s) => s.heading === "Context Allocation");
        expect(allocSection).toBeTruthy();
        expect(allocSection!.rows.length).toBeGreaterThan(0);
    });

    it("hides zero-token categories", () => {
        const snap = makeSnapshot({ factTokens: 0, profileTokens: 0 });
        const panel = renderStatusPanel(snap);
        const allocSection = panel.sections.find((s) => s.heading === "Context Allocation");
        const labels = allocSection!.rows.map((r) => r.label);
        expect(labels).not.toContainEqual(expect.stringContaining("Facts"));
        expect(labels).not.toContainEqual(expect.stringContaining("Profile"));
    });

    it("shows free row when contextLimit > inputTokens", () => {
        const snap = makeSnapshot({ inputTokens: 100_000, contextLimit: 200_000 });
        const panel = renderStatusPanel(snap);
        const allocSection = panel.sections.find((s) => s.heading === "Context Allocation");
        const freeRow = allocSection!.rows.find((r) => r.label.includes("Free"));
        expect(freeRow).toBeTruthy();
    });

    it("includes legend section", () => {
        const snap = makeSnapshot();
        const panel = renderStatusPanel(snap);
        const legendSection = panel.sections.find((s) => s.heading === "Legend");
        expect(legendSection).toBeTruthy();
        expect(legendSection!.rows.length).toBeGreaterThan(0);
    });
});

describe("renderModePanel", () => {
    it("renders display mode options", () => {
        const panel = renderModePanel("classic_collapsed");
        expect(panel.title).toBe("Mode / Automation");
        const displaySection = panel.sections.find((s) => s.heading === "Display Mode");
        expect(displaySection).toBeTruthy();
        expect(displaySection!.rows.length).toBe(3);
    });

    it("highlights active display mode", () => {
        const panel = renderModePanel("dense_collapsed");
        const displaySection = panel.sections.find((s) => s.heading === "Display Mode");
        const denseRow = displaySection!.rows.find((r) => r.label === "Dense");
        expect(denseRow!.accent).toBe(true);
        expect(denseRow!.value).toBe("●");
    });

    it("shows non-active modes as inactive", () => {
        const panel = renderModePanel("classic_collapsed");
        const displaySection = panel.sections.find((s) => s.heading === "Display Mode");
        const expandedRow = displaySection!.rows.find((r) => r.label === "Expanded");
        expect(expandedRow!.accent).toBe(false);
        expect(expandedRow!.value).toBe("○");
    });
});

describe("renderFlushPanel", () => {
    it("shows no pending operations", () => {
        const snap = makeSnapshot({ pendingOpsCount: 0 });
        const panel = renderFlushPanel(snap);
        const statusRow = panel.sections[0].rows.find((r) => r.label === "Status");
        expect(statusRow!.value).toContain("No pending");
    });

    it("shows pending count", () => {
        const snap = makeSnapshot({ pendingOpsCount: 5 });
        const panel = renderFlushPanel(snap);
        const countRow = panel.sections[0].rows.find((r) => r.label === "Count");
        expect(countRow!.value).toContain("5 pending");
        expect(countRow!.warning).toBe(true);
    });
});

describe("visual fixtures", () => {
    it("healthy state", () => {
        const snap = makeSnapshot({ usagePercentage: 61 });
        const details = renderDetailsPanel(snap);
        const status = renderStatusPanel(snap);
        const mode = renderModePanel("classic_collapsed");
        const flush = renderFlushPanel(snap);

        expect(details.title).toBeTruthy();
        expect(status.title).toBeTruthy();
        expect(mode.title).toBeTruthy();
        expect(flush.title).toBeTruthy();
    });

    it("token pressure", () => {
        const snap = makeSnapshot({ usagePercentage: 85 });
        const details = renderDetailsPanel(snap);
        const riskSection = details.sections.find((s) => s.heading === "Risk");
        expect(riskSection!.rows[0].warning).toBe(true);
    });

    it("fresh session with no data", () => {
        const snap = makeSnapshot({
            inputTokens: 0,
            contextLimit: 0,
            usagePercentage: 0,
            systemPromptTokens: 0,
            docsTokens: 0,
            compartmentTokens: 0,
            memoryTokens: 0,
            conversationTokens: 0,
            toolCallTokens: 0,
        });
        const details = renderDetailsPanel(snap);
        const status = renderStatusPanel(snap);
        expect(details.title).toBeTruthy();
        expect(status.title).toBeTruthy();
    });
});
