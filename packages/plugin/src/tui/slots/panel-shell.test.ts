import { describe, expect, it } from "bun:test";
import {
    ALL_PANELS,
    actionKeyToPanel,
    PANEL_NAV_ROWS,
    type PanelNav,
    panelToActionKey,
    renderCloseButton,
    renderFooterNav,
    renderNavLabel,
} from "./panel-shell";

describe("panel navigation constants", () => {
    it("has correct nav rows", () => {
        expect(PANEL_NAV_ROWS).toHaveLength(2);
        expect(PANEL_NAV_ROWS[0]).toHaveLength(3);
        expect(PANEL_NAV_ROWS[1]).toHaveLength(3);
    });

    it("has all panels", () => {
        expect(ALL_PANELS).toHaveLength(6);
        const ids = ALL_PANELS.map((p) => p.id);
        expect(ids).toContain("overview");
        expect(ids).toContain("alloc");
        expect(ids).toContain("memory");
        expect(ids).toContain("tokens");
        expect(ids).toContain("cache");
        expect(ids).toContain("settings");
    });
});

describe("renderNavLabel", () => {
    it("renders unselected label", () => {
        const nav: PanelNav = { id: "overview", label: "Overview" };
        const result = renderNavLabel(nav, false);
        expect(result.label).toBe("[Overview]");
        expect(result.selected).toBe(false);
    });

    it("renders selected label", () => {
        const nav: PanelNav = { id: "overview", label: "Overview" };
        const result = renderNavLabel(nav, true);
        expect(result.label).toBe("[Overview]");
        expect(result.selected).toBe(true);
    });
});

describe("renderFooterNav", () => {
    it("renders all nav rows with no selection when panel is null", () => {
        const result = renderFooterNav(null);
        expect(result.rows).toHaveLength(2);
        for (const row of result.rows) {
            for (const item of row) {
                expect(item.selected).toBe(false);
            }
        }
    });

    it("highlights selected panel", () => {
        const result = renderFooterNav("overview");
        const overviewItem = result.rows[0][0];
        expect(overviewItem.selected).toBe(true);
        expect(overviewItem.label).toBe("[Overview]");

        // Other panels should not be selected
        const allocItem = result.rows[0][1];
        expect(allocItem.selected).toBe(false);
    });

    it("highlights memory panel", () => {
        const result = renderFooterNav("memory");
        const memoryItem = result.rows[0][2];
        expect(memoryItem.selected).toBe(true);
        expect(memoryItem.label).toBe("[Memory]");
    });
});

describe("renderCloseButton", () => {
    it("renders [X Close] label", () => {
        expect(renderCloseButton()).toBe("[X Close]");
    });

    it("does not use [Compact] label", () => {
        expect(renderCloseButton()).not.toContain("Compact");
    });
});

describe("actionKeyToPanel", () => {
    it("maps D to overview", () => {
        expect(actionKeyToPanel("D")).toBe("overview");
    });

    it("maps S to alloc", () => {
        expect(actionKeyToPanel("S")).toBe("alloc");
    });

    it("maps A to mode", () => {
        expect(actionKeyToPanel("A")).toBe("mode");
    });

    it("maps F to flush", () => {
        expect(actionKeyToPanel("F")).toBe("flush");
    });

    it("returns null for unknown key", () => {
        expect(actionKeyToPanel("X")).toBeNull();
        expect(actionKeyToPanel("Z")).toBeNull();
    });
});

describe("panelToActionKey", () => {
    it("maps overview to D", () => {
        expect(panelToActionKey("overview")).toBe("D");
    });

    it("maps alloc to S", () => {
        expect(panelToActionKey("alloc")).toBe("S");
    });

    it("maps mode to A", () => {
        expect(panelToActionKey("mode")).toBe("A");
    });

    it("maps flush to F", () => {
        expect(panelToActionKey("flush")).toBe("F");
    });

    it("returns null for panels without action key", () => {
        expect(panelToActionKey("memory")).toBeNull();
        expect(panelToActionKey("tokens")).toBeNull();
        expect(panelToActionKey("cache")).toBeNull();
        expect(panelToActionKey("settings")).toBeNull();
    });
});
