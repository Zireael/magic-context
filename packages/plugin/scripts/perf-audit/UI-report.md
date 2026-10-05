# UI performance audit — partial delivery

Baseline: `ee9d82912cd8105322672a1f5dd1bbb7172a2f46`. No dashboard or CLI production code was changed. The native dashboard baseline build could not finish within its 1,200-second outer timeout: the machine's six shared compile slots were occupied, and the build spent most of its time queued. This prevents native before/after polling/render measurements and the required Rust verification. The remainder of the audit is **blocked, not completed**.

## Measurements and disposition

The SQL numbers below are measured SQL/JavaScript lower bounds, **not** timings of the Rust command, serde, SolidJS, or DOM. They are not a substitute for the required native/dashboard measurements. The fixture is a scrubbed, read-only `VACUUM INTO` copy of a real OpenCode store, with 13,793 sessions; the selected session contains 54,643 messages. The context copy has 20,482 memories.

| Finding | Classification | Before → after | Commit | Test / measurement | Notes |
| --- | --- | --- | --- | --- | --- |
| UI-1 | CONFIRMED (payload lower bound); native fix blocked | 24,959,249 unused raw JSON bytes per 54,643-message request → unchanged | none | `dashboard-sql.ts` | Metadata-only IPC is 29,166,761 bytes, excluding role/preview fields. Warm JSON parse 37.294 ms, serialization 67.069 ms, JS IPC parse 43.107 ms. These fields alone substantiate the payload cost; no production fix without native verification. |
| UI-2 | Unmeasured / blocked | — | none | native build did not reach the probe | Current Messages tab already collapses compartment segments (`SessionViewer.tsx:1046-1061`); measure live-tail and expanded-compartment DOM cost separately before choosing virtualization. |
| UI-3 | Unmeasured / blocked | — | none | native probe not reached | Must preserve identity resolution, subagent-only handling, representative directory choice, and orphan-card filtering. |
| UI-4 | Unmeasured / blocked | — | none | native probe not reached | Any request-scoped reuse must preserve project and schedule resolution. |
| UI-5 | Unmeasured / blocked | — | none | native probe not reached | Current reconcile loop is already in-flight latched and activity gated (`CacheDiagnostics.tsx:564-580`); hidden-window polling still needs measurement. |
| UI-6 | Unmeasured / blocked | — | none | native probe not reached | Pi parent-chain invalidation and partial JSONL appends must be preserved by any incremental parser. |
| UI-7 | CONFIRMED (SQL lower bound); native fix blocked | 1.478 ms all-ID read vs 0.030 ms point-ID read, 13,793 sessions → unchanged | none | `dashboard-sql.ts` | A replacement must preserve V2 ownership of shared IDs in converted stores. |
| UI-8 | CONFIRMED (SQL); native fix blocked | 154.147 ms warm badge count, 54,643 messages → unchanged | none | `dashboard-sql.ts` | V1 has no equivalent dedicated role/type column in the existing query; replacing the token predicate with role alone changes the badge. |
| UI-9 | CONFIRMED (SQL lower bound); native fix blocked | 13.699 ms full session-table read, 13,793 sessions → unchanged | none | `dashboard-sql.ts` | Does not include harness scans, enrichment, filtering or sorting; no claim that LIMIT alone preserves paging across harnesses. |
| UI-10 | Unmeasured / blocked | — | none | native/render baseline unavailable | SolidJS matches references, not React render keys. |
| UI-11 | Unmeasured / blocked | — | none | native probe not reached | Catalog changes require a fresh-result/invalidation contract, not an indefinite cache. |
| UI-12 | CONFIRMED; stopped before public CLI output change | 1k: 5.494 ms; 10k: 23.087 ms; 60k: 137.347 ms → unchanged | none | `cli-logs.ts` calls actual exported readers | At 60k: inspection 65.792 ms + reread/sort 71.555 ms. Tailing/sampled grammar detection can omit historical evidence and change exact line count / mixed-grammar reporting. No such public CLI change was made. A future fix should retain those diagnostics. |
| UI-13 | CONFIRMED (SQL lower bound); native fix blocked | Four status COUNTs: 3.622 ms warm on 20,482 memories → unchanged | none | `dashboard-sql.ts` | Excludes embedding/category queries. The frontend resource is still keyed on all fetch parameters. |
| UI-14 | Unmeasured / blocked | — | none | native probe not reached | Must retain legacy path-to-identity matching for workspace members. |
| UI-15 | Unmeasured / blocked | — | none | render baseline unavailable | No frontend changes. |
| UI-16 | CONFIRMED; quiet-poll ancestry fixed | 3 → 2 git processes per unchanged descendant poll (90 → 60 over 30 polls); loaded-machine medians 93.066 → 51.986 ms | `22c6e2110d` | `unchanged git_commit_after validates refs but skips the ancestry process`; `retina-poll.ts` | Both refs are still validated every poll, preserving errors for deleted/moved bases. Initial baseline median was 52.259 ms and the first post-change run was 76.788 ms: host contention makes wall times noisy; the deterministic improvement is one fewer process/path revalidation per quiet poll. |
| UI-17 | Unmeasured / remaining | — | none | not run | No claim of completion. |
| UI-18 | Unmeasured / remaining | — | none | not run | No npm/registry behavior changed. |
| UI-19 | Unmeasured / remaining | — | none | not run | No migration or boundary-remapping change made. |

