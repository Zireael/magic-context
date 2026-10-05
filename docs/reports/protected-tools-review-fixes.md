# Protected tool cache-review corrections

Refusal code: `protected_tool_results_over_limit`

Refusal message: `The tool results kept by protected_tools are larger than this model's context window, so this turn was not sent. Lower the protected_tools counts.`

These are a public contract. TypeScript and Rust each define the production text
once and test it against `protected-tool-refusal.json`. OpenCode 1, OpenCode 2,
Pi/OMP and Claude Code share that text. The message deliberately avoids language
that Claude Code could interpret as an instruction to compact.

## Trusted over-limit refusal

The healthy send paths now refuse complete over-limit outgoing estimates after
reclaim, including successful no-op reclaim. Partial estimates do not originate
a refusal. A request still over the limit for other reasons gets an explanatory
post-reclaim refusal rather than incorrectly attributing all its mass to tools.

The Rust-mode OpenCode adapter checks its final returned array, not the module's
ingress estimate, before installation/LKG capture. Typed native protected-tool
errors also bypass fallback and LKG replay. Pi measures its final array with a
complete current system/tool envelope and only guards priced/reclaim passes.

ck-mc counts protected result mass remaining after the actual fold's coverage
trim. Its native lower-bound guard requires the current request's
`usage.final_wire_trusted`, a positive model hard limit, and calibrated protected
mass above that limit; stale persisted trust is insufficient. No module wire
schema was added. Its Claude Code handler returns `HandlerOutcome::Error` with
the exact code and message above, no sendable/passthrough response, and no
transform-state commit. The handler regression exercises the real Claude Code
profile and route config; an untrusted-count control remains admitted.

THALAMUS owns the gateway mapping/test in its own repository. This delivery
does not claim an end-to-end gateway proof. The agreed gateway behavior is a
terminal HTTP 400 displaying the module's message verbatim, not a passthrough.

The refusal guards were mutation-checked: disabling the shared outgoing guard
reddened the impossible-reclaim regression, the Pi context-handler refusal,
and the Rust-mode final-wire refusal. The Rust-mode typed-error/no-replay control
remained green. Disabling ck-mc's native lower-bound guard reddened the Claude
Code handler regression. All breaks were staged safely, restored, and rerun green.

Verification: Bun 1.4.2, TypeScript 5.9.3; plugin and Pi typechecks pass. The
postprocess/refusal/Pi fit suites passed 249 tests initially; focused final
contract/fit tests passed six, adapter/byte-identity controls three, and the Pi
handler control one. Cargo 1.99.0 ran 29 protected-behavior tests successfully
with one build at a time; rustfmt 1.10.0 check passed. A combined full adapter
invocation exceeded its 20-minute outer bound and is not claimed as passing.
Its old 2048-message byte-identity fixture was over the former artificial window;
the fixture now supplies an isolated SDK window large enough for its unchanged
ballast. Its exact SHA256 assertions remain unchanged and all three pass classes
pass, while the separate over-limit regression proves refusal.
