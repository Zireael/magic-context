# Issue 619: restore the subagent execute ride

## History and intended behavior

`git log -S hasReclaimRide`, `git log -S pass_already_busting`, the introducing
diffs, and blame of the OpenCode permission assembly identify two stages:

1. **85cfbfbfe4953244399b8d36c83a1293c0d74ae7** (September 7,
   “make automatic reclaim ride independently priced busts”) introduced
   `hasReclaimRide` and removed bare execute as an automatic-cleanup ride across
   OpenCode, Pi and Rust. Its commit message deliberately says ordinary execute
   pressure must not originate heuristic/age rewrites. Queued agent drops still
   applied on execute and could promote the shared permission after application.
2. **4ece15f109bfda68cb87f273b58c6878308a040c** (September 17,
   “ride-only agent drops across three lanes”) removed that remaining execute
   admission for queued drops. In OpenCode it replaced the execute-inclusive
   `publishedWorkDrainAllowed`/pending-op predicate with `hasReclaimRide`, removed
   the `agentDrop` signal and its post-application promotion, and made
   `isCacheBustingPass` equal the shared drain permission. Pi received the same
   gate; Rust selection and floor admission were coupled to the independent ride.
   **140bc49decbbd5cb1bc41d310a1a4dc1d37729d1** completed and verified the WIP,
   explicitly asserting that execute-only queues stay held with/without historians.

Thus the broad ride-only policy was deliberate, not an accidental deleted line.
Neither change carved out subagents, which have no historian/history fold to
provide the ordinary ride. This conflicts with the current **ARCHITECTURE.md
Session modes** table (“every execute pass” for subagent heuristics). The issue's
October 4 maintainer reply explicitly confirms the table and requests restoration
for subagents, keeping primaries unchanged. This change restores that exception;
it does not undo the primary-session ride-only policy.

## Fix and no-op discipline

- **OpenCode:** the existing `rideSignals` assembly adds `subagentExecute` when
  reduced mode and the effective scheduler decision is `execute`. The shared
  `hasReclaimRide` admits it; queued operations, heuristics, age reclaim, reasoning,
  sentinel/image first application and the other ride-only lanes still use that
  one permission. Logs name `ride=subagentExecute`, not a fictitious fold.
- **Pi:** the same shared predicate receives the session's subagent flag and
  effective execute decision. Its heuristic once-per-turn guard also yields to
  that signal, matching OpenCode. Current hidden/no-session Pi children do not
  use this handler; the marked-session path is nevertheless consistent and tested.
- **Rust:** the reductions-only subagent branch adds canonical `execute` to
  `supersession_ride_available`, which already feeds `pass_already_busting`, queued
  admission, automatic selection, protection-floor adoption and returned ride
  telemetry. Canonicalization includes the existing force/emergency execute
  variants; it does not bypass effective mid-turn deferral. No mc-core gate needed
  modification. No Rust epoch constant changed.

The permission opens on every subagent execute, not just when a queue is nonempty:
heuristics and first-application lanes can have eligible work without queued drops.
Precomputing all their eligibility would duplicate selection and risk giving lanes
different permissions. Permission is not evidence of a mutation. Each lane keeps
its existing candidate/protection checks and only actual byte changes count as
busts. Tests replay three further execute passes byte-identically when no work is
eligible (including a protected tool fixture). Metadata such as a reclaim watermark
may advance; no gratuitous provider-content rewrite is introduced. Unprotected
age candidates are work, even if the user queue is empty.

The positive engine cases also exercise a second lane on the same pass: OpenCode
and Rust reclaim a distinct eligible age candidate alongside the queued drop; Pi
clears an older inline-thinking block alongside a different queued text drop.
The next passes must replay exactly those resulting bytes.

Two existing Rust advisory fixtures intentionally now run **defer**, with idle TTL
disabled and an asserted scheduler decision. On execute their subagent reductions
are now correctly authorized by execute itself, so that setup no longer isolates
whether an inherited HARD/reconcile advisory can price work. Their no-prefix-fold
and unchanged-frozen-unit assertions remain. Primary execute-only hold tests were
not weakened or renamed.

## Failing-first and restored controls

Before adding the production signal, each engine's four-case regression group
returned **3 pass / 1 fail**. The only failure was subagent execute draining queued
drops (queue length expected 0, actual 1). Primary execute hold, subagent defer hold
and empty/no-eligible execute replay were already-correct negative controls and
passed on the baseline; claiming those fail on the old code would be false.
The original real-host run likewise reached execute repeatedly but never shrank.

The final fixtures were then tested with the new ride neutralized, marked
`NON-VACUITY BREAK`. All intentional files were staged first; the working-tree
`git diff --stat` was empty. The applied diff for each mutated path was **1 file,
2 insertions, 1 deletion**. After each control, restoration used
`git checkout -- <path> && touch <path>` and the diff was empty again.

| Neutralized control | Exact failing test | Unaffected cases / result |
| --- | --- | --- |
| Shared TS `hasReclaimRide` subagent arm | `ride-only queued drops > issue 619 subagent execute drains queued drops` | Other three issue 619 cases pass; queue expected 0, actual 1; exit 1 |
| Same TS arm, Pi handler | `registerPiContextHandler > issue 619 subagent execute drains queued drops` | Other three cases pass; queue expected 0, actual 1; exit 1 |
| Same TS arm, real host | `issue 619 task subagent drops ride execute once and replay the provider prefix` | Sole selected test fails: pass 5 `prefixChanged` expected true, actual false; exit 1 |
| Rust transform subagent arm | `transform::tests::issue_619_subagent_execute_drains_queued_drops` | Other three cases pass; queue left 1/right 0; exit 101 |

The mutation paths were
`packages/plugin/src/hooks/magic-context/cache-busting-signals.ts` and
`crates/mc-module/src/transform.rs`. All breaks were restored before final gates.

## Real OpenCode host and cache measurement

Command (Bun **1.4.2**, actual OpenCode **1.18.30**):

```sh
PATH="$HOME/.opencode/bin:$PATH" MC_E2E_KEEP=1 bun test --timeout 120000 \
  packages/e2e-tests/tests/subagent-execute-ride.test.ts \
  packages/e2e-tests/scripts/validate-mode-manifest.test.ts
```

The host's real `task` tool creates `ride-worker`; this is not a fabricated child
session or direct queue write. A local Anthropic mock scripts real `bash` and
`ctx_reduce` calls. Three deterministic identifier files carry actual tool-output
mass below the host truncation cap. Configuration is
`execute_threshold_tokens.default=5000`, window 100000 (usable soft 91808), and
`protected_tokens=4000`. All measured execute usage stays roughly 8–17k, far below
the unchanged force floor. The child has zero compartments and drains its queue.
An extra settling pass before the first reduction ensures the tool's persisted
token mass has reached the protected-window accounting; the test does not confuse
protected-work delay with missing permission.

Here **changed** means previously served message-content bytes changed, not that
the growing full HTTP body is identical. Ordinary tool steps append new content.
The comparison excludes only host-owned `cache_control` annotations, whose boundary
moves on every request, and asserts that the system content is unchanged. At passes
6–8 it also compares the entire frozen pass-5 message prefix, not just tag statuses.
Lengths below are UTF-8 byte counts, not JavaScript character counts. The test
also checks the captured **whole raw HTTP request** shrinks by more than 20000 bytes.

Cache counters are **mock-provider measurements**, not a paid Anthropic cache
experiment: the mock meters common complete message prefixes (excluding the
ephemeral annotation), estimates tokens from actual serialized bytes, and emits
read/write usage. The test independently reads the real host's persisted assistant
usage and checks that every reported counter arrived unchanged. This proves the
provider-wire cache opportunities and host meter plumbing, not production pricing,
minimum cache sizes or a provider's caching algorithm.

| Child pass | Decision | Old content changed? | Message bytes | Provider cache read | Provider cache write | Action returned |
| ---: | --- | --- | ---: | ---: | ---: | --- |
| 1 | defer | no baseline | 116 | 0 | 893 | read A |
| 2 | defer | no | 29903 | 29 | 8310 | read B |
| 3 | execute | no | 59715 | 7475 | 8317 | settling tool step |
| 4 | execute | no | 59975 | 14928 | 929 | queue A via ctx_reduce |
| 5 | execute | **yes: A drops** | **30730** | **66** | **8480** | tool step |
| 6 | execute | no | 30990 | 7682 | 929 | tool step |
| 7 | execute | no | 31250 | 7747 | 929 | tool step |
| 8 | execute | no | 31510 | 7812 | 929 | queue B and read C |
| 9 | execute | **yes: B drops** | 32019 | **128** | **8740** | tool step |
| 10 | execute | no | 32280 | 8004 | 930 | tool step |
| 11 | execute | no | 32543 | 8070 | 929 | child completes |

The first queued batch lands on the very next execute pass, removing **29245
message bytes** despite the appended tool traffic. There is one rewrite, then
three byte-identical prefix replays until the next queued drop. The second batch
also lands on its next execute pass; C displaces B's protected floor and adds real
bytes at the same time, so total request length is not a second shrink assertion.
There are no other old-content changes in the eleven child requests.

Successful measured host: **pid 96290**, throwaway root
`$TMPDIR/magic-context/issue-619/opencode-e2e-F3SpI0` (canonical
`/private/var/folders/18/257zzylx4h1gbkcvs4cnpqqc0000gn/T/magic-context/issue-619/opencode-e2e-F3SpI0`).
`lsof -p 96290 -Fn` ran before and after the task. Every open DB/WAL/SHM was under
that root: `data/opencode/opencode.db` and
`data/cortexkit/magic-context/context.db`. HOME, XDG config/data/cache/state/runtime,
OPENCODE_DB and MAGIC_CONTEXT_STORAGE_DIR were all isolated by the existing harness.
No live store/config was opened, inspected or migrated. Kept proof files are
`proof/host-lsof.txt`, `proof/passes.json`, `proof/host-cache-meters.json`, and
`proof/requests.json`; they contain only synthetic fixtures and are not committed.
The scenario is registered as ts-only/OpenCode in the manifest; totals are 166
files, 52 TS invocations, 38 TS/OpenCode invocations, with Rust counts unchanged.

## Force band and reply wording (not changed)

Deriving the primary force band from a low token threshold is **not automatically
safe**. It would turn ordinary low-window-percentage pressure into emergency
permission, affect fold/historian cadence and token-mass protection/emergency
selection, and could originate expensive prefix rewrites much earlier while a
primary has ample headroom and an independent publication/fold still pending.
It needs separate cache/effectiveness measurements and an explicit policy decision
about margins, latching and historian recovery. This patch leaves
`max(85, threshold + 2)` and the 95% backstop untouched.

`ctx_reduce` currently replies `Queued: drop §N§.` for unprotected requests; it
does **not** tell a subagent when queued drops apply. Protected requests do say
they apply once newer work displaces them. Suggested subagent-specific reply:
“Queued: drop §N§. Eligible queued drops are applied together on the next execute
pass; protected items wait until newer work displaces them.” Prompt/tool-reply text
was not changed, because permission correctness does not require a prompt rewrite.

## Verification

- `bun run build`: passed, three package builds and four embedded OpenCode 2 server
  tests (Bun 1.4.2).
- `bun run --cwd packages/plugin test`: passed, **6736 pass / 4 skip / 0 fail**,
  648 files (Bun 1.4.2).
- `bun run --cwd packages/pi-plugin test`: passed, **1497 pass / 3 skip / 0 fail**,
  138 files (Bun 1.4.2).
- `bun run typecheck`: passed, four configured packages (TypeScript 5.9.3).
- `bun run lint`: passed, Biome 2.5.1 checked 1196 plugin, 224 Pi, 133 CLI and
  6 retina files, with only existing warnings/infos.
- Real-host plus manifest command above: passed, **7 tests / 0 fail / 84 assertions**.
- `cargo test --locked -p mc-module -- --test-threads=1`: passed, **1557 unit tests
  and 24 binary/integration tests**, 22 ignored in total (Cargo/rustc 1.99.0).
- `cargo clippy --locked -p mc-module --all-targets -- -D warnings`: passed,
  mc-module all targets (Cargo/rustc 1.99.0).
- `cargo fmt -p mc-module --check`: passed (Cargo/rustc 1.99.0).
- The final Rust gate survived a tool-transport restart. Its original command was
  not rerun concurrently: the saved output and terminal metadata confirm all
  three Rust commands completed with exit 0. Shared compile-slot queues, including
  the real-daemon tests' nested build, account for the long wall time.
- Workspace typecheck uses TypeScript **5.9.3**. The e2e package-wide extra tsc
  check has 24 pre-existing errors in unrelated probes, paired replay, Rust harness,
  OpenCode 2 tests and their imported plugin typing. The new scenario and manifest
  validator typecheck cleanly with a scoped config using the existing Bun/Node
  types and retina path mappings; that temporary config stays in ignored
  `node_modules/.cache`, not in the delivery.
- AFT inspection was partial (Biome unavailable in its producer and Rust indexing
  timeout). Actual repository compiler/lint/test commands are authoritative.
- Existing informational/warning-only Biome findings outside these changes remain.
  Frozen-lockfile installs inside this worktree reported no dependency changes.
  No config knob, architecture/structure document, package manifest, lockfile or
  Rust epoch update is delivered.
