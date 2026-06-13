import { describe, expect, it } from "bun:test";
import {
    parseSidebarSettings,
    extractTuiSidebar,
    DEFAULT_SIDEBAR_SETTINGS,
    type SidebarSettings,
} from "./sidebar-settings";

describe("parseSidebarSettings", () => {
    it("returns defaults for null/undefined", () => {
        expect(parseSidebarSettings(null)).toEqual(DEFAULT_SIDEBAR_SETTINGS);
        expect(parseSidebarSettings(undefined)).toEqual(DEFAULT_SIDEBAR_SETTINGS);
    });

    it("returns defaults for arrays", () => {
        expect(parseSidebarSettings([])).toEqual(DEFAULT_SIDEBAR_SETTINGS);
    });

    it("parses valid display mode", () => {
        const raw = { displayMode: { default: "dense_collapsed" } };
        const result = parseSidebarSettings(raw);
        expect(result.displayMode.default).toBe("dense_collapsed");
    });

    it("ignores invalid display mode", () => {
        const raw = { displayMode: { default: "invalid" } };
        const result = parseSidebarSettings(raw);
        expect(result.displayMode.default).toBe("classic_collapsed");
    });

    it("parses valid theme source", () => {
        const raw = { theme: { source: "magic_default" } };
        const result = parseSidebarSettings(raw);
        expect(result.theme.source).toBe("magic_default");
    });

    it("ignores invalid theme source", () => {
        const raw = { theme: { source: "invalid" } };
        const result = parseSidebarSettings(raw);
        expect(result.theme.source).toBe("follow_opencode");
    });

    it("parses valid motion mode", () => {
        const raw = { motion: { mode: "reduced" } };
        const result = parseSidebarSettings(raw);
        expect(result.motion.mode).toBe("reduced");
    });

    it("ignores invalid motion mode", () => {
        const raw = { motion: { mode: "invalid" } };
        const result = parseSidebarSettings(raw);
        expect(result.motion.mode).toBe("subtle");
    });

    it("parses valid glyph preset", () => {
        const raw = { glyphs: { preset: "nerd" } };
        const result = parseSidebarSettings(raw);
        expect(result.glyphs.preset).toBe("nerd");
    });

    it("parses color overrides", () => {
        const raw = { theme: { overrides: { warning: "#ff0000", cold: "#00ff00" } } };
        const result = parseSidebarSettings(raw);
        expect(result.theme.overrides.warning).toBe("#ff0000");
        expect(result.theme.overrides.cold).toBe("#00ff00");
    });

    it("ignores invalid color overrides", () => {
        const raw = { theme: { overrides: { warning: "not-a-color" } } };
        const result = parseSidebarSettings(raw);
        expect(result.theme.overrides.warning).toBeUndefined();
    });

    it("preserves partial config", () => {
        const raw = { motion: { mode: "off" } };
        const result = parseSidebarSettings(raw);
        expect(result.motion.mode).toBe("off");
        expect(result.displayMode.default).toBe("classic_collapsed");
        expect(result.theme.source).toBe("follow_opencode");
    });
});

describe("extractTuiSidebar", () => {
    it("extracts tui.sidebar from full config", () => {
        const config = { tui: { sidebar: { displayMode: { default: "dense_collapsed" } } } };
        const sidebar = extractTuiSidebar(config);
        expect(sidebar).toEqual({ displayMode: { default: "dense_collapsed" } });
    });

    it("returns undefined for missing tui", () => {
        expect(extractTuiSidebar({})).toBeUndefined();
    });

    it("returns undefined for missing sidebar", () => {
        expect(extractTuiSidebar({ tui: {} })).toBeUndefined();
    });

    it("returns undefined for null", () => {
        expect(extractTuiSidebar(null)).toBeUndefined();
    });
});
