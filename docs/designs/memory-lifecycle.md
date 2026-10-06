# Project memory lifecycle

**Status: proposed; no runtime or schema change is made by this document.**
Code citations refer to `6b1b55cd8052d90d847bcda564edf0fc7e6f36e2`, unless a different revision is explicitly named. Trial results are observations on copied stores, not a census of every installation or permission to mutate a live project. Proposed behavior is labelled as such; tuning parameters without trial support remain undecided.

## Decision in brief

Keep compartments as the dated episodic record and source of evidence. Make a project memory a small, current, independently useful claim with citations, an explicit decay class, reinforcement evidence and non-destructive revision history. Reconcile historian facts against the whole eligible project pool in a second turn before admission. Do not mistake a syntactically valid rewrite, a high similarity score, an old date or a search count for proof.

Compute **weight = importance × freshness** only when an independently required head rebuild is already happening. Weight chooses full text, a mural cue or search-only retention. Background work must not create a rebuild opportunity. Replacements leave ordinary search and future prompts, but remain recoverable through an explicit history/restore surface.

The merge trials support a better reconcile prompt, **not unsupervised rewrite authority**. Start with shadow decisions and operator-approved transitions. The target lifecycle can automate safe admissions and reinforcements before it automates changes to existing claims. Backfill is a separately confirmed, reversible project job after the new write path, sweeps and cache protections work in all supported runtimes.

**Vocabulary:** a compartment is a saved episode summary; P1 is its fullest narrative, with P2–P4 progressively shorter versions. `m[0]` is the frozen prompt baseline and `m[1]` its saved additions/corrections. A HARD fold rebuilds that baseline; a SOFT refresh updates only the delta on an already-authorized rendering opportunity; a defer replays both unchanged. “Shadow” means recording proposed decisions without applying them. The cache analysis below spells out which opportunities are legitimate.

## 1. Setting and current state

### The setting we are designing for

The operating assumption is **one long-lived conversation per project/scope**, with its complete dated compartment history. This is not a plan to aggregate fragments from unrelated short sessions. A scope still needs a canonical project identity, an owning conversation and a harness: the existing visibility policy already separates owned project rows from shared workspace rows (`packages/plugin/src/features/magic-context/memory/memory-visibility.ts:57–108`). This assumption is not a database constraint enforcing one session per project; backfill must enumerate the actual registered histories and report departures from it.

Compartments are the episodic layer; memories are claims extracted from that layer, not another event log. Today the historian prompt already distinguishes event narratives from durable world knowledge (`packages/plugin/src/hooks/magic-context/historian-prompt.source.md:23–46`). Evidence references should carry a compartment identity **and** a session/harness-qualified ordinal range. At this base `ctx_expand` accepts message ordinals/ranges, not a compartment-id argument (`packages/plugin/src/tools/ctx-expand/tools.ts:26–40,73–139`). A displayed compartment citation must therefore resolve to `ctx_expand(start=…, end=…)`; opening evidence from another scope needs an authorized scope switch or an explicit evidence-reader API, not an invented tool argument.

The operator recalls studying Hindsight in May. The checked-in comparison is dated September, not May (`docs/reports/memory-solutions-comparison.md:3–13`); it corroborates observations with proof counts, source IDs and change histories (`:66–80`). Borrow that **content shape**: evidence-backed claims, freshness trends and recorded transitions. Do not borrow its bank/service topology, per-prompt recall, global graph or cross-session consolidation assumptions. Freshness trends in this design are derived from reinforcement records, not claimed as an already implemented Magic Context feature.

### What ships now

| Area | Current behavior and limitation |
| --- | --- |
| Historian input | The prompt fitter includes category-ordered project memories, and trims references, memory lines and seeds before shrinking source input (`packages/plugin/src/hooks/magic-context/historian-prompt-fit.ts:190–211,287–314`). Rust includes the same `<project-memory>` block (`crates/mc-module/src/historian_prompt.rs:529–584`). The system instructions call it `<project_memory>` and describe dreamer consolidation across sessions; both that spelling and the claimed write ownership disagree with the renderer/direct publication (`historian-prompt.source.md:58–60,399–410`). Update the instructions when separating the turns. |
| Creation | A validated TS fact is promoted in the compartment publication transaction when memory and auto-promotion are enabled; an authority refusal currently permits compartments to publish without facts (`packages/plugin/src/hooks/magic-context/compartment-runner-incremental.ts:930–945,1067–1105`). Pi has the same feature gates and weak-boundary exclusion (`packages/pi-plugin/src/pi-historian-runner.ts:1353–1364`). Rust projects facts directly into the CAS-gated publication (`crates/mc-module/src/historian.rs:798–906`). There is no production reconcile turn here. |
| Deduplication | TS looks up normalized content hash **within category and project**, including archived matches, then increments `seen_count` rather than inserting (`packages/plugin/src/features/magic-context/memory/promotion.ts:57–93`; `storage-memory.ts:680–691`). Native Rust checks live byte-identical content across categories, skips repeats without a seen increment and inserts a synthetic hash (`crates/mc-store/src/lib.rs:16330–16398`). The host writer checks live exact content and bumps seen timestamps, with retry protection (`crates/mc-module/src/host_store.rs:1282–1340`). These are different exact-repeat contracts, not semantic reconciliation. |
| Stored model | The base `memories` schema is in `storage-db.ts`, not wholly in `migrations.ts`: content/hash, nullable importance, first/last-seen, seen/retrieval counts, verification fields, successor, `merged_from` and cue metadata, but no history/proof/decay class (`packages/plugin/src/features/magic-context/storage-db.ts:1342–1373`). Migration adds nullable importance and the classify marker (`migrations.ts:1017,1980–1983`). TS inserts importance at the default **50**, status active and verification unverified (`memory/storage-memory.ts:551–584`). |
| Selection | Permanent rows win first; then importance; then the newer of `last_seen_at` and row `verified_at`; then deterministic ties (`packages/plugin/src/features/magic-context/memory/memory-selection.ts:9–44`). Budget trimming admits complete grouped entries, skipping those that do not fit (`packages/plugin/src/hooks/magic-context/inject-compartments.ts:1955–1982`). Rust has the same priority axes (`crates/mc-module/src/m0_compose.rs:160–188`). This is not time-decayed memory weight. |
| Mural | Overflow is the complement of text-budget selection, not a separately weighted middle tier (`packages/plugin/src/features/magic-context/mural/mural-selection.ts:19–30`). Only hash-current compressed cues are rendered, ordered by category/importance/id (`mural/resolve-mural.ts:85–140`). The proposed search-only tier changes this policy: not every overflow row should receive image attention. |
| Changes | Content rewrites clear classification/shareability and stale derived data, but do not retain previous prose (`packages/plugin/src/features/magic-context/memory/storage-memory.ts:1061–1124`). Tool updates/archives append correction or successor mutations (`packages/plugin/src/tools/ctx-memory/tools.ts:623–689,963–984`). The mutation log is a prompt reconciliation stream, not a complete reversible revision history (`storage-memory-mutation-log.ts:3–31,66–100,123–228`). |
| Search | Ordinary semantic/FTS memory search selects active/permanent rows (`packages/plugin/src/features/magic-context/search.ts:906–950`; `memory/storage-memory-fts.ts:21–31,41–57`). **Explicit ID search includes archived rows today**, so merely archiving does not satisfy “out of `ctx_search`” (`search.ts:1954–2020`). Remove that exception for retired/superseded memories; expose history through a separate deliberate operation. |
| Sweeps | Mapping precedes verify; classify is a no-tool completion, while verify and curate require tool loops. Memory-mutating dreamer tasks share a project lease (`packages/plugin/src/features/magic-context/dreamer/task-registry.ts:13–28,72–120,256–309`). A no-tool host cannot silently be credited with code verification. |

**Permanent is not standing rule.** Existing status/category/source labels must not be interpreted as the new decay classes. In particular, `source_type='user'` is reserved for a future manual surface; an agent responding to a user request still has agent provenance (`packages/plugin/src/features/magic-context/memory/types.ts:22–41`). Standing-rule eligibility requires an evidence-backed user statement or explicit save, not that reserved label or the word “must.”

