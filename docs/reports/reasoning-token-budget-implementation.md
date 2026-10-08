# Reasoning retention implementation

## Shipped policy

`keep_reasoning_tokens` replaces the ignored/deprecated tag-age setting, with a fixed
10,000-token fallback, independent of context geometry. Scalar and per-model values use
the cache-TTL lookup order. The cutoff keeps whole steps newest first and stops at the
first non-fitting step. Exempt steps are charged but cannot be selected. Reported counts
win over calibrated plaintext estimates; opaque groups without either cost 1,000 tokens.

No store schema or stored-state migration is introduced. Existing frozen ids and
watermarks remain authoritative. New decisions only ride an already-permitted rebuild.
The canonical sentinel, whole-part, inline, native Pi and Rust lanes retain their own
eligibility and replay shapes.

## Clarifications adopted during implementation

- Whole-step selection does not introduce a new clearing capability. Pi redacted blocks
  remain immutable even when ordinary siblings are cleared. Native snapshots retain their
  separate saved-id replay. An upgrade regression pins byte-identical replay of a mixed
  redacted/ordinary step under an old watermark; cleared signed bytes cannot return.
- Rust's processed-image lane previously borrowed the reasoning-age cutoff. It now uses
  the TS/Pi **highest dropped-tag watermark**, not a fixed age and not the reasoning
  budget. Answered large user images at or below a positive watermark may be selected on
  rebuilds; existing frozen image decisions still replay. This is a one-time selection
  policy change on the next rebuild for affected legacy Rust sessions, including users
  with non-default `clear_reasoning_age`. Shared TS/Rust image selection and replay
  goldens pin the rule. The previous untagged-image integration fixture now supplies a
  real dropped-tag watermark and first proves that an answer alone does not retire it.
- Rust cost selection excludes already-covered history while charging a retained lineage
  anchor and respecting its existing render exemption and signed-prefix stop rule.

## Offline replay

Historical route replay was **not run**. The existing acquisition script reads live
stores, which this task prohibits; its original numeric outputs had been removed. The
parent approved adding a snapshot-only tool and deferring historical replay until an
operator supplies a sanitized dataset. No acquisition command or live-store read ran.

`packages/plugin/scripts/reasoning-resend-cost/replay-budget.ts` accepts only route/model
labels, numeric step order, reported counts or calibrated text estimates, and an encrypted
flag. Its README documents the format and the limitation: checkpoints are hypothetical
rebuilds with one tag per step, not reconstructed actual busts.

The synthetic fixture's final checkpoints at the fixed 10k default are:

| Synthetic trajectory | Budget kept tokens / steps | Age 50 kept tokens / steps |
|---|---:|---:|
| reported OpenAI-like | 5,000 / 2 | 13,000 / 3 |
| plaintext estimate plus unreported opaque | 1,000 / 1 | 10,500 / 2 |

These are test data, not measurements of the design table's routes. They do not justify a
change to the user-selected default.

## Safety and verification evidence

- Real OpenCode 1.18.30 with a thinking-capable loopback mock: an over-budget defer keeps
  provider prefix bytes, an explicit rebuild removes whole old steps and serves at most
  300 kept reasoning tokens (242 tokens in two steps in the final run), and the next
  defer preserves that frozen prefix. Host PID
  `lsof` proves all open databases are below its throwaway root. The scenario is registered
  in the e2e manifest with its validator counts: 176 files/entries, 60 TS invocations,
  58 Rust invocations and 44 TS OpenCode invocations. The final host PID was 78126.
- Prefix-stop and defer-permission mutants each redden only their named guard while the
  reported/fixed-charge control stays green. Mutations were staged safely, diff-captured,
  restored and touched; no mutant is committed. Delivery includes exact mutation records.
- Package suites, typechecks, lint and Rust checks are recorded with counts in the delivery.
  The final broad plugin run encountered one unrelated ten-second git setup timeout;
  the entire affected verification file passed with the repository test runner in isolation.
