import { describe, expect, it } from "bun:test";
import {
    renderDetailsPanel,
    renderFlushPanel,
    renderMemoryPanel,
    renderModePanel,
    renderSettingsPanel,
    renderStatusPanel,
    renderThemeSettingsPanel,
    type SettingsPanelInput,
    type SidebarSnapshot,
    type ThemeSettingsInput,
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

describe("renderMemoryPanel", () => {
    it("renders memory section with counts", () => {
        const snap = makeSnapshot({ memoryCount: 10, memoryTokens: 5000 });
        const panel = renderMemoryPanel(snap);
        expect(panel.title).toBe("Memory / Maintenance");
        const memSection = panel.sections.find((s) => s.heading === "Memory");
        expect(memSection).toBeTruthy();
        expect(memSection!.rows.length).toBeGreaterThan(0);
    });

    it("shows smart notes when present", () => {
        const snap = makeSnapshot({ readySmartNoteCount: 3 });
        const panel = renderMemoryPanel(snap);
        const memSection = panel.sections.find((s) => s.heading === "Memory");
        const smartRow = memSection!.rows.find((r) => r.label === "Smart notes");
        expect(smartRow).toBeTruthy();
        expect(smartRow!.value).toContain("3");
    });

    it("shows user profile tokens when present", () => {
        const snap = makeSnapshot({ profileTokens: 2000 });
        const panel = renderMemoryPanel(snap);
        const memSection = panel.sections.find((s) => s.heading === "Memory");
        const profileRow = memSection!.rows.find((r) => r.label === "User profile");
        expect(profileRow).toBeTruthy();
    });

    it("shows empty state for fresh session", () => {
        const snap = makeSnapshot({
            memoryCount: 0,
            memoryTokens: 0,
            readySmartNoteCount: 0,
            profileTokens: 0,
            compartmentCount: 0,
        });
        const panel = renderMemoryPanel(snap);
        const memSection = panel.sections.find((s) => s.heading === "Memory");
        expect(memSection!.rows[0].value).toContain("No memories");
    });

    it("shows Dreamer last run", () => {
        const snap = makeSnapshot({ lastDreamerRunAt: Date.now() - 300_000 });
        const panel = renderMemoryPanel(snap);
        const dreamerSection = panel.sections.find((s) => s.heading === "Dreamer");
        expect(dreamerSection).toBeTruthy();
        expect(dreamerSection!.rows[0].value).toBeTruthy();
    });

    it("shows Dreamer never run", () => {
        const snap = makeSnapshot({ lastDreamerRunAt: null });
        const panel = renderMemoryPanel(snap);
        const dreamerSection = panel.sections.find((s) => s.heading === "Dreamer");
        expect(dreamerSection!.rows[0].value).toBe("never");
    });

    it("shows Dreamer stale warning", () => {
        const snap = makeSnapshot({ lastDreamerRunAt: Date.now() - 2 * 60 * 60 * 1000 });
        const panel = renderMemoryPanel(snap);
        const dreamerSection = panel.sections.find((s) => s.heading === "Dreamer");
        const statusRow = dreamerSection!.rows.find((r) => r.label === "Status");
        expect(statusRow?.warning).toBe(true);
    });

    it("shows Historian running", () => {
        const snap = makeSnapshot({ historianRunning: true });
        const panel = renderMemoryPanel(snap);
        const histSection = panel.sections.find((s) => s.heading === "Historian");
        expect(histSection!.rows[0].value).toContain("running");
        expect(histSection!.rows[0].warning).toBe(true);
    });

    it("shows Historian failed", () => {
        const snap = makeSnapshot({
            recompProgress: { phase: "failed", processedMessages: 0, totalMessages: 0, passCount: 0, compartmentsCreated: 0 },
        });
        const panel = renderMemoryPanel(snap);
        const histSection = panel.sections.find((s) => s.heading === "Historian");
        expect(histSection!.rows[0].value).toBe("failed");
    });

    it("shows pending drops", () => {
        const snap = makeSnapshot({ pendingOpsCount: 5 });
        const panel = renderMemoryPanel(snap);
        const histSection = panel.sections.find((s) => s.heading === "Historian");
        const dropsRow = histSection!.rows.find((r) => r.label === "Pending drops");
        expect(dropsRow).toBeTruthy();
        expect(dropsRow!.warning).toBe(true);
    });
});

function makeSettingsInput(overrides: Partial<SettingsPanelInput> = {}): SettingsPanelInput {
    return {
        displayMode: "classic_collapsed",
        configDefault: "classic_collapsed",
        userOverride: false,
        glyphPreset: "unicode",
        criticalBlinkOnly: true,
        version: "0.23.1",
        updateStatus: "current",
        ...overrides,
    };
}

describe("renderSettingsPanel", () => {
    it("renders display mode options", () => {
        const panel = renderSettingsPanel(makeSettingsInput());
        expect(panel.title).toBe("Settings");
        const displaySection = panel.sections.find((s) => s.heading === "Display Mode");
        expect(displaySection).toBeTruthy();
        expect(displaySection!.rows.length).toBe(3);
    });

    it("highlights active display mode", () => {
        const panel = renderSettingsPanel(makeSettingsInput({ displayMode: "dense_collapsed" }));
        const displaySection = panel.sections.find((s) => s.heading === "Display Mode");
        const denseRow = displaySection!.rows.find((r) => r.label === "Dense");
        expect(denseRow!.accent).toBe(true);
        expect(denseRow!.value).toBe("●");
    });

    it("shows reset option when user override exists", () => {
        const panel = renderSettingsPanel(makeSettingsInput({ userOverride: true }));
        const resetSection = panel.sections.find((s) => !s.heading);
        expect(resetSection).toBeTruthy();
        expect(resetSection!.rows[0].label).toBe("Reset to default");
    });

    it("hides reset option when no override", () => {
        const panel = renderSettingsPanel(makeSettingsInput({ userOverride: false }));
        const resetSection = panel.sections.find((s) => !s.heading);
        expect(resetSection).toBeFalsy();
    });

    it("renders glyph preset options", () => {
        const panel = renderSettingsPanel(makeSettingsInput());
        const glyphSection = panel.sections.find((s) => s.heading === "Glyphs");
        expect(glyphSection).toBeTruthy();
        expect(glyphSection!.rows.length).toBe(3);
    });

    it("shows version", () => {
        const panel = renderSettingsPanel(makeSettingsInput({ version: "0.23.1" }));
        const versionSection = panel.sections.find((s) => s.heading === "Version");
        expect(versionSection).toBeTruthy();
        expect(versionSection!.rows[0].value).toContain("0.23.1");
    });

    it("shows current update status", () => {
        const panel = renderSettingsPanel(makeSettingsInput({ updateStatus: "current" }));
        const versionSection = panel.sections.find((s) => s.heading === "Version");
        const updateRow = versionSection!.rows.find((r) => r.label === "Update");
        expect(updateRow!.value).toBe("current");
        expect(updateRow!.accent).toBe(true);
    });

    it("shows available update", () => {
        const panel = renderSettingsPanel(makeSettingsInput({
            updateStatus: "available",
            availableVersion: "0.24.0",
        }));
        const versionSection = panel.sections.find((s) => s.heading === "Version");
        const updateRow = versionSection!.rows.find((r) => r.label === "Update");
        expect(updateRow!.value).toContain("0.24.0");
        expect(updateRow!.warning).toBe(true);
    });

    it("shows unknown update status", () => {
        const panel = renderSettingsPanel(makeSettingsInput({ updateStatus: "unknown" }));
        const versionSection = panel.sections.find((s) => s.heading === "Version");
        const updateRow = versionSection!.rows.find((r) => r.label === "Update");
        expect(updateRow!.value).toBe("unknown");
        expect(updateRow!.dim).toBe(true);
    });
});

function makeThemeSettingsInput(overrides: Partial<ThemeSettingsInput> = {}): ThemeSettingsInput {
    return {
        themeSource: "follow_opencode",
        colorOverrides: {},
        ...overrides,
    };
}

describe("renderThemeSettingsPanel", () => {
    it("renders theme source options", () => {
        const panel = renderThemeSettingsPanel(makeThemeSettingsInput());
        expect(panel.title).toBe("Theme Settings");
        const sourceSection = panel.sections.find((s) => s.heading === "Theme Source");
        expect(sourceSection).toBeTruthy();
        expect(sourceSection!.rows.length).toBe(5);
    });

    it("highlights active theme source", () => {
        const panel = renderThemeSettingsPanel(makeThemeSettingsInput({ themeSource: "magic_default" }));
        const sourceSection = panel.sections.find((s) => s.heading === "Theme Source");
        const magicRow = sourceSection!.rows.find((r) => r.label === "Magic Default");
        expect(magicRow!.accent).toBe(true);
        expect(magicRow!.value).toBe("●");
    });

    it("shows OpenCode theme name when following", () => {
        const panel = renderThemeSettingsPanel(makeThemeSettingsInput({
            themeSource: "follow_opencode",
            openCodeThemeName: "catppuccin",
        }));
        const themeRow = panel.sections.find((s) => !s.heading)?.rows.find((r) => r.label.includes("OpenCode"));
        expect(themeRow).toBeTruthy();
        expect(themeRow!.value).toBe("catppuccin");
    });

    it("shows packaged preset picker", () => {
        const panel = renderThemeSettingsPanel(makeThemeSettingsInput({
            themeSource: "packaged_preset",
            packagedPreset: "nord",
        }));
        const presetSection = panel.sections.find((s) => s.heading === "Packaged Preset");
        expect(presetSection).toBeTruthy();
        expect(presetSection!.rows.length).toBe(6);
    });

    it("shows color overrides count", () => {
        const panel = renderThemeSettingsPanel(makeThemeSettingsInput({
            colorOverrides: { warning: "#ff0000", cold: "#00ff00" },
        }));
        const overrideSection = panel.sections.find((s) => s.heading === "Color Overrides");
        expect(overrideSection!.rows[0].value).toBe("2");
    });

    it("shows none when no overrides", () => {
        const panel = renderThemeSettingsPanel(makeThemeSettingsInput({ colorOverrides: {} }));
        const overrideSection = panel.sections.find((s) => s.heading === "Color Overrides");
        expect(overrideSection!.rows[0].value).toBe("none");
    });
});
