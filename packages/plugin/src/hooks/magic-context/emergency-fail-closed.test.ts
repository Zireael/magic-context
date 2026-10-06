import { expect, it } from "bun:test";
import golden from "../../../../../crates/mc-module/tests/fixtures/protected-tool-refusal.json";
import {
    contextRefusalError,
    outgoingContextRefusal,
    PROTECTED_TOOL_RESULTS_OVER_LIMIT,
    PROTECTED_TOOL_RESULTS_OVER_LIMIT_CODE,
    protectedToolRefusal,
} from "./emergency-fail-closed";
import { evaluateEmergencyFailClosed } from "./transform-postprocess-phase";

it("protected overflow refusal matches the cross-language public contract", () => {
    expect(PROTECTED_TOOL_RESULTS_OVER_LIMIT_CODE).toBe(golden.code);
    expect(PROTECTED_TOOL_RESULTS_OVER_LIMIT).toBe(golden.message);
    expect(contextRefusalError(golden.message).code).toBe(golden.code);
    expect(protectedToolRefusal({ cause: { code: golden.code } })?.message).toBe(golden.message);
});

it("successful no-op reclaim refuses a trusted over-limit outgoing request before provider rejection", () => {
    const decision = evaluateEmergencyFailClosed({
        usagePercentage: 100,
        emergencyRecoveryArmed: false,
        emergencyRecoveryOrigin: null,
        foldMaterializedThisPass: false,
        finalWireEstimate: { tokens: 96000, trusted: true },
        contextLimitTokens: 16000,
        protectedToolTokens: 96000,
    });
    expect(decision.shouldAbort).toBe(true);
    expect(decision.refusalMessage).toBe(golden.message);
});

it("partial estimates and fitting reclaimed requests do not cause a new refusal", () => {
    expect(outgoingContextRefusal({ tokens: 96000, trusted: false }, 16000, 96000)).toBeUndefined();
    expect(outgoingContextRefusal({ tokens: 16000, trusted: true }, 16000)).toBeUndefined();
    expect(outgoingContextRefusal({ tokens: 2000, trusted: true }, undefined)).toBeUndefined();
    expect(outgoingContextRefusal({ tokens: 96000, trusted: true }, 16000)).toContain(
        "after reclaim",
    );
});
