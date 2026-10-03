/** @jsxImportSource @opentui/solid */
import { For, Show, createEffect, createMemo, createSignal, on, onCleanup } from "solid-js"
import type { TuiSlotPlugin, TuiPluginApi, TuiThemeCurrent } from "@opencode-ai/plugin/tui"
import { badgeTextColor } from '../badge-contrast';
import { loadSidebarSnapshot, type SidebarSnapshot } from "../data/context-db"
import {
    buildMagicContextSidebarView,
    type SidebarRecompStatus,
    type SidebarSection,
    type SidebarTokenBar,
    type SidebarTone,
    type SidebarViewRow,
} from "../../shared/sidebar-view"
import { directoryForSession } from "../data/session-directory"
import {
    computeEffectiveOrder,
    DEFAULT_SLOT_ORDER,
    type MagicContextTuiPrefs,
    PLUGIN_KEY,
    queueTuiPreferenceUpdate,
    readTuiPreferencesFile,
    readTuiPreferencesFileSync,
    resolveMagicContextPrefs,
    watchTuiPreferences,
} from "../../shared/tui-preferences"

// Module-level hook so the upgrade/recomp dialog can kick the sidebar into its
// fast recomp self-poll the INSTANT the user confirms — without waiting for a
// parent-session message event (the RPC upgrade/recomp call fires none). The
// mounted SidebarContent registers its refresh here.
let activeRecompPollKick: (() => void) | null = null
let activeSidebarRefresh: (() => void) | null = null
export function kickRecompProgressRefresh(): void {
    activeRecompPollKick?.()
}

/** Ask the mounted sidebar to fetch an out-of-band status update now. */
export function refreshSidebarSnapshot(): void {
    activeSidebarRefresh?.()
}

const SINGLE_BORDER = { type: "single" } as any
const REFRESH_DEBOUNCE_MS = 150

export interface SidebarController {
    prefs: () => MagicContextTuiPrefs
    collapsed: () => boolean
    toggleCollapsed: () => void
    dispose: () => void
}

// The TUI may unmount and remount sidebar_content when the user switches views
// (main -> subagent -> main). A remount re-runs the component body, so a signal
// created inside the component would reset to its seed. The controller lives in
// the slot-factory closure (plugin/process lifetime) and owns the durable
// prefs/collapse signals plus the single shared file watcher, so collapse state
// and live pref reloads survive remounts. No Solid effects/memos here — those
// need an owner; the poll-interval effect stays inside the component.
function createSidebarController(initialPrefs: MagicContextTuiPrefs): SidebarController {
    const [prefs, setPrefs] = createSignal<MagicContextTuiPrefs>(initialPrefs)
    const seedCollapsed =
        initialPrefs.rememberCollapsed && initialPrefs.collapsed != null
            ? initialPrefs.collapsed
            : initialPrefs.startCollapsed
    const [collapsed, setCollapsed] = createSignal(seedCollapsed)
    let lastPersistedCollapsed: boolean | null = initialPrefs.collapsed
    let lastApplied = JSON.stringify(initialPrefs)

    // Collapse echo guard: lastPersistedCollapsed advances only once our own
    // write lands, so a watcher echo of the value we just wrote is rejected by
    // the `!==` check and cannot revert a user click.
    const stopWatchingPreferences = watchTuiPreferences(() => {
        void (async () => {
            const next = resolveMagicContextPrefs(await readTuiPreferencesFile())
            const serialized = JSON.stringify(next)
            if (serialized === lastApplied) return
            lastApplied = serialized
            setPrefs(next)
            if (
                next.rememberCollapsed &&
                next.collapsed != null &&
                next.collapsed !== lastPersistedCollapsed
            ) {
                lastPersistedCollapsed = next.collapsed
                setCollapsed(next.collapsed)
            }
        })()
    })

    function toggleCollapsed() {
        const next = !collapsed()
        setCollapsed(next)
        if (prefs().rememberCollapsed) {
            void queueTuiPreferenceUpdate(PLUGIN_KEY, ["collapsed"], next).then(() => {
                lastPersistedCollapsed = next
            })
        }
    }

    return {
        prefs,
        collapsed,
        toggleCollapsed,
        dispose: stopWatchingPreferences,
    }
}

