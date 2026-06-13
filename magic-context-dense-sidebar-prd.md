# PRD: Dense Collapsed Sidebar and Focused Diagnostic Panels for Magic Context

## 1. Product Summary

Magic Context already has a collapsible OpenCode sidebar, but the current collapsed mode behaves like a shortened dashboard rather than a high-density operational instrument. It does not persist display state, still consumes too many lines, does not show the most actionable context-health signals, and does not provide a clean path to focused diagnostics.

This PRD specifies a new opt-in **Dense Collapsed Sidebar** mode plus a focused subpanel system. The goal is to preserve the current classic collapsed behavior as the default while adding a superior mode that gives users a compact, ergonomic, high-information UI for context pressure, cache health, Historian activity, memory status, token usage, and configuration.

The new design should not replace the current sidebar immediately. It should coexist with:

- `Expanded`
- `Classic collapsed`
- `Dense collapsed`

The current classic collapsed mode remains default until Dense mode proves itself through user adoption.

## 2. Goals

### 2.1 Primary Goals

1. Add a persistent, opt-in Dense Collapsed Sidebar mode.
2. Make collapsed mode show the most actionable live signals in minimal space:
   - model context window size;
   - free headroom or active process state;
   - context pressure bar;
   - threshold marker;
   - context segment stability density;
   - optional cache-hit trend row;
   - immediate action buttons.
3. Add focused subpanels for Details, Allocation, Memory, Tokens, Cache, and Settings.
4. Avoid clutter by keeping secondary historical details out of the collapsed strip.
5. Preserve existing behavior and minimize review risk.
6. Clearly distinguish exact provider-reported token usage from estimated current visible-context usage.
7. Add Magic Context version and outdated-version status to Settings.

### 2.2 Non-Goals

1. Do not make Dense Collapsed mode the default in the first implementation.
2. Do not remove Classic collapsed mode.
3. Do not show fake cache, token, or eviction precision when telemetry is unavailable.
4. Do not implement decorative blinking. Blinking is allowed only for critical active faults.
5. Do not rely on Nerd Fonts. Nerd Font glyphs are optional enhancement only.
6. Do not treat visible-session-message token summation as authoritative historical token accounting after pruning or compaction.

## 3. User Problems

### Problem 1: Collapsed sidebar still uses too much space

Users collapse the sidebar to reclaim vertical space, but the current collapsed mode still reads like a small report. It shows several static rows that are not always immediately actionable.

### Problem 2: Users cannot quickly assess context health

Users need to know whether they are safe, approaching compaction, overflowing, experiencing cache churn, or waiting on Historian. A single generic health label is too vague.

### Problem 3: Users need context-window capacity visibility

A percentage alone is insufficient. `61%` means something different in a 32K, 128K, 180K, 200K, or 1M context window. The model context window should be visible in dense mode.

### Problem 4: Cache state is invisible in collapsed mode

When providers expose cache read/write information, users benefit from seeing cache health and cache busts. However, cache data must be hidden when unavailable or stale.

### Problem 5: Historian activity is operationally important

If Historian is compacting, stuck, or failing to reclaim meaningful context, the user should see that immediately.

### Problem 6: Expanded mode mixes too much information

Dreamer age, memory count, token stats, cache stats, and allocation are valuable, but not all at once. They need focused panels.

### Problem 7: Token stats can become misleading after pruning/compaction

If token totals are computed by summing currently visible session messages, they may be wrong after Magic Context flushes, prunes, summarizes, or compacts older history. The UI needs explicit accounting sources and confidence labels.

## 4. Design Principles

### 4.1 Collapsed strip is an instrument, not a dashboard

Collapsed mode should answer:

1. How much context headroom remains?
2. What is happening right now?
3. What is the most important risk?
4. What can I do immediately?

### 4.2 Different visual channels must encode different meanings

| Visual Channel | Meaning |
|---|---|
| Bar fill amount | context used vs context limit |
| `|` marker | compaction/execute threshold |
| `>` marker | overflow beyond hard context limit |
| Glyph density | context stability / removability |
| Risk flags | cause of degraded state |
| Cache Braille row | cache-hit trend |
| Numeric suffix | exact compact numeric value |
| Action row | available actions |

Do not use one visual channel for multiple unrelated meanings.

### 4.3 Fixed suffix labels, not inline overlays

Final decision: do not render numeric labels over bars. Use a left-justified fixed-width bar and a right-justified fixed-width numeric label with 1-2 cells of gap.

Example:

