/**
 * Cache telemetry and Braille diagnostics for Dense sidebar.
 *
 * Implements PRD §6.6 (Cache Braille Row) and §7.7 (Cache Panel).
 *
 * Braille cache row:
 *   ⡀⣇⡄⣇⡆⡇⣇⣧⣷⣿   92.6%
 *
 * Rules:
 *   - Contiguous Braille cells (no spaces)
 *   - No blank Braille for 0% cache
 *   - Missing samples omitted or dim `·`
 *   - Fixed-width numeric suffix (1 d.p. when width permits)
 *   - Hidden if telemetry unavailable/stale
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CacheTelemetrySample {
    /** Cache hit ratio (0-1) */
    hitRatio: number;
    /** Timestamp of this sample */
    timestamp: number;
}

export interface CacheTelemetrySummary {
    /** Recent samples for trend rendering */
    samples: CacheTelemetrySample[];
    /** Overall hit ratio (0-1) if available */
    hitRatio: number | null;
    /** Whether telemetry is fresh (<5 min old) */
    fresh: boolean;
    /** Timestamp of last update */
    lastUpdated: number | null;
    /** Number of cache busts in recent window */
    bustCount: number;
    /** Source of telemetry */
    source: "provider" | "estimated" | "unavailable";
}

// ---------------------------------------------------------------------------
// Braille glyph mapping (PRD §6.6)
// ---------------------------------------------------------------------------

const BRAILLE_GLYPHS = [
    "⡀", // 0-12.5%
    "⡄", // 12.5-25%
    "⡆", // 25-37.5%
    "⡇", // 37.5-50%
    "⣇", // 50-62.5%
    "⣧", // 62.5-75%
    "⣷", // 75-87.5%
    "⣿", // 87.5-100%
] as const;

/**
 * Map a hit ratio (0-1) to a Braille glyph.
 */
export function hitRatioToBraille(hitRatio: number): string {
    const clamped = Math.max(0, Math.min(1, hitRatio));
    const index = Math.min(7, Math.floor(clamped * 8));
    return BRAILLE_GLYPHS[index];
}

/**
 * Render cache trend as contiguous Braille row.
 * Returns null if no valid samples.
 */
export function renderCacheBrailleRow(
    samples: CacheTelemetrySample[],
    width: number = 10,
): string | null {
    if (samples.length === 0) return null;

    // Take the most recent `width` samples
    const recent = samples.slice(-width);
    if (recent.length === 0) return null;

    // Build contiguous Braille string
    let row = "";
    for (const sample of recent) {
        row += hitRatioToBraille(sample.hitRatio);
    }

    return row;
}

/**
 * Render cache row with fixed suffix label.
 * Returns null if telemetry is unavailable.
 */
export function renderCacheRow(
    telemetry: CacheTelemetrySummary,
    width: number = 10,
): { braille: string; label: string } | null {
    if (!telemetry.fresh || telemetry.source === "unavailable") {
        return null;
    }
    if (telemetry.samples.length === 0) {
        return null;
    }

    const braille = renderCacheBrailleRow(telemetry.samples, width);
    if (!braille) return null;

    // Fixed suffix label with 1 decimal place
    const hitPct = telemetry.hitRatio != null ? `${(telemetry.hitRatio * 100).toFixed(1)}%` : "—";

    return { braille, label: hitPct };
}

// ---------------------------------------------------------------------------
// Cache Panel (PRD §7.7)
// ---------------------------------------------------------------------------

export interface CachePanelRow {
    label: string;
    value: string;
    accent?: boolean;
    warning?: boolean;
    dim?: boolean;
}

export interface CachePanelSection {
    heading?: string;
    rows: CachePanelRow[];
}

export interface CachePanelContent {
    title: string;
    sections: CachePanelSection[];
}

/**
 * Determine cache health status.
 */
export function getCacheHealth(
    telemetry: CacheTelemetrySummary,
): "excellent" | "degraded" | "critical" | "unavailable" {
    if (telemetry.source === "unavailable" || !telemetry.fresh) {
        return "unavailable";
    }
    if (telemetry.hitRatio == null) return "unavailable";
    if (telemetry.hitRatio >= 0.75) return "excellent";
    if (telemetry.hitRatio >= 0.5) return "degraded";
    return "critical";
}

/**
 * Render Cache diagnostics panel.
 */
export function renderCachePanel(telemetry: CacheTelemetrySummary): CachePanelContent {
    const sections: CachePanelSection[] = [];
    const health = getCacheHealth(telemetry);

    // Health status
    sections.push({
        heading: "Status",
        rows: [
            {
                label: "Health",
                value: health,
                accent: health === "excellent",
                warning: health === "critical" || health === "degraded",
                dim: health === "unavailable",
            },
        ],
    });

    // Hit rate
    if (telemetry.hitRatio != null && telemetry.fresh) {
        sections.push({
            heading: "Hit Rate",
            rows: [
                {
                    label: "Current",
                    value: `${(telemetry.hitRatio * 100).toFixed(1)}%`,
                    accent: telemetry.hitRatio >= 0.75,
                    warning: telemetry.hitRatio < 0.5,
                },
                {
                    label: "Samples",
                    value: String(telemetry.samples.length),
                },
            ],
        });
    } else {
        sections.push({
            heading: "Hit Rate",
            rows: [{ label: "Status", value: "unavailable", dim: true }],
        });
    }

    // Bust diagnostics
    if (telemetry.bustCount > 0) {
        sections.push({
            heading: "Diagnostics",
            rows: [
                {
                    label: "Cache busts",
                    value: String(telemetry.bustCount),
                    warning: true,
                },
            ],
        });
    }

    // Last updated
    if (telemetry.lastUpdated) {
        const age = Date.now() - telemetry.lastUpdated;
        const ageStr =
            age < 60_000
                ? "just now"
                : age < 3_600_000
                  ? `${Math.floor(age / 60_000)}m ago`
                  : `${Math.floor(age / 3_600_000)}h ago`;
        sections.push({
            rows: [{ label: "Last updated", value: ageStr, dim: true }],
        });
    }

    return { title: "Cache", sections };
}
