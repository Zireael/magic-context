# Issue 641: OMP's context deadline can bypass managed history

## Finding and scope

**The invariant is broken on Oh My Pi (OMP) 18.8.6.** A context-handler timeout is fail-open: OMP ignores the missing replacement and sends its current messages. It does not cancel the extension's JavaScript or expose the handler timeout signal as `event.signal` / `ctx.signal`. Magic Context can subsequently commit state and capture an LKG representation which the provider never received. A generation-only stale-pass guard does not prevent those late state commits when no newer context invocation has started.

Terms: **LKG** is the last-known-good transformed request prefix; **MC** abbreviates Magic Context; **FTS** means full-text search; **WAL** is SQLite's write-ahead log. A **pass receipt** in the proposed design is a small turn-scoped record proving that our context callback completed successfully within its internal budget; it is not an acknowledgment from OMP.

This is a report-only investigation. No product code was changed. The incident facts—Windows, `cursor/grok-4.7`, OMP 18.8.6, plugin 0.46.1, 394.2 MB store, 573,414 input tokens, 148,608 dropped, marker at 06:55:14.194 and decision at 06:55:14.213 after the 06:55:13.641 timeout—come from **issue 641**, not from inspecting the reporter's store.

Two source revisions' Pi handler stages and writer-contention outcomes were measured:

* **Master at worker base:** `db0582e9c6b44ffafc7a10867ca4e6a24899e19e`.
* **Issue 640 review-fixes tip (bounded writer retries and per-session stale-pass protection):** `ff8d438a16ebbc3eae82acd29ea572731b086971`, materialized from this repository's Git objects inside this worktree's ignored `.cache/issue-641/` directory. The snapshot runner checks that `@magic-context/core/shared/sqlite` resolves into the snapshot, not back into master. No other checkout was accessed.

Unless explicitly marked as the issue 640 tip, all Magic Context `file:line` citations below refer to **master at `db0582e9c6b44ffafc7a10867ca4e6a24899e19e`**. Tip citations use the full `ff8d438...` revision's own line numbers; the same handler has different line numbers in those revisions.

Both advertise plugin version 0.46.1 (`packages/pi-plugin/package.json:2-3`). The real late-Magic-Context host probe used the worktree's prepared build, **not a byte-identical npm release tarball**. At master, decision writes wait for a later assistant message; the incident's row was reported immediately after the late transform. That timing difference is discussed in section 3.

Runs were local macOS arm64, Bun **1.4.2**, actual OMP CLI **18.8.6**, against the repository's loopback Anthropic-protocol mock. No Cursor/Grok service, Windows filesystem, production embeddings service, or real historian was used. The direct handler fixture supplies model metadata `cursor/grok-4.7`, a 256,000-token catalog window and 32,000-token output allowance. A direct `resolvePiWindowGeometry` check produced `usableSoft=224000`, `usableHard=251904`, `geometry=shared_upfront`: the intended 224k usable target, with the separate near-absolute emergency wall. The exact input/output of that geometry check is in `probes/issue-641/evidence/geometry.json`. Its measured synthetic wire is 579,298 estimated conversation + tool-call tokens; the provider-pressure sample is 573,414. This is similar pressure, not a reconstruction of the private conversation.

### Isolation and durable evidence

Every OMP run used a separate root under `$TMPDIR/magic-context/issue-641/`. `HOME`, `CFFIXED_USER_HOME`, `XDG_DATA_HOME`, `XDG_CONFIG_HOME`, `XDG_STATE_HOME`, `XDG_RUNTIME_DIR`, `OPENCODE_DB`, and `MAGIC_CONTEXT_STORAGE_DIR` pointed into that root. The probes also redirect the host's agent directory. The fixture uses only databases it creates itself. No live store was opened, read, migrated, or copied.

The host extension ran `lsof -p <host pid>` while the context handler was active and the parent captured it again before shutdown; both checks required nonempty `.db` descriptor lists entirely inside the disposable root. The captured databases are `agent.db`, `models.db`, `skill-descriptions.db`, `legacy-pi-extension-cache.db`, and `data/cortexkit/magic-context/context.db`, including WAL/SHM sidecars. The direct fixture process and independent Python writer lockers were checked too.

Committed evidence is in [`probes/issue-641/evidence/`](probes/issue-641/evidence/):

