# ck-mc silent stalls: live investigation (2026-10-07)

## Scope and evidence

This is a read-only investigation of the running module, not a store repair.
`ck-mc --version` reports `0.1.0 (5d7bce016dbd8942080c05e6485240ee84ff7bce)`;
PID **31541**, parent `ck-subc` PID **1266**. The request-path files cited below
are identical between that build commit and the investigation base
`1b47f42e3178ff8f5aa5f54815f9454d4ff648c3`. All timeline times are UTC;
macOS `sample` headers use local time, UTC+02:00.

The plugin log path was confirmed, not inferred from a repository filename:

```text
/var/folders/18/257zzylx4h1gbkcvs4cnpqqc0000gn/T/opencode/magic-context/magic-context.log
~/.local/share/cortexkit/magic-context/logs/magic-context.2026-10-07.log
~/.local/share/cortexkit/run/logs/subc.2026-10-07.log
~/.local/share/cortexkit/aft/logs/aft-24823.log
~/.local/share/cortexkit/broca/logs/broca.2026-10-07.log
```

No SQLite connection was opened against either live database. No store was
written, copied, checkpointed, or signalled, and neither live process was
signalled. Observations consist of log reads, `ps`, `lsof`, and `sample`.

## Important corrections to the initial hypotheses

1. **Both suspected Rust TRUNCATE checkpoints are test helpers.**
   `crates/mc-store/src/lib.rs:18033-18040` is `checkpoint_wal` inside its test
   module; `crates/mc-module/src/host_store.rs:3170` is in a seed helper in the
   `#[cfg(test)]` module starting at line 1980. Neither is on the production
   request path. Replacing them with PASSIVE would not fix a live stall.
2. **There is not a single synchronous request thread.**
   `main.rs:15` creates a single-thread Tokio control runtime, but
   `transport_handler.rs:75-110` puts data dispatch, JSON encoding, and ordinary
   transform followup on Tokio's blocking pool. The pinned SDK
   `subc-client-rs 0.26.1`, `src/lib.rs:86,1825-1883`, allows 64 concurrent data
   handlers. Health is a separate async task (`1887-1911`), not an OS thread.
   Background historian tasks **do** still run on the control runtime and call
   synchronous store functions there (`lib.rs:7463-7467`).
3. **A missing INFO timing record does not prove that a pass failed to complete.**
   `lib.rs:15953-15958` emits INFO only for
   `handler_total + response_encode >= 1000 ms`; faster passes emit DEBUG.
   The 10:11 pass's response has `handler_total=745.1 ms`. Its missing INFO
   `mc-pass-timing` is therefore expected if encoding was also fast.
4. **The plugin's `module` field includes handler followup.**
   `rust-mode-transform.ts:2795-2803` prefers `timings.handler_total`, falling
   back to `total` only if the former is absent. The 54 s wait in the original
   example is not hidden inside that pass's measured synchronous followup or
   store commit. Time before handler entry, after encoding, control-runtime
   starvation, daemon forwarding, and host decode/settle remain possible.
5. **Silence is not daemon-wide proof.** Broca and AFT activity also slowed in
   the original window, but subc kept accepting control routes. Queue timing
   and simultaneous stacks are needed to distinguish a shared routing problem
   from independently starved modules or machine I/O pressure.

## Original window, correlated across modules

