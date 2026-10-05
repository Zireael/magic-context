# Rust hermetic drift: pre-cut admission regression

## Two-variable control, before any fix

Same `rust-fold-under-pressure.test.ts` test, current hermetic runner, Bun 1.4.2
(`744846f84`), OpenCode 1.18.32, release binaries built with Cargo 1.99.0 and
`-j 2`. The MC column selects both the plugin bundle and the module binary.
Daemon sources are detached worktrees of a private public-repository clone.

| MC revision | ck-subc ab4f6dfd (0.20.56) | ck-subc b5aba1a1 (0.20.57) |
| --- | --- | --- |
| 7068e095 | PASS: 1 test, 4 assertions | PASS: 1 test, 4 assertions |
| 1a2a63fb (worker's master baseline) | FAIL: native output admission | FAIL: native output admission |

The daemon change is not the cause. The old module was built against the green
run's commons `79788539ad67f0604463c21215f516a49ac07444` and subconscious
`ab4f6dfd264d765ab0783c1e345aa82ab0997ed3`; the current module uses its committed
registry/Git dependencies. The selected pressure test is unchanged between MC
revisions. The old source lockfile updates its path-package version labels to
the selected green sibling versions, just as Cargo did in that CI lane.

All runs used fresh roots below `$TMPDIR/magic-context/bg_134ac8c3a6b9bcc2/`.
XDG config/data/state/runtime, OpenCode DB, and MC storage were isolated.
`lsof -p <host pid> -Fn` snapshots listed only database paths below that root
(4–5 distinct snapshots per matrix cell; zero violations). No live stores were
opened. Retained raw logs and fixture databases are below that throwaway root;
build sources/binaries and the isolation driver are ignored E2E cache artifacts.

## Exact failures

The pressure-fold test fails at `rust.apply`, before any marker application or
durable fence, with `RustTransformProtocolError` / `rust_transform_protocol_error`:
`native output admission was not proven before marker application`.
Its full native output estimate is **43,736**, trusted, versus usable context
limit **23,000**. The mock model's unknown-model fit envelope doubles its fixed
system/tool floor: tools alone estimate **31,456**, system raw **3,567** and
prose raw **2,573**. This is not a malformed native history head or a lost daemon
request. The module completed its historian publication and returned
`SOFT / coverage_fold / scheduler=execute / committed=true`.

The separately run ctx-reduce test has the same pre-cut throw (estimate 43,734,
limit 23,000). OpenCode 2 fold cadence has the same throw followed by MC-S06
(`blocking-transform-error`); the historian publishes coverage, but no host
boundary is admitted, so its polling assertion says it never produced a boundary.
The failed CI log also contains **rust maintenance command contract**, shard 2,
in addition to the four reported names; it is included in verification below.

The sparse-gap test is different: the synthetic-only control advances to ordinal
140, then the real-gap control correctly refuses in the module's projection:
`coverage gap: live item ... (ordinal 85) sits at or below coverage end Some(140)
but no compartment covers it; composing m0 would silently drop it from the tail`.
That test already requires `applied=false`, `servedFrom=refused`, no provider
request, this exact coverage-gap diagnosis, and an unchanged ordinal-50 marker.
Its unconditional `await sendPrompt` aborts on the host rejection before those
assertions can execute. Expecting the rejection is a correction of test control
flow, not permission to serve uncovered content.

## Contract decision

The reviewer explicitly selected pre-cut **deferral**, not strict turn refusal:
a host cut is an optimization. A rebuilding output without proven local fit
must still be served as before the marker change, with no cut/fence, pending
target retained, and one fit-number diagnostic per pass. Admission proven on a
later rebuilding pass may cut. All existing post-cut fail-closed, durable fence,
restart/recomposition and final-fit controls remain required.

The regular fixed-floor regression was run before the production fix and failed
with the native-admission protocol error (then `RAW_FALLBACK_CONTEXT_LIMIT`).
It requires the fresh output to be served, no cut/fence, durable pending target,
SOFT+ retention, and eventual real host cut after room returns.

## Why the marker work missed it

Its admission unit fixtures used minimal tool definitions, system prompt 100,
and a 200k limit; its real marker fixture used a 1M window. None exercised a
healthy fold in a window smaller than the fixed tool/system fit floor. Its report
explicitly says the daemon was reused ck-subc 0.20.55. The matrix above proves
that daemon age did not cause this regression: both green and red daemon heads
produce the same MC-dependent result. The reused daemon and narrow marker-only
host selection were not equivalent to running CI's four drift shards. The
sparse-gap negative control's intended refusal was not explicitly awaited as a
rejection, so real host error-envelope behavior also escaped that coverage.