* `host-{slow,fast,refuse,late-mc,fenced}.json`: timestamps, handler signal observations, full outgoing request captures (including raw body), host events, state snapshots and served ledgers.
* `host-*-lsof.txt`: full descriptor receipts; each JSON also contains the handler-entry DB descriptor list.
* `late-host-replay.json`: the actual raw request and subsequent replay of the late, never-applied LKG prefix.
* `fixture-{master,issue-640-tip}.json`: all existing stage samples, SQL operation timings, table counts, state before/after the 30s deadline, writer-contention outcomes, and separately measured checkpoints.
* `*-markers.jsonl` and fixture/locker `*-lsof.txt`: synthetic durable marker and isolation receipts.
* `omp-source-excerpts.txt`: pinned npm source excerpts with original line numbers and SHA-256 hashes; upstream MIT license is alongside it. `receipts.json` records run roots and captured-body hashes.

These small receipts are committed outside `dist`, `target`, and caches. Hundreds-of-MB synthetic databases remain disposable and are not committed.

## 1. What OMP does on timeout

The requested runner lives in the pinned package at **`src/extensibility/extensions/runner.ts`**, not a file at this repository's root. All OMP line references in this section refer to `@oh-my-pi/pi-coding-agent@18.8.6`; the excerpts are preserved in the evidence directory.

* `runner.ts:130-143` defines a 30,000 ms default, a module-level value, and a `testSetExtensionHandlerTimeoutMs` helper. There is no supported extension API to configure the deadline. Importing or monkey-patching a test helper is not a supported solution, especially with the CLI's bundled runner.
* `runner.ts:293-368` races the work against an interrupt promise. Expiry aborts a **runner-private** controller and resolves the timeout sentinel (`:317-322`). It does not terminate the work promise. The extra `Bun.sleep(0)` race only gives cooperative cancellation a turn to settle; it is not a join of the extension.
* `runner.ts:1513-1540` passes that private signal to a scoped UI context / registration scope. `createHandlerContext` only overrides `ui` (`:267-279`), not `signal`.
* `emitContext` creates a context with no signal property and emits `{ type: "context", messages: currentMessages }` (`:1969-1995`). The outer operation signal is passed to the **runner**, not exposed to the context handler (`:1995-2003`).
* On timeout it logs/emits an extension error and returns `onFailure?.(...)` (`:1547-1561`). `emitContext` supplies **no** failure callback (`:2000-2002`), so this is `undefined`. Only a nonempty result with `messages` replaces `currentMessages` (`:2005-2018`).
* The final `signal?.throwIfAborted()` (`:2032-2035`) checks the outer operation signal. Aborting the private handler-timeout controller did not abort that operation. The SDK uses this array as its transform result (`src/sdk.ts:4147-4150`).

Thus OMP keeps the **current array entering the timed-out handler**, usually a clone of the original history. It retains edits by preceding extensions, and synchronous in-place edits to the shared array can also survive; it is not a rollback to pristine input. Our probe returns a replacement array only after sleeping, which isolates the ignored-return case.

### Actual host runs

All five were the pinned CLI in RPC mode, not a reimplementation of `emitContext`:

| Probe | Handler behavior | Mock-provider observation |
|---|---|---|
| `slow`, PID 69121 | Sleep 32s; return user text `MC641_TRANSFORMED` | **1 request at 30,089 ms** after prompt submission; contains `MC641_ORIGINAL`, not replacement text |
| `fast`, PID 72200 | Sleep 10 ms; same replacement | **1 request at 2,124 ms**; replacement text present, original absent |
| `refuse`, PID 79685 | At 25s append a refusal record and call `ctx.abort()` | **0 requests** |
| `late-mc`, PID 86408 | Delay 32s before calling the real built MC context handler | **1 request at 30,227 ms** with original text; MC starts/finishes after that request |
| `fenced` | Sleep 32s in `context`; a synchronous `before_provider_request` hook aborts if no managed receipt exists | **0 requests**, despite a context timeout; provider-fence audit records `managed=false` |

Prompt-to-request times include host/inspection work; they are not pure handler times. The fast control proves the replacement would have reached the provider if returned in time. The slow handler's entry/end receipts both report `eventSignal=false`, `ctxSignal=false`; its end arrives about 32,001 ms after entry. Host `extension_error` receipts name `handler timed out after 30000ms`.

The provider body still includes OMP's date/cwd reminder and API conversion. “Original” here means unmanaged user/history bytes, not an assertion that the entire serialized HTTP body equals `AgentMessage[]`.

`ctx.abort()` is a usable escape hatch: our 25s control establishes a pre-deadline refusal without an HTTP request. **Throwing alone is insufficient** because OMP also catches handler errors and continues. Magic Context already wraps escaped exceptions with display-only refusal plus `ctx.abort()` (`packages/pi-plugin/src/pi-context-refusal.ts:15-19,33-65`). A host timeout does not throw into that wrapper, so its refusal code never runs for the timeout itself.

