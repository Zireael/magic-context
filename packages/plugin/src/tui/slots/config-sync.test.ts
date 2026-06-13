import { describe, expect, it } from "bun:test";
import {
    readSidebarSettings,
    patchSidebarSettings,
    resetSidebarSettings,
    type SidebarSettingsPatch,
} from "./config-sync";

describe("readSidebarSettings", () => {
    it("returns defaults when config file does not exist", () => {
        // This test assumes no config file exists at the default path
        // In a real environment, this would read from ~/.config/opencode/magic-context.jsonc
        const result = readSidebarSettings();
        expect(result.settings).toBeTruthy();
        expect(result.settings.displayMode.default).toBeTruthy();
    });
});

describe("patchSidebarSettings", () => {
    it("patches display mode", () => {
        const patch: SidebarSettingsPatch = {
            displayMode: { default: "dense_collapsed" },
        };
        const result = patchSidebarSettings(patch);
        expect(result.settings.displayMode.default).toBe("dense_collapsed");
    });

    it("patches theme source", () => {
        const patch: SidebarSettingsPatch = {
            theme: { source: "magic_default" },
        };
        const result = patchSidebarSettings(patch);
        expect(result.settings.theme.source).toBe("magic_default");
    });

    it("patches motion mode", () => {
        const patch: SidebarSettingsPatch = {
            motion: { mode: "reduced" },
        };
        const result = patchSidebarSettings(patch);
        expect(result.settings.motion.mode).toBe("reduced");
    });

    it("preserves unrelated config", () => {
        // First patch display mode
        patchSidebarSettings({ displayMode: { default: "dense_collapsed" } });

        // Then patch theme source
        const result = patchSidebarSettings({ theme: { source: "magic_default" } });

        // Both should be preserved
        expect(result.settings.displayMode.default).toBe("dense_collapsed");
        expect(result.settings.theme.source).toBe("magic_default");
    });
});

describe("resetSidebarSettings", () => {
    it("resets specific keys to defaults", () => {
        // First patch something
        patchSidebarSettings({ displayMode: { default: "dense_collapsed" } });

        // Then reset it
        const result = resetSidebarSettings(["displayMode"]);
        expect(result.settings.displayMode.default).toBe("classic_collapsed");
    });

    it("resets entire sidebar subtree", () => {
        // First patch something
        patchSidebarSettings({ displayMode: { default: "dense_collapsed" } });

        // Then reset all
        const result = resetSidebarSettings();
        expect(result.settings.displayMode.default).toBe("classic_collapsed");
        expect(result.settings.theme.source).toBe("follow_opencode");
    });
});
