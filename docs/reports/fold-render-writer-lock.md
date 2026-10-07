# Fold/refresh writer critical sections

## Reproduction and differential

`scripts/fold-lock-fixture.ts` creates two fresh, disk-backed WAL databases. Each
has 1,352 project memories (~700 characters each), 300 tiered history compartments
(~4 KB P1 each), a 2 MiB mural data URL, and 1,200 dropped tool tags. Refresh adds
30 memories and three compartments; defer replays the persisted prefix. The
OpenCode fold also executes the real legacy-tool conversion preparation/persist
path with 1,200 wire targets. No host database or configuration is opened. The
script runs `lsof -p <its own pid>` while each database is open, requires every
open SQLite store to be beneath its throwaway root, and prints the evidence.

The baseline hashes were captured from revision
`77a73237bf2cd6c42fce93d27b98f6ca4af0e19e` with timing instrumentation only. They
are **not** generated from the new renderer. The differential compares the entire
served injection results (including m[0], m[1], and image payloads), complete
`session_meta` rows, and complete ordered tag manifests. All six host/phase pairs
matched before/after; each persisted row includes the frozen mural, both byte
buffers, all watermarks, the memory manifest, and the trim boundary. The golden
hashes live in `scripts/fold-lock-fixture-baseline.json`. Hashing serialization of
Buffers covers their actual bytes, not a regenerated proxy for those bytes.

Run from the repository root, with a new root on every invocation:

```sh
mkdir -p "${TMPDIR:-/tmp/}magic-context"
root=$(mktemp -d "${TMPDIR:-/tmp/}magic-context/fold-lock-XXXXXXXX")
mkdir -p "$root"/{home,data,config,state,runtime,storage}
env HOME="$root/home" XDG_DATA_HOME="$root/data" \
  XDG_CONFIG_HOME="$root/config" XDG_STATE_HOME="$root/state" \
  XDG_RUNTIME_DIR="$root/runtime" OPENCODE_DB="$root/opencode-host.db" \
  MAGIC_CONTEXT_STORAGE_DIR="$root/storage" FOLD_FIXTURE_ROOT="$root" \
  NODE_ENV=development \
  bun --tsconfig-override packages/pi-plugin/tsconfig.json scripts/fold-lock-fixture.ts
```

Typecheck the diagnostic driver with
`packages/plugin/node_modules/.bin/tsc -p scripts/tsconfig.fold-lock-fixture.json --noEmit`.
The driver always prints writer hold time, including sub-threshold transactions.
Production step logs retain the existing one-second threshold. For the measurements
below the diagnostic threshold was temporarily zero in the worktree, **both**
before and after; the shipped threshold remains one second.

## Measured timings (milliseconds)

These are single disk-backed runs on a shared machine, not a throughput benchmark.
Commit/fsync latency and CPU scheduling are visibly noisy. `pre_*` measurements
are outside the writer hold; other columns are inside it.

| Site | Version | Held | m[1] render | Fold preparation | Stale check | Persist m[0]+mural | session_meta writes | Fold commit | SQLite commit |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| OpenCode fold | before | 46.8 | 6.5 | — | 0.4 | 1.7 | 2.0 | 2.8 | 33.4 |
| OpenCode fold | after | 118.3 | pre: 189.3 | pre: 1.3 | 1.6 | 1.9 | 1.8 | 2.2 | 110.8 |
| OpenCode refresh | before | 314.7 | 52.1 | — | 4.2 | — | 80.7 | — | 177.8 |
| OpenCode refresh | after | 31.6 | pre: 42.5 | — | 16.7 | — | 2.3 | — | 12.6 |
| Pi fold | before | 69.1 | 12.2 | — | 2.8 | 1.9 | 2.1 | — | 50.2 |
| Pi fold | after | 51.6 | pre: 62.5 | — | 0.6 | 2.5 | 1.6 | — | 46.8 |
| Pi refresh | before | 26.1 | 5.5 | — | 1.2 | — | 2.1 | — | 17.3 |
| Pi refresh | after | 23.6 | pre: 10.9 | — | 2.2 | — | 5.6 | — | 15.8 |

The final unmodified-threshold run held the writer for 155.7/79.8 ms in
OpenCode fold/refresh and 183.9/192.8 ms in Pi fold/refresh; neither defer acquired
a writer. These additional samples reinforce that absolute fsync/scheduling
latency is not a stable performance assertion. The structural tests enforce the
important invariant instead of using a flaky wall-clock limit.

The pre-render column includes its read-snapshot probe and serialization. Neither
defer acquires a writer. The synthetic fixture **does not reproduce the live
9,263 ms hold**. In this run, SQLite commit was the largest in-lock cost, not the
large-blob update itself or the fold callback. It would be unjustified to
attribute the live incident to rendering from these measurements alone. The next
slow occurrence now identifies `staleCheck`, `persistCachedM0`, `sessionMeta`,
`onFoldCommit`, and `commit`, separately from `pre_m1Render` and
`pre_onFoldPrepare`. No contention-wait time is counted as hold time.

## Code findings and concurrency contract

* The actual OpenCode `onFoldCommit` caller compared the old/new served prefix
  and converted legacy dropped-tool skeletons. It did **not** capture LKG or
  populate wire caches. Buffer/image comparisons and wire target traversal now
  happen in `onFoldPrepare`; a returned commit callback validates the exact tag
  row snapshot and writes only the prepared modes under the fold transaction.
* Both hosts rendered m[1] under `BEGIN IMMEDIATE` in **both** fold and soft
  refresh. They now render in a deferred read transaction, release that snapshot,
  and acquire the writer only for validation and writes. Pi's lock-time marker
  read fetches sequence/boundary/legacy fields, not the history bodies.
* The original m[0] stale check remains. The m[1] read snapshot has an additional
  probe including the additive-memory watermark. Omitting `maxMemoryId` is valid
  for m[0], but no longer valid for a precomputed m[1]. An addition before m[1]
  rendering can still appear in that delta; an addition after rendering cannot
  be silently lost. Memory expiry uses the same cutoff for both delta probes.
* Real two-connection WAL tests insert either a memory or a compartment after
  rendering and before writer admission. The first fold attempt is rejected,
  the next attempt includes the publication, and only the valid attempt commits.
  Soft-refresh tests assert rejection and exact preservation of the previous
  persisted row; the existing host degradation path handles that error.
* AST fences cover both hosts' fold and refresh entry points and reject renderer
  calls or read-render helpers after writer admission. Mutation proofs also
  neutralize each host's new fold delta CAS and show that the additive-memory
  test, but not the compartment test, goes red.
* The misleading `reason=unknown` came from logging the earlier HARD preflight's
  null reason even when a later m[1] pressure-backstop refold executed. OpenCode
  names that logging-only case `drift`; Pi uses the actual injection's `m0Reason`.
  A genuine soft refresh is named `soft_refresh`. No fold policy changed.
