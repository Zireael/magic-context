# Compaction-marker unfreeze: final round-three adversarial review

## Scope and evidence checkpoint

Review candidate **7d7b23ea506c2957835bb6e75aaf09247a8d0a70**, including
round-three commits **c32bceb002**, **0a31af0ecb**, and **7d7b23ea50**.
The review branch starts at **7068e09570f9b29f4db50563134b177a8bae33e8**.
All candidate source line references below describe the temporary candidate
overlay, not the review branch's production files. Only this report is delivered.
Read both earlier reviews and the protected `ARCHITECTURE.md:48–108` first.

No live database, configuration, or backup store is accessed. Unit fixtures and
host runs are confined to `$TMPDIR/magic-context/marker-unfreeze-review-r3-bg_c62afe4/`.
Shell commands have outer timeouts; native builds are serialized with `-j 2`.
Candidate source/test overlays are temporary and will be restored before delivery.

## The three round-two blockers

Independently executed the **exact three** `r2 proof:` tests in the manager,
Rust adapter, and V2 boundary suites: **3 pass, 0 fail, 10 assertions**
(Bun 1.4.2). None was skipped or replaced with a simpler setup.

1. **Retained assistant target / earlier user:** the manager still creates the
   initial real marker at target 8, verifies that its retained user is 7, then
   vetoes target 20. `compaction-marker-manager.ts:227–265` enumerates all
   uncovered ends and excludes only ends canonically *before the retained user*,
   not ends at/below the summary target. Test: `r2 proof: a retained partial at
   the prior target ordinal still vetoes the next cut`.
2. **Rejected HARD:** the adapter validates the native head at
   `rust-mode-transform.ts:3892–3897`, before postprocess/host mutation at
   `:4063–4074`. The deliberately invalid response still replays byte-identical
   LKG, freezes the representation, and leaves both mirror state and real host
   marker rows absent; no fence is armed. Test: `r2 proof: a rejected HARD output
   cannot move the host marker before LKG replay`.
3. **Absent endpoint / visible real gap:** `v2/fold/boundary.ts:181–243`
   verifies each visible prefix coordinate against summary ranges, rather than
   only looking for a visible endpoint. The real ordinal-3 gap remains in the
   array and zero messages are removed. Test: `r2 proof: an absent partial
   endpoint cannot hide visible real content in its successor gap`.

Paths above without a package prefix live below
`packages/plugin/src/hooks/magic-context/`, except `v2/fold/boundary.ts` under
`packages/plugin/src/`.

The initial proof invocation used an absolute throwaway `OPENCODE_DB`. Two tests
correctly failed because their helpers create separate per-test XDG databases.
Rerunning with `OPENCODE_DB=opencode.db` resolves under each throwaway fixture's
XDG root and gives the passing result above. This was a setup correction, not a
production or assertion change.

## Durable fence and cache review

Review in progress at this checkpoint. Final findings, crash-window matrix,
host byte-identity measurements, and verification commands follow in the final
report revision.