The fifth probe also establishes a useful independent backstop. OMP exposes `before_provider_request`; it has its own handler dispatch (`runner.ts:2038-2073`) and provides `ctx.abort()`. A cheap synchronous dispatch fence can reject a missing/expired context-pass receipt even after OMP stops waiting. This is **not** permission to leave expensive work running or to extend the context deadline. The payload hook's own exceptions/timeouts are also fail-open; its fence must do no DB, network, dialog, or awaited work.

## 2. Where time goes on a large synthetic session

The fixture is schema-valid and entirely generated. `initializeDatabase` + migrations produce **106 SQLite tables**, including FTS shadow tables, versus the issue's approximately 90 tables. The large main file is **399,183,872 bytes** (399.18 decimal MB / 380.69 MiB), close to 394.2 decimal MB. It contains:

* 19,000 `memories` and `memory_embeddings` rows with 1,536-dimensional Float32 vectors;
* 12,000 `compartments` and `compartment_chunk_embeddings` rows with 3,072-dimensional Float32 vectors;
* 5,000 archive `message_history_fts` rows, plus automatically maintained `memories_fts`;
* the actual `message_fts_rowid_map_backfill_state`, `message_time_backfill_state`, and `tool_owner_backfill_state` tables, with unfinished synthetic backfill state;
* a 600-message user / assistant / tool-call / tool-result branch, approximately 573k-token pressure. A new user tail makes 601 messages for the search/wait lanes.

No unrelated “padding” table or copied live DB was used. Archive vectors/content occupy the same DB but are separate from the active session. This separates **total DB size** from **live-wire/session size**. The small control starts at 1,048,576 bytes with the same schema and wire. Default WAL autocheckpoint is 1,000 pages, page size 4,096 bytes.

The handler is `registerPiContextHandler` itself, including `withSqliteTransformPass`, not a stand-in compactor. Existing observer timers are collected (`context-handler.ts:792-813`, `context-perf-hooks.ts:14-34`). The deliberately slow historian is installed through the existing test hook (`context-handler.ts:452-461`); it is a never-settling promise, not a fabricated DB latency. A 30s timer separately snapshots state, simulating the host's stopped wait. That fixture timer does **not** cancel the pass. Real host fail-open behavior is established separately above.

### Whole-pass and writer measurements

Milliseconds, one measured run per lane/revision (not percentiles):

| Lane | Master | Issue 640 tip |
|---|---:|---:|
| Small DB, cold 600-message pass | 522.22 | 821.92 |
| Small DB, warm pass | 142.02 | 94.05 |
| Large DB, cold pass | 321.10 | 290.65 |
| Large DB, warm pass | 76.49 | 70.92 |
| Large DB, new user / auto-search enabled | 141.80 | 123.54 |
| Large DB, emergency with in-flight historian | **30,092.74** | **30,091.95** |
| Small DB, independent writer held; fresh session, no LKG | 329.37, refusal | **16,582.94**, refusal |
| Large DB, independent writer held; fresh session, no LKG | 300.68, refusal | **16,566.17**, refusal |

The two revision commands were concurrent local probes, not controlled isolated CPU benchmarks. Cold small-vs-large comparisons are confounded by process warmup/tokenizer caches; **they do not establish a speedup from a larger DB**. They do disprove “a 394 MB store alone necessarily costs 30s” in this generated workload. The long waits are distinguishable from those subsecond CPU/DB stages.

Writer outcomes are the real `PiStorageBusyError`, not a successful raw return. Direct fixtures omit `ctx.abort`, preserving the thrown refusal contract; the real-host abort controls above establish dispatch behavior. Issue 640's measured 16.57–16.58s wait agrees with its 16.5s ceiling. The follow-up task instructions also supplied a separate **19.1s** observed run; use that as a conservative operational observation, not a value produced by this fixture.

### Large-store existing stage timers

Milliseconds; cells are **master / issue 640 tip**:

