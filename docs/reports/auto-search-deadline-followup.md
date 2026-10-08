# Auto-search deadline review follow-up

The accepted review and tests from `e0adb570de` were cherry-picked as `398bf75aa2`. All five counterexamples first failed on the original implementation and subsequently passed without changing their assertions. The bundle test setup adds `windowsHide: true` to its three subprocesses to satisfy the repository's existing Windows-console gate; its expectations are unchanged.

## Repairs

1. **Passage identity before persistence.** The RPC now transports vectors together with model id, registration generation, provider identity, runtime fingerprint, and dimensions. The worker compares that contract with its captured registration and query-vector dimensions before returning any passage vector to embedding backfill. Incorrect vector dimensions and non-finite values are also discarded. The original final-generation check remains an additional result fence, not the sole integrity check.

2. **Durable publication.** `auto_search_hint_decisions`, an existing JSON column in `context.db`, carries an internal `publication` object (`token`, `state`). A worker persists a `provisional` hint under `BEGIN IMMEDIATE` and waits on the same port/connection for the owner's timely publication command. A second `BEGIN IMMEDIATE` token-matched update marks it `accepted`. Direct reads, coherent replay snapshots, and Pi's independently loaded sticky projection all reject provisional entries and remove internal publication metadata from public decisions. Old entries without publication metadata remain accepted. No column, table, migration, dependency, or hint-text change is needed.

   A rejected provisional write is retired immediately off the turn path, including while its acknowledgement is delayed. The durable provisional state prevents other connections/processes from treating it as served in the interim. The same-worker handshake avoids an additional worker startup on successful turns. Cross-connection accepted SOFT replay and a separate-process provisional reader are both tested.

3. **Frozen skips.** The per-session/per-connection cache now retains a map of skipped message ids instead of overwriting one id. A durable-write failure on a second turn cannot erase the first turn's only freeze. A skip writer is counted successful only when its returned decision is actually `no-hint`.

4. **Cleanup fencing.** Background skip writers register shared cancellation flags. Session deletion cancels them before acquiring its deletion transaction. Workers check cancellation and the captured session row identity inside an `IMMEDIATE` transaction before appending, and do not recreate a row whose captured session has disappeared. Session cleanup also cancels queued writers. Writer deregistration is idempotent so a late exit callback cannot discard a newer writer's cancellation registration.

5. **Remaining-budget lock policy.** Search workers carry the original absolute deadline and refresh `busy_timeout` from the remaining budget after embedding continuations. Metadata writes and publication use that budget as well; best-effort background skips have a separate bounded 250 ms window. A normal 100 ms sibling writer hold no longer changes hybrid results into FTS-only results or reverses successful hint fragments. The owner still aborts its provider request and stops waiting at its deadline.

## OMP loader verification

The final Pi distribution worker was loaded by **actual OMP 17.0.4 extension initialization**, not merely a Node process with `harness=omp`. The probe used RPC mode, an open stdin pipe, no prompt, no tools/LSP/PTY/rules/skills, an isolated HOME/config/cache/session root, and no inherited credentials. The extension's factory started the real built `packages/pi-plugin/dist/auto-search-worker.js`, received the expected memory result, and exited cleanly. One actual loader/search check passed under Bun 1.4.2 (Node-compatible `process.version` v26.3.0).

Evidence is retained under `$TMPDIR/magic-context/auto-search-followup/omp-loader/omp-loader-evidence.json` and `host-output.txt`. The no-prompt factory is `auto-search-omp-loader.fixture.ts`. An initial EOF-based launch reached host readiness without invoking the extension factory; keeping the RPC input open and allowing isolated extension discovery reached the loader and worker. No model request was sent.

The imported bundle suite additionally tests built and packed entries on Bun and Node 24.16.0, OpenCode/OpenCode 2/Pi/OMP attribution, real independent writer locks, restart, retirement, and shutdown. Its ten variants each perform 18 worker checks, including the actual Pi host. `lsof` verifies all open database handles remain under each generated fixture root.

## Verification

- The five imported red tests pass unchanged; added provider/dimension, accepted two-connection SOFT replay, and separate-process reader tests pass.
- Full Pi gate: 1,625 passed, three skipped, zero failed (1,628 tests across 155 files).
- Latest full plugin gate: 7,336 passed, six skipped, one unchanged baseline failure (7,343 tests across 714 files). The remaining temp-directory policy failure comes from the previously existing raw API import in `packages/e2e-tests/src/rust-runner/hermetic-subc.test.ts`; no unrelated fix was made.
- Initial full-gate Windows spawn and late-commit retirement failures were fixed, not reclassified: Windows subprocess options were corrected, and rejected durable publications now retire promptly. Both pass in the latest full plugin run.
- Both TypeScript gates and lint/build gates were run with isolated logs and throwaway HOME. No live store/config/log was opened or modified during this follow-up.
- Safe staged mutation controls re-exposed provisional entries to a second connection and retagged a new provider batch as the captured generation. Each reddened exactly its named imported counterexample while the other four review tests stayed green; each mutant was restored before delivery.
