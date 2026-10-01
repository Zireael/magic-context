import { createTextNode as _$createTextNode } from "opentui:runtime-module:%40opentui%2Fsolid";
import { createComponent as _$createComponent } from "opentui:runtime-module:%40opentui%2Fsolid";
import { effect as _$effect } from "opentui:runtime-module:%40opentui%2Fsolid";
import { insertNode as _$insertNode } from "opentui:runtime-module:%40opentui%2Fsolid";
import { memo as _$memo } from "opentui:runtime-module:%40opentui%2Fsolid";
import { insert as _$insert } from "opentui:runtime-module:%40opentui%2Fsolid";
import { setProp as _$setProp } from "opentui:runtime-module:%40opentui%2Fsolid";
import { createElement as _$createElement } from "opentui:runtime-module:%40opentui%2Fsolid";
/** @jsxImportSource @opentui/solid */
import { For, Show, createEffect, createMemo, createSignal, on, onCleanup } from "opentui:runtime-module:solid-js";
import { badgeTextColor } from "../badge-contrast";
import { loadSidebarSnapshot } from "../data/context-db";
import { buildMagicContextSidebarView } from "../../shared/sidebar-view";
import { computeEffectiveOrder, DEFAULT_SLOT_ORDER, PLUGIN_KEY, queueTuiPreferenceUpdate, readTuiPreferencesFile, readTuiPreferencesFileSync, resolveMagicContextPrefs, watchTuiPreferences } from "../../shared/tui-preferences";

// Module-level hook so the upgrade/recomp dialog can kick the sidebar into its
// fast recomp self-poll the INSTANT the user confirms — without waiting for a
// parent-session message event (the RPC upgrade/recomp call fires none). The
// mounted SidebarContent registers its refresh here.
let activeRecompPollKick = null;
let activeSidebarRefresh = null;
export function kickRecompProgressRefresh() {
  activeRecompPollKick?.();
}

/** Ask the mounted sidebar to fetch an out-of-band status update now. */
export function refreshSidebarSnapshot() {
  activeSidebarRefresh?.();
}
const SINGLE_BORDER = {
  type: "single"
};
const REFRESH_DEBOUNCE_MS = 150;
// The TUI may unmount and remount sidebar_content when the user switches views
// (main -> subagent -> main). A remount re-runs the component body, so a signal
// created inside the component would reset to its seed. The controller lives in
// the slot-factory closure (plugin/process lifetime) and owns the durable
// prefs/collapse signals plus the single shared file watcher, so collapse state
// and live pref reloads survive remounts. No Solid effects/memos here — those
// need an owner; the poll-interval effect stays inside the component.
function createSidebarController(initialPrefs) {
  const [prefs, setPrefs] = createSignal(initialPrefs);
  const seedCollapsed = initialPrefs.rememberCollapsed && initialPrefs.collapsed != null ? initialPrefs.collapsed : initialPrefs.startCollapsed;
  const [collapsed, setCollapsed] = createSignal(seedCollapsed);
  let lastPersistedCollapsed = initialPrefs.collapsed;
  let lastApplied = JSON.stringify(initialPrefs);

  // Collapse echo guard: lastPersistedCollapsed advances only once our own
  // write lands, so a watcher echo of the value we just wrote is rejected by
  // the `!==` check and cannot revert a user click.
  const stopWatchingPreferences = watchTuiPreferences(() => {
    void (async () => {
      const next = resolveMagicContextPrefs(await readTuiPreferencesFile());
      const serialized = JSON.stringify(next);
      if (serialized === lastApplied) return;
      lastApplied = serialized;
      setPrefs(next);
      if (next.rememberCollapsed && next.collapsed != null && next.collapsed !== lastPersistedCollapsed) {
        lastPersistedCollapsed = next.collapsed;
        setCollapsed(next.collapsed);
      }
    })();
  });
  function toggleCollapsed() {
    const next = !collapsed();
    setCollapsed(next);
    if (prefs().rememberCollapsed) {
      void queueTuiPreferenceUpdate(PLUGIN_KEY, ["collapsed"], next).then(() => {
        lastPersistedCollapsed = next;
      });
    }
  }
  return {
    prefs,
    collapsed,
    toggleCollapsed,
    dispose: stopWatchingPreferences
  };
}