```text
████▒▒|░░      61%
⡀⣇⡄⣇⡆⡇⣇⣧⣷⣿   92.6%
```

### 4.4 No ambiguous Braille spacing

Braille cache bars must be contiguous. Do not insert spaces between Braille cells.

Correct:

```text
⡀⣇⡄⣇⡆⡇⣇⣧⣷⣿
```

Incorrect:

```text
⡀ ⣇ ⡄ ⣇ ⡆ ⡇ ⣇ ⣧ ⣷ ⣿
```

Missing samples must not look like 0% cache. Missing samples should be omitted or rendered with a dim `·`.

### 4.5 Exactness must be labeled

Token UI must distinguish:

- exact provider-reported historical usage;
- current visible context estimate;
- local tokenizer estimate;
- unavailable telemetry.

Do not display exact-looking totals if only estimates are available.

## 5. Core Interaction Model

### 5.1 Display Modes

```text
Expanded / Classic collapsed / Dense collapsed
```

Initial default:

```text
Classic collapsed
```

Dense Collapsed should be available through a switch in expanded/classic collapsed mode and through Settings.

### 5.2 Dense Collapsed Strip

Canonical rich state:

```text
180K · HIST↻ · Q3
████▒▒|░░      61%
⡀⣇⡄⣇⡆⡇⣇⣧⣷⣿   92.6%
[D] [S] [A] [F]3
```

Menu order is fixed:

```text
[D] [S] [A] [F]3
```

`[F]3` is last and only appears when there are pending flushable operations.

When nothing is pending:

```text
[D] [S] [A]
```

### 5.3 Click Behavior

```text
[D] → Details / Overview
[S] → Status / Allocation
[A] → Mode / Automation
[F]3 → Flush pending ops panel
```

Each opened subpanel has footer navigation:

```text
[Overview] [Alloc] [Memory]
[Tokens] [Cache] [Settings]
[X Close]
```

`[X Close]` returns to the previous sidebar display state. Do not call this `[Compact]`, because “compact” already means context reduction/session summarization in this domain.

## 6. Dense Collapsed Strip Specification

### 6.1 Top Row

Top row displays the highest-value current state.

Normal:

```text
180K · 69K free · OK
```

Historian active:

```text
180K · HIST↻ · Q3
```

Token pressure:

```text
180K · 11K over · T! HIST↻
```

Cache fault:

```text
180K · C! cache busts
```

Overflow:

```text
180K · OVERFLOW · T! H!
```

### 6.2 Risk Flags

| Flag | Meaning |
|---|---|
| `T!` | token/context pressure |
| `C!` | cache degraded or repeated busts |
| `Q!` | pending queue is stuck or growing |
| `H!` | Historian failed or stalled |
| `H?` | Historian telemetry stale/uncertain |
| `D?` | Dreamer stale |
| `M!` | memory bloat |
| `COLD>CTX` | cold/stable context exceeds usable window |

Use `!` only for active issue. Use `?` for uncertainty/staleness.

### 6.3 Historian Indicator

Use process chips:

| State | Display |
|---|---|
| idle | omitted |
| running | `HIST↻` |
| pending queue | `Q3` |
| failed | `H!` |
| stalled/no reclaim | `H!` |
| uncertain | `H?` |

Historian activity belongs in the top row, not inside the context bar.

### 6.4 Context Pressure Bar

The context bar is normalized against model context limit, not merely currently used input tokens.

Example:

```text
████▒▒|░░      61%
```

Elements:

| Glyph | Meaning |
|---|---|
| `█` | cold/stable context |
| `▒` | warm/movable context |
| `░` | hot/volatile context or free area depending styling |
| `|` | compaction threshold |
| `>` | overflow beyond hard limit |

### 6.5 Context Category Stability Mapping

Magic Context categories observed/currently represented:

| Category | Stability | Glyph |
|---|---|---|
| System | cold/stable | `█` |
| Tool Defs | cold/stable | `█` |
| Docs | cold or warm depending source/pinning | `█` or `▒` |
| Compartments | managed/warm | `▒` |
| Memories | cold/stable | `█` |
| User Profile | cold/stable | `█` |
| Conversation | warm/movable | `▒` |
| Tool Calls | hot/volatile | `░` |
| Free | free headroom | dim `░` or blank |

Absent categories in fresh sessions should be hidden.

### 6.6 Cache Braille Row

Only show if cache telemetry exists and is fresh.

Example:

```text
⡀⣇⡄⣇⡆⡇⣇⣧⣷⣿   92.6%
```

Rules:

- contiguous Braille cells;
- no spaces between cells;
- fixed-width numeric suffix;
- one decimal place preferred;
- hide row entirely if cache data unavailable.

Suggested glyph buckets:

| Hit Rate | Glyph |
|---:|---|
| 0-12.5% | `⡀` |
| 12.5-25% | `⡄` |
| 25-37.5% | `⡆` |
| 37.5-50% | `⡇` |
| 50-62.5% | `⣇` |
| 62.5-75% | `⣧` |
| 75-87.5% | `⣷` |
| 87.5-100% | `⣿` |

Use color/background interpolation if supported:

- 100-75%: green to yellow;
- 75-50%: yellow to orange;
- 50-25%: orange to red;
- 25-0%: red to deeper red.

### 6.7 Dense Strip State Examples

Healthy:

```text
180K · 69K free · OK
██████▒▒░░      61%
⣷⣿⣿⣿⣷⣿⣿⣷⣿   96.1%
[D] [S] [A]
```

Historian compacting:

```text
180K · HIST↻ · Q3
████▒▒|░░      61%
⡀⣇⡄⣇⡆⡇⣇⣧⣷⣿   92.6%
[D] [S] [A] [F]3
```

Token pressure:

```text
180K · 11K over · T! HIST↻
████▒▒|░░      72%
⣷⣧⣇⡇⡆⡄⣇⣧⣷⣿   84.3%
[D] [S] [A] [F]3
```

Cache issue:

```text
180K · C! cache busts
████▒▒░░░      44%
⡀⡀⡄⡀⡄⡀⡆⡇⣇⣧   41.2%
[D] [S] [A]
```

Overflow:

```text
180K · OVERFLOW · T! H!
████▒▒|░░>    103%
⡀⡀⡄⡀⡄⡀⡆⡇⣇⣧   41.2%
[D] [S] [A] [F]3
```

No cache telemetry:

```text
180K · HIST↻ · Q3
████▒▒|░░      61%
[D] [S] [A] [F]3
```

Fresh session:

```text
180K · 146K free · OK
█████░░░░░      19%
[D] [S] [A]
```

## 7. Subpanel Specifications

### 7.1 Details / Overview Panel

Opened by `[D]` or `[Overview]`.

Purpose:

- explain the collapsed strip;
- show exact context numbers;
- summarize state, cache, memory, risks, and suggestions.

```text
┌ Magic Context · Details ┐
│ 180K · HIST↻ · Q3       │
│ ████▒▒|░░        61%    │
├─────────────────────────┤
│ Context                 │
│ Used: 111K / 180K · 61.7%│
│ Threshold: 65% · 117K   │
│ Margin: 6K to compact   │
│ Free: 69K               │
│                         │
│ State                   │
│ Historian: running      │
│ Queue: 3 pending drops  │
│ Mode: Auto              │
│                         │
│ Cache                   │
│ Hit: 92.6% · 152 calls  │
│ Last bust: 83 calls ago │
│                         │
│ Memory                  │
│ 47 memories · 3 notes   │
│ Dreamer: 2h ago         │
│                         │
│ Risk                    │
│ Primary: T! token pressure│
│ Secondary: Q! pending drops│
│ Velocity: +12K last turn│
│                         │
│ Suggestion              │
│ [F] Flush queued ops    │
│ Let Historian finish    │
│ Consider Conserve mode  │
├─────────────────────────┤
│ [█ Overview █] [Alloc]  │
│ [Memory] [Tokens]       │
│ [Cache] [Settings]      │
│ [X Close]               │
└─────────────────────────┘
```

Healthy example:

```text
Context: 111K / 180K · 61.7%
Threshold: 65% · 6K to compact
State: OK · Auto
Cache: 96.1% hit · last bust none recent
Memory: 47 memories · Dreamer 2h ago
Suggestion: continue
```

Bad example:

```text
Context: 185K / 180K · 103%
Threshold: 65% · 68K over target
State: H! historian stalled · Q3 pending
Cache: 41.2% hit · repeated busts
Risk: T! overflow, C! cache churn, H! failed reclaim
Suggestion: flush queue, switch Conserve, inspect hot Tool Calls
```

### 7.2 Status / Allocation Panel

Opened by `[S]` or `[Alloc]`.

Purpose:

- show category allocation;
- expose context stability;
- identify hot contributors.