| UTC | Observation |
| --- | --- |
| 10:11:20.226 | ALF plugin builds one tail-delta page. |
| 10:11:20.228 | ck-mc accepts ALF's 282,116-byte page. |
| 10:11:20.684 | ck-mc logs `pending drops held`, scheduler Defer. |
| 10:11:22.191, 10:11:34.019, 10:11:52.191, 10:11:56.807 | subc accepts routes to engram, prefrontal-core, engram, fusiform respectively. |
| 10:11:29.457, 10:11:31.133 | AFT idle-reap and retention work still logs. |
| 10:12:00.720 | AFT perf tick: oldest queued interactive work 37,470 ms, maintenance 34,065 ms. |
| 10:12:09.770 | subc receives degraded prefrontal-core health (`work.list_scoped` unreplied for 493,148 ms). |
| 10:12:10.511, 10:12:11.248 | subc accepts insula control routes. |
| 10:12:14.123 | ALF plugin logs waiting for identical final-page completion. |
| 10:12:14.748-14.750 | subc accepts a burst of prefrontal-host routes. |
| 10:12:15.383 | ck-mc accepts AFT's next transform page; preceding ck-mc log gap is **54.699 s**. |
| 10:12:15.384-15.385 | AFT completes queued tools: e.g. read total 52,134 ms, **queue 51,956 ms, execution 2 ms, egress 175 ms**; grep total 43,387 ms, queue 43,068 ms, execution 138 ms. |
| 10:12:15.385 | Broca `keep_warm stopped` logging resumes, after its last such record at 10:11:18.529 (56.856 s). |
| 10:12:16.273 | ALF plugin receives response: handler 745.1 ms, apply_once 649.9 ms, store_commit 63.3 ms, trigger 68.6 ms. |
| 10:12:16.345 | ALF plugin records elapsed 56,228.5 ms; response-wait/decode 54,173.9 ms; settle 1,870.1 ms; async LKG scheduling 3.7 ms. |
| 10:12:16.798 | ALF async LKG capture finishes (18.1 ms). |

These source records are plugin lines 49479-49481 and 49596-49619, ck-mc
lines 5099-5102, subc lines 8660-8697, AFT lines 18515-18533, and Broca lines
9335-9342. AFT here means both the session using ck-mc and, separately, the
tool module; a stalled context pass is not evidence that the AFT tool daemon
stopped handling every request.

The additional 120 s `subc transport: timed out after 120s` observation is
compatible with several layers. This investigation itself experienced that
tool error before the observer was launched. AFT also recorded this worker's
search at 10:24:48.484 with total 79,235 ms, **queue 78,414 ms**, execution
821 ms, egress 0 ms. A transport deadline alone does not identify subc as the
owner of the delay.

## Blocking-call inventory after `pending drops held`

Line numbers below refer to `crates/mc-module/src/transform.rs` (T),
`crates/mc-module/src/lib.rs` (M), `crates/mc-store/src/lib.rs` (S), and the
pinned published `cortexkit-store 0.2.1/src/lib.rs` (CS). The pinned dependency
sources were downloaded into the isolated worktree for inspection, without
changing Cargo dependencies.

**Common locking rules:** `store.db` is one SQLite connection protected by
`SqliteStore.conn: Mutex<Connection>` (CS:205-206). `with_conn` takes it at
CS:252; `with_conn_fenced` takes it at CS:282 and starts `BEGIN IMMEDIATE` at
CS:283-285, retaining the mutex through commit. The busy timeout is **5,000 ms**
(CS:394). That timeout bounds SQLite lock retries, **not** the Rust mutex wait,
statement execution, disk reads/writes, compression, or scheduler delay.
mc-store changes WAL connections to `synchronous=NORMAL` (S:7919 and
`single_store_domain.rs:74-86`). Default SQLite WAL autocheckpoint may run at
commit; it is not an explicit TRUNCATE checkpoint and does not wait out a
reader via the busy handler like TRUNCATE does. Checkpoint I/O can still cost
time.

`context.db` has separate process-local reader/writer mutexes
(`single_store_reads.rs:30-35`). Reads take the reader mutex, `BEGIN DEFERRED`,
execute the entire closure, and commit (`87-99`); the query-only reader's
busy timeout is **5,000 ms** (`69-73`). Writes take the writer mutex (`107-110`)
and call fenced `HostStore::with_domain_transaction` (`host_store.rs:997-1010`):
schema checks, privileged writer bracket, `BEGIN IMMEDIATE` at line 1063,
statements and commit. Its busy timeout is also **5,000 ms** (constant at
line 74, applied at 926-928). Both mutex waits are unbounded. SQLite lock waits
are per operation, not a whole-pass 5 s deadline. WAL readers normally coexist
with writers; `lsof` does not reveal a transaction's ownership of a WAL lock.

