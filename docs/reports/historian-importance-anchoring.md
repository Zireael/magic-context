# Historian importance anchoring: paired production-model trial

**Run:** 2026-10-05, on base `ee9d82912cd8105322672a1f5dd1bbb7172a2f46`. Investigation only; no product changes. The explanation for small historian chunks was removed from this investigation's scope by request.

## Bottom line

**There is strong evidence of numeric anchoring to session-reference importance, but not literal copying of the preceding score on every run.** On 30 real inputs, removing only those numeric attributes reduced first-compartment scores within ±2 of the real preceding compartment from **21/30 (70%) to 3/30 (10%)**. Replacing them with shuffled seed importances moved scores substantially and directionally toward the planted values. The fixed cross-project examples were unchanged in both interventions.

**D improves the reference band's coverage, but this trial does not show that it restores independently scored output.** Its first-score standard deviation rose only from **6.17 to 6.86**, and proximity to the preceding real importance stayed **20/30 (66.7%)**. Its larger all-compartment spread partly comes from changing segmentation. D should not be advertised as a demonstrated cure on these results.

Titles and P1 text **did change** between arms: none of B/C/D's 30 complete title arrays or P1 arrays exactly matched A. Most example topics remain recognizable, but neither verbatim stability nor semantic equivalence is established. This is a full historian regeneration trial, not a fixed-summary scoring-only test.

## Inputs, provenance and isolation

I found **recorded historian prompts**, rather than reconstructing raw message ranges. The copied OpenCode database contains retained hidden children in `session`, with user prompt text in `part` and model XML in assistant text parts. `historian_runs` and `subagent_invocations` contain range/importance/usage telemetry, not complete prompts; AFT's recent module-backed children were more useful than its older telemetry rows. Code also confirms that debug dumps are **responses**, not input prompts (`compartment-runner-historian.ts:1024–1044`), and successful-response cleanup is attempted at `:359`/`:407`.

Selection: the **ten latest distinct retained primary-model inputs per session** with exactly one output compartment, whose output start/end/title/importance matches a published compartment in the copied context store. Six recorded session references must be present and their newest score must match the real preceding stored compartment. Repair drafts, fallback-model outputs, multi-compartment outputs, duplicate input ranges and unmatched/unpublished attempts are excluded. This is a selected retained corpus, not random sampling of all runs or all historical days.

| Session | ID | Selected compartment sequences | Input dates (UTC) | Count |
| --- | --- | --- | --- | ---: |
| AFT | `ses_313660571ffeZTsf4koSJwk50Q` | 2066–2077, with gaps | October 4 | 10 |
| BROCA | `ses_114f158ccffet7znXAgI7lc3Kp` | 635–660, with gaps | October 2–4 | 10 |
| Magic Context | `ses_331acff95fferWZOYF1pG0cjOn` | 2155–2169, with gaps; includes 2160 | October 3–4 | 10 |

All original accepted outputs used `google/antigravity-gemini-3.8-flash`. A preserves the recorded **user prompt byte-for-byte**, including seeds, session references, project-memory block, chunk formatting and transcript guard. AFT's ten children also retained their role-system string; the other twenty use `COMPARTMENT_AGENT_SYSTEM_PROMPT` from the current production generated source. This is not a claim of complete historical provider-envelope replay for those twenty. B/C preserve every non-reference block; D preserves every block except the two example blocks. Prompt and system SHA-256s, input IDs/ranges, published IDs, scores and reference selections are retained in [the sanitized evidence](../../packages/plugin/scripts/importance-anchoring-trial/evidence.json).

Live databases were accessed **only by the mandated `sqlite3 "file:…?mode=ro" "VACUUM INTO '…'"` snapshot operation**. Queries used copied `context.db`/`opencode.db`; a copied `store.db` was inspected for schema but was not needed for replay. `credential`, `account`, `account_state`, `control_account` were removed from the OpenCode copy with secure deletion before use. Configuration was copied bytewise before parsing; no live configuration was changed. Snapshots were taken sequentially, not atomically across stores. All snapshots, staged configuration/authentication/connection files and raw input/output files were deleted after retaining sanitized evidence.

