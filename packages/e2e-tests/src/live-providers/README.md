# Live provider harness

Opt-in, billed tests through **OpenCode 1.18.30** and the locally built Magic Context
plugin. Bedrock is no longer selected or requested from the vault. The legacy Bedrock
wire reader remains usable for old captures.

| Route (`--only`) | Credential | Auth / wire |
| --- | --- | --- |
| `claude-oauth:trim-only` | `oauth:anthropic` | Installed `anthropic-auth` dist, native Messages, Opus 5.5 |
| `codex:age` | `chatgpt:openai` | Installed `openai-auth` dist, Codex HTTP Responses, GPT-5.4 mini |
| Existing API-key routes | OpenAI, OpenRouter, DeepSeek, Kimi keys | Existing adapters |

## Credentials and isolation

The enrolled vault consumer is **`mc-e2e`**, not either auth plugin's operator
enrollment. The only real config file the runner needs to read is that consumer's
own `~/.config/cortexkit/mc-e2e/enrollment.json`, or an explicitly provisioned
`MC_E2E_ENROLLMENT_PATH`. Do not read operator OpenCode/config/auth files to discover
plugin paths or credentials.

Supply an **existing absolute OpenCode dist path** with `--anthropic-auth` /
`--openai-auth` (or `MC_LIVE_ANTHROPIC_AUTH_PLUGIN` /
`MC_LIVE_OPENAI_AUTH_PLUGIN`). Missing dists fail before credential retrieval;
the harness never builds those checkouts. The host loads the dist by `file:` URL.

The vault serves access bearers. The runner reads one selected credential once per
run and reuses it across that route's scenarios. No roster traversal or account
rotation occurs. `--claude-credential oauth:anthropic:NAME` selects **one** explicitly
authorized account; it is not automatic rate-limit fallback.

Each host has a new root beneath `$TMPDIR/magic-context/`. Its HOME, all XDG roots,
OpenCode DB/config, MC storage/log, work directory, and child TMPDIR are inside
that root. The bearer is written in mode 0600 to the disposable host login slot.
An inert, non-secret `mc-e2e-refresh-disabled` placeholder fills the refresh field
because the Claude plugin requires a nonempty slot. It cannot refresh an account;
background refresh, cache keep-warm, request dumps, and Anthropic fallback accounts
are disabled. The plugins' own config/state paths are explicitly disposable.
Codex is forced to HTTP through the recorder, not WebSocket transport.

`lsof -p <pid>` must show database handles **only** beneath the throwaway root,
before prompts and after the scenario. Missing samples, external DBs, and
prefix-lookalike paths fail closed. Results retain normalized database paths and
the host PID. This is sampled host isolation, not a continuous descendant/network
sandbox. Startup failure, normal exit, and SIGTERM/SIGINT delete the entire root,
including credential-bearing auth state. Never retain or commit that root.

## Opus preserved-thinking check

```sh
MC_LIVE_PROVIDERS=1 MC_LIVE_MAX_CALLS=24 timeout --kill-after=30s 600s \
  bun packages/e2e-tests/src/live-providers/runner.ts \
  --only claude-oauth:trim-only \
  --anthropic-auth /absolute/anthropic-auth/packages/opencode/dist/index.js \
  --out "$TMPDIR/magic-context/live-providers/run-UNIQUE"
```

The scenario requests a sequence of twelve tiny `echo` tool steps (the age setting
has a minimum of ten tags), then closes the round. `/ctx-flush` authorizes a
rebuilding pass. A short math follow-up exercises oldest-prefix removal; a second
follow-up measures cache reads without another flush. Finally, the harness queues
a drop on the oldest tool result and flushes again before a third short math turn.
MC itself selects, persists and applies edits; the recorder **does not rewrite the
request history**. Thinking is adaptive, effort low, and output capped at 1024.
The subscription plugin forces prefix-mismatch `error` with the matching beta
when replaying signed thinking.

`trimOnly.qualified` requires wire evidence, not just HTTP 200: a nonempty gap-free
oldest prefix removed with newer identical signed blocks retained; unchanged old
non-thinking content/system/tools; no restoration on the next request; a positive
cache read larger than on the trimming request, with the trimmed prefix replayed
identically; an earlier tool-result edit with all later signed blocks removed;
accepted responses with usage and no transformation diagnostics. A seed lacking
thinking, extra MC edits, or absent usage is **not qualified**. The CLI exits
nonzero for aborted/unqualified scenarios.