```text
┌ Magic Context · Status ┐
│ 180K · HIST↻ · Q3      │
│ ████▒▒|░░        61%   │
├────────────────────────┤
│ Context allocation     │
│ System       ██████ 34K 24% cold │
│ Tool Defs    ██████ 35K 25% cold │
│ Docs         ███    15K 10% warm │
│ Compartments ▒       9   0% managed │
│ Memories     █       3K  2% cold │
│ User Profile █       152 0% cold │
│ Conversation ▒▒▒    17K 12% warm │
│ Tool Calls   ░░░░░  39K 27% hot  │
│ Free         ░░░░░  69K 38% free │
│                        │
│ Legend                 │
│ █ cold / stable        │
│ ▒ warm / movable       │
│ ░ hot / volatile       │
│ | compact threshold    │
│ > overflow             │
│                        │
│ Hot contributor         │
│ Tool Calls: cache churn risk │
├────────────────────────┤
│ [Overview] [█ Alloc █] │
│ [Memory] [Tokens]      │
│ [Cache] [Settings]     │
│ [X Close]              │
└────────────────────────┘
```

Fresh session example:

```text
Context allocation
System       ██████ 34K 24% cold
Tool Defs    ██████ 35K 25% cold
Docs         ███    15K 10% warm
Conversation ▒      1K  1% warm
Free         ░░░░░░ 95K 40% free

Hidden: Memories, Compartments, User Profile, Tool Calls
```

Cold-context problem example:

```text
Context allocation
System       ███████ 34K
Tool Defs    ███████ 35K
Docs pinned  █████   28K
Memories     ███     14K
Cold total: 111K
Window: 128K
Usable movable headroom: 17K

Risk: COLD>CTX
Suggestion: reduce pinned docs/tool defs or use larger context model
```

### 7.3 Mode / Automation Panel

Opened by `[A]`.

Purpose:

- show current operating mode;
- recommend mode changes;
- expose display-mode switch;
- avoid accidental immediate mode changes.

```text
┌ Magic Context · Mode ┐
│ Current: Auto        │
│ Recommended: Conserve│
├──────────────────────┤
│ Operating mode       │
│ [█ Auto █]           │
│ Balanced defaults.   │
│                      │
│ [Conserve]           │
│ Compact earlier.     │
│ Reduce cache churn.  │
│ Prefer stable context│
│ when T!/C!/Q! appear.│
│                      │
│ [Aggressive]         │
│ Preserve active ctx. │
│ Delay compaction.    │
│ Higher overflow risk.│
│                      │
│ [Observe]            │
│ Report only.         │
│ Avoid disruptive ops.│
│                      │
│ Current signals      │
│ T! token pressure    │
│ Q3 pending drops     │
│ HIST↻ running        │
│                      │
│ Display mode         │
│ [Classic] [█ Dense █]│
│ [Expanded]           │
│ [Reset to default]   │
├──────────────────────┤
│ [Overview] [Alloc]   │
│ [Memory] [Tokens]    │
│ [Cache] [Settings]   │
│ [X Close]            │
└──────────────────────┘
```

Healthy example:

```text
Current: Auto
Recommended: Auto
Signals: OK
Display: [Classic] [█ Dense █] [Expanded]
```

Token-pressure example:

```text
Current: Auto
Recommended: Conserve
Signals: T! token pressure, Q3 pending drops
Reason: usage over threshold and Historian is active
```

Aggressive-mode warning example:

```text
Current: Aggressive
Warning: threshold exceeded
Tradeoff: preserves active context but increases overflow/cache churn risk
Suggested: switch to Auto or Conserve
```

### 7.4 Flush Panel

Opened by `[F]3`.

Purpose:

- show pending flushable operations;
- confirm action if potentially disruptive;
- execute immediately only if configured as safe.

```text
┌ Flush pending ops ┐
│ 3 pending drops   │
│ Historian: running│
│                   │
│ This will apply   │
│ queued context ops│
│ immediately.      │
│                   │
│ [Flush now]       │
│ [Cancel]          │
└───────────────────┘
```

Executing state:

```text
180K · flushing… · Q3
████▒▒|░░      61%
⡀⣇⡄⣇⡆⡇⣇⣧⣷⣿   92.6%
[D] [S] [A]
```

Complete state:

```text
180K · HIST↻ · OK
████▒▒░░░      59%
⣇⣧⣷⣿⣿⣿⣷⣿⣿   94.1%
[D] [S] [A]
```

### 7.5 Memory / Maintenance Panel

Opened by `[Memory]`.

Purpose:

- show Dreamer age;
- memory count;
- smart notes;
- profile tokens;
- compartment count;
- Historian reclaim behavior.

