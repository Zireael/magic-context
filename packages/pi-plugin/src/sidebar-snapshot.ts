/**
 * Pi/OMP → shared sidebar snapshot (PRD v2.0 §14 IMPL-009, REQ-MC2-004).
 *
 * `buildMagicContextSidebarView` (IMPL-008) is the host-neutral presentation
 * model, but it reads a `SidebarSnapshot` — the OpenCode plugin's wire shape.
 * This module is the adapter that produces that shape from Pi's own
 * authoritative `/ctx-status` detail, so Pi and OpenCode feed the same model
 * instead of Pi re-deriving presentation of its own.
 *
 * Two rules keep the hosts honest:
 * 1. Nothing here reads OpenCode RPC or the OpenCode database. Every value
 *    comes from `StatusDialogDetail` — the same object the Pi status dialog and
 *    the published `StatusView` are built from — or from the live progress
 *    trackers in `sidebar-progress.ts`.
 * 2. No field is invented. Where Pi genuinely has no equivalent the field is
 *    omitted or explicitly zeroed and the reason is recorded next to it; the
 *    full PARITY / HOST-ADAPTED / NOT APPLICABLE matrix lives in
 *    `sidebar-snapshot.test.ts`.
 */

import type { SidebarSnapshot } from "@magic-context/core/shared/rpc-types";
import type { StatusDialogDetail } from "./dialogs/status-dialog";
import { piStatusWarnings } from "./dialogs/status-dialog";
import type { PiDreamerProgress, PiRecompProgress } from "./sidebar-progress";

export interface PiSidebarSnapshotOptions {
	/** The session's project identity; Pi's detail object does not carry it. */
	projectIdentity: string | null;
	/** Live recomp progress from the session tracker, if any. */
	recompProgress?: PiRecompProgress | null;
	/** Live Dreamer progress for this session's project, if any. */
	dreamerProgress?: PiDreamerProgress | null;
}

/**
 * Adapt Pi's authoritative status detail into the shared sidebar snapshot.
 *
 * `projectIdentity` is threaded in rather than read off the detail because Pi
 * resolves it from the runtime dependency layer (`resolveProject`), not from
 * the status dialog's own state.
 */
export function piSidebarSnapshotFromDetail(
	detail: StatusDialogDetail,
	options: PiSidebarSnapshotOptions,
): SidebarSnapshot {
	return {
		sessionId: detail.sessionId,
		usagePercentage: detail.usagePercentage,
		inputTokens: detail.inputTokens,
		contextLimit: detail.contextLimit,
		compaction_enabled: detail.compactionEnabled,
		systemPromptTokens: detail.systemPromptTokens,
		compartmentCount: detail.compartmentCount,
		// HOST-ADAPTED: Pi never archives compartment rows behind a native
		// compaction takeover, so there is no historical count to report.
		// Omitted rather than zeroed so the model skips the row entirely.
		memoryCount: detail.memoryCount,
		memoryBlockCount: detail.memoryBlockCount,
		pendingOpsCount: detail.pendingOpsCount,
		historianRunning: detail.historianRunning,
		// HOST-ADAPTED: OpenCode tracks a separate "a compartment pass is
		// running right now" flag; Pi's historian exposes only the running
		// boolean above, and inventing a second signal would misrepresent the
		// scheduler. False, not undefined — the shared model tests truthiness.
		compartmentInProgress: false,
		sessionNoteCount: detail.sessionNoteCount,
		readySmartNoteCount: detail.readySmartNoteCount,
		cacheTtl: detail.cacheTtl,
		lastTransformError: detail.lastTransformError,
		historianFailureCount: detail.historianFailureCount,
		lastDreamerRunAt: detail.dreamer.lastRunAt,
		projectIdentity: options.projectIdentity,
		compartmentTokens: detail.compartmentTokens,
		factTokens: detail.factTokens,
		memoryTokens: detail.memoryTokens,
		docsTokens: detail.docsTokens,
		profileTokens: detail.profileTokens,
		conversationTokens: detail.conversationTokens,
		toolCallTokens: detail.toolCallTokens,
		toolDefinitionTokens: detail.toolDefinitionTokens,
		// PARITY: the same warning derivation the Pi status view uses, so a
		// host limitation shows in the sidebar exactly as it shows in the
		// dialog (e.g. context_service_unavailable → "… (MC-C10)").
		hostLimitations: piStatusWarnings(detail),
		tailHygiene: detail.tailHygiene,
		executeThreshold: detail.executeThreshold,
		...(detail.executeThresholdClamped
			? { executeThresholdClamped: true }
			: {}),
		newWorkTokens: detail.newWorkTokens,
		totalInputTokens: detail.totalInputTokens,
		// PARITY: existing last-run / backlog / failure state is carried over
		// untouched, so nothing the Pi status dialog already showed is lost.
		dreamerBacklog: detail.dreamer.backlog,
		dreamerFailures: detail.dreamer.failures,
		...(options.dreamerProgress
			? { dreamerProgress: options.dreamerProgress }
			: {}),
		...(options.recompProgress
			? { recompProgress: options.recompProgress }
			: {}),
	};
}
