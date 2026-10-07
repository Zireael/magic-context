# Opus 5.5 preserved-thinking matrix: not yet run (quota blocked)

**Attempt:** 2026-10-07, 09:56:28–09:56:30 UTC. Repository base:
`392930c8c167e84d148290f464a28fe9269f26cc`. Route: Anthropic native Messages
(`https://api.anthropic.com/v1/messages`), default vault credential
`oauth:anthropic`, accessed only through the enrolled `mc-e2e` consumer.

## Result

**The requested signed-thinking matrix is not yet run live.** The first seed
request for **both `claude-opus-5-5` and `claude-sonnet-5-5` returned HTTP 429**.
Neither model generated any thinking, tool use, or completed conversation turn.
Consequently, no unchanged next-request control or thinking mutation was reached.
No cache read/write was measured. These are quota rejections, not signature
validation results; they neither confirm nor contradict memory #23609 or #22050.

After these two rejections, the reviewer explicitly directed stopping and
committing the quota-blocked evidence and locally tested harness, without using
another account. There was no alternate-account access, retry, or quota polling.

Machine-readable, reduced evidence:
[`2026-10-07-quota-blocked.json`](../evidence/live-thinking-trim-opus-5-5/2026-10-07-quota-blocked.json).
It contains timestamps, upstream status/request IDs, verbatim error bodies, null
usage, hashed request shapes, and disposable-host isolation evidence. It contains
no bearer headers, credentials, thinking text, or signatures.

## Actual upstream responses

| Model / reached request | Actual status | Request ID | Usage: input / cache read / cache write / output |
| --- | --- | --- | --- |
| `claude-opus-5-5` / `seed-1-tool` | **429** | `req_011CfngDmtuHEVT47wjeHyZX` | absent / absent / absent / absent (`usage: null`) |
| `claude-sonnet-5-5` / `seed-1-tool` | **429** | `req_011CfngDrFqMUJZQaTgj98xg` | absent / absent / absent / absent (`usage: null`) |

Verbatim Opus error body:

```json
{"type":"error","error":{"type":"rate_limit_error","message":"This request would exceed your account's rate limit. Please try again later."},"request_id":"req_011CfngDmtuHEVT47wjeHyZX"}
```

Verbatim Sonnet error body:

```json
{"type":"error","error":{"type":"rate_limit_error","message":"This request would exceed your account's rate limit. Please try again later."},"request_id":"req_011CfngDrFqMUJZQaTgj98xg"}
```

**Total real model HTTP calls: 2, both rejected.** There were zero observed
generated output tokens; provider-reported token usage and actual billing are
unknown because the errors omit usage. Do not treat missing usage as measured
zero, or derive tokens from request bytes (33,213 for Opus; 33,215 for Sonnet).
No transformation diagnostics were present in these error bodies. That absence
is not acceptance evidence.

## Requested variants: expected versus actual

“Not reached” means **no HTTP request for that variant was sent**, not HTTP 429
for a mutated history. The 429s above occurred before any history existed.
All variant usage is **not measured**, including the unchanged control's cache
read/write. No error body exists for an unsent request.

### `claude-opus-5-5`

