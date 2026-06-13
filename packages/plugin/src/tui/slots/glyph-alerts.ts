/**
 * Glyph presets and critical alert styling for Dense sidebar.
 *
 * Implements PRD §6, §7.8, and §15.
 *
 * Glyph presets:
 *   - unicode: default, uses ✕ ▶ ▼ ⚡ etc.
 *   - nerd: optional, uses Nerd Font icons
 *   - ascii: fallback, uses plain ASCII
 *
 * Critical alert styling:
 *   - blink/inverse only for severe faults: C!, H!, T!, >, COLD>CTX
 *   - never blink volatile/hot segments decoratively
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GlyphPreset = "unicode" | "nerd" | "ascii";

export interface GlyphMap {
    // Navigation
    close: string;
    expand: string;
    collapse: string;

    // Status
    running: string;
    success: string;
    error: string;
    warning: string;

    // Actions
    details: string;
    status: string;
    mode: string;
    flush: string;

    // Bar
    barFilled: string;
    barEmpty: string;
    barThreshold: string;
    barOverflow: string;
}

// ---------------------------------------------------------------------------
// Glyph registries
// ---------------------------------------------------------------------------

const GLYPH_REGISTRY: Record<GlyphPreset, GlyphMap> = {
    unicode: {
        close: "✕",
        expand: "▶",
        collapse: "▼",
        running: "⟳",
        success: "✓",
        error: "✗",
        warning: "⚠",
        details: "D",
        status: "S",
        mode: "A",
        flush: "F",
        barFilled: "█",
        barEmpty: "░",
        barThreshold: "|",
        barOverflow: ">",
    },
    nerd: {
        close: "󰅖",
        expand: "▶",
        collapse: "▼",
        running: "⟳",
        success: "✓",
        error: "✗",
        warning: "⚠",
        details: "󰋫",
        status: "󰈈",
        mode: "󰒓",
        flush: "�켳",
        barFilled: "█",
        barEmpty: "░",
        barThreshold: "|",
        barOverflow: ">",
    },
    ascii: {
        close: "X",
        expand: ">",
        collapse: "v",
        running: "*",
        success: "ok",
        error: "!!",
        warning: "!",
        details: "D",
        status: "S",
        mode: "A",
        flush: "F",
        barFilled: "#",
        barEmpty: ".",
        barThreshold: "|",
        barOverflow: ">",
    },
};

/**
 * Get glyph map for a preset.
 */
export function getGlyphMap(preset: GlyphPreset): GlyphMap {
    return GLYPH_REGISTRY[preset] ?? GLYPH_REGISTRY.unicode;
}

// ---------------------------------------------------------------------------
// Critical alert styling
// ---------------------------------------------------------------------------

export type CriticalFault =
    | "C!" // cache degraded/repeated busts
    | "H!" // Historian failed/stalled
    | "T!" // token pressure/overflow
    | ">" // overflow beyond hard limit
    | "COLD>CTX"; // cold context exceeds usable window

/**
 * Check if a risk flag is a critical fault that may warrant blink/inverse.
 */
export function isCriticalFault(flag: string): flag is CriticalFault {
    return flag === "C!" || flag === "H!" || flag === "T!" || flag === ">" || flag === "COLD>CTX";
}

/**
 * Get the set of active critical faults from risk flags.
 */
export function getCriticalFaults(flags: string[]): CriticalFault[] {
    return flags.filter(isCriticalFault);
}

/**
 * Render a critical fault with inverse styling.
 * Returns the label and whether it should use inverse/background styling.
 */
export function renderCriticalFault(
    fault: CriticalFault,
    _glyphPreset: GlyphPreset = "unicode",
): { label: string; inverse: boolean } {
    return {
        label: fault,
        inverse: true,
    };
}

/**
 * Check if a segment should blink.
 * Only critical faults blink; volatile/hot segments never blink.
 */
export function shouldBlink(_fault: CriticalFault, _criticalBlinkOnly: boolean = true): boolean {
    // Always blink critical faults when policy allows
    return true;
}

/**
 * Check if a segment is volatile/hot and should NOT blink.
 */
export function isVolatileSegment(segmentKey: string): boolean {
    return segmentKey === "toolCalls" || segmentKey === "free";
}
