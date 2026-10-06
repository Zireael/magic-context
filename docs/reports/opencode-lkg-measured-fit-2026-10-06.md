# OpenCode LKG replay: measured request plus appended tail

## Wrong refusal and its source

The read-only OpenCode plugin log resolved by `getconf DARWIN_USER_TEMP_DIR`
contained **one** `lkg_over_context_limit` entry on **2026-10-06 UTC**, in session
`ses_313660571ffeZTsf4koSJwk50Q`, at `00:43:24.386Z`. The snapshot inspected at
`00:57:50Z` contained 125,835 lines spanning October 5–6. This is a count of
logged fit refusals, not a claim that every other refusal used this reason.

The preceding successful Rust capture was row version `44699`, committed at
`00:37:09.079Z`. Response `msg_10ea47980001qTlLBO5d6Wz5Es` then reported
`input=2`, `cache.read=632864`, `cache.write=392`: **633258 input tokens** at
`00:37:12.532Z` against the 872000 limit. Duplicate usage events reported the
same response; the refusal itself appeared only once.

The 912733 figure is **not** provider usage and is **not** the byte proxy
(399962). `replayLastGood` calls `lkgReplayFits`, which formerly passed the
**entire saved prefix plus new tail** to `estimateFinalWireInputTokens`:

1. `estimateMessageTokens` tokenizes provider-visible text/tool contents using
   `read-session-formatting`'s **ai-tokenizer Claude encoding** (plus bounded
   image estimates). Tool metadata that stays inside OpenCode is excluded.
2. It adds the separately observed system prompt and tool-definition count.
3. `providerMass(..., fit=true)` applies the static decision calibration. For
   `anthropic/claude-opus-5-5`, the longest matching seed is
   `anthropic/claude-opus-5` in revision
   `2026-09-30-sol-tokenizer-seeds-v3`: system **1.511497**, tools **1.551639**,
   prose **1.571778**. Thus the old estimate is

   `ceil(systemLocal*1.511497 + (toolDefinitionsLocal+toolContentsLocal)*1.551639 + conversationLocal*1.571778)`.

There is no use of the accepted request's measurement in that calculation.
System and tool definitions are added once, not twice; the error is pricing
the whole accepted request again using an approximate tokenizer and static
ratios. The result is about **1.4413 times** the reported input. The log does not
contain the local component counts for this failed replay, so reconstructing
its individual summands would require the live store; no live store was opened.

## Admission now

OpenCode 1 records the response id from the zero-usage assistant event before
the request transform. A capture claims that identity once, and only usage for
that exact response/model can bind to it. Rust snapshots freeze the identity
when prepared, before their asynchronous commit.

OpenCode 2 has an append-only reply store rather than OpenCode 1's pre-created
assistant event. Its context hook records a request identity with the preceding
assistant row id. Its existing usage read binds a new completed response to that
request only before another request starts, excluding the preceding row and rows
created before the request. Replay additionally requires that exact response id
to be the first appended assistant at the saved prefix's seam.

For both hosts, the usage basis retains the capture identity (timestamp,
sequence, row version, model/provider, input ids/digests and saved wire bytes).
Admission checks that identity against the current LKG slot, compares the
replayed prefix's exact bytes, and checks the observed envelope counters/agent
are unchanged. Missing identity after restart, a replaced slot, model switch,
prefix strip/edit, duplicate old usage or mismatched reply uses the existing
full estimator instead. No schema changes or persisted usage attribution are
introduced. A TypeScript snapshot that excludes an active tool tail is not a
complete measured request and also uses the full estimator.

For a matching measurement, fit is **provider input total + calibrated estimate
of only the appended messages**, including the prior assistant reply, which
becomes new input. The system and tool-definition envelope is already in the
measurement and is not added again. The independent four-byte/token proxy
checks only the tail against the remaining budget. Unknown tail parts or a
missing tokenizer remain unproven rather than silently admitted.

The Rust failure replay, wrapper replay and healthy frozen-replay comparison
share this admission. The TypeScript wrapper previously had no numeric replay
guard; for a known model/limit it now uses the same admission, with full-estimate
fallback when no usage matches. Its legacy unknown-model/unknown-limit path is
unchanged. Raw-history fallback admission is unchanged.

## Isolation and regression coverage

Verification uses repository unit/integration fixtures only, with all XDG
homes, OpenCode database override, Magic Context storage override and TMPDIR
under a task-owned throwaway root. No OpenCode host or provider was launched;
no live database/configuration was opened, migrated or written. The plugin log
was read without modification.

Regression tests cover 633258 measured tokens with an inflated full estimate,
near-limit input plus a large tail, a tail that passes the byte proxy but fails
calibrated token fit, and full estimation when attribution does not match. They
exercise TypeScript wrapper serving/refusal and both hosts' Rust failure paths,
alongside identity, envelope, prefix mutation and unknown-tail controls.
