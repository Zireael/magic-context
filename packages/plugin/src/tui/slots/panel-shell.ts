/**
 * Sidebar subpanel navigation shell.
 *
 * Manages panel state machine and navigation between focused panels.
 * Panels: Overview, Alloc, Memory, Tokens, Cache, Settings, Mode, Flush.
 *
 * Footer nav:
 *   [Overview] [Alloc] [Memory]
 *   [Tokens] [Cache] [Settings]
 *   [X Close]
 *
 * [X Close] returns to previous display state. Never called [Compact].
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PanelId =
    | "overview"
    | "alloc"
    | "memory"
    | "tokens"
    | "cache"
    | "settings"
    | "mode"
    | "flush";

export interface PanelNav {
    id: PanelId;
    label: string;
    /** Action key for dense strip: D, S, A, F */
    actionKey?: string;
}

export const PANEL_NAV_ROWS: PanelNav[][] = [
    [
        { id: "overview", label: "Overview", actionKey: "D" },
        { id: "alloc", label: "Alloc", actionKey: "S" },
        { id: "memory", label: "Memory" },
    ],
    [
        { id: "tokens", label: "Tokens" },
        { id: "cache", label: "Cache" },
        { id: "settings", label: "Settings" },
    ],
];

export const ALL_PANELS: PanelNav[] = PANEL_NAV_ROWS.flat();

// ---------------------------------------------------------------------------
// State (SolidJS-dependent — use in components only)
// ---------------------------------------------------------------------------

export interface PanelShellState {
    /** Currently open panel, or null when closed */
    openPanel: PanelId | null;
    /** Previous display mode to restore on close */
    previousDisplayMode: string | null;
}

// ---------------------------------------------------------------------------
// Label rendering helpers
// ---------------------------------------------------------------------------

/**
 * Render a nav item with selected state.
 * Selected items use background/inverse styling (not literal █ characters).
 */
export function renderNavLabel(
    nav: PanelNav,
    isSelected: boolean,
): { label: string; selected: boolean } {
    return {
        label: `[${nav.label}]`,
        selected: isSelected,
    };
}

/**
 * Render the full footer nav rows.
 */
export function renderFooterNav(currentPanel: PanelId | null): {
    rows: Array<Array<{ label: string; selected: boolean }>>;
} {
    return {
        rows: PANEL_NAV_ROWS.map((row) =>
            row.map((nav) => renderNavLabel(nav, nav.id === currentPanel)),
        ),
    };
}

/**
 * Render the close button label.
 * Must be [X Close], never [Compact].
 */
export function renderCloseButton(): string {
    return "[X Close]";
}

// ---------------------------------------------------------------------------
// Action key mapping
// ---------------------------------------------------------------------------

/**
 * Map dense strip action key to panel ID.
 */
export function actionKeyToPanel(key: string): PanelId | null {
    switch (key) {
        case "D":
            return "overview";
        case "S":
            return "alloc";
        case "A":
            return "mode";
        case "F":
            return "flush";
        default:
            return null;
    }
}

/**
 * Map panel ID to action key for dense strip.
 */
export function panelToActionKey(panelId: PanelId): string | null {
    switch (panelId) {
        case "overview":
            return "D";
        case "alloc":
            return "S";
        case "mode":
            return "A";
        case "flush":
            return "F";
        default:
            return null;
    }
}
