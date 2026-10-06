# Historian merge-turn trial — first phase complete, semantic continuation blocked

## Status and recommendation

**This is a partial experiment, not a verdict on the proposed merge turn.** All forty first-turn replays completed on `google/antigravity-gemini-3.8-flash`, with the recorded project-memory span removed and everything else in each user prompt byte-identical. All 139 emitted facts have top-20 BM25 candidate lists staged privately. **No second turn was sent.**

The matching embedding credential was obtained through the authorized `mc-e2e` vault helper, but OpenRouter rejected the document-vector preflight with **HTTP 402, insufficient credits**. The supplied embedding provider identity matched the snapshot. No document self-match succeeded; the first request could not produce a vector. Following the revised instruction, the first phase proceeded independently through Broca, while semantic retrieval and second turns remained blocked pending restored credits. No authorization to proceed with BM25-only second turns was given.

**Recommendation: do not change production historian behavior on this evidence.** The size reduction and first-turn re-emission are measured; retrieval quality, destructive-decision safety, duplicate prevention and combined two-turn cost are not. Resume the same forty lineages after funding, run the five independent document self-matches, then run and adjudicate the hybrid-candidate second turns. There is **no recommendation on semantic or lexical retrieval quality** from this partial delivery.

## Corpus, isolation and method

- Source: the supplied read-only `$TMPDIR/magic-context/memory-trials/trial.db`; 60 recorded runs, 3,362 project memories. A read-only SQLite `VACUUM INTO` created a private copy before analysis. No live Magic Context/OpenCode store or configuration was read.
- Cohort: exactly the 40 newest rows, ordered by `created_at DESC, child_session DESC`, spanning **2026-10-03 12:08:31.316 UTC through 2026-10-06 08:11:33.807 UTC**. Case 0 is newest, case 39 oldest. No case was filtered for output shape or fact count.
- User-prompt treatment: remove the single literal `<project-memory>...</project-memory>` span, not adjacent newlines, examples, references, transcript or guard text. Original, removed-block and stripped-prompt SHA-256s are retained privately. All forty prompts had exactly one such span.
- System: the snapshot does not retain sent system prompts. Replays use the checked-in production system golden, `crates/mc-module/testdata/historian-system-prompt.txt`, SHA-256 `f6a5a6dac2c8e29f0c4c54d3eb3c482b6159b9bfce76831cca01928de5ddc978`. This is **not** a claim of byte-identical original system prompts.
- Dispatch: the importance-anchoring harness's Broca `session.send`/`session.subscribe` connection-descriptor path, copied into the throwaway root; empty tools, temperature 0.1, max output 32,000, no fallback models or automatic retries. Three cases concurrently; each first turn in a fresh lineage. All forty runs completed with one provider step, `stop` finish reason and completed terminal event. The full first-phase invocation took 352 seconds, excluding the preceding 10-second pilot, which was resumed rather than repeated.
- Extraction uses the production compartment/fact parser. No replay output, compartment, candidate, decision or memory was published. Raw material and connection metadata remain outside git in the owner-private `$TMPDIR/magic-context/merge-turn-trial-bg4916/` root so the continuation can resume. Broca retains its normal service WALs; it is not a throwaway provider host.

### Memory coverage and historical-pool caveat

| Snapshot population | Memories | Embeddings | Coverage |
| --- | ---: | ---: | ---: |
| Active | 1,299 | 1,292 | 99.46% |
| Archived | 2,063 | 307 | 14.88% |
| All | 3,362 | 1,599 | 47.56% |

One vector namespace is present: `embedding-provider:567a42801637f21615239a4aa26ec0b6`; every vector is 4,096 float32 dimensions (16,384 bytes). Supplied metadata identifies OpenRouter `qwen/qwen3-embedding-8b`, endpoint `https://openrouter.ai/api/v1`, max input 8,192 tokens. The constructed production provider's identity exactly matched this namespace before the endpoint request failed.

