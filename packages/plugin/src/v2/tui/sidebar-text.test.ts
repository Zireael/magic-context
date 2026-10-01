import { expect, test } from "bun:test";
import { COMPACTION_ENABLED_PATH } from "../../config/agent-disable";
import type { SidebarSnapshot, StatusDetail } from "../../shared/rpc-types";
import { buildMagicContextSidebarView } from "../../shared/sidebar-view";
import { sidebarText, statusText } from "./index";

function snapshot(overrides: Partial<SidebarSnapshot>): SidebarSnapshot {
    return {
        sessionId: "ses-test",
        usagePercentage: 42,
        inputTokens: 4200,
        contextLimit: 10000,
        systemPromptTokens: 0,
        compartmentCount: 3,
        memoryCount: 7,
        memoryBlockCount: 2,
        pendingOpsCount: 1,
        historianRunning: false,
        lastTransformError: null,
        executeThreshold: 65,
        ...overrides,
    } as SidebarSnapshot;
}

test("compaction-off sidebar mirrors the v1 rows and native context label", () => {
    const text = sidebarText(
        snapshot({
            compaction_enabled: false,
            archivedCompartmentCount: 4,
            sessionNoteCount: 2,
            readySmartNoteCount: 1,
        }),
    );
    expect(text).toContain("Context: 42.0% · native compaction");
    expect(text).toContain("Memories 7");
    expect(text).toContain("Notes 2");
    expect(text).toContain("Archived compartments 4");
    expect(text).toContain("Smart Notes 1 ready");
    expect(text).not.toContain("Historian");
});

test("compaction-on sidebar states the historian and status rows the model publishes", () => {
    const text = sidebarText(snapshot({ compaction_enabled: true }));
    // The model publishes `C:`/`Q:`/`N:` as one Status row rather than merging
    // them into the Historian and Memories rows, which is what the fallback
    // used to do by hand.
    expect(text).toContain("Historian idle");
    expect(text).toContain("Memories 2/7");
    expect(text).toContain("Status C:3 Q:1 N:0");
    expect(text).not.toContain("native compaction");
});

test("compaction-on fallback prints the model's own rows, in the model's order", () => {
    const value = snapshot({ compaction_enabled: true });
    const text = sidebarText(value);
    const view = buildMagicContextSidebarView(value, {
        collapsed: true,
        sections: { historian: false, memory: false, status: false, dreamer: false, stats: false },
        headerLabel: "Magic Context",
    });
    // If the fallback re-derives wording again, it will print a line the model
    // never produced and stop printing one it did. Either way this fails.
    const modelLines = (view.collapsedSummary?.rows ?? []).map(
        (row) => `${row.label} ${row.value}`,
    );
    const pressure = view.overview?.pressure;
    const pressureLine = `${pressure?.primary}${pressure?.detail} ${pressure?.right}`.trim();
    // Exact equality, so a line the model never published — or a model line
    // the fallback quietly dropped — both fail here.
    expect(text.split("\n").slice(1)).toEqual([pressureLine, ...modelLines]);
});

test("compaction-on fallback tracks producer-side changes rather than fixed wording", () => {
    // The strongest form of the same claim: move the numbers, move the text.
    expect(sidebarText(snapshot({ compaction_enabled: true, memoryCount: 99 }))).toContain(
        "Memories 2/99",
    );
    expect(sidebarText(snapshot({ compaction_enabled: true, pendingOpsCount: 7 }))).toContain(
        "Q:7",
    );
    expect(sidebarText(snapshot({ compaction_enabled: true, compartmentCount: 12 }))).toContain(
        "C:12",
    );
    // A running historian is the model's wording, not the fallback's "running".
    expect(sidebarText(snapshot({ compaction_enabled: true, historianRunning: true }))).toContain(
        "Historian comparting \u27f3",
    );
});

test("status dialog prefixes the compaction-off notice", () => {
    const detail = {
        ...snapshot({ compaction_enabled: false }),
    } as unknown as StatusDetail;
    expect(statusText(detail)).toContain(
        `Compaction: disabled (${COMPACTION_ENABLED_PATH}: false) — native compaction owns the context window.`,
    );
    expect(statusText({ ...detail, compaction_enabled: true } as StatusDetail)).not.toContain(
        "Compaction: disabled",
    );
});

test("OpenCode 2 status reports the live config generation and parse failure", () => {
    const detail = {
        ...snapshot({}),
        configGeneration: 4,
        configAdoptedAt: 1730000000000,
        configReloadFailure: { path: "/tmp/magic-context.jsonc", message: "malformed" },
    } as StatusDetail;
    expect(statusText(detail)).toContain("Config generation: 4 (adopted ");
    expect(statusText(detail)).toContain(
        "Config reload failed /tmp/magic-context.jsonc: malformed",
    );
});
