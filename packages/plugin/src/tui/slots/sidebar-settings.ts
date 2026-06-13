/**
 * Shared sidebar settings contract for Dashboard and TUI.
 *
 * Defines the `tui.sidebar.*` config subtree schema and parser.
 * Both Dashboard and TUI consume the same types and resolver.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SidebarDisplayMode = "expanded" | "classic_collapsed" | "dense_collapsed";

export type SidebarThemeSource =
    | "follow_opencode"
    | "magic_default"
    | "packaged_preset"
    | "monochrome"
    | "high_contrast";

export type SidebarMotionMode = "subtle" | "reduced" | "off";

export type SidebarGlyphPreset = "auto" | "unicode" | "nerd" | "ascii";

export type SidebarColorToken =
    | "text"
    | "textMuted"
    | "border"
    | "panel"
    | "selectedFg"
    | "selectedBg"
    | "ok"
    | "info"
    | "warning"
    | "critical"
    | "cold"
    | "warm"
    | "hot"
    | "free"
    | "threshold"
    | "overflow"
    | "cacheGood"
    | "cacheDegraded"
    | "cacheBad"
    | "pulseActive"
    | "pulseWarning"
    | "pulseCritical";

export type ColorOverrides = Partial<Record<SidebarColorToken, string>>;

export interface SidebarSettings {
    displayMode: {
        default: SidebarDisplayMode;
        persistUserOverride: boolean;
    };
    denseCollapsed: {
        enabled: boolean;
        cacheTrend: "auto" | "on" | "off";
        thresholdMarker: boolean;
        percentLabel: "suffix" | "inline" | "none";
    };
    theme: {
        source: SidebarThemeSource;
        preset: string;
        overrides: ColorOverrides;
    };
    motion: {
        mode: SidebarMotionMode;
        respectReducedMotion: boolean;
    };
    glyphs: {
        preset: SidebarGlyphPreset;
    };
    alerts: {
        blinkCritical: "auto" | "on" | "off";
        pulse: SidebarMotionMode;
    };
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_SIDEBAR_SETTINGS: SidebarSettings = {
    displayMode: {
        default: "classic_collapsed",
        persistUserOverride: true,
    },
    denseCollapsed: {
        enabled: true,
        cacheTrend: "auto",
        thresholdMarker: true,
        percentLabel: "suffix",
    },
    theme: {
        source: "follow_opencode",
        preset: "opencode",
        overrides: {},
    },
    motion: {
        mode: "subtle",
        respectReducedMotion: true,
    },
    glyphs: {
        preset: "unicode",
    },
    alerts: {
        blinkCritical: "auto",
        pulse: "subtle",
    },
};

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const VALID_DISPLAY_MODES: ReadonlySet<string> = new Set([
    "expanded",
    "classic_collapsed",
    "dense_collapsed",
]);

const VALID_THEME_SOURCES: ReadonlySet<string> = new Set([
    "follow_opencode",
    "magic_default",
    "packaged_preset",
    "monochrome",
    "high_contrast",
]);

const VALID_MOTION_MODES: ReadonlySet<string> = new Set([
    "subtle",
    "reduced",
    "off",
]);

const VALID_GLYPH_PRESETS: ReadonlySet<string> = new Set([
    "auto",
    "unicode",
    "nerd",
    "ascii",
]);

function isValidDisplayMode(v: unknown): v is SidebarDisplayMode {
    return typeof v === "string" && VALID_DISPLAY_MODES.has(v);
}

function isValidThemeSource(v: unknown): v is SidebarThemeSource {
    return typeof v === "string" && VALID_THEME_SOURCES.has(v);
}

function isValidMotionMode(v: unknown): v is SidebarMotionMode {
    return typeof v === "string" && VALID_MOTION_MODES.has(v);
}

function isValidGlyphPreset(v: unknown): v is SidebarGlyphPreset {
    return typeof v === "string" && VALID_GLYPH_PRESETS.has(v);
}

function isValidColor(v: unknown): v is string {
    if (typeof v !== "string") return false;
    return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v);
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse sidebar settings from raw config, applying defaults for missing/invalid values.
 */
