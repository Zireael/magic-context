/**
 * Shared sidebar config patch and sync service.
 *
 * Provides safe read/patch/reset operations for `tui.sidebar.*` config subtree.
 * Both Dashboard and TUI use this service to write the same durable settings.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { homedir } from "node:os";
import { parseSidebarSettings, type SidebarSettings, type ColorOverrides } from "./sidebar-settings";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SidebarSettingsPatch = {
    [K in keyof SidebarSettings]?: Partial<SidebarSettings[K]>;
};

export interface ResolvedSidebarSettings {
    settings: SidebarSettings;
    sourcePath: string;
    lastModified: number;
}

export type SettingsChangeListener = (settings: SidebarSettings) => void;

// ---------------------------------------------------------------------------
// Config path resolution
// ---------------------------------------------------------------------------

function getConfigPath(): string {
    const configDir = process.env.XDG_CONFIG_HOME ?? `${homedir()}/.config`;
    return `${configDir}/opencode/magic-context.jsonc`;
}

// ---------------------------------------------------------------------------
// JSONC helpers (minimal, comment-preserving)
// ---------------------------------------------------------------------------

/**
 * Strip JSON comments for parsing, preserving string contents.
 */
function stripJsonComments(content: string): string {
    let result = "";
    let inString = false;
    let escaped = false;
    let inLineComment = false;
    let inBlockComment = false;

    for (let i = 0; i < content.length; i++) {
        const char = content[i];
        const next = content[i + 1];

        if (inLineComment) {
            if (char === "\n") {
                inLineComment = false;
                result += char;
            }
            continue;
        }

        if (inBlockComment) {
            if (char === "*" && next === "/") {
                inBlockComment = false;
                i++;
            }
            continue;
        }

        if (inString) {
            result += char;
            if (escaped) {
                escaped = false;
            } else if (char === "\\") {
                escaped = true;
            } else if (char === '"') {
                inString = false;
            }
            continue;
        }

        if (char === '"') {
            inString = true;
            result += char;
            continue;
        }

        if (char === "/" && next === "/") {
            inLineComment = true;
            i++;
            continue;
        }

        if (char === "/" && next === "*") {
            inBlockComment = true;
            i++;
            continue;
        }

        result += char;
    }

    return result;
}

/**
 * Strip trailing commas (valid JSONC).
 */
function stripTrailingCommas(content: string): string {
    return content.replace(/,\s*([\]}])/g, "$1");
}

function parseJsonc(content: string): Record<string, unknown> {
    const stripped = stripTrailingCommas(stripJsonComments(content));
    try {
        return JSON.parse(stripped);
    } catch {
        return {};
    }
}

function stringifyJsonc(obj: Record<string, unknown>, indent = 2): string {
    return JSON.stringify(obj, null, indent) + "\n";
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Read the full config file and extract tui.sidebar settings.
 */
export function readSidebarSettings(): ResolvedSidebarSettings {
    const sourcePath = getConfigPath();
    const exists = existsSync(sourcePath);

    if (!exists) {
        return {
            settings: parseSidebarSettings(undefined),
            sourcePath,
            lastModified: 0,
        };
    }

    const content = readFileSync(sourcePath, "utf-8");
    const config = parseJsonc(content);
    const sidebar = (config.tui as Record<string, unknown> | undefined)?.sidebar;
    const settings = parseSidebarSettings(sidebar);

    return {
        settings,
        sourcePath,
        lastModified: Date.now(),
    };
}

// ---------------------------------------------------------------------------
// Patch
// ---------------------------------------------------------------------------

/**
 * Deep merge patch into target, preserving existing keys not in patch.
 */
function deepMerge(target: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
    const result = { ...target };
    for (const [key, value] of Object.entries(patch)) {
        if (value && typeof value === "object" && !Array.isArray(value) &&
            result[key] && typeof result[key] === "object" && !Array.isArray(result[key])) {
            result[key] = deepMerge(
                result[key] as Record<string, unknown>,
                value as Record<string, unknown>,
            );
        } else {
            result[key] = value;
        }
    }
    return result;
}

/**
 * Patch sidebar settings in the config file.
 * Only modifies tui.sidebar.* keys, preserving everything else.
 */
export function patchSidebarSettings(patch: SidebarSettingsPatch): ResolvedSidebarSettings {
    const sourcePath = getConfigPath();
    const exists = existsSync(sourcePath);

    let config: Record<string, unknown> = {};
    if (exists) {
        const content = readFileSync(sourcePath, "utf-8");
        config = parseJsonc(content);
    }

    // Ensure tui.sidebar exists
    if (!config.tui || typeof config.tui !== "object") {
        config.tui = {};
    }
    const tui = config.tui as Record<string, unknown>;
    if (!tui.sidebar || typeof tui.sidebar !== "object") {
        tui.sidebar = {};
    }

    // Deep merge patch into existing sidebar config
    tui.sidebar = deepMerge(
        tui.sidebar as Record<string, unknown>,
        patch as Record<string, unknown>,
    );

    // Validate the merged result
    const settings = parseSidebarSettings(tui.sidebar);

    // Write back
    const dir = dirname(sourcePath);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    writeFileSync(sourcePath, stringifyJsonc(config));

    return {
        settings,
        sourcePath,
        lastModified: Date.now(),
    };
}

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

/**
 * Reset specific sidebar settings keys to defaults.
 * If keys is undefined, reset the entire tui.sidebar subtree.
 */
export function resetSidebarSettings(keys?: string[]): ResolvedSidebarSettings {
    const sourcePath = getConfigPath();
    const exists = existsSync(sourcePath);

    let config: Record<string, unknown> = {};
    if (exists) {
        const content = readFileSync(sourcePath, "utf-8");
        config = parseJsonc(content);
    }

    // Ensure tui exists
    if (!config.tui || typeof config.tui !== "object") {
        config.tui = {};
    }
    const tui = config.tui as Record<string, unknown>;

    if (!keys || keys.length === 0) {
        // Reset entire sidebar subtree
        delete tui.sidebar;
    } else {
        // Reset specific keys
        if (tui.sidebar && typeof tui.sidebar === "object") {
            const sidebar = tui.sidebar as Record<string, unknown>;
            for (const key of keys) {
                delete sidebar[key];
            }
        }
    }

    // Validate the result
    const settings = parseSidebarSettings(tui.sidebar);

    // Write back
    const dir = dirname(sourcePath);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    writeFileSync(sourcePath, stringifyJsonc(config));

    return {
        settings,
        sourcePath,
        lastModified: Date.now(),
    };
}

// ---------------------------------------------------------------------------
// Watch (polling-based fallback)
// ---------------------------------------------------------------------------

/**
 * Watch for sidebar settings changes.
 * Uses polling since file watching may not be available in all environments.
 */
export function watchSidebarSettings(
    onChange: SettingsChangeListener,
    intervalMs = 1000,
): Disposable {
    let lastModified = 0;
    let stopped = false;

    const check = () => {
        if (stopped) return;
        try {
            const result = readSidebarSettings();
            if (result.lastModified > lastModified) {
                lastModified = result.lastModified;
                onChange(result.settings);
            }
        } catch {
            // Ignore read errors during watch
        }
    };

    const timer = setInterval(check, intervalMs);

    return {
        [Symbol.dispose]() {
            stopped = true;
            clearInterval(timer);
        },
    };
}