No OpenCode host was launched, and no compartment, fact or memory was published. Calls used Broca with a throwaway `project_root` under `$TMPDIR/magic-context/importance-trial/`, harness `importance-trial`, and a fresh lineage per cell. The existing Broca provider service retains its normal run WALs in its own store; that is distinct from the forbidden OpenCode/Magic Context stores and is not a throwaway provider daemon. The harness never reads or migrates those live forbidden stores during model execution.

## Model and experimental arms

The **copied** Magic Context config selects `historian.opencode.model = { model: "google/antigravity-gemini-3.8-flash", variant: "high" }` and `historian.temperature = 0.1`. It also has a separate module-model entry for Muse Spark; this trial uses the configured OpenCode primary and the model observed in all thirty accepted original children, **not** Muse or a cheaper substitute.

Dispatch followed the existing Rust producer's `session.send`/`session.subscribe` protocol (`crates/mc-module/src/historian_producer.rs:801–854`, `:966–979`): system and user roles separate, `tools: []`, temperature 0.1, max output 32,000. Broca version was **0.3.176**. No editor pass, validation-repair prompt or model fallback was used. Three independent cases ran concurrently, with A/B/C/D order rotated by case. Every final cell completed in one provider step with `finish_reason: stop`; none hit the length cap.

**Envelope gap:** the producer wire used here does not pass OpenCode's `variant: high`. Broca's resolved provider reasoning setting was not independently verified as the identical OpenCode high preset. All arms used the same dispatch contract; the results establish sensitivity of the configured model, not exact equivalence of the two host/provider envelopes. Provider usage reports substantial reasoning (see cost below).

| Arm | Reference treatment |
| --- | --- |
| A | Recorded prompt, unchanged: four seed examples and six recent session references. |
| B | Remove `importance="N"` from **session-reference compartment opening tags only**. Preserve seed scores, reference prose, transcript and all other attributes. |
| C | Replace those six attributes with a deterministic shuffled permutation of actual fixed-seed scores, taking six without replacement. The corpus spans **3–96**. Preserve all other bytes. |
| D | **Final requested design**, superseding the earlier six-reference proposal: three deterministic seeds, four newest content-bearing session compartments, three diverse older session compartments. All importance attributes retained. |

D uses the production band edges **85–100, 60–84, 30–59, 10–29, 1–9**. Count bands covered by the three seeds and recent four; choose from available uncovered bands first. Then choose from the least-represented available bands, updating representation after each pick. Ties use high-to-low production band order and the newest unselected older row in the band. Older selections are chronological, **before** the chronological recent four. There are exactly three seeds and seven rendered session references in every final D prompt. Empty boundary-only markers are not examples. This deterministic tie rule was an implementation assumption, not an embedding or relevance query.

Production's anchoring opportunity is explicit: `reference-retrieval.ts:159–214` renders the last six compartments with scores; its comment says the historian calibrates against its own prior scoring. `historian-prompt.source.md:121–159` gives the duration-based rubric, then tells the model to use seed/session references as calibration anchors and give a similar score when the new compartment feels like a reference. The Rust twin has the same six-reference window and band edges at `historian_prompt.rs:13–18`. Numeric sensitivity therefore has a plausible prompt-level mechanism; it is not evidence of a storage layer copying a previous value.

## Scores

Primary analysis is **one first output compartment per input**, since the suspected effect is across runs. All SDs are **population SD**. The denominator is always the same thirty inputs, including those that regenerate more than one compartment. The previous score is the preceding compartment's **real stored** importance, never A's regenerated score or a planted score.

| Arm | First-score min–max | Mean | SD | Within ±2 of previous real score | Single-output cells | Mean absolute first-score change from A |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| A | 52–76 | 69.50 | 6.17 | 21/30 = 70.0% | 29/30 | — |
| B | 35–88 | 70.30 | 11.10 | 3/30 = 10.0% | 28/30 | 6.93 |
| C | 5–88 | 56.17 | 20.35 | 7/30 = 23.3% | 29/30 | 16.20 |
| D | 52–84 | 69.37 | 6.86 | 20/30 = 66.7% | 26/30 | 1.80 |

The original retained outputs themselves had min–max **50–75**, mean **69.87**, SD **5.92**, and **21/30** within ±2. A's mean absolute difference from the original is **1.43 points**. That is useful baseline context, but not a same-time independent A/A replicate under an identical verified provider envelope.

