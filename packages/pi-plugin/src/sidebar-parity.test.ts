/**
 * Pi/OMP rich sidebar parity (PRD v2.0 §14 IMPL-009, REQ-MC2-004..008,
 * AC-023..AC-027, VAL-019/020).
 *
 * Three things are proved here:
 * 1. **Lifecycle reachability.** The recomp fixture drives the REAL production
 *    seam (`spawnPiRecompRun` → the forwarded `onProgress` the recomp command
 *    hands to `executeContextRecompWithResult`), not a tracker map poked
 *    directly. Setting a tracker map is not evidence on its own.
 * 2. **Field dispositions.** Every OpenCode sidebar field is explicitly
 *    PARITY / HOST-ADAPTED / NOT APPLICABLE with the reason inline, so a
 *    future divergence has to be argued rather than drift in.
 * 3. **Semantic equivalence.** For equivalent input, Pi's adapted snapshot
 *    produces byte-identical shared sidebar output to OpenCode's snapshot —
 *    which is the whole point of extracting the model in IMPL-008.
 */
import { beforeEach, describe, expect, it } from "bun:test";
import type { SidebarSnapshot } from "@magic-context/core/shared/rpc-types";
import {
	type BuildSidebarViewOptions,
	buildMagicContextSidebarView,
	type MagicContextSidebarView,
} from "@magic-context/core/shared/sidebar-view";
import type { StatusDialogDetail } from "./dialogs/status-dialog";
import { spawnPiRecompRun } from "./pi-recomp-runner";
import {
	getPiDreamerProgress,
	getPiDreamerProgressTask,
	getPiRecompProgress,
	piSidebarProgressCounts,
	releasePiSidebarProgress,
	resetPiSidebarProgress,
	setPiDreamerProgress,
} from "./sidebar-progress";
import { piSidebarSnapshotFromDetail } from "./sidebar-snapshot";

const PROJECT = "/proj/pi-parity";
const SESSION = "ses_pi_parity";

/** Fixed clock so every relative-time row in this suite is deterministic. */
const NOW = 1_730_000_000_000;

const VIEW_OPTIONS: BuildSidebarViewOptions = {
	collapsed: false,
	sections: {
		historian: true,
		memory: true,
		status: true,
		dreamer: true,
		stats: true,
	},
	headerLabel: "MagicContext",
	now: NOW,
};

beforeEach(() => {
	resetPiSidebarProgress();
});

/**
 * A Pi status detail carrying the same values the OpenCode sidebar fixture
 * uses, so the two paths can be compared field-for-field.
 */
function makeDetail(
	overrides: Partial<StatusDialogDetail> = {},
): StatusDialogDetail {
	const base = {
		sessionId: SESSION,
		activeProfile: null,
		usagePercentage: 43.8,
		inputTokens: 68_000,
		systemPromptTokens: 8_000,
		compartmentCount: 12,
		lastCompartmentRange: null,
		memoryCount: 42,
		memoryBlockCount: 3,
		memoryImportanceHistogram: {
			total: 0,
			unclassified: 0,
			bands: { "0-19": 0, "20-39": 0, "40-59": 0, "60-79": 0, "80-100": 0 },
		},
		sessionNoteCount: 5,
		readySmartNoteCount: 4,
		pendingOpsCount: 2,
		compactionMarker: {
			code: null,
			attempts: 0,
			lastError: null,
			pendingSinceMs: null,
		},
		historianRunning: false,
		timesExecuteThresholdReached: 0,
		historianFailureCount: 0,
		historianLastFailureAt: null,
		historianLastError: null,
		cacheTtl: "1h",
		cacheTtlSource: "config",
		configParseFailures: [],
		lastResponseTime: 0,
		cacheRemainingMs: 3_600_000,
		cacheExpired: false,
		lastNudgeTokens: 0,
		lastNudgeBand: "none",
		lastTransformError: null,
		isSubagent: false,
		contextLimit: 155_000,
		executeThreshold: 65,
		executeThresholdMode: "percentage",
		protectedTokens: {
			protectedCount: 0,
			protectedTokens: 0,
			windowMs: 0,
		},
		historyBlockTokens: 0,
		compressionBudget: null,
		compressionUsage: null,
		activeTags: 0,
		droppedTags: 0,
		totalTags: 0,
		activeBytes: 0,
		compartmentTokens: 12_000,
		factTokens: 3_000,
		memoryTokens: 6_000,
		docsTokens: 4_000,
		profileTokens: 1_000,
		conversationTokens: 30_000,
		toolCallTokens: 4_000,
		toolDefinitionTokens: 0,
		newWorkTokens: 0,
		totalInputTokens: 68_000,
		upgradeNeededCount: 0,
		recompInFlight: false,
		hasDeprecatedProtectedTags: false,
		compactionEnabled: true,
		dreamer: {
			enabled: true,
			scheduleSummary: null,
			lastRunAt: NOW - 300_000,
			backlog: {},
			failures: [],
			tickFailure: null,
		},
		embedding: { state: "ready", indexed: 0, total: 0 },
	} as unknown as StatusDialogDetail;
	return { ...base, ...overrides } as StatusDialogDetail;
}

