# Offline reasoning-resend analysis

No product code and no model requests. Run from the repository root with the
installed Bun/SQLite/Python tools. The requested calibration file lives at
`src/hooks/magic-context/tokenizer-calibration.ts`, not `src/features/…` at this
revision; no compatibility file is needed.

```sh
timeout 7200s python3 packages/plugin/scripts/reasoning-resend-cost/snapshot.py
timeout 1800s bun packages/plugin/scripts/reasoning-resend-cost/analyze.ts \
  "${TMPDIR%/}/magic-context/reasoning-diff" \
  2026-09-27T00:00:00Z 2026-10-04T23:59:59.999Z
timeout 120s bun test packages/plugin/scripts/reasoning-resend-cost/analysis.test.ts
timeout 300s bun run --cwd packages/plugin typecheck
```

Use a background execution facility with a long timeout for acquisition/analysis,
not a foreground polling loop. Acquisition refuses an existing root. It executes
only `VACUUM INTO` against live OpenCode stores, then drops `credential`, `account`,
`account_state`, and `control_account` **from the copies**. To avoid a second
full-size disk rebuild, v1 copies are reduced to every message in the analysis
window and all their parts, then vacuumed. Nothing is sampled within that window.
Pi files are copied before reading; file metadata selects recently modified
sessions. Analysis refuses symlinks escaping the temporary root and copies still
containing any of the four auth tables.

`summary.json` and `pairs.jsonl` under the temporary root contain numeric counts
and step/session identifiers, **not** text, tool arguments, signatures or opaque
payloads. Do not commit raw transcripts or databases. After writing the report,
remove the entire temporary directory, including numeric outputs:

```sh
timeout 120s rm -rf "${TMPDIR%/}/magic-context/reasoning-diff"
```

## Estimator

- Consecutive assistants within a session, including assistants with errors or
  missing usage as boundaries (never bridge them). Pi follows `parentId`, not
  adjacency in an append-only file; compaction/context-edit/custom-message/model
  changes between steps invalidate a pair.
- Logical input is `input + cache.read + cache.write`. Default cache-prefix
  tolerance is 128 tokens; results also expose 0 and 512. This is a necessary
  screening proxy, not proof of complete byte identity.
- OpenCode 1 tool results come from step N's tool parts. User text between steps
  and Pi `toolResult` entries are new content. Tool **arguments** are output of N,
  not new content; independently tokenize them only on the text-fallback routes.
- Text is counted by MC's actual `estimateTokens` (ai-tokenizer **Claude** BPE),
  multiplied by `resolveModelCalibration(provider, model).proseRatio`. The static
  `toolsRatio` is for **tool definitions**, not result bodies. No residual/session
  scalar is inferred from the same input delta being fitted.
- Guess 12 tokens per tool-result wrapper and 8 per user wrapper. The intercept
  absorbs fixed wrapper/serialization mismatch. Tool-call generation versus
  replay tokenization can still differ. Images/files, unfinished tools, and new
  bodies over 100,000 characters are excluded before expensive BPE.
- Primary fit: positive reasoning, new body <=512 tokens, prefix gap <=128.
  Do **not** remove negative residuals or outliers just because they disagree.
  Also fit body <=128/2048, no-tool, new-user/no-user subsets and exact/looser
  prefixes. A model with fewer than three varying observations has no slope.
- Where reported reasoning is absent/zero but reasoning text exists, fit against
  calibrated stored text and subtract independently tokenized visible output.
  Never equate empty OpenAI summaries with zero encrypted reasoning.
- OLS `resent = k * reasoning + c`; uncertainty is a session-cluster sandwich
  normal-approximation 95% interval, **not** reliable with very few sessions.
  Spread also includes p10/p50/p90 per-pair `resent/reasoning` for reasoning >=64.
  Fits with a lag covariate test `k*latest + h*previous + c`; `h≈-k` would suggest
  replacing the previous block. Conditioning on intact caches can exclude exactly
  such replacements, so lag fits cannot prove history policy by themselves.
- Error sensitivity reports both a uniform 20% body-count perturbation and an
  adversarial per-pair ±20% body plus ±all guessed wrappers perturbation of k.
  These are scenarios, not measured error bars. Text-fallback output/reasoning
  counts have additional correlated uncertainty.

The script fails on unimplemented OpenCode 2 assistant shapes rather than silently
treating a v2 store as v1. See the report for the inventory and unsettled routes.
