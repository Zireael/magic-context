import { describe, expect, it } from "bun:test";
import {
    fromOpenCodeTheme,
    getColor,
    getPalette,
    type OpenCodeThemeCurrent,
} from "./sidebar-palette";

const MOCK_OPENCODE_THEME: OpenCodeThemeCurrent = {
    primary: "#c084fc",
    secondary: "#60a5fa",
    accent: "#3a3a5e",
    error: "#f87171",
    warning: "#fbbf24",
    success: "#34d399",
    info: "#60a5fa",
    text: "#ffffff",
    textMuted: "#888888",
    background: "#000000",
    backgroundPanel: "#1a1a2e",
    backgroundElement: "#222222",
    backgroundMenu: "#1a1a2e",
    border: "#444444",
    borderActive: "#666666",
    borderSubtle: "#333333",
};

describe("fromOpenCodeTheme", () => {
    it("maps text token", () => {
        const palette = fromOpenCodeTheme(MOCK_OPENCODE_THEME);
        expect(palette.text).toBe("#ffffff");
    });

    it("maps warning token", () => {
        const palette = fromOpenCodeTheme(MOCK_OPENCODE_THEME);
        expect(palette.warning).toBe("#fbbf24");
    });

    it("maps critical to error", () => {
        const palette = fromOpenCodeTheme(MOCK_OPENCODE_THEME);
        expect(palette.critical).toBe("#f87171");
    });

    it("maps panel to backgroundPanel", () => {
        const palette = fromOpenCodeTheme(MOCK_OPENCODE_THEME);
        expect(palette.panel).toBe("#1a1a2e");
    });
});

describe("getPalette", () => {
    it("returns magic_default palette", () => {
        const palette = getPalette("magic_default");
        expect(palette.text).toBeTruthy();
        expect(palette.critical).toBeTruthy();
    });

    it("returns monochrome palette", () => {
        const palette = getPalette("monochrome");
        expect(palette.ok).toBe("#cccccc");
        expect(palette.warning).toBe("#cccccc");
    });

    it("returns high_contrast palette", () => {
        const palette = getPalette("high_contrast");
        expect(palette.ok).toBe("#00ff00");
        expect(palette.critical).toBe("#ff0000");
    });

    it("returns follow_opencode with theme", () => {
        const palette = getPalette("follow_opencode", MOCK_OPENCODE_THEME);
        expect(palette.text).toBe("#ffffff");
    });

    it("falls back to magic_default for follow_opencode without theme", () => {
        const palette = getPalette("follow_opencode");
        expect(palette.text).toBeTruthy();
    });
});

describe("getColor", () => {
    it("returns correct color for token", () => {
        const palette = getPalette("magic_default");
        expect(getColor(palette, "text")).toBe(palette.text);
        expect(getColor(palette, "critical")).toBe(palette.critical);
    });
});