// Maps shared semantic tones onto the host theme. `success` falls back to the
// accent color on themes that define no success token (pre-refactor behavior).
const toneColor = (theme: TuiThemeCurrent, tone: SidebarTone) => {
    if (tone === "muted") return theme.textMuted
    if (tone === "accent") return theme.accent
    if (tone === "warning") return theme.warning
    if (tone === "error") return theme.error
    if (tone === "success") return theme.success ?? theme.accent
    return theme.text
}

// One label/value line. `row.bold` preserves the pre-refactor split between
// bold-value lines and the plain (non-bold) compact summary rows.
const ViewRow = (props: { theme: TuiThemeCurrent; row: SidebarViewRow }) => (
    <box width="100%" flexDirection="row" justifyContent="space-between">
        <text fg={props.theme.textMuted}>{props.row.label}</text>
        <text fg={toneColor(props.theme, props.row.tone)}>
            {props.row.bold ? <b>{props.row.value}</b> : props.row.value}
        </text>
    </box>
)

// Section block: optional right-aligned live-status header, rows, and the
// live recomp progress strip when the shared model attaches one.
const SectionView = (props: { theme: TuiThemeCurrent; section: SidebarSection }) => (
    <>
        {props.section.header.status ? (
            <box width="100%" marginTop={1} flexDirection="row" justifyContent="space-between">
                <text fg={props.theme.text}>
                    <b>{props.section.header.title}</b>
                </text>
                <text fg={toneColor(props.theme, props.section.header.status.tone)}>
                    {props.section.header.status.text}
                </text>
            </box>
        ) : (
            <box width="100%" marginTop={1}>
                <text fg={props.theme.text}>
                    <b>{props.section.header.title}</b>
                </text>
            </box>
        )}
        <For each={props.section.rows}>{(row) => <ViewRow theme={props.theme} row={row} />}</For>
        <Show when={props.section.recomp}>
            {(recomp) => <RecompProgressSection theme={props.theme} recomp={recomp()} />}
        </Show>
    </>
)

// Live recomp progress. Verb, phase label, bar, note, rows and terminal
// reason all arrive from the shared builder — drawing only lives here.
// CRITICAL: read `props.recomp` reactively on every access — do NOT
// destructure it into a local `const` at creation time. The parent keeps
// THIS component instance mounted as the phase advances (recomp → migration
// → done), so a frozen local would render the creation-time phase forever.
const RecompProgressSection = (props: { theme: TuiThemeCurrent; recomp: SidebarRecompStatus }) => (
    <>
        <box width="100%" marginTop={1} flexDirection="row" justifyContent="space-between">
            <text fg={props.theme.text}>
                <b>{props.recomp.verb}</b>
            </text>
            <text fg={toneColor(props.theme, props.recomp.statusTone)}>{props.recomp.statusText}</text>
        </box>
        {/* Determinate bar during the compartment-rebuild phase. */}
        <Show when={props.recomp.bar}>
            {(bar) => (
                <box width="100%" flexDirection="row" justifyContent="space-between">
                    <text fg={props.theme.accent}>{bar().barText}</text>
                    <text fg={props.theme.textMuted}>{bar().percentText}%</text>
                </box>
            )}
        </Show>
        {/* Transient status note (e.g. "Starting…", "Trying fallback
            sonnet-4-6…", "Repair retry…") — surfaces live activity during a
            long pass, including before the determinate range is known. */}
        <Show when={props.recomp.note}>{(note) => <text fg={props.theme.textMuted}>{note()}</text>}</Show>
        <For each={props.recomp.rows}>{(row) => <ViewRow theme={props.theme} row={row} />}</For>
        {/* Terminal reason (failed/skipped) — kept visible so the user sees
            WHY (a failure, or the transient "retry shortly" skip cause). */}
        <Show when={props.recomp.message}>{(message) => <text fg={props.theme.textMuted}>{message()}</text>}</Show>
    </>
)

