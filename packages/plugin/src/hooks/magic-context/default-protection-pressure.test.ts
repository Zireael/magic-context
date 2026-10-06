import { expect, it, spyOn } from "bun:test";
import golden from "./__fixtures__/default-protection-pressure.master.json";
import { defaultProtectionPressureScenario } from "./default-protection-pressure.test-support";

it("default protection preserves master wire bytes, folds and refusals under pressure", async () => {
    const clock = spyOn(Date, "now").mockReturnValue(1700000000000);
    try {
        const actual = await defaultProtectionPressureScenario();
        expect(actual).toEqual(golden.passes);
        expect(actual.filter((pass) => pass.fold).length).toBeGreaterThan(0);
        expect(actual.find((pass) => pass.stage === "pressure")?.refusal.shouldAbort).toBe(false);
        expect(actual.find((pass) => pass.stage === "provider-overflow")?.refusal.shouldAbort).toBe(
            true,
        );
    } finally {
        clock.mockRestore();
    }
});