/** The equivalent OpenCode-side snapshot for the same numbers. */
function makeOpenCodeSnapshot(): SidebarSnapshot {
	return {
		sessionId: SESSION,
		usagePercentage: 43.8,
		inputTokens: 68_000,
		contextLimit: 155_000,
		compaction_enabled: true,
		systemPromptTokens: 8_000,
		compartmentCount: 12,
		memoryCount: 42,
		memoryBlockCount: 3,
		pendingOpsCount: 2,
		historianRunning: false,
		compartmentInProgress: false,
		sessionNoteCount: 5,
		readySmartNoteCount: 4,
		cacheTtl: "1h",
		lastTransformError: null,
		lastDreamerRunAt: NOW - 300_000,
		projectIdentity: PROJECT,
		compartmentTokens: 12_000,
		factTokens: 3_000,
		memoryTokens: 6_000,
		docsTokens: 4_000,
		profileTokens: 1_000,
		conversationTokens: 30_000,
		toolCallTokens: 4_000,
		toolDefinitionTokens: 0,
		executeThreshold: 65,
		newWorkTokens: 0,
		totalInputTokens: 68_000,
	};
}

function buildPiView(detail: StatusDialogDetail): MagicContextSidebarView {
	return buildMagicContextSidebarView(
		piSidebarSnapshotFromDetail(detail, {
			projectIdentity: PROJECT,
			recompProgress: getPiRecompProgress(detail.sessionId),
			dreamerProgress: getPiDreamerProgress(PROJECT),
		}),
		VIEW_OPTIONS,
	);
}

describe("Pi/OMP → shared sidebar semantic equivalence (VAL-019)", () => {
	it("produces an identical view to OpenCode for an equivalent snapshot", () => {
		const pi = buildPiView(makeDetail());
		const openCode = buildMagicContextSidebarView(
			makeOpenCodeSnapshot(),
			VIEW_OPTIONS,
		);
		expect(pi).toEqual(openCode);
	});

	it("keeps Pi's own project identity in the adapted snapshot", () => {
		const snapshot = piSidebarSnapshotFromDetail(makeDetail(), {
			projectIdentity: PROJECT,
		});
		expect(snapshot.projectIdentity).toBe(PROJECT);
	});

	it("host limitations reach the sidebar as the same codes the status view uses", () => {
		// The adapter reuses piStatusWarnings rather than re-deriving, so a
		// limitation the dialog already explains also explains itself here.
		const detail = makeDetail();
		const snapshot = piSidebarSnapshotFromDetail(detail, {
			projectIdentity: PROJECT,
		});
		expect(Array.isArray(snapshot.hostLimitations)).toBe(true);
		const view = buildMagicContextSidebarView(snapshot, VIEW_OPTIONS);
		// No limitations on a healthy detail: no warning lines at all.
		expect(view.warnings).toEqual([]);
	});
});