| Stage | Cold | Warm | Auto-search | Historian-wait |
|---|---:|---:|---:|---:|
| `findSessionId` (includes project identity/tracking) | 32.24 / 26.23 | 29.26 / 26.42 | 30.61 / 27.00 | 32.38 / 29.71 |
| `getOrCreateSessionMeta` (successful admission) | 0.45 / 0.12 | 0.22 / 0.14 | 0.28 / 0.20 | 0.42 / 0.23 |
| `tag:identity` | 166.90 / 154.54 | 0.54 / 0.45 | 3.40 / 1.02 | 0.38 / 0.35 |
| `tag:tokenCounting` | 25.49 / 22.78 | 0.09 / 0.08 | 0.16 / 0.15 | 0.10 / 0.08 |
| `getTagsBySessionSnapshot` | 0.40 / 0.29 | 0.41 / 0.35 | 0.16 / 0.14 | 0.74 / 0.83 |
| `applyHeuristicCleanup` (includes reclaim) | 37.21 / 34.33 | 20.72 / 19.85 | 23.93 / 20.39 | 30.68 / 31.79 |
| `boundaryTriggerChecks` (historian wait lives here) | 0.01 / 0.01 | <0.01 / <0.01 | <0.01 / <0.01 | **30,000.87 / 30,000.04** |
| `autoSearch` | <0.01 / <0.01 | <0.01 / <0.01 | **55.34 / 48.30** | <0.01 / <0.01 |
| `tokenAccounting` | 24.97 / 19.38 | 1.02 / 0.98 | 1.44 / 0.95 | 1.06 / 1.06 |
| All measured synchronous DB operations, overlapping above | 91.64 / 84.50 | 3.99 / 4.65 | 19.39 / 20.90 | 8.57 / 8.86 |

Full, unrounded samples and all remaining stages are in the JSON receipts. Timer names overlap: `emergencyRecoveryBlock` also includes the historian wait; `runPipeline` includes tagging, reclaim and injection. Do not add them as independent costs. On refusal, `getOrCreateSessionMeta` never records a successful stage sample: the 16.5s missing interval is writer admission, not evidence of a fast failed pass. The logged `total` is also recorded before final LKG/served capture (`context-handler.ts:4037-4044,4085-4131`); the external wall timer is the outcome measure.

### Which work scales, and what is actually awaited

1. **Historian:** the emergency branch explicitly awaits the same-session in-flight promise for **30,000 ms** (`context-handler.ts:3278-3325`). Its child is not aborted by that wait. The historian's default runner timeout is **600,000 ms** (`pi-historian-runner.ts:163`; handler option wiring at `context-handler.ts:4558-4592`). A normal historian starts fire-and-forget after pipeline work (`:3561-3589,4510-4686`), but emergency turns synchronously join it. This alone consumes the entire OMP budget, before any remaining tagging/reclaim/capture work. Both measured revisions therefore miss the deadline even though their DB work is small. Whether an in-flight historian caused the private Windows incident cannot be determined from its two warn lines.
2. **Session/wire work:** parsing/fingerprinting/tokenization, tag creation, transcript building and reclaim operate on live messages/targets. Cold `tag:identity` is 155–167 ms here, versus under 1 ms warm. The scoped tagger derives a conservative live-wire floor (`context-handler.ts:2788-2796`; `storage-tags.ts:2124-2185`) and caches DB/version/floor matches (`tagger.ts:751-855`). It is not always a full session load. However the canonical `getPiTagSnapshot` / `getTagsBySessionSnapshot` path still loads the session tag set for active-tag heuristics and accounting (`context-handler.ts:6423-6433`); that can grow with total session tags even when the wire shrinks. Reclaim is included in `applyHeuristicCleanup`, not an independently timed 30s stage.
3. **FTS:** message-index reconciliation is scheduled from the context pass, not awaited (`context-handler.ts:2603,2782-2786`; `message-index-async.ts:250-278`). It can still contend for the writer / event loop later. Optional Pi auto-search **is awaited** on a qualifying new user tail (`context-handler.ts:3645-3709`; `auto-search-pi.ts:285-319,357-394`). It uses `unifiedSearch`, with message FTS and optional query embedding/vector retrieval. Its local search deadline is 3,000 ms (`auto-search-deadline.ts:1-14`), which must also fit the global pass budget. Our search lane exercised FTS with embeddings unconfigured: 55.34 / 48.30 ms; it did not benchmark an external embedding model's startup/network latency. One concrete DB-size-dependent foreground read was the physical FTS coverage proof: `message_history_fts_docsize EXCEPT message_fts_rowid_map`, followed by reading missing rows' session IDs (`message-fts-session-filter.ts:23-41,76-94`). It took **14.43 / 13.64 ms** over this fixture's 5,000 unmapped archive rows. That cached proof is invalidated by local writes/external commits; it can scale with the whole FTS inventory, not just the active session. The scoped message-content read took **0.41 / 0.40 ms**. Search also performed small model-ID/embedding-scope discovery queries, but no vector generation.
4. **Embeddings/backfills:** vectors merely sharing `context.db` do not imply every pass scans them. The ordinary fixture's SQL contains a small session-scoped compartment-embedding project-path repair, but no bulk vector loading or embedding generation. Normal project/session embedding drains are explicitly deferred before registration, coverage scans or model work (`commands/ctx-embed.ts:258-310`; hook wiring `index.ts:1582-1592`). Database-open backfills are scheduled/deferred by `storage-db.ts:1033-1098`; the fixture creates/migrates an explicit synthetic DB, so it does not pretend to benchmark that whole startup path. Existing unfinished backfill tables establish shape, not a claim that the maintenance ran on the foreground stack. Real background maintenance can still increase writer contention, dirty WAL volume and event-loop stalls.
5. **WAL:** normal setup enables WAL / `synchronous=NORMAL` but no explicit periodic checkpoint task (`shared/sqlite-context-pragmas.ts:12-24`). SQLite's 1,000-page automatic checkpoint can be paid inside a write/commit; the SQL timer cannot separate that component. We measured `wal_checkpoint(PASSIVE)` **after** each pass and deferred drain, outside foreground timing: large cold **3.72 / 6.84 ms**, large warm **0.06 / 1.93 ms**, large historian-wait **6.25 / 5.15 ms**. There was no explicit foreground `wal_checkpoint` statement in the recorded queries. A total DB-file size is not a checkpoint-byte count; dirty WAL size/readers/storage matter. Moving checkpoints out of the pass needs an explicit writer-aware maintenance policy, not just moving an existing timer that does not exist.

