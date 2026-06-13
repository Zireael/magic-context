import { describe, expect, it } from "bun:test";
import {
    fromOpenCodeTheme,
    getPalette,
    getColor,
    getPackagedPreset,
    isPackagedPreset,
    PACKAGED_PRESET_INFO,
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

describe("getPackagedPreset", () => {
    it("returns nord palette", () => {
        const palette = getPackagedPreset("nord");
        expect(palette.text).toBe("#eceff4");
        expect(palette.panel).toBe("#2e3440");
    });

    it("returns gruvbox palette", () => {
        const palette = getPackagedPreset("gruvbox");
        expect(palette.text).toBe("#ebdbb2");
        expect(palette.panel).toBe("#282828");
    });

    it("returns catppuccin palette", () => {
        const palette = getPackagedPreset("catppuccin");
        expect(palette.text).toBe("#cdd6f4");
        expect(palette.panel).toBe("#1e1e2e");
    });

    it("returns tokyonight palette", () => {
        const palette = getPackagedPreset("tokyonight");
        expect(palette.text).toBe("#c0caf5");
        expect(palette.panel).toBe("#1a1b26");
    });

    it("returns github palette", () => {
        const palette = getPackagedPreset("github");
        expect(palette.text).toBe("#f0f6fc");
        expect(palette.panel).toBe("#0d1117");
    });

    it("falls back to magic_default for unknown preset", () => {
        const palette = getPackagedPreset("unknown" as any);
        expect(palette.text).toBe("#ffffff");
    });
});

describe("isPackagedPreset", () => {
    it("returns true for valid presets", () => {
        expect(isPackagedPreset("nord")).toBe(true);
        expect(isPackagedPreset("gruvbox")).toBe(true);
        expect(isPackagedPreset("magicDefault")).toBe(true);
    });

    it("returns false for invalid presets", () => {
        expect(isPackagedPreset("unknown")).toBe(false);
        expect(isPackagedPreset("")).toBe(false);
    });
});

describe("PACKAGED_PRESET_INFO", () => {
    it("has info for all presets", () => {
        expect(PACKAGED_PRESET_INFO.length).toBe(8);
    });

    it("each preset has name and label", () => {
        for (const info of PACKAGED_PRESET_INFO) {
            expect(info.name).toBeTruthy();
            expect(info.label).toBeTruthy();
        }
    });
});
