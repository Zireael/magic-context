# Migration v95 follow-up verification

This record accompanies the fixes for B1/S1/S2/S3 in
`docs/reports/migration-v95-review.md`. The continuation merge recovered the
interrupted implementation and its earlier measurements. Those measurements
remain in `docs/designs/perf-audit-migration-batch.md`; the checks below are new
runs against the continuation, including the merged private-storage changes.

## Isolation

Live-store isolation, verbatim: never open/read/write/migrate the live stores.
No live OpenCode/Magic Context database or user configuration is used. All test
and host HOME/XDG/TMPDIR/storage paths are fenced below
`$TMPDIR/magic-context/migration-v95-follow-up-bg_9a93f47f4bc5a770/`.
The only permitted large input is the pre-existing read-only backup pair at
`$TMPDIR/magic-context/ckmc-perf/backups/{context,store}.db`. Only disposable
clones may become writable; host-process-group lsof inventories must contain
only database/sidecar paths below the resolved throwaway root.

## B1 — fail closed when the worker cannot load

The async opener rejects worker construction/loading/early-exit errors and
incomplete worker results, without calling the synchronous migration runner.
The explicit synchronous opener remains available to offline CLI/tests. Host
tool/RPC/timer paths use the current-schema-only opener, so registration after
failed async boot cannot accidentally perform the rejected migration itself.

The former fallback-success test intentionally asserts refusal instead: an
unloadable worker must leave the ledger at 94 and the main-thread body counter
unchanged. A further test covers a worker claiming completion before `ready`.
Non-file-backed async opens are rejected before any file/permission setup, so
private-storage creation cannot leave a literal `:memory:` file in the checkout.
The in-memory refusal test also checks the absence of that artifact.
The two timer lifecycle fixtures now explicitly establish current storage before
registration, as actual host boot does; their overlap/replacement assertions are
unchanged. They previously failed because they implicitly expected registration
to upgrade a cold store. A default 5-second dream-trigger timeout in the first
combined run also disappeared with the package's normal 30-second timeout.

Fresh checks (Bun 1.4.2, TypeScript 5.9.3, Biome 2.5.1):

- Worker and OpenCode 1/2 boot refusal tests: **13 passed**, 40 assertions.
- Timer/dream-trigger tests after fixture correction: **26 passed**, 79 assertions.
- Initial combined storage/tool/timer/worker run: **112 passed, 3 failed**; the
  three impacted failures above were corrected/rechecked without weakening the
  refused-boot contract. Storage/tool tests passed in that run.
- Actual Pi extension/context-runner refusal: **1 passed**, 10 assertions.
- Plugin typecheck: all **3 tsc projects passed**. AFT reports no TypeScript
  diagnostics, but is partial because its Biome producer is unavailable.
- Pi/CLI plain typechecks expose an unrelated merged-baseline TS2868 error:
  `shared/storage-permissions.ts:151` references `Bun`, while these packages
  specify only Node types. No unrelated production change is included. Pi passes
  its normal script with `--types node,bun`; CLI passes with
  `--typeRoots ../plugin/node_modules/@types,node_modules/@types --types node,bun`
  (CLI does not install its own Bun types).
- `bun run build:dists`: **4 loader tests**, **3 import probes**, OpenCode 1/2
  and Pi worker bundles emitted. CLI build: **401 modules**. No mutant was built.
- Plugin lint: **1,224 files checked**, no errors/fixes; two existing warnings
  (one unused import in the merged RPC handler) and two unrelated infos.

Independent mutation controls used staged live state and the exact
`NON-VACUITY BREAK` marker, a nonempty working diff, checkout/touch restoration,
then an empty working diff:

1. Restore a main-thread fallback only for pending v95 after worker failure:
   **“a worker that cannot load refuses pending v95 without a main-thread
   fallback”** alone fails because the promise resolves; **10 peers pass**.
2. Let current-only host access cold-migrate again: **“OpenCode 1 async boot
   records worker-load failure and refuses the primary transform”** alone fails
   because registration advertises five tools; the **OpenCode 2 peer passes**.