// Segmented token breakdown bar with legend. Draws the shared canonical
// category data only: keys, colors, order and text live in
// shared/sidebar-view.ts (SIDEBAR_TOKEN_CATEGORIES).
const TokenBreakdown = (props: { theme: TuiThemeCurrent; bar: SidebarTokenBar; collapsed?: boolean }) => (
    <box width="100%" flexDirection="column">
        {/* The bar is a width="100%" flex row of colored boxes, each with
            flexGrow proportional to its weight and flexBasis=0. opentui
            distributes the parent container's full width proportionally, so
            the bar always fills the sidebar regardless of terminal size. No
            hardcoded width is needed — this fixes both the over-wide bar that
            wrapped onto a second line on narrow sidebars (issue #90) and the
            under-wide bar that left empty space on the right. */}
        <box width="100%" flexDirection="row" height={1}>
            {props.bar.segments.map((segment) => (
                <box
                    key={segment.key}
                    flexGrow={segment.weight}
                    flexBasis={0}
                    height={1}
                    backgroundColor={segment.color}
                />
            ))}
        </box>
        {/* Legend rows — suppressed in collapsed mode (bar only) */}
        {!props.collapsed && (
            <box flexDirection="column" marginTop={0}>
                {props.bar.legend.map((entry) => (
                    <box key={entry.key} width="100%" flexDirection="row" justifyContent="space-between">
                        <text fg={entry.color}>{entry.label}</text>
                        <text fg={props.theme.textMuted}>
                            {entry.valueText} ({entry.percentText}%)
                        </text>
                    </box>
                ))}
            </box>
        )}
    </box>
)