```text
┌ Magic Context · Memory ┐
│ 47 memories · Dreamer 2h ago │
├────────────────────────┤
│ Memories               │
│ Count: 47              │
│ Memory tokens: 3K      │
│ Smart notes: 3 ready   │
│ User profile: 152 tok  │
│ Compartments: 9        │
│                        │
│ Dreamer                │
│ Last run: 2h ago       │
│ Last result: improved  │
│ Next suggested: not due│
│                        │
│ Historian              │
│ State: running         │
│ Pending drops: 3       │
│ Last compact: 14m ago  │
│ Reclaimed last run: 21K│
│                        │
│ Warnings               │
│ none                   │
├────────────────────────┤
│ [Overview] [Alloc]     │
│ [█ Memory █] [Tokens]  │
│ [Cache] [Settings]     │
│ [X Close]              │
└────────────────────────┘
```

Fresh session example:

```text
Memories: none
Smart notes: none
User profile: not loaded
Compartments: none
Dreamer: never run
Historian: idle
```

Stale maintenance example:

```text
Memories: 92 · 18K
Smart notes: 14 ready
Dreamer: last ran 3d ago
Historian: idle
Warning: M! memory bloat, D? dreamer stale
Suggestion: run Dreamer or inspect memory growth
```

Failed reclaim example:

```text
Historian: repeated compaction
Reclaimed last run: 0.8K
Cold context: 124K / 128K window
Warning: H! cannot reclaim enough context
Suggestion: reduce cold baseline or switch to larger context model
```

### 7.6 Tokens Panel

Opened by `[Tokens]`.

Purpose:

- show token usage without lying after pruning/compaction;
- separate exact provider-reported cumulative totals from current visible context estimates.

The panel must have two sections:

1. **Usage ledger** — exact if built from provider/OpenCode usage events.
2. **Current context estimate** — estimated from current snapshot/context composition.

```text
┌ Magic Context · Tokens ┐
│ Session token stats    │
├────────────────────────┤
│ Provider usage ledger  │
│ Source: exact events   │
│ Total: 1.42M           │
│ Input: 812K            │
│ Cached input/read: 516K│
│ Cache write: 74K       │
│ Output: 92K            │
│ Reasoning: 18K         │
│                        │
│ Current context estimate│
│ Visible context: 111K  │
│ Model window: 180K     │
│ Usage: 61.7%           │
│                        │
│ By model               │
│ sonnet-4.6: 1.1M       │
│ opus-4.6: 320K         │
├────────────────────────┤
│ [Overview] [Alloc]     │
│ [Memory] [█ Tokens █]  │
│ [Cache] [Settings]     │
│ [X Close]              │
└────────────────────────┘
```

Unavailable exact usage example:

```text
Provider usage ledger unavailable
Reason: no persisted usage events for this session
Current context estimate:
Used: 111K / 180K · 61.7%

Do not sum visible messages as historical total after pruning/compaction.
```

Cache-heavy efficient example:

```text
Provider usage ledger
Total: 1.42M
Input: 812K
Cached input/read: 516K
Output: 92K
Cache hit: 92.6%
Interpretation: efficient reuse
```

Expensive churn example:

```text
Provider usage ledger
Total: 1.92M
Input: 1.34M
Cached input/read: 112K
Output: 188K
Cache hit: 41.2%
Warning: C! cache churn
Likely cause: volatile Tool Calls
```

Implementation requirement:

- Do not rely on summing currently visible messages for historical totals after Magic Context has flushed/pruned/compacted.
- Add or use a durable per-step usage ledger populated from provider/OpenCode `step-finish` token usage.
- Mark values as `exact`, `estimated`, or `unavailable`.

### 7.7 Cache Panel

Opened by `[Cache]`.

Purpose:

- show cache trend;
- cache read/write/miss distribution;
- bust history;
- likely cause.

```text
┌ Magic Context · Cache ┐
│ Hit trend · last 12 calls │
│ ⡀⣇⡄⣇⡆⡇⣇⣧⣷⣿   92.6% │
├────────────────────────┤
│ Last 10 API calls      │
│ Hit   ⣿⣿⣿⣿⣿⣿⣿⣷░   92.6% │
│ Read  ⣿⣿⣿⣿⣿⣧░░░     74% │
│ Write ⣿⣇░░░░░░░░       18% │
│ Miss  ⡄░░░░░░░░░        8% │
│                        │
│ Last bust: 83 calls ago│
│ Worst recent: #148     │
│ Cause: tool output churn│
├────────────────────────┤
│ [Overview] [Alloc]     │
│ [Memory] [Tokens]      │
│ [█ Cache █] [Settings] │
│ [X Close]              │
└────────────────────────┘
```

