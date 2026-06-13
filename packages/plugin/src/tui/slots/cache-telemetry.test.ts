import { describe, expect, it } from "bun:test";
import {
    type CacheTelemetrySample,
    type CacheTelemetrySummary,
    getCacheHealth,
    hitRatioToBraille,
    renderCacheBrailleRow,
    renderCachePanel,
    renderCacheRow,
} from "./cache-telemetry";

function makeSample(hitRatio: number, minutesAgo: number = 0): CacheTelemetrySample {
    return {
        hitRatio,
        timestamp: Date.now() - minutesAgo * 60_000,
    };
}

function makeTelemetry(overrides: Partial<CacheTelemetrySummary> = {}): CacheTelemetrySummary {
    return {
        samples: [makeSample(0.9), makeSample(0.85), makeSample(0.92)],
        hitRatio: 0.89,
        fresh: true,
        lastUpdated: Date.now() - 60_000,
        bustCount: 0,
        source: "provider",
        ...overrides,
    };
}

describe("hitRatioToBraille", () => {
    it("maps 0% to ⡀", () => {
        expect(hitRatioToBraille(0)).toBe("⡀");
    });

    it("maps 50% to ⣇", () => {
        expect(hitRatioToBraille(0.5)).toBe("⣇");
    });

    it("maps 100% to ⣿", () => {
        expect(hitRatioToBraille(1)).toBe("⣿");
    });

    it("clamps negative values", () => {
        expect(hitRatioToBraille(-0.5)).toBe("⡀");
    });

    it("clamps values above 1", () => {
        expect(hitRatioToBraille(1.5)).toBe("⣿");
    });
});

describe("renderCacheBrailleRow", () => {
    it("renders contiguous Braille", () => {
        const samples = [makeSample(0.9), makeSample(0.85), makeSample(0.92)];
        const row = renderCacheBrailleRow(samples);
        expect(row).toBeTruthy();
        expect(row!.length).toBe(3);
        // No spaces between glyphs
        expect(row).not.toContain(" ");
    });

    it("returns null for empty samples", () => {
        expect(renderCacheBrailleRow([])).toBeNull();
    });

    it("limits to width", () => {
        const samples = Array.from({ length: 20 }, (_, i) => makeSample(0.5 + i * 0.02));
        const row = renderCacheBrailleRow(samples, 5);
        expect(row!.length).toBe(5);
    });
});

describe("renderCacheRow", () => {
    it("renders row with fresh telemetry", () => {
        const telemetry = makeTelemetry();
        const row = renderCacheRow(telemetry);
        expect(row).toBeTruthy();
        expect(row!.braille).toBeTruthy();
        expect(row!.label).toContain("%");
    });

    it("returns null for unavailable telemetry", () => {
        const telemetry = makeTelemetry({ source: "unavailable" });
        expect(renderCacheRow(telemetry)).toBeNull();
    });

    it("returns null for stale telemetry", () => {
        const telemetry = makeTelemetry({ fresh: false });
        expect(renderCacheRow(telemetry)).toBeNull();
    });

    it("returns null for no samples", () => {
        const telemetry = makeTelemetry({ samples: [] });
        expect(renderCacheRow(telemetry)).toBeNull();
    });
});

describe("getCacheHealth", () => {
    it("returns excellent for high hit ratio", () => {
        const telemetry = makeTelemetry({ hitRatio: 0.9 });
        expect(getCacheHealth(telemetry)).toBe("excellent");
    });

    it("returns degraded for medium hit ratio", () => {
        const telemetry = makeTelemetry({ hitRatio: 0.6 });
        expect(getCacheHealth(telemetry)).toBe("degraded");
    });

    it("returns critical for low hit ratio", () => {
        const telemetry = makeTelemetry({ hitRatio: 0.3 });
        expect(getCacheHealth(telemetry)).toBe("critical");
    });

    it("returns unavailable for no telemetry", () => {
        const telemetry = makeTelemetry({ source: "unavailable" });
        expect(getCacheHealth(telemetry)).toBe("unavailable");
    });

    it("returns unavailable for stale telemetry", () => {
        const telemetry = makeTelemetry({ fresh: false });
        expect(getCacheHealth(telemetry)).toBe("unavailable");
    });
});

describe("renderCachePanel", () => {
    it("renders excellent state", () => {
        const telemetry = makeTelemetry({ hitRatio: 0.9 });
        const panel = renderCachePanel(telemetry);
        expect(panel.title).toBe("Cache");
        const statusSection = panel.sections.find((s) => s.heading === "Status");
        expect(statusSection!.rows[0].accent).toBe(true);
    });

    it("renders critical state", () => {
        const telemetry = makeTelemetry({ hitRatio: 0.3 });
        const panel = renderCachePanel(telemetry);
        const statusSection = panel.sections.find((s) => s.heading === "Status");
        expect(statusSection!.rows[0].warning).toBe(true);
    });

    it("renders unavailable state", () => {
        const telemetry = makeTelemetry({ source: "unavailable" });
        const panel = renderCachePanel(telemetry);
        const statusSection = panel.sections.find((s) => s.heading === "Status");
        expect(statusSection!.rows[0].dim).toBe(true);
    });

    it("shows bust count when present", () => {
        const telemetry = makeTelemetry({ bustCount: 5 });
        const panel = renderCachePanel(telemetry);
        const diagSection = panel.sections.find((s) => s.heading === "Diagnostics");
        expect(diagSection).toBeTruthy();
        expect(diagSection!.rows[0].value).toBe("5");
    });

    it("hides bust section when zero", () => {
        const telemetry = makeTelemetry({ bustCount: 0 });
        const panel = renderCachePanel(telemetry);
        const diagSection = panel.sections.find((s) => s.heading === "Diagnostics");
        expect(diagSection).toBeFalsy();
    });
});