### Measured problems and limits of the evidence

| Observation | What it supports, and what it does not |
| --- | --- |
| Direct promotion volume | The promotion report observed **3,097 emitted facts and 2,955 new historian rows over fourteen days**. Its manual sample labelled **61/150** durable reusable facts and **58/150** implementation/event restatements. Counts are not a reconciled insertion ledger; sample judgments are single-reviewer (`docs/reports/historian-memory-promotion.md:7,25–35,78–90`). Admission quality matters more than an arbitrary daily cap. |
| Sparse exact/near duplicates | The same report found **52/2,949** recent embedded rows with an earlier live same-model cosine match at its **0.90** cutoff. The later merge cohort found **no clear older-pool duplicates among 104 observed original insertion candidates**, with two debatable overlaps (`historian-memory-promotion.md:72`; `historian-merge-turn-trial.md:87–113`). Neither proves that semantic redundancy is absent, or that embeddings can safely decide deletion. Historical membership/content reconstruction was incomplete. |
| Input size | Across **forty** merge-trial runs, removal of the memory block cut estimated first-turn user-plus-current-system input by **72.08%**. Both replay turns together reported **3,081,022** input tokens against **4,802,067** estimated original input: **35.84%** smaller (`historian-merge-turn-trial.md:146–172`). The often quoted “about 36%” is the **combined-flow comparison**, not the first-turn reduction or a billed saving. Same-session continuation was demonstrated; full-prefix cache reuse was not. |
| Rewrite loss | The first trial had **12/52** wrong accepted rewrites across merge/update/replaces. V2 reduced this to **3/36**; its two repetitions each still had an accepted wrong rewrite. It fixed **11/12** earlier wrong rewrites in the primary pass, but the deterministic gate missed real semantic loss (`historian-merge-turn-trial-v2.md:36–99,101–136`). Reversibility limits damage; it does not make incorrect current prose safe. |
| Retrieval and fallback | V2's top-**eight** shortlist dropped the long lexical retention memory and caused **four** redundant new decisions. **Five** malformed batches converted **21** facts to all-new, including correct skips (`historian-merge-turn-trial-v2.md:64–66`). Preserve a dedicated lexical lane and isolate failures by fact. This report does not measure the proposed lexical-slot/per-fact variant. |
| Scoring anchoring | Hiding recent compartment labels reduced preceding-score proximity from **21/30 to 3/30** in the initial ablation; the shipped diverse-layout/unscored-recent arm reached **7/30**. The later wording trial's mean absolute intervention change **4.34** was below its repeat noise **4.62** (`historian-importance-anchoring.md:7–13,60–67`; `historian-scoring-prompt-trial.md:7–9,45–52`). These are compartment trials, not direct validation of a memory importance rubric. More score spread is not accuracy. |
| Score-only history repair | P1-only rescoring separated useful durations, but an unchanged rerun crossed bands for **10/60** compartments and changed scores by mean absolute **4.33**. Extra P2/recent titles had no demonstrated quality advantage (`compartment-rescore-trial.md:5–13,62–80`). Use auditable overlays, not repeated scoring until a desired histogram appears. |
| Stale retirement | Evidence-supplied curate retired **6/21** labelled stale memories and **one** labelled true memory; text-only wrongly retired a binding preservation rule outside that labelled set (`curate-stale-retirement-trial.md:60–84,145–155`). This is already a completed trial at this base, not still awaiting results. It rejects automatic retirement on those arms. |
| Historian run shape | The run-size report attributes compartment-count changes primarily to model mix, not a one-compartment quota, and warns that the TS run ledger omits Rust publication (`historian-run-size.md:7–37,98–113`). Neither proof counts nor backfill batches may equate one run with one compartment or rely solely on that ledger. |

The supplied project snapshot says **all 1,299 memories are `unverified`, although 930 have per-file checks**, and reports **2,463 events**. The active-pool count is corroborated by the merge and stale reports (`historian-merge-turn-trial.md:24–28`; `curate-stale-retirement-trial.md:13`). The row-status/check-count pair and event count are **operator-supplied observations not independently tabulated in the listed reports**. They remain explicitly unverified here; no live store was opened to manufacture a confirming report. The code defect explaining how checks can fail to reach the row is traced below. A copied-store audit must establish the exact affected counts before repair.

## 2. Goals and non-goals

**Goals**

- Admit independently useful claims; reconcile paraphrases and changed values without erasing still-valid constraints.
- Make the evidence, origin, current truth, revision history and degree of re-observation inspectable.
- Keep standing instructions until explicit revocation; let unreinforced ordinary facts lose prompt attention without losing stored knowledge.
- Repair legacy history once, economically, with consent, resumability and undo.
- Preserve frozen provider-visible bytes on defer paths in TS OpenCode, Pi and Rust, including mixed memory authority.

**Non-goals**

- Recompacting or rewriting compartment narratives, raw coordinates or original messages as part of memory repair.
- Cross-project learning, a global knowledge graph, per-turn model retrieval or short-session aggregation.
- Treating importance as truth confidence, enforcing a score histogram, or retiring something merely because it is old or unused.
- Using search counts as a popularity-based permanent promotion system.
- Repairing every unsupported host's inference/tool capabilities in this feature. Refuse unavailable operations clearly and retain pending work.

## 3. The model: claims, evidence, classes, weight and tiers

### Memory and evidence records

A live memory has current text, category, ownership/visibility, importance and its review provenance. Add `decay_class`, `proof_count`, `last_reinforced_at`, and an append-only `history` array. Reuse existing `first_seen_at` rather than inventing a second first-seen field. Add a reviewed rubric version and content revision for compare-and-swap (CAS): a model decision applies only to the exact revision it read.

Store individual evidence records as well as their summaries. A reference contains canonical project identity, scope/session, harness, source compartment ID if valid, ordinal endpoints, native endpoint/block identities where available, evidence hash, source kind, observation time and certainty. Keep event IDs as optional provenance, not as the only citation. Imported creation dates are not necessarily event dates: the rescore report documents import timestamps (`docs/reports/compartment-rescore-trial.md:84`). Unknown dates stay unknown; never infer a precise first occurrence from an import date.

Evidence uniqueness is by a durable observation key, not by a retry timestamp. The key binds publication identity, fact ordinal, source range and evidence hash. Copies of a memory in a prompt, repeated output in a retry, and duplicate citations within one observation do not count as new proofs. A scope's repeated real work is useful evidence even though it is not statistically independent; `proof_count` is an auditable observation count, **not a posterior probability**.

### Four classes

Classes are orthogonal to the existing five content categories (`packages/plugin/src/features/magic-context/memory/constants.ts:9–29`). The second turn proposes a class; classify reviews it against origin evidence.

| Class | Eligibility and examples | Decay and exit |
| --- | --- | --- |
| **Standing rule** | An explicit user instruction or explicit agent save of an operating rule. Preserve the actual instruction/save evidence. An inferred constraint is not eligible merely because it sounds imperative. | Freshness remains constant. Leaves only through an explicit evidenced replacement or revocation; neither a code change nor silence revokes it. |
| **Structural fact** | Architecture, enduring configuration semantics, external limits, naming decisions or mechanisms with continuing consequence. | Slow half-life, measured in **months**. Re-observation or confirmation restores freshness. |
| **Situational fact** | Current but changeable state that affects continued work: a temporary environment constraint, open operational state or a provisional configuration. | Fast half-life, **days to weeks**. Retain uncertainty/expiry evidence; do not promote a plan into accomplished fact. |
| **Episode** | Something done, investigated, released or measured without an independently reusable claim. | Not a live memory. Retain it in the compartment evidence layer; archive legacy episode-memories after reviewed backfill. |

The timescales are agreed design directions, **not fitted half-lives from these trials**. Exact half-lives and stale-review cutoffs are release parameters awaiting replay calibration. A compound text mixing a permanent rule and temporary state should be split with shared provenance, not assigned a convenient average decay class. An unknown-origin legacy rule gets a review proposal, not silent immortality or automatic fast decay.