The evidence supports removing the synchronous historian wait as the first latency fix. It does **not** support attributing 30s to an unmeasured full embedding scan or FTS maintenance merely because the file was 394 MB.

## 3. What a late result changes

OMP only discards the return value. The extension remains alive, with its DB connection, mutable caches, timers and host session-manager API. There is no “host applied this context result” acknowledgment in the context protocol.

### Observed writes and representations

* **Real late host:** provider receipt is at `1791491856297`; MC's delayed handler starts at `1791491858384`, returns at `1791491858412`, and the LKG slot has `captured_at=1791491858412`. It lands one active tag, clears `last_transform_error` to the empty string, persists an LKG slot and emits a three-message served-ledger record despite the original unmanaged request already having completed. `host-late-mc.json` records all of these.
* **Actual replay of that receipt:** the coordinator accepts the subsequent branch, producing **five messages**: two MC history headers, tagged `§1§ MC641_ORIGINAL`, the real assistant reply, and a new follow-up. The captured provider request contained neither those MC headers nor the tag (`late-host-replay.json:19-65`). This is an actual replay from the late host's stored slot, not a separately synthesized LKG. The probe tests coordinator ancestry/content validation; it does not run a whole second host turn or the handler's separate envelope-fit check.
* **Large emergency fixture, both revisions:** at the simulated host deadline there are **601 active tags**, no new marker and no persisted decision row. After the pass completes approximately 92 ms late, **100 tags are dropped**, one synthetic compaction marker has been appended with `lastCompactedOrdinal: 3`, and the LKG has been captured/updated. The marker JSONL is an explicit durable fixture callback implementing the host append contract; it is not claimed to be a real OMP session compaction in this direct-handler fixture.

Persisted dropped statuses replay on later passes (`context-handler.ts:6203-6213,6290-6316`), and the handler can drain the deferred Pi marker through `appendCompaction` (`:7150-7277`). These are not a whole-pass transaction: even a later refusal cannot generally retract an already appended JSONL marker (`:7233-7246`). “Fence late writes” must mean preventing admission/publication in the first place, not rolling back a single surrounding transaction afterward.

The output boundaries are unambiguous:

| State | Current publication boundary | Effect after host timeout |
|---|---|---|
| Tag/source/drop/reasoning state | Inside tagging/heuristics/transcript work | Continues; later passes can replay statuses never applied on the timed-out turn |
| Marker / boundary bookkeeping | Deferred drain near end of pipeline | Can append a real host marker after OMP has selected the unmanaged request |
| Transform decision | Successful bust stages a decision; later assistant resolution writes it | Can describe discarded work or bind to a later assistant, not proof of host acceptance |
| Scheduler/reuse/channel/injection caches | Pipeline and post-pipeline success updates | Can advance as though the transformed prefix was served |
| LKG / served digest | Immediately before returning the replacement; deferred persistence afterward | Can designate a never-applied representation as “good/served” |

For decisions, this base has **deferred logging**: `context-handler.ts:3512-3554` stages a pending decision only when the pass busted and has an assistant snapshot; `:2549-2564` schedules later resolution. `transform-decision-log.ts:314-345,369-383` binds it to a later assistant and schedules the write. Thus the generated fixture's `transform_decisions` table remains empty; this report does **not** claim to have reproduced the issue's exact immediate 0.57s-late decision row. That row is incident evidence. The current source still lacks host acceptance as a condition for staging/publishing a decision. The difference between this checkout and the published incident build must not be hidden by the shared package version string.

