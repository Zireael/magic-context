import {
	type RawMessageProvider,
	setRawMessageProvider,
} from "@magic-context/core/hooks/magic-context/read-session-chunk";
import { sessionLog } from "@magic-context/core/shared/logger";
import { type PiRecompProgress, setPiRecompProgress } from "./sidebar-progress";
import { setMagicContextRecompActive } from "./status-line";

/**
 * In-flight detached recomp / upgrade runs, keyed by session, so the
 * `session_shutdown` handler can await only that session's work — mirrors
 * `inFlightHistorian` in context-handler.ts.
 *
 * Why detached: Pi's command handler IS the REPL turn (single process). Awaiting
 * a multi-pass recomp inline froze ALL input — new prompts and even /ctx-status —
 * until it finished (dogfood 2026-06-01: a 1105-message upgrade locked the REPL
 * across several ~4-min historian passes). OpenCode runs recomp/upgrade as
 * `void runManagedRecomp(...)` in its separate server process; Pi must do the
 * equivalent fire-and-forget so the REPL stays responsive while the historian
 * passes run in the background — the same pattern as `spawnPiHistorianRun`.
 */
interface InFlightRecompRun {
	promise: Promise<unknown>;
	controller: AbortController;
}

const inFlightRecomp = new Map<string, InFlightRecompRun>();

/** True when a detached recomp/upgrade is already running for this session. */
export function isPiRecompInFlight(sessionId: string): boolean {
	return inFlightRecomp.has(sessionId);
}

/**
 * Await one session's in-flight recomp/upgrade run. Called from
 * `session_shutdown` (bounded by a timeout there) so a background recomp can
 * finish publishing before Pi tears that session down. Omitting the session id
 * waits for all runs and remains available for process-exit callers and tests.
 */
export async function awaitInFlightRecomps(sessionId?: string): Promise<void> {
	const runs = sessionId
		? [inFlightRecomp.get(sessionId)?.promise].filter(
				(run): run is Promise<unknown> => run !== undefined,
			)
		: [...inFlightRecomp.values()].map((run) => run.promise);
	if (runs.length === 0) return;
	await Promise.allSettled(runs);
}

/** Fence and cancel one session's detached recomp/upgrade, if still running. */
export function abortInFlightRecomps(sessionId: string): void {
	inFlightRecomp.get(sessionId)?.controller.abort();
}

/**
 * Run a recomp/upgrade body detached from the command handler.
 *
 * Registers the raw-message provider + the `recomp` status-line flag for the
 * run's lifetime, tracks the promise for shutdown drain, and cleans everything
 * up on settle. The command handler returns immediately after calling this, so
 * the Pi REPL stays responsive. `work()` owns all command-specific logic
 * (the recomp call, the published gate, marker staging, migration, and the
 * status messages it sends) and must not throw uncaught — failures are logged.
 *
 * The provider unregister is closure-guarded (setRawMessageProvider only deletes
 * if the slot still holds THIS provider), so a concurrent user turn that
 * re-registers its own provider for the same session is not clobbered on
 * cleanup.
 */
export function spawnPiRecompRun(args: {
	sessionId: string;
	provider: RawMessageProvider;
	onStatusChange: () => void;
	/** Flow label for the run ("Recomp" vs "Upgrade"); defaults to "recomp". */
	progressKind?: PiRecompProgress["kind"];
	work: (
		signal: AbortSignal,
		onProgress: (progress: PiRecompProgress) => void,
	) => Promise<void>;
}): void {
	const { sessionId, provider, onStatusChange, work } = args;
	const kind = args.progressKind ?? "recomp";
	const publishProgress = (progress: PiRecompProgress): void => {
		// The flow kind wins unless the runner explicitly set one: per-pass
		// entries do not know which user-facing flow started them, and OpenCode
		// inherits the starting entry's kind for exactly this reason.
		setPiRecompProgress(sessionId, {
			...progress,
			kind: progress.kind ?? kind,
		});
		// Invalidate the shared observability producer so the next rebuild picks
		// the new progress up. Synchronous, non-blocking, and coalesced there.
		onStatusChange();
	};
	// Immediate entry so the sidebar shows activity the instant the run is
	// accepted, not 60-90s later on the first per-pass emit. `totalMessages: 0`
	// is the shared model's indeterminate "starting" state; the runner replaces
	// it with real counters on its first pass.
	publishProgress({
		phase: "recomp",
		processedMessages: 0,
		totalMessages: 0,
		passCount: 0,
		compartmentsCreated: 0,
	});
	const controller = new AbortController();
	const unregister = setRawMessageProvider(sessionId, provider);
	setMagicContextRecompActive(sessionId, true);

	let run: InFlightRecompRun;
	const runPromise = Promise.resolve()
		.then(async () => {
			try {
				await work(controller.signal, publishProgress);
			} catch (err) {
				if (!controller.signal.aborted) {
					sessionLog(
						sessionId,
						`pi recomp run failed (detached): ${err instanceof Error ? err.message : String(err)}`,
					);
				}
			}
		})
		.finally(() => {
			if (inFlightRecomp.get(sessionId) === run) {
				inFlightRecomp.delete(sessionId);
			}
			setMagicContextRecompActive(sessionId, false);
			unregister();
			// The run is over: clear its entry so the sidebar does not keep
			// showing a frozen bar. Unlike OpenCode's 30s "done" grace there is
			// nothing to read here — the terminal reason already reached the user
			// through detachedSendStatus.
			setPiRecompProgress(sessionId, null);
			if (!controller.signal.aborted) onStatusChange();
		});
	run = { promise: runPromise, controller };
	inFlightRecomp.set(sessionId, run);
	// No extra invalidation here: the immediate "starting" entry published
	// above already signalled the run started, and the producer coalesces
	// duplicate invalidations anyway. Firing twice here would only make the
	// start indistinguishable from a second event.
}