Existing category TTLs are a separate legacy policy: the promoter sets `expires_at` for some old categories (`packages/plugin/src/features/magic-context/memory/constants.ts:65–70`; `promotion.ts:36–39`), and loaders hide expired rows using a live or frozen cutoff (`storage-memory.ts:693–711`). New lifecycle admissions must not translate a class half-life into `expires_at`. Review legacy automatic expirations during backfill; preserve an explicitly evidenced validity deadline as claim metadata, and require stale review rather than quietly expiring a standing rule. Do not blindly clear operator-authored deadlines or count expiry as proof of contradiction.

### Reinforcement

Order the signals by what they establish:

1. **`covered by #N` from the reconcile turn:** the fact was re-observed in real work and the target alone covers every claim. Attach the new compartment evidence; this works whether or not the target was in the primary prompt. This is the main signal.
2. **Verify confirming the claim against current code:** record backing files, checked commit and result on the memory row; advance reinforcement time only for an actual confirmation. Mapping a file, skipping investigation or refusing an unsafe update is not confirmation.
3. **Actual agent use:** a scoped citation to `#id` in the agent's answer or explicit consumption/expansion of a search hit. Record usage separately and advance freshness. A bare returned search result is not use; until consumption detection exists, do not manufacture this signal from `retrieval_count`.

`proof_count` counts distinct accepted evidentiary observations, including grounded verification records; usage-only records restore freshness but do not claim another proof of truth. `last_reinforced_at` is the latest accepted evidence/use time. Keep the observation timestamp distinct from repair/apply time. A code check performed now is current evidence; a backfilled old citation is not new evidence at backfill time. Classify and cue compression never reinforce. Corrections start reinforcement for the **new revision** from its supporting evidence; they do not transfer old proofs of a false value to a new one.

Search counts alone are specifically excluded: today explicit search increments telemetry, automatic hints do not, and the bump is skipped under module authority (`packages/plugin/src/features/magic-context/search.ts:2258–2281`). Memories already injected may never be searched. Detect structured scoped citations outside quoted/tool data, deduplicate use records, and do not let a generated transcript repeat reinforce itself.

### Importance and freshness

**Importance = consequence of not knowing × breadth of applicability**, assessed by a calibrated review rubric. Store an integer on the existing importance scale; the rubric maps severity and breadth judgments to that scale rather than multiplying two arbitrary model-emitted numbers. Missing a safety constraint is consequential even if it is short; large implementation effort does not imply high importance. Truth uncertainty belongs in evidence/verification state, not a disguised importance discount.

Importance is stable between explicit reviews. Repetition does not increase it, and age does not decrease it. A new consequence, changed scope or periodic rubric review can revise it with an audit record. Freshness handles age independently:

```text
age = max(0, fold_time - last_reinforced_at)
freshness = 1                                      for a standing rule
freshness = 2 ** (-age / class_half_life)           otherwise
weight = reviewed_importance * freshness
```

These mathematical constants define exponential half-life, not empirical measurements. The fold uses a single captured clock and policy version. For legacy unknown reinforcement, use a visibly provisional first-seen baseline until backfill; never reset every legacy row to migration time. There is no live read-path decay timer.

Compartment decay is a useful cache pattern, but a different clock: current compartment decay uses distance from the newest compartment and importance-dependent half-life, not elapsed wall time (`packages/plugin/src/hooks/magic-context/decay-curve.ts:27–64`). Do not describe it as the same time-based algorithm.

### Attention tiers

At a natural HARD, project the eligible memory revision set, compute weights, then make **one deterministic selection shared by text and mural**:

| Tier | Selection policy | What remains available |
| --- | --- | --- |
| Full text | Highest-weight eligible claims that fit the text budget; admit whole facts, not truncated rules. Protected standing rules are considered first. | `#id` and actionable current prose in `<project-memory>`, with compact evidence links where useful. |
| Mural cue | Remaining claims above a calibrated cue-worthiness floor that fit the image/cue budget and have current cues, on a vision-capable model. | Short cue plus ID; ordinary search/expansion supplies the full claim. |
| Search-only | Low-weight claims, missing/stale cues, image overflow or a non-vision model's unselected claims. | Full current text in search; no deletion and no superseded “cold copy.” |

No fixed tier cutoff or new budget is justified by the listed trials. Retain the configured text budget during initial shadow replay. The promotion report calls **8,000 tokens** the default (`docs/reports/historian-memory-promotion.md:104`); that is the renderer's fallback (`packages/plugin/src/hooks/magic-context/inject-compartments.ts:1131`), **not the schema's configured default of 4,000** (`packages/plugin/src/config/schema/magic-context.ts:1477–1483,1559`). The hook threads the configured value (`packages/plugin/src/hooks/magic-context/hook.ts:1085–1086`). Additive m[1] admission uses **25%** of the selected budget (`inject-compartments.ts:2955–2964`). This implementation-constant discrepancy is not a new measured budget result. Calibrate cue capacity and floors from actual served prompts, not memory counts. Deterministic ties use reinforcement time and ID; category controls presentation, not a second hidden relevance score.

Never-decaying does not mean unlimited prompt capacity. If protected standing rules exceed the budget, report an explicit capacity problem and require review/budget choice; do not silently replace full instructions with ambiguous cues. Decay does not archive. Long-unreinforced, low-weight rows only enter the stale-review backlog.

## 4. The historian write path

### Turn one: episodic extraction without project memory

Remove `<project-memory>` from the first-turn input and remove instructions to deduplicate against that absent block. Keep the transcript guard, examples, continuity references, tiered compartments, boundary validation and fact-extraction rubric. Ask for candidate facts with source-compartment/range anchors and observed origin, including an explicit “no memory; episode” disposition. The TS parser currently emits only category/content fact pairs (`packages/plugin/src/hooks/magic-context/compartment-parser.ts:390–406`), while Rust accepts optional compartment anchors (`crates/mc-module/src/historian_validate.rs:360–409`). Extend both contracts; never guess source attribution when a tail was discarded.

Do not change chunk sizes or force a compartment count in this slice. The independent prompt-fit and boundary rules remain authoritative. Run a paired fresh full-memory control before switching the default: the earlier trial compared a new stripped generation with a historical recorded answer, not two identically configured fresh arms (`docs/reports/historian-merge-turn-trial.md:63–67`).

### Turn two: same-session reconcile

Append the reconciliation request to the **same hidden session/lineage**, retaining the first prompt and reply as preceding roles. Reuse the model/system/profile for the attempt and measure actual cache hits rather than assuming them. Skip inference when no candidate facts exist; still record successful empty extraction. A resumed pending fact can use a later run's second turn, but must be labelled with its own original evidence, not attributed to the later transcript.

Retrieve candidates from the full current eligible **owned project** memory pool, not only injected text. Shared foreign memories may be read for context under visibility policy but cannot be mutated or used as a sole owner-local coverage target. Use compatible compartment/memory embedding identities and a lexical lane; absent/incompatible embeddings fall back visibly to lexical retrieval, not silent no-match. Similarity is a retrieval aid, never a verdict.

Use the v2 readable ranked layout: a heading per fact; complete candidate text; IDs, category, origin, age and lane/rank metadata; no implicit correctness claim from a score. Reserve a **dedicated distinct lexical candidate slot** before filling ranked slots. Do not truncate a long memory to fit; reduce batch/candidate count with an explicit coverage warning. The trial's top-eight reduction is not the recommended production shortlist (`docs/reports/historian-merge-turn-trial-v2.md:15–22,64–66`). Exact shortlist capacity/lexical allocation remains a new trial, not a measured optimal number.

For each fact require a claim-by-claim inventory before replacement prose. Quote exact target clauses, mark `keep` or `replaced`, and supply a reason plus source evidence for every replaced clause. Conditions, negations, fallback behavior, bounds, keys and ancillary exceptions are claims too. `update` is a change to the same property; `replaces` is an evidenced contradiction or revocation; a compatible observation or workaround is neither.