// Maps shared semantic tones onto the host theme. `success` falls back to the
// accent color on themes that define no success token (pre-refactor behavior).
const toneColor = (theme, tone) => {
  if (tone === "muted") return theme.textMuted;
  if (tone === "accent") return theme.accent;
  if (tone === "warning") return theme.warning;
  if (tone === "error") return theme.error;
  if (tone === "success") return theme.success ?? theme.accent;
  return theme.text;
};

// One label/value line. `row.bold` preserves the pre-refactor split between
// bold-value lines and the plain (non-bold) compact summary rows.
const ViewRow = props => (() => {
  var _el$ = _$createElement("box"),
    _el$2 = _$createElement("text"),
    _el$3 = _$createElement("text");
  _$insertNode(_el$, _el$2);
  _$insertNode(_el$, _el$3);
  _$setProp(_el$, "width", "100%");
  _$setProp(_el$, "flexDirection", "row");
  _$setProp(_el$, "justifyContent", "space-between");
  _$insert(_el$2, () => props.row.label);
  _$insert(_el$3, (() => {
    var _c$ = _$memo(() => !!props.row.bold);
    return () => _c$() ? (() => {
      var _el$4 = _$createElement("b");
      _$insert(_el$4, () => props.row.value);
      return _el$4;
    })() : props.row.value;
  })());
  _$effect(_p$ => {
    var _v$ = props.theme.textMuted,
      _v$2 = toneColor(props.theme, props.row.tone);
    _v$ !== _p$.e && (_p$.e = _$setProp(_el$2, "fg", _v$, _p$.e));
    _v$2 !== _p$.t && (_p$.t = _$setProp(_el$3, "fg", _v$2, _p$.t));
    return _p$;
  }, {
    e: undefined,
    t: undefined
  });
  return _el$;
})();

// Section block: optional right-aligned live-status header, rows, and the
// live recomp progress strip when the shared model attaches one.
const SectionView = props => [_$memo(() => _$memo(() => !!props.section.header.status)() ? (() => {
  var _el$5 = _$createElement("box"),
    _el$6 = _$createElement("text"),
    _el$7 = _$createElement("b"),
    _el$8 = _$createElement("text");
  _$insertNode(_el$5, _el$6);
  _$insertNode(_el$5, _el$8);
  _$setProp(_el$5, "width", "100%");
  _$setProp(_el$5, "marginTop", 1);
  _$setProp(_el$5, "flexDirection", "row");
  _$setProp(_el$5, "justifyContent", "space-between");
  _$insertNode(_el$6, _el$7);
  _$insert(_el$7, () => props.section.header.title);
  _$insert(_el$8, () => props.section.header.status.text);
  _$effect(_p$ => {
    var _v$3 = props.theme.text,
      _v$4 = toneColor(props.theme, props.section.header.status.tone);
    _v$3 !== _p$.e && (_p$.e = _$setProp(_el$6, "fg", _v$3, _p$.e));
    _v$4 !== _p$.t && (_p$.t = _$setProp(_el$8, "fg", _v$4, _p$.t));
    return _p$;
  }, {
    e: undefined,
    t: undefined
  });
  return _el$5;
})() : (() => {
  var _el$9 = _$createElement("box"),
    _el$0 = _$createElement("text"),
    _el$1 = _$createElement("b");
  _$insertNode(_el$9, _el$0);
  _$setProp(_el$9, "width", "100%");
  _$setProp(_el$9, "marginTop", 1);
  _$insertNode(_el$0, _el$1);
  _$insert(_el$1, () => props.section.header.title);
  _$effect(_$p => _$setProp(_el$0, "fg", props.theme.text, _$p));
  return _el$9;
})()), _$createComponent(For, {
  get each() {
    return props.section.rows;
  },
  children: row => _$createComponent(ViewRow, {
    get theme() {
      return props.theme;
    },
    row: row
  })
}), _$createComponent(Show, {
  get when() {
    return props.section.recomp;
  },
  children: recomp => _$createComponent(RecompProgressSection, {
    get theme() {
      return props.theme;
    },
    get recomp() {
      return recomp();
    }
  })
})];