| Arm | All emitted compartments | All-score min–max | Mean | SD |
| --- | ---: | --- | ---: | ---: |
| A | 31 | 52–76 | 69.58 | 6.09 |
| B | 32 | 35–88 | 71.00 | 11.12 |
| C | 31 | 5–88 | 55.13 | 20.81 |
| D | 34 | 40–84 | 67.74 | 9.08 |

Do not interpret D's 40-point minimum or 9.08 SD as the same first-compartment measure: some lower scores are second compartments from newly split chunks.

### By session: first-score spread / proximity

Each cell below is **min–max; SD; within-±2 count / 10**.

| Session | A | B | C | D |
| --- | --- | --- | --- | --- |
| AFT | 52–65; 4.15; 6/10 | 35–78; 14.63; 0/10 | 5–74; 20.88; 1/10 | 52–65; 4.57; 7/10 |
| BROCA | 60–74; 4.20; 7/10 | 55–88; 9.00; 1/10 | 38–88; 17.40; 4/10 | 58–84; 5.95; 6/10 |
| Magic Context | 72–76; 1.11; 8/10 | 65–82; 4.52; 2/10 | 38–80; 14.84; 2/10 | 62–76; 3.77; 7/10 |

## C: movement toward planted values

Use paired response change **ΔY = first(C) − first(A)**. The newest-reference intervention is **ΔX = planted newest − real newest reference**. These are real score changes, not merely correlations of successive outputs.

- C differs from A on **27/30** first scores; its mean change is **−13.33** points.
- **20/30** move in the planted newest value's direction (three have zero response change; seven move the other way).
- **19/30** end closer to the planted newest value than A did. Mean absolute distance to that target falls **11.87 points**; direction and closeness are different because a score can overshoot.
- Regressing ΔY on ΔX with an intercept gives slope **0.274** and correlation **0.460**: descriptively, about a 27-point response shift per 100-point newest-reference intervention.
- Using the **mean of all six** planted/real reference values instead gives slope **0.619**, correlation **0.416**, **20/30** directionally aligned changes, **16/30** closer responses, and **5.57 points** mean distance reduction.

This does **not** identify the newest reference as the sole causal anchor: all six attributes change together, the transcript topics are correlated, and newer-vs-mean targets are not independently randomized. Nonetheless the directionality plus the B ablation is evidence against purely content-independent numeric scoring. The 27/30 differences and non-unit slopes are also evidence against a literal unconditional copy rule.

## D: available history and what actually spread

Content-bearing older history has low-band compartments in **all 30 cases**, but very few in the lowest band for BROCA/MC. These are counts in the **eligible older pool**, excluding the recent four and empty boundary markers; ranges reflect the ten sampled cutoffs.

| Session | 85–100 | 60–84 | 30–59 | 10–29 | 1–9 | Cases with either low band available |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| AFT | 180 | 1,170–1,180 | 524–525 | 167 | 18 | 10/10 |
| BROCA | 81 | 451–473 | 73–76 | 25 | **1** | 10/10 |
| Magic Context | 214 | 1,520–1,534 | 371 | 44 | **1** | 10/10 |

D's **combined seed/session examples** cover all five bands in **30/30** prompts; A covers all five in **7/30** and four bands otherwise. Older low-band references are selected only when useful to coverage/representation: a diverse score below 30 appears in **16/30** D prompts, below 10 in **10/30**. A seed can already cover a low band, so the design does not force an older low-score example into every input. With only one genuine 1–9 example in BROCA and MC, those examples are repeatedly reused when selected.

Thus D demonstrably restores **input band coverage**, and there is a modest output-spread increase, especially inside MC. It does not demonstrate a large restoration of the **first-compartment output spread or de-anchoring**: the four recent references still have their original scores, and the observed first-score proximity remains high. D also changes example text, seed count and reference count together, so any score/content effect cannot be attributed to band coverage alone.

## Five side-by-side examples

These are actual response titles, shortened only in this display. Full title arrays and output ranges are in the evidence. Bracketed numbers are importance; `+` indicates another output compartment. Cases were chosen for topic diversity and contrasting effects, not as a representative statistical sample.