| Decision | Durable effect |
| --- | --- |
| `new` | Create a current claim with origin, citations, proposed class and provisional importance awaiting review. Exact-hash guard is still a final concurrency defense. |
| `covered by #N` | Keep text/importance unchanged; attach distinct evidence and reinforce. Target alone must cover the entire fact. Joint coverage needs explicit claim mapping to multiple targets or a pending review, not a guessed skip. |
| `merge` | Refine a coherent facet while preserving all still-valid claims. Retain the nominated survivor ID; archive any other merged source rows with successor pointers and their history in the survivor. |
| `update` | Keep the target ID and revise the same property's state; preserve its unrelated claims and append a state-update history entry. |
| `replaces` | Create a successor revision/row for contradicted knowledge, append the prior text and evidence to its history, and archive old row(s) with successor links. An explicit revocation with no surviving claim is an audited archive, not an empty live memory. |

The wire may use a structured `covered` action and integer target ID; `covered by #N` is its human-readable form. Keep decisions separate from prose and correlation IDs. Validate each fact independently: unknown/duplicate fact IDs invalidate that fact; a valid sibling decision can commit. An unparseable envelope leaves all unresolved facts pending. Never infer integer indices from text, silently repair IDs, or convert every valid sibling to `new` because one entry is malformed.

### Gates and publication

Port the v2 deterministic token/evidence gate from investigative code into a shared contract: preserve backticked identifiers, paths, refusal codes, quantities/units and named keys unless the exact containing claim is explicitly replaced with verbatim evidence **from the actual source transcript**, not examples/candidate memories (`docs/reports/historian-merge-turn-trial-v2.md:17–20`). Treat stored/model text as untrusted data, not instructions.

This gate is necessary, not sufficient. A valid quotation does not prove contradiction, and a surviving numeric token in historical prose may still lose its operative meaning. Keep transitions approval-gated until independent preservation/contradiction review passes held-out tests, including the detach-guarantee and workaround-versus-API-gap failures (`historian-merge-turn-trial-v2.md:68–99`). A rejected rewrite must leave the old row untouched and retain the original fact in pending review. Unlike the trial's all-new fallback, rejection need not immediately insert a known duplicate. A separately validated genuinely new fact may still be admitted.

Publish validated compartments and **all unresolved fact records** atomically with the boundary, so a first-turn success is durable even if turn two times out or memory authority is elsewhere. Accepted decisions can be applied in that transaction if already available, or later in a short, lease/CAS-guarded transaction. No SQL write transaction spans inference. Use the existing project memory authority, not a TS fallback writer when Rust owns the domain; the current direct writer's “skip facts on authority refusal” is a known loss path to replace, not copy (`packages/plugin/src/hooks/magic-context/compartment-runner-incremental.ts:1087–1103`).

The pending queue is **small by bounded processing**, not by silently evicting unresolved facts. Persist project, session/harness, publication/fact identity, original text/category/origin, immutable evidence reference, first-turn/second-turn run IDs, attempt state and last error. Retry oldest unresolved facts alongside the next run within its measured allowance; if none arrives, offer a dreamer/explicit drain. Backpressure and operator-visible backlog replace dropping. Model failure, process crash, unavailable embeddings or a stale target never consume a pending fact. Memory-disabled policy pauses admissions without secretly enabling memory; deliberate session/project deletion has an explicit cancellation/evidence-unavailable policy.

Use per-project leases plus content-revision CAS and idempotent observation/decision keys. A target changed during inference is re-retrieved and reconciled, not overwritten. Hash collisions with archived rows require an explicit restore/new-revision decision: TS's current bump-on-archived-match must not count as live coverage. Embeddings and cues are regenerated after commit with content-hash checks (the embedding writer already guards stale results, `packages/plugin/src/features/magic-context/memory/promotion.ts:119–139`).

### Non-destructive transitions and repair

Every merge/update/replacement appends to the surviving memory:

```text
history entry = {
  previous_text,
  changed_at,
  reason: refine | state_update | correction | merge,
  evidence: compartment reference(s),
  source_ids: predecessor/merged memory IDs
}
```

Also record old category/class/importance/status, content hashes, decision actor/rubric/model, observation key and successor relationships in the revision journal so undo restores **metadata as well as prose**. `changed_at` is apply time; evidence carries occurrence time. Append before changing current content in the same transaction. For a multi-source merge, preserve each source's distinct previous text/history; do not concatenate source counts and call them independent proofs.

Current prose says “was X, now Y” only if the transition itself helps future work. Otherwise give actionable current truth and keep chronology in history. Archived predecessors are not searchable memory hits, even by ID, and are not cue candidates. An explicit history view may show them and offer restore. Restore is a new audited revision with conflict checks, not deletion of the intervening history or resurrection by a prompt delta. Route ordinary restore through a natural fold as well; do not reuse the mutation log's current epoch-bump unarchive convention (`packages/plugin/src/features/magic-context/storage-memory-mutation-log.ts:9–15`).

## 5. Cleanup sweeps

### Verify: connect the result to the row

The TS `verified` branch writes `memory_verifications` and optional commit metadata, **not** `memories.verification_status` or `memories.verified_at` (`packages/plugin/src/features/magic-context/dreamer/verify.ts:729–773`). `recordMemoryVerifications` only replaces side-table rows (`memory/storage-memory-verifications.ts:60–81`). Thus a successfully checked row can remain `unverified`, and selection misses verification reinforcement because it reads the row timestamp. TS's update branch also clears mappings without applying its reported file set (`dreamer/verify.ts:737–746,794–809`).

This is not universal across runtimes: the module verification writer sets row status/timestamp and updates mapping timestamps; its update branch marks the row verified but deletes mappings (`crates/mc-store/src/lib.rs:17077–17160`). The TS module request sends verdict/content/hash, not the freshly normalized complete file set or checked commit (`dreamer/verify.ts:667–705`). Align these contracts; do not announce that all verify paths currently fail in the same way.

Proposed apply transaction:

- Recheck project ownership, active status, revision and checked source commit; distinguish real confirmation, unmapped, skipped, refused and failed.
- For a confirmed unchanged claim, write row verification fields, normalized backing-file set, checked commit, evidence record and reinforcement together.
- For a confirmed correction, append history, rewrite current content, replace mappings and verification provenance for the new revision, invalidate old embedding/cue/classification, and append a prompt correction eligible only on an independent render.
- Preserve standing directives: code can verify an implementation fact, not revoke a user's operating instruction. The existing directive/content-loss refusals remain defenses (`dreamer/verify.ts:612–660`), but reviewed history is still required for every accepted rewrite.

Before repairing legacy flags, audit a copied store by project, writer/authority, mapping origin and verification timestamp. A mapping sentinel or `verified_at=0` is not a check (`memory/storage-memory-verifications.ts:3–20,36–58`). Only genuine content-verified results matching the current revision may be carried into the row; reverify uncertain legacy matches. Do not stamp repair time as reinforcement. The exact supplied checked-row count remains a report gap.

### Stale check and curate

Add a bounded reconcile-style stale review under the project memory lease. Low weight/long non-reinforcement selects candidates, not a verdict. Retrieve newer same-facet memories, relevant compartments/events and current code with caller context. Require the exact old claim, explicit replacement/contradiction evidence and a preservation inventory. Keep uncertain facts and compound entries with surviving truth; propose an update rather than retire the whole entry. Operator approval remains mandatory for retirement.

Current curate assumes accuracy, merges same-category duplicates and refuses standalone stale/low-value deletion; it protects rules, rationale and external limits (`packages/plugin/src/features/magic-context/dreamer/task-prompts.ts:110–122`). Do not simply remove those protections. Port curate/tool/verify changes to the same non-destructive applier, and add a stale-proposal result distinct from redundant archive. The completed retirement trial demonstrates that plausible citations can still be wrong.

**Placeholder for the next stale-reconcile trial:** corpus and frozen labels; true/stale/unsure denominators; accepted/rejected transitions; false retirements of standing rules; evidence/caller coverage; repeat variance; tokens/cache/time; independent reviewer adjudication. No results for this new variant are claimed. The earlier curate trial's measured failures remain the baseline, not a pending blank to overwrite.

### Classify: break the anchoring loop

Today classify shows each candidate's current importance (`packages/plugin/src/features/magic-context/dreamer/classify-prompt.ts:80–98`) and samples sorted quantiles of already classified rows (`dreamer/classify.ts:191–217,237–253`). A flat pool cannot supply calibrated diverse anchors. Its guidance conflates durability with impact (`classify-prompt.ts:41–52`). Its introductory comment says small pools are rescored wholesale, but the implementation selects unclassified IDs in both larger stages (`classify.ts:60–69,237–265`); periodic review is not implemented by that comment.

