# Temporal markers: legacy handoff, indexed state and lifecycle

## Review integration

The task branch merged master at `a8bc4b3b` and the requested unshipped v95
foundation at `6528bb96`. No new migration number was added. The immutable
review at `docs/reports/temporal-markers-review.md` remains unchanged.

The review's old-to-new fixture was ported into `temporal-upgrade.test.ts`
and the shared OpenCode temporal tests. These tests actually load the
pre-ledger production handlers from Git revision `114e9ff6`, serve a session,
close its database, reopen it with the current code and continue on a warm
deferred pass. The old handlers must first serve both literal `+5m` and `+10m`.
Pi's port reproduced the review's wire loss before the fix. OpenCode 1/2 kept
their wire text through incidental source replay, as the review reported;
their added persisted-choice assertions initially failed. This is not evidence
of an old-code handoff wire failure in OpenCode.

The fixtures archive only repository code into test-owned roots and link the
prepared dependencies. They do not copy any live store or implement a substitute
old handler. The test checkout must contain Git object `114e9ff6`; a shallow
checkout missing it fails explicitly rather than silently skipping this gate.

## Adoption without a new wire edit

Before tagging, an absent decision is classified using the existing session's
persisted tag identities. A historical identity adopts its already served
marker even on SOFT+. A new identity records a pending row instead; its freshly
minted tag cannot cause it to be mistaken for old-code history on the next pass.

For historical identities, the exact previous LKG projection takes precedence
over the current neighbour walk. OpenCode snapshots carry native message ids.
Pi snapshots use their output-entry ownership vector; pre-ownership snapshots
can still resolve `§N§` through the session's persisted tag owner. This protects
an upgrade coinciding with a cut: a prior `+5m` does not become empty merely
because the predecessor has disappeared. The LKG is consulted lazily only when
an unknown historical decision needs adoption, not on routine frozen replay.
The diagnostic served-array ledger is not needed or opened.

If no served projection can identify the message, adoption falls back to the
old code's current-array timestamp computation, as required by the handoff rule.
If the LKG proves that a historical message had no marker but the current walk
now discovers one, the new marker remains pending until a rebuild. Already
frozen empty decisions remain authoritative.

## Indexed storage in v95

`temporal_decisions(session_id, message_id, marker)` has primary key
`(session_id, message_id)` and is a WITHOUT ROWID table. `marker = ''` is a
final no-marker choice. `marker IS NULL` is a pending unmarked observation,
not an adopted timestamp decision; only a rebuilding pass can fill it.
Non-null choices are first-writer-wins, including empty ones.

The same existing v95 installer supplies the fresh schema and the migration.
When installing the table, it extracts prerelease `temporal-message-v1:` records
from the old miscellaneous blob and removes only those entries. That conversion
runs once, not on every open. Runtime reads use the table's primary key and only
the candidate ids on the current pass; they do not load or rewrite all historical
decisions. Legacy tag-owner probes use the existing composite tag index.

The shared session-owned table list includes temporal state after session-meta
deletion, preserving another harness's surviving metadata row if applicable.
Clone and fork filter and remap the row's message identity and preserve literal
markers, empty choices and pending NULL rows. The v2 fork regression exercises
the actual fork wrapper and excludes post-boundary state without deleting it
from the parent.

Permanent `message.removed` cleanup deletes exactly that message's temporal row
inside the existing immediate cleanup transaction. A cut, compression or branch
revert does not prune temporal state; off-wire choices remain available on revert.

`temporal_decisions` is not a ck-mc domain-write table, so it is not included in
the domain/privileged-bracket fingerprints. Their constants did not change.
The full context.db schema fixture was nevertheless regenerated with the named
`scripts/dump-context-db-schema.ts` generator to include the new table. The Rust
domain-fingerprint test passed against that regenerated schema.

## Shared runtime fixture

`testdata/temporal-session-parity.json` supplies one timestamped session and
literal model-visible user bytes. Pi and both OpenCode production transforms
compare their outputs directly to each other and to those literals. The actual
Rust transform/store pipeline consumes the same JSON fixture and checks the
same literals on both its initial render and replay. This is not an extracted
formatter or a comparison of a renderer to its own previous output alone.

Pi retains the inherited annotation policy for transport-only user messages;
the common fixture contains authored users. The previous blanket claim of
universal Pi/OpenCode temporal eligibility has been qualified rather than
silently changing legacy transport bytes in this cache repair.

## Real Pi checks

Both probe modes run Pi's actual 0.87.1 RPC CLI, the production context handler
and a local Responses provider. Every HOME/XDG/store/agent root is throwaway.
`lsof -p` captures assert that every database handle is below that root.

- `bun packages/e2e-tests/scripts/pi-temporal-drain-probe.ts --handoff` starts
  with the actual old handler, verifies that it stored no temporal decisions,
  terminates that host, then resumes the same journal/database in a new Pi
  process with the current handler. The warm handoff preserves cached m0/m1
  and all 69 existing input objects, 39,336 bytes.
- The ordinary probe still executes a physical drain followed by a deferred
  pass and compares every existing provider input object without normalizing
  content or fields: 19 objects, 13,492 bytes.

Before mutation testing, the successful handoff root was
`$TMPDIR/magic-context/pi-temporal-drain/host-SmCXbC/` (old/new PIDs 98,941 and
6,185), hash `7ec3edae2beabc8a8afcb87cac09727b448da7fe1603d0bdcb58f17ab3ea7ff2`.
The drain root was `host-Zh1JFg/` (PID 7,220), hash
`64d5a8bad81c60116fa5f51e3af26d54be81d2c5162f67ed0acd19439bb852ae`.
Both lsof captures list only their throwaway context.db, WAL and SHM.

The first handoff attempt failed during fixture loading because Pi's extension
loader relocated import metadata. The probe now explicitly supplies its worktree
repository root to the immutable-source fixture loader; the rerun above passed.
That unsuccessful attempt also used isolated host roots.