export function parseSidebarSettings(raw: unknown): SidebarSettings {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return structuredClone(DEFAULT_SIDEBAR_SETTINGS);
    }

    const obj = raw as Record<string, unknown>;
    const result: SidebarSettings = structuredClone(DEFAULT_SIDEBAR_SETTINGS);

    // displayMode
    if (obj.displayMode && typeof obj.displayMode === "object") {
        const dm = obj.displayMode as Record<string, unknown>;
        if (isValidDisplayMode(dm.default)) {
            result.displayMode.default = dm.default;
        }
        if (typeof dm.persistUserOverride === "boolean") {
            result.displayMode.persistUserOverride = dm.persistUserOverride;
        }
    }

    // denseCollapsed
    if (obj.denseCollapsed && typeof obj.denseCollapsed === "object") {
        const dc = obj.denseCollapsed as Record<string, unknown>;
        if (typeof dc.enabled === "boolean") {
            result.denseCollapsed.enabled = dc.enabled;
        }
        if (dc.cacheTrend === "auto" || dc.cacheTrend === "on" || dc.cacheTrend === "off") {
            result.denseCollapsed.cacheTrend = dc.cacheTrend;
        }
        if (typeof dc.thresholdMarker === "boolean") {
            result.denseCollapsed.thresholdMarker = dc.thresholdMarker;
        }
        if (dc.percentLabel === "suffix" || dc.percentLabel === "inline" || dc.percentLabel === "none") {
            result.denseCollapsed.percentLabel = dc.percentLabel;
        }
    }

    // theme
    if (obj.theme && typeof obj.theme === "object") {
        const th = obj.theme as Record<string, unknown>;
        if (isValidThemeSource(th.source)) {
            result.theme.source = th.source;
        }
        if (typeof th.preset === "string") {
            result.theme.preset = th.preset;
        }
        if (th.overrides && typeof th.overrides === "object" && !Array.isArray(th.overrides)) {
            const overrides: ColorOverrides = {};
            for (const [key, value] of Object.entries(th.overrides)) {
                if (isValidColor(value)) {
                    overrides[key as SidebarColorToken] = value;
                }
            }
            result.theme.overrides = overrides;
        }
    }

    // motion
    if (obj.motion && typeof obj.motion === "object") {
        const mo = obj.motion as Record<string, unknown>;
        if (isValidMotionMode(mo.mode)) {
            result.motion.mode = mo.mode;
        }
        if (typeof mo.respectReducedMotion === "boolean") {
            result.motion.respectReducedMotion = mo.respectReducedMotion;
        }
    }

    // glyphs
    if (obj.glyphs && typeof obj.glyphs === "object") {
        const gl = obj.glyphs as Record<string, unknown>;
        if (isValidGlyphPreset(gl.preset)) {
            result.glyphs.preset = gl.preset;
        }
    }

    // alerts
    if (obj.alerts && typeof obj.alerts === "object") {
        const al = obj.alerts as Record<string, unknown>;
        if (al.blinkCritical === "auto" || al.blinkCritical === "on" || al.blinkCritical === "off") {
            result.alerts.blinkCritical = al.blinkCritical;
        }
        if (isValidMotionMode(al.pulse)) {
            result.alerts.pulse = al.pulse;
        }
    }

    return result;
}

/**
 * Extract tui.sidebar subtree from full config.
 */
export function extractTuiSidebar(raw: unknown): unknown {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const config = raw as Record<string, unknown>;
    const tui = config.tui;
    if (!tui || typeof tui !== "object" || Array.isArray(tui)) return undefined;
    return (tui as Record<string, unknown>).sidebar;
}