Excellent cache example:

```text
Hit trend
⣷⣿⣿⣿⣷⣿⣿⣷⣿   96.1%

Last bust: none recent
Cause: stable prompt + reusable context
```

Critical cache example:

```text
Hit trend
⡀⡀⡄⡀⡄⡀⡆⡇⣇⣧   41.2%

Repeated busts: 5 / last 12 calls
Cause: volatile tool output + changing prompt prefix
Warning: C!
```

### 7.8 Settings Panel

Opened by `[Settings]`.

Purpose:

- display mode;
- dense rendering configuration;
- alert rendering;
- glyph preset;
- Magic Context version and update status.

```text
┌ Magic Context · Settings ┐
│ Display mode             │
│ [Classic] [█ Dense █] [Expanded] │
│                          │
│ Dense sidebar            │
│ [✓] pressure bar         │
│ [✓] threshold marker     │
│ [✓] stability density    │
│ [✓] percent label        │
│ [✓] cache trend row      │
│                          │
│ Alerts                   │
│ Critical blink: Auto     │
│ Blink only for:          │
│ C! repeated cache busts  │
│ H! historian failure     │
│ T! overflow              │
│ cold context > window    │
│                          │
│ Glyphs                   │
│ [█ Unicode █] [Nerd] [ASCII] │
│                          │
│ Version                  │
│ Magic Context: v0.21.8   │
│ Update: current          │
│                          │
│ Defaults                 │
│ Config default: Classic  │
│ Current override: Dense  │
│ [Reset to config default]│
├──────────────────────────┤
│ [Overview] [Alloc]       │
│ [Memory] [Tokens]        │
│ [Cache] [█ Settings █]   │
│ [X Close]                │
└──────────────────────────┘
```

Outdated version example:

```text
Version
Magic Context: v0.21.8
Latest: v0.22.3
Update: available
```

Offline / unknown example:

```text
Version
Magic Context: v0.21.8
Latest: unknown
Update check: unavailable offline
```

Version check must be non-blocking and cached. Do not block sidebar render on network/package registry checks.

## 8. Configuration

### 8.1 Proposed Config Shape

```jsonc
{
  "tui": {
    "sidebar": {
      "defaultDisplayMode": "classic_collapsed",
      "persistDisplayMode": true,
      "allowDisplayModeSwitching": true,

      "classicCollapsed": {
        "enabled": true
      },

      "denseCollapsed": {
        "enabled": true,
        "activation": "manual",

        "bar": {
          "mode": "pressure_allocation",
          "percentLabel": "suffix",
          "labelWidth": "auto",
          "thresholdMarker": true,
          "overflowMarker": true,
          "stabilityDensity": true
        },

        "health": {
          "showPosture": true,
          "showRiskFlags": true,
          "showVelocity": true
        },

        "cache": {
          "showHitTrend": "auto",
          "trendWindow": 12,
          "requireFreshTelemetry": true,
          "colorMode": "auto",
          "braille": true,
          "decimals": "auto"
        },

        "actions": {
          "show": "auto",
          "buttons": ["details", "status", "mode", "flush"]
        },

        "alerts": {
          "blinkCritical": "auto",
          "blinkOnly": [
            "cache_repeated_bust",
            "cache_hit_critical",
            "historian_failed",
            "historian_stalled",
            "cold_context_exceeds_window",
            "context_overflow"
          ]
        },

        "glyphs": {
          "preset": "auto"
        }
      }
    }
  }
}
```

### 8.2 Persistence

Use config for defaults and plugin KV for user override.

Required behavior:

1. If user has never selected a display mode, use config default.
2. If user selects a display mode, persist it.
3. Settings panel offers `[Reset to config default]`.
4. Existing Classic collapsed behavior remains available.

## 9. Token Accounting Architecture

### 9.1 Problem

Magic Context may flush/prune old messages, summarize history, or replace message history through Historian/session compaction. Therefore:

```text
sum(current visible messages) != true historical session/model token usage
```

### 9.2 Required Data Model

Add a durable usage ledger keyed by session and provider/model/turn.

Suggested record:

```ts
interface UsageLedgerEvent {
  id: string
  sessionId: string
  parentSessionId?: string | null
  turnId?: string | null
  assistantMessageId?: string | null
  providerId: string
  modelId: string
  agentName?: string | null
  timestamp: number

  inputTokens: number
  outputTokens: number
  reasoningTokens: number
  cacheReadInputTokens: number
  cacheWriteInputTokens: number

  source: "opencode_step_finish" | "provider_usage" | "estimated"
  confidence: "exact" | "estimated"
}
```

### 9.3 UI Labels

The Tokens panel must label source:

```text
Provider usage ledger
Source: exact events
```

or:

```text
Provider usage ledger unavailable
Current context estimate only
```

### 9.4 Aggregation

Support:

1. current active session;
2. current session tree including child/recomp sessions if available;
3. by model;
4. by provider;
5. cache read/write totals;
6. output/reasoning totals.

### 9.5 Acceptance Criteria

1. Token panel never displays historical totals derived only from currently visible messages unless labeled `current estimate`.
2. Provider-reported ledger survives message pruning and session compaction.
3. If exact ledger is unavailable, UI says unavailable rather than guessing.
4. Tests cover pruning/compaction scenario where current messages shrink but ledger totals remain stable.

## 10. Version / Outdated Detection

### 10.1 Requirements

Settings panel shows:

```text
Magic Context: vX.Y.Z
Update: current / available / unknown
```

### 10.2 Update Source

Implementation may use one of:

1. package registry metadata if Magic Context is distributed as a package;
2. GitHub releases/tags if package registry is unavailable;
3. local-only fallback showing current version and `Latest: unknown`.

### 10.3 Constraints

1. Non-blocking.
2. Cached.
3. Timeout bounded.
4. Works offline.
5. Does not fail sidebar render if check fails.

## 11. User Stories

### Story 1: Persist display mode

As a frequent Magic Context user, I want the sidebar to remember whether I prefer Classic, Dense, or Expanded mode so that I do not reconfigure it every session.

Acceptance criteria:

- user-selected display mode persists across TUI restart;
- config default applies only until user overrides;
- user can reset override.

### Story 2: Use Dense mode without disrupting existing users

As a maintainer, I want Dense mode to be opt-in so that existing users keep the current collapsed behavior.

Acceptance criteria:

- Classic collapsed remains default;
- Dense is selectable from Classic/Expanded/Settings;
- no existing sidebar behavior is removed.

### Story 3: Understand context pressure at a glance

As a user, I want to see context window size, free headroom, used percentage, and compaction threshold in a compact strip.

Acceptance criteria:

- top row shows model context capacity;
- bar shows used percentage;
- threshold marker appears when threshold is known;
- overflow marker appears over 100%.

### Story 4: Understand context stability

As a user, I want the context bar to distinguish stable context from volatile context so that I know what can be reclaimed.

Acceptance criteria:

- `█`, `▒`, `░` density mapping implemented;
- Tool Calls are hot/volatile;
- System and Tool Defs are cold/stable;
- absent categories hidden.

### Story 5: See Historian status immediately

As a user, I want to know when Historian is compacting, stuck, or failing.

Acceptance criteria:

- `HIST↻` shows while running;
- `H!` shows on failure/stall;
- repeated low-reclaim compaction can trigger critical alert.

### Story 6: See cache health when available

As a user, I want a compact cache trend row when provider/cache telemetry exists.

Acceptance criteria:

- cache row appears only with fresh telemetry;
- contiguous Braille row;
- fixed-width numeric suffix;
- one decimal place preferred;
- row hidden if unavailable.

### Story 7: Navigate to focused diagnostics

As a user, I want focused panels for Details, Allocation, Memory, Tokens, Cache, and Settings so that I can inspect issues without cluttering collapsed mode.

Acceptance criteria:

- footer nav appears in each subpanel;
- `[X Close]` returns to previous state;
- selected tab uses background/inverse styling.

### Story 8: Trust token statistics

As a user, I want token totals to remain accurate after Magic Context compacts or prunes history.

Acceptance criteria:

- provider-reported exact usage is persisted separately from visible messages;
- current context estimate is clearly labeled;
- no exact-looking history totals from pruned visible messages.

### Story 9: See version/update status

As a user, I want to know the current Magic Context version and whether it is outdated.

Acceptance criteria:

- Settings shows current version;
- update status is current/available/unknown;
- check is non-blocking and cached.

## 12. Implementation Plan and Beads Work Breakdown

The implementation should be carried out as the `mc-sidp-` Beads epic. The work is intentionally sequential for one agent.

Recommended sequence:

