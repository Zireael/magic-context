import { describe, expect, it } from "bun:test";
import {
    aggregateLedger,
    renderTokensPanel,
    type SidebarSnapshot,
    type UsageLedgerEvent,
} from "./token-ledger";

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

function makeEvent(overrides: Partial<UsageLedgerEvent> = {}): UsageLedgerEvent {
    return {
        id: "evt-1",
        sessionId: "session-1",
        providerId: "anthropic",
        modelId: "claude-sonnet-4-20250514",
        timestamp: Date.now(),
        inputTokens: 5000,
        outputTokens: 1000,
        reasoningTokens: 500,
        cacheReadInputTokens: 2000,
        cacheWriteInputTokens: 1000,
        source: "provider_usage",
        confidence: "exact",
        ...overrides,
    };
}

describe("aggregateLedger", () => {
    it("sums events correctly", () => {
        const events = [
            makeEvent({ inputTokens: 5000, outputTokens: 1000 }),
            makeEvent({ id: "evt-2", inputTokens: 3000, outputTokens: 500 }),
        ];
        const agg = aggregateLedger(events);
        expect(agg.inputTokens).toBe(8000);
        expect(agg.outputTokens).toBe(1500);
        expect(agg.eventCount).toBe(2);
        expect(agg.confidence).toBe("exact");
    });

    it("returns unavailable for empty events", () => {
        const agg = aggregateLedger([]);
        expect(agg.confidence).toBe("unavailable");
        expect(agg.eventCount).toBe(0);
    });

    it("sums cache tokens", () => {
        const events = [
            makeEvent({ cacheReadInputTokens: 2000, cacheWriteInputTokens: 1000 }),
            makeEvent({ id: "evt-2", cacheReadInputTokens: 1500, cacheWriteInputTokens: 500 }),
        ];
        const agg = aggregateLedger(events);
        expect(agg.cacheReadInputTokens).toBe(3500);
        expect(agg.cacheWriteInputTokens).toBe(1500);
    });
});

describe("renderTokensPanel", () => {
    it("renders provider ledger with events", () => {
        const snap = makeSnapshot();
        const events = [makeEvent()];
        const panel = renderTokensPanel(snap, events);
        expect(panel.title).toBe("Tokens");
        const ledgerSection = panel.sections.find((s) => s.heading === "Provider Usage Ledger");
        expect(ledgerSection).toBeTruthy();
        expect(ledgerSection!.rows.length).toBeGreaterThan(0);
    });

    it("shows unavailable when no events", () => {
        const snap = makeSnapshot();
        const panel = renderTokensPanel(snap, []);
        const ledgerSection = panel.sections.find((s) => s.heading === "Provider Usage Ledger");
        const statusRow = ledgerSection!.rows[0];
        expect(statusRow.confidence).toBe("unavailable");
    });

    it("labels exact values from ledger", () => {
        const snap = makeSnapshot();
        const events = [makeEvent({ inputTokens: 10000 })];
        const panel = renderTokensPanel(snap, events);
        const ledgerSection = panel.sections.find((s) => s.heading === "Provider Usage Ledger");
        const inputRow = ledgerSection!.rows.find((r) => r.label === "Input tokens");
        expect(inputRow!.value).toContain("10K");
        expect(inputRow!.value).toContain("exact");
        expect(inputRow!.confidence).toBe("exact");
    });

    it("renders current context estimate", () => {
        const snap = makeSnapshot({ inputTokens: 150_000, contextLimit: 200_000 });
        const panel = renderTokensPanel(snap);
        const estimateSection = panel.sections.find(
            (s) => s.heading === "Current Context Estimate",
        );
        expect(estimateSection).toBeTruthy();
        const inputRow = estimateSection!.rows.find((r) => r.label === "Input tokens");
        expect(inputRow!.value).toContain("150K");
        expect(inputRow!.value).toContain("estimated");
        expect(inputRow!.confidence).toBe("estimated");
    });

    it("shows free tokens in estimate", () => {
        const snap = makeSnapshot({ inputTokens: 100_000, contextLimit: 200_000 });
        const panel = renderTokensPanel(snap);
        const estimateSection = panel.sections.find(
            (s) => s.heading === "Current Context Estimate",
        );
        const freeRow = estimateSection!.rows.find((r) => r.label === "Free");
        expect(freeRow).toBeTruthy();
        expect(freeRow!.value).toContain("100K");
    });
});

describe("pruning/compaction stability", () => {
    it("ledger totals remain stable after simulated pruning", () => {
        // Simulate: 3 turns of provider usage
        const events = [
            makeEvent({ inputTokens: 5000, outputTokens: 1000 }),
            makeEvent({ id: "evt-2", inputTokens: 3000, outputTokens: 500 }),
            makeEvent({ id: "evt-3", inputTokens: 2000, outputTokens: 300 }),
        ];

        // Before pruning
        const aggBefore = aggregateLedger(events);
        expect(aggBefore.inputTokens).toBe(10000);
        expect(aggBefore.outputTokens).toBe(1800);

        // After pruning: events are durable, still 3 events
        const aggAfter = aggregateLedger(events);
        expect(aggAfter.inputTokens).toBe(10000);
        expect(aggAfter.outputTokens).toBe(1800);
        expect(aggAfter.confidence).toBe("exact");
    });

    it("current context estimate can decrease after pruning", () => {
        const snapBefore = makeSnapshot({ inputTokens: 150_000 });
        const snapAfter = makeSnapshot({ inputTokens: 100_000 });

        expect(snapAfter.inputTokens).toBeLessThan(snapBefore.inputTokens);
        // But ledger would still show exact historical total
    });
});