| Phase / synchronous call | Lock, blocking operation, limit | Executing thread |
| --- | --- | --- |
| T:4747 `pending drops held` and later tracing calls | Synchronous tracing subscriber/log file sink; file I/O or its internal lock can block independently of SQLite. | Data-handler blocking-pool worker. |
| T:4783-5080 selection, tag protection; T:5081 onward cloning/evolution; T:6431 onward build-output/fingerprints | CPU, allocation/deallocation, hashing and tokenization. Not a DB lock timeout. Serialized-output cache snapshot at T:6514-6518 takes its process-wide mutex; later replace at T:6965-6974 may evict/drop entries while locked. | Same data worker. |
| Bust-only composition / reconciliation: T:5446,5529-5555,5817,6004; `compose_additive_m0` T:2909-2955 | `load_compartments`, workspace/memory/profile reads use context reader transactions, plus cached host-boundary validation via store.db. Revert/truncate writes use both stores sequentially. Project-doc reads are synchronous filesystem I/O. Not entered solely because pending drops are held on a plain Defer. | Same data worker. |
| T:6920 `commit_transform` -> S:10725,10765 | Cache encoding/compression before locking; store mutex, fenced IMMEDIATE transaction, row/section CAS, identity/fingerprint diff, overlay/tag writes, scheduler/divergence/root-lineage trace writes, COMMIT and possible automatic checkpoint. No explicit checkpoint call. | Same data worker. |
| M:10710 `prepare_historian_fire` -> M:6258,6390,6424,6432 | `load_meta` (store mutex); `max_compartment_end_ordinal` (context reader, boundary-validation mutex/cache and store reads); pending drops/full cache-state reads (store mutex). Short live-historian, config and boundary-token cache mutexes; config and project resolution can read files. Boundary estimation/tokenization is synchronous. | Same data worker. |
| M:6539 / M:7068-7105 `record_no_fire`; M:6843 `record_fire_decision` | On changed diagnostics only: `commit_meta` (store mutex, IMMEDIATE CAS, COMMIT). CAS loser yields, but acquiring the mutex or SQLite lock still blocks. | Same data worker. |
| Historian fire-ready assembly M:6709; M:10728 `spawn_historian_firing` | Assembly reads persisted history/raw input and tokenizes synchronously; claiming the live session takes an in-memory mutex. Spawning does not wait for the model on ordinary Defer/Execute. Spawned task itself performs synchronous SQLite reads/writes between awaits. | Assembly on data worker; background drive on single-thread control runtime. |
| Emergency-only M:10625,10656,10686,10743 | Await existing historian / inline firing within remaining **20 s** followup budget (M:323,10562-10568). Host runner serves then folds instead of awaiting its model inline. Emergency may re-read meta and re-transform. Async timeout does not preempt synchronous SQLite or mutex work. | Data worker polls handler future; spawned drive on control runtime. Not the observed Defer branch. |
| M:10766 `store_projection_cache` -> M:5297-5340 | Synchronous retained-size walk, then `projections` mutex and replacement/eviction. No SQLite or checkpoint. Short guidance-date lock at M:10788-10792. | Data worker. |
| M:10798 native attachment / finalization | `native_attachments` cache mutex, native serialization, allocation, eviction. Legacy-only proof at M:10814 calls `reasoning_native_evidence.rs:25,75` (`load`, then `commit_meta`); immediate return when no legacy units (19-20). | Data worker. |
| M:10840 `trace_pass_completed` -> S:9089 | Store mutex, DEFERRED transaction, trace upsert/completion history, COMMIT. Error ignored **after** synchronous call returns; not fire-and-forget. | Data worker. |
| M:10847 retained-size accounting; M:10854-10863 `finish_ready` | CPU/deep charge; `transform_snapshots` mutex and ready-snapshot/lease-budget eviction. LKG-like request cache is RAM, not the host's durable LKG store. No SQLite. | Data worker. |
| M:10898 `respond_transform` -> M:15853,15868,15911-15924,15955/15957 | JSON metadata serialization, cached message-byte splice, allocation, tracing sink for `mc-pass-timing`. That record is emitted **before** transport receives bytes. | Data worker. |
| `transport_handler.rs:106-109` reply bound/page cache; SDK `send_handler_outcome` | `ReplyPages` process mutex; reply chunking/cache eviction, then async egress/channel credit and socket writer. Not included in `handler_total`. Socket progress needs the control runtime even when handler work already finished. | Reply bound on data worker; egress on control runtime. |
| Host LKG: `rust-mode-transform.ts:1679-1680,2384`; `lkg-persist.ts` | Scheduled with `setImmediate` for the observed async capture, then synchronous host context.db transaction/chunk diff. Shares the host SQLite admission/timeout policy, not ck-mc's store mutex. Happens **after** Rust transport returns. | OpenCode plugin JS event loop, another process. |

