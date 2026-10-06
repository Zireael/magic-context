# Rust OpenCode marker permission

`prefix_bust_permitted` is additive response metadata, never prompt content. New
ck-mc builds serialize both boolean values. The normal transform sets it from the
final `is_provider_prefix_mutation_pass`, after classification and lineage
demotion. Publication follow-up replaces the entire result; permission, native
messages and coverage therefore remain from the same attempt. Additive-only
transforms use their final HARD/MIGRATE_HARD/SOFT plan; passthrough and full-sync
constructors emit false. Older Rust responses deserialize conservatively.

The OpenCode adapter accepts only actual boolean true as host authority. Labels,
scheduler decisions, metadata commits and local frozen-release pricing cannot
grant it. A true SOFT+ response is a protocol error. False and unsupported
responses hold marker targets and retry counters. Unsupported responses log an
upgrade diagnostic and conservatively persist the installed LKG synchronously,
without enabling host first applications. An armed admission fence requires a
supported rebuilding response after the real recovery flush; an old producer
must be upgraded, not repaired by deleting the fence.

The immutable producer permission governs target extraction (independently of
scheduler execute), marker admission/drain, marker reconciliation, reasoning
bust strips, note-nudge eligibility, new trailing-blank decisions and synthetic
todo-anchor adoption. Frozen-release pricing remains separate and never grants
marker authority. This boundary also supplies `moduleDecisionBusts` for subsequent
frozen-replay adoption-policy work.

Coverage and permission are independent. Fresh targets still require a commit
and valid response coordinates. Retained retries require the actual served
coverage, including on noncommitting rebuilds. If a newer pending publication
outruns that coverage, the host skips the cut entirely and preserves the newer
blob and all retry health. It does not overwrite newer work with the older
response target, flush to catch up, or query a later status for permission.

Pi does not consume this field or acquire OpenCode marker/fence semantics.
The Claude Code gateway receives additive metadata only; it acquires no marker
cut. Gateway parser compatibility is external to this repository and is not
certified here; the field requiring the external compatibility check is
`prefix_bust_permitted`.

The execute-only extractor assertion was intentionally changed to accept a
committed rebuilding response regardless of scheduler. Both SOFT+ negative
assertions and monotonic/cooldown note-nudge controls remain. Lock fixtures now
expect a newer, unconsumed target not to be attempted; fake served responses
explicitly identify their supported permission instead of relying on a production
label fallback. Frozen-release policy itself is not changed in this patch.
