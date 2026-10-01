/**
 * Session- and project-scoped live progress for the persistent Pi/OMP sidebar
 * (PRD v2.0 §14 IMPL-009, REQ-MC2-004..008).
 *
 * OpenCode already keeps `recompProgressBySession` and `dreamerProgressByProject`
 * on its `LiveSessionState` and feeds them into `SidebarSnapshot`. Pi tracked
 * only `isPiRecompInFlight` (a boolean) and the Dreamer run's promise, so the
 * shared sidebar view had nothing to show while either was running.
 *
 * This module is the Pi equivalent of those two maps. It is deliberately
 * observation-only:
 * - no timer, no worker, no scheduler, no promise is created here;
 * - every write is a synchronous assignment from a callback that already runs
 *   on an existing lifecycle seam (`spawnPiRecompRun`, the Dreamer executor's
 *   `onProgress`);
 * - nothing here awaits background work, so the detached-recomp contract that
 *   keeps the Pi REPL responsive is untouched.
 *
 * State is keyed, never global: recomp by `sessionId`, Dreamer by
 * `projectIdentity` (matching OpenCode's per-project key, because the Dreamer
 * scheduler is per project while the recomp run is per session).
 */

import type { DreamTaskProgress } from "@magic-context/core/features/magic-context/dreamer/task-registry";

/** Live recomp/upgrade progress, mirroring the wire shape in `SidebarSnapshot`. */
export interface PiRecompProgress {
	/** Which user-facing flow owns this run, so labels follow the flow. */
	kind?: "recomp" | "upgrade" | "embed" | "wrapup";
	phase: "recomp" | "migration" | "done" | "failed" | "skipped";
	processedMessages: number;
	totalMessages: number;
	passCount: number;
	compartmentsCreated: number;
	/** Terminal summary/reason, shown while the entry is visible. */
	message?: string;
	/** Transient activity line under the progress bar. */
	note?: string;
}

/**
 * Live Dreamer task progress. This is the shared `DreamTaskProgress` verbatim
 * rather than a Pi-local copy, so the value handed to `SidebarSnapshot` needs
 * no cast and cannot drift from the executor that produces it.
 */
export type PiDreamerProgress = DreamTaskProgress;

const recompBySession = new Map<string, PiRecompProgress>();
const dreamerByProject = new Map<string, PiDreamerProgress>();

/** Record (or clear) the live recomp progress for one session. */
export function setPiRecompProgress(
	sessionId: string,
	progress: PiRecompProgress | null,
): void {
	if (progress === null) recompBySession.delete(sessionId);
	else recompBySession.set(sessionId, progress);
}

/** Current recomp progress for one session, or null when nothing is showing. */
export function getPiRecompProgress(
	sessionId: string,
): PiRecompProgress | null {
	return recompBySession.get(sessionId) ?? null;
}

/** Record (or clear) the live Dreamer task progress for one project. */
export function setPiDreamerProgress(
	projectIdentity: string,
	progress: PiDreamerProgress | null,
): void {
	if (progress === null) dreamerByProject.delete(projectIdentity);
	else dreamerByProject.set(projectIdentity, progress);
}

/** Current Dreamer progress for one project, or null when no task is running. */
export function getPiDreamerProgress(
	projectIdentity: string,
): PiDreamerProgress | null {
	return dreamerByProject.get(projectIdentity) ?? null;
}

/**
 * Which task the tracked progress belongs to, or undefined when nothing is
 * running. The executor signals completion with `progress: null` plus the task
 * name; comparing that against this before clearing stops a fast task A from
 * wiping task B's entry when B started in the meantime.
 */
export function getPiDreamerProgressTask(
	projectIdentity: string,
): DreamTaskProgress["task"] | undefined {
	return dreamerByProject.get(projectIdentity)?.task;
}

/**
 * Session teardown: drop only that session's recomp entry. Dreamer progress is
 * keyed by project and survives, because the scheduled runner outlives any one
 * session — dropping it here would blank a running task's sidebar line.
 */
export function releasePiSidebarProgress(sessionId: string): void {
	recompBySession.delete(sessionId);
}

/** Number of tracked entries; a test/introspection seam. */
export function piSidebarProgressCounts(): {
	recomp: number;
	dreamer: number;
} {
	return { recomp: recompBySession.size, dreamer: dreamerByProject.size };
}

/** Full teardown (extension reload / tests). */
export function resetPiSidebarProgress(): void {
	recompBySession.clear();
	dreamerByProject.clear();
}
