# Historian merge-turn trial

Investigative scripts only: no production behavior changes, publications or memory writes. All raw prompts, outputs, candidates and review material stay in the private temporary root. Commit only these scripts and the report; never commit a database, connection descriptor, credential or captured corpus.

Use the repository's installed Bun 1.4.2 dependencies from `packages/plugin`. Every shell invocation must have an outer `timeout`; dispatch long provider runs in the background. The root is fenced to `$TMPDIR/magic-context/merge-turn-trial-bg4916` (Node `tmpdir()` resolution). Do not pass a live store. The report distinguishes completed phases and must not imply a second-turn trial happened when it did not.

## Preparation

Create the root with mode `0700`; use read-only SQLite `VACUUM INTO` to copy `$TMPDIR/magic-context/memory-trials/trial.db` there as `trial.db`. Copy the same `~/.local/share/cortexkit/run/subc-connection.json` descriptor used by the importance-anchoring harness into the root (`0600`). This descriptor is the only service connection metadata copied; do not read live Magic Context/OpenCode stores or configuration. There is no local host to launch. Broca uses its existing provider credential path and normal service WAL retention. The trial identity's project root is the throwaway root.

```sh
timeout 60s bun scripts/historian-merge-turn-trial/prepare.ts
timeout 3600s bun scripts/historian-merge-turn-trial/run.ts "$TMPDIR/magic-context/merge-turn-trial-bg4916" 40 first
```

Preparation chooses exactly the forty newest recorded runs, removes only the one literal `<project-memory>...</project-memory>` span, and hashes both the original and stripped prompts. Whitespace outside the span is unchanged. The database retains no original system prompt or provider usage; the replay uses the checked-in production system golden and records its hash, with temperature `0.1` and a 32,000-token output ceiling as in the prior importance trial. Each first turn gets a fresh lineage; phase two continues that identical lineage.

The `first` phase needs no embedding credential: it records all first-turn outputs and stages independent top-20 BM25 candidates, without dispatching any second turn. Up to three cases run concurrently. Completed cases resume from their files; incomplete admitted runs are rejected rather than silently retried in an already-used lineage.

## Semantic preflight and second turn

```sh
timeout 3600s bun scripts/historian-merge-turn-trial/run.ts "$TMPDIR/magic-context/merge-turn-trial-bg4916" 40 second
```

This phase fetches only `apikey:openrouter` through the authorized `mc-e2e` vault helper in `packages/e2e-tests/src/live-providers/ckcred.ts`. It never reads a provider key file or live embedding config. Secret material remains in process memory. Vault read failure permits a documented BM25-only fallback; an endpoint failure or incompatible identity stops before turn two instead of silently degrading retrieval.

The supplied namespace is OpenRouter `qwen/qwen3-embedding-8b`, 8,192 max input tokens. The production embedding provider is used directly. Document self-checks use `passage` purpose (no prefix); fact queries use `query` purpose and the canonical production Qwen3 web-search instruction. No `input_type` overrides are supplied. The provider identity must exactly match the snapshot, and five evenly spaced active stored documents must each retrieve their own row as the top cosine neighbour before any second turn. These are fresh endpoint vectors, not stored-vector-versus-itself comparisons.

Candidate eligibility is snapshot status `active` and `created_at < run.created_at`. The snapshot does not retain status or content revision history: this is a timestamp-cut snapshot pool, not a provably exact historical status reconstruction. Report this limitation. Hybrid retrieval supplies fifteen cosine neighbours from covered rows plus the five highest-ranked distinct candidates from the staged top-20 BM25 lists. Embedded documents remain eligible for the lexical lane: literal names and constants can be useful despite lower semantic ranking. Scores are not combined as if on the same scale. BM25 uses Unicode word tokens, `k1=1.2`, `b=0.75`, and no stopword filtering. Each fact gets at most twenty distinct candidates.

The second prompt asks for one JSON decision per first-turn fact, with supplied IDs only and complete rewrites for destructive decisions. It explicitly requires preserving still-valid target information. Even zero-fact cases send a second turn, for honest cost accounting. No decision is applied to the database.

## Analysis and manual judgment

```sh
timeout 60s bun scripts/historian-merge-turn-trial/summarize.ts
timeout 90s bun scripts/historian-merge-turn-trial/review.ts "$TMPDIR/magic-context/merge-turn-trial-bg4916" first
# After second turns, use `second` instead of `first` (this embeds original facts).
timeout 60s bun scripts/historian-merge-turn-trial/inspect-review.ts "$TMPDIR/magic-context/merge-turn-trial-bg4916" first 0 10
```

`review.ts` prepares evidence, not judgments. Judge independently against candidates and, when needed, the entire earlier pool. For every second-turn decision retain correct/wrong/debatable plus a one-line reason in the report. List every wrong merge/replaces separately. Do not use model rationales or cosine thresholds as a correctness oracle.

The optional sixth argument of `inspect-review.ts` is `FIRST` or `ORIGINAL` to inspect only that fact set. Write independent annotations into the private root's `judgments.json`, with `decisions` and `originals` arrays. Decision rows contain `case`, `fact`, `grade`, `reason` and optionally `known`. Original rows contain `case`, `fact`, `duplicate` (`yes`/`no`/`debatable`), `reason`, and optional `firstFact`/`caught` linking an actually represented claim to a correctly judged non-new decision. Do not commit this raw annotation file.

```sh
timeout 60s bun scripts/historian-merge-turn-trial/analyze.ts
timeout 60s bun scripts/historian-merge-turn-trial/validate.ts
```

The analyzer checks all forty same-session continuations, completed provider steps, input hashes, every decision target/rewrite, complete and unique manual annotations, and supported catch links. It emits private summary and judgment ledgers, preserving missing usage counters as reporting gaps rather than claiming they were measured zero. A target-text check compares each chosen memory to the captured pre-run block and exposes current-content history gaps. Only reviewed aggregate results, explanatory examples and judgment/ID ledgers belong in the report.

For original outcomes, normalized-text equality to a historian-source row created within ten minutes after the run is an observed insertion candidate; earlier exact equality is a possible exact-dedup suppression. Later edits, missing source-session IDs, concurrent runs and absent publish audit records limit attribution. Do not silently equate unmatched output facts with skipped facts. Original-token estimates use the repository's Claude BPE estimator and are explicitly not Gemini billing counts. Replay usage comes from completed provider `step_finished` events; distinguish cached/uncached input, output and reasoning counters. Do not infer cache hits merely because the lineage is shared.

## Checks

```sh
timeout 180s bun run typecheck
timeout 60s bun test scripts/historian-merge-turn-trial/core.test.ts
```

No package changes, build outputs or generated production prompts are required. Raw artifacts are needed to continue the staged phases but must remain private and outside git until their root can be removed after review.