Replace it with a versioned consequence/breadth rubric and **fixed, human-scored anchors across several bands**, including safety rules, structural facts and ordinary situational facts. Do not show the candidate's current score; supply provenance needed for class eligibility, while keeping scope/shareability separate and privacy fail-closed. Review class as well as importance. The compartment anchor trials motivate hiding current/recent numbers, but do not establish memory-scoring accuracy; run a fixed-text, blinded memory trial with repeat controls before enabling periodic re-review.

Review new/changed rows, then rotate a bounded overdue cohort periodically by rubric version/review age. Do not rescore every run or force a histogram. Audit score/class changes separately from textual history and never reinforce on classify. Preserve a stable importance between reviews. Scope/shareability changes that affect another project's visibility are policy changes, not decay; they retain their existing explicit visibility/reconciliation treatment.

### Retire obsolete promotion controls

Remove `memory.auto_promote` once reconciliation is the admission path, including schema/default/UI/docs and actual TS/Pi/Rust readers (`packages/plugin/src/config/schema/magic-context.ts:1485–1496,1560–1561`; `hooks/magic-context/hook.ts:325,750–752`; `packages/pi-plugin/src/index.ts:1123,2060–2142`; `crates/mc-module/src/config.rs:744–747,796–799`; `historian.rs:3115`). It is a configuration key, not a missing file.

Retire `retrieval_count_promotion_threshold` too: at this base it is declared/defaulted and displayed/documented, but no promotion behavior reads it (schema above; `packages/dashboard/src/components/ConfigEditor/ConfigEditor.tsx:173–180`; actual promotion `memory/promotion.ts:57–93`). Do not promise search-to-permanent promotion during transition. Preserve `memory.enabled` as the feature boundary. Existing explicit opt-out from auto-promotion must not become implicit consent to the new writer: offer a release-time configuration decision/warning before automatic admissions, without a compatibility shim or a silently ignored safety choice.

### Events as evidence, not authority

`compartment_events` is kind-agnostic JSON with a publish-local anchor; it has no compartment foreign key, and recomp can leave dangling IDs (`packages/plugin/src/features/magic-context/compartment-events.ts:7–26,52–104`; schema `migrations.ts:1100–1120`). Its “not consumed yet” comment is outdated: retrospective loads recognized causal/correction kinds and renders them as corroboration (`dreamer/task-executor.ts:1231–1255`; `dreamer/task-prompts.ts:206–248`). It is not a general memory provenance consumer today.

Use `causal_incident` to explain the cost/discovery behind a constraint or correction. Its current prompt is about an external-system surprise, not every internal bug (`historian-prompt.source.md:587–618`). Retain it as an optional evidence supplement anchored to a recoverable range.

**Do not map every `trajectory_correction` to a standing rule.** The current definition is discarded investment/direction change, and its source may be user, test, tool or self-review (`historian-prompt.source.md:620–645`). Only a correction with a proved explicit user directive or explicit agent save can originate a standing rule. Other trajectory events belong in transition history or compartments. Also capture direct instructions that never caused a pivot; event extraction is not the standing-rule eligibility gate.

During backfill validate/re-anchor event IDs with range/source identity and copy essential provenance into evidence/history so future recomp does not erase it. Unknown kinds, dangling anchors and unsupported field claims remain inspectable but cannot authorize changes. **Recommendation: retain and repair the evidence layer initially.** If a grounded sample cannot show useful additional provenance beyond compartments, stop producing unused event kinds and propose an explicit archival/removal migration; do not maintain a second unquestioned source of truth or drop existing evidence silently.

## 6. One-time fix-history backfill

Run once per project and lifecycle rubric **after** the live write path and repair semantics are working. Completion is per item, not a project boolean set when a job starts. A later resumed job finishes its frozen input set; it does not sweep newly produced facts into the original budget.

### Ordered phases

1. **Inventory and preview.** Freeze eligible memory/compartment IDs, content revisions, canonical scopes, missing dates/vectors/events, existing statuses and rubric provenance. Report proposed workload and uncertainty, not precomputed “success” counts. Show estimated model calls/input/output/embedding work and a cost envelope from the installation's actual provider metadata; if billing is unknown, say so, as the trials do. Confirm scope, budget and model profiles before paid work.
2. **Trace evidence.** Retrieve top compartment matches for each memory using compatible compartment and memory embeddings, with lexical fallback for paths/names/long rules. A model checks matches against complete P1 and expands the cited source where necessary. It must distinguish copied/repeated wording from an actual re-observation. Persist accepted first occurrence, distinct proofs, most recent reinforcement and **candidate transitions with citations**; retrieval similarity alone changes nothing. Record unknown or unverifiable evidence instead of fabricated precision.
3. **Classify.** Use the new blind-score rubric/anchors and origin evidence to propose class and importance. Flag possible episodes and standing rules with missing explicit origin. No current-score leakage.
4. **Resolve transitions.** Order same-facet observations by evidence time, keep still-valid claims, and resolve contradictions/refinements through the same history/CAS applier and approval gate as live writes. A new statement does not automatically win merely because it is newer. Union evidence keys on merges; recompute proofs for the survivor's current claims.
5. **Archive episodes.** Only after evidence is recoverable and classification is approved. Preserve the old memory in history/audit with its compartment references; do not destroy the episodic record.
6. **Rescore compartments.** Use the render-only overlay and job protocol in [compartment-rescore.md](compartment-rescore.md), not base importance UPDATEs. Prefer the P1-only trial arm. Do not rewrite summaries, emit new facts or feed rescored adjacent labels back as the memory rubric's anchors.
7. **Review and adopt.** Show proposed/approved/applied/failed/stale items and before/after metadata. Persist every approved change reversibly. Search/history may expose canonical approved state immediately; **no backfill revision or tier change reaches a primary prompt before that session's next independently required HARD**. Show “pending prompt adoption” separately from job completion.

For confirmed evidence, repair existing `first_seen_at`; preserve its old value in the job journal and keep `created_at` as row creation time. If the full history is unavailable, report a lower-bound proof count/unknown first occurrence. A revision can be reversed without erasing the evidentiary audit. Undo is another versioned selection and also waits for natural prompt adoption.

### Job mechanics and surfaces

Persist project identity, confirmation/cutoff, source revision hashes, model profiles, rubric/prompt versions, fixed batch membership, leases, provider run IDs, spend, item status and review decisions. Reattach admitted runs after disconnect; do not pay for a new run while the old outcome is unknown. Publish in short transactions with source CAS; changed/deleted/recompacted inputs become stale items for a new preview. Pause/cancel stops further spending without dropping already accepted results. No inference in a migration or startup path.

| Surface | Fit and recommendation |
| --- | --- |
| **Slash command** | First surface: propose `/ctx-memory-repair` with project preview, explicit confirmation, status/pause/resume/undo and a shared job service. It is not an alias for recomp. The rescore design traces existing OpenCode/Pi command and historian transport integration (`compartment-rescore.md:76–84`). Resolve/pin separate historian-reconcile and classification profiles; disclose all target scopes rather than assuming the current session is the only one. |
| **Dreamer one-shot** | Later opt-in executor of the same confirmed job, not a second algorithm or automatic upgrade spend. Add registry/capability/backlog integration under the project memory lease. A manifest-only host can execute classification/reconcile over supplied evidence; code verification or source expansion still needs a supported reader/tool loop. |
| **Doctor** | Initially read-only eligibility, inconsistent verification flags, dangling provenance and job/adoption status. Execution needs an authenticated project-bound harness/Broca broker and shared accounting/cancellation, not ad hoc credentials or a hidden model chosen by doctor. The rescore surface comparison documents that missing completion executor (`compartment-rescore.md:80–84`). |

## 7. Cache-safety analysis

`m[0]` is the frozen baseline containing `<project-memory>`, compartment history and the paired mural image. `m[1]` is the frozen delta containing additions/corrections since that baseline. A **natural HARD** here means first/cold recovery, already-expired provider identity/TTL, or independently necessary content/pressure/coverage work. A background memory timestamp, job completion, queued proposal or score overlay is not such work.

