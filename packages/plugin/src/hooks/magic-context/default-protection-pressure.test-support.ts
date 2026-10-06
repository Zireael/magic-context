import { appendCompartments } from "../../features/magic-context/compartment-storage";
import { getOrCreateSessionMeta } from "../../features/magic-context/storage";
import { initializeDatabase } from "../../features/magic-context/storage-db";
import { createTagger } from "../../features/magic-context/tagger";
import { Database } from "../../shared/sqlite";
import { injectM0M1 } from "./inject-compartments";
import type { MessageLike } from "./tag-messages";
import { evaluateEmergencyFailClosed, runPostTransformPhase } from "./transform-postprocess-phase";

/** Deterministic inputs for the pre-protection master wire/decision oracle. No
 * protected tool names occur, so the default keep counts must be irrelevant. */
export async function defaultProtectionPressureScenario(
    engine = {
        injectM0M1,
        runPostTransformPhase,
        evaluateEmergencyFailClosed,
    },
) {
    const db = new Database(":memory:");
    initializeDatabase(db);
    const sessionId = "default-pressure-parity";
    const project = "/fixture/default-pressure-parity";
    const hardSignals = {
        systemHash: "system-v1",
        modelKey: "anthropic/claude-fable-5-1",
        cacheExpired: false,
        lastResponseTime: 0,
    };
    const rawMessages = [
        {
            info: { id: "u1", role: "user" },
            parts: [{ type: "text", text: "Investigate pressure." }],
        },
        {
            info: { id: "a1", role: "assistant" },
            parts: [{ type: "text", text: "An ordinary unprotected answer." }],
        },
        {
            info: { id: "u2", role: "user" },
            parts: [{ type: "text", text: "Continue the investigation." }],
        },
    ] as MessageLike[];
    const records = [];
    const pending = new Set<string>();
    const deferred = new Set<string>();
    const materializations = new Set<string>();
    const tagger = createTagger();
    let modelKey = hardSignals.modelKey;
    try {
        // Start past first_render so the pressure pass is not accidentally defended
        // only by bootstrap, then publish real coverage and execute a HARD fold.
        engine.injectM0M1({
            db,
            sessionId,
            state: getOrCreateSessionMeta(db, sessionId),
            projectPath: project,
            projectDirectory: project,
            historyBudgetTokens: 8000,
            isCacheBustingPass: true,
            hardSignals,
        });
        for (const stage of [
            "pressure",
            "fold",
            "provider-overflow",
            "fold-after-overflow",
            "defer",
        ] as const) {
            // Hosts supply their stored transcript anew; transformed synthetic heads
            // are not the input of the next pass.
            const messages = structuredClone(rawMessages);
            if (stage === "fold") {
                appendCompartments(db, sessionId, [
                    {
                        sequence: 0,
                        startMessage: 1,
                        endMessage: 2,
                        startMessageId: "u1",
                        endMessageId: "a1",
                        title: "Investigation",
                        content:
                            "The investigation is summarized; continue from the retained user turn.",
                        p1: "The investigation is summarized; continue from the retained user turn.",
                        p2: "The investigation is summarized; continue from the retained user turn.",
                        p3: "The investigation is summarized; continue from the retained user turn.",
                        p4: "The investigation is summarized; continue from the retained user turn.",
                    },
                ]);
            }
            const folding = stage === "fold" || stage === "fold-after-overflow";
            if (folding) modelKey = `anthropic/${stage}`;
            const percentage = stage === "defer" ? 20 : 96;
            const result = await engine.runPostTransformPhase({
                sessionId,
                db,
                messages,
                tags: [],
                targets: new Map(),
                reasoningByMessage: new Map(),
                messageTagNumbers: new Map(),
                tagger,
                ctxReduceAvailability: { callable: true, frozen: true },
                todowriteAvailability: { callable: true, frozen: true },
                batch: null,
                contextUsage: { percentage, inputTokens: 96000 },
                usableWindow: 80000,
                schedulerDecision: stage === "defer" ? "defer" : "execute",
                schedulerDeferReason: "scheduler_defer",
                fullFeatureMode: true,
                canRunCompartments: false,
                awaitedCompartmentRun: false,
                phaseJustAwaitedPublication: false,
                compartmentInProgress: false,
                historyRefreshExplicitBeforePrepare: false,
                deferredHistoryWasPendingAtPassStart: false,
                compartmentInjectionRebuiltFromDb: false,
                rebuiltHistoryFromInitialPrepare: false,
                historyRebuiltThisPass: false,
                canConsumeDeferredLate: false,
                sessionMeta: getOrCreateSessionMeta(db, sessionId),
                currentTurnId: null,
                pendingMaterializationSessions: pending,
                deferredHistoryRefreshSessions: deferred,
                deferredMaterializationSessions: materializations,
                lastHeuristicsTurnId: new Map(),
                clearReasoningAge: 999,
                protectedTagIds: new Set(),
                protectedTagNumbers: new Set(),
                protectedCutoff: null,
                protectedCount: 0,
                pendingCompartmentInjection: null,
                didMutateFromFlushedStatuses: false,
                watermark: 0,
                forceMaterializationPercentage: 85,
                hasRecentReduceCall: false,
                m0M1: {
                    projectPath: project,
                    projectDirectory: project,
                    historyBudgetTokens: 8000,
                    hardSignals: { ...hardSignals, modelKey },
                },
            });
            const refusal = engine.evaluateEmergencyFailClosed({
                usagePercentage: percentage,
                emergencyRecoveryArmed:
                    stage === "provider-overflow" || stage === "fold-after-overflow",
                emergencyRecoveryOrigin:
                    stage === "provider-overflow" || stage === "fold-after-overflow"
                        ? "provider_overflow"
                        : null,
                foldMaterializedThisPass: result.materialized,
                // An accepted provider reply may report input above the configured
                // window. It cannot originate a new refusal with no protected mass.
                finalWireEstimate: {
                    tokens: 96000,
                    trusted: true,
                    refusalGrade: true,
                    refusalTokens: 96000,
                },
                contextLimitTokens: 80000,
                providerProvenLimitTokens: 80000,
                protectedToolTokens: 0,
            });
            records.push({
                stage,
                wireBytes: JSON.stringify(messages),
                fold: result.materialized,
                refusal,
            });
        }
        return records;
    } finally {
        db.close();
    }
}