- `cargo clippy -p mc-module --all-targets -- -D warnings` encounters a pre-existing
  `type_complexity` warning in unchanged `single_store_repair_tests.rs:572`. Production
  `cargo clippy -p mc-module --lib -- -D warnings` passes; no unrelated lint cleanup rides
  this change.
- Rust evidence uses `cargo test`, not a locally launched `ck-mc` or `ckdev-mc`. The AFT
  fleet restart and prior build-copy warning therefore do not invalidate that evidence.
- No live OpenCode/CortexKit stores or configs were opened or migrated. Host runs use
  throwaway XDG roots, `OPENCODE_DB` and `MAGIC_CONTEXT_STORAGE_DIR`; package suites use
  throwaway `HOME` and do not export `OPENCODE_DB`.

## Adversarial follow-up

The accepted review commit `e8571ede97` and its witnesses were imported unchanged before
production edits. The first TS/Pi run reproduced all seven named failures (46 passed,
7 failed). Fixes retain every witness expectation:

- Budget-only first selection protects all assistant steps after the last real Anthropic
  user request, including subagents. Tool-result and synthetic user carriers do not reset
  the boundary. The isolated predicates are `active-anthropic-turn.ts` and Rust's
  `transform/active_anthropic_turn.rs`; neither is a compatibility shim for the parallel
  branch's absent helper. The parent explicitly narrowed coordination scope: fresh merged
  and proactive stripping remain unchanged here and are owned by the parallel turn fix.
- Whole-part and exact merged-part frozen replay no longer restores a block when a host
  subset changes the latest assistant. Bare legacy merged ids have no exact part evidence,
  so replay conservatively keeps those removals absorbing. Rust clear refresh retires the
  old suspension flags rather than restoring signed content; frozen age/merged removals
  take precedence over render exemptions and native keep decisions.
- Legacy tool tags price preceding thinking, not their owner's thought, and repeat it for
  parallel tools. Live selection now estimates the step's own kept plaintext. DB-only
  estimates use deduplicated message-tag evidence, never tool ownership. Exact frozen
  merged-part selections are replayed on a private cost-only parts array before charging;
  a retained sibling still counts. Frozen prose calibration is supplied to fallback and
  inline estimates as well as stored projections.
- Rust uses the existing shared `tool_catalog::model_key_candidates` alias walk instead
  of the literal-provider TTL resolver. Declared reasoning-part presence gives positive
  reported usage precedence even when the body is empty and has no opaque metadata.

Fixture changes are explicit: `toolLoop` itself remains unchanged. The calibration
witness alone uses a new historical context helper so it does not simultaneously demand
active-turn preservation and historical removal. Existing budget prefix fixtures identify
historical context; the pruning/index regression closes its turn with a real follow-up
request. No review expectation was weakened. Existing tests that claimed exemption-based
restoration were changed to the newly required absorbing contract, not silently inverted.

The three requested Rust witness filters were each tried once, sequentially, in background
with five-minute timeouts. The first two never reached tests while all six compile slots
were occupied (exit 124); their runtime results are **not run**. Compilation then completed
for the third filter, which passed the positive-empty-summary witness (one test, exit 0).
There was no local Rust host launch, live-store access or migration.

Final follow-up gates: plugin `bun run test` passed 7,326 tests (six skips) and Pi
`bun run test` passed 1,625 tests (three skips). The seven TS/Pi review witnesses
and all controls are green with unchanged assertions. The isolated LKG child-writer
failure observed in an earlier parallel run was not reproducible in isolation or the
final full Pi run. Final bundles were rebuilt and the OpenCode 1.18.30 thinking-mock
host proof passed again (PID 97768, 22 assertions, throwaway databases proven by lsof).
Fresh merged/proactive selection functions and provider-error recovery are unchanged;
only budget first selection uses the new active-turn predicate. The two existing replay
tests that asserted resurrection now assert absorbing frozen removals, as explicitly
required. Budget prefix fixtures are historical context carriers rather than live
requests, and preserve their cutoff/byte-identity assertions.
