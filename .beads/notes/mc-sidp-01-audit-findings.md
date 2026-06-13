# mc-sidp-01-audit: Sidebar Telemetry & Rendering Source Map

## Files to Modify

### Primary sidebar rendering
- `packages/plugin/src/tui/slots/sidebar-content.tsx` — Main sidebar component (799 lines)
  - `SidebarContent` component: line 362
  - `TokenBreakdown` component: line 65
  - `StatRow` component: line 247
  - `SectionHeader` component: line 272
  - `RecompProgressSection` component: line 283
  - `createSidebarContentSlot` export: line 783
  - `compactTokens` helper: line 20
  - `relativeTime` helper: line 26
  - `progressBar` helper: line 35
  - `COLORS` constant: line 42
  - Collapse state: `createSignal(false)` at line 371 (in-memory only, resets on TUI restart)

### TUI entry point
- `packages/plugin/src/tui/index.tsx` — Plugin entry (893 lines)
  - `StatusDialog` component: line 201 (full status dialog with breakdown)
  - `tui` plugin function: line 751
  - Command palette registration: line 606
  - Version display: `packageJson.version` from `../../package.json`

### Snapshot data layer
- `packages/plugin/src/tui/data/context-db.ts` — RPC client (364 lines)
  - `loadSidebarSnapshot` function: line 140
  - `loadStatusDetail` function: line 174
  - `EMPTY_SNAPSHOT` constant: line 49
  - Client-side sticky cache: line 93

### RPC types
- `packages/plugin/src/shared/rpc-types.ts` — Shared types (131 lines)
  - `SidebarSnapshot` interface: line 6
  - `StatusDetail` interface: line 92

### Snapshot cache (server-side)
- `packages/plugin/src/plugin/sidebar-snapshot-cache.ts` — Server sticky cache (137 lines)

### Config system
- `packages/plugin/src/config/index.ts` — Config loading (567 lines)
  - JSONC parsing via `comment-json`
  - User config: `~/.config/opencode/magic-context.jsonc`
  - Project config: `.opencode/magic-context.jsonc` or `magic-context.jsonc`
- `packages/plugin/src/config/schema/magic-context.ts` — Zod schema (621 lines)

### TUI config
- `packages/plugin/src/shared/tui-config.ts` — tui.json auto-configuration (99 lines)

### Update checker
- `packages/plugin/src/hooks/auto-update-checker/checker.ts` — npm version check (312 lines)
- `packages/plugin/src/hooks/auto-update-checker/types.ts` — checker types (58 lines)

### Renderer types
- `packages/plugin/src/tui/types/opencode-plugin-tui.d.ts` — TUI API types (232 lines)

## Telemetry Source Decision Table

| Data Source | Status | Location |
|---|---|---|
| `SidebarSnapshot` | **available** | `rpc-types.ts:6` — full interface |
| Context categories | **available** | `SidebarSnapshot`: systemPromptTokens, docsTokens, compartmentTokens, factTokens, memoryTokens, profileTokens, conversationTokens, toolCallTokens, toolDefinitionTokens |
| Context limit | **available** | `SidebarSnapshot.contextLimit` |
| Usage percentage | **available** | `SidebarSnapshot.usagePercentage` |
| Execute threshold | **available** | `SidebarSnapshot.executeThreshold` |
| Historian state | **available** | `SidebarSnapshot.historianRunning` (boolean) |
| Pending ops count | **available** | `SidebarSnapshot.pendingOpsCount` |
| Memory counts | **available** | `SidebarSnapshot.memoryCount`, `memoryBlockCount` |
| Session notes | **available** | `SidebarSnapshot.sessionNoteCount`, `readySmartNoteCount` |
| Dreamer last run | **available** | `SidebarSnapshot.lastDreamerRunAt` |
| Recomp progress | **available** | `SidebarSnapshot.recompProgress` |
| Cache TTL | **available** | `SidebarSnapshot.cacheTtl` (string) |
| Cache remaining | **available** | `StatusDetail.cacheRemainingMs`, `cacheExpired` |
| Version | **available** | `packageJson.version` in `sidebar-content.tsx:4` and `tui/index.tsx:8` |
| Update check | **available** | `auto-update-checker/checker.ts` — npm registry check |
| **Cache hit rate %** | **needs-extension** | No cache hit rate in snapshot. `cacheTtl`/`cacheRemainingMs` exist but not hit ratio |
| **Braille cache trend** | **needs-extension** | No cache trend history in snapshot |
| **Historian failed/stalled** | **needs-extension** | Only boolean `historianRunning`. No failed/stalled/no-reclaim state |
| **Dreamer stale** | **needs-extension** | Only `lastDreamerRunAt`. No staleness threshold or state |
| **Token usage ledger** | **unavailable** | No provider usage events in snapshot. `totalInputTokens` exists but may be approximate |
| **Skills vs Tool Defs** | **unavailable** | No separate Skills category. Tool defs bundled into `toolDefinitionTokens` |

