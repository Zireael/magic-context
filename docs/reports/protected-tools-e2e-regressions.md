# Protected-results refusal: end-to-end correction

## Delivery status

The refusal correction is implemented and verified, but **this is not an all-green
release delivery**. The complete host sweep could not be certified by the 18:30Z
cutoff. Do not ship protected_tools on the strength of the unit results alone.

The branch is rebased onto `99ae86b1eb`. Because that master contains the feature's
revert, the rebase first restores protected_tools, then applies the correction.
Conflict resolution retains issue 624's live TTL configuration and persisted TTL
policy. The Rust metadata-length gate accounts for both policy fields and passed
the full native suite. ARCHITECTURE.md and STRUCTURE.md were not edited.

## Cause and correction

The new healthy-send guard introduced a **generic overflow refusal**, not just a
protected-results refusal. It checked the whole outgoing request, including usage
from a correlated, previously accepted reply, even when the protected subset was
absent or fitted. This intercepted turns that previously reached the provider,
learned an overflow limit, and folded through the existing emergency path.

CI run 37441144782's failed logs were retrieved with `gh run view --log-failed`.
The fold-under-pressure, oversize Broca arc, Broca outage, maintenance and
ctx_reduce-round-trip stacks all name the generic `outgoingContextRefusal` path.
The fold log shows a committed scheduler execute followed by a refused array,
with a historian firing, not protected-tool selection preventing a fold.

The park-self-heal failure reproduced locally: the preceding accepted 96k usage
caused refusal before the overflow probe reached the provider, so the test waited
60 seconds for an emergency latch that could never be armed. The two thinking-block
failures also reproduced the generic refusal. Some CI fold/historian failures did
not reproduce on the local OpenCode 1.18.30/unknown mock-model route; their CI
stacks, rather than a claimed local red, supply that part of the diagnosis.

Pi's five synthetic-todowrite failures reproduced in the real host lane. They
failed at **zero provider requests**, before the synthetic-pair assertion. With
only the shared refusal correction, all seven Pi todo tests pass, including pair
injection, logical-byte-identical defer replay, legacy-anchor self-heal and anchor
retirement. No todo selection, anchor code or host expectation was changed.

The guard now requires refusal-grade evidence and calibrated protected results
**alone** exceeding the limit. A zero or fitting subset retains the existing send,
fold and provider-overflow refusal decisions. The task giver explicitly approved
this contract correction. Every changed generic-refusal unit expectation was
confirmed branch-added against pre-merge master `9de884724d`; no master test's
expectation was changed.

## Differential and mutation proof

`default protection preserves master wire bytes, folds and refusals under pressure`
compares complete serialized output arrays and fold/refusal decisions across five
passes: accepted high pressure, an actual coverage fold, provider overflow, a fold
after overflow, and defer. Its frozen oracle was produced by the actual
`injectM0M1`, `runPostTransformPhase` and `evaluateEmergencyFailClosed` functions
extracted from master. Regeneration from `99ae86b1eb` produces the same bytes as
the original pre-feature master oracle. Expected bytes are not computed by the
implementation under test. The final restored differential is green.

Restoring the old generic guard with a `NON-VACUITY BREAK` made precisely that
test fail; `successful no-op reclaim refuses a trusted over-limit outgoing request
before provider rejection` remained green. The staged live implementation was
preserved before mutation; the mutant diff was one file, five insertions and four
deletions, and the restored unstaged diff was empty. The new fitting-subset unit
assertions also reject the old guard; they were not counted as unchanged controls.

## Counts and remaining gaps

Tools: Bun 1.4.2, TypeScript 5.9.3, Cargo/rustc 1.99.0, Biome 2.5.1.
Commands had outer timeouts. Native builds ran one at a time with `-j 2`.

| Gate | Result |
| --- | --- |
| Four `scripts/run-rust-hermetic-e2e.sh` shards, `MC_E2E_SHARD=N/4`, after refusal fix and before rebase | 0: 38 pass / 1 fail / 60 skip; 1: 23 / 0 / 17; 2: 28 / 0 / 65; 3: 25 / 0 / 12. Counts use each file's final attempt, not retry duplicates. |
| Pi host manifest lane | 49 pass, 1 fail, 246 skip; all seven synthetic-todo tests pass. |
| Full plugin `bun run --cwd packages/plugin test` after rebase | 7116 pass, 4 skip, 0 fail; 7120 tests, 689 files. |
| Full Pi `bun run --cwd packages/pi-plugin test` after rebase | 1579 pass, 3 skip, 0 fail; 1582 tests, 146 files. |
| `cargo test --locked -j 2 -p mc-module -p mc-store -- --test-threads=1` after rebase | mc-module: 1621 library tests plus 24 binary/integration tests pass, 23 ignored; mc-store: 231 pass, 3 ignored. No failures. |
| `cargo clippy --locked -j 2 --workspace --all-targets -- -D warnings`, `cargo fmt --check` | Pass. An earlier 900s parent timeout expired while compilation queued for shared slots; the final cached invocation completed successfully. |
| Root `bun run lint` | Pass, zero errors; 1608 files checked across four packages. |
| Plugin/Pi typecheck scripts and root build after rebase | Pass; build includes four OC2 loader tests. Final differential/refusal rerun: six tests pass. |
| OC2 full host manifest lane | 71 pass / 1 fail / 248 skip. The failure was missing OC1 on PATH after the tool daemon restart, not a provider turn. |
| OC1 full host lane and OC2 impacted/extras reruns | Not certified. See isolation and follow-up below; partial OC1 logs are not a reliable complete-suite count. OC2 impacted rerun: 1 pass / 2 fail. OC1 cache-analysis oracle: 10 pass. |
| Four post-rebase Rust shards; all-DB-clean final OC1/OC2/Pi sweep | Not completed by cutoff. |

The sole pre-rebase Rust failure is `recovers ALF-like seven sparse gaps but
preserves the old cut when a post-marker gap contains a real message`. Running
that unchanged test against separately built, plain `99ae86b1eb` plugin and native
module fails identically at the expected rejected promise: it resolves instead.
The logged decision is **HARD / first_render**, not ttl_expiry. This is not assumed
to be the other worker's TTL/restart harness regression, and the test was not edited.

Pi's remaining `notes ready` long-running-session assertion also fails identically
against the separately built plain-master Pi bundle. It was not edited.

The OC2 conversion rerun exposed a ctx_reduce-ledger wait timeout and reporter
emergency-drop assertion. These are **unclassified**, not claimed baseline failures.
Their master comparison and root-cause work remain necessary before an all-green
delivery. The other worker's harness fix was not available for integration here.

## Store isolation and macOS HTTP-cache exposure

Application stores/configuration were isolated under helper-created throwaway
roots inside `$TMPDIR/magic-context/bg_c83ef7955e1d4f0c/`. Full unit scripts unset
OPENCODE_DB and used an external, canonical throwaway HOME. Host environments set
all XDG roots, OPENCODE_DB and MAGIC_CONTEXT_STORAGE_DIR privately. No inventory
showed a forbidden live application database or configuration path.

The strict all-DB lsof fence nevertheless caught two **external Foundation HTTP
cache** openings in OC1: PID **98174** opened `~/Library/Caches/opencode/Cache.db`
and its WAL/SHM files. After setting CFFIXED_USER_HOME, PID **68837** opened
`$DARWIN_USER_CACHE_DIR/opencode/Cache.db` under the system per-user cache directory.
It is **unknown whether either wrote**. These are not the forbidden application
stores, but they prevent the required only-throwaway-DB proof. The task giver
explicitly permitted continuation with disclosure, not relaxation of the fence.

All four harness environment constructors now set CFFIXED_USER_HOME to their
private HOME, as directed. Authoritative TypeScript diagnostics for those four
files report zero errors/warnings. This change alone did **not** finish isolating
Foundation's cache; a further verified OS-cache isolation mechanism is needed.
No operator cache was removed or modified to work around the finding.

The fence stopped the affected runs; final host certification is not claimed.
Some aborted runner children outlived the outer process and continued writing
the reused OC1 log, so apparent partial totals there must not be treated as a
completed lane. Remaining owned fixture processes are stopped before delivery.

Logs, master-build artifacts and structured mutation output are retained in the
ignored worktree directory `target/protected-tools-e2e/`. The next verification
window must first finish the all-DB isolation proof, classify the OC2 conversion
failures, integrate any separately delivered harness fix, and rerun the complete
post-rebase host/hermetic sweep without weakening assertions.