“Unmeasured” is intentionally not one of the audit's five measured classifications. A blocked experiment is not evidence for NEGLIGIBLE or NOT REPRODUCIBLE.

## Reproduction and isolation

All commands require an outer `timeout`:

```sh
timeout 120 bun packages/plugin/scripts/perf-audit/retina-poll.ts "$THROWAWAY/retina"
timeout 120 bun packages/plugin/scripts/perf-audit/cli-logs.ts "$THROWAWAY/cli"
timeout 120 bun packages/plugin/scripts/perf-audit/dashboard-sql.ts "$THROWAWAY" "$SESSION_ID"
```

For SQL, the scripts expect copies at `$THROWAWAY/data/opencode/opencode.db` and `$THROWAWAY/data/cortexkit/magic-context/context.db`. Make these via the common audit prompt's read-only `VACUUM INTO` procedure; drop `credential`, `account`, `account_state`, and `control_account` from the OpenCode **copy**, then chmod both copies read-only. `dashboard-sql.ts` runs `lsof -p <own pid>` with the connections open, rejects any database handle outside the throwaway root, and saw exactly two isolated DB handles. No application was launched against live host stores. The audit copies were deleted after measurement.

The baseline Rust probe was run with HOME, XDG data/config roots, Pi agent root, and Broca root redirected to the throwaway directory (and CARGO_HOME/RUSTUP_HOME retained for toolchain access). Its temporary integration probe was discarded without changing dashboard production code. The next required action is to obtain a native compile slot, run `timeout 1200 cargo test --locked --manifest-path packages/dashboard/src-tauri/Cargo.toml -p magic-context-dashboard`, and resume native measurements before editing dashboard code.

## Identity and safety evidence

The retina benchmark's first-event JSON and scalar were identical before/after on the same repository and path. Each of 30 quiet polls returned exactly `{events: [], scalar: first.scalar}`. Existing strict-descendant/new-commit, tag, path-fence, compound ordering, stable replay-ID and CLI error tests pass. No cache, format, epoch, persisted scalar, configuration or public CLI flag was added or changed. Predicates remain sequential; file reads were not capped, since a cap can change containment results. There is no TypeScript/Pi/Rust transform twin for this change. The shell-tracer test is skipped on Windows; the underlying existing behavior tests remain cross-platform.

The new process-count test was mutation checked: removing the new `previous?.state !== currentSha` short-circuit made only `unchanged git_commit_after validates refs but skips the ancestry process` fail (expected 2 calls, received 3); the other 26 tests passed. The working state was staged before the `NON-VACUITY BREAK`, the mutation produced a non-empty diff, and restoring from the index returned an empty diff. An initial mutant run with Bun's default five-second timeout also timed out an existing descendant test under host load; the definitive red/green runs used `--timeout 30000` without altering existing tests.

No transform-path code changed, so pure-replay differential is not applicable. The full plugin suite includes the existing byte-identity/parity tests and passed (6,767 pass, 4 skip, 0 fail across 651 files; 203,501 assertions). The retina full suite passed (27 tests, 92 assertions).

## Gates and tool issues

- Bun 1.4.2; TypeScript 5.9.3; Biome 2.5.1; SQLite 3.54.0; Cargo 1.99.0.
- `timeout 180 bun run --cwd packages/retina-local-fs test -- --timeout 30000`: passed, 27 tests.
- `timeout 180 bun run --cwd packages/retina-local-fs typecheck`: passed (`tsc --noEmit`).
- `timeout 180 bun run --cwd packages/retina-local-fs lint`: passed, six files.
- `timeout 1200 bun run --cwd packages/plugin test`: passed, 6,767 tests / four skips. Its required frozen-lockfile install completed with no changes.
- `timeout 180 bun run --cwd packages/plugin typecheck`: passed, including script typechecking and retina declaration build. The initial cross-package relative import failed script rootDir validation; the committed benchmark uses the declared package export instead.
- `timeout 180 bun run --cwd packages/plugin lint`: passed, 1,199 files; one pre-existing warning and two informational findings outside this change.
- Dashboard baseline Rust compilation: **timed out**, exit 124, before reaching any measurement or test. The compiler repeatedly reported all six shared slots occupied. No native pass is claimed; required dashboard typecheck/lint/clippy/full tests remain pending with dashboard work.
- AFT inspection reported zero TypeScript errors, but PARTIAL because its Biome producer was unavailable and Tier-2 analysis was not available in this worktree. Repository typecheck/lint commands above are authoritative.
- `todowrite` was not exposed in the worker tool set.

Comments in the staged production/test/script changes were reviewed before committing: they explain why refs remain validated, why only quiet-poll ancestry is skipped, and explicitly distinguish SQL lower bounds from native/render measurements.
