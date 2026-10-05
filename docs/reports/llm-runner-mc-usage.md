# How Magic Context uses Broca's llm-runner surface

Magic Context does not link `cortexkit-role-llm-runner`. Its Rust module (ck-mc) talks to Broca's runner with hand-built JSON, only when the user configures the historian (or the dreamer's classify task) to run on a module runner. The default runs them in the host, with no route to Broca. All references are to `crates/mc-module/src/` at master on 2026-10-05.

The route open (`historian_producer.rs:1002-1059`, `route_targets.rs:14-95`) sends project root, harness and session identity, with no scope and `role_versions: None`.

| Item | MC | Where |
|---|---|---|
| `session.send` | Sends `prompt` (string), `model {provider, model}` split at the first `/` of `provider/model`, `tools: []`, `generation.max_output_tokens` (historian 32,000), optional `generation.temperature` (classify 0.1), `system` when non-empty | `historian_producer.rs:815-853` |
| `model.variant` | Not sent. A runner session therefore can't choose a reasoning variant (a gap on MC's side) | `historian_producer.rs:821-838` |
| `send_id`, `delivery`, `mark`, `plan`, `prompt_blocks` | Not sent | `historian_producer.rs:833-853` |
| Other send fields (`tool_choice`, `stop_when`, `budget`, `cache`, `keep_warm`, `on_restart`, `conversation_key`, `work_class`, `context_limit`, `service_tier`, `context_management`, `auth`, `one_shot`, `append_episode`) | Not sent | `historian_producer.rs:833-853` |
| `session.send` reply | Decodes `run_id` (active) or `state: "pending"` plus `submission_id` (queued, then retracts). Does not recognise `paused` as a send outcome | `historian_producer.rs:855-869, 1263-1297` |
| `session.subscribe` | Sends `from: "start"`; decodes control units (`type`/`kind`, `run_id`, `reason`/`detail`, `error`, `finish_reason`), assistant text and usage (`input_tokens`, `output_tokens`, `cached_input_tokens`, `cache_write_tokens`) | `historian_producer.rs:966-978, 1091-1186, 1339-1391` |
| `run.status` | Sends `run_id`; maps `state` broadly: terminal, interrupted, completed or finished → done; active, paused, pending or running → active; anything else → missing. Doesn't read `pause_reason` | `historian_producer.rs:923-932, 1299-1337` |
| `run.cancel` | Sends `run_id`; ignores the body | `historian_producer.rs:934-943` |
| `session.retract` | Sends `submission_id`, only after a pending send | `historian_producer.rs:872-889` |
| `session.delete` | Sends empty params when purging a session (not in the diff's op list) | `historian_producer.rs:945-955` |
| `session.warm`, `session.read`, `session.head`, `run.result`, `session.baseline`, `role.describe`, `compaction.ready`, `session.refresh*`, `session.flush_prefix`, `session.import` | Not used | `historian_producer.rs:801-982` |
| Paused stream unit | Treated as a failed run (`RunPaused`); reads `reason`/`detail` and the error class, not the named reasons | `historian_producer.rs:1127-1137, 1453-1489` |
| Terminal reasons | Not parsed as a taxonomy; `max_steps`, `cancelled` and `transform_unavailable` are not told apart | `historian_producer.rs:1120-1179, 1393-1444` |
| Refusal codes | Decodes `code` and `message` generically. Only `open_failed` gets special handling (message text picks credential, provider, model or resolution stage) | `historian_producer.rs:56-136, 1503-1507` |
| Error class | Branches on `class` (`transient`, `permanent`, `auth_required`/`auth`, `context_overflow`) and `retry_after_secs`; an explicit class overrides text heuristics | `historian_producer.rs:471-523, 1592-1619` |

Answers to the diff's closing questions, from MC's side:
1. MC uses `run.status`, `run.cancel` and `session.retract`, but not `session.warm`.
2. MC sends `model.provider` and `model.model`, not `variant`.
3. MC never sends `send_id`, so MC needs nothing for it either way.
4. MC never sends `mark`.
5. MC doesn't handle `paused` as a send outcome; a paused run during streaming counts as a failure.
6. MC branches on the error class and retry hint, not on the named pause or terminal reasons or provider codes.
