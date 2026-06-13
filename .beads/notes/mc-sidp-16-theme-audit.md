# mc-sidp-16-theme-audit: Theme API and Palette Integration Findings

## Files Inspected

### Magic Context (current)
- `packages/plugin/src/tui/slots/sidebar-content.tsx` — Uses `TuiThemeCurrent` for colors
- `packages/plugin/src/tui/types/opencode-plugin-tui.d.ts` — Defines `TuiThemeCurrent` and `TuiTheme`
- `packages/plugin/src/tui/index.tsx` — Accesses `api.theme.current`
- `packages/plugin/src/tui/slots/dense-strip.ts` — Hardcoded COLORS object
- `packages/plugin/src/tui/slots/core-panels.ts` — Uses theme from props

### OpenCode (D:\Coding\_tools\opencode-src0)
- `packages/ui/src/theme/types.ts` — Theme type definitions
- `packages/ui/src/theme/default-themes.ts` — Built-in themes
- `packages/ui/src/theme/resolve.ts` — Theme resolver

## API Facts

### TuiThemeCurrent (RGBA colors available to plugins)
```
primary, secondary, accent, error, warning, success, info,
text, textMuted, background, backgroundPanel, backgroundElement,
backgroundMenu, border, borderActive, borderSubtle
```

Plus `[key: string]: unknown` for extensibility.

### TuiTheme API
```
current: TuiThemeCurrent  — resolved current theme tokens
has(name: string): boolean — check if theme exists
set(name: string): boolean — switch theme
mode(): "dark" | "light"   — current mode
ready: boolean             — theme loaded
```

### Theme Reactivity
- `api.theme.current` is accessed via `createMemo(() => ctx.theme.current)` in sidebar-content.tsx
- Theme changes are reactive while sidebar is mounted (SolidJS signals)

## Current Magic Context Theme Usage

### Hardcoded Colors (sidebar-content.tsx)
```typescript
const COLORS = {
    system: "#c084fc",      // Purple
    docs: "#22d3ee",        // Cyan
    compartments: "#60a5fa", // Blue
    facts: "#fbbf24",       // Yellow
    memories: "#34d399",    // Green
    profile: "#a3e635",     // Lime
    conversation: "#f87171", // Red
    toolCalls: "#fb923c",   // Orange
    toolDefs: "#f472b6",    // Pink
}
```

### Theme Token Usage
- Uses `props.theme.accent`, `props.theme.warning`, `props.theme.error`, etc.
- Uses `props.theme.textMuted` for dimmed text
- Uses `props.theme.background` for inverse styling

## OpenCode Default Themes (curated list)
- opencode, nord, gruvbox, catppuccin, tokyonight, github, dracula, kanagawa, ayu, aura, vercel, zenburn

## License Note
OpenCode is MIT licensed. If Magic Context packages reduced color mappings derived from OpenCode defaults, preserve attribution/copyright/license notice.

## Implementation Recommendations

1. **Semantic Palette Layer**: Create `SidebarPalette` interface mapping semantic tokens to RGBA colors
2. **Theme Adapter**: Resolve `TuiThemeCurrent` → `SidebarPalette` with fallbacks
3. **Packaged Presets**: Create reduced palette presets for common themes
4. **Color Overrides**: Allow per-semantic-token color overrides in config
5. **Motion Policy**: Add reduced-motion aware pulse styling (subtle alternative to blink)

## Files to Modify for Theme Integration
- `packages/plugin/src/tui/slots/sidebar-content.tsx` — Replace hardcoded COLORS
- `packages/plugin/src/tui/slots/dense-strip.ts` — Use semantic palette
- `packages/plugin/src/tui/slots/risk-classifier.ts` — Use semantic palette for flags
- `packages/plugin/src/tui/slots/glyph-alerts.ts` — Add motion policy
- New: `packages/plugin/src/tui/slots/sidebar-palette.ts` — Semantic palette
- New: `packages/plugin/src/tui/slots/sidebar-theme.ts` — Theme adapter