LKG serialization detaches the returned output and deferred capture can supersede earlier pending captures (`pi-lkg.ts:468-480,719-753,836-960`). Replay checks raw-input digests, model/provider and branch ancestry (`:632-675`); the handler separately fit-checks replay (`context-handler.ts:4169-4190`). **None of those checks proves the host used the saved array.** The served ledger likewise explicitly means the array returned to Pi, not an HTTP acknowledgment (`served-array-ledger.ts:185-243`). The LKG/replay, usage-measurement and cache state can become inconsistent; this is not demonstrated SQLite structural corruption. A next pass may serve reductions the previous model never saw, move a compaction boundary, or misattribute provider usage to a never-served prefix. Those can violate cache/replay consistency even when the replay passes ancestry and size checks.

### Relationship to the issue 640 guard

At **`ff8d438a16ebbc3eae82acd29ea572731b086971`**, `context-handler.ts:2517-2546` creates a per-session generation token, checks it after guarded awaits, and consumes optional `event.signal` / `ctx.signal`. Writer admission and its retry callback are guarded too (`:2711-2773`). The shared writer helper has a 16.5s overall acquisition ceiling, short 25 ms attempts, yielding backoff, and abort-aware checks (`shared/sqlite.ts:678-682,873-940`). There is still a separate 250 ms in-pass writer lease, not another independent 16.5s allowance (`:630-650,715-747`).

A timeout in OMP 18.8.6 **does not replace the generation token** and **does not abort either exposed signal**, because neither is present. The tip's emergency-wait pass still takes 30,091.95 ms and publishes the marker/drops. This is measured evidence that the new guard alone does not cover issue 641.

A deadline-aware guard should invalidate on **generation mismatch OR cancellation OR monotonic budget expiry**, including deferred capture callbacks and writer admission/publication boundaries. Checking it only after the historian await stops some late writes but is too late to prevent OMP's unmanaged send. It also cannot undo earlier commits. Abandoned-pass error handling must not call the host's global `ctx.abort()` against a newer turn; cancellation/refusal must be scoped to the still-current operation, with late passes restricted to a discarded-result diagnostic.

## 4. Fix plan: one budget, fail-closed dispatch, and fenced publication

### Recommended design

1. **Start one monotonic clock at entry to our registered context callback**, before schema/claim checks and DB-independent snapshot preparation. Do not start it at the existing `transformStartTime` after early work. Carry the clock/generation/operation state through writer acquisition, pipeline stages, search, historian scheduling, deferred decision logging, marker publication, LKG capture and served bookkeeping.
2. **Resolve in the required order: fit-checked LKG first, bounded retries second, visible refusal last.** Writer admission already attempts LKG before backed-off waiting on the issue 640 tip (`context-handler.ts:2711-2773` at that tip). Preserve that order. Recovery must not need a successful writer admission; retain a detached good prefix and enough current model/envelope data to fit-check it under contention. A miss, emergency-disallowed slot, invalid ancestry/content or oversize replay is not permission to send raw messages.
3. **Remove the synchronous emergency historian join.** Let already published work participate in this pass; otherwise reclaim deterministically from available state, replay a fitting LKG, or refuse and let the historian publish for the next deliberate retry. A small optional join must consume remaining budget, not a fresh 30s. Prefer no join: our measured wait adds almost exactly 30s and dominates both revisions. Do not convert a still-running child into authority to mutate the abandoned foreground pass.
4. **Bound all work by remaining time**, not independent local caps. Abort/yield checks must run before mutation batches and inside writer admission; an expired pass must not append a marker, publish a decision, replace LKG, advance served state or flush an already queued capture. Give each deferred callback the captured pass token and expiry. Keep diagnostics about a discarded result separate from “applied transform” decisions.
5. **Use a cheap OMP `before_provider_request` dispatch fence** keyed to the active turn/pass receipt. On missing/expired/refused receipt, append a display-only refusal and call `ctx.abort()` synchronously, without SQLite or any awaited work. The `fenced` host control proves this can stop the unmanaged request after OMP's context timeout. An in-progress pass is not a receipt. A late pass cannot set a usable receipt after its deadline. Receipt checks must be turn/generation-specific, not a sticky session-wide boolean like the minimal probe.
6. **Surface the failure before aborting:** UI error notice plus display-only session entry, reason/stage/elapsed/attempt count and recovery result. Persist `session_meta.last_transform_error` best-effort when storage is available, but never block refusal on that write. Storage contention is exactly when that persistence may fail; a host-visible entry/log must exist independently. Do not mislabel an abandoned result as a successful drop/materialization.

