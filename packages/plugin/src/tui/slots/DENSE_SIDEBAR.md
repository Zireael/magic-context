# Dense Collapsed Sidebar

## Overview

Magic Context's Dense Collapsed Sidebar is an opt-in, high-information instrument strip for monitoring context pressure, cache health, Historian activity, memory status, and token usage.

## Display Modes

Three display modes are available:

| Mode | Description |
|------|-------------|
| `classic_collapsed` | Default. Compact dashboard with summary lines. |
| `dense_collapsed` | Opt-in. 3-4 line instrument strip with action buttons. |
| `expanded` | Full sidebar with per-category breakdown. |

To switch modes:
1. Click the Magic Context header to cycle through modes.
2. Or use Settings panel `[A]` → Display Mode.

Classic collapsed remains the default until you explicitly choose Dense.

## Dense Strip Layout

```
180K · HIST↻ · Q3
████▒▒|░░      61%
⡀⣇⡄⣇⡆⡇⣇⣧⣷⣿   92.6%
[D] [S] [A] [F]3
```

### Top Row

Shows capacity, active processes, and risk flags:

| Element | Meaning |
|---------|---------|
| `180K` | Model context window capacity |
| `HIST↻` | Historian actively running |
| `Q3` | 3 pending queue operations |
| `T!` | Token/context pressure |
| `C!` | Cache degraded or repeated busts |
| `H!` | Historian failed/stalled |
| `D?` | Dreamer stale |
| `M!` | Memory bloat |
| `OVERFLOW` | Context exceeded hard limit |
| `69K free` | Available headroom |

### Context Bar

```
████▒▒|░░      61%
```

| Glyph | Meaning |
|-------|---------|
| `█` | Cold/stable context (System, Tool Defs, Memories, Profile) |
| `▒` | Warm/movable context (Compartments, Conversation, Docs) |
| `░` | Hot/volatile context (Tool Calls) or free space |
| `\|` | Compaction threshold marker |
| `>` | Overflow beyond hard limit |

### Cache Row (when available)

```
⡀⣇⡄⣇⡆⡇⣇⣧⣷⣿   92.6%
```

- Contiguous Braille glyphs (no spaces)
- Fixed-width numeric suffix (1 decimal place)
- Hidden when cache telemetry unavailable or stale

### Action Row

| Button | Panel |
|--------|-------|
| `[D]` | Details / Overview |
| `[S]` | Status / Allocation |
| `[A]` | Mode / Automation |
| `[F]n` | Flush pending ops (only when n > 0) |

## Subpanels

All subpanels have a footer navigation:

```
[Overview] [Alloc] [Memory]
[Tokens] [Cache] [Settings]
[X Close]
```

- `[X Close]` returns to previous display state
- Never uses `[Compact]` label (that means context reduction)

### Details / Overview

Shows: Context usage, threshold, free headroom, state, cache summary, memory summary, risk, and suggestion.

### Status / Allocation

Shows: Context category breakdown with stability glyphs, legend for visual encoding.

### Mode / Automation

Shows: Operating mode (Auto/Conserve/Aggressive/Observe), display mode selector (Classic/Dense/Expanded), reset to default.

### Memory / Maintenance

Shows: Memories, memory tokens, smart notes, user profile, compartments, Dreamer last run, Historian state, pending drops.

### Tokens

Two sections:
1. **Provider Usage Ledger** — Exact historical totals from provider events (labeled "exact")
2. **Current Context Estimate** — Visible context snapshot (labeled "estimated")

This distinction prevents misleading token counts after pruning/compaction.

### Cache

Shows: Health status (excellent/degraded/critical/unavailable), hit rate, bust diagnostics.

### Settings

Shows: Display mode selector, glyph preset (Unicode/Nerd/ASCII), critical blink policy, version/update status.

## Token Accounting

### Exact vs Estimated

| Source | Label | Survives Pruning? |
|--------|-------|-------------------|
| Provider usage events | "exact" | Yes |
| Current visible context | "estimated" | No |
| Unavailable | "unavailable" | N/A |

**Never** use visible-message summation as historical total after Magic Context flushes/prunes/compacts.

### Usage Ledger

Provider/OpenCode step-finish events are captured durably:
- Input tokens
- Output tokens
- Reasoning tokens
- Cache read/write tokens

Ledger totals remain stable even when visible messages are pruned.

## Cache Telemetry

Cache row appears only when:
1. Telemetry is fresh (<5 minutes old)
2. Source is not "unavailable"
3. Samples exist

Missing cache data is hidden, not shown as zero.

## Glyph Presets

| Preset | Description |
|--------|-------------|
| `unicode` | Default. Uses ✕ ▶ ▼ ⚡ etc. |
| `nerd` | Optional. Uses Nerd Font icons. |
| `ascii` | Fallback. Plain ASCII. |

Quantitative bars use Unicode block/Braille by default with ASCII fallbacks.

## Critical Alert Styling

Blink/inverse styling applies only to:
- `C!` — repeated cache busts
- `H!` — Historian failure
- `T!` — overflow
- `>` — beyond hard limit
- `COLD>CTX` — cold context exceeds window

Hot/volatile segments (Tool Calls) never blink decoratively.

## Configuration

Display mode persists via file-based storage:
- `~/.local/share/cortexkit/magic-context/sidebar-state-{hash}.json`
- Per-project using directory hash
- Reset to config default available in Settings

## Theme System

### Theme Sources

| Source | Description |
|--------|-------------|
| `follow_opencode` | Use OpenCode's current theme tokens |
| `magic_default` | Magic Context's default palette |
| `packaged_preset` | Curated preset from list below |
| `monochrome` | Grayscale palette |
| `high_contrast` | High contrast for accessibility |

### Packaged Presets

| Preset | Description |
|--------|-------------|
| `magicDefault` | Magic Context's default |
| `nord` | Arctic, north-bluish clean and elegant |
| `gruvbox` | Retro groove warm color scheme |
| `catppuccin` | Soothing pastel theme |
| `tokyonight` | Dark and vibrant |
| `github` | GitHub's dark theme colors |

### Color Overrides

Per-semantic-token color overrides in config:

```jsonc
{
  "tui": {
    "sidebar": {
      "theme": {
        "source": "follow_opencode",
        "preset": "opencode",
        "overrides": {
          "warning": "#d79921",
          "cold": "#7aa2f7"
        }
      }
    }
  }
}
```

Override resolution: base palette → apply overrides → validated final palette.

Invalid overrides are silently ignored.

### Motion Policy

| Mode | Description |
|------|-------------|
| `subtle` | Default. Pulse animations for active/critical states. |
| `reduced` | Minimal motion. Color changes only. |
| `off` | No motion at all. |

Motion applies only to small UI tokens (chips, labels), not whole rows/bars.

### Accessibility

- Color is never the only information channel
- Monochrome/High Contrast modes preserve meaning without relying on color
- Critical alerts use inverse styling as fallback when blink is unavailable

### License

Packaged presets derived from OpenCode default themes preserve MIT attribution.
OpenCode is MIT licensed (https://github.com/anomalyco/opencode).
