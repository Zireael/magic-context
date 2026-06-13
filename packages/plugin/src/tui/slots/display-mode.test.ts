import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
    parseConfigDisplayMode,
    persistDisplayMode,
    readDisplayState,
    resetDisplayMode,
    resolveDisplayMode,
    type SidebarDisplayMode,
} from "./display-mode";

const TEST_DIR = join(import.meta.dir, "__test_display_mode__");

beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("parseConfigDisplayMode", () => {
    it("returns valid modes", () => {
        expect(parseConfigDisplayMode("expanded")).toBe("expanded");
        expect(parseConfigDisplayMode("classic_collapsed")).toBe("classic_collapsed");
        expect(parseConfigDisplayMode("dense_collapsed")).toBe("dense_collapsed");
    });

    it("returns null for invalid values", () => {
        expect(parseConfigDisplayMode(null)).toBeNull();
        expect(parseConfigDisplayMode(undefined)).toBeNull();
        expect(parseConfigDisplayMode("invalid")).toBeNull();
        expect(parseConfigDisplayMode("Collapsed")).toBeNull();
        expect(parseConfigDisplayMode(123)).toBeNull();
        expect(parseConfigDisplayMode(true)).toBeNull();
    });
});

describe("resolveDisplayMode", () => {
    const resolveDir = join(TEST_DIR, "resolve");

    beforeEach(() => {
        mkdirSync(resolveDir, { recursive: true });
    });

    it("returns classic_collapsed when no config or persisted state", () => {
        expect(resolveDisplayMode(resolveDir)).toBe("classic_collapsed");
    });

    it("returns config default when no persisted user choice", () => {
        expect(resolveDisplayMode(resolveDir, "dense_collapsed")).toBe("dense_collapsed");
    });

    it("returns persisted user choice over config default", () => {
        persistDisplayMode(resolveDir, "expanded");
        expect(resolveDisplayMode(resolveDir, "classic_collapsed")).toBe("expanded");
        resetDisplayMode(resolveDir);
    });

    it("falls back to config default when persisted value is invalid", () => {
        expect(readDisplayState("")).toBeNull();
    });

    it("returns classic_collapsed for invalid config default", () => {
        expect(resolveDisplayMode(resolveDir, "bad_value" as SidebarDisplayMode)).toBe(
            "classic_collapsed",
        );
    });
});

describe("persistDisplayMode and resetDisplayMode", () => {
    const persistDir = join(TEST_DIR, "persist");

    beforeEach(() => {
        mkdirSync(persistDir, { recursive: true });
    });

    it("persists and reads back user choice", () => {
        persistDisplayMode(persistDir, "dense_collapsed");
        const state = readDisplayState(persistDir);
        expect(state).toEqual({ value: "dense_collapsed", userSet: true });
    });

    it("reset clears user override", () => {
        persistDisplayMode(persistDir, "dense_collapsed");
        resetDisplayMode(persistDir);
        const state = readDisplayState(persistDir);
        expect(state).toEqual({ value: "classic_collapsed", userSet: false });
    });

    it("readDisplayState returns null for empty directory", () => {
        expect(readDisplayState("")).toBeNull();
    });

    it("readDisplayState returns null for non-existent path", () => {
        expect(readDisplayState("/nonexistent/path/abc123")).toBeNull();
    });
});

describe("resolveDisplayMode end-to-end", () => {
    const e2eDir = join(TEST_DIR, "e2e");

    beforeEach(() => {
        mkdirSync(e2eDir, { recursive: true });
    });

    it("user override wins over config default", () => {
        persistDisplayMode(e2eDir, "expanded");
        expect(resolveDisplayMode(e2eDir, "dense_collapsed")).toBe("expanded");
    });

    it("reset reverts to config default", () => {
        persistDisplayMode(e2eDir, "expanded");
        resetDisplayMode(e2eDir);
        expect(resolveDisplayMode(e2eDir, "dense_collapsed")).toBe("dense_collapsed");
    });

    it("config default applies when no user override", () => {
        expect(resolveDisplayMode(e2eDir, "dense_collapsed")).toBe("dense_collapsed");
    });

    it("classic_collapsed is the ultimate fallback", () => {
        expect(resolveDisplayMode(e2eDir)).toBe("classic_collapsed");
    });
});
