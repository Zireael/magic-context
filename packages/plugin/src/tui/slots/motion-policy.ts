/**
 * Reduced-motion aware pulse and severity styling policy.
 *
 * Implements controlled severity channel:
 *   - static color: normal status
 *   - slow pulse: active process or soft warning
 *   - strong pulse: degraded / act soon
 *   - blink / hard invert: critical / act now (only if enabled)
 *
 * Motion modes:
 *   - subtle: default, uses pulse animations
 *   - reduced: minimal motion, uses color changes only
 *   - off: no motion at all
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SidebarMotionMode = "subtle" | "reduced" | "off";

export type SeverityLevel = "normal" | "active" | "warning" | "critical";

export interface PulseStyle {
    /** Whether to apply any animation */
    animate: boolean;
    /** Pulse interval in milliseconds (0 = no pulse) */
    intervalMs: number;
    /** Opacity range for pulse [min, max] */
    opacityRange: [number, number];
    /** Whether to use inverse styling for critical */
    useInverse: boolean;
    /** Whether to blink for critical (requires blink support) */
    blink: boolean;
}

// ---------------------------------------------------------------------------
// Motion policy
// ---------------------------------------------------------------------------

const PULSE_STYLES: Record<SidebarMotionMode, Record<SeverityLevel, PulseStyle>> = {
    subtle: {
        normal: {
            animate: false,
            intervalMs: 0,
            opacityRange: [1, 1],
            useInverse: false,
            blink: false,
        },
        active: {
            animate: true,
            intervalMs: 2000,
            opacityRange: [0.7, 1],
            useInverse: false,
            blink: false,
        },
        warning: {
            animate: true,
            intervalMs: 1500,
            opacityRange: [0.6, 1],
            useInverse: false,
            blink: false,
        },
        critical: {
            animate: true,
            intervalMs: 1000,
            opacityRange: [0.5, 1],
            useInverse: true,
            blink: false,
        },
    },
    reduced: {
        normal: {
            animate: false,
            intervalMs: 0,
            opacityRange: [1, 1],
            useInverse: false,
            blink: false,
        },
        active: {
            animate: false,
            intervalMs: 0,
            opacityRange: [0.8, 1],
            useInverse: false,
            blink: false,
        },
        warning: {
            animate: false,
            intervalMs: 0,
            opacityRange: [0.7, 1],
            useInverse: false,
            blink: false,
        },
        critical: {
            animate: false,
            intervalMs: 0,
            opacityRange: [1, 1],
            useInverse: true,
            blink: false,
        },
    },
    off: {
        normal: {
            animate: false,
            intervalMs: 0,
            opacityRange: [1, 1],
            useInverse: false,
            blink: false,
        },
        active: {
            animate: false,
            intervalMs: 0,
            opacityRange: [1, 1],
            useInverse: false,
            blink: false,
        },
        warning: {
            animate: false,
            intervalMs: 0,
            opacityRange: [1, 1],
            useInverse: false,
            blink: false,
        },
        critical: {
            animate: false,
            intervalMs: 0,
            opacityRange: [1, 1],
            useInverse: true,
            blink: false,
        },
    },
};

/**
 * Get pulse style for a severity level and motion mode.
 */
export function getPulseStyle(
    motion: SidebarMotionMode,
    severity: SeverityLevel,
): PulseStyle {
    return PULSE_STYLES[motion]?.[severity] ?? PULSE_STYLES.off.normal;
}

/**
 * Determine severity level from risk flags.
 */
export function getSeverityFromFlags(flags: string[]): SeverityLevel {
    if (flags.includes("T!") || flags.includes("H!") || flags.includes("C!") || flags.includes(">")) {
        return "critical";
    }
    if (flags.includes("D?") || flags.includes("M!") || flags.includes("H?")) {
        return "warning";
    }
    if (flags.includes("HIST↻")) {
        return "active";
    }
    return "normal";
}

/**
 * Check if a specific risk flag should pulse.
 */
export function shouldPulseFlag(
    flag: string,
    motion: SidebarMotionMode,
): boolean {
    if (motion === "off") return false;
    // Only critical flags pulse
    return flag === "T!" || flag === "H!" || flag === "C!" || flag === ">" || flag === "COLD>CTX";
}

/**
 * Get the opacity for a specific frame of a pulse animation.
 * phase is 0-1 representing position in the pulse cycle.
 */
export function getPulseOpacity(style: PulseStyle, phase: number): number {
    if (!style.animate) return style.opacityRange[0];
    const [min, max] = style.opacityRange;
    // Sine wave between min and max
    const t = (Math.sin(phase * Math.PI * 2) + 1) / 2;
    return min + (max - min) * t;
}