### Combining issue 641 with the issue 640 writer wait

**Do not add a 25s pass timer outside an independent 16.5s retry loop and independent 30s historian join.** The join still guarantees an overrun; a writer released near the end of its allowance could be followed by another entire wait. Even without historian, a 3s auto-search allowance and recovery/capture work consume real headroom.

A defensible **initial** OMP policy, to be validated on Windows, is:

* Host handler deadline: **30s** (measured source/probe).
* Internal outcome deadline: **25s**, leaving **5s host margin**. Our real 25s abort control reached no provider, while a 32s hook did. This is a measured feasibility control, not a Windows worst-case proof.
* Normal work cutoff: **21s**, reserving **4s inside the 25s budget for bounded fit-checked replay or visible refusal**. A timeout is not followed by another full transform retry.
* Writer admission ceiling: `min(16.5s, work_cutoff - now - mandatory_completion_reserve)`, with a **2s initial reserve for mandatory remaining non-wait work**, never below zero. Clamp the helper's short SQLite attempt and backoff sleep to that allowance. LKG replay is attempted before this retry budget is spent.
* Optional search/historian-related work is skipped or cancelled when it cannot fit remaining time. The search's existing 3s local ceiling is subordinate to the shared cutoff. No synchronous historian join is the default.

Why these numbers: this fixture's largest non-wait handler wall time was **0.822s**, large cold was **0.291–0.321s**, and large search was **0.124–0.142s**. A 2s mandatory reserve is over twice that observed non-wait maximum. Issue 640's writer refusal measured **16.57–16.58s** here; the supplied **19.1s** operational run is substantially larger and must be respected. A single clock clamps late entry/retry overhead rather than assuming the nominal 16.5s translates to a 16.5s whole turn. For example, if preparation has already used 5s, admission cannot consume another 16.5s: with the suggested reserve it receives at most **14s** (`21 - 5 - 2`).

These are **candidate engineering budgets, not statistically proven upper bounds**. One synthetic Mac run cannot establish Windows p99 or an LKG replay/refusal worst case. Add stage distributions under CPU/I/O contention, large retained tails, model switches, held writers and embedding startup before fixing production constants. If replay itself exhausts its reserved allowance, refuse; do not restart acquisition or return an unfit prefix.

The global deadline must be checked using elapsed monotonic time even if a `setTimeout` callback ran late. Large synchronous SQLite calls/serialization/tokenization can block the event loop and cannot be preempted by a JavaScript timer. Chunk/yield those operations, bound DB query/batch work, and check expiry before commit/publication. Detached worker work must be cancellable or discardable. Just `Promise.race` around today's whole handler reproduces OMP's bug inside the plugin: it stops waiting without stopping writes.

### What OMP permits, and the remaining limit

Possible on 18.8.6: our own clock/controller, generation-aware guards, `ctx.abort()`, display entries/notices, and the independently verified payload-stage dispatch fence. Not exposed: the context handler's private timeout signal, exact remaining host budget, a supported deadline-setting API, or an acknowledgment that our returned array was applied. The issue 640 optional-signal guard cannot acquire a signal which OMP never puts on the event/context.

An internal clock **alone** is therefore only a best-effort fix, not the invariant. Pair it with the no-await dispatch fence; test that fence on every supported provider path, including retries, streaming, subagents and embedded ephemeral turns. Use an operation-local receipt only after a complete managed result is ready within budget. Fence/invalidity should abort the current dispatch, while a late old handler must neither abort a newer operation nor replace that operation's receipt.

For the strongest host contract, also request an OMP change: context handlers declaring themselves mandatory must cause the provider operation to abort on timeout/error; expose an operation-scoped signal/deadline and an applied-result acknowledgment. The extension's private controller being aborted is not enough. A failed/disabled/skipped payload hook itself must not silently reopen dispatch. Until a host fail-closed contract exists, the no-await fence reduces the concrete demonstrated hole, but cannot claim a mathematical guarantee under every host failure or event-loop failure.

### Cost and ordering

Engineering estimates below are planning estimates, not measured implementation effort:

| Option | Runtime effect supported by evidence | Estimated effort / tradeoff |
|---|---|---|
| Remove emergency historian join | Removes approximately **30.0s** of critical-path latency in both measured revisions | **0.5–1 day** plus emergency/retry tests; more turns may visibly refuse until the historian finishes |
| Thread a shared deadline through issue 640 admission and all waits | Caps writer + subsequent work as one allowance; normal passes here under 1s | **2–4 days** for audit and adversarial clocks/writer tests; earlier refusal under contention is intentional |
| Fence foreground/deferred decisions, drops, markers, LKG and served state | Prevents publishing a never-applied late pass; guards are cheap compared with work | **2–4 days**, overlapping deadline work; journal/DB ordering and partial commits require care |
| No-await pre-provider receipt fence + visible diagnostics | Real probe: raw request count **1 → 0** after context timeout | **1–2 days** plus provider/subagent/retry coverage; do not substitute an approximate payload hash for pass identity |
| Move/limit maintenance and use writer-aware checkpoints | Normal explicit checkpoint cost here only **0.06–6.84 ms** for the large store; may reduce contention elsewhere | **2–5 days** with WAL/readers measurements; moving already-deferred embedding drains alone will not remove this wait |
| OMP fail-closed mandatory-context API / signal / acknowledgment | Eliminates host-side fail-open contract rather than racing it | Upstream coordination plus several days of host tests; no local delivery-time estimate can promise upstream release |

The first four should be treated as one correctness change with tests, not a timeout-notification patch. A toast after an unmanaged request has already been sent does not restore the invariant.

## Reproduction and verification

From a prepared/buildable copy of this worktree, install the pinned probe host only into an ignored local directory:

```sh
mkdir -p .cache/issue-641/host
printf '%s\n' '{"private":true,"dependencies":{"@oh-my-pi/pi-coding-agent":"18.8.6"}}' > .cache/issue-641/host/package.json
bun install --cwd .cache/issue-641/host
bun docs/reports/probes/issue-641/host.ts slow
bun docs/reports/probes/issue-641/host.ts fast
bun docs/reports/probes/issue-641/host.ts refuse
bun docs/reports/probes/issue-641/host.ts late-mc
bun docs/reports/probes/issue-641/host.ts fenced
bun docs/reports/probes/issue-641/fixture.ts
bun docs/reports/probes/issue-641/snapshot.ts ff8d438a16ebbc3eae82acd29ea572731b086971
```

Run long commands through the agent shell tool with `background: true`, then wait with `bash_watch`; an ordinary terminal user can run each command to completion normally. Host runs stay local; no cargo was needed. The prepared build was supplied as passing by the task-giver. The pinned install installed 112 packages under `.cache`; Bun blocked two dependency postinstalls. The real CLI still ran and reported `omp/18.8.6`; no repository manifest/lockfile was changed.

`host.ts` prints its disposable root and keeps the host alive long enough to observe late completion. `fixture.ts` prints a separate `report.json` root. Pass the five host roots, then the master fixture root, then the tip fixture root to `collect.ts` to preserve their receipts. Pass the `late-mc` root to `replay.ts` to regenerate the coordinator replay evidence. The scripts reject evidence inputs outside the disposable task root. Keep the large generated stores out of Git.

Probe typecheck command (installed workspace TypeScript, no fetched runner):

```sh
bun packages/pi-plugin/node_modules/typescript/bin/tsc --version
bun packages/pi-plugin/node_modules/typescript/bin/tsc -p docs/reports/probes/issue-641/tsconfig.json
```

Run that gate on Linux. The source includes the probes and imported Pi/core code; Bun runtime success is not a substitute for this check. No full package test suite was necessary for a report-only change; no `OPENCODE_DB` was exported to one. The final scoped typecheck passed on Linux with TypeScript **5.9.3**, checking the five probes and their imported sources. Editor inspection was partial: its TypeScript SDK was unavailable, so the explicit typecheck was the authoritative gate.

### Required implementation acceptance cases

* 32s context work: **zero unmanaged provider requests**, loud refusal, and no late drop/marker/decision/LKG/served mutation; prove the HTTP capture, not only an error log.
* Writer released just before its local ceiling plus costly search/reclaim: outcome before the **shared** deadline, not “each stage below 30s.” Held writer without LKG: bounded visible refusal. Valid fitting LKG: replay before waiting. Oversize/model/ancestry mismatch: no raw fallback.
* Historian still running after 30s/600s: foreground never joins for 30s; publication is independently valid background work and only a later admitted pass materializes it.
* Newer context generation while an older pass waits; late catch/deferred capture: old pass cannot write state, publish a dispatch receipt, or abort the new operation.
* Event-loop stall past the deadline, retry/subagent/ephemeral request paths, and payload-hook error: no unmanaged dispatch through the fence. Pin actual OMP versions/provider adapters in these tests.
* Compare provider bytes with the purported served/LKG representation using the real provider capture; the successful late-host replay here shows why comparing an LKG to its own stored digest is not proof of application.