1. `mc-sidp-01-audit`: audit current sidebar, snapshot, cache, token, version sources.
2. `mc-sidp-02-display-mode`: add display mode config and persistence.
3. `mc-sidp-03-dense-strip`: add Dense collapsed strip renderer.
4. `mc-sidp-04-risk-classifier`: add risk/process classifier.
5. `mc-sidp-05-panel-shell`: add subpanel router/nav/close shell.
6. `mc-sidp-06-core-panels`: implement Details, Status, Mode, Flush.
7. `mc-sidp-07-memory-panel`: implement Memory/Maintenance panel.
8. `mc-sidp-08-cache-telemetry`: implement cache telemetry, Braille row, Cache panel.
9. `mc-sidp-09-token-ledger`: implement durable token usage ledger and Tokens panel.
10. `mc-sidp-10-settings-version`: implement Settings and version/update status.
11. `mc-sidp-11-glyph-alerts`: implement glyph presets and critical alert rendering.
12. `mc-sidp-12-tests-fixtures`: add tests and visual fixtures.
13. `mc-sidp-13-docs`: update user/developer documentation.
14. `mc-sidp-14-verification`: independent verification pass.
15. `mc-sidp-15-milestone`: completion marker.

## 13. Validation and Testing

### 13.1 Unit Tests

Required tests:

- display-mode config parsing;
- KV persistence and reset;
- fixed-width label layout;
- bar threshold marker placement;
- overflow marker placement;
- stability-density classification;
- risk flag derivation;
- cache Braille glyph mapping;
- cache row freshness gating;
- token ledger aggregation;
- token exact/estimate labels;
- version status formatting.

### 13.2 Integration Tests

Required scenarios:

1. Fresh session with minimal categories.
2. Long session with all observed categories:
   - System;
   - Docs;
   - Compartments;
   - Memories;
   - User Profile;
   - Conversation;
   - Tool Calls;
   - Tool Defs.
3. Historian running.
4. Historian failed.
5. Pending flush queue.
6. Cache unavailable.
7. Cache excellent.
8. Cache critical.
9. Session after pruning/compaction.
10. Offline version check.

### 13.3 Visual Regression Fixtures

Fixture snapshots should render:

- healthy dense;
- historian active;
- token pressure;
- cache critical;
- overflow;
- no cache telemetry;
- fresh session;
- cold-context problem;
- every subpanel.

## 14. Rollout Plan

Phase 1:

- Persisted display mode.
- Dense collapsed renderer.
- Details/Status/Mode panels.
- Existing Classic remains default.

Phase 2:

- Memory/Cache/Settings panels.
- Cache Braille row if telemetry available.
- Version display.

Phase 3:

- Durable token usage ledger.
- Tokens panel.
- Exact/estimated token accounting.

Phase 4:

- Critical alert refinements.
- Nerd Font optional glyph preset.
- UX polish and visual fixtures.

## 15. Risks and Mitigations

### Risk: Dense mode becomes visually noisy

Mitigation:

- Classic remains default.
- Dense rich features are width/freshness gated.
- Cache row hidden unless useful.

### Risk: Token stats are wrong after pruning

Mitigation:

- Durable provider usage ledger.
- Explicit source labels.
- Current context estimate separate from historical totals.

### Risk: Cache telemetry unavailable

Mitigation:

- Hide cache row.
- Show Cache panel unavailable reason.
- No fake zeros.

### Risk: Terminal glyph issues

Mitigation:

- Unicode default.
- Nerd optional.
- ASCII fallback.
- Avoid blank Braille for 0%.

### Risk: Accidental mode changes

Mitigation:

- `[A]` opens mode selector.
- Does not immediately cycle.
- Selected states require explicit click.

### Risk: Version check blocks UI

Mitigation:

- Non-blocking.
- Cached.
- Timeout bounded.
- Offline-safe.

## 16. Acceptance Criteria Summary

The feature is complete when:

1. Dense collapsed mode is available but not default.
2. User-selected display mode persists.
3. Dense strip renders context capacity, pressure bar, suffix percent, risk/process state, optional cache row, and stable action order.
4. `[F]n` is last and hidden when empty.
5. Details, Status, Mode, Memory, Tokens, Cache, and Settings panels are navigable and close with `[X Close]`.
6. Settings shows Magic Context version and update status.
7. Token usage panel distinguishes exact provider ledger from current context estimate.
8. Token history remains accurate after message pruning/compaction if provider usage events were captured.
9. Cache row is contiguous, suffix-labeled, and hidden when telemetry is unavailable.
10. Critical blinking is limited to real fault states.
11. Classic collapsed mode remains unchanged and default.
