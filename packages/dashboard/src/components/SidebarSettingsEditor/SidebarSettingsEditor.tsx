/**
 * Dashboard sidebar settings editor component.
 *
 * Provides UI controls for editing tui.sidebar.* settings.
 * Uses the shared config patch service from mc-sidp-25.
 */

import { createSignal, createMemo, For, Show } from "solid-js";
import {
    parseSidebarSettings,
    type SidebarSettings,
    type SidebarDisplayMode,
    type SidebarThemeSource,
    type SidebarMotionMode,
    type SidebarGlyphPreset,
    type ColorOverrides,
    type SidebarColorToken,
} from "../../tui/slots/sidebar-settings";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SidebarSettingsEditorProps {
    initialSettings: SidebarSettings;
    onSave: (patch: Partial<SidebarSettings>) => void;
    onReset?: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DISPLAY_MODES: Array<{ value: SidebarDisplayMode; label: string }> = [
    { value: "expanded", label: "Expanded" },
    { value: "classic_collapsed", label: "Classic Collapsed" },
    { value: "dense_collapsed", label: "Dense Collapsed" },
];

const THEME_SOURCES: Array<{ value: SidebarThemeSource; label: string }> = [
    { value: "follow_opencode", label: "Follow OpenCode" },
    { value: "magic_default", label: "Magic Default" },
    { value: "packaged_preset", label: "Packaged Preset" },
    { value: "monochrome", label: "Monochrome" },
    { value: "high_contrast", label: "High Contrast" },
];

const MOTION_MODES: Array<{ value: SidebarMotionMode; label: string }> = [
    { value: "subtle", label: "Subtle" },
    { value: "reduced", label: "Reduced" },
    { value: "off", label: "Off" },
];

const GLYPH_PRESETS: Array<{ value: SidebarGlyphPreset; label: string }> = [
    { value: "auto", label: "Auto" },
    { value: "unicode", label: "Unicode" },
    { value: "nerd", label: "Nerd" },
    { value: "ascii", label: "ASCII" },
];

const PACKAGED_PRESETS = [
    "magicDefault",
    "nord",
    "gruvbox",
    "catppuccin",
    "tokyonight",
    "github",
];

const COLOR_TOKENS: Array<{ token: SidebarColorToken; label: string; group: string }> = [
    { token: "text", label: "Text", group: "Text" },
    { token: "textMuted", label: "Text Muted", group: "Text" },
    { token: "border", label: "Border", group: "Text" },
    { token: "panel", label: "Panel", group: "Text" },
    { token: "selectedFg", label: "Selected FG", group: "Selection" },
    { token: "selectedBg", label: "Selected BG", group: "Selection" },
    { token: "ok", label: "OK", group: "Status" },
    { token: "info", label: "Info", group: "Status" },
    { token: "warning", label: "Warning", group: "Status" },
    { token: "critical", label: "Critical", group: "Status" },
    { token: "cold", label: "Cold", group: "Context Bar" },
    { token: "warm", label: "Warm", group: "Context Bar" },
    { token: "hot", label: "Hot", group: "Context Bar" },
    { token: "free", label: "Free", group: "Context Bar" },
    { token: "threshold", label: "Threshold", group: "Context Bar" },
    { token: "overflow", label: "Overflow", group: "Context Bar" },
    { token: "cacheGood", label: "Cache Good", group: "Cache" },
    { token: "cacheDegraded", label: "Cache Degraded", group: "Cache" },
    { token: "cacheBad", label: "Cache Bad", group: "Cache" },
    { token: "pulseActive", label: "Pulse Active", group: "Motion" },
    { token: "pulseWarning", label: "Pulse Warning", group: "Motion" },
    { token: "pulseCritical", label: "Pulse Critical", group: "Motion" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SidebarSettingsEditor(props: SidebarSettingsEditorProps) {
    const [settings, setSettings] = createSignal<SidebarSettings>(props.initialSettings);
    const [colorOverrides, setColorOverrides] = createSignal<ColorOverrides>(
        props.initialSettings.theme.overrides
    );
    const [showColorOverrides, setShowColorOverrides] = createSignal(false);

    const hasChanges = createMemo(() => {
        const current = settings();
        const initial = props.initialSettings;
        return (
            current.displayMode.default !== initial.displayMode.default ||
            current.theme.source !== initial.theme.source ||
            current.motion.mode !== initial.motion.mode ||
            current.glyphs.preset !== initial.glyphs.preset ||
            JSON.stringify(current.theme.overrides) !== JSON.stringify(initial.theme.overrides)
        );
    });

    const updateDisplayMode = (value: SidebarDisplayMode) => {
        setSettings((s) => ({
            ...s,
            displayMode: { ...s.displayMode, default: value },
        }));
    };

    const updateThemeSource = (value: SidebarThemeSource) => {
        setSettings((s) => ({
            ...s,
            theme: { ...s.theme, source: value },
        }));
    };

    const updateMotionMode = (value: SidebarMotionMode) => {
        setSettings((s) => ({
            ...s,
            motion: { ...s.motion, mode: value },
        }));
    };

    const updateGlyphPreset = (value: SidebarGlyphPreset) => {
        setSettings((s) => ({
            ...s,
            glyphs: { ...s.glyphs, preset: value },
        }));
    };

    const updateColorOverride = (token: SidebarColorToken, value: string) => {
        setColorOverrides((o) => ({
            ...o,
            [token]: value,
        }));
        setSettings((s) => ({
            ...s,
            theme: {
                ...s.theme,
                overrides: { ...colorOverrides(), [token]: value },
            },
        }));
    };

    const resetColorOverride = (token: SidebarColorToken) => {
        setColorOverrides((o) => {
            const next = { ...o };
            delete next[token];
            return next;
        });
        setSettings((s) => {
            const next = { ...colorOverrides() };
            delete next[token];
            return {
                ...s,
                theme: { ...s.theme, overrides: next },
            };
        });
    };

    const resetAllColorOverrides = () => {
        setColorOverrides({});
        setSettings((s) => ({
            ...s,
            theme: { ...s.theme, overrides: {} },
        }));
    };

    const handleSave = () => {
        props.onSave(settings());
    };

    const groupedTokens = createMemo(() => {
        const groups: Record<string, typeof COLOR_TOKENS> = {};
        for (const item of COLOR_TOKENS) {
            if (!groups[item.group]) groups[item.group] = [];
            groups[item.group].push(item);
        }
        return groups;
    });

    return (
        <div class="sidebar-settings-editor">
            <h3>Sidebar / TUI Settings</h3>

            {/* Display Mode */}
            <div class="settings-section">
                <h4>Display Mode</h4>
                <div class="field">
                    <label>Default</label>
                    <select
                        value={settings().displayMode.default}
                        onChange={(e) => updateDisplayMode(e.target.value as SidebarDisplayMode)}
                    >
                        <For each={DISPLAY_MODES}>
                            {(mode) => <option value={mode.value}>{mode.label}</option>}
                        </For>
                    </select>
                </div>
            </div>

            {/* Theme */}
            <div class="settings-section">
                <h4>Theme</h4>
                <div class="field">
                    <label>Source</label>
                    <select
                        value={settings().theme.source}
                        onChange={(e) => updateThemeSource(e.target.value as SidebarThemeSource)}
                    >
                        <For each={THEME_SOURCES}>
                            {(source) => <option value={source.value}>{source.label}</option>}
                        </For>
                    </select>
                </div>

                <Show when={settings().theme.source === "packaged_preset"}>
                    <div class="field">
                        <label>Preset</label>
                        <select
                            value={settings().theme.preset}
                            onChange={(e) =>
                                setSettings((s) => ({
                                    ...s,
                                    theme: { ...s.theme, preset: e.target.value },
                                }))
                            }
                        >
                            <For each={PACKAGED_PRESETS}>
                                {(preset) => <option value={preset}>{preset}</option>}
                            </For>
                        </select>
                    </div>
                </Show>

                <div class="field">
                    <label>Color Overrides</label>
                    <button onClick={() => setShowColorOverrides(!showColorOverrides())}>
                        {showColorOverrides() ? "Hide" : "Show"} ({Object.keys(colorOverrides()).length} active)
                    </button>
                </div>

                <Show when={showColorOverrides()}>
                    <div class="color-overrides">
                        <button onClick={resetAllColorOverrides}>Reset All</button>
                        <For each={Object.entries(groupedTokens())}>
                            {([group, tokens]) => (
                                <div class="color-group">
                                    <h5>{group}</h5>
                                    <For each={tokens}>
                                        {(item) => (
                                            <div class="color-field">
                                                <label>{item.label}</label>
                                                <input
                                                    type="color"
                                                    value={colorOverrides()[item.token] || "#000000"}
                                                    onInput={(e) =>
                                                        updateColorOverride(item.token, e.target.value)
                                                    }
                                                />
                                                <button onClick={() => resetColorOverride(item.token)}>
                                                    Reset
                                                </button>
                                            </div>
                                        )}
                                    </For>
                                </div>
                            )}
                        </For>
                    </div>
                </Show>
            </div>

            {/* Motion */}
            <div class="settings-section">
                <h4>Motion</h4>
                <div class="field">
                    <label>Mode</label>
                    <select
                        value={settings().motion.mode}
                        onChange={(e) => updateMotionMode(e.target.value as SidebarMotionMode)}
                    >
                        <For each={MOTION_MODES}>
                            {(mode) => <option value={mode.value}>{mode.label}</option>}
                        </For>
                    </select>
                </div>
            </div>

            {/* Glyphs */}
            <div class="settings-section">
                <h4>Glyphs</h4>
                <div class="field">
                    <label>Preset</label>
                    <select
                        value={settings().glyphs.preset}
                        onChange={(e) => updateGlyphPreset(e.target.value as SidebarGlyphPreset)}
                    >
                        <For each={GLYPH_PRESETS}>
                            {(preset) => <option value={preset.value}>{preset.label}</option>}
                        </For>
                    </select>
                </div>
            </div>

            {/* Actions */}
            <div class="settings-actions">
                <button onClick={handleSave} disabled={!hasChanges()}>
                    Save
                </button>
                <Show when={props.onReset}>
                    <button onClick={props.onReset}>Reset to Defaults</button>
                </Show>
            </div>
        </div>
    );
}
