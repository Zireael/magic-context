# Issue 647: hidden completion refusal and the Pi/OMP transport boundary

## Investigation status

Investigated from master `e5b5bc670c679fad3a6b92a81295dac29719408a`.
The reported error is an **OpenCode 2 hidden-executor diagnostic**, not a
Pi/OMP subprocess-runner diagnostic. A real OMP 18.8.6 child-route probe
succeeds for retrospective, curate, map-memories, verify and classify-memories.
Promote-primers is host-only: it does not dispatch a model or a child hook.
This does not establish which process wrote the reporter's rows; no live
stores or user configuration were inspected.

The parent requested a further OpenCode 2.0.24 investigation after this
boundary was established. Initial same-directory, parented carrier probes
also succeed there. Full production task execution and the task-specific
failure mechanism are still under investigation. Do not infer an OMP bug
from the quoted error, or remove any issue 639 protection to make a run pass.

## Exact raising and calling paths at the investigation base

- The exact text `Host did not dispatch the hidden child context hook` occurs
  at `packages/plugin/src/v2/hidden-completion.ts:687-692`. After prompting,
  waiting, and obtaining a new assistant row, the v2 executor refuses an
  attempt whose `shaped` flag was never set. The flag is set only by
  `HiddenChildHook.apply`, at
  `packages/plugin/src/v2/hooks/hidden-child.ts:607-609`.
- The ordinary v2 context pipeline invokes that hook first at
  `packages/plugin/src/v2/hooks/context.ts:1337`; the per-instance executor
  is constructed with that same hook and instance directory at lines
  759-795. The v2 server locks its harness to `opencode2`
  (`packages/plugin/src/v2/server.ts:26-52`).
- The Pi dreamer instead creates process-local ids
  `magic-context-pi-dream-N`, extracts the complete system/user prompt, and
  calls `PiSubagentRunner.run`
  (`packages/pi-plugin/src/dreamer/index.ts:538-611`). Its shared timer
  registration supplies this facade, not a v2 hidden executor (294-322).
  The runner writes a system-prompt file (1298-1323), passes
  `--system-prompt` (2610-2620), and spawns in the requested cwd
  (`packages/pi-plugin/src/subagent-runner.ts:1450-1492`). There is no v2
  hidden-child context-hook handshake in that path.
- The reported `ses_edff...` child id is consistent with OpenCode's ids,
  not the Pi facade's synthetic ids. The issue's project being used in OMP
  does not establish that OMP owned a particular background run. A second
  OpenCode process using the project is a possibility, not a verified fact.

## Task differences and placement

| Task | Child role / behavior |
| --- | --- |
| retrospective | `dreamer-retrospective`; cheap friction gate and, on a hit, a second deepen turn; `ctx_search` |
| curate | `dreamer`; applies memory operations through `ctx_memory` |
| map-memories | `dreamer-memory-mapper`; read-only source investigation |
| verify | `dreamer-memory-mapper`; read-only source investigation |
| classify-memories | `dreamer-classifier`; zero-tool classification |
| promote-primers | host-only storage work, no child completion |

Pi tool profiles are at `packages/pi-plugin/src/subagent-runner.ts:637-712`;
OMP built-in filtering is at 724-784. Retrospective and curate load the lean
ctx-tool extension, but both still receive the runner's authored system and
user prompts, not a hidden marker.

On v2, retrospective opens with `directory: deps.sessionDirectory`
(`packages/plugin/src/features/magic-context/dreamer/task-executor.ts:1479-1494`)
and supplies the system again on each turn (1520-1532). Curate's `docsDir`
is just `deps.sessionDirectory` (1838-1843); it passes that to the single-shot
helper (1998-2016), which forwards it to `executor.open`
(`packages/plugin/src/features/magic-context/dreamer/hidden-single-shot.ts:62-95`).
There is no source evidence of these two tasks selecting a different root.

The issue 639 event guard checks directory and workspace before passing a
parent to a dream task (`packages/plugin/src/v2/hooks/dream-trigger.ts:28-41,
107-118`). A parented native child inherits its parent's location;
`createNativeHiddenChildren` reads it back and removes/refuses a child in
another instance directory before prompting
(`packages/plugin/src/v2/hidden-child-native.ts:112-140,148-183`). These guards
must remain intact. A refused, unshaped turn must never reach the provider
with tools. The post-completion `!shaped` check is additional detection, not
a substitute for the before-provider or tool-call guards.

## Fallbacks

The hidden refusal is deliberately terminal, not a provider error:
`packages/plugin/src/shared/model-suggestion-retry.ts:367-374,409-417`.
Dream failure telemetry classifies it as `local_refusal` and records the
reason (`packages/plugin/src/features/magic-context/dreamer/task-executor.ts:235-255`).
For a deterministic missing setup/ownership stage, another model follows
the same path and cannot repair it. Keep this failure terminal; a one-model
`models_tried` list is the expected safety behavior, not dead fallback
configuration. Provider/model failures should still use their existing chain.

## Real-host captures and isolation

All host installs and runs used `$TMPDIR/magic-context/issue-647/`, with
private HOME, XDG data/config/state/runtime/cache, host database and Magic
Context storage. Hosts used loopback mock providers and fake keys. No live
stores were opened, including for snapshots. Captured `lsof -Fn -p <pid>`
output shows only throwaway `.db`, `-wal` and `-shm` paths.

Evidence root on this machine:
`/var/folders/18/257zzylx4h1gbkcvs4cnpqqc0000gn/T/magic-context/issue-647/evidence/`.
These files are outside build/cache directories.

- `omp-routes.log`: OMP **18.8.6**, Bun **1.4.2**, five production
  `PiSubagentRunner` child profiles, each one successful mock completion.
  The provider receives the exact `ISOLATED <task> SYSTEM` and
  `ISOLATED <task> USER` text. This is a prompt-route test, not a test of
  each task's output parser or scheduling gate. `omp-<pid>-lsof.txt` records
  each child (31877, 32110, 32193, 32214, 32274).
- `v2-routes-split.log`: OpenCode **2.0.24**, pid **62014**, single-directory
  real-host probe using the production hidden executor/hook. Retrospective,
  mapper, verifier and classifier carrier attempts complete; the probe's
  full curate task executor completes on one seeded memory. The hook sees
  the carrier markers, then the provider sees authored task prompts and
  scoped tools. `v2-lsof.txt` records only the fixture's OpenCode and
  Magic Context databases.
- A first single-file probe bundle could not load because Bun 1.4.2 emitted
  an undefined `__promiseAll` helper. ESM splitting, as used by shipped
  bundles, fixed the probe packaging. This was not a dream-task refusal.

## Baseline gates

Linux, Bun **1.4.2**, fresh throwaway HOME/XDG/storage, `OPENCODE_DB` unset,
package test scripts (including frozen install), before changes:

- Plugin: **7428 pass, 9 skip, 42 fail**, 7479 tests / 733 files.
- Pi: **1540 pass, 3 skip, 144 fail**, 1687 tests / 166 files.

Logs and normalized unique failure names:
`/tmp/magic-context-647-baseline.APZnOh/{plugin,pi-plugin}.{log,failures}`
on `ck-motor`. Final suite failure-name sets must be compared against these,
rather than claiming these baseline suites are green.