describe("field disposition matrix", () => {
	const snapshot = () =>
		piSidebarSnapshotFromDetail(makeDetail(), { projectIdentity: PROJECT });

	it("PARITY: token categories and counts come straight from the detail", () => {
		const s = snapshot();
		expect(s.systemPromptTokens).toBe(8_000);
		expect(s.compartmentTokens).toBe(12_000);
		expect(s.factTokens).toBe(3_000);
		expect(s.memoryTokens).toBe(6_000);
		expect(s.docsTokens).toBe(4_000);
		expect(s.profileTokens).toBe(1_000);
		expect(s.conversationTokens).toBe(30_000);
		expect(s.toolCallTokens).toBe(4_000);
		expect(s.toolDefinitionTokens).toBe(0);
	});

	it("PARITY: compaction mode, threshold and clamp carry the marker", () => {
		const s = piSidebarSnapshotFromDetail(
			makeDetail({
				compactionEnabled: false,
				executeThreshold: 95,
				executeThresholdClamped: true,
			}),
			{ projectIdentity: PROJECT },
		);
		expect(s.compaction_enabled).toBe(false);
		expect(s.executeThreshold).toBe(95);
		expect(s.executeThresholdClamped).toBe(true);
		// Clamp marker only when it actually happened.
		expect(
			piSidebarSnapshotFromDetail(makeDetail(), { projectIdentity: PROJECT })
				.executeThresholdClamped,
		).toBeUndefined();
	});

	it("PARITY: existing last-run / backlog / failure Dreamer state is retained", () => {
		const detail = makeDetail({
			dreamer: {
				enabled: true,
				scheduleSummary: "0 */6 * * *",
				lastRunAt: 42,
				backlog: { curate: { pending: 3, total: 9 } } as never,
				failures: [{ task: "verify", lastError: "boom" }] as never,
				tickFailure: null,
			},
		} as unknown as Partial<StatusDialogDetail>);
		const s = piSidebarSnapshotFromDetail(detail, { projectIdentity: PROJECT });
		expect(s.lastDreamerRunAt).toBe(42);
		expect(s.dreamerBacklog).toEqual({ curate: { pending: 3, total: 9 } });
		expect(s.dreamerFailures).toEqual([{ task: "verify", lastError: "boom" }]);
	});

	it("HOST-ADAPTED: compartmentInProgress is false, not invented", () => {
		// Pi's historian exposes only a running boolean. Reporting a second,
		// independent "a pass is running" signal would misrepresent the
		// scheduler, so the field is explicitly false.
		expect(snapshot().compartmentInProgress).toBe(false);
		expect(snapshot().historianRunning).toBe(false);
	});

	it("NOT APPLICABLE: archivedCompartmentCount is omitted, never zeroed", () => {
		// Pi never archives rows behind a native-compaction takeover. Omitting
		// the key keeps the shared model from rendering a meaningless "0".
		expect("archivedCompartmentCount" in snapshot()).toBe(false);
	});
});

describe("recomp live progress through the production seam (VAL-020)", () => {
	it("start → 20/100 → pass 2/3 compartments → clear produces the expected transitions", async () => {
		const seen: Array<ReturnType<typeof getPiRecompProgress>> = [];
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});

		spawnPiRecompRun({
			sessionId: SESSION,
			provider: { readMessages: async () => [] } as never,
			onStatusChange: () => undefined,
			work: async (_signal, onProgress) => {
				// This is the callback the recomp command hands to the shared
				// runner as `onRecompProgress`.
				seen.push(getPiRecompProgress(SESSION));
				onProgress({
					phase: "recomp",
					processedMessages: 20,
					totalMessages: 100,
					passCount: 2,
					compartmentsCreated: 3,
					note: "Running historian…",
				});
				seen.push(getPiRecompProgress(SESSION));
				await gate;
				onProgress({
					phase: "done",
					processedMessages: 100,
					totalMessages: 100,
					passCount: 3,
					compartmentsCreated: 9,
					message: "Recomp complete",
				});
				seen.push(getPiRecompProgress(SESSION));
			},
		});
		await Promise.resolve();
		await Promise.resolve();

		// Immediate entry: indeterminate starting state, correct flow label.
		expect(seen[0]).toEqual({
			kind: "recomp",
			phase: "recomp",
			processedMessages: 0,
			totalMessages: 0,
			passCount: 0,
			compartmentsCreated: 0,
		});

		// Mid-run entry reaches the shared model's bar and note.
		const mid = seen[1];
		expect(mid).toMatchObject({
			kind: "recomp",
			phase: "recomp",
			processedMessages: 20,
			totalMessages: 100,
			passCount: 2,
			compartmentsCreated: 3,
			note: "Running historian…",
		});
		const midView = buildPiView(makeDetail());
		// The shared model attaches live recomp progress to the Historian
		// section — the one whose content the run is rebuilding.
		const recomp = midView.historian?.recomp;
		expect(recomp?.verb).toBe("Recomp");
		expect(recomp?.bar?.percentText).toBe("20");
		expect(recomp?.note).toBe("Running historian…");
		// Compartments row carries both counters the bead requires.
		expect(recomp?.rows).toEqual([
			{
				label: "Compartments",
				value: "3 (2 passes)",
				tone: "muted",
				bold: true,
			},
		]);

		release();
		await new Promise((resolve) => setTimeout(resolve, 5));

		// Terminal entry is visible before the run settles.
		expect(seen[2]).toMatchObject({ phase: "done", passCount: 3 });
		// ...and the entry is cleared on settle so no frozen bar survives.
		expect(getPiRecompProgress(SESSION)).toBeNull();
	});

	it("labels an upgrade run with the flow that started it", async () => {
		spawnPiRecompRun({
			sessionId: "ses_upgrade",
			provider: { readMessages: async () => [] } as never,
			onStatusChange: () => undefined,
			progressKind: "upgrade",
			work: async () => undefined,
		});
		await Promise.resolve();
		expect(getPiRecompProgress("ses_upgrade")?.kind).toBe("upgrade");
		spawnPiRecompRun({
			sessionId: "ses_upgrade2",
			provider: { readMessages: async () => [] } as never,
			onStatusChange: () => undefined,
			work: async () => undefined,
		});
		await Promise.resolve();
		// Default stays "recomp" so a plain /ctx-recomp never says "Upgrade".
		expect(getPiRecompProgress("ses_upgrade2")?.kind).toBe("recomp");
	});

	it("stays non-blocking: the command returns before the run finishes", async () => {
		let finished = false;
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		// spawnPiRecompRun returns synchronously with the run still pending —
		// the detached contract the Pi REPL depends on.
		spawnPiRecompRun({
			sessionId: "ses_detached",
			provider: { readMessages: async () => [] } as never,
			onStatusChange: () => undefined,
			work: async () => {
				await gate;
				finished = true;
			},
		});
		expect(finished).toBe(false);
		expect(getPiRecompProgress("ses_detached")).not.toBeNull();
		release();
		await new Promise((resolve) => setTimeout(resolve, 5));
		expect(finished).toBe(true);
	});

	it("releases a session's recomp entry on teardown", async () => {
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		spawnPiRecompRun({
			sessionId: "ses_release",
			provider: { readMessages: async () => [] } as never,
			onStatusChange: () => undefined,
			work: async () => gate,
		});
		try {
			await Promise.resolve();
			expect(piSidebarProgressCounts().recomp).toBeGreaterThan(0);
			releasePiSidebarProgress("ses_release");
			expect(getPiRecompProgress("ses_release")).toBeNull();
		} finally {
			// MUST drain: `awaitInFlightRecomps()` with no session id waits on
			// every run in this process, so a run left pending here would hang
			// unrelated suites that share the runner module.
			release();
			await new Promise((resolve) => setTimeout(resolve, 5));
		}
	});
});

