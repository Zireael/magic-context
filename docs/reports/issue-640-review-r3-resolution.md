# Issue 640: round-three identity and replay repairs

Base: `802f531af12e3fe5bb3bcedadb10f1a6b22670e5` (including issue 641's whole-pass budget and Oh My Pi dispatch fence). This change repairs five problems documented in the second review (`docs/reports/issue-640-review-r2.md` at `6592c8d1`): stale history IDs after waiting, stale tool-envelope estimates, quoted markers mistaken for served identities, incomplete message fingerprints and forgotten served numbers after reload. The deadline finding remains owned by the existing issue 641 controls. **LKG** means a saved last-known-good managed request; **OMP** is the Oh My Pi host.

## Changes

| Finding | Repair | Commit |
| --- | --- | --- |
| 1: stale OpenCode history IDs after backoff | Each admission replay rebuilds its entry note from the current array and retains that current note for recovery if writer admission later exhausts its budget. After successful admission it captures the new pre-transform entry, rather than the pre-wait entry. The mutating transform is still invoked at most once. | `bb3b00f96b` |
| 2: OpenCode 2 replay admission uses stale tool measurements | An additional, read-only replay check measures the current draft's complete tool set and the saved system segments validated against the current system input. It uses a full request estimate, not previous provider usage or cached tool measurements. Missing system identity, unknown limit or unmeasurable tools declines early replay. No tool-measurement writer was moved before admission. | `c8af29a460` |
| 3: quoted markers become served evidence | The ledger accepts explicit numbers from this pass's tagged identities, rather than scanning serialized content. The pipeline excludes structurally removed tool calls/results. Replays retain previously recorded evidence; raw appended text cannot create it. | `15d27adcb7` |
| 4: distinct messages share a first-block fingerprint | The fingerprint hashes canonical **complete content**, including later text, media, reasoning and tool blocks, with the existing role/timestamp/response/tool-call identity fields. A shared first block no longer merges distinct messages. | `ec8255f162` |
| 5: reload forgets immutable served numbers | Owner-only `pi-served-tag-numbers/<session>.jsonl` records persist newly served numeric identities synchronously before return. Unload releases caches, not durable history. Reads validate session/version/numeric shape; unreadable/corrupt identity state refuses instead of silently renumbering. Subsequent passes with no newly served numbers do not append a record. | `21d5aabc02` |

The two missing OpenCode review files were imported verbatim from `6592c8d11c04e1213fb62a550f24ccd15190c1b7`. `git diff --exit-code` against that commit passes for both files and the Pi round-two review file: **their complete contents, not merely expectations, are unchanged**. All six formerly failing assertions for findings 1–5 now pass.

Non-review fixtures that manufactured served evidence now supply their assigned numbers explicitly. Their collision assertions are retained. The served-ledger unit test that asserted cleanup erases numbers intentionally becomes an assertion that cleanup preserves durable evidence. Those contract changes are explained in the corresponding commit messages. New tests cover quoted markers, a genuinely fresh subprocess restart without body capture, corrupt identity storage and owner-only file permissions. The restart subprocess sets `windowsHide: true`, preventing an unwanted console window on Windows. A follow-up (`a349d2fd61`) also makes an identity-recording failure refuse immediately and cancel the pending LKG capture, rather than entering ordinary replay recovery. Its new test starts with an actually fitting saved request and complete current model/system/tools. A small follow-up (`ede859dff5`) explicitly validates the live V2 system input on each early replay attempt, while preserving the pristine entry system for post-transform recovery.

No pass-budget constant, historian join, owner/generation fence, dispatch receipt or side-session latch was changed. Served publication still carries the original `budget.assertOutcome` callback. The real refusal probes additionally check that the new durable numeric records remain absent.

## Retained evidence

Full provider captures prove which managed text was sent; SQLite descriptor dumps prove disposable-store isolation; suite logs retain failures and counts. These generated artifacts and the temporary byte-comparison harnesses are retained outside the repository and build directories:

`~/.local/share/cortexkit/magic-context/specimens/issue-640-r3/`

Evidence files (all relative to that external directory):

- `host-fast.json`, `host-slow.json`, `host-outcome-hold-60.json`: provider requests, context events and final state; their `*-lsof.txt` and the independent writer locker's descriptor receipt establish store isolation;
- `subagent-hold-{2.2,10,60}.json` and corresponding `*-lsof.txt`;
- `differential.json`, `diff-{base,head}-{output.json,rows.json,lsof.txt}`;
- `opencode-differential.json`, `opencode-{v1,v2}-{base,head}.json`, their `.lsof.txt` and `.log` files, plus `opencode-differential.test.ts` and `opencode-differential.sh`;
- `mutation.json`, `plugin-suite.{stdout,stderr}.log`, `pi-suite-final.{stdout,stderr}.log`, and the copied strict test compiler configurations.

Existing probe scripts now accept `MC_PROBE_EVIDENCE_DIR`; the Pi differential also accepts `MC_PROBE_BASE_REF`. These keep the old defaults but permit this run's external evidence destination and exact base revision. No new file was added under `docs/reports/probes/`.

## Uncontended byte differential

Each arm runs in a **separate Bun process**, with a fresh throwaway database and fixed input. The archived base was obtained with `git archive` inside this worktree, never by accessing another checkout. The Pi harness verifies its core-import resolution before running either revision. OpenCode fixture imports resolve relative to each arm's actual source tree. No content or per-pass timestamp was normalized.

| Host | Actual code exercised | Equality |
| --- | --- | --- |
| Pi | Real handler, three successive turns with text and a tool call/result | Complete returned arrays byte-identical, SHA-256 `4a6cd42cb4ec7b5e9c10bd9dfbd92a8ab1afd746a06f64c048952be9a568ec27`; selected tag/source rows also equal (`7b2ed501f344379577144e006b16e9605158cc38398e51755cced5885fd7f5a6`) |
| OpenCode 1 | Real transform and outer wrapper, two successful defer passes per arm | Serialized outputs equal, 389 bytes for the two-pass capture, SHA-256 `98db18673b0315f7ade32e09559c3a8adbe8f2e60a2e2e56bdaecf55506fdc06` |
| OpenCode 2 | Real context hook, system/payload adapters and real transform, two defer passes per arm | Serialized drafts equal, 1,379 bytes for the two-pass capture, SHA-256 `c199f7aff7ea634f57555b3ad2b7b0192812597432a6e12786684cd652125785` |

The OpenCode harness disables historian/dreamer/memory background work and exposes `ctx_reduce` and `read`. Every arm positively asserts actual `§1§ Please inspect writer admission`, identical first/second defer bytes and nonempty task-root-only SQLite descriptors. Four final fixture runs passed, each with four assertions. The cross-revision postprocessor independently compares the two files for each host. The Pi comparison covers two array captures and selected row snapshots; it does not assert equality of the newly introduced filesystem safety records with a base that had none.

These are targeted successful-path fixtures, not an exhaustive all-model/all-history differential. Complete-content fingerprints and new identity records are intentional storage metadata changes, not provider-byte changes.

### Harness corrections, not product findings

An initial OpenCode invocation put `--tsconfig-override` before `test`; Bun dispatched the root package script instead of the intended fixture. That accidental local run used only throwaway HOME/XDG/storage paths but incorrectly retained `OPENCODE_DB` (a single throwaway host DB path that prevents independent suite fixtures from selecting their own host DBs), producing 198 fixture-isolation failures (7,146 pass, 7 skip). It is **not** counted as an authoritative suite or differential. Its output is retained as `invalid-opencode-driver.stderr.log`. The authoritative package suites below unset `OPENCODE_DB` and run on Linux.

The first V2 draft omitted `ctx_reduce`, so its positive tagged-output assertion correctly failed. The tool was added rather than weakening that assertion. Descriptor checks also initially compared against a data-home narrower than the test preloader's disposable DB root, then against a noncanonical TMPDIR with duplicate slashes. The recorded paths were all inside the task root; the final check uses the independent canonical task root and passes. Bun printed a nonfatal tsconfig-directory warning during the archived direct fixtures; explicit strict TypeScript checks subsequently passed. The strict fixture check caught a possibly undefined registration result; the harness now requires a successfully registered hook. The final evidence/harness includes these corrections.

## Real Oh My Pi reruns

Host: **OMP 18.8.6**, Bun **1.4.2**, macOS arm64, built extension and loopback Anthropic-protocol provider. No external model service was used.

| Probe | Result |
| --- | --- |
| `host.ts fast --fixed` | **One managed HTTP request**, at 6,123 ms after submission. Collection finds the actual captured managed text in the provider body (`servedOnWire=[true]`), and a durable numeric record containing only `[1]`. PID 49178. |
| `host.ts slow --fixed` | **Zero HTTP requests**, visible dispatch refusal; no LKG, decision, served digest/body or durable served-number publication. PID 53225. |
| `host.ts outcome --fixed` | Writer held 60s plus 25.1s internal stall: **zero requests**, visible refusal; fallback **4 ms**, handler **25.386 s**, submission-to-return **30.630 s**. No managed publication. PID 55630. |
| `subagent.ts 2.2` | Actual task child completes, one managed request **2.957 s** after lock acquisition. Parent PID 7763. |
| `subagent.ts 10` | Actual task child completes, one managed request **10.794 s** after lock acquisition. Parent PID 8087. |
| `subagent.ts 60` | Actual task child completes through the host reminder/retry ladder; one managed request **60.090 s** after lock acquisition, none while the long writer remained held. Parent PID 8782. |

The collector requires a nonempty fast served-body capture and compares it with the actual provider body. It rejects managed publication on refused runs, including new numeric records. Each host has **24** `.db`/WAL/SHM descriptor entries, all under its disposable fixture root; child/parent and independent Python locker descriptor receipts are retained too. This reruns the real task-child reproduction, not merely a direct handler stand-in. These are single observations, not Windows latency bounds or an all-adapter proof. After a verified host-attributed side context, the existing implementation disables its independent dispatch backstop for that session to allow concurrent side/main operations. That availability tradeoff remains unchanged; a timeout there can still send unmanaged history. The internal budget and late-publication fences remain active.

## One mutation control per finding

Every control staged the live file, confirmed an empty working diff, deliberately neutralized the repair with a mutation marked `NON-VACUITY BREAK`, captured a nonempty diff, ran the named test(s), then restored with `git checkout -- <path> && touch <path>` and confirmed an empty working diff. No mutant was committed.

| Finding | Neutralization | Exact assertion that alone failed | Other executed control |
| --- | --- | --- | --- |
| 1 | Supply the pre-wait entry to admission replay | `r2: OpenCode admission validates current reorder after a backed-off wait` (`callbacks: 0`, expected 1) | Current-content control passes; 1 pass, 1 fail, 2 filtered |
| 2 | Disable the draft-envelope callback | `r2: v2 early admission does not replay across changed tools` (`callbacks: 1`, expected 2; `lkg_replay_served`) | Changed-history control passes; 1 pass, 1 fail |
| 3 | Restore marker regex accumulation | `r2: an unserved racing real row is not served evidence merely because user text mentions its number` (conflicting served rows refusal) | 13 filtered; only the named assertion ran and failed |
| 4 | Hash just the first content block | `r2: distinct multi-block real messages must not collide with one served fallback` (conflicting served rows refusal) | Both three-row/three-way collision controls pass; 2 pass, 1 fail |
| 5 | Read but discard durable number rows | `r2: reloading a session must not forget its already-served fallback number` (`§9§`, expected `§1§`) | 13 filtered; only the named assertion ran and failed |

Finding 1's initial mutant ran only the reorder test, without the preceding content control, and remained green. This is explicitly recorded as **undefended** (the mutation did not make the expected assertion fail), not a proof. Running the content control before reorder exercises the same wrapper/file and makes the reorder assertion alone red. Normal restored runs pass every round-two test. `mutation.json` records unsuccessful preliminary controls and successful controls, including diff-stat pairs and captured failure excerpts. A sixth successful control neutralizes the identity-IO refusal: only `identity persistence failure refuses and cancels the pending LKG capture` fails (the handler resolves rather than rejects); all 11 ledger tests pass. Two preliminary IO fixtures lacked an admissible model/request envelope and remained green; they are recorded as **not_reached**, not proofs. The new collector checks are independently made red by injecting a numeric served record into the actual slow refusal receipt (`late publication after refusal`) and by erasing the actual fast served-body capture (`managed fast pass has no served-body capture`). Each collector control fails only its named check, and the same receipt passes again after staged checkout/touch restoration.

## Verification

All authoritative package suites execute on the remote Linux runner (`runon: linux`), a `uname -s == Linux` guard, **unset OPENCODE_DB**, throwaway HOME/XDG/storage roots and command-local Git ownership configuration. Bun **1.4.2 (744846f84)**; frozen installs report no manifest/lockfile changes.

- `bun run build`: passed before suites, again after the five product changes. Root builds plugin, Pi and CLI (including their TypeScript/build steps); TUI generation checks nine files with no changes. Pi's package build also passed locally because its artifacts are consumed by the actual local OMP host.
- `bun run --cwd packages/plugin test`: **7,341 pass, 7 skip, 2 fail**, 214,158 assertions, 716 files, 129.38s. One failure is the unchanged Node WASM temporary-bundle fixture (`onnxruntime-web/webgpu` cannot resolve), already recorded in the issue 641 report. The other was this delivery's new restart subprocess lacking `windowsHide`; that option was added, and the impacted Windows source guard subsequently passes.
- Corrected plugin affected-file test: **7 pass, 0 fail, 29 assertions**, three files (Windows subprocess guard plus both OpenCode round-two files). Original unchanged Node WASM fixture was not rewritten; its baseline failure remains visible in the full-suite logs.
- `bun run --cwd packages/pi-plugin test`: Final run: **1,697 pass, 4 skip, 0 fail**, 84,877 assertions, 169 files, 243.48s. An earlier full run before the identity-IO follow-up had 1,696 pass and zero failures. The native opt-in deadline measurement is one of the four skips; the three requested real OMP deadline probes ran separately.
- Restored Pi review/ledger/collision/publication/outcome subset: **34 pass, 0 fail**, 99 assertions, five files, before the additional identity-IO test. The final full suite includes that new test. Final V2 admission/system controls: **4 pass, 0 fail**, 25 assertions, three files.
- `bun run typecheck`: passed across plugin, Pi, CLI and retina-local-fs with TypeScript **5.9.3**. Silent compiler success is exit 0. Both additional strict `tsc --noEmit -p packages/{plugin,pi-plugin}/tsconfig.issue-640-r3.tmp.json` checks explicitly include the review tests, ledger tests and differential fixture; both pass. The final Pi strict check additionally includes `served-identity-refusal.test.ts` and passes. Configs were retained externally and removed from source.
- `bun .../typescript/bin/tsc -p docs/reports/probes/issue-641/tsconfig.json`: passed with TypeScript 5.9.3, checking the existing probe sources and imported product code.
- `bun run lint`: passed after formatting the Windows-safe fixture, Biome **2.5.1**, **1,681 files** across four packages, zero errors; existing warnings/information only. The initial new-fixture formatting error was corrected. No unrelated warning was fixed.
- Editor inspection: zero TypeScript errors for the five edited product files; overall **PARTIAL** because call-graph analysis and its Biome producer were unavailable. Explicit compiler/lint commands are authoritative.
- Comment review covered added product comments; the one unclear tool-pair comment was rewritten. Probe/report comments were reviewed before the evidence commit. Earlier automatically misselected/refused research calls were not counted as coverage.

## Isolation and limits

No live store/config was opened, copied, read, migrated or written. Every host and direct native differential uses a root under `$TMPDIR/magic-context/bg_e84311e35072df05/`; HOME, CFFIXED_USER_HOME, all required XDG roots, OPENCODE_DB and MAGIC_CONTEXT_STORAGE_DIR are redirected before launch. Package suites use an independent throwaway HOME and unset OPENCODE_DB. A pinned OMP installation exists only in this worktree's ignored `.cache/issue-641/host` (112 packages, two blocked postinstalls); no repository manifest changed.

Durable served numbers describe a completed managed result returned to the host, not an HTTP acknowledgment, matching the pre-existing ledger contract. They are append-only safety state; malformed/unreadable records deliberately refuse. Legacy digest-only ledger rows do not contain reconstructable numeric identity metadata and are not mined for markers. Complete-content fingerprints intentionally do not treat old first-block-only hashes as complete identity proofs; no live-store upgrade/migration was attempted. Cross-process simultaneous serving and legacy-format upgrade behavior are not established by the reload/fresh-process fixtures. The successful-path differential is deliberately bounded to the documented fixtures, and after a verified side context the independent dispatch backstop is still disabled for that session, as described above.