Additional serialization affecting earlier or other-session work: context
boundary validation holds `context_boundary_cache` while doing context reads
and subsequent store-body reads (`context_boundaries.rs:251-299`), tag baseline
and tag frontier caches have process-wide mutexes, and the tokenizer's history
count cache has a mutex. A full sync of another session can therefore compete
for store/context/cache resources; it does not execute through an explicit
TRUNCATE checkpoint in these production files.

Health at M:14219-14228 reads dispatch atomics and store-open status, plus the
runner-choice in-memory mutex (`5713-5719`). The comment saying no handler lock
is touched is broader than the implementation; the short runner-choice lock is
taken. Health does not checkpoint or query either live store. A healthy probe
does not guarantee data-handler or response-writer progress.

## Live capture 1: 15 s SQL/I/O pass, not the 55 s transport shape

Observer started at **10:29:05.942**, statting ck-mc's log and consuming complete
new plugin log lines every two seconds. A `stage=rust.wire_build` marks a
pending session until its transport completion/error or final `rust pass`.
After more than 10 s with no ck-mc log growth, it captures `lsof` for both DBs
and their WAL/SHM sidecars and runs `sample 31541 5`. It rearms on log growth,
stops at two captures or two hours, and restricts pending markers to the last
five minutes to avoid stale failed-pass markers. This detects candidates, not
only 55 s stalls.

Capture 1 triggered at **10:30:16.107**, observed silence 10.02 s; pending ALF
wire-build timestamp **10:30:04.480**. `lsof` and `sample` both exited 0. Sample
header: **12:30:16.219 local**, 2,333 samples per thread. The pass resumed
during sampling, so aggregate stacks include recovery work:

```text
main / Thread_22448039:
  2269 / 2333  tokio current_thread::Context::park -> mio::Poll -> kevent
  59           spawn_historian_firing -> run_historian_firing_on_host
               -> publish_pending_historian_run -> with_conn_fenced
               -> Transaction::commit -> pagerWalFrames -> pwrite

data worker / Thread_27924292:
  handle_transform_unpaged_value -> apply_once
    -> detect_boundary_divergence_candidate -> max_compartment_end_ordinal
    -> load_compartment_boundaries -> ModuleContextDomain::read
    -> rusqlite::MappedRows -> sqlite3_step
    -> vdbeColumnFromOverflow -> accessPayload -> readDbPage -> pread
  420 samples in load_compartment_boundaries; 630 pread leaf samples overall
  later: prepare_historian_fire -> assemble/read paths
  57 samples: trace_pass_completed -> SqliteStore::with_conn
    -> std Mutex::lock -> _pthread_mutex_firstfit_lock_wait -> __psynch_mutexwait
```