The intended preflight embeds five evenly spaced active stored memories **fresh as documents**, with no document prefix, and requires each to rank its own row first. Fact embeddings use the production provider's `query` purpose and canonical Qwen3 instruction (`Given a web search query, retrieve relevant passages that answer the query` followed by `Query:`). No `input_type` override is configured. This exercises the same model-family query-prefix recipe used by memory search, without reading live configuration. **The five-match compatibility check remains unexecuted**, not passed by comparing stored vectors to themselves.

The staged lexical lists use **snapshot `status='active'` and `created_at < run.created_at`**, giving 1,180–1,298 eligible memories per run; equality and future rows are excluded. BM25 uses Unicode word tokens, `k1=1.2`, `b=0.75`, no stopword filter. The planned hybrid supplies fifteen cosine neighbours from covered memories and five BM25 neighbours from uncovered memories, up to twenty distinct IDs, without conflating cosine and BM25 scales.

**This pool is not a fully reconstructed historical pool.** The database lacks status-change and content-revision history. Parsing the captured memory block (dash bullets, not the historian output's star bullets) gives 1,213–1,312 rendered facts per run. Exact current-content matching maps 1,173–1,281 of these to earlier snapshot rows; **1–20 matched rows per run are archived now**, and up to 22 matched rows have a later update timestamp. Thus current active status demonstrably differs from what the historian saw then. These ranges are separate marginal ranges, not subtractable counts. A continuation must account for those membership/content gaps before treating any decision-quality estimate as a clean historical replay. The twelve known-fact examples below were individually checked against their actual captured pre-run blocks, avoiding that ambiguity for those observations.

## Effect of removing the block on turn one

| Measure | Recorded output | Stripped first turn |
| --- | ---: | ---: |
| Runs | 40 | 40 |
| Facts | 131 | 139 |
| Mean facts/run | 3.275 | 3.475 |
| Compartments | 50 | 52 |
| More / fewer / same facts than recorded | — | 13 / 11 / 16 runs |
| Exact normalized-text matches to earlier active snapshot memories | 0 | 0 |

Fact count increased **6.1% overall**, but the content changed more than that count suggests. Case 27 went from three facts to eleven; cases 32 and 34, originally fact-free, each emitted two facts; case 19 went from one fact to none. This is one stochastic replay per historical run, not a paired fresh full-memory control, so differences are not attributable exclusively to memory removal. System-version changes and generation noise are additional confounders.

Independent reading found **at least twelve of the 139 first-turn facts (8.6%) re-expressing knowledge actually present in their captured pre-run blocks**. None is an exact normalized-text duplicate. This is a conservative, documented lower bound, **not** a comprehensive semantic duplicate rate or an estimate of what turn two would catch. The twelve coordinates are `case:fact`: `1:1`, `11:1`, `11:4`, `16:1`, `21:1`, `24:2`, `26:1`, `27:1`, `27:2`, `30:1`, `30:4`, `31:1`. The `11:1` claim combines knowledge from two older memories; it does not imply one `skip #N` can cover the entire fact.

### Representative fact/candidate examples (not second-turn decisions)

The text below is summarized for explanation, not a retained prompt or output corpus. “Covered” is my comparison to the pre-run knowledge; it is **not a model decision**. Every cited target was both eligible under the timestamp-cut pool and verified in that run's captured block. No rewrite has been tested or applied.

| Case:fact | First-turn claim, summarized | Earlier memory | Manual comparison and one-line reason |
| --- | --- | --- | --- |
| 1:1 | Verify quantized-model bug claims before accepting them or promising guidance/tool changes. | #24495 | Covered: the earlier rule already requires mechanism verification and operator approval for promised changes. |
| 11:1 | Historian uses 3 seeds / 4 recent / 3 diverse references, hiding recent importance scores. | #23987 + #23996 | Covered by the pool jointly: selection layout and selective score hiding were already stored separately. |
| 30:4 | Do not bypass AFT's `gh` security shim through PATH manipulation. | #23407 | Covered: the older merge-PR rule explicitly forbids routing around shim governance with the real binary. |
| 11:4 | `store.db` uses `PRAGMA synchronous=NORMAL`. | #23997 | Covered: the older constant covers both TypeScript and Rust WAL connections for both stores. |
| 16:1 | Use configured git author identity and the Alfonso co-author trailer. | #15874 | Covered: the earlier memory already includes that identity, trailer and structural hook mechanism. |
| 21:1 | Smart notes are a stopgap until Basal flows; keep them working but add no capabilities. | #23806 | Covered: this is a shorter restatement of the standing smart-note investment restriction. |
| 24:2 | ck-mc logs use daily magic-context log files and `CK_LOG`, not `RUST_LOG`. | #23678 | Covered: the path, daily naming and filter variable are all already present in the older fact. |
| 26:1 | Preserve young split dist chunks and never deploy with destructive directory replacement. | #16288 | Covered: the old rule already mandates merge deployment and one-week chunk retention. |
| 27:2 | Visible OC2 transcript tags should be linked to upstream #53019. | #23505 | Covered: the prior rule already names the upstream issue and user-reply guidance. |
| 23:2 | Projection cache is 288 MiB per entry / 384 MiB total. | #23697 | Changed value, not duplicate: the older memory says 256 MiB total; any future update needs to preserve still-valid eviction/attachment details. |

The remaining three covered coordinates are `27:1` (merge-not-replace dist deployment, #16288), `30:1` (`merge-pr.sh` for external PR review gates, #23407), and `31:1` (resolve all bot review threads before external merge, #23407). Their meanings are already included in their targets; no new constraint is needed to express those first-turn facts.

## What actually happened to the recorded facts

| Attribution check | Count |
| --- | ---: |
| Original emitted facts | 131 |
| Exact content match to a historian-source row created within ten minutes after its run | 104 |
| Distinct matching new row IDs | 104 |
| Exact content match to an earlier snapshot row | 0 |
| Original facts without either attribution | 27 |

Normalization is production lowercasing, whitespace collapse and trim. The 104 matches are **observed insertion candidates**, not a complete publication audit: the snapshot omits parent-source-session attribution, publication times, status history and old content revisions. Twenty-seven unmatched facts must not be called “dedup skips”; delayed publication, unpublished output, later edits and deletions cannot be disambiguated here. The ten-minute window and exact-content criterion deliberately make this an auditable lower-bound attribution.

The requested comparison—**how many duplicate memories exact dedup inserted that the second turn would prevent—remains unavailable**. A first-turn known-fact example is neither proof that the historical output created that duplicate nor proof that an unrun second turn would recognize it. In particular, the 12 known first-turn facts are not a substitute for this comparison.

## Second-turn quality and destructive decisions

| Requested action | Decisions observed | Correct | Wrong | Debatable |
| --- | ---: | --- | --- | --- |
| `new` | 0 | Not measured | Not measured | Not measured |
| `skip #N` | 0 | Not measured | Not measured | Not measured |
| `merge #N` | 0 | Not measured | Not measured | Not measured |
| `update #N` | 0 | Not measured | Not measured | Not measured |
| `replaces #N` | 0 | Not measured | Not measured | Not measured |

**Wrong merge/replaces inventory: unmeasured because no such decisions were generated.** This is not a zero destructive-error result. Per-decision judgments and one-line reasons must be supplied after continuation, including review against the whole earlier pool rather than accepting the model's rationale or only its selected target. The harness requires supplied target IDs and complete rewritten text, but schema validation alone does not defend against lost information.

## Tokens and cache

The original snapshot has user-prompt text, not provider usage. Original sizes below use the repository's Claude BPE estimator, explicitly **not Gemini billing counts**. The same estimated current system prompt is added to both size comparisons; the true original system and its size are unknown.

| Input-size comparison across 40 runs | Tokens | Mean/run |
| --- | ---: | ---: |
| Original recorded user prompts, local estimate | 4,201,947 | 105,049 |
| Removed memory spans, local estimate | 3,461,315 | 86,533 |
| Stripped user prompts, local estimate | 740,552 | 18,514 |
| Current system prompt, local estimate | 600,120 | 15,003 |
| Original user + current system, local estimate | 4,802,067 | 120,052 |
| Stripped user + current system, local estimate | 1,340,672 | 33,517 |

Memory is **82.37%** of the recorded user-prompt estimate in aggregate (per-run range **77.42–85.95%**). Removing it reduces estimated user-plus-current-system input by **72.08%** before any second turn. This cohort's range is measured independently; the initial 61–92% description is not assumed as an input to the calculation.

| Provider-reported replay usage | First turn total | Reporting runs | Second turn |
| --- | ---: | ---: | --- |
| Uncached input | 1,211,777 | 40/40 | Not run |
| Cached input | 159,558 | 10/40 | Not run |
| Cache-write input | Unreported | 0/40 | Not run |
| Output counter | 377,933 | 40/40 | Not run |
| Reasoning counter | 280,542 | 36/40 | Not run |

Sum of reported uncached and cached input is **1,371,335**, or 34,283 per first turn. Reported cached tokens are **11.64% of that reported input total**. Omitted cache fields are unknown, not proven zero; the ratio is a reported-counter share, not a fully observed cache-hit rate. Ten fresh lineages already reported cached prefix input, consistent with cross-run common-prefix caching; that does **not** establish same-lineage second-turn caching. Output and reasoning counters are retained separately, not added into a fabricated total. No USD total is claimed without verified billing semantics and original usage.

**Combined turn-one + turn-two tokens and cached-input share are not measured.** There is no measured net two-turn saving or cache-amortization claim yet.

## Per-run first-phase ledger

Local BPE columns count only user-prompt text; reported input is the provider's **uncached** counter, including the replay system. “Inserted” means exact-content/time-window attribution, not adjudicated non-duplication. Cached counters are included in the aggregate above, not in this uncached column.

| Case | Original facts | Stripped facts | Original user BPE | Stripped user BPE | Reported uncached input | Original inserted candidates |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 1 | 1 | 104255 | 15411 | 30877 | 1 |
| 1 | 5 | 5 | 111014 | 22451 | 38205 | 5 |
| 2 | 4 | 2 | 109457 | 21102 | 36825 | 4 |
| 3 | 3 | 3 | 107463 | 19266 | 35031 | 3 |
| 4 | 4 | 3 | 105966 | 17769 | 33474 | 0 |
| 5 | 4 | 4 | 108127 | 20267 | 36004 | 4 |
| 6 | 5 | 5 | 108936 | 21076 | 36817 | 0 |
| 7 | 3 | 4 | 107352 | 19608 | 19080 | 3 |
| 8 | 2 | 4 | 107976 | 20285 | 36232 | 2 |
| 9 | 4 | 5 | 108538 | 20847 | 36928 | 0 |
| 10 | 6 | 4 | 112918 | 25494 | 41684 | 6 |
| 11 | 3 | 4 | 107231 | 19946 | 19531 | 3 |
| 12 | 3 | 3 | 107854 | 20682 | 36706 | 3 |
| 13 | 2 | 3 | 106198 | 19103 | 34745 | 2 |
| 14 | 1 | 1 | 101284 | 14259 | 13213 | 1 |
| 15 | 1 | 1 | 101247 | 14222 | 13273 | 0 |
| 16 | 4 | 4 | 103972 | 17089 | 16318 | 4 |
| 17 | 3 | 3 | 100863 | 14220 | 13138 | 3 |
| 18 | 5 | 5 | 104040 | 17593 | 33138 | 5 |
| 19 | 1 | 0 | 102774 | 16364 | 32336 | 1 |
| 20 | 2 | 1 | 102957 | 16643 | 32363 | 2 |
| 21 | 1 | 3 | 104230 | 17974 | 21789 | 1 |
| 22 | 3 | 2 | 102522 | 16304 | 32185 | 0 |
| 23 | 2 | 2 | 102910 | 16766 | 32608 | 2 |
| 24 | 4 | 4 | 107339 | 21195 | 37261 | 0 |
| 25 | 6 | 6 | 105002 | 19163 | 35087 | 6 |
| 26 | 7 | 5 | 107945 | 22378 | 38483 | 7 |
| 27 | 3 | 11 | 102709 | 17142 | 32731 | 0 |
| 28 | 1 | 1 | 100474 | 14934 | 30535 | 1 |
| 29 | 4 | 2 | 101952 | 16066 | 31597 | 4 |
| 30 | 2 | 4 | 102363 | 16680 | 32461 | 2 |
| 31 | 3 | 4 | 104483 | 18800 | 34641 | 0 |
| 32 | 0 | 2 | 103770 | 18087 | 34113 | 0 |
| 33 | 4 | 1 | 102573 | 17315 | 33170 | 4 |
| 34 | 0 | 2 | 101688 | 16430 | 15736 | 0 |
| 35 | 2 | 3 | 102120 | 16930 | 32623 | 2 |
| 36 | 5 | 2 | 105482 | 20415 | 19876 | 5 |
| 37 | 5 | 4 | 104772 | 19937 | 35631 | 5 |
| 38 | 9 | 9 | 106844 | 22333 | 38147 | 9 |
| 39 | 4 | 7 | 102347 | 18006 | 17185 | 4 |

## Reproduction, verification and remaining work

Harness: `packages/plugin/scripts/historian-merge-turn-trial/`; its README documents isolation, phased dispatch, root fencing, normalization, retrieval and attribution. `summarize.ts`, `review.ts first`, `statistics.ts` and `inspect-review.ts` ran against all forty outputs. The statistics inventory initially tried the output parser on dash-bullet input; the populated-corpus check exposed the wrong format, and a dedicated dash-bullet/XML-unescape parser plus unit test replaced it. A quadratic content-normalization pass exceeded its outer 60-second deadline; a precomputed normalized-content index fixed it, and the forty-case check then completed.

The package typecheck uses TypeScript 5.9.3 and includes the scripts configuration. Deterministic unit tests cover literal span removal, strict time/status eligibility, rendered-memory parsing, BM25, independent-vector cosine, lane allocation, target/rewrite validation, prompt construction and the private-root fence. A staged-and-restored non-vacuity mutation changed `created_at < before` to `<= before`; only **“time fence excludes equal-time, future and archived memories”** failed, with the other seven tests present at that point passing. The mutation was restored before commit; the subsequently added rendered-memory parser test increases the final suite to nine tests.

Final gates: `timeout 180s bun run typecheck` passed (TypeScript 5.9.3, all three package/script compiler configurations); `timeout 60s bun test scripts/historian-merge-turn-trial/core.test.ts` passed **9 tests / 26 assertions** (Bun 1.4.2); `timeout 120s bun run lint` passed **1,223 files** (Biome 2.5.1), with two existing warnings and two infos in unrelated files. The package lint configuration excludes TypeScript scripts; their verification is the compiler and dedicated tests, not that lint file count. A separate artifact check validated all forty prompt/cohort/lineage/terminal identities and **2,780 distinct-per-fact, strictly earlier active BM25 candidates**; there are no turn-two result/admission files. No packaging or production source changed, so no additional product build was needed.

Next action requires restored OpenRouter credit, not a different model or unapproved lexical substitution:

```sh
# From packages/plugin, with the existing private root retained:
timeout 3600s bun scripts/historian-merge-turn-trial/run.ts "$TMPDIR/magic-context/merge-turn-trial-bg4916" 40 second
```

Before interpreting continuation results, resolve or explicitly sensitivity-test historical membership/content gaps. Then verify same-session identity and cached usage, independently adjudicate every decision, list every wrong merge/replaces, and compare observed original duplicate insertions to actually caught decisions. Until those steps finish, the central design question remains open.