`results.json` records each request's shape, model/cap/thinking flags, hashed signed
and non-thinking blocks, upstream status/request ID, uncached input, cache reads,
cache writes, output, and response transformation diagnostics (including nested
SSE metadata). Empty diagnostics mean none observed, not that the request was
accepted. Optional `--keep-bodies` retains content but no headers; default results
do not retain thinking text/signatures. Always inspect diagnostics before drawing
acceptance conclusions. Never treat uncached input alone as total Anthropic input.

The recorder caps calls and stops upstream forwarding on the first rejection.
It records the real upstream status but returns a local HTTP 400 to the host to
avoid the subscription plugin sleeping/retrying on 429. Locally refused retries
are counted separately; they consume no model calls.

The first live attempt is documented in
[`live-opus-55-trim-only-2026-10-04.md`](../../../../docs/reports/live-opus-55-trim-only-2026-10-04.md).
Both authorized accounts were rate-limited before thinking generation: acceptance,
trim-only behavior, mixed-edit stripping and cache reads remain **unverified live**.

## Independent preserved-thinking wire matrix

For an isolated signature-rule experiment, rather than MC's actual age/flush
behavior, use the native Messages matrix:

```sh
MC_LIVE_PROVIDERS=1 MC_LIVE_MAX_CALLS=32 timeout --kill-after=30s 600s \
  bun packages/e2e-tests/src/live-providers/thinking-matrix-live.ts \
  --opencode /absolute/opencode-1.18.30 \
  --anthropic-auth /absolute/anthropic-auth/packages/opencode/dist/index.js \
  --out "$TMPDIR/magic-context/live-providers/thinking-matrix-UNIQUE"
```

This uses only `oauth:anthropic`, read once through `mc-e2e`. The installed auth
plugin first shapes a request against a **loopback-only** rejection; that bootstrap
spends no model quota and deletes its disposable credential root. The native
client then keeps the captured bearer headers and signed history only in memory.
It explicitly requests strict thinking binding and its beta. No retries, alternate
accounts, persistent raw bodies, or signature dumps are supported.

Each model gets one conversation, with completed echo tool rounds until at least
four signed thinking blocks exist across at least two completed turns (maximum
four rounds). Adaptive summarized thinking uses low effort and a 512 output cap.
A fixed system cache anchor has 4,600 repetitions of ` anchor` and a five-minute
cache breakpoint; this deliberately supplies enough static input for the cache
minimum, not extra generation. Neither signed generation nor cache hits are
assumed: inspect their recorded counts and usage.

Every next-request variant is a fresh copy of the same seed. Opus runs control,
oldest one/two removal, middle-only/middle-and-suffix removal, all removal,
tool-result-edit and first-user-edit keep/strip pairs, and literal `[cleared]`.
Sonnet runs control plus oldest-one/middle-only. Branch responses never enter
another branch's history. A rate limit stops that model without retry; one initial
request on the other model is still permitted because quotas can differ by model.
Authentication rejection stops both. Maximum total billed calls is 30 if all seed
rounds are needed, with a hard cap of 32. Errors or insufficient signed history
exit nonzero and leave reached-call evidence in `results.json`.

`completed` means the matrix reached every variant, **not** that all memory claims
were validated. Inspect status, usage and transformation diagnostics, particularly
the unchanged control. A cache read on the static system anchor does not prove
cache survival across an edited history. The Oct 7 attempt is recorded in
[`live-thinking-trim-opus-5-5.md`](../../../../docs/reports/live-thinking-trim-opus-5-5.md);
both models were rate-limited at the first seed, so the matrix is not yet run live.

## Local verification

```sh
timeout 90 bun test --timeout 30000 packages/e2e-tests/src/live-providers
timeout 90 bun packages/e2e-tests/node_modules/typescript/bin/tsc \
  --noEmit -p packages/e2e-tests/tsconfig.live-providers.json
```

An optional installed-dist smoke test uses **fake** bearer fixtures and a loopback
model upstream, with no vault access or billed model calls:

```sh
MC_LIVE_AUTH_SMOKE=1 MC_LIVE_OPENCODE=/absolute/opencode \
MC_LIVE_ANTHROPIC_AUTH_PLUGIN=/absolute/anthropic-auth/packages/opencode/dist/index.js \
MC_LIVE_OPENAI_AUTH_PLUGIN=/absolute/openai-auth/packages/opencode/dist/index.js \
  timeout --kill-after=30s 180s bun test --timeout 120000 \
  packages/e2e-tests/src/live-providers/auth.test.ts
```
