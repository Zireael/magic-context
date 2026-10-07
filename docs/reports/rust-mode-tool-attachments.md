# Rust-mode tool attachments

## Diagnosis (written before implementation)

The supplied CEREB request-body evidence distinguishes **tagged text-only** results
from **untagged text-plus-image** results. The diagnosis references below use the
pre-repair source line numbers. No live database/configuration was opened.
The fault is in the adapter projection, not in persisted OpenCode tool parts or
Anthropic's image handling:

* `packages/plugin/src/hooks/magic-context/rust-mode-transform.ts:3482` calls
  `encodeOpenCodeMessagesToCk` on the ordinal-annotated input. It also supplies
  native messages for lossless reattachment (`buildTransformBody`, lines 1559–1673).
* `packages/plugin/src/hooks/magic-context/module-wire.ts:1002–1021` projects every
  completed/error tool output as `Text`/`ErrorText`, **without attachments**.
* `crates/mc-module/src/transform.rs:10559–10587` selects taggable results;
  `10596–10627` excludes pending tags; `10748–10873` adds the tag to the text and
  marks the edited block modified. Already-served late tags wait until a bust;
  synthetic/system rows and exempt native assistants also have mutation guards.
  Thus not every completed tool result is tagged on every pass. Untagged results
  are not evidence that the attachment survived the CK projection.
* Output build (`transform.rs:15911–16070`) copies CK ingress and applies overlays
  (or reuses a serialized output cache entry). The projected text-only type reaches
  native attach (`lib.rs:14935–14992`, `15074` onwards).
* Native attach decodes the original input into a **sidecar**, not a replacement
  CK decision surface. `codec/opencode.rs:892–920` keeps unchanged native parts,
  which explains the untagged survivors. Modified results are updated from CK:
  `1047–1108`, `1438–1452`. `output_attachments` at `1377–1390` returns an empty
  vector for `Text`/`ErrorText`; `apply_tool_output_to_part` then deletes
  `state.attachments`. Neither tagging nor native attachment caching creates the
  omission, but tagging makes the already-lossy projection authoritative.
* The native codec itself decodes attachments correctly into `Content` or
  `ErrorContent` (`codec/opencode.rs:710–747`). It retains each raw attachment in
  `provider_extras.opencode.rawAttachment`, including opaque/unknown children.

The same projection handles `computer_use`, the host `read` tool's image and PDF
attachments, and any other completed tool; it does not branch on the tool name.

## Other adapters

OpenCode 1 TS mode writes only `toolPart.state.output = prependTag(...)`
(`tag-messages.ts:1002–1009`), leaving `state.attachments` untouched. Pi writes only
the selected text child into a shallow copy of the original content vector
(`packages/pi-plugin/src/transcript-pi.ts:927–942`); non-text children survive.
OpenCode 2's native bridge keeps the original result on no change and calls
`rebuildFileContent(bridge.files, state.output)` when text changes
(`packages/plugin/src/v2/hooks/payload.ts:455–466`). These paths do not have the
Rust projection loss. Existing explicit reduction paths are different: they may
replace/remove the whole tool result, with their existing frozen placeholder.
Regression tests will exercise these carrier-preserving paths, not just compare
source strings.

## Repair and cache policy

Project attachment-bearing results as `Content`/`ErrorContent`, tag only their
text child, and retain media **and opaque** children with their native metadata.
No-attachment outputs retain the exact old shape and bytes. For a synthesized
CK media child with no native raw carrier and a source that OpenCode cannot
represent, native output carries a deterministic visible
`[attachment not shown: ...]` line naming its MIME and stored id/filename (and
stored dimensions when present), rather than emitting a URL-less file. Native
raw children, including unknown/malformed opaque children, remain lossless.
The notice depends only on immutable stored data and the frozen served CK block;
the native attachment cache and a cache-miss rebuild make the same decision.
Explicit frozen reductions retain their existing placeholder instead.

The parent approved a **one-time next-normal-pass repair**, not a new persisted
renderer transition. Placement will coincide with the fleet's OpenCode restart
window (persona/tool rewrite), when ck-mc's process-local CK/native caches are
empty anyway. An already-served tagged result containing attachments is restored
on the next normal module pass, including a defer; its provider prefix changes
from the first such message onward. A local persisted last-served/LKG snapshot
can continue replaying old bytes while the module is unavailable; repair happens
when normal module serving resumes. Sessions without attachment-bearing tool
results must be byte-identical across the upgrade. No database migration or
live-store edits are involved.