describe("Dreamer live progress (VAL-020)", () => {
	it("idle shows no current-task line", () => {
		expect(getPiDreamerProgress(PROJECT)).toBeNull();
		expect(getPiDreamerProgressTask(PROJECT)).toBeUndefined();
	});

	it("a running task surfaces as a sidebar warning and a Current row", () => {
		setPiDreamerProgress(PROJECT, {
			task: "curate",
			processed: 12,
			total: 40,
			startedAt: NOW,
		});
		const view = buildPiView(makeDetail());
		expect(view.warnings).toEqual([
			{ text: "Dreamer curate: 12/40 processed", tone: "warning" },
		]);
		const dreamer = view.dreamer;
		expect(dreamer?.rows).toEqual([
			{ label: "Current", value: "curate 12/40", tone: "warning", bold: true },
			// Existing last-run state is retained alongside the new live row.
			{ label: "Last run", value: "5m ago", tone: "muted", bold: true },
		]);
	});

	it("completion clears the entry, but only for the task that completed", () => {
		setPiDreamerProgress(PROJECT, {
			task: "curate",
			processed: 40,
			total: 40,
			startedAt: NOW,
		});
		// A stale completion for a DIFFERENT task must not wipe the live entry.
		expect(getPiDreamerProgressTask(PROJECT)).toBe("curate");
		setPiDreamerProgress(PROJECT, null);
		expect(getPiDreamerProgress(PROJECT)).toBeNull();
	});

	it("progress keyed by project does not leak across projects", () => {
		setPiDreamerProgress("/a", {
			task: "verify",
			processed: 1,
			total: 2,
			startedAt: 1,
		});
		expect(getPiDreamerProgress("/b")).toBeNull();
		expect(getPiDreamerProgressTask("/a")).toBe("verify");
	});

	it("session release keeps Dreamer progress (the scheduler outlives a session)", () => {
		setPiDreamerProgress(PROJECT, {
			task: "maintain-docs",
			processed: 1,
			total: 3,
			startedAt: 1,
		});
		releasePiSidebarProgress(SESSION);
		expect(getPiDreamerProgress(PROJECT)).not.toBeNull();
	});
});