| Input / previous real score / C newest plant | A | B | C | D |
| --- | --- | --- | --- | --- |
| AFT seq 2077 / **67** / **27** | **65** Landed Trains 297 and 295, staged 300/301, triaged OMP delegation, purged 316 notes | **76** Landed Trains 297 and 295, staged 300/301, framed OMP delegation, pruned notes | **38** Staged Train 300 executor perf, landed 297 schema gate, settled Tier-2 inspect, mapped delegation **+ 24** Pruned 316 notes, landed 295, rebased 298 | **65** Staged Train 300 executor perf, landed 297, staged 301 worktrees, planned delegation **+ 45** Purged 316 notes, landed 295, pushed 298 |
| AFT seq 2070 / **64** / **4** | **52** Dispatched follow-up worker to isolate views migration test flake in Train 293 | **35** Isolated Train 293 view migration test flake and dispatched isolation follow-up | **5** Triaged Train 293 views test parallel flake and dispatched isolation worker | **55** Triaged Train 293 view test flake and dispatched shared-state isolation follow-up |
| BROCA seq 659 / **68** / **78** | **74** Landed proactive token refresh, isolated gate vault builds, decoded Claustrum provider_ids, absorbed subc 0.28.1 | **72** Landed proactive token refresh, fixed gate vault builds, updated decoder, absorbed subc 0.28.1 | **74** Merged proactive token refresh, isolated vault builds, adopted provider_ids, absorbed subconscious 0.28.1 | **72** Landed proactive token refresh, isolated gate vault binaries, absorbed subconscious 0.28.1 updates |
| MC seq 2169 / **74** / **17** | **73** v0.45.0 release execution, r7 present_tools settlement, #619 re-review, Claude Code fallback fix | **68** v0.45.0 release execution, present_tools settlement, #619 re-review, bridge gate fix | **42** v0.45.0 release execution, present_tools settlement, #619 re-review, role-preset bridge fallback | **72** v0.45.0 release execution, present_tools settlement, #619 re-review, catalog bridge safety fix |
| MC seq 2155 / **74** / **5** | **74** PR #603 cubic finding fix, merged PR audit, automated review-findings merge gate | **72** PR #603 bounded-provider fix, cubic audit, merge gate, AFT gh-shim policy | **50** PR #603 cubic finding fix, historical PR review triage, merge-pr.sh gate | **62** PR #603 cubic finding fix, merged PR audit, merge-pr gate enforcement |

**Text stability:** B, C and D each have **0/30 exact title-array matches and 0/30 exact P1-array matches** against A. All three differ on every full P1 body even where the topic and score remain similar. A/C/D split the first example differently. P1 body hashes and character counts were preserved for audit, not the full bodies; no semantic-equivalence assertion was substituted for exact equality.

## Cost and dispatch accounting

Kept trial: **120 completed cells**. Ten earlier D cells were superseded after correcting two harness defects; their spend is included below. One subscription-protocol pilot was cancelled and has **no reported usage**. Total admissions: **131**, completed/measured model runs: **130**. No automatic model retry/fallback loop was enabled by the harness.

| Reported tokens | Final 120 cells | Superseded 10 D cells | All measured 130 runs |
| --- | ---: | ---: | ---: |
| Uncached input | 11,936,018 | 1,003,643 | **12,939,661** |
| Cached input | 1,007,251 | 65,512 | **1,072,763** |
| Output, including reasoning | 982,737 | 67,355 | **1,050,092** |
| Reasoning subset of output | 740,912 | 50,002 | **790,914** |

Reasoning is already included in Broca output; it is **not** added a second time. Inputs are large because A retains the real project-memory prompt, not a cheap scoring proxy. Cache hits were opportunistic and not enforced equally across arms.

**Actual dollar debit is unknown:** the Antigravity route and returned usage do not supply a monetary charge/invoice. This is not a claim that the run cost $0. At an explicitly **illustrative**, not verified Gemini-3.8 tariff of $0.50/M uncached input, $0.05/M cached input and $3/M output, the kept cells cost **$8.97**, and all measured runs cost **$9.67**. A fully consumed additional pilot at its 32,000 output cap and the first input's size would add approximately **$0.15** at that illustrative tariff; its actual partial use cannot be recovered from returned telemetry. The experiment was bounded to thirty four-arm inputs, a small pilot and ten necessary D corrections, not continued until a preferred result appeared.