## Renderer Capabilities

### Confirmed (from `opencode-plugin-tui.d.ts` and current code)
- **Flex layouts**: ✅ `flexDirection`, `flexGrow`, `flexBasis` used in `TokenBreakdown`
- **Background color**: ✅ `backgroundColor` used for colored bar segments
- **Click handling**: ✅ `onMouseDown` used for collapse toggle (line 594)
- **Inverse styling**: ❓ Not currently used, but `fg`/`bg` props available on `<text>`
- **Bold**: ✅ `<b>` JSX intrinsic used
- **Unicode/Braille**: ✅ Text elements render Unicode (existing emoji/arrow chars)
- **Blinking**: ❓ Not currently used. Need to check opentui support
- **Dialog system**: ✅ `api.ui.dialog` with `DialogAlert`, `DialogConfirm`, `DialogSelect`
- **Toast notifications**: ✅ `api.ui.toast`
- **Theme colors**: ✅ `TuiThemeCurrent` with accent, error, warning, success, textMuted, etc.

### Key renderer constraints
- Components are SolidJS-based (`@opentui/solid`)
- JSX intrinsic elements: `<box>`, `<text>`, `<b>`
- Layout uses flex model (flexDirection, flexGrow, flexBasis, justifyContent, alignItems)
- No `onClick` — uses `onMouseDown` for click handling
- Color via `fg` (foreground) and `backgroundColor` props
- No explicit "inverse" style — would need `fg=background, backgroundColor=text` pattern

## PR #93 Salvage Notes

### Reusable patterns (conceptual)
1. **KV persistence for display mode**: PR #93 used `api.kv` for persisting collapsed state. Current master has no KV API in TUI types. Need to use config file or new persistence mechanism.
2. **Config-default-until-manual-toggle**: PR #93 had separate `collapsed` and `collapsed-user-set` flags. This pattern should become `displayMode` and `displayModeUserSet`.
3. **Pure config parsing helpers**: Clamped numeric thresholds pattern reusable.
4. **Status priority helper**: Active operations before static counts ordering reusable.
5. **Full-width proportional bar**: Current code already uses this pattern (flexGrow + flexBasis=0).

### Not reusable
1. **Centered segment labels**: PR #93 had inline labels over bars. Final design uses suffix labels.
2. **Old KV API**: Current master has no `api.kv` in TUI types. Need alternative persistence.

## Test Infrastructure

- **Framework**: `bun test` (configured in `packages/plugin/package.json`)
- **Test count**: 100+ existing test files in `packages/plugin/src/`
- **Sidebar tests**: `sidebar-snapshot-cache.test.ts` exists
- **Pattern**: Standard bun test with `describe`/`it`/`expect`
- **No existing sidebar rendering tests**: Tests are for data/logic, not JSX rendering

## Validation Commands

```bash
bun install                    # Install dependencies
bun test                       # Run all tests in packages/plugin
bun run typecheck              # TypeScript type checking
bun run lint                   # Biome linting
bun run lint:fix               # Auto-fix lint issues
```

## Unknowns / Follow-up Beads

1. **Blinking support**: Need to verify if opentui supports blink attribute on `<text>`
2. **Cache hit rate**: Server-side snapshot doesn't include cache hit %. Need to either:
   - Add cache hit tracking to server snapshot producer
   - Or document as "unavailable" for MVP
3. **Historian failed/stalled state**: Only boolean running flag exists. Need to either:
   - Extend snapshot with historian error/stall state
   - Or derive from recompProgress.phase
4. **Token usage ledger**: No provider usage events available. For MVP, label all token values as "estimated"
5. **Skills vs Tool Defs**: No separate category. Document that Skills are bundled under Tool Defs.