Restored worker/host tests pass. Detailed mutation output and diff-stat evidence
are included in the delivery declaration, not inferred from the green suite.

## S1 — offline map diagnosis and paired-backup repair

```sh
magic-context doctor git-fts-map
magic-context doctor git-fts-map --repair [--backup-root <directory>]
```

Diagnosis takes a read-only inventory snapshot and reports missing, mismatched
and extra map rows. Repair refuses active/uncertain holders, acquires IMMEDIATE
locks on **both** stores, rechecks holders, VACUUMs and quick-checks a backup
pair, then rewrites **only** the map inside the context transaction. The store
lock is rolled back without data changes. Backups explicitly require restoring
both stores or neither. Repair preserves the FTS corpus/rowids, rendered
metadata and migration ledger; both anti-joins and SHA storage classes are
verified before commit. Migration replay refusal names this exact command.

Three new tests introduce missing/extra/wrong-storage-class map entries during
the rewrite using disposable map triggers. They exercise the **real** verifier,
not its injected-failure seam, and assert rollback with the verified backup
retained. Each corresponding verifier mutation reddens only its named test
(**10 peers pass**). This demonstrates both anti-joins and the type check are
live controls. The existing holder, backup-before-write and FTS/ledger
preservation tests remain unchanged.

Fresh verification:

- Doctor/help run: **29 passed**, 129 assertions (Bun 1.4.2).
- Restored doctor tests: **11 passed**, 46 assertions.
- CLI lint: **135 files checked**, no errors; one unrelated warning/info.
- CLI tsc passes using the documented baseline Bun-type workaround.
- Actual emitted CLI under **Node v24.16.0 / SQLite 3.53.0**: **9 checks passed**.
  Damaged diagnosis exits 1, repair exits 0, post-diagnosis exits 0. Independent
  reads find ledger **94**, numeric FTS row **7 / 123**, integer map SHA, unchanged
  companion store and an empty pre-repair backup map. Driver lsof proves only
  throwaway context/store/backup files and sidecars were opened.

## S2 — unshipped v95 DDL preserves SHA storage classes

The map declares `sha BLOB`, SQLite's no-coercion affinity. v95 is corrected in
place: no conversion migration, v96 or store.db lane change. The numeric probe
`(rowid=7, sha=123, project_path='project', message='numeric legacy')` keeps
integer storage in FTS and map through first migration and lost-ledger replay.
Public text SHA `'123'` insertion/deletion leaves that numeric orphan alone,
matching the pre-v95 behavior. Repair verification also rejects equal-valued
integer/real pairs whose storage classes differ.

Fresh verification:

- Changing only the map DDL back to TEXT reddens **“numeric legacy FTS SHA
  survives migration and replay without matching a text SHA”**, with map type
  `text` instead of `integer`; **9 peers pass**. Staged-state/diff-stat/restore
  proof is in the delivery declaration.
- Restored migration/armed replay/v38/fence/tag-trim/public git API tests:
  **29 passed**, 652 assertions across seven files (Bun 1.4.2).
- `bun scripts/dump-context-db-schema.ts` regenerated the runtime schema into a
  disposable file. Independent comparison matches the committed **v95** fixture
  exactly (**1 comparison**). The continuation merge already carries that fixture
  and the original v95 index-sensitive Rust domain hash updates.
- **cargo 1.99.0** fingerprint test:
  `cargo test --offline -j 2 -p mc-module --lib domain_fingerprints_match_the_committed_schema_snapshot -- --nocapture`
  ran **1 test, passed**. It recomputes Rust domain hashes from the actual schema
  fixture. The project-owned git map is not a Rust domain table, so BLOB versus
  TEXT needs no additional domain hash change.
- `cargo fmt --all --check`: passed (rustfmt **1.10.0**).

The first `--locked` native check refused because isolated sibling path packages
advanced independently of the committed lock (subc-core 0.20.55→0.20.56,
subc-daemon 0.31.1→0.32.0, subc-os 0.1.5→0.1.6). The scoped check used temporary
offline resolution, then restored the staged original Cargo.lock. No dependency
or lockfile upgrade is part of this delivery; no network install was attempted.