### Existing paths and required behavior

| Path capable of changing served bytes | Current code | Lifecycle requirement |
| --- | --- | --- |
| HARD m[0] text selection | TS captures memories, trims and persists bytes/visible IDs with snapshot markers (`inject-compartments.ts:2434–2546,2593–2738`). Rust loads a memory render snapshot in composition (`crates/mc-module/src/m0_compose.rs:425–462,484–620`). | Capture one policy/time/revision snapshot after HARD is independently selected. Compute weights/tiers here only; persist applied memory revision/policy, tier membership and clock with bytes. No latest-versus-applied comparison requests a fold. |
| Additive live memory → m[1] | `maxMemoryId` is not a HARD trigger (`inject-compartments.ts:1932–1935`). m[1] admits new IDs within its quarter budget (`:2944–2975`). | Accepted new live claims can ride an already priced SOFT/HARD. Give them a creation-time admission priority, not a fresh decay calculation for old rows. Do not demote/promote existing IDs on SOFT because their time/class/score changed. |
| Update/archive/successor → m[1] | Mutations since the baseline cursor produce `<updated>`, `<removed>` or `<superseded>`; missing eligible successors can be forced into the delta (`inject-compartments.ts:2794–2876`; Rust `m1_compose.rs:406–457`). | Live textual corrections ride only an independent render; no history/proof/class/importance-only mutation. Preserve terminal precedence and chain/cycle handling. Clear obsolete active/search membership at apply, but leave frozen bytes untouched until the safe opportunity. |
| Reweight/reclassify/reinforce | TS deliberately ignores memory render epoch as a HARD trigger (`inject-compartments.ts:1787–1788`); its classifier writes metadata without prompt mutations (`memory/storage-memory.ts:1137–1194`). | No epoch bump, refresh flag, cached-buffer clearing or m[1] revision for weight/proof alone. Pin existing m[1] admission decisions to the baseline revision set, so a later SOFT does not opportunistically rerank all prior additions using new scores. |
| Deferred replay / already-priced SOFT | TS replays m[1] unless `isCacheBustingPass` already authorizes refresh (`inject-compartments.ts:4055–4084`). Rust's in-session revision signal is pending work, not an authorization (`m1_compose.rs:125–144,256–265`). | Queue writes and in-session text mutations do not originate a bust. Both byte buffers and image payload are identical across defers/restarts. Ordinary delta growth can cause the existing pressure backstop only on an already-priced pass (`inject-compartments.ts:4086–4101`); do not flood it with repair/tier-only corrections. |
| Mural/cue changes | TS resolves the mural inside HARD and persists its image/hash (`inject-compartments.ts:2547–2555,2593–2599,2696–2707`); Pi does likewise (`packages/pi-plugin/src/inject-compartments-pi.ts:1686–1700,1801–1819`). | Derive text and cue tier sets from the same captured weights/revisions. Compression updates only storage; no image regeneration/swap on SOFT/defer. A stale cue is excluded on the next fold, not by editing the already served image. |
| Metadata visibility / external edits | TS project epochs/workspace fingerprints can request HARD (`inject-compartments.ts:1888–1918`); Rust external revision includes them (`m1_compose.rs:276–292`). | Do not use these channels for lifecycle review. Preserve existing explicit ownership/privacy/membership invalidations; a real privacy revocation is a policy change, not a background decay ride. Do not promise those existing safety actions will wait. |
| Compartment rescore | Base UPDATE triggers version/rewrite changes and affects Rust full-row boundary identity; details are in `compartment-rescore.md:23–51` (`storage-compartment-history-version.ts:33–55`; `crates/mc-store/src/context_boundaries.rs:44–49,184–201`). | Overlay writes only; keep original rows/boundary fingerprints. Join render-only overrides after natural HARD selection; never enqueue an m0 mutation or use the privileged writer bracket to conceal a base UPDATE. |
| Marker-only Rust HARD probe | Rust speculatively composes m[0] to determine whether a marker HARD actually changes provider bytes (`crates/mc-module/src/transform.rs:4595–4669`). | Use the last-applied lifecycle/score/clock snapshot for this probe **and the eventual byte-identical marker commit**. Pending decay/repair must not turn a marker-only fold into the very cache loss that then “authorizes” it. Both normal and no-live-head branches need this rule (`transform.rs:3035–3173`). |
| First render, config/identity/TTL, structural rewrite, pressure | TS enumerates existing reasons (`inject-compartments.ts:1764–1785,1793–1885,1941–1945`); Pi has its own materialization gates (`inject-compartments-pi.ts:1059–1272`); Rust separates independent cache loss/content work (`transform.rs:4602–4654`). | Adopt latest approved lifecycle revisions on these independently necessary changed-head/cold paths. Add no lifecycle HARD trigger or eager renderer upgrade. A selection-policy version is recorded when adopted, not an upgrade-wide invalidation. |
| Contention/recovery fallback | TS keeps a complete cached pair on contention; first/explicit force recovery may produce fresh non-persisted bytes (`inject-compartments.ts:3972–4027,4064–4080`). | Complete-pair replay stays exact. A no-cache/independently forced recovery uses one consistent latest snapshot for text, image and IDs; failure cannot mix an old mural with new weights. No lifecycle operation sets force/emergency. |

### Backfill needs a stronger barrier than ordinary live writes

Merely writing backfill content to `memories` and adding ordinary mutation-log entries is **not** enough: a priced SOFT rereads live eligible memories and mutations, before the next HARD (`inject-compartments.ts:2900–2925,2944–2975`). Suppressing the mutation log alone is also insufficient for already-added m[1] rows whose content is reread.

Use a versioned **prompt projection** distinct from canonical approved search state. Journal every prompt-affecting memory revision; record a per-session applied backfill watermark with the HARD snapshot. A render loader reconstructs the approved revision eligible for that session, not whatever canonical base row was last edited. Backfill revisions and their archives/additions stay excluded until a natural HARD advances that watermark. Later live observations of a backfilled row resolve against canonical state, but their prompt deltas must be withheld or rebased against that session's applied version; they cannot leak the deferred bulk revision as a side effect.

This is render-only version selection, **not searchable cold copies**. History is private audit; ordinary search uses only canonical active claims. Weight/tier adoption uses the same applied projection. A SOFT may incorporate independent live corrections while keeping bulk repair revisions frozen; a HARD atomically adopts the latest approved bulk set, reselects tiers, folds corrections and updates visible IDs/cursors. Undo follows the same barrier. This extra loader/journal work is a prerequisite for the promise “nothing from repair until next natural rebuild,” not a claim that the base already provides it.

### Tests that establish safety

- Publish a candidate, proof, verification-only update, classification, cue and backfill revision between warm passes. Assert identical **actual served** m[0]/m[1]/image/boundary bytes, unchanged materialization time and no new HARD/SOFT opportunity. Include restart and a complete-pair contention fallback.
- On an independent SOFT, demonstrate a live admission/correction while old tier choices and unapplied bulk revisions remain frozen. On a natural HARD, demonstrate a threshold-crossing fixture changes the intended text/cue/search tier and advances applied watermarks atomically. Derive expected membership independently of the renderer.
- Test byte-identical marker HARDs, nonzero external history counters, migration-seeded histories, no-live-head transforms, force recovery and speculative composition. A passing sidecar insert test does not prove this.
- Assert archived/superseded rows never appear in ordinary semantic, FTS **or ID** search; history lookup/restore remains explicit. Test stale embeddings, successor chains/cycles, archived hash collisions and ID-manifest correctness.
- Assert genuine external content repair still invalidates boundaries/HARD as before, and privacy/membership revocation is not accidentally suppressed.

Implementation slices must non-vacuity-probe silent invariants: introduce a base compartment score UPDATE, an eager lifecycle epoch, a latest-revision leak into the marker probe, and a bulk-repair leak through m[1]. Record the exact red test and green peers with safe staged restore. This document does not claim those product tests or mutations have been run.

## 8. Rust and Pi parity plan

