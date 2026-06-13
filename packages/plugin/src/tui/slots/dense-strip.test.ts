import { describe, expect, it } from "bun:test";
import type { SidebarSnapshot } from "../../shared/rpc-types";
import {
    compactTokens,
    type DenseStripSnapshot,
    getContextCategories,
    renderDenseStrip,
    toDenseStripSnapshot,
} from "./dense-strip";

function makeSnapshot(overrides: Partial<DenseStripSnapshot> = {}): DenseStripSnapshot {
    return {
        inputTokens: 100_000,
        contextLimit: 200_000,
        usagePercentage: 50,
        executeThreshold: 65,
        historianRunning: false,
        compartmentInProgress: false,
        pendingOpsCount: 0,
        systemPromptTokens: 10_000,
        docsTokens: 5_000,
        compartmentTokens: 20_000,
        factTokens: 0,
        memoryTokens: 15_000,
        profileTokens: 0,
        conversationTokens: 30_000,
        toolCallTokens: 20_000,
        toolDefinitionTokens: 0,
        ...overrides,
    };
}

describe("compactTokens", () => {
    it("formats thousands", () => {
        expect(compactTokens(0)).toBe("0");
        expect(compactTokens(999)).toBe("999");
        expect(compactTokens(1_000)).toBe("1K");
        expect(compactTokens(1_500)).toBe("1K");
        expect(compactTokens(10_000)).toBe("10K");
    });

    it("formats millions", () => {
        expect(compactTokens(1_000_000)).toBe("1.0M");
        expect(compactTokens(1_500_000)).toBe("1.5M");
    });
});

describe("getContextCategories", () => {
    it("returns only non-zero categories", () => {
        const snap = makeSnapshot({ factTokens: 0, profileTokens: 0 });
        const cats = getContextCategories(snap);
        const keys = cats.map((c) => c.key);
        expect(keys).not.toContain("factTokens");
        expect(keys).not.toContain("profile");
        expect(keys).toContain("system");
        expect(keys).toContain("conversation");
    });

    it("classifies system as cold", () => {
        const snap = makeSnapshot();
        const cats = getContextCategories(snap);
        const system = cats.find((c) => c.key === "system");
        expect(system?.stability).toBe("cold");
    });

    it("classifies conversation as warm", () => {
        const snap = makeSnapshot();
        const cats = getContextCategories(snap);
        const conv = cats.find((c) => c.key === "conversation");
        expect(conv?.stability).toBe("warm");
    });

    it("classifies tool calls as hot", () => {
        const snap = makeSnapshot();
        const cats = getContextCategories(snap);
        const tc = cats.find((c) => c.key === "toolCalls");
        expect(tc?.stability).toBe("hot");
    });
});

describe("renderDenseStrip", () => {
    it("renders top row with capacity", () => {
        const snap = makeSnapshot();
        const strip = renderDenseStrip(snap);
        expect(strip.topRow).toContain("200K");
    });

    it("renders top row with free headroom", () => {
        const snap = makeSnapshot({ usagePercentage: 50 });
        const strip = renderDenseStrip(snap);
        expect(strip.topRow).toContain("free");
    });

    it("renders historian indicator", () => {
        const snap = makeSnapshot({ historianRunning: true });
        const strip = renderDenseStrip(snap);
        expect(strip.topRow).toContain("HIST↻");
    });

    it("renders pending queue", () => {
        const snap = makeSnapshot({ pendingOpsCount: 3 });
        const strip = renderDenseStrip(snap);
        expect(strip.topRow).toContain("Q3");
    });

    it("renders overflow", () => {
        const snap = makeSnapshot({ usagePercentage: 105 });
        const strip = renderDenseStrip(snap);
        expect(strip.topRow).toContain("OVERFLOW");
    });

    it("renders bar row with percentage", () => {
        const snap = makeSnapshot({ usagePercentage: 61 });
        const strip = renderDenseStrip(snap);
        expect(strip.barRow).toContain("61%");
    });

    it("renders threshold marker", () => {
        const snap = makeSnapshot({ usagePercentage: 70, executeThreshold: 65 });
        const strip = renderDenseStrip(snap);
        expect(strip.barRow).toContain("|");
    });

    it("renders overflow marker in bar", () => {
        const snap = makeSnapshot({ usagePercentage: 105 });
        const strip = renderDenseStrip(snap);
        expect(strip.barRow).toContain(">");
    });

    it("renders action row with [D] [S] [A]", () => {
        const snap = makeSnapshot();
        const strip = renderDenseStrip(snap);
        expect(strip.actionRow).toBe("[D] [S] [A]");
    });

    it("renders [F]n when pending ops exist", () => {
        const snap = makeSnapshot({ pendingOpsCount: 5 });
        const strip = renderDenseStrip(snap);
        expect(strip.actionRow).toBe("[D] [S] [A] [F]5");
    });

    it("hides [F]n when no pending ops", () => {
        const snap = makeSnapshot({ pendingOpsCount: 0 });
        const strip = renderDenseStrip(snap);
        expect(strip.actionRow).not.toContain("[F]");
    });
});

