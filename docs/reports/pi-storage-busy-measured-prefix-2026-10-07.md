# Pi storage-busy refusal: measured-prefix lifetime

## Evidence and limits (before the fix)

Investigation used only the read-only logs at
`$(getconf DARWIN_USER_TEMP_DIR)pi/magic-context/magic-context.log` and
`$(getconf DARWIN_USER_TEMP_DIR)opencode/magic-context/magic-context.log{,.1}`.
No live database, Pi session directory, or user configuration was opened.
Source references below describe the pre-fix code at `f296fb15`.

### Why the scheduler's reading did not price the replay

For session `019de471-4fdc-762d-9286-624dfad0b5fe`, the Pi log records:

| UTC | Pi log line | Observation |
| --- | --- | --- |
| 13:20:07.081 | 34160 | Successful LKG capture, `reusedPrefix=1034` |
| 13:21:52.333 | 34241 | Raw-branch estimate 418211 set aside at `message_end` |
| 13:21:52.829 | 34252 | Scheduler retains 262355 tokens, 70.0%, defers |
| 13:21:53.096 | 34258 | LKG fit uses `host_metadata`, `measured_input=0` |
| 13:21:53.098 | 34259 | Byte proxy 378826 exceeds 375000; refuses |
| 13:21:53.099 | 34260 | Storage-busy refusal reaches Pi |

The set-aside path does **not** erase the reading. In
`packages/pi-plugin/src/index.ts:945-973`, a raw-branch estimate only calls
`noteRawBranchEstimateSetAside`; it does not update `lastInputTokens`. Provider
usage updates that separate scheduler state at lines 909-943. The retained
262355-token scheduler reading is not itself proof about specific served bytes.

LKG attribution has a different lifetime:

- `index.ts:2767-2784` observes provider usage before the reply is appended, using
  the real JSONL parent, independently of pressure persistence.
- `pi-lkg.ts:165-194` accepts only a complete successful reply matching the
  latest captured request's parent, timestamp, model, provider and sequence.
- `pi-lkg.ts:749-761` replaces `capturedRequest` on **every** successful context
  pass, without carrying forward its usage, even for identical output.
- `pi-lkg.ts:542-590` requires usage on that exact latest capture and the first
  pristine-tail message to be its matching reply. An earlier measured request
  cannot price a newer, merely appended capture. An unmeasured retry or
  recapture therefore loses its otherwise still-applicable measured prefix.
- `context-handler.ts:4097-4111` captures every successful managed pass;
  `:4168-4189` gives the replay's optional measurement to the fallback guard.
  `pi-raw-fallback.ts:346-386` then uses the full byte proxy when it is absent.

This is a reproducible Magic Context lifecycle hole, not erasure by the
set-aside branch. The logs do **not** record usage-correlation decisions,
request envelope signatures, or captured reply identities. They cannot prove
whether this particular capture lacked a provider reply or failed a
parent/timestamp/model/envelope fence. Claiming one of those exact causes from
the scheduler's aggregate reading would overstate the evidence.

### What held the writer

Neither the Pi log nor either OpenCode log contains a `sqlite writer` or
`slow write transaction` record in 13:21, or an overlapping hold reported in
13:22. The Pi failure is after `transcriptBuild` and before
`fallbackIdentityAndAdoption` completion (lines 34257-34260), but its original
exception site is not logged when the fallback fit itself refuses. **The lock
owner is not identifiable from the available logs.** A missing slow-write line
does not exclude shorter holds, uninstrumented writers, or an aborted writer.

The other Pi session, `019e8905-3b53-7442-b79f-4ee106474820`, has:

| UTC | Pi log line | Observation |
| --- | --- | --- |
| 13:21:41.884 | 34236 | Historian validation completes |
| 13:21:45.001 | 34237 | Eleven drops queued |
| 13:21:45.007 | 34238 | Publication reported complete |

The 3117ms validation-to-drop gap is **not** evidence of one 3117ms writer
transaction. `pi-historian-runner.ts:1408-1418` awaits the raw tag-key scan and
prepares candidate drops before `BEGIN IMMEDIATE` at line 1420.
`compartment-runner-drop-queue.ts:18-35` selects active candidates outside the
writer; lines 41-52 recheck and insert individual drops inside publication.
The atomic transaction ends at `pi-historian-runner.ts:1499`; line 1501 logs
committed holds of at least 1000ms (`shared/write-transaction-timing.ts:7-22`).
No such historian hold is recorded here. Publication was already complete
8.089 seconds before the refusal; it is not an evidenced overlapping holder.
There is no justified small lock-scope fix to make from these timings.

## Agreed fix boundary

Keep the last correlated provider-measured request separately from the newest
capture awaiting usage. Reuse it only while the exact measured served messages
remain the prefix of the new LKG output, with the same route and host envelope,
and its real reply still correlated to the original JSONL parent. Price the
measured input plus all messages appended since that measured request. A
rewrite, drop, rebuild, changed envelope, or missing measurement must retain the
existing fail-closed fallback. Do not modify served message bytes or storage
schemas. No lock changes are included.

The parent approved bounded incident attribution and explicitly required both
append-only reuse and earlier-byte divergence tests.
