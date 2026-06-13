# mc-sidp-23-settings-sync-audit: Dashboard/TUI Settings Synchronization Findings

## Files Inspected

### Dashboard (packages/dashboard/)
- `src/lib/api.ts` — Tauri invoke wrappers for config read/write
- `src/components/ConfigEditor/ConfigEditor.tsx` — Full config editor with form and raw JSONC modes
- `src-tauri/src/config.rs` — Backend config path resolution and read/write

### TUI (packages/plugin/)
- `src/tui/index.tsx` — Plugin entry, reads tui.json for plugin registration
- `src/shared/jsonc-parser.ts` — JSONC parser (stripJsonComments, parseJsonc)
- `src/config/index.ts` — Config loading with user/project merge
- `src/config/schema/magic-context.ts` — Zod schema for magic-context config
- `src/tui/slots/display-mode.ts` — File-based display mode persistence

## API Facts

### Dashboard Config API
- `getConfig(source: "user" | "project")` → reads config file as raw JSONC string
- `saveConfig(source: "user" | "project", content: string)` → writes raw JSONC string
- `getPiConfig()` → reads Pi config
- `savePiConfig(content: string)` → writes Pi config

### Config File Paths
- User config: `~/.config/opencode/magic-context.jsonc`
- Project config: `<project>/magic-context.jsonc` or `<project>/.opencode/magic-context.jsonc`
- Pi config: `~/.pi/agent/magic-context.jsonc`

### TUI Config Reading
- TUI reads `tui.json`/`tui.jsonc` for plugin registration only
- TUI reads magic-context config via `loadPluginConfig()` from config/index.ts
- Display mode uses file-based persistence in `~/.local/share/cortexkit/magic-context/`

## Implementation Recommendations

### Canonical Config Subtree
```
tui.sidebar.displayMode         → "expanded" | "classic_collapsed" | "dense_collapsed"
tui.sidebar.theme.source        → "follow_opencode" | "magic_default" | etc.
tui.sidebar.theme.preset        → packaged preset name
tui.sidebar.theme.overrides     → per-token color overrides
tui.sidebar.motion.mode         → "subtle" | "reduced" | "off"
tui.sidebar.glyphs.preset       → "unicode" | "nerd" | "ascii"
tui.sidebar.alerts.criticalBlinkOnly → boolean
```

### Source Files to Modify
- `packages/plugin/src/config/schema/magic-context.ts` — Add tui.sidebar schema
- `packages/plugin/src/config/index.ts` — Add sidebar config parsing
- `packages/plugin/src/tui/slots/display-mode.ts` — Read from config instead of file
- `packages/plugin/src/tui/slots/sidebar-palette.ts` — Read theme config
- `packages/dashboard/src/components/ConfigEditor/ConfigEditor.tsx` — Add sidebar settings form

### Config Save Path
- Both Dashboard and TUI should write to the same user config file
- Dashboard uses Tauri `saveConfig("user", content)` which writes raw JSONC
- TUI should NOT write raw JSONC directly; instead expose settings via RPC or file watching

### Reload Behavior
- Dashboard: re-read config on save (already works)
- TUI: needs file watching or polling to detect config changes
- No existing file watching in TUI; recommend adding fs.watch or polling

### Comment Preservation
- Dashboard raw JSONC mode preserves comments
- Dashboard form mode normalizes to JSON (loses comments)
- TUI uses JSONC parser that strips comments
- Recommendation: form mode should preserve comments by patching only changed keys

### User/Global vs Project Config
- Initial implementation: user/global config only
- Project-level UI preference can be added later

### Discovered Blockers
- No shared parser module between Dashboard and TUI (duplicated JSONC parsing)
- TUI has no file watching for config changes
- Display mode currently uses separate file persistence, not config subtree