describe("toDenseStripSnapshot", () => {
    it("converts SidebarSnapshot to DenseStripSnapshot", () => {
        const sidebarSnap: SidebarSnapshot = {
            sessionId: "test",
            usagePercentage: 61,
            inputTokens: 110_000,
            contextLimit: 180_000,
            systemPromptTokens: 10_000,
            compartmentCount: 5,
            factCount: 10,
            memoryCount: 3,
            memoryBlockCount: 1,
            pendingOpsCount: 2,
            historianRunning: true,
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
        };
        const denseSnap = toDenseStripSnapshot(sidebarSnap);
        expect(denseSnap.inputTokens).toBe(110_000);
        expect(denseSnap.contextLimit).toBe(180_000);
        expect(denseSnap.historianRunning).toBe(true);
        expect(denseSnap.pendingOpsCount).toBe(2);
    });
});

describe("visual fixtures", () => {
    it("healthy state", () => {
        const snap = makeSnapshot({ usagePercentage: 61, executeThreshold: 65 });
        const strip = renderDenseStrip(snap);
        expect(strip.topRow).toBeTruthy();
        expect(strip.barRow).toBeTruthy();
        expect(strip.actionRow).toBe("[D] [S] [A]");
    });

    it("historian running", () => {
        const snap = makeSnapshot({ historianRunning: true, pendingOpsCount: 3 });
        const strip = renderDenseStrip(snap);
        expect(strip.topRow).toContain("HIST↻");
        expect(strip.topRow).toContain("Q3");
    });

    it("token pressure", () => {
        const snap = makeSnapshot({ usagePercentage: 85 });
        const strip = renderDenseStrip(snap);
        expect(strip.topRow).toContain("T!");
    });

    it("overflow", () => {
        const snap = makeSnapshot({ usagePercentage: 105 });
        const strip = renderDenseStrip(snap);
        expect(strip.topRow).toContain("OVERFLOW");
        expect(strip.topRow).toContain("T!");
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
        const strip = renderDenseStrip(snap);
        expect(strip.topRow).toBeTruthy();
        expect(strip.barRow).toBe("");
        expect(strip.actionRow).toBe("[D] [S] [A]");
    });

    it("cold context (low usage)", () => {
        const snap = makeSnapshot({ usagePercentage: 15, inputTokens: 30_000, contextLimit: 200_000 });
        const strip = renderDenseStrip(snap);
        expect(strip.topRow).toContain("free");
        expect(strip.topRow).not.toContain("T!");
    });

    it("pending flush shows [F]n", () => {
        const snap = makeSnapshot({ pendingOpsCount: 7 });
        const strip = renderDenseStrip(snap);
        expect(strip.actionRow).toBe("[D] [S] [A] [F]7");
    });

    it("no pending flush hides [F]n", () => {
        const snap = makeSnapshot({ pendingOpsCount: 0 });
        const strip = renderDenseStrip(snap);
        expect(strip.actionRow).not.toContain("[F]");
    });

    it("bar row shows threshold marker at high usage", () => {
        const snap = makeSnapshot({ usagePercentage: 70, executeThreshold: 65 });
        const strip = renderDenseStrip(snap);
        expect(strip.barRow).toContain("|");
    });

    it("bar row shows overflow marker", () => {
        const snap = makeSnapshot({ usagePercentage: 105 });
        const strip = renderDenseStrip(snap);
        expect(strip.barRow).toContain(">");
    });

    it("handles zero context limit gracefully", () => {
        const snap = makeSnapshot({ contextLimit: 0, inputTokens: 5000 });
        const strip = renderDenseStrip(snap);
        expect(strip.topRow).toBeTruthy();
        expect(strip.barRow).toBeTruthy();
    });
});