| Variant | Expected | Actual status | Error text (verbatim relevant part) |
| --- | --- | --- | --- |
| 1. Unchanged next-request control | 200; inspect usage and cache reads/writes | Not reached | None: not sent |
| 2. Oldest signed thinking block removed | 200 (#23609: contiguous oldest prefix) | Not reached | None: not sent |
| 3. Oldest two signed thinking blocks removed | 200 (#23609: contiguous oldest prefix) | Not reached | None: not sent |
| 4. Second signed block removed, later signed blocks retained | 400/signature error (#23609: middle gap) | Not reached | None: not sent |
| 5. Second signed block and every later thinking block removed | 200 (#23609: suffix removal) | Not reached | None: not sent |
| 6. All thinking removed | 200 (#23609) | Not reached | None: not sent |
| 7a. First tool result's text edited, later signed thinking retained | 400/signature error (#23609) | Not reached | None: not sent |
| 7b. Same tool-result edit, every later thinking block stripped | 200 (#23609); earlier signed block retained | Not reached | None: not sent |
| 8a. First user text re-rendered, later signed thinking retained | 400/signature error (#23609) | Not reached | None: not sent |
| 8b. Same first-user edit, every later thinking block stripped | 200 (#23609); no signed blocks remain | Not reached | None: not sent |
| 9. First signed thinking block's text replaced by literal `[cleared]`, original signature retained | 400: Anthropic analogue of #22050 (which explicitly names Vertex, Bedrock and Copilot) | Not reached | None: not sent |

### `claude-sonnet-5-5`

| Variant | Expected | Actual status | Error text (verbatim relevant part) |
| --- | --- | --- | --- |
| Unchanged control (additional baseline for the minimal pair) | 200; inspect usage and cache reads/writes | Not reached | None: not sent |
| 2. Oldest signed thinking block removed | 200 (#23609) | Not reached | None: not sent |
| 4. Second signed block removed, later signed blocks retained | 400/signature error (#23609) | Not reached | None: not sent |

### Comparison with project memory

**No reality-versus-memory difference was established.** #23609's oldest-prefix,
suffix, middle-gap, earlier-edit and all-removal claims remain **unverified by
this attempt**, as does the Anthropic analogue of #22050's literal `[cleared]`
rejection. Restoring previously removed blocks, editing tool inputs, other
models (including Fable 5.1), and Vertex/Bedrock/Copilot are outside this matrix
and were not tested. No product behavior or memory claim should be changed on
the strength of these two rate limits.

## Harness and request configuration

The existing MC `claude-oauth:trim-only` scenario exercises MC's real age/flush
edits and does not permit arbitrary wire mutations. The added
`packages/e2e-tests/src/live-providers/thinking-matrix-live.ts` is an independent
native-wire experiment sharing the vault, installed-auth bootstrap, isolation,
request-shape, usage and error readers with that harness. **It is not an
end-to-end proof of MC's actual stripping or m0/m1 rendering.** No product code,
`ARCHITECTURE.md`, or `STRUCTURE.md` was changed.

- The installed Anthropic OpenCode auth dist shapes one **loopback-only** request.
  The loopback rejects it locally; **zero** bootstrap requests reach Anthropic.
  Bearer headers are captured in memory, never printed or persisted in evidence.
  Only the auth plugin's first system block is retained in the native client;
  host/MC tool definitions and subsequent system blocks are not replayed.
- The client sends adaptive summarized thinking, low effort, **max output 512**,
  `thinking.block_binding.prefix_mismatch_behavior: "error"`, and the
  `thinking-binding-controls-2026-08-01` beta. These settings were sent on the
  rejected seeds; successful signed generation at this budget is **not proven**.
- A static system block contains 4,600 repetitions of ` anchor` and an explicit
  five-minute ephemeral cache breakpoint, deliberately sized for the cache
  minimum. The output cap is small; the cache anchor is input, not generation.
  Its tokenizer size/cache eligibility and any cache hit still need live proof.
  A positive read here would establish static-system caching, **not** survival of
  cached conversation history across edits.
- One conversation per model is allowed. Echo tool results return the model's
  supplied string unchanged. Each tool round must finish with `end_turn` before
  another user turn, avoiding the separate rule for thinking in an unfinished
  tool continuation. Up to four rounds are permitted to obtain at least four
  signed blocks across at least two completed turns; insufficient thinking aborts.
- Each variant clones the same completed seed and identical next-user prompt.
  Branch responses are discarded, never appended to a later branch. “Middle”
  is the second signed block. Tool-result edits change only its text and preserve
  IDs/inputs. The first-user re-render appends `Rendered context marker: m0 -> m1.`
  to its original text, isolating a prefix-content change rather than invoking
  MC's renderer. `[cleared]` changes text but preserves the signature.
- Errors are recorded from the real upstream response, not the existing recorder's
  synthetic host-facing 400. A rate limit stops that model without retries;
  the other model receives at most its own initial seed probe before stopping
  if also rate-limited. An authentication rejection stops both models.
  The maximum complete matrix uses 30 calls; the hard budget is 32.

The bootstrap host was **OpenCode 1.18.30**, PID **60427**. Before and after its
loopback request, `lsof` showed only OpenCode and MC `.db`, `-wal`, and `-shm`
handles under its throwaway root. The root was removed when the host stopped,
including the mode-0600 bearer slot and auth state. HOME/XDG roots, OpenCode DB,
MC storage/logs, and child TMPDIR were disposable. This is sampled host isolation,
not a continuous descendant/network audit. No operator credential/config file was
opened directly, and no account roster was used for fallback.

## Verification and rerun

Local checks use **Bun 1.4.2** and **TypeScript 5.9.3**:

- `timeout 90 bun test --timeout 30000 packages/e2e-tests/src/live-providers`:
  **26 passed, 1 optional installed-dist smoke skipped, 0 failed**; 92 assertions.
  Five new tests cover the minimum signed-history guard, exact independent
  variants, keep/strip edit pairs, and literal `[cleared]` with unchanged signature.
- `timeout 90 bun packages/e2e-tests/node_modules/typescript/bin/tsc --noEmit -p packages/e2e-tests/tsconfig.live-providers.json`:
  **passed**, scoped to the live-provider harness (silent on success).
- Non-vacuity: disabling the minimum-four-signed-block guard reddened only
  `signed-thinking request matrix > refuses insufficient or unsigned history before constructing variants`;
  the other four matrix tests passed. The mutant was restored before delivery.

The live command below ran once on the default credential, exited **1**, and
produced the two 429 records above. When that account's quota resets, run the
same harness with a **fresh output directory**, then inspect all statuses, usage,
signed-history hashes and transformation diagnostics before drawing conclusions:

```sh
MC_LIVE_PROVIDERS=1 MC_LIVE_MAX_CALLS=32 timeout --kill-after=30s 600s \
  bun packages/e2e-tests/src/live-providers/thinking-matrix-live.ts \
  --opencode /Users/ufukaltinok/.opencode/bin/opencode \
  --anthropic-auth /Users/ufukaltinok/Work/Projects/CortexKit/anthropic-auth/packages/opencode/dist/index.js \
  --out "$TMPDIR/magic-context/live-providers/thinking-matrix-$(date -u +%Y%m%dT%H%M%SZ)"
```

The harness's `completed` outcome means every variant was reached, not that each
expectation matched. Its generated-history paths and live cache behavior remain
untested until a seed succeeds; offline fixture tests are not provider proofs.
