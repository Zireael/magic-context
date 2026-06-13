import { describe, expect, it } from "bun:test";
import {
    type GlyphPreset,
    getCriticalFaults,
    getGlyphMap,
    isCriticalFault,
    isVolatileSegment,
    renderCriticalFault,
    shouldBlink,
} from "./glyph-alerts";

describe("getGlyphMap", () => {
    it("returns unicode glyphs by default", () => {
        const map = getGlyphMap("unicode");
        expect(map.close).toBe("✕");
        expect(map.barFilled).toBe("█");
        expect(map.barEmpty).toBe("░");
    });

    it("returns ascii fallback", () => {
        const map = getGlyphMap("ascii");
        expect(map.close).toBe("X");
        expect(map.barFilled).toBe("#");
        expect(map.barEmpty).toBe(".");
    });

    it("returns nerd glyphs", () => {
        const map = getGlyphMap("nerd");
        expect(map.close).toBeTruthy();
        expect(map.barFilled).toBe("█");
    });

    it("falls back to unicode for unknown preset", () => {
        const map = getGlyphMap("unknown" as GlyphPreset);
        expect(map.close).toBe("✕");
    });
});

describe("isCriticalFault", () => {
    it("identifies C! as critical", () => {
        expect(isCriticalFault("C!")).toBe(true);
    });

    it("identifies H! as critical", () => {
        expect(isCriticalFault("H!")).toBe(true);
    });

    it("identifies T! as critical", () => {
        expect(isCriticalFault("T!")).toBe(true);
    });

    it("identifies > as critical", () => {
        expect(isCriticalFault(">")).toBe(true);
    });

    it("identifies COLD>CTX as critical", () => {
        expect(isCriticalFault("COLD>CTX")).toBe(true);
    });

    it("rejects non-critical flags", () => {
        expect(isCriticalFault("HIST↻")).toBe(false);
        expect(isCriticalFault("D?")).toBe(false);
        expect(isCriticalFault("M!")).toBe(false);
        expect(isCriticalFault("Q3")).toBe(false);
    });
});

describe("getCriticalFaults", () => {
    it("filters only critical faults", () => {
        const flags = ["T!", "HIST↻", "C!", "D?"];
        const critical = getCriticalFaults(flags);
        expect(critical).toEqual(["T!", "C!"]);
    });

    it("returns empty for no critical faults", () => {
        const flags = ["HIST↻", "D?", "M!"];
        expect(getCriticalFaults(flags)).toEqual([]);
    });
});

describe("renderCriticalFault", () => {
    it("renders C! with inverse styling", () => {
        const result = renderCriticalFault("C!");
        expect(result.label).toBe("C!");
        expect(result.inverse).toBe(true);
    });

    it("renders H! with inverse styling", () => {
        const result = renderCriticalFault("H!");
        expect(result.label).toBe("H!");
        expect(result.inverse).toBe(true);
    });

    it("renders T! with inverse styling", () => {
        const result = renderCriticalFault("T!");
        expect(result.inverse).toBe(true);
    });
});

describe("shouldBlink", () => {
    it("returns true for critical faults", () => {
        expect(shouldBlink("C!")).toBe(true);
        expect(shouldBlink("H!")).toBe(true);
        expect(shouldBlink("T!")).toBe(true);
    });
});

describe("isVolatileSegment", () => {
    it("identifies toolCalls as volatile", () => {
        expect(isVolatileSegment("toolCalls")).toBe(true);
    });

    it("identifies free as volatile", () => {
        expect(isVolatileSegment("free")).toBe(true);
    });

    it("rejects non-volatile segments", () => {
        expect(isVolatileSegment("system")).toBe(false);
        expect(isVolatileSegment("conversation")).toBe(false);
        expect(isVolatileSegment("memories")).toBe(false);
    });
});
