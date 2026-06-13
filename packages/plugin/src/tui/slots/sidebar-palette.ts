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
// Packaged presets (derived from OpenCode default themes)
// License: OpenCode is MIT licensed. These reduced mappings preserve attribution.
// ---------------------------------------------------------------------------

const NORD_PALETTE: MagicSidebarPalette = {
    text: "#eceff4",
    textMuted: "#7b88a1",
    border: "#4c566a",
    panel: "#2e3440",
    selectedFg: "#eceff4",
    selectedBg: "#4c566a",
    ok: "#a3be8c",
    info: "#88c0d0",
    warning: "#ebcb8b",
    critical: "#bf616a",
    cold: "#b48ead",
    warm: "#81a1c1",
    hot: "#d08770",
    free: "#4c566a",
    threshold: "#eceff4",
    overflow: "#bf616a",
    cacheGood: "#a3be8c",
    cacheDegraded: "#ebcb8b",
    cacheBad: "#bf616a",
    pulseActive: "#88c0d0",
    pulseWarning: "#ebcb8b",
    pulseCritical: "#bf616a",
};

const GRUVBOX_PALETTE: MagicSidebarPalette = {
    text: "#ebdbb2",
    textMuted: "#928374",
    border: "#504945",
    panel: "#282828",
    selectedFg: "#ebdbb2",
    selectedBg: "#504945",
    ok: "#b8bb26",
    info: "#83a598",
    warning: "#fabd2f",
    critical: "#fb4934",
    cold: "#d3869b",
    warm: "#83a598",
    hot: "#fe8019",
    free: "#504945",
    threshold: "#ebdbb2",
    overflow: "#fb4934",
    cacheGood: "#b8bb26",
    cacheDegraded: "#fabd2f",
    cacheBad: "#fb4934",
    pulseActive: "#83a598",
    pulseWarning: "#fabd2f",
    pulseCritical: "#fb4934",
};

const CATPPUCCIN_PALETTE: MagicSidebarPalette = {
    text: "#cdd6f4",
    textMuted: "#6c7086",
    border: "#45475a",
    panel: "#1e1e2e",
    selectedFg: "#cdd6f4",
    selectedBg: "#45475a",
    ok: "#a6e3a1",
    info: "#89b4fa",
    warning: "#f9e2af",
    critical: "#f38ba8",
    cold: "#cba6f7",
    warm: "#89b4fa",
    hot: "#fab387",
    free: "#45475a",
    threshold: "#cdd6f4",
    overflow: "#f38ba8",
    cacheGood: "#a6e3a1",
    cacheDegraded: "#f9e2af",
    cacheBad: "#f38ba8",
    pulseActive: "#89b4fa",
    pulseWarning: "#f9e2af",
    pulseCritical: "#f38ba8",
};

const TOKYONIGHT_PALETTE: MagicSidebarPalette = {
    text: "#c0caf5",
    textMuted: "#565f89",
    border: "#3b4261",
    panel: "#1a1b26",
    selectedFg: "#c0caf5",
    selectedBg: "#3b4261",
    ok: "#9ece6a",
    info: "#7aa2f7",
    warning: "#e0af68",
    critical: "#f7768e",
    cold: "#bb9af7",
    warm: "#7aa2f7",
    hot: "#ff9e64",
    free: "#3b4261",
    threshold: "#c0caf5",
    overflow: "#f7768e",
    cacheGood: "#9ece6a",
    cacheDegraded: "#e0af68",
    cacheBad: "#f7768e",
    pulseActive: "#7aa2f7",
    pulseWarning: "#e0af68",
    pulseCritical: "#f7768e",
};

const GITHUB_PALETTE: MagicSidebarPalette = {
    text: "#f0f6fc",
    textMuted: "#8b949e",
    border: "#30363d",
    panel: "#0d1117",
    selectedFg: "#f0f6fc",
    selectedBg: "#30363d",
    ok: "#3fb950",
    info: "#58a6ff",
    warning: "#d29922",
    critical: "#f85149",
    cold: "#bc8cff",
    warm: "#58a6ff",
    hot: "#d29922",
    free: "#30363d",
    threshold: "#f0f6fc",
    overflow: "#f85149",
    cacheGood: "#3fb950",
    cacheDegraded: "#d29922",
    cacheBad: "#f85149",
    pulseActive: "#58a6ff",
    pulseWarning: "#d29922",
    pulseCritical: "#f85149",
};

// ---------------------------------------------------------------------------
// Preset registry
// ---------------------------------------------------------------------------

export type PackagedPresetName =
    | "magicDefault"
    | "monochrome"
    | "highContrast"
    | "nord"
    | "gruvbox"
    | "catppuccin"
    | "tokyonight"
    | "github";

export interface PackagedPresetInfo {
    name: PackagedPresetName;
    label: string;
    description: string;
}

const PACKAGED_PRESETS: Record<PackagedPresetName, MagicSidebarPalette> = {
    magicDefault: MAGIC_DEFAULT_PALETTE,
    monochrome: MONOCHROME_PALETTE,
    highContrast: HIGH_CONTRAST_PALETTE,
    nord: NORD_PALETTE,
    gruvbox: GRUVBOX_PALETTE,
    catppuccin: CATPPUCCIN_PALETTE,
    tokyonight: TOKYONIGHT_PALETTE,
    github: GITHUB_PALETTE,
};

export const PACKAGED_PRESET_INFO: PackagedPresetInfo[] = [
    { name: "magicDefault", label: "Magic Default", description: "Magic Context's default palette" },
    { name: "monochrome", label: "Monochrome", description: "Grayscale palette" },
    { name: "highContrast", label: "High Contrast", description: "High contrast for accessibility" },
    { name: "nord", label: "Nord", description: "Arctic, north-bluish clean and elegant" },
    { name: "gruvbox", label: "Gruvbox", description: "Retro groove warm color scheme" },
    { name: "catppuccin", label: "Catppuccin", description: "Soothing pastel theme" },
    { name: "tokyonight", label: "Tokyo Night", description: "Dark and vibrant" },
    { name: "github", label: "GitHub", description: "GitHub's dark theme colors" },
];

/**
 * Get a packaged preset palette by name.
 */
export function getPackagedPreset(name: PackagedPresetName): MagicSidebarPalette {
    return PACKAGED_PRESETS[name] ?? MAGIC_DEFAULT_PALETTE;
}

/**
 * Check if a name is a valid packaged preset.
 */
export function isPackagedPreset(name: string): name is PackagedPresetName {
    return name in PACKAGED_PRESETS;
}

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