## Verification

Failing-first tests, final commands, wire replay checks, and containment evidence
are recorded below after implementation. All host roots and captured outputs
stay under `$TMPDIR/magic-context/bg_db9030ba41707226/`; package suites use a
throwaway HOME and do not export OPENCODE_DB. Development binary paths use the
`ckdev-` prefix.

### Non-host gates and negative controls

* Bun 1.4.2 / TypeScript 5.9.3: plugin and Pi package `typecheck` passed.
  Plugin/Pi package lint passed (Biome 2.5.1; 1266 / 245 files respectively,
  existing warnings only). The plugin carrier/projection tests and Pi carrier
  test passed together: 50 tests. Final projection test: 25 passed, including
  the independent pre-repair full wire shape for attachment-free outputs.
* Manifest validator: 6 passed; 176 files, 61 TS invocations, 59 Rust invocations.
* The e2e project-wide tsc has 22 existing diagnostics in other files (including
  `rust-harness.ts`'s incomplete SDK type and old SQLite tests). A check using the
  same TypeScript program reports zero diagnostics in the two changed e2e TS
  files; neither diagnostic set is treated as a clean whole-project typecheck.
* `cargo test --locked -p mc-module`: library 1652 passed / 22 ignored, and the
  initial integration targets passed (5 + 1 + 5 + 1 + 2 + 1). The command stopped
  in the pre-existing `real_daemon` process-name guard: two cases saw `(sh)` and
  `(bash)` instead of `ckdev-*`. Fresh local-host results are recorded separately
  below, because the pre-update Cargo artifact transfer was not trustworthy.
* Clippy 0.1.99 / Cargo 1.99.0: package-scoped `cargo clippy --locked -p mc-module
  --all-targets -- -D warnings` passed, as did `cargo fmt --check`.
* The requested whole package tests ran under a throwaway HOME, with OPENCODE_DB
  unset. The first HOME had a redundant slash; normalizing it resolved unrelated
  HOME equality/expansion assertions (68 tests passed in those files). The final
  plugin full run had 7299 passed / 6 skipped / 3 failed: the existing static
  temp-directory policy names `e2e-tests/src/rust-runner/hermetic-subc.test.ts`,
  and two unrelated timed/load-sensitive tests failed (`skips 20,000 old files
  and resumes a bounded scan without losing requests`, and `yields to the event
  loop between pages while scanning 100k SQLite parts`). The Pi full run had
  1621 passed / 3 skipped / 1 failed in an unrelated background-writer fixture;
  `admits first Pi turns during bounded background holds without a saved request`
  passed on its narrower replay. None of these failures was repaired in this
  attachment change. A cross-package narrow replay also exposed existing
  raw-reader owner/yield failures; it is not a green replacement for package gates.

The tests were failing-first: the plugin attachment test received `text` instead
of `content` before the projection repair, and Rust's unsupported-source test
received only `§1§ Read result` before the visible notice repair. Controlled
negative runs were also made from a staged live tree, each explicitly marked
`NON-VACUITY BREAK` and restored from the index with an empty unstaged diff:

* Returning the old attachment-blind projection: only
  `projects tool attachments beside text for both completed and error results`
  failed; the other 24 projection/paging tests, including no-attachment byte
  identity, remained green. Mutation diff: `module-wire.ts | 2 ++`; restored: empty.
* Suppressing the native unsupported-source predicate: only
  `codec::opencode::tests::unsupported_tool_media_source_has_visible_byte_stable_notice`
  failed; the other 26 native codec tests remained green, including completed/error
  attachments and opaque-byte round trips. Mutation diff:
  `codec/opencode.rs | 2 ++`; restored: empty.

### Local-host binary freshness

All local-host runs made before the AFT artifact-transfer fix are **discarded as
verification evidence**. One such run did demonstrate that mock/read image and
PDF blocks arrived on first sight, then tripped on OpenCode's moving Anthropic
`cache_control` breakpoint; the regression now compares the complete logical
result with only that provider bookkeeping excluded. A later launch encountered
an empty daemon artifact. Neither is a passing real-host claim.

The delivery's fresh local rebuild and host/shard results will be recorded here
with compile-time module/daemon identities and digests, not clock-skewed mtimes.
