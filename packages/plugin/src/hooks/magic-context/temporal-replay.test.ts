import { expect, it } from "bun:test";
import { join } from "node:path";
import {
    closeDatabase,
    openDatabase,
    updateSessionMeta,
} from "../../features/magic-context/storage";
import { createTagger } from "../../features/magic-context/tagger";
import { getTemporalDecisions } from "../../features/magic-context/temporal-decisions";
import { temporalLegacyTree } from "../../shared/temporal-legacy-test-fixture";
import { createTestTempDir } from "../../shared/test-temp-dir";
import { createHostSeams } from "../../v2/hooks/context";
import type { V2Context } from "../../v2/hooks/types";
import { resetLkgSlotsForTest } from "./lkg-slot";
import { createTransform } from "./transform";

it.each([
    "OpenCode 1",
    "OpenCode 2",
])("%s freezes user gap bytes across a cut and a restart", async (runtime) => {
    const root = createTestTempDir("temporal-replay-");
    let db = openDatabase(join(root.dir, "context.db"))!;
    const sessionId = `temporal-${runtime}`;
    const pending = new Set([sessionId]);
    const models = new Map([
        [sessionId, { providerID: "anthropic", modelID: "claude-sonnet-4-5" }],
    ]);
    const read = Object.assign(() => [], { readPage: () => [], getCount: () => 0 });
    const makeTransform = () =>
        createTransform({
            ...(runtime === "OpenCode 2"
                ? createHostSeams({} as V2Context, read, read, models)
                : {}),
            db,
            tagger: createTagger(),
            scheduler: { shouldExecute: () => "defer" },
            contextUsageMap: new Map(),
            historyRefreshSessions: new Set(),
            pendingMaterializationSessions: pending,
            lastHeuristicsTurnId: new Map(),
            experimentalTemporalAwareness: true,
            historianRunnable: false,
            liveModelBySession: models,
            protectedTokens: 0,
        });
    const user = {
        info: { id: "user", sessionID: sessionId, role: "user", time: { created: 600_000 } },
        parts: [{ type: "text", text: "question" }],
    };
    const assistant = {
        info: { id: "prior", role: "assistant", time: { created: 100_000, completed: 300_000 } },
        parts: [{ type: "text", text: "answer" }],
    };
    try {
        const rebuilt = structuredClone([assistant, user]);
        await makeTransform()({}, { messages: rebuilt });
        expect(rebuilt[1].parts[0].text).toContain("<!-- +5m -->");
        updateSessionMeta(db, sessionId, { lastResponseTime: Date.now(), cacheTtl: "59m" });
        closeDatabase();
        db = openDatabase(join(root.dir, "context.db"))!;
        resetLkgSlotsForTest();
        const cut = structuredClone([user]);
        await makeTransform()({}, { messages: cut });
        expect(cut[0].parts[0].text).toBe(rebuilt[1].parts[0].text);
        const newUser = {
            ...structuredClone(user),
            info: { ...user.info, id: "new", time: { created: 3_600_000 } },
        };
        const defer = structuredClone([user, newUser]);
        await makeTransform()({}, { messages: defer });
        expect(defer[1].parts[0].text).not.toContain("<!-- +");
        pending.add(sessionId);
        const priced = structuredClone([user, newUser]);
        await makeTransform()({}, { messages: priced });
        expect(priced[1].parts[0].text).toContain("<!-- +50m -->");
    } finally {
        closeDatabase();
        root.cleanup();
    }
});

it.each([
    "OpenCode 1",
    "OpenCode 2",
])("%s upgrade preserves every previously served marker on the first defer", async (runtime) => {
    const base = temporalLegacyTree();
    const oldStorage = await import(
        join(base, "packages/plugin/src/features/magic-context/storage.ts")
    );
    const oldTransform = await import(
        join(base, "packages/plugin/src/hooks/magic-context/transform.ts")
    );
    const oldTagger = await import(
        join(base, "packages/plugin/src/features/magic-context/tagger.ts")
    );
    const root = createTestTempDir("oc-temporal-upgrade-");
    const path = join(root.dir, "context.db");
    const sessionId = `upgrade-${runtime}`;
    let db = oldStorage.openDatabase(path);
    const pending = new Set([sessionId]);
    const models = new Map([
        [sessionId, { providerID: "anthropic", modelID: "claude-sonnet-4-5" }],
    ]);
    const raw = [
        {
            info: {
                id: "prior",
                sessionID: sessionId,
                role: "assistant",
                time: { created: 100_000, completed: 300_000 },
            },
            parts: [{ type: "text", text: "answer" }],
        },
        {
            info: { id: "user", sessionID: sessionId, role: "user", time: { created: 600_000 } },
            parts: [{ type: "text", text: "question" }],
        },
        {
            info: { id: "later", sessionID: sessionId, role: "user", time: { created: 1_200_000 } },
            parts: [{ type: "text", text: "follow up" }],
        },
    ];
    const read = Object.assign(() => [], { readPage: () => [], getCount: () => 0 });
    const deps = () => ({
        db,
        scheduler: { shouldExecute: () => "defer" as const },
        contextUsageMap: new Map(),
        historyRefreshSessions: new Set<string>(),
        pendingMaterializationSessions: pending,
        lastHeuristicsTurnId: new Map(),
        experimentalTemporalAwareness: true,
        historianRunnable: false,
        liveModelBySession: models,
        protectedTokens: 0,
    });
    try {
        const oldSeams =
            runtime === "OpenCode 2"
                ? (
                      await import(join(base, "packages/plugin/src/v2/hooks/context.ts"))
                  ).createHostSeams({}, read, read, models)
                : {};
        const served = structuredClone(raw);
        await oldTransform.createTransform({
            ...oldSeams,
            ...deps(),
            tagger: oldTagger.createTagger(),
        })({}, { messages: served });
        const before = served.filter((m) => m.info.role === "user").map((m) => m.parts[0].text);
        expect(before[0]).toContain("<!-- +5m -->");
        expect(before[1]).toContain("<!-- +10m -->");
        oldStorage.updateSessionMeta(db, sessionId, {
            lastResponseTime: Date.now(),
            cacheTtl: "59m",
        });
        oldStorage.closeDatabase();
        db = openDatabase(path)!;
        resetLkgSlotsForTest();
        const seams =
            runtime === "OpenCode 2" ? createHostSeams({} as V2Context, read, read, models) : {};
        const continued = structuredClone(raw);
        await createTransform({ ...seams, ...deps(), tagger: createTagger() })(
            {},
            { messages: continued },
        );
        expect(continued.filter((m) => m.info.role === "user").map((m) => m.parts[0].text)).toEqual(
            before,
        );
        expect(getTemporalDecisions(db, sessionId).get("user")).toBe("<!-- +5m -->\n");
        expect(getTemporalDecisions(db, sessionId).get("later")).toBe("<!-- +10m -->\n");
    } finally {
        oldStorage.closeDatabase();
        closeDatabase();
        root.cleanup();
    }
});
