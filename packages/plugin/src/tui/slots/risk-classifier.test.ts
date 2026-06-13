import { describe, expect, it } from "bun:test";
import {
    buildTopRowFromRisk,
    classifyRisk,
    type RiskClassifierInput,
    type SidebarSnapshot,
} from "./risk-classifier";

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

function makeInput(overrides: Partial<RiskClassifierInput> = {}): RiskClassifierInput {
    return {
        snapshot: makeSnapshot(),
        ...overrides,
    };
}

describe("classifyRisk", () => {
    it("returns healthy for normal state", () => {
        const result = classifyRisk(makeInput());
        expect(result.healthy).toBe(true);
        expect(result.flags).toHaveLength(0);
        expect(result.processChip).toBe("");
        expect(result.summary).toBe("OK");
    });

    it("detects Historian running", () => {
        const result = classifyRisk(
            makeInput({
                snapshot: makeSnapshot({ historianRunning: true }),
            }),
        );
        expect(result.processChip).toBe("HIST↻");
        expect(result.healthy).toBe(true);
    });

    it("detects compartment in progress", () => {
        const result = classifyRisk(
            makeInput({
                snapshot: makeSnapshot({ compartmentInProgress: true }),
            }),
        );
        expect(result.processChip).toBe("HIST↻");
        expect(result.healthy).toBe(true);
    });

    it("detects pending queue", () => {
        const result = classifyRisk(
            makeInput({
                snapshot: makeSnapshot({ pendingOpsCount: 3 }),
            }),
        );
        expect(result.processChip).toBe("Q3");
        expect(result.healthy).toBe(true);
    });

    it("detects token pressure at 80%", () => {
        const result = classifyRisk(
            makeInput({
                snapshot: makeSnapshot({ usagePercentage: 85 }),
            }),
        );
        expect(result.flags).toContain("T!");
        expect(result.healthy).toBe(false);
        expect(result.primaryRisk).toContain("85%");
    });

    it("detects token pressure at 95%", () => {
        const result = classifyRisk(
            makeInput({
                snapshot: makeSnapshot({ usagePercentage: 96 }),
            }),
        );
        expect(result.flags).toContain("T!");
        expect(result.healthy).toBe(false);
        expect(result.primaryRisk).toContain("critical");
    });

    it("detects overflow", () => {
        const result = classifyRisk(
            makeInput({
                snapshot: makeSnapshot({ usagePercentage: 105 }),
            }),
        );
        expect(result.flags).toContain("OVERFLOW");
        expect(result.flags).toContain("T!");
        expect(result.healthy).toBe(false);
        expect(result.primaryRisk).toContain("overflowed");
    });

    it("detects Historian failed", () => {
        const result = classifyRisk(
            makeInput({
                snapshot: makeSnapshot({
                    recompProgress: {
                        phase: "failed",
                        processedMessages: 0,
                        totalMessages: 0,
                        passCount: 0,
                        compartmentsCreated: 0,
                    },
                }),
            }),
        );
        expect(result.flags).toContain("H!");
        expect(result.healthy).toBe(false);
        expect(result.primaryRisk).toContain("Historian failed");
    });

    it("detects cache busts", () => {
        const result = classifyRisk(
            makeInput({
                cacheBustCount: 5,
            }),
        );
        expect(result.flags).toContain("C!");
        expect(result.healthy).toBe(false);
        expect(result.primaryRisk).toContain("cache busts");
    });

    it("detects stale Dreamer", () => {
        const staleTime = Date.now() - 2 * 60 * 60 * 1000; // 2 hours ago
        const result = classifyRisk(
            makeInput({
                dreamerLastRunAt: staleTime,
            }),
        );
        expect(result.flags).toContain("D?");
        expect(result.secondaryRisk).toContain("Dreamer stale");
    });

    it("detects memory bloat", () => {
        const result = classifyRisk(
            makeInput({
                memoryCount: 100,
            }),
        );
        expect(result.flags).toContain("M!");
        expect(result.secondaryRisk).toContain("Memory bloat");
    });

    it("prioritizes Historian over Dreamer", () => {
        const result = classifyRisk(
            makeInput({
                snapshot: makeSnapshot({ historianRunning: true }),
                dreamerLastRunAt: Date.now() - 2 * 60 * 60 * 1000,
            }),
        );
        expect(result.processChip).toBe("HIST↻");
        expect(result.flags).toContain("D?");
    });

    it("prioritizes overflow over queue", () => {
        const result = classifyRisk(
            makeInput({
                snapshot: makeSnapshot({
                    usagePercentage: 105,
                    pendingOpsCount: 3,
                }),
            }),
        );
        expect(result.flags).toContain("OVERFLOW");
        expect(result.flags).toContain("T!");
        // Queue shows as process chip when Historian not running
        expect(result.processChip).toBe("Q3");
    });

    it("returns healthy when no flags and process chip present", () => {
        const result = classifyRisk(
            makeInput({
                snapshot: makeSnapshot({ historianRunning: true }),
            }),
        );
        expect(result.healthy).toBe(true);
        expect(result.processChip).toBe("HIST↻");
    });
});

describe("buildTopRowFromRisk", () => {
    it("builds simple OK row", () => {
        const result = classifyRisk(makeInput());
        const row = buildTopRowFromRisk(result, "200K");
        expect(row).toBe("200K · OK");
    });

    it("builds Historian row", () => {
        const result = classifyRisk(
            makeInput({
                snapshot: makeSnapshot({ historianRunning: true }),
            }),
        );
        const row = buildTopRowFromRisk(result, "200K");
        expect(row).toBe("200K · HIST↻");
    });

    it("builds overflow row", () => {
        const result = classifyRisk(
            makeInput({
                snapshot: makeSnapshot({ usagePercentage: 105 }),
            }),
        );
        const row = buildTopRowFromRisk(result, "200K");
        expect(row).toContain("OVERFLOW");
        expect(row).toContain("T!");
    });

    it("builds queue row", () => {
        const result = classifyRisk(
            makeInput({
                snapshot: makeSnapshot({ pendingOpsCount: 5 }),
            }),
        );
        const row = buildTopRowFromRisk(result, "200K");
        expect(row).toBe("200K · Q5");
    });
});
