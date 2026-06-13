/**
 * Semantic sidebar theme adapter.
 *
 * Resolves semantic color tokens from OpenCode theme or Magic Context presets.
 * All dense sidebar colors should use this adapter instead of hardcoded values.
 *
 * Theme sources:
 *   - follow_opencode: use OpenCode's current theme tokens
 *   - magic_default: Magic Context's default palette
 *   - monochrome: grayscale palette
 *   - high_contrast: high contrast palette
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SidebarThemeSource =
    | "follow_opencode"
    | "magic_default"
    | "monochrome"
    | "high_contrast";

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

export type RGBA = string;

export interface MagicSidebarPalette {
    text: RGBA;
    textMuted: RGBA;
    border: RGBA;
    panel: RGBA;
    selectedFg: RGBA;
    selectedBg: RGBA;
    ok: RGBA;
    info: RGBA;
    warning: RGBA;
    critical: RGBA;
    cold: RGBA;
    warm: RGBA;
    hot: RGBA;
    free: RGBA;
    threshold: RGBA;
    overflow: RGBA;
    cacheGood: RGBA;
    cacheDegraded: RGBA;
    cacheBad: RGBA;
    pulseActive: RGBA;
    pulseWarning: RGBA;
    pulseCritical: RGBA;
}

export interface OpenCodeThemeCurrent {
    primary: RGBA;
    secondary: RGBA;
    accent: RGBA;
    error: RGBA;
    warning: RGBA;
    success: RGBA;
    info: RGBA;
    text: RGBA;
    textMuted: RGBA;
    background: RGBA;
    backgroundPanel: RGBA;
    backgroundElement: RGBA;
    backgroundMenu: RGBA;
    border: RGBA;
    borderActive: RGBA;
    borderSubtle: RGBA;
    [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Built-in palettes
// ---------------------------------------------------------------------------

const MAGIC_DEFAULT_PALETTE: MagicSidebarPalette = {
    text: "#ffffff",
    textMuted: "#888888",
    border: "#444444",
    panel: "#1a1a2e",
    selectedFg: "#ffffff",
    selectedBg: "#3a3a5e",
    ok: "#34d399",
    info: "#60a5fa",
    warning: "#fbbf24",
    critical: "#f87171",
    cold: "#c084fc",
    warm: "#60a5fa",
    hot: "#fb923c",
    free: "#666666",
    threshold: "#ffffff",
    overflow: "#f87171",
    cacheGood: "#34d399",
    cacheDegraded: "#fbbf24",
    cacheBad: "#f87171",
    pulseActive: "#60a5fa",
    pulseWarning: "#fbbf24",
    pulseCritical: "#f87171",
};

const MONOCHROME_PALETTE: MagicSidebarPalette = {
    text: "#ffffff",
    textMuted: "#999999",
    border: "#555555",
    panel: "#222222",
    selectedFg: "#ffffff",
    selectedBg: "#444444",
    ok: "#cccccc",
    info: "#cccccc",
    warning: "#cccccc",
    critical: "#ffffff",
    cold: "#aaaaaa",
    warm: "#bbbbbb",
    hot: "#cccccc",
    free: "#666666",
    threshold: "#ffffff",
    overflow: "#ffffff",
    cacheGood: "#aaaaaa",
    cacheDegraded: "#bbbbbb",
    cacheBad: "#cccccc",
    pulseActive: "#aaaaaa",
    pulseWarning: "#bbbbbb",
    pulseCritical: "#ffffff",
};

const HIGH_CONTRAST_PALETTE: MagicSidebarPalette = {
    text: "#ffffff",
    textMuted: "#cccccc",
    border: "#ffffff",
    panel: "#000000",
    selectedFg: "#000000",
    selectedBg: "#ffffff",
    ok: "#00ff00",
    info: "#00ffff",
    warning: "#ffff00",
    critical: "#ff0000",
    cold: "#ff00ff",
    warm: "#00ffff",
    hot: "#ffff00",
    free: "#888888",
    threshold: "#ffffff",
    overflow: "#ff0000",
    cacheGood: "#00ff00",
    cacheDegraded: "#ffff00",
    cacheBad: "#ff0000",
    pulseActive: "#00ffff",
    pulseWarning: "#ffff00",
    pulseCritical: "#ff0000",
};

// ---------------------------------------------------------------------------
// Palette resolver
// ---------------------------------------------------------------------------

/**
 * Resolve a MagicSidebarPalette from OpenCode theme tokens.
 */
export function fromOpenCodeTheme(theme: OpenCodeThemeCurrent): MagicSidebarPalette {
    return {
        text: theme.text,
        textMuted: theme.textMuted,
        border: theme.border,
        panel: theme.backgroundPanel,
        selectedFg: theme.background,
        selectedBg: theme.accent,
        ok: theme.success,
        info: theme.info,
        warning: theme.warning,
        critical: theme.error,
        cold: theme.primary,
        warm: theme.secondary,
        hot: theme.warning,
        free: "#666666",
        threshold: theme.text,
        overflow: theme.error,
        cacheGood: theme.success,
        cacheDegraded: theme.warning,
        cacheBad: theme.error,
        pulseActive: theme.info,
        pulseWarning: theme.warning,
        pulseCritical: theme.error,
    };
}

/**
 * Get palette for a theme source.
 */
export function getPalette(
    source: SidebarThemeSource,
    openCodeTheme?: OpenCodeThemeCurrent,
): MagicSidebarPalette {
    switch (source) {
        case "follow_opencode":
            return openCodeTheme ? fromOpenCodeTheme(openCodeTheme) : MAGIC_DEFAULT_PALETTE;
        case "magic_default":
            return MAGIC_DEFAULT_PALETTE;
        case "monochrome":
            return MONOCHROME_PALETTE;
        case "high_contrast":
            return HIGH_CONTRAST_PALETTE;
        default:
            return MAGIC_DEFAULT_PALETTE;
    }
}

/**
 * Get a specific color token from a palette.
 */
export function getColor(palette: MagicSidebarPalette, token: SidebarColorToken): RGBA {
    return palette[token];
}