// Live recomp progress. Verb, phase label, bar, note, rows and terminal
// reason all arrive from the shared builder — drawing only lives here.
// CRITICAL: read `props.recomp` reactively on every access — do NOT
// destructure it into a local `const` at creation time. The parent keeps
// THIS component instance mounted as the phase advances (recomp → migration
// → done), so a frozen local would render the creation-time phase forever.
const RecompProgressSection = props => [(() => {
  var _el$10 = _$createElement("box"),
    _el$11 = _$createElement("text"),
    _el$12 = _$createElement("b"),
    _el$13 = _$createElement("text");
  _$insertNode(_el$10, _el$11);
  _$insertNode(_el$10, _el$13);
  _$setProp(_el$10, "width", "100%");
  _$setProp(_el$10, "marginTop", 1);
  _$setProp(_el$10, "flexDirection", "row");
  _$setProp(_el$10, "justifyContent", "space-between");
  _$insertNode(_el$11, _el$12);
  _$insert(_el$12, () => props.recomp.verb);
  _$insert(_el$13, () => props.recomp.statusText);
  _$effect(_p$ => {
    var _v$5 = props.theme.text,
      _v$6 = toneColor(props.theme, props.recomp.statusTone);
    _v$5 !== _p$.e && (_p$.e = _$setProp(_el$11, "fg", _v$5, _p$.e));
    _v$6 !== _p$.t && (_p$.t = _$setProp(_el$13, "fg", _v$6, _p$.t));
    return _p$;
  }, {
    e: undefined,
    t: undefined
  });
  return _el$10;
})(), _$createComponent(Show, {
  get when() {
    return props.recomp.bar;
  },
  children: bar => (() => {
    var _el$14 = _$createElement("box"),
      _el$15 = _$createElement("text"),
      _el$16 = _$createElement("text"),
      _el$17 = _$createTextNode(`%`);
    _$insertNode(_el$14, _el$15);
    _$insertNode(_el$14, _el$16);
    _$setProp(_el$14, "width", "100%");
    _$setProp(_el$14, "flexDirection", "row");
    _$setProp(_el$14, "justifyContent", "space-between");
    _$insert(_el$15, () => bar().barText);
    _$insertNode(_el$16, _el$17);
    _$insert(_el$16, () => bar().percentText, _el$17);
    _$effect(_p$ => {
      var _v$7 = props.theme.accent,
        _v$8 = props.theme.textMuted;
      _v$7 !== _p$.e && (_p$.e = _$setProp(_el$15, "fg", _v$7, _p$.e));
      _v$8 !== _p$.t && (_p$.t = _$setProp(_el$16, "fg", _v$8, _p$.t));
      return _p$;
    }, {
      e: undefined,
      t: undefined
    });
    return _el$14;
  })()
}), _$createComponent(Show, {
  get when() {
    return props.recomp.note;
  },
  children: note => (() => {
    var _el$18 = _$createElement("text");
    _$insert(_el$18, note);
    _$effect(_$p => _$setProp(_el$18, "fg", props.theme.textMuted, _$p));
    return _el$18;
  })()
}), _$createComponent(For, {
  get each() {
    return props.recomp.rows;
  },
  children: row => _$createComponent(ViewRow, {
    get theme() {
      return props.theme;
    },
    row: row
  })
}), _$createComponent(Show, {
  get when() {
    return props.recomp.message;
  },
  children: message => (() => {
    var _el$19 = _$createElement("text");
    _$insert(_el$19, message);
    _$effect(_$p => _$setProp(_el$19, "fg", props.theme.textMuted, _$p));
    return _el$19;
  })()
})];

