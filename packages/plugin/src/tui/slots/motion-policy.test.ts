import { describe, expect, it } from "bun:test";
import {
    getPulseStyle,
    getSeverityFromFlags,
    shouldPulseFlag,
    getPulseOpacity,
    type SidebarMotionMode,
} from "./motion-policy";

describe("getPulseStyle", () => {
    it("returns normal style for subtle motion", () => {
        const style = getPulseStyle("subtle", "normal");
        expect(style.animate).toBe(false);
        expect(style.blink).toBe(false);
    });

    it("returns active style with pulse for subtle motion", () => {
        const style = getPulseStyle("subtle", "active");
        expect(style.animate).toBe(true);
        expect(style.intervalMs).toBe(2000);
    });

    it("returns critical style with inverse for subtle motion", () => {
        const style = getPulseStyle("subtle", "critical");
        expect(style.animate).toBe(true);
        expect(style.useInverse).toBe(true);
        expect(style.blink).toBe(false);
    });

    it("returns no animation for reduced motion", () => {
        const style = getPulseStyle("reduced", "active");
        expect(style.animate).toBe(false);
    });

    it("returns no animation for off motion", () => {
        const style = getPulseStyle("off", "critical");
        expect(style.animate).toBe(false);
        expect(style.useInverse).toBe(true);
    });
});

describe("getSeverityFromFlags", () => {
    it("returns critical for T!", () => {
        expect(getSeverityFromFlags(["T!"])).toBe("critical");
    });

    it("returns critical for H!", () => {
        expect(getSeverityFromFlags(["H!"])).toBe("critical");
    });

    it("returns critical for C!", () => {
        expect(getSeverityFromFlags(["C!"])).toBe("critical");
    });

    it("returns critical for >", () => {
        expect(getSeverityFromFlags([">"])).toBe("critical");
    });

    it("returns warning for D?", () => {
        expect(getSeverityFromFlags(["D?"])).toBe("warning");
    });

    it("returns warning for M!", () => {
        expect(getSeverityFromFlags(["M!"])).toBe("warning");
    });

    it("returns active for HIST↻", () => {
        expect(getSeverityFromFlags(["HIST↻"])).toBe("active");
    });

    it("returns normal for no flags", () => {
        expect(getSeverityFromFlags([])).toBe("normal");
    });

    it("returns normal for non-critical flags", () => {
        expect(getSeverityFromFlags(["Q3"])).toBe("normal");
    });
});

describe("shouldPulseFlag", () => {
    it("returns true for critical flags in subtle mode", () => {
        expect(shouldPulseFlag("T!", "subtle")).toBe(true);
        expect(shouldPulseFlag("H!", "subtle")).toBe(true);
        expect(shouldPulseFlag("C!", "subtle")).toBe(true);
    });

    it("returns false for non-critical flags", () => {
        expect(shouldPulseFlag("HIST↻", "subtle")).toBe(false);
        expect(shouldPulseFlag("D?", "subtle")).toBe(false);
    });

    it("returns false for off motion", () => {
        expect(shouldPulseFlag("T!", "off")).toBe(false);
    });
});

describe("getPulseOpacity", () => {
    it("returns 1 for no animation", () => {
        const style = getPulseStyle("off", "normal");
        expect(getPulseOpacity(style, 0)).toBe(1);
    });

    it("returns midpoint at phase 0.25 for subtle active", () => {
        const style = getPulseStyle("subtle", "active");
        const opacity = getPulseOpacity(style, 0.25);
        expect(opacity).toBeGreaterThan(0.7);
        expect(opacity).toBeLessThanOrEqual(1);
    });

    it("returns value at phase 0 for subtle critical", () => {
        const style = getPulseStyle("subtle", "critical");
        const opacity = getPulseOpacity(style, 0);
        expect(opacity).toBe(0.75);
    });

    it("returns max at phase 0.5 for subtle critical", () => {
        const style = getPulseStyle("subtle", "critical");
        const opacity = getPulseOpacity(style, 0.5);
        expect(opacity).toBe(0.75);
    });
});