The Rust module owns trigger/chunk/prompt/validation/publication regardless of whether completion runs through a host or Broca (`crates/mc-module/src/historian_runner.rs:1–19`). OpenCode harnesses default to host; others default to Broca. **Pi/OMP do not bind a Rust transform route today** (`:58–76`), so parity here means their TS runner as well as Rust's two completion transports, not an existing Pi-on-Rust deployment.

| Component | Required work |
| --- | --- |
| Shared prompt/parser/applier | Add anchored first-turn facts, readable reconcile prompt, per-fact decisions, inventory/evidence/token validation and non-destructive apply contracts. Generate TS/Rust assets and golden fixtures together. Keep memory identity, normalized hash, evidence keys and source-hash serialization identical across languages. |
| TS OpenCode | Extend hidden child execution with a retained same-session continuation handle. Publish candidates even when final memory authority is module-owned; route decision apply to that owner. Separate compartment progress from memory reconciliation failure. |
| Rust host runner | Existing claim protocol takes one assembled prompt and reports one terminal text (`packages/plugin/src/hooks/magic-context/historian-host-runner.ts:17–34,78–96`). Add a stage-aware claim/report continuation protocol and durable child-session identity; turn-one completion must not purge the child before turn two. Claim token, heartbeat, project binding and per-stage run IDs remain authoritative. |
| Rust Broca producer | Extend producer continuation **and send identity**. Current `start_with_generation` uses session ID as `send_id` (`crates/mc-module/src/historian_producer.rs:830–888`); sending turn two with that same dedup key risks replaying turn one's admission. Use a stable per-attempt/per-turn send key with the same session route, different run IDs and idempotent reconnects. Persist stage/run status; recover unknown outcomes before redispatch. |
| Rust publication/store | Split episodic publication from resolved memory decisions with a durable pending queue; retain current chunk/source/fence CAS (`historian.rs:798–906`). Share history/proof/revision apply and authority fencing across native/host single-store writers. Align the exact-repeat contracts rather than silently converting synthetic legacy hashes wholesale. |
| Pi | Extend `pi-historian-runner.ts` and its completion carrier for same-conversation turns, per-fact retry and project authority; update its separate materializer/mural/adoption paths. If a carrier cannot continue, refuse/retain pending facts rather than secretly substitute a fresh-context call advertised as cached. |
| Sweeps and management | Row verification/evidence parity, fixed classify anchors/class output, explicit history/restore and shared repair status/confirmation. Tool-loop tasks still report unsupported capabilities. Commands must address the actual owner, not an obsolete local mirror. |

Test both transports for stage-specific idempotency, canceled/queued admissions, lost send reply, late completion after lease loss, empty extraction, partial malformed facts, stale targets and crash boundaries. Add run-ledger coverage for both turns and writer paths: the current missing Rust historian telemetry identified by the run-size report would otherwise bias the rollout measurements. Log actual model/fallback, cache/usage counters and pending reasons, without raw memory text in public logs.

## 9. Migration and release ordering

### One forward lifecycle migration

Include the memory history/proof/decay/review/revision fields, evidence/revision journal, pending queue, compartment rescore overlay and resumable job tables in **one context.db migration**. There is no paid backfill in it. Reuse base memory IDs/first-seen fields and the rescore design; do not add a second overlay when that implementation lands first.

| Schema group | Minimum contents and constraints |
| --- | --- |
| `memories` additions | `history` JSON with an empty default; nullable `decay_class` until reviewed; nonnegative `proof_count`; nullable `last_reinforced_at`; lifecycle rubric/review provenance and monotonic content revision. Unknown legacy values are honest, not guessed standing rules. Preserve original content/status at migration. |
| `memory_evidence` / `memory_revisions` | Memory/project ownership, unique observation/revision keys, source references/hash/time/actor, claim applicability and complete before/after metadata. Revisions provide reversible history and prompt projection; evidence supports proof counts. Content references must survive a deliberate compartment recomp or be visibly unavailable. |
| `pending_memory_facts` | Session/harness/project/publication/fact identity, original fact/evidence, stage/attempt/run IDs, lease/retry/review state. Unique durable fact key; no prompt/FTS/embedding-watermark participation until admission. |
| `compartment_score_revisions` | Session/compartment/source identity, old/new score, rubric/model/prompt/job provenance, active revision selection and audit. Base `compartments` stays unchanged, as specified in `compartment-rescore.md:53–74`. |
| `memory_lifecycle_jobs` / job items | Project-owned confirmed input set, profiles/budget/cutoff, attempt accounting, item CAS/state, approved old/new values, errors and undo lineage. Use the same service for repair and score subjobs. A project job is not owned by the session that happened to launch it. |
| Applied prompt state | Persist applied bulk-repair/score revision watermarks, lifecycle policy/time and tier/visible-ID manifests with the existing frozen snapshot transaction. No trigger compares pending watermarks to force a render. |

Explicitly register **every exact `session_id`-owned table** in `SESSION_SCOPED_TABLES`: `pending_memory_facts`, `compartment_score_revisions`, session-owned repair/score items and any session-applied-state sidecar, with `harnessScoped: true` where that column exists. Delete dependent overlay/items before compartments; preserve remaining-harness protection where shared session rows survive. The current list/deletion loop is at `packages/plugin/src/features/magic-context/storage-session-tables.ts:12–62,106–129`.

Project jobs, memory-owned evidence/revisions/history and memories themselves do **not** join that list merely because they carry source-session provenance. Use source-qualified field names rather than accidental session ownership; implement separate project/memory cleanup and export/clone remapping. Deliberate session deletion cancels its pending facts and removes owned score state, while retained memory evidence becomes an unavailable-source citation with its audit intact. Job items referencing removed evidence become stale; do not mark the project job complete. Add schema-derived cleanup, harness collision, clone/export, revert, authority handoff and project-delete tests.

Update fresh-schema DDL, migration-worker path, TS/Pi/CLI/dashboard readers, module domain-table allowlist/fingerprints, schema goldens and both writer implementations together. At this base the TS supported fence is **94** (`packages/plugin/src/features/magic-context/storage-db.ts:163`; migration `migrations.ts:3194`). Rust reports built context fence **93**, but uses per-table fingerprints rather than rejecting solely on the lane number (`crates/mc-module/src/host_store.rs:58–95`). Bump the supported/built lifecycle fence coherently and regenerate the fingerprints; adding columns to a writer-owned table is not safely ignored by an old writer. Do not bypass authority guards or add compatibility triggers to conceal skew. No store.db migration is proposed unless implementing the frozen applied-state contract proves it needs persistent fields there; decide that before allocating the release migration.

### Relative to the unreleased performance batch

`docs/designs/perf-audit-migration-batch.md` is **absent at this base**, not an alternate pathname. It was supplied for review from an unmerged revision: initial plan `7c496fa372dba4dfdc7d7ce79935bced75956b33`, reduced implementation `d909961bd2326a3f346c23c31d1f74c98171830b`, with later branch documentation inspected. The original broader payload/ledger proposal was reduced; the approved batch is index additions, redundant tag-index removal and the commit-search delete rowid map, not a payload split. The operator also identifies frozen Pi idle-gap markers as sharing the unreleased **v95** release batch.

**Order: land/rehearse v95, then the lifecycle migration is v96 at the earliest; confirm the actual version at merge time.** Do not reuse v95, edit a previously shipped migration or rely on the old plan's rejected tables. Rebase schema/fingerprints on the final combined v95, including Pi's marker table and session cleanup handling. Test the incremental path and fresh install, older-writer fail-closed behavior, worker startup/restart and preservation of existing frozen bytes. Version/fingerprint allocation is a release prerequisite, not an assumption hidden in an individual implementation slice.

## 10. Rollout and implementation slices

Each row is a bounded worker assignment with a reviewable contract/test set, not a fleet-wide refactor. Schema-dependent slices can prototype against fixtures before the single migration is allocated. Keep feature activation off until cache/authority parity gates pass.