const SidebarContent = (props: {
    api: TuiPluginApi
    sessionID: () => string
    theme: TuiThemeCurrent
    controller: SidebarController
}) => {
    const [snapshot, setSnapshot] = createSignal<SidebarSnapshot | null>(null)
    // Collapse state + section visibility prefs live in the controller (plugin
    // closure), so they survive view-switch remounts and persist across restarts
    // via ~/.config/opencode/tui-preferences.jsonc. Read reactively.
    const collapsed = props.controller.collapsed
    const sections = () => props.controller.prefs().sections
    const headerLabel = () => props.controller.prefs().header.label
    let refreshTimer: ReturnType<typeof setTimeout> | undefined
    // Self-sustaining poll while a recomp/upgrade is running. Recomp work
    // happens in CHILD sessions whose message events are filtered out of the
    // subscription below, so without this the progress bar would freeze until
    // the next parent-session message. Active only during recomp/migration;
    // stops itself once the phase goes terminal/absent (dogfood 2026-05-30).
    let recompPollTimer: ReturnType<typeof setTimeout> | undefined
    const RECOMP_POLL_MS = 1200
    // Robust recomp poll state. The loop MUST survive a failed/slow snapshot
    // fetch — the server is busy doing the historian LLM call during a recomp,
    // so a poll can reject or return a stale (pre-recomp) cached snapshot. The
    // OLD loop reattached the next timer only inside `.then()`, so any rejection
    // killed it and the bar froze mid-pass (dogfood 2026-05-30). This version
    // reschedules on BOTH success and failure, keyed on `recompActive`, and only
    // stops on a terminal phase, a bounded "never started" probe window, or the
    // entry vanishing after we'd seen it active.
    let recompActive = false
    let recompSawPhase = false
    let recompPollCount = 0
    let recompConsecutiveAbsent = 0
    let recompSessionId: string | null = null
    let snapshotRequestSequence = 0
    const RECOMP_PROBE_MAX = 12 // ~15s for the server's "Starting…" to land
    // After we've SEEN an active phase, a momentarily absent snapshot is almost
    // always transient — the server's sticky cache serves a pre-recomp snapshot
    // (no recompProgress) during the token-quiet recomp window, or a concurrent
    // BEGIN-IMMEDIATE publish makes the snapshot DB read throw → bare empty. The
    // entry is held until terminal + a 30s grace, so we keep polling through many
    // absents and only give up after a long run of them (entry truly gone but we
    // somehow missed "done"). This was the freeze: the old logic stopped on the
    // FIRST absent-after-active (dogfood 2026-05-30).
    const RECOMP_ABSENT_GIVEUP = 40 // ~48s of continuous absence → stop
    const RECOMP_MAX_POLLS = 1500 // ~30min absolute safety cap

    const refresh = () => {
        const sid = props.sessionID()
        if (!sid) return
        const sequence = ++snapshotRequestSequence
        const directory = directoryForSession(
            props.api.state.session?.get?.(sid)?.directory,
            props.api.state.path.directory ?? "",
        )
        void loadSidebarSnapshot(sid, directory)
            .then((data) => {
                // Guard against a session switch while this load was in flight:
                // painting session A's snapshot into the now-active session B shows
                // the wrong session's numbers until B's own refresh resolves.
                if (props.sessionID() !== sid || sequence !== snapshotRequestSequence) return
                setSnapshot(data)
                try {
                    props.api.renderer.requestRender()
                } catch {
                    // Ignore render errors
                }
                // If a recomp/upgrade is running (detected via any refresh, e.g.
                // a /ctx-recomp command not started from the dialog), make sure
                // the dedicated poll loop is running.
                const phase = data?.recompProgress?.phase
                if ((phase === "recomp" || phase === "migration") && !recompActive) {
                    kickRecompPoll()
                } else if (recompActive && recompSessionId === sid) {
                    scheduleRecompTick()
                }
            })
            .catch(() => {
                // A one-shot refresh failure is non-fatal. If it superseded a fast
                // poll request, keep that poll moving for the captured session.
                if (recompActive && recompSessionId === sid && props.sessionID() === sid) {
                    scheduleRecompTick()
                }
            })
    }

    const scheduleRefresh = () => {
        if (refreshTimer) clearTimeout(refreshTimer)
        refreshTimer = setTimeout(() => {
            refreshTimer = undefined
            refresh()
        }, REFRESH_DEBOUNCE_MS)
    }

    const stopRecompPoll = () => {
        recompActive = false
        recompSessionId = null
        snapshotRequestSequence += 1
        if (recompPollTimer) clearTimeout(recompPollTimer)
        recompPollTimer = undefined
    }

    const scheduleRecompTick = () => {
        if (!recompActive) return
        if (recompPollTimer) clearTimeout(recompPollTimer)
        recompPollTimer = setTimeout(recompTick, RECOMP_POLL_MS)
    }

    function recompTick(): void {
        const sid = recompSessionId
        if (!recompActive || !sid || props.sessionID() !== sid) {
            stopRecompPoll()
            return
        }
        recompPollCount += 1
        if (recompPollCount > RECOMP_MAX_POLLS) {
            stopRecompPoll()
            return
        }
        const sequence = ++snapshotRequestSequence
        const directory = directoryForSession(
            props.api.state.session?.get?.(sid)?.directory,
            props.api.state.path.directory ?? "",
        )
        void loadSidebarSnapshot(sid, directory)
            .then((data) => {
                if (
                    !recompActive ||
                    recompSessionId !== sid ||
                    props.sessionID() !== sid ||
                    sequence !== snapshotRequestSequence
                ) return
                const phase = data?.recompProgress?.phase
                // While a recomp is known-active, a transient snapshot that lost
                // recompProgress (sticky cache / busy-DB empty) must NOT wipe the
                // visible bar — carry the last good progress forward so it stays
                // stable until a real update or the terminal state lands.
                const prevProgress = snapshot()?.recompProgress
                const merged =
                    !phase && recompSawPhase && prevProgress
                        ? { ...data, recompProgress: prevProgress }
                        : data
                setSnapshot(merged)
                try {
                    props.api.renderer.requestRender()
                } catch {
                    // ignore render errors
                }
                if (phase === "recomp" || phase === "migration") {
                    recompSawPhase = true
                    recompConsecutiveAbsent = 0
                    scheduleRecompTick()
                } else if (phase === "done" || phase === "failed" || phase === "skipped") {
                    // Terminal state rendered — stop. The server keeps "done"/
                    // "skipped" for a grace window and "failed" until the next run,
                    // so the outcome stays visible without further polling.
                    stopRecompPoll()
                } else {
                    // Phase absent this poll.
                    recompConsecutiveAbsent += 1
                    if (!recompSawPhase) {
                        // Still waiting for the server's first "Starting…".
                        if (recompPollCount < RECOMP_PROBE_MAX) scheduleRecompTick()
                        else {
                            stopRecompPoll()
                        }
                    } else if (recompConsecutiveAbsent < RECOMP_ABSENT_GIVEUP) {
                        // Seen it active — absent is almost certainly the sticky
                        // cache / a transient snapshot read. Keep polling so we
                        // still catch the terminal state. DON'T overwrite the
                        // last good progress snapshot with this transient empty.
                        scheduleRecompTick()
                    } else {
                        // Long continuous absence — the entry is genuinely gone.
                        stopRecompPoll()
                    }
                }
            })
            .catch(() => {
                // A failed fetch must not kill the loop, but a response from a
                // superseded session or sequence must not restart it either.
                if (
                    recompActive &&
                    recompSessionId === sid &&
                    props.sessionID() === sid &&
                    sequence === snapshotRequestSequence
                ) scheduleRecompTick()
            })
    }

    // Kick the resilient recomp poll loop on dialog confirm (or when a refresh
    // first detects an active recomp). The server emits an immediate "Starting…"
    // entry; the probe window covers the brief RPC race before it lands.
    function kickRecompPoll(): void {
        const sid = props.sessionID()
        if (!sid) return
        if (recompActive && recompSessionId === sid) return
        stopRecompPoll()
        recompActive = true
        recompSessionId = sid
        recompSawPhase = false
        recompPollCount = 0
        recompConsecutiveAbsent = 0
        recompTick()
    }

    activeRecompPollKick = kickRecompPoll
    activeSidebarRefresh = refresh

    onCleanup(() => {
        if (refreshTimer) clearTimeout(refreshTimer)
        stopRecompPoll()
        if (activeRecompPollKick === kickRecompPoll) activeRecompPollKick = null
        if (activeSidebarRefresh === refresh) activeSidebarRefresh = null
    })

    // Refresh on session change
    createEffect(
        on(props.sessionID, () => {
            stopRecompPoll()
            setSnapshot(null)
            refresh()
        }),
    )

    // Subscribe to events for live updates
    createEffect(
        on(
            props.sessionID,
            (sessionID) => {
                const unsubs = [
                    props.api.event.on("message.updated", (event) => {
                        if (event.properties.info.sessionID !== sessionID) return
                        scheduleRefresh()
                    }),
                    props.api.event.on("session.updated", (event) => {
                        if (event.properties.info.id !== sessionID) return
                        scheduleRefresh()
                    }),
                    props.api.event.on("message.removed", (event) => {
                        if (event.properties.sessionID !== sessionID) return
                        scheduleRefresh()
                    }),
                ]

                onCleanup(() => {
                    for (const unsub of unsubs) unsub()
                })
            },
            { defer: false },
        ),
    )

    // All persistent-sidebar semantics (presence, order, labels, colors,
    // warnings, compact-vs-expanded, progress wording) come from the shared
    // host-neutral builder; this component only acquires state and draws.
    const view = createMemo(() =>
        buildMagicContextSidebarView(snapshot(), {
            collapsed: collapsed(),
            sections: sections(),
            headerLabel: headerLabel(),
        }),
    )

    return (
        <box
            width="100%"
            flexDirection="column"
            border={SINGLE_BORDER}
            borderColor={props.theme.borderActive}
            paddingTop={1}
            paddingBottom={1}
            paddingLeft={1}
            paddingRight={1}
        >
            {/* Header: triangle toggle + badge + version. Clicking the row
                collapses/expands the panel (mirrors OpenCode's native MCP
                sidebar section and AFT's sidebar). */}
            <box
                flexDirection="row"
                justifyContent="space-between"
                alignItems="center"
                onMouseDown={() => props.controller.toggleCollapsed()}
            >
                <box paddingLeft={1} paddingRight={1} backgroundColor={props.theme.accent}>
                    <text fg={badgeTextColor(props.theme.accent, props.theme.background)}>
                        <b>{view().header.glyph}{view().header.label}</b>
                    </text>
                </box>
                <text fg={props.theme.textMuted}>v{view().header.version}</text>
            </box>

            {/* Persistent warnings (transform failure, host limitations, live
                Dreamer task) — drawn above everything else in shared order. */}
            <For each={view().warnings}>
                {(warning) => (
                    <box marginTop={1} width="100%">
                        <text fg={warning.tone === "error" ? props.theme.error : props.theme.warning}>
                            ⚠ {warning.text}
                        </text>
                    </box>
                )}
            </For>

            {/* Pressure + token breakdown + hygiene. In collapsed mode the
                header, bar and the summary rows stack with no vertical
                padding for a compact look; expanded mode keeps the 1-row gap
                above the bar. */}
            <Show when={view().overview}>
                {(overview) => (
                    <box marginTop={collapsed() ? 0 : 1} flexDirection="column">
                        <Show when={overview().pressure}>
                            {(pressure) => (
                                <box width="100%" flexDirection="row" justifyContent="space-between">
                                    <text fg={toneColor(props.theme, pressure().tone)}>
                                        <b>{pressure().primary}</b>
                                        {pressure().detail}
                                    </text>
                                    {/* Right: absolute token usage against the usable
                                        scheduler window — the same denominator as the
                                        percentage and nudge/trigger scheduling. */}
                                    <text fg={toneColor(props.theme, pressure().tone)}>
                                        {pressure().right}
                                    </text>
                                </box>
                            )}
                        </Show>
                        <Show when={overview().tokenBar}>
                            {(bar) => <TokenBreakdown theme={props.theme} bar={bar()} collapsed={collapsed()} />}
                        </Show>
                        <Show when={overview().hygiene}>
                            {(hygiene) => <ViewRow theme={props.theme} row={hygiene()} />}
                        </Show>
                    </box>
                )}
            </Show>

            {/* Collapsed view — shared summary rows (+ live recomp progress). */}
            <Show when={view().collapsedSummary}>
                {(summary) => (
                    <box width="100%" flexDirection="column">
                        <For each={summary().rows}>{(row) => <ViewRow theme={props.theme} row={row} />}</For>
                        <Show when={summary().recomp}>
                            {(recomp) => <RecompProgressSection theme={props.theme} recomp={recomp()} />}
                        </Show>
                    </box>
                )}
            </Show>

            {/* Expanded view — shared sections in canonical order. */}
            <Show when={view().historian}>
                {(section) => <SectionView theme={props.theme} section={section()} />}
            </Show>
            <Show when={view().memory}>
                {(section) => <SectionView theme={props.theme} section={section()} />}
            </Show>
            <Show when={view().status}>
                {(section) => <SectionView theme={props.theme} section={section()} />}
            </Show>
            <Show when={view().dreamer}>
                {(section) => <SectionView theme={props.theme} section={section()} />}
            </Show>
            <Show when={view().stats}>
                {(section) => <SectionView theme={props.theme} section={section()} />}
            </Show>
        </box>
    )
}

export function createSidebarContentSlot(api: TuiPluginApi): TuiSlotPlugin & { dispose: () => void } {
    // Seed synchronously at slot construction so the sidebar renders at its
    // final collapse state + order on the first paint (no async flicker). The
    // controller lives here in the factory closure for the plugin lifetime, so
    // collapse state and live pref reloads survive sidebar_content remounts.
    const seedRoot = readTuiPreferencesFileSync()
    const controller = createSidebarController(resolveMagicContextPrefs(seedRoot))
    const effectiveOrder = computeEffectiveOrder(seedRoot, PLUGIN_KEY, DEFAULT_SLOT_ORDER)
    return {
        order: effectiveOrder,
        dispose: controller.dispose,
        slots: {
            sidebar_content: (ctx, value) => {
                const theme = createMemo(() => ctx.theme.current)
                return (
                    <SidebarContent
                        api={api}
                        sessionID={() => value.session_id}
                        theme={theme()}
                        controller={controller}
                    />
                )
            },
        },
    }
}
