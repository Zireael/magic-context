/**
 * Sidebar display mode persistence.
 *
 * Three modes: expanded, classic_collapsed, dense_collapsed.
 * Classic collapsed is the default. Dense is opt-in.
 *
 * Persistence model (generalized from PR #93's boolean collapse pattern):
 *   - configDefault: from magic-context.jsonc (or classic_collapsed if unset)
 *   - persistedValue: user's last manual selection (if any)
 *   - userSet: whether the user has explicitly chosen a mode
 *
 * Resolution: userSet ? persistedValue : configDefault
 *
 * Old boolean collapse keys (mc-sidebar-collapsed / mc-sidebar-collapsed-user-set)
 * from PR #93 experimental builds are ignored — stale boolean `true` must not
 * accidentally force dense mode.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type SidebarDisplayMode = "expanded" | "classic_collapsed" | "dense_collapsed";

const VALID_MODES: ReadonlySet<string> = new Set([
    "expanded",
    "classic_collapsed",
    "dense_collapsed",
]);

export const DEFAULT_DISPLAY_MODE: SidebarDisplayMode = "classic_collapsed";

function getStorageDir(): string {
    const dataDir = process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share");
    return join(dataDir, "cortexkit", "magic-context");
}

function getStateFilePath(directory: string): string {
    const storageDir = getStorageDir();
    // Use directory hash to namespace per-project state
    const dirHash = Buffer.from(directory).toString("base64url").slice(0, 16);
    return join(storageDir, `sidebar-state-${dirHash}.json`);
}

interface PersistedDisplayState {
    value: SidebarDisplayMode;
    userSet: boolean;
}

function isValidMode(value: unknown): value is SidebarDisplayMode {
    return typeof value === "string" && VALID_MODES.has(value);
}

/**
 * Read the persisted display state for a project directory.
 * Returns null if no state file exists or the file is corrupt.
 */
export function readDisplayState(directory: string): PersistedDisplayState | null {
    if (!directory) return null;
    const filePath = getStateFilePath(directory);
    if (!existsSync(filePath)) return null;
    try {
        const raw = readFileSync(filePath, "utf-8");
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (!isValidMode(parsed.value)) return null;
        return {
            value: parsed.value,
            userSet: parsed.userSet === true,
        };
    } catch {
        return null;
    }
}

/**
 * Write the persisted display state for a project directory.
 */
export function writeDisplayState(directory: string, state: PersistedDisplayState): void {
    if (!directory) return;
    const filePath = getStateFilePath(directory);
    try {
        mkdirSync(dirname(filePath), { recursive: true });
        writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`);
    } catch {
        // Non-fatal: persistence failure degrades to config default
    }
}

/**
 * Resolve the effective display mode for a project directory.
 *
 * Priority:
 *   1. Persisted user choice (if userSet is true and value is valid)
 *   2. Config default (if valid)
 *   3. DEFAULT_DISPLAY_MODE (classic_collapsed)
 */
export function resolveDisplayMode(
    directory: string,
    configDefault?: SidebarDisplayMode,
): SidebarDisplayMode {
    const persisted = readDisplayState(directory);
    if (persisted?.userSet && isValidMode(persisted.value)) {
        return persisted.value;
    }
    if (isValidMode(configDefault)) {
        return configDefault;
    }
    return DEFAULT_DISPLAY_MODE;
}

/**
 * Persist a user-selected display mode.
 * Sets userSet=true so this choice overrides config default on next load.
 */
export function persistDisplayMode(directory: string, mode: SidebarDisplayMode): void {
    writeDisplayState(directory, { value: mode, userSet: true });
}

/**
 * Clear the user override, reverting to config default on next load.
 */
export function resetDisplayMode(directory: string): void {
    writeDisplayState(directory, { value: DEFAULT_DISPLAY_MODE, userSet: false });
}

/**
 * Parse a display mode from config. Returns null if the config value is
 * missing or invalid, allowing the caller to fall back to DEFAULT_DISPLAY_MODE.
 */
export function parseConfigDisplayMode(configValue: unknown): SidebarDisplayMode | null {
    if (isValidMode(configValue)) return configValue;
    return null;
}