| Slice | Deliverable | Acceptance and dependency |
| --- | --- | --- |
| Verification contract repair | Align TS/module row status, complete files, checked commit and reinforcement result; audit query for mismatches. | Tests for confirmed/skipped/refused/stale revisions and both authorities. No mass live repair. Can land independently before decay. |
| Lifecycle schema and journal | One migration, evidence/pending/revision/job contracts, cleanup/export and authority/fingerprint updates. | Copy-only upgrade/restart, fresh-schema parity and frozen-byte preservation; after final v95 allocation. No inference. |
| Non-destructive applier | CAS/idempotent new/covered/transition/restore, claim-specific proofs, histories and archived-ID search exclusion. | Concurrent edits, archived hash collision, successor chains, metadata undo and no-loss queue tests. |
| Reconcile prompt and validator | Anchored fact schema, fixed readable prompt, reserved lexical slot and per-fact deterministic gates. | Shared TS/Rust golden validation; lexical-long-memory and semantic-loss controls; shadow replay. No automatic existing-row rewrite. |
| TS OpenCode continuation | Same-child second turn, bounded pending retry and failure isolation. | Both host generations, crash/reattach, partial fact failures, zero-fact path and authority handoff. |
| Rust host continuation | Stage-aware claim/report and child lifecycle. | Project binding, heartbeat/late report, retained first exchange and publisher-only ownership. Separate from Broca work. |
| Rust Broca continuation | Per-turn send identity, stage state/usage and recovery. | Same session/different run, duplicate send, unknown outcome and restart tests; no duplicate billing/admission. |
| Pi continuation | Same-turn contract and pending/applier routing through Pi carrier. | Pi-specific cancellation/context limits and no-fresh-session masquerading as cached. |
| Classification calibration | Blind current-score input, fixed scored anchors, decay-class/origin output and periodic review gate. | Fixed-text memory trial with repeats and privacy controls; no forced histogram. |
| Memory attention projection | Weight/class policy, applied revision/time snapshots and shared text/mural tier selection. | TS/Pi/Rust served-byte parity, independently predicted tiers and mutation-backed cache guards. Split per runtime with shared fixtures. |
| Bulk prompt adoption barrier | Versioned prompt loader/watermarks, ordinary SOFT pinning and marker-probe protection. | Backfill cannot leak through content, archive, newer live update, ID watermark or image; undo and restart. Required before repair UI. |
| Stale/event sweeps | Evidence retrieval/proposals, event re-anchoring, preservation review and backlog/status. | Next stale trial; no automatic retirement. Ordinary curate routes through the same applier. |
| Repair/score job engine | Resumable frozen-input pipeline and rescore overlay with costs, leases, CAS and rollback. | Disconnect/crash/accounting races, stale items and natural adoption. No slash/UI-specific logic. |
| Operator surfaces | Slash preview/confirmation/status/resume/undo; doctor read-only audit; later opt-in dreamer execution. | Scope/cost disclosure and supported-host refusal; copied-project rehearsal before any live confirmation. |
| Configuration retirement | Remove auto-promote/unused retrieval threshold across config, readers and UIs. | Explicit handling of prior opt-outs and release notes; only after replacement admission path is available. |

Roll out in stages: repair verification accounting; shadow both-turn reconciliation; approval-gated transitions with durable pending; blind classification and shadow attention tiers; opt-in new admissions/reinforcements; cache-safe tier adoption; then confirmed backfill. Autonomous transitions/retirement are a separate release decision requiring held-out preservation evidence, not an automatic consequence of completing this plan.

## 11. Open questions, with recommendations

| Question | Recommendation |
| --- | --- |
| Exact structural/situational half-lives and tier floors? | Leave unconfigured in active behavior until fixed-corpus fold/retrieval replay measures loss of useful claims and cue capacity. Use the agreed months versus days/weeks ordering; publish chosen parameters as design choices, not trial estimates. |
| Can a token gate authorize transitions alone? | No. Keep approval for rewrites/revocations; investigate an independent claim-preservation/contradiction check. Keep pending facts on abstention so avoiding destruction does not require duplicate insertion. |
| How much hybrid context and how many lexical slots? | Guarantee a lexical reservation first; choose total capacity from an ablation with the long procedural rule. Full-pool RRF may help, but the bounded trial did not establish it. |
| Which proofs count and how are correlated repeats treated? | Count unique grounded observations, not attempts/exposures; retain event type/source so code confirmations and real work can be separated in diagnostics. Use does restore freshness but does not prove truth. |
| Unknown-origin permanent/directive legacy rows? | Require origin review; preserve existing instructions during shadow rollout rather than silently demoting or blessing them. Backfill must prove standing eligibility. |
| What does “out of the prompt” mean after archive? | No future new rendering of the old row; frozen already-served text/image persists until an independent correction/fold. Show pending adoption. Immediate physical erasure would contradict cache preservation; explicit privacy revocations retain their existing stronger policy path. |
| Is the versioned prompt loader worth the complexity? | Yes if bulk repair truly must wait for HARD. Otherwise explicitly renegotiate that promise; ordinary mutation log suppression is not a substitute. Build it before backfill, not as a post-release cache fix. |
| Keep events or drop them? | Keep optional, grounded provenance and repair anchors first. Do not grant standing status to test/self-review pivots. Evaluate incremental evidence usefulness; remove production only if it provides no useful signal. |
| What happens to previous auto-promotion opt-outs? | Require explicit acknowledgement/configuration choice before enabling reconcile admissions. Keep memory-off authoritative; do not silently treat a removed flag as consent. |
| Can doctor run paid jobs without an active harness? | Read-only first. Add an authenticated project broker only as a separate reviewed executor; never discover secrets or select a cheaper model silently. |
| How should backfill handle multiple registered histories? | Preview them all for the canonical project/scope, disclose imported/missing evidence, and require confirmation. Do not claim the long-session operating assumption is enforced by storage. |

## 12. What the trials still need to tell us

- A fresh paired full-memory/stripped first-turn control: durable-fact recall and false omissions, not just emitted counts. Actual provider cache/billing counters are needed before a savings claim.
- Dedicated lexical-slot and per-fact validation ablations: target recall for long rules, partial schema failures, duplicate suppression and pending-queue workload. V2's effective-new count includes fallback artifacts.
- Independent preservation judging on fixed claim inventories and held-out contradictions: bounds, negations, definite guarantees, cross-runtime exceptions and workaround-versus-revocation. Repeat controls and multiple reviewers, not token presence alone.
- Blind memory importance/class calibration against consequence and breadth. Compartment scoring results are motivation, not a memory ground truth or proof of chosen half-lives.
- **Next stale-reconcile results:** fill the placeholder above; measure false retirement of still-binding rules and the surrounding caller context needed to avoid the completed trial's errors.
- Copied-store verification audit supporting the supplied row/check count discrepancy, separated by authority and content revision; event inventory/anchor coverage supporting the supplied event count.
- Backfill evidence tracing quality: first occurrence accuracy, distinct-proof overcount from repeated narratives/imports, missing evidence and transition resolution before episode archival.
- Natural-fold attention replay in every runtime: full-text loss, mural usefulness, search-only discoverability, standing-rule budget saturation and unreinforced but still-true constraints. No desired score histogram.
- Repair-job cost and retry behavior at actual project sizes, including embedding incompatibility/missing coverage, unknown admitted-run outcomes, approval latency and dormant-session adoption.
- End-to-end cache evidence for the new loader/journal: warm defers, priced SOFT, natural HARD, marker-only HARD, restart and undo against independent served-byte expectations. None of the model trials proves these runtime invariants.

The intended outcome is not fewer memories at any cost. It is a current, evidence-backed claim set that can explain how it changed, spend prompt attention deliberately, and repair its past without losing either knowledge or the cache contract.

### Reading the evidence

- [Historian importance anchoring](../reports/historian-importance-anchoring.md)
- [Historian scoring prompt trial](../reports/historian-scoring-prompt-trial.md)
- [Compartment rescore trial](../reports/compartment-rescore-trial.md)
- [First merge-turn trial](../reports/historian-merge-turn-trial.md)
- [Revised merge-turn trial](../reports/historian-merge-turn-trial-v2.md)
- [Curate stale-retirement trial](../reports/curate-stale-retirement-trial.md)
- [Historian run size and telemetry coverage](../reports/historian-run-size.md)
- [Historian memory promotion](../reports/historian-memory-promotion.md)
- [Compartment rescore design](compartment-rescore.md)