The structural SQL is **S:11612-11625**, called from
`max_compartment_end_ordinal` at **S:11662**. The leaf is a database page read,
**not** `sqliteDefaultBusyCallback`, a TRUNCATE checkpoint, or an external
writer lock. The brief mutex wait is precisely **CS:252**, reached by
**M:10840 / S:9089**. Concurrent main-thread stacks show the same process's
historian using the one store.db connection, a plausible internal mutex owner;
the sample does not expose mutex addresses to prove ownership of each sample.
No other process can own that Rust mutex.

Timeline:

```text
10:30:04.482  page accepted
10:30:16.107  observer trigger; sample starts 16.219
10:30:16.240  plugin: healthy probe, pass still pending, stall_ms=11760
10:30:19.320  pending drops held
10:30:20.039  historian firing queued
10:30:20.138  INFO mc-pass-timing: total=15062.0 handler_total=15650.9
10:30:20.198  plugin transport complete: 15717.5 ms
10:30:20.318  plugin final pass: elapsed=18382.1 module=15650.9 ms
```

This is an actual slow module pass, unlike the original sub-second handler /
54-second response wait. It is evidence for read-I/O/SQL cost in structural
boundary loading, not proof that those reads caused the original silence.

`lsof` users at capture time (FD suffix is access mode, not lock ownership):

| PID | Process | context.db | store.db |
| --- | --- | --- | --- |
| 11009 | `opencode serve --hostname 0.0.0.0 --port 9999` | open `u` handles, WAL/SHM | none |
| 31541 | ck-mc | two connections, WAL/SHM | sole listed user, WAL/SHM |
| 35046 | sqlite3 | `3r`, WAL `4r`, SHM `5u` | none |
| 74386, 79084 | Pi Node hosts | open `u` handles, WAL/SHM | none |
| 83195 | Magic Context Dashboard | read handles, WAL/SHM | none |

The already-running sqlite3 process was later identified by `ps` as
`sqlite3 file:.../context.db?mode=ro VACUUM INTO '<temp>/magic-context/pp-untimed/context/context.db'`
(13:15 elapsed at 10:31:52). **This investigation did not launch it.** It is a
potential competing I/O consumer / long reader, not an identified write-lock
holder. At capture the files were context.db 7,559,360,512 bytes, context WAL
161,429,872 bytes, store.db 1,207,152,640 bytes, store WAL 25,647,032 bytes.

Raw evidence is in the worktree's ignored
`node_modules/.cache/ckmc-stall-watch/`, not copied databases. SHA-256:

```text
stall-1.sample.txt d7a9778b85292b0bfae25092c19b1740ecc9e361be44d0f1cf62adbc23190d66
stall-1.lsof.txt   c001992b77ecbbcf973e4427c94499428964720a1de74c967ada237fa8f60e84
```

After the cross-module concern was raised, the observer was resumed at
10:33:22 with capture count one and the **original two-hour deadline**. The
next capture samples **both ck-mc and ck-subc concurrently** and saves bounded
tails plus size/mtime snapshots of other modules' daily logs. Only the observer
was stopped/restarted; no live module was signalled.

## Fix decision

No production change is justified by the first capture. In particular:

- Changing the two test-only TRUNCATE statements would pass a contrived
  reader test while never reaching the live cause.
- A lower busy_timeout would not bound the captured `pread` or Rust mutex
  waits, and must not be advertised as a whole-pass deadline.
- Ordinary data dispatch is already off the control thread. Background
  historian synchronous database work remains a control-runtime starvation
  risk, but the first sample shows it for a small part of the observation,
  not for 55 seconds.

The smallest supported follow-up is to measure structural boundary reads and
background store-lock hold times separately, and correlate handler completion
with SDK response enqueue/write and subc forwarding. A covering/index or cache
change for structural boundary reads is a different hypothesis from routing
starvation and must preserve host-coordinate validation against repaired rows.
A reader-held-snapshot regression is appropriate only after a runtime
checkpoint wait is actually demonstrated; the suspected checkpoints here
cannot provide that red-first control.
