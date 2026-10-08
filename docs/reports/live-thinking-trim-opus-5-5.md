# Opus/Sonnet 5.5 preserved-thinking matrix: not reached (seed blocker)

**Updated:** 2026-10-08. Route: Anthropic native Messages (`https://api.anthropic.com/v1/messages`), default vault credential `oauth:anthropic`, through the enrolled `mc-e2e` consumer. No account rotation was used. Two post-quota live attempts were made; both were seed-only and sent no matrix variants.

## Seeding reruns

### Attempt A: manual `enabled` thinking (unsupported mode)

This attempt used `thinking: {type: "enabled", budget_tokens: 1024}` with a 1,152-token response cap. Current [Anthropic thinking-mode documentation](https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking#migrating-to-adaptive-thinking) says `type: "enabled"` returns 400 for Claude Opus 5.5 and Sonnet 5.5; these models require adaptive thinking and effort control. The service accepted the requests with HTTP 200 but usage reported zero thinking tokens on every response. Each model completed eight tool rounds, accumulated zero signed blocks, and stopped before all matrix variants. Total: 32 model calls, all HTTP 200, no 429.

### Attempt B: documented adaptive/high mode

After switching seed requests to `thinking: {type: "adaptive"}` and `output_config: {effort: "high"}`, with short multi-step arithmetic prompts and a benign `record_note` tool, the runner used the eight-round cap. All 26 upstream requests returned HTTP 200; none returned 429. Opus accumulated one signed block in round 1, one in round 2, and none in completed round 3. Round 4's tool request and its one neutral-prompt retry both returned `stop_reason: refusal`, so Opus stopped with two signed blocks across three completed rounds. Sonnet completed all eight rounds with zero signed blocks. No control, trim, edit, restoration, or `[cleared]` variant was sent. The run exited 1 as designed for insufficient signed history.

| Model | Per-round signed blocks (adaptive/high) | Result |
| --- | --- | --- |
| `claude-opus-5-5` | 1, 1, 0; round 4 incomplete after two refusals | 2 blocks / 3 completed rounds; seed aborted |
| `claude-sonnet-5-5` | 0, 0, 0, 0, 0, 0, 0, 0 | 0 blocks / 8 completed rounds; seed aborted |

### Requested claims, per model

All claims remain **unverified**: the relevant variant calls were not reached, so there are no variant request IDs and the live provider neither confirms nor contradicts any signature rule. The revised harness now defines the same trim/edit cells for both models, but the seed guard prevents sending them without enough signed history.

| Claim | Opus 5.5 | Sonnet 5.5 |
| --- | --- | --- |
| Removing a contiguous oldest prefix is accepted | Not tested; no variant request ID | Not tested; no variant request ID |
| Removing from the end, or all thinking blocks, is accepted | Not tested; no variant request ID | Not tested; no variant request ID |
| Removing one block from the middle invalidates later blocks (400) | Not tested; no variant request ID | Not tested; no variant request ID |
| Restoring a removed block invalidates later blocks produced while it was absent | Not tested; no restore-check request ID | Not tested; no restore-check request ID |
| Editing earlier tool inputs/results or re-rendering the first user message invalidates later signed blocks | Not tested; no edit request IDs | Not tested; no edit request IDs |
| Replacing signed thinking text with `[cleared]` returns 400 | Not tested; no request ID | Not tested; no request ID |
| `[cleared]` on Vertex, Bedrock, or Copilot | Not covered; Anthropic-only route | Not covered; Anthropic-only route |

### Attempt A seed request IDs

All 32 responses were HTTP 200 with `thinking_tokens: 0`. IDs are listed as tool/final pairs per round.

| Model | Round | Tool request ID | Final request ID |
| --- | --- | --- | --- |
| `claude-opus-5-5` | 1 | `req_011Cfp2k3nYYNt4UyX7Uy6oF` | `req_011Cfp2kAj1JvUeTfys8oPPL` |
| `claude-opus-5-5` | 2 | `req_011Cfp2kFqavogjsQ86SjZFZ` | `req_011Cfp2kNZtzRaTD6Td2W6vv` |
| `claude-opus-5-5` | 3 | `req_011Cfp2kTBxeMvzQWLgAJTNK` | `req_011Cfp2kaCeGSxqJKQp1guSE` |
| `claude-opus-5-5` | 4 | `req_011Cfp2kfGz7gumaEorV9egw` | `req_011Cfp2knEC54aQ1SDEtuJZ7` |
| `claude-opus-5-5` | 5 | `req_011Cfp2ks9sBR1m2Pp1N6oj5` | `req_011Cfp2kz9449z2zC9z5NhXw` |
| `claude-opus-5-5` | 6 | `req_011Cfp2m53iqYF6kF1e4xyLG` | `req_011Cfp2mCLGz61vRbyoixY5a` |
| `claude-opus-5-5` | 7 | `req_011Cfp2mH53Fzg689VfFFzAt` | `req_011Cfp2mPvnFVjoNRnJXHxnx` |
| `claude-opus-5-5` | 8 | `req_011Cfp2mULgzqFckyCPMiAab` | `req_011Cfp2mbckgxVe3mmwS5xsH` |
| `claude-sonnet-5-5` | 1 | `req_011Cfp2mgRDm6TtGzAANqxE3` | `req_011Cfp2mnUN4a4CNanRew1EZ` |
| `claude-sonnet-5-5` | 2 | `req_011Cfp2mqTC78DAMLCqApKTj` | `req_011Cfp2myeKEkZdAVAd3fyUp` |
| `claude-sonnet-5-5` | 3 | `req_011Cfp2nN1UUdm4NaJQAptab` | `req_011Cfp2niwozkJt9prUiVeUh` |
| `claude-sonnet-5-5` | 4 | `req_011Cfp2nw4Zi9TJX988zZ13E` | `req_011Cfp2o3tpy6Q2hkAWZKdME` |
| `claude-sonnet-5-5` | 5 | `req_011Cfp2oEzpFttnpqk3kKWg8` | `req_011Cfp2oQquRuSMjaLP7RFcr` |
| `claude-sonnet-5-5` | 6 | `req_011Cfp2oWt3d4cwsdao9vxAX` | `req_011Cfp2ofppLNUqjUb1EiP1S` |
| `claude-sonnet-5-5` | 7 | `req_011Cfp2ok6Y2v3bY2oiJZQyE` | `req_011Cfp2os5iyJ2wV3e7f8bko` |
| `claude-sonnet-5-5` | 8 | `req_011Cfp2oy8reYbTb9s588pqA` | `req_011Cfp2p5PQaHkgtdvSTcrGr` |

### Attempt B seed request IDs

All listed responses were HTTP 200. The request IDs below identify seed calls only; no variant request IDs exist.

| Model | Seed phase | Request ID | Result |
| --- | --- | --- | --- |
| `claude-opus-5-5` | `seed-1-tool` | `req_011Cfp37oTh69aai8fgRLVVY` | `tool_use`, 25 thinking tokens |
| `claude-opus-5-5` | `seed-1-final` | `req_011Cfp37xKkJgMnErnG1yqLe` | `end_turn`, 0 thinking tokens |
| `claude-opus-5-5` | `seed-2-tool` | `req_011Cfp381LZw4xuGyZPrVE5D` | `tool_use`, 23 thinking tokens |
| `claude-opus-5-5` | `seed-2-final` | `req_011Cfp389EarutqXqQKhyzVf` | `end_turn`, 0 thinking tokens |
| `claude-opus-5-5` | `seed-3-tool` | `req_011Cfp38EKBEtwF9XDKuMLGf` | `refusal` |
| `claude-opus-5-5` | `seed-3-tool-retry` | `req_011Cfp38Jq32T1r8ZvkznyvQ` | `tool_use`, 0 thinking tokens |
| `claude-opus-5-5` | `seed-3-final` | `req_011Cfp38RJyDur88Wv5pYFrF` | `refusal` |
| `claude-opus-5-5` | `seed-3-final-retry` | `req_011Cfp38VuHYeCEfux4MPBGc` | `end_turn`, 0 thinking tokens |
| `claude-opus-5-5` | `seed-4-tool` | `req_011Cfp38Z1aKWG6w3DyDTtXD` | `refusal` |
| `claude-opus-5-5` | `seed-4-tool-retry` | `req_011Cfp38cnH3g9ikeUY8UJMi` | `refusal`; stopped |
| `claude-sonnet-5-5` | `seed-1-tool` | `req_011Cfp38gjQXSQnYzR2kYq89` | `tool_use`, 0 thinking tokens |
| `claude-sonnet-5-5` | `seed-1-final` | `req_011Cfp38o5APq8JtaxFy7fjT` | `end_turn`, 0 thinking tokens |
| `claude-sonnet-5-5` | `seed-2-tool` | `req_011Cfp38qraxTwp45YbMJh2o` | `tool_use`, 0 thinking tokens |
| `claude-sonnet-5-5` | `seed-2-final` | `req_011Cfp38wpG4QkazcEFR46Ak` | `end_turn`, 0 thinking tokens |
| `claude-sonnet-5-5` | `seed-3-tool` | `req_011Cfp391LrQm6UEMn7LSdbw` | `tool_use`, 0 thinking tokens |
| `claude-sonnet-5-5` | `seed-3-final` | `req_011Cfp39DKRiDUo1PxbhXpLF` | `end_turn`, 0 thinking tokens |
| `claude-sonnet-5-5` | `seed-4-tool` | `req_011Cfp39HKmbotoynUvgDWJv` | `tool_use`, 0 thinking tokens |
| `claude-sonnet-5-5` | `seed-4-final` | `req_011Cfp39WAwDbctCABkqNwfK` | `end_turn`, 0 thinking tokens |
| `claude-sonnet-5-5` | `seed-5-tool` | `req_011Cfp39a3MvY5vabSkyZQr5` | `tool_use`, 0 thinking tokens |
| `claude-sonnet-5-5` | `seed-5-final` | `req_011Cfp39pC9e9DH5frhc8bfE` | `end_turn`, 0 thinking tokens |
| `claude-sonnet-5-5` | `seed-6-tool` | `req_011Cfp39tB2DTPodK59vRYyq` | `tool_use`, 0 thinking tokens |
| `claude-sonnet-5-5` | `seed-6-final` | `req_011Cfp3A1hwwgGfLrXQTejdp` | `end_turn`, 0 thinking tokens |
| `claude-sonnet-5-5` | `seed-7-tool` | `req_011Cfp3A5TRYisD7Vo9tgMGS` | `tool_use`, 0 thinking tokens |
| `claude-sonnet-5-5` | `seed-7-final` | `req_011Cfp3AD6oiXRKxBf4K3qYd` | `end_turn`, 0 thinking tokens |
| `claude-sonnet-5-5` | `seed-8-tool` | `req_011Cfp3AHGL7rhQ7adwZ4EjS` | `tool_use`, 0 thinking tokens |
| `claude-sonnet-5-5` | `seed-8-final` | `req_011Cfp3AQSvxQdVRKaN1xpfk` | `end_turn`, 0 thinking tokens |

## Current harness and local verification

The local harness now uses adaptive/high effort, the benign `record_note` tool, reasoning-inviting arithmetic seed prompts, up to eight completed rounds, and one alternate neutral prompt retry on a refusal. The common 13 one-shot mutation/control cells run for both models; a restoration check reuses the oldest-prefix response and issues one additional request only if that response produced a signed block. Any 429 stops both models immediately. The cap is 92 calls. The harness keeps signatures in memory and records statuses, request IDs, per-round signed-block counts, and hashed request shapes without raw thinking text or signatures.

Offline verification, completed before the adaptive/high live run, used Bun 1.4.2 and TypeScript 5.9.3:

- `timeout 90 bun test --timeout 30000 packages/e2e-tests/src/live-providers` — 31 passed, 1 optional smoke test skipped, 0 failed; 122 assertions across 32 tests in 5 files.
- `timeout 180 bun packages/e2e-tests/node_modules/typescript/bin/tsc --noEmit -p packages/e2e-tests/tsconfig.live-providers.json` — passed (silent on success).

The manual-enabled run started 2026-10-08 03:06:11 UTC and ended 03:07:07 UTC. The adaptive/high run started 03:11:06 UTC and ended 03:11:42 UTC. Neither run returned a 429, so no quota retry was made. After the adaptive/high run reached its seed limit/refusal blockers, no additional live run was performed.

## Previous attempt (2026-10-07)

**Attempt:** 2026-10-07, 09:56:28–09:56:30 UTC. Repository base:
`392930c8c167e84d148290f464a28fe9269f26cc`. Route: Anthropic native Messages
(`https://api.anthropic.com/v1/messages`), default vault credential
`oauth:anthropic`, accessed only through the enrolled `mc-e2e` consumer.

### Result of the Oct 7 attempt

**That earlier attempt did not reach the signed-thinking matrix.** The first seed
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

**No reality-versus-memory difference was established in the Oct 7 attempt.**
#23609's oldest-prefix, suffix, middle-gap, earlier-edit and all-removal claims
remain unverified, as does the Anthropic analogue of #22050's literal `[cleared]`
rejection. Restoration and tool-input edits were outside the Oct 7 matrix; the
updated harness now includes those cells, but neither 2026-10-08 seeding run
reached them. Vertex, Bedrock and Copilot routes are not covered here. No product
behavior or memory claim should be changed on the strength of the Oct 7 rate limits
or the later incomplete seeds.