// Segmented token breakdown bar with legend. Draws the shared canonical
// category data only: keys, colors, order and text live in
// shared/sidebar-view.ts (SIDEBAR_TOKEN_CATEGORIES).
const TokenBreakdown = props => (() => {
  var _el$20 = _$createElement("box"),
    _el$21 = _$createElement("box");
  _$insertNode(_el$20, _el$21);
  _$setProp(_el$20, "width", "100%");
  _$setProp(_el$20, "flexDirection", "column");
  _$setProp(_el$21, "width", "100%");
  _$setProp(_el$21, "flexDirection", "row");
  _$setProp(_el$21, "height", 1);
  _$insert(_el$21, () => props.bar.segments.map(segment => (() => {
    var _el$22 = _$createElement("box");
    _$setProp(_el$22, "flexBasis", 0);
    _$setProp(_el$22, "height", 1);
    _$effect(_p$ => {
      var _v$9 = segment.key,
        _v$0 = segment.weight,
        _v$1 = segment.color;
      _v$9 !== _p$.e && (_p$.e = _$setProp(_el$22, "key", _v$9, _p$.e));
      _v$0 !== _p$.t && (_p$.t = _$setProp(_el$22, "flexGrow", _v$0, _p$.t));
      _v$1 !== _p$.a && (_p$.a = _$setProp(_el$22, "backgroundColor", _v$1, _p$.a));
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined
    });
    return _el$22;
  })()));
  _$insert(_el$20, (() => {
    var _c$2 = _$memo(() => !!!props.collapsed);
    return () => _c$2() && (() => {
      var _el$23 = _$createElement("box");
      _$setProp(_el$23, "flexDirection", "column");
      _$setProp(_el$23, "marginTop", 0);
      _$insert(_el$23, () => props.bar.legend.map(entry => (() => {
        var _el$24 = _$createElement("box"),
          _el$25 = _$createElement("text"),
          _el$26 = _$createElement("text"),
          _el$27 = _$createTextNode(` (`),
          _el$28 = _$createTextNode(`%)`);
        _$insertNode(_el$24, _el$25);
        _$insertNode(_el$24, _el$26);
        _$setProp(_el$24, "width", "100%");
        _$setProp(_el$24, "flexDirection", "row");
        _$setProp(_el$24, "justifyContent", "space-between");
        _$insert(_el$25, () => entry.label);
        _$insertNode(_el$26, _el$27);
        _$insertNode(_el$26, _el$28);
        _$insert(_el$26, () => entry.valueText, _el$27);
        _$insert(_el$26, () => entry.percentText, _el$28);
        _$effect(_p$ => {
          var _v$10 = entry.key,
            _v$11 = entry.color,
            _v$12 = props.theme.textMuted;
          _v$10 !== _p$.e && (_p$.e = _$setProp(_el$24, "key", _v$10, _p$.e));
          _v$11 !== _p$.t && (_p$.t = _$setProp(_el$25, "fg", _v$11, _p$.t));
          _v$12 !== _p$.a && (_p$.a = _$setProp(_el$26, "fg", _v$12, _p$.a));
          return _p$;
        }, {
          e: undefined,
          t: undefined,
          a: undefined
        });
        return _el$24;
      })()));
      return _el$23;
    })();
  })(), null);
  return _el$20;
})();
const SidebarContent = props => {
  const [snapshot, setSnapshot] = createSignal(null);
  // Collapse state + section visibility prefs live in the controller (plugin
  // closure), so they survive view-switch remounts and persist across restarts
  // via ~/.config/opencode/tui-preferences.jsonc. Read reactively.
  const collapsed = props.controller.collapsed;
  const sections = () => props.controller.prefs().sections;
  const headerLabel = () => props.controller.prefs().header.label;
  let refreshTimer;
  // Self-sustaining poll while a recomp/upgrade is running. Recomp work
  // happens in CHILD sessions whose message events are filtered out of the
  // subscription below, so without this the progress bar would freeze until
  // the next parent-session message. Active only during recomp/migration;
  // stops itself once the phase goes terminal/absent (dogfood 2026-05-30).
  let recompPollTimer;
  const RECOMP_POLL_MS = 1200;
  // Robust recomp poll state. The loop MUST survive a failed/slow snapshot
  // fetch — the server is busy doing the historian LLM call during a recomp,
  // so a poll can reject or return a stale (pre-recomp) cached snapshot. The
  // OLD loop reattached the next timer only inside `.then()`, so any rejection
  // killed it and the bar froze mid-pass (dogfood 2026-05-30). This version
  // reschedules on BOTH success and failure, keyed on `recompActive`, and only
  // stops on a terminal phase, a bounded "never started" probe window, or the
  // entry vanishing after we'd seen it active.
  let recompActive = false;
  let recompSawPhase = false;
  let recompPollCount = 0;
  let recompConsecutiveAbsent = 0;
  let recompSessionId = null;
  let snapshotRequestSequence = 0;
  const RECOMP_PROBE_MAX = 12; // ~15s for the server's "Starting…" to land
  // After we've SEEN an active phase, a momentarily absent snapshot is almost
  // always transient — the server's sticky cache serves a pre-recomp snapshot
  // (no recompProgress) during the token-quiet recomp window, or a concurrent
  // BEGIN-IMMEDIATE publish makes the snapshot DB read throw → bare empty. The
  // entry is held until terminal + a 30s grace, so we keep polling through many
  // absents and only give up after a long run of them (entry truly gone but we
  // somehow missed "done"). This was the freeze: the old logic stopped on the
  // FIRST absent-after-active (dogfood 2026-05-30).
  const RECOMP_ABSENT_GIVEUP = 40; // ~48s of continuous absence → stop
  const RECOMP_MAX_POLLS = 1500; // ~30min absolute safety cap

  const refresh = () => {
    const sid = props.sessionID();
    if (!sid) return;
    const sequence = ++snapshotRequestSequence;
    const directory = props.api.state.path.directory ?? "";
    void loadSidebarSnapshot(sid, directory).then(data => {
      // Guard against a session switch while this load was in flight:
      // painting session A's snapshot into the now-active session B shows
      // the wrong session's numbers until B's own refresh resolves.
      if (props.sessionID() !== sid || sequence !== snapshotRequestSequence) return;
      setSnapshot(data);
      try {
        props.api.renderer.requestRender();
      } catch {
        // Ignore render errors
      }
      // If a recomp/upgrade is running (detected via any refresh, e.g.
      // a /ctx-recomp command not started from the dialog), make sure
      // the dedicated poll loop is running.
      const phase = data?.recompProgress?.phase;
      if ((phase === "recomp" || phase === "migration") && !recompActive) {
        kickRecompPoll();
      } else if (recompActive && recompSessionId === sid) {
        scheduleRecompTick();
      }
    }).catch(() => {
      // A one-shot refresh failure is non-fatal. If it superseded a fast
      // poll request, keep that poll moving for the captured session.
      if (recompActive && recompSessionId === sid && props.sessionID() === sid) {
        scheduleRecompTick();
      }
    });
  };
  const scheduleRefresh = () => {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined;
      refresh();
    }, REFRESH_DEBOUNCE_MS);
  };
  const stopRecompPoll = () => {
    recompActive = false;
    recompSessionId = null;
    snapshotRequestSequence += 1;
    if (recompPollTimer) clearTimeout(recompPollTimer);
    recompPollTimer = undefined;
  };
  const scheduleRecompTick = () => {
    if (!recompActive) return;
    if (recompPollTimer) clearTimeout(recompPollTimer);
    recompPollTimer = setTimeout(recompTick, RECOMP_POLL_MS);
  };
  function recompTick() {
    const sid = recompSessionId;
    if (!recompActive || !sid || props.sessionID() !== sid) {
      stopRecompPoll();
      return;
    }
    recompPollCount += 1;
    if (recompPollCount > RECOMP_MAX_POLLS) {
      stopRecompPoll();
      return;
    }
    const sequence = ++snapshotRequestSequence;
    const directory = props.api.state.path.directory ?? "";
    void loadSidebarSnapshot(sid, directory).then(data => {
      if (!recompActive || recompSessionId !== sid || props.sessionID() !== sid || sequence !== snapshotRequestSequence) return;
      const phase = data?.recompProgress?.phase;
      // While a recomp is known-active, a transient snapshot that lost
      // recompProgress (sticky cache / busy-DB empty) must NOT wipe the
      // visible bar — carry the last good progress forward so it stays
      // stable until a real update or the terminal state lands.
      const prevProgress = snapshot()?.recompProgress;
      const merged = !phase && recompSawPhase && prevProgress ? {
        ...data,
        recompProgress: prevProgress
      } : data;
      setSnapshot(merged);
      try {
        props.api.renderer.requestRender();
      } catch {
        // ignore render errors
      }
      if (phase === "recomp" || phase === "migration") {
        recompSawPhase = true;
        recompConsecutiveAbsent = 0;
        scheduleRecompTick();
      } else if (phase === "done" || phase === "failed" || phase === "skipped") {
        // Terminal state rendered — stop. The server keeps "done"/
        // "skipped" for a grace window and "failed" until the next run,
        // so the outcome stays visible without further polling.
        stopRecompPoll();
      } else {
        // Phase absent this poll.
        recompConsecutiveAbsent += 1;
        if (!recompSawPhase) {
          // Still waiting for the server's first "Starting…".
          if (recompPollCount < RECOMP_PROBE_MAX) scheduleRecompTick();else {
            stopRecompPoll();
          }
        } else if (recompConsecutiveAbsent < RECOMP_ABSENT_GIVEUP) {
          // Seen it active — absent is almost certainly the sticky
          // cache / a transient snapshot read. Keep polling so we
          // still catch the terminal state. DON'T overwrite the
          // last good progress snapshot with this transient empty.
          scheduleRecompTick();
        } else {
          // Long continuous absence — the entry is genuinely gone.
          stopRecompPoll();
        }
      }
    }).catch(() => {
      // A failed fetch must not kill the loop, but a response from a
      // superseded session or sequence must not restart it either.
      if (recompActive && recompSessionId === sid && props.sessionID() === sid && sequence === snapshotRequestSequence) scheduleRecompTick();
    });
  }

  // Kick the resilient recomp poll loop on dialog confirm (or when a refresh
  // first detects an active recomp). The server emits an immediate "Starting…"
  // entry; the probe window covers the brief RPC race before it lands.
  function kickRecompPoll() {
    const sid = props.sessionID();
    if (!sid) return;
    if (recompActive && recompSessionId === sid) return;
    stopRecompPoll();
    recompActive = true;
    recompSessionId = sid;
    recompSawPhase = false;
    recompPollCount = 0;
    recompConsecutiveAbsent = 0;
    recompTick();
  }
  activeRecompPollKick = kickRecompPoll;
  activeSidebarRefresh = refresh;
  onCleanup(() => {
    if (refreshTimer) clearTimeout(refreshTimer);
    stopRecompPoll();
    if (activeRecompPollKick === kickRecompPoll) activeRecompPollKick = null;
    if (activeSidebarRefresh === refresh) activeSidebarRefresh = null;
  });

  // Refresh on session change
  createEffect(on(props.sessionID, () => {
    stopRecompPoll();
    setSnapshot(null);
    refresh();
  }));

  // Subscribe to events for live updates
  createEffect(on(props.sessionID, sessionID => {
    const unsubs = [props.api.event.on("message.updated", event => {
      if (event.properties.info.sessionID !== sessionID) return;
      scheduleRefresh();
    }), props.api.event.on("session.updated", event => {
      if (event.properties.info.id !== sessionID) return;
      scheduleRefresh();
    }), props.api.event.on("message.removed", event => {
      if (event.properties.sessionID !== sessionID) return;
      scheduleRefresh();
    })];
    onCleanup(() => {
      for (const unsub of unsubs) unsub();
    });
  }, {
    defer: false
  }));

  // All persistent-sidebar semantics (presence, order, labels, colors,
  // warnings, compact-vs-expanded, progress wording) come from the shared
  // host-neutral builder; this component only acquires state and draws.
  const view = createMemo(() => buildMagicContextSidebarView(snapshot(), {
    collapsed: collapsed(),
    sections: sections(),
    headerLabel: headerLabel()
  }));
  return (() => {
    var _el$29 = _$createElement("box"),
      _el$30 = _$createElement("box"),
      _el$31 = _$createElement("box"),
      _el$32 = _$createElement("text"),
      _el$33 = _$createElement("b"),
      _el$34 = _$createElement("text"),
      _el$35 = _$createTextNode(`v`);
    _$insertNode(_el$29, _el$30);
    _$setProp(_el$29, "width", "100%");
    _$setProp(_el$29, "flexDirection", "column");
    _$setProp(_el$29, "border", SINGLE_BORDER);
    _$setProp(_el$29, "paddingTop", 1);
    _$setProp(_el$29, "paddingBottom", 1);
    _$setProp(_el$29, "paddingLeft", 1);
    _$setProp(_el$29, "paddingRight", 1);
    _$insertNode(_el$30, _el$31);
    _$insertNode(_el$30, _el$34);
    _$setProp(_el$30, "flexDirection", "row");
    _$setProp(_el$30, "justifyContent", "space-between");
    _$setProp(_el$30, "alignItems", "center");
    _$setProp(_el$30, "onMouseDown", () => props.controller.toggleCollapsed());
    _$insertNode(_el$31, _el$32);
    _$setProp(_el$31, "paddingLeft", 1);
    _$setProp(_el$31, "paddingRight", 1);
    _$insertNode(_el$32, _el$33);
    _$insert(_el$33, () => view().header.glyph, null);
    _$insert(_el$33, () => view().header.label, null);
    _$insertNode(_el$34, _el$35);
    _$insert(_el$34, () => view().header.version, null);
    _$insert(_el$29, _$createComponent(For, {
      get each() {
        return view().warnings;
      },
      children: warning => (() => {
        var _el$36 = _$createElement("box"),
          _el$37 = _$createElement("text"),
          _el$38 = _$createTextNode(`⚠ `);
        _$insertNode(_el$36, _el$37);
        _$setProp(_el$36, "marginTop", 1);
        _$setProp(_el$36, "width", "100%");
        _$insertNode(_el$37, _el$38);
        _$insert(_el$37, () => warning.text, null);
        _$effect(_$p => _$setProp(_el$37, "fg", warning.tone === "error" ? props.theme.error : props.theme.warning, _$p));
        return _el$36;
      })()
    }), null);
    _$insert(_el$29, _$createComponent(Show, {
      get when() {
        return view().overview;
      },
      children: overview => (() => {
        var _el$39 = _$createElement("box");
        _$setProp(_el$39, "flexDirection", "column");
        _$insert(_el$39, _$createComponent(Show, {
          get when() {
            return overview().pressure;
          },
          children: pressure => (() => {
            var _el$40 = _$createElement("box"),
              _el$41 = _$createElement("text"),
              _el$42 = _$createElement("b"),
              _el$43 = _$createElement("text");
            _$insertNode(_el$40, _el$41);
            _$insertNode(_el$40, _el$43);
            _$setProp(_el$40, "width", "100%");
            _$setProp(_el$40, "flexDirection", "row");
            _$setProp(_el$40, "justifyContent", "space-between");
            _$insertNode(_el$41, _el$42);
            _$insert(_el$42, () => pressure().primary);
            _$insert(_el$41, () => pressure().detail, null);
            _$insert(_el$43, () => pressure().right);
            _$effect(_p$ => {
              var _v$17 = toneColor(props.theme, pressure().tone),
                _v$18 = toneColor(props.theme, pressure().tone);
              _v$17 !== _p$.e && (_p$.e = _$setProp(_el$41, "fg", _v$17, _p$.e));
              _v$18 !== _p$.t && (_p$.t = _$setProp(_el$43, "fg", _v$18, _p$.t));
              return _p$;
            }, {
              e: undefined,
              t: undefined
            });
            return _el$40;
          })()
        }), null);
        _$insert(_el$39, _$createComponent(Show, {
          get when() {
            return overview().tokenBar;
          },
          children: bar => _$createComponent(TokenBreakdown, {
            get theme() {
              return props.theme;
            },
            get bar() {
              return bar();
            },
            get collapsed() {
              return collapsed();
            }
          })
        }), null);
        _$insert(_el$39, _$createComponent(Show, {
          get when() {
            return overview().hygiene;
          },
          children: hygiene => _$createComponent(ViewRow, {
            get theme() {
              return props.theme;
            },
            get row() {
              return hygiene();
            }
          })
        }), null);
        _$effect(_$p => _$setProp(_el$39, "marginTop", collapsed() ? 0 : 1, _$p));
        return _el$39;
      })()
    }), null);
    _$insert(_el$29, _$createComponent(Show, {
      get when() {
        return view().collapsedSummary;
      },
      children: summary => (() => {
        var _el$44 = _$createElement("box");
        _$setProp(_el$44, "width", "100%");
        _$setProp(_el$44, "flexDirection", "column");
        _$insert(_el$44, _$createComponent(For, {
          get each() {
            return summary().rows;
          },
          children: row => _$createComponent(ViewRow, {
            get theme() {
              return props.theme;
            },
            row: row
          })
        }), null);
        _$insert(_el$44, _$createComponent(Show, {
          get when() {
            return summary().recomp;
          },
          children: recomp => _$createComponent(RecompProgressSection, {
            get theme() {
              return props.theme;
            },
            get recomp() {
              return recomp();
            }
          })
        }), null);
        return _el$44;
      })()
    }), null);
    _$insert(_el$29, _$createComponent(Show, {
      get when() {
        return view().historian;
      },
      children: section => _$createComponent(SectionView, {
        get theme() {
          return props.theme;
        },
        get section() {
          return section();
        }
      })
    }), null);
    _$insert(_el$29, _$createComponent(Show, {
      get when() {
        return view().memory;
      },
      children: section => _$createComponent(SectionView, {
        get theme() {
          return props.theme;
        },
        get section() {
          return section();
        }
      })
    }), null);
    _$insert(_el$29, _$createComponent(Show, {
      get when() {
        return view().status;
      },
      children: section => _$createComponent(SectionView, {
        get theme() {
          return props.theme;
        },
        get section() {
          return section();
        }
      })
    }), null);
    _$insert(_el$29, _$createComponent(Show, {
      get when() {
        return view().dreamer;
      },
      children: section => _$createComponent(SectionView, {
        get theme() {
          return props.theme;
        },
        get section() {
          return section();
        }
      })
    }), null);
    _$insert(_el$29, _$createComponent(Show, {
      get when() {
        return view().stats;
      },
      children: section => _$createComponent(SectionView, {
        get theme() {
          return props.theme;
        },
        get section() {
          return section();
        }
      })
    }), null);
    _$effect(_p$ => {
      var _v$13 = props.theme.borderActive,
        _v$14 = props.theme.accent,
        _v$15 = badgeTextColor(props.theme.accent, props.theme.background),
        _v$16 = props.theme.textMuted;
      _v$13 !== _p$.e && (_p$.e = _$setProp(_el$29, "borderColor", _v$13, _p$.e));
      _v$14 !== _p$.t && (_p$.t = _$setProp(_el$31, "backgroundColor", _v$14, _p$.t));
      _v$15 !== _p$.a && (_p$.a = _$setProp(_el$32, "fg", _v$15, _p$.a));
      _v$16 !== _p$.o && (_p$.o = _$setProp(_el$34, "fg", _v$16, _p$.o));
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined,
      o: undefined
    });
    return _el$29;
  })();
};
export function createSidebarContentSlot(api) {
  // Seed synchronously at slot construction so the sidebar renders at its
  // final collapse state + order on the first paint (no async flicker). The
  // controller lives here in the factory closure for the plugin lifetime, so
  // collapse state and live pref reloads survive sidebar_content remounts.
  const seedRoot = readTuiPreferencesFileSync();
  const controller = createSidebarController(resolveMagicContextPrefs(seedRoot));
  const effectiveOrder = computeEffectiveOrder(seedRoot, PLUGIN_KEY, DEFAULT_SLOT_ORDER);
  return {
    order: effectiveOrder,
    dispose: controller.dispose,
    slots: {
      sidebar_content: (ctx, value) => {
        const theme = createMemo(() => ctx.theme.current);
        return _$createComponent(SidebarContent, {
          api: api,
          sessionID: () => value.session_id,
          get theme() {
            return theme();
          },
          controller: controller
        });
      }
    }
  };
}