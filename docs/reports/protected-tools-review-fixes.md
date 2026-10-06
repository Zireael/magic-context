# Protected tool cache-review corrections

Refusal code: `protected_tool_results_over_limit`

Refusal message: `The tool results kept by protected_tools are larger than this model's context window, so this turn was not sent. Lower the protected_tools counts.`

These are a public contract. TypeScript and Rust each define the production text
once and test it against `protected-tool-refusal.json`. OpenCode 1, OpenCode 2,
Pi/OMP and Claude Code share that text. The message deliberately avoids language
that Claude Code could interpret as an instruction to compact.

## Trusted over-limit refusal

The healthy send paths now refuse complete over-limit outgoing estimates after
reclaim, including successful no-op reclaim. Partial estimates do not originate
a refusal. A request still over the limit for other reasons gets an explanatory
post-reclaim refusal rather than incorrectly attributing all its mass to tools.

The Rust-mode OpenCode adapter checks its final returned array, not the module's
ingress estimate, before installation/LKG capture. Typed native protected-tool
errors also bypass fallback and LKG replay. Pi measures its final array with a
complete current system/tool envelope and only guards priced/reclaim passes.

ck-mc counts protected result mass remaining after the actual fold's coverage
trim. Its native lower-bound guard requires the current request's
`usage.final_wire_trusted`, a positive model hard limit, and calibrated protected
mass above that limit; stale persisted trust is insufficient. No module wire
schema was added. Its Claude Code handler returns `HandlerOutcome::Error` with
the exact code and message above, no sendable/passthrough response, and no
transform-state commit. The handler regression exercises the real Claude Code
profile and route config; an untrusted-count control remains admitted.

THALAMUS owns the gateway mapping/test in its own repository. This delivery
does not claim an end-to-end gateway proof. The agreed gateway behavior is a
terminal HTTP 400 displaying the module's message verbatim, not a passthrough.

The refusal guards were mutation-checked: disabling the shared outgoing guard
reddened the impossible-reclaim regression, the Pi context-handler refusal,
and the Rust-mode final-wire refusal. The Rust-mode typed-error/no-replay control
remained green. Disabling ck-mc's native lower-bound guard reddened the Claude
Code handler regression. All breaks were staged safely, restored, and rerun green.

Verification: Bun 1.4.2, TypeScript 5.9.3; plugin and Pi typechecks pass. The
postprocess/refusal/Pi fit suites passed 249 tests initially; focused final
contract/fit tests passed six, adapter/byte-identity controls three, and the Pi
handler control one. Cargo 1.99.0 ran 29 protected-behavior tests successfully
with one build at a time; rustfmt 1.10.0 check passed. A combined full adapter
invocation exceeded its 20-minute outer bound and is not claimed as passing.
Its old 2048-message byte-identity fixture was over the former artificial window;
the fixture now supplies an isolated SDK window large enough for its unchanged
ballast. Its exact SHA256 assertions remain unchanged and all three pass classes
pass, while the separate over-limit regression proves refusal.

## Stale result stripping

First detection in OpenCode, Pi and ck-mc consumes the effective per-tool
selection set. Pi's old hardcoded newest-three selector is removed; its exported
default-count alias is only fixture metadata. A zero override permits stale
selection, while custom counts above three hold all requested results. Frozen
replay is unchanged and cannot resurrect a previously stripped result. The
design document now describes that distinction accurately.

The two executed review regressions are in the postprocess and Pi cleanup
suites. A real native transform verifies held detection, a zero-count priced
strip, and byte-identical frozen replay after protection is restored. All three
guards were individually neutralized and each exact regression reddened; restored
checks passed (266 Bun tests and one native integration-style unit test).

## Nudge policy adoption

The frozen baseline now carries the adopted keep-count policy. Recency rotates
inside that policy on SOFT+, but a changed map is not adopted until rebuilding.
Legacy baselines without the field retain the old ctx_reduce-three-only policy
until rebuilding, including the default-only todowrite upgrade. Rust persists
this optional map inside the existing baseline blob; there is no new table.

An unchanged replay already below the nudge floor is not a new collapse, so it
does not reset a delivered Channel 2 lease. Existing queued-drop action-state
collapses remain valid; those are real reductions in actionable mass, not policy
adoption. Both callers provide the previous baseline for that distinction.

The review's map-edit, legacy-upgrade and rotation cases are in the postprocess
suite, with Pi equivalents. The native regression activates the Claude Code
surface and preserves a real raw arc before measuring its old-policy baseline;
the transition pass intentionally has no actionable U. A restart test verifies
policy persistence and legacy decoding in mc-store. Neutralizing policy freezing
reddened the TS/Pi map-edit and upgrade tests and the native policy test;
neutralizing the no-op lease guard separately reddened TS/Pi lease assertions.
The TS rotation control stayed green in those runs.

## Actual delivery-fold retirement

OpenCode postprocess now records the source rows removed by `injectM0M1`'s
successful delivery trim, not just the earlier preparation trim. Those tags
become compacted, and their held pending rows are deleted in the same bounded
writer transaction as retirement. Retained owners sharing a call ID are untouched.

The regression `review regression: executed fold must retire the held historian
row it actually trims` runs a real model-change HARD fold with a historian hold;
it never invokes the retirement helper. It proves the covered raw copy disappears,
the retained raw copy survives, the covered tag is compacted and its pending row
is gone before any subsequent drain. A retained protected row remains pending.

Two separate mutations disabled the delivery-retirement call and the pending-row
delete. Each reddened only that regression; `keeps OpenCode final bytes identical
to a one-shot executed fold` remained green. Staged working bytes were restored
after each break. The restored regression/control passed. Storage retirement and
v86 migration tests passed (seven tests), including the unchanged 100k-tag/two-
second bound (117.7 ms). Their small storage fixture now supplies the tag-number
and pending-queue columns required by atomic retirement; assertions are unchanged.
Plugin typecheck passed with TypeScript 5.9.3. Scoped formatting passed with Biome
2.5.1 from the plugin directory; invoking Biome at workspace root hit the existing
nested-root configuration error. Bun test version: 1.4.2.

## Idempotent historian enqueue

Both generic enqueue and the historian's identity-revalidated INSERT now check
pending membership per `(session, tag, operation)` inside the same SQLite write
statement. This bounds overlapping/repeated publications without a new schema
or a whole-session scan under the writer; the existing session/tag index supports
the probe. The first row's ID, timestamp and queue order survive retries. Different
sessions, tags and operations stay independent, and a consumed row can be enqueued
again. Pre-existing duplicates are not migrated, but cannot grow via these APIs.

The real historian regression `review regression: repeated historian publication
of a held result must have bounded pending depth` makes 100 publications and
asserts one unchanged held row. A separate storage test makes 100 generic enqueues
and checks tuple isolation and re-enqueue after removal. Neutralizing each pending
membership predicate reddened its own bound test alone; the historian's concurrent
identity/status revalidation and storage queue-order controls respectively stayed
green. Both staged mutations were restored before a passing rerun.

The older prepared-publication differential explicitly expected a duplicate of
an already-pending tag. That expectation is intentionally changed from
`[3, 1, 3, 4, 5]` to `[3, 1, 4, 5]` for idempotency, without altering its frozen
clock or byte/identity assertions. Storage and historian suites passed 15 tests
(42 assertions); plugin typecheck passed (TypeScript 5.9.3).

## Final verification of the continued branch

The requested fast-forward from `9d2736a3df` was impossible because this worktree's
base had newer master changes. A normal merge preserved those changes: Cargo.lock
keeps master's published/immutable Git dependencies (no lockfile edit), and Pi's
acknowledgment retains both held-drop feedback and the newer self-stamp warning.
Items 4 and 5 are separate commits: `79c0799d35` and `b721516125` respectively.

Final suite runs used Bun 1.4.2; TypeScript 5.9.3; Cargo 1.99.0, rustc 1.99.0,
rustfmt 1.10.0; and Biome 2.5.1. Every suite had an outer timeout (120–240 seconds
for Bun, 900 seconds for Cargo). Rust ran once, foreground, `-j 2`, with serial
tests and no concurrent build or host. Bun's test preload redirected data/config
to throwaway roots under this worktree's ignored `target/protected-tools-final/tmp`
for final runs; fixture-specific OpenCode stores stayed isolated. No live model,
host or production store was opened.

| Final check | Result |
| --- | --- |
| TS configuration, selection/holds, stale strip, refusal, full postprocess/Channel 2, ctx_reduce, storage-ops and historian queue suites (10 files, `timeout 240s bun test`) | 338 passed, 1 inherited fixture failure, 1778 assertions |
| Pi selection/holds, context/refusal, cleanup and hygiene suites (6 files, filter `protected\|protection\|held drop\|review\|legacy.*SOFT\|smart_drops`) | 21 passed, 1 inherited fixture failure, 83 assertions |
| Pi tests outside that filter: map adoption, legacy upgrade, queued rotation and custom stale keep count | 4 passed, 13 assertions |
| Rust-mode host final-wire refusal and typed-error/no-LKG tests | 2 passed, 2 assertions |
| `timeout 900s cargo test --locked -j 2 -p mc-module --lib protected -- --nocapture --test-threads=1` | 31 passed, 0 failed; compiled in 2m14s, tests in 21.25s |
| `timeout 120s bun run --cwd packages/plugin typecheck` | Passed |
| `timeout 120s bun run --cwd packages/pi-plugin typecheck` | Passed |
| `timeout 240s bun run build` | Plugin/OpenCode 2, Pi and CLI builds passed; 4 OpenCode 2 loader tests, 19 assertions |
| `timeout 120s cargo fmt --check` and scoped Biome formatting | Passed |

The **only final suite failures** are `TypeScript held drop: newest three
ctx_reduce results hold agent drops` and `Pi held drop: newest three ctx_reduce
results hold agent drops`. Their shared fixture expects a `Held:` acknowledgment,
but the newer master policy rejects self-stamps with `§2§ is a ctx_reduce call;
leave those alone, they are cleaned up automatically.` The fixture and both
production tool files are byte-unchanged from merge commit `1b30440055`, before
either remaining fix. The TS case failed identically on an isolated diagnostic
rerun. This is an inherited integration mismatch, not an enqueue or retirement
regression; no expected hold assertion was weakened to hide it. Reconciling that
older fixture with master's self-stamp policy is outside these two review fixes.

All new tests and unaffected controls passed after their mutations were restored.
Scoped `aft_inspect` reported incomplete Biome/server diagnostics, so explicit
package typechecks and formatting are authoritative. Full lint and live gateway/
provider probes were not run; no end-to-end provider acceptance is claimed.