## Tool issues

- The large SQLite snapshot/scrub command hit a **120-second**, then a **600-second** timeout. `context.db` and `store.db` snapshots had completed. The second command had completed the 36-GiB OpenCode snapshot but was interrupted during a redundant post-scrub whole-file `VACUUM`, leaving a hot journal. Recovery and credential scrubbing were performed **on the copy only**, without another full vacuum. Disk pressure and size, not a model/data conclusion, explain these delays.
- Initial subscription used `from_seq: 0`; Broca returned `invalid_params`, naming the supported field `from`. The documented producer contract uses `from: "start"`. That pilot lineage was cancelled and not reused. Its missing usage is the small accounting gap above.
- D initially counted empty boundary-only markers, which the production renderer excludes. Also, a string replacement interpreted literal `$&` in historical prose, reinserting old reference blocks. Both defects were corrected before accepting final D evidence; **ten changed D prompts were rerun**, not all A/B/C arms. Final preparation verifies seven actual rendered references and unchanged transcript/memory/guard. The superseded runs are excluded from effect estimates but included in spend.
- The two new regression tests were non-vacuity-probed with staged-state mutations: removing empty-marker filtering failed only `D excludes empty boundary markers before counting and band selection`; restoring string-substitution semantics failed only `D preserves literal regex replacement syntax in historical prose`. Each filtered run had one failure and ten filtered-out tests. Mutations were restored before verification and commit.
- A workspace-root `bun -e` could not resolve the plugin's `jsonc-parser`; running from `packages/plugin` resolved the installed workspace dependency. No install or manifest change was needed. An initial scoped AFT snapshot was authoritative/clean. After the mutation probes its final snapshot remained partial for `core.ts` (no published diagnostics within the budget) and Markdown has no LSP producer; the final package/script `tsc` check passed. Tier-2 dead-code/duplicate analysis was unavailable in this worktree.

## Gaps and interpretation limits

1. Thirty inputs from three long-lived sessions are correlated and selectively retained. These descriptive estimates are not a population prevalence or a confidence interval for all historian runs.
2. Recorded user prompts are exact; twenty system prompts and OpenCode `high` provider-option parity are not independently historical-envelope-verified. Transport tools are disabled, so this trial tests prompt-only model behavior, not live tool-assisted historian execution.
3. No same-time A/A repeat and no fixed-title/P1 scoring-only control were run. Some differences are ordinary regeneration variability, and changed segmentation complicates all-compartment comparisons. The large B/C score effects, numerical directionality and much smaller A-vs-recorded score variation support anchoring, without proving every individual change is caused by an attribute.
4. C varies all six numbers together, and shuffled scores can contradict reference text. It demonstrates susceptibility to reference labels, not which label position dominates, nor that deleting attributes is a quality-preserving fix.
5. D broadens example inputs but also changes their semantic content. Its modest output improvement is not evidence of restored independent scoring. A subsequent controlled comparison should include repeat A/A noise and a fixed-summary scoring-only arm before making a stronger claim.
6. Dollar billing and the cancelled pilot's partial token usage remain unknown. Sanitized evidence is durable; copied databases and full prompt/output bodies were deliberately not retained in git or the temporary root.

## Verification

- Bun **1.4.2**: `bun test scripts/importance-anchoring-trial/core.test.ts` — **11 passed**, 28 assertions, zero failures.
- TypeScript **5.9.3**: `bun run typecheck` in `packages/plugin` — passed, including the script project (`tsconfig.scripts.json`).
- Final prepared inputs — **30** provenance-matched pairs; **120** reference-count assertions; transcript, memory and guard scope checks passed. Final analyzer — **120** completed one-step/stop cells.
- Sanitized retained evidence — **30 cases / 120 cells / 4,931 fields**, no forbidden raw prompt, P1 body, reasoning/event or credential fields.
- No new production build was needed: only the report and investigative harness/artifact changed; the worktree's setup build had already passed. Package manifests and lockfiles are unchanged.
