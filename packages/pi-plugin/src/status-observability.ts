/**
 * Cross-extension Magic Context status observability producer (PRD v2.0 §8).
 *
 * Publishes the authoritative shared Magic Context `StatusView` — the exact
 * view `/ctx-status` renders — persistently to peer Pi/OMP extensions over the
 * shared `ExtensionAPI.events` bus on the `cortexkit:magic-context:status`
 * channel. The MC PR ends at this generic channel: no Atelier, bridge-package
 * or presentation imports (the bridge is the only consumer).
 *
 * Design rules encoded here:
 * - The published payload always comes from the authoritative view path
 *   `/ctx-status` uses: `buildPiStatusDetail → statusViewSourceFromPiDetail →
 *   buildStatusView` (REQ-MC1-002). Nothing is re-derived or copied.
 * - Invalidations are coalesced from existing lifecycle/background seams
 *   (session start, agent end, session compact, assistant message end,
 *   historian / recomp / command status mutations) into one debounced rebuild
 *   per session — 150 ms, inside the 100–200 ms window (REQ-MC1-004/005).
 *   `tool_execution_end` stays on the cheap footer path (REQ-MC1-010).
 * - Only one rebuild per session may run at a time; an invalidation arriving
 *   mid-build marks the session dirty and the running loop re-checks it
 *   (REQ-MC1-006). No interval timer ever exists (REQ-MC1-005/008).
 * - A semantically equal `StatusView` does not mint a new revision and does
 *   not emit (REQ-MC1-007); a pending discovery still gets a cached replay.
 * - State is keyed by `sessionId`; `session_shutdown` removes only that
 *   session's cache/context and withdraws it. No process-global "current
 *   session" object is the source of truth (REQ-MC1-009).
 */

import { randomUUID } from "node:crypto";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { log } from "@magic-context/core/shared/logger";
import {
	buildMagicContextSidebarView,
	type MagicContextSidebarView,
} from "@magic-context/core/shared/sidebar-view";
import {
	buildStatusView as buildSharedStatusView,
	type StatusView,
} from "@magic-context/core/shared/status-view";
import packageJson from "../package.json";
import type { CtxStatusRuntimeDeps } from "./commands/ctx-status";
import { resolveSessionId } from "./commands/pi-command-utils";
import {
	buildPiStatusDetail,
	statusViewSourceFromPiDetail,
} from "./dialogs/status-dialog";
import { getPiDreamerProgress, getPiRecompProgress } from "./sidebar-progress";
import { piSidebarSnapshotFromDetail } from "./sidebar-snapshot";
import { onMagicContextStatusMutation } from "./status-line";

/** Producer → consumer channel (PRD §5). */
export const MAGIC_CONTEXT_STATUS_CHANNEL = "cortexkit:magic-context:status";
export const MAGIC_CONTEXT_STATUS_PROTOCOL_VERSION = 1 as const;
/**
 * Per-session coalescing window (REQ-MC1-005 requires 100–200 ms). A burst of
 * lifecycle signals inside the window produces one full snapshot.
 */
export const DEFAULT_STATUS_DEBOUNCE_MS = 150;

const MAX_SESSION_ID_CHARS = 256;
const MAX_REQUEST_ID_CHARS = 256;
/** Cap on coalesced discovery request ids awaiting the next publish. */
const MAX_PENDING_REQUEST_IDS = 8;

function hasControlChars(value: string): boolean {
	for (let index = 0; index < value.length; index += 1) {
		const code = value.charCodeAt(index);
		if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return true;
	}
	return false;
}

function isBoundedIdentifier(
	value: unknown,
	maxChars: number,
): value is string {
	return (
		typeof value === "string" &&
		value.length > 0 &&
		value.length <= maxChars &&
		!hasControlChars(value)
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Published payload — the shared authoritative view and nothing else
 * (REQ-MC1-003). `sidebarView` is the additive seam the later rich parity
 * phase fills in; the V1 bridge depends only on `statusView`.
 */
export interface MagicContextObservabilityPayload {
	statusView: StatusView;
	/**
	 * The shared host-neutral sidebar view (IMPL-008 model, IMPL-009 producer).
	 * Additive: V1 consumers read `statusView` only and ignore this field, and a
	 * producer that cannot build it simply omits the key.
	 */
	sidebarView?: MagicContextSidebarView;
}

export interface McStatusDiscoverEvent {
	protocolVersion: 1;
	type: "discover";
	requestId: string;
	sessionId?: string;
}

export interface McStatusSnapshotEvent {
	protocolVersion: 1;
	type: "snapshot";
	producerInstanceId: string;
	sessionId: string;
	revision: number;
	requestId?: string;
	payload: MagicContextObservabilityPayload;
}

export interface McStatusWithdrawEvent {
	protocolVersion: 1;
	type: "withdraw";
	producerInstanceId: string;
	sessionId?: string;
}

export type McStatusEvent =
	| McStatusDiscoverEvent
	| McStatusSnapshotEvent
	| McStatusWithdrawEvent;

/** Structural guard for bridge → producer discovery (PRD §5.4). */
export function isMcStatusDiscoverEvent(
	value: unknown,
): value is McStatusDiscoverEvent {
	return (
		isRecord(value) &&
		value.protocolVersion === MAGIC_CONTEXT_STATUS_PROTOCOL_VERSION &&
		value.type === "discover" &&
		isBoundedIdentifier(value.requestId, MAX_REQUEST_ID_CHARS) &&
		(value.sessionId === undefined ||
			isBoundedIdentifier(value.sessionId, MAX_SESSION_ID_CHARS))
	);
}

/** Shared event-bus surface of `ExtensionAPI.events`. */
export interface StatusEventBus {
	on(channel: string, handler: (data: unknown) => void): () => void;
	emit(channel: string, data: unknown): void;
}

export interface MagicContextStatusObservabilityOptions {
	/** Shared host event bus (`pi.events`). */
	events: StatusEventBus;
	/**
	 * The authoritative V1 pipeline for one fixed session:
	 * `buildPiStatusDetail → statusViewSourceFromPiDetail → buildStatusView`
	 * (REQ-MC1-002). Called only from the debounced rebuild path.
	 */
	buildStatusView(ctx: ExtensionContext, sessionId: string): StatusView;
	/**
	 * The shared host-neutral sidebar view for the same rebuild (REQ-MC2-004).
	 * Optional so a V1-only producer keeps working; when present the published
	 * payload carries it alongside `statusView`.
	 */
	buildSidebarView?(
		ctx: ExtensionContext,
		sessionId: string,
	): MagicContextSidebarView | undefined;
	/** Debounce window; defaults to {@link DEFAULT_STATUS_DEBOUNCE_MS}. */
	debounceMs?: number;
	/** Non-fatal error sink; defaults to the shared logger. */
	onWarn?(message: string): void;
	/** Hook for registration-owned teardown (channel/mutation unsubscribers). */
	onDispose?(): void;
}

export interface PublishedMagicContextStatus {
	sessionId: string;
	revision: number;
	statusView: StatusView;
	/** Present only when the producer supplies a sidebar view. */
	sidebarView?: MagicContextSidebarView;
	/** Serialized form used by the equality gate (REQ-MC1-007). */
	serialized: string;
}

export interface MagicContextStatusProducer {
	/** Stable per-extension-instance id (PRD §5.2). */
	readonly producerInstanceId: string;
	/**
	 * Host lifecycle boundary: record the session's current context, mark it
	 * active, and schedule one debounced rebuild (REQ-MC1-004).
	 */
	noteLifecycle(sessionId: string, ctx: ExtensionContext, reason: string): void;
	/**
	 * Background status-mutation seam (historian / recomp / commands): schedule
	 * a debounced rebuild for that session without touching "active" state.
	 */
	invalidate(sessionId: string, reason: string): void;
	/** Handle a bridge-emitted discovery: replay cache or schedule one build. */
	handleDiscover(requestId: string): void;
	/**
	 * Session teardown: drop only that session's context/cache/timer and
	 * withdraw its published state (REQ-MC1-009).
	 */
	releaseSession(sessionId: string): void;
	/** Full producer teardown (reload / tests): timers, channels, withdraw. */
	dispose(options?: { withdraw?: boolean }): void;
	/** Introspection seams (tests / diagnostics). */
	currentSessionId(): string | undefined;
	currentRevision(): number;
	publishedStatus(sessionId?: string): PublishedMagicContextStatus | null;
	hasContext(sessionId: string): boolean;
	pendingRebuilds(): number;
	rebuildCount(): number;
}

/**
 * Create the producer. Subscribes to the producer channel for discovery
 * immediately; the host wiring layer feeds it lifecycle events and the
 * authoritative rebuild function.
 */
export function createMagicContextStatusProducer(
	options: MagicContextStatusObservabilityOptions,
): MagicContextStatusProducer {
	const debounceMs = options.debounceMs ?? DEFAULT_STATUS_DEBOUNCE_MS;
	const report = (message: string): void => {
		if (options.onWarn) options.onWarn(message);
		else log(`[mc-status-observability] ${message}`);
	};

	const producerInstanceId = `mc-${randomUUID()}`;
	/** The session's current host context, keyed by session (REQ-MC1-009). */
	const contextBySession = new Map<string, ExtensionContext>();
	const publishedBySession = new Map<string, PublishedMagicContextStatus>();
	const timers = new Map<string, ReturnType<typeof setTimeout>>();
	const dirty = new Set<string>();
	const building = new Set<string>();
	const pendingRequestIds: string[] = [];
	/** The host's active session as last observed on a lifecycle boundary. */
	let activeSessionId: string | undefined;
	let revision = 0;
	let rebuilds = 0;
	let disposed = false;

	// --- envelope emission -----------------------------------------------------

	const emitEvent = (
		event: McStatusSnapshotEvent | McStatusWithdrawEvent,
	): void => {
		try {
			options.events.emit(MAGIC_CONTEXT_STATUS_CHANNEL, event);
		} catch (err) {
			report(`failed to emit status event: ${String(err)}`);
		}
	};

	/**
	 * One broadcast reaches every peer on the shared bus, so a single pending
	 * requestId is consumed per emit and the remainder cleared.
	 */
	const emitSnapshot = (entry: PublishedMagicContextStatus): void => {
		const requestId = pendingRequestIds.shift();
		if (pendingRequestIds.length > 0) pendingRequestIds.length = 0;
		emitEvent({
			protocolVersion: MAGIC_CONTEXT_STATUS_PROTOCOL_VERSION,
			type: "snapshot",
			producerInstanceId,
			sessionId: entry.sessionId,
			revision: entry.revision,
			...(requestId !== undefined ? { requestId } : {}),
			// The sidebar key is OMITTED, never `undefined`, when absent, so a
			// V1 consumer sees byte-identical payloads to the ones it saw before
			// rich parity existed.
			payload: {
				statusView: entry.statusView,
				...(entry.sidebarView ? { sidebarView: entry.sidebarView } : {}),
			},
		});
	};

	const pendRequest = (requestId: string): void => {
		pendingRequestIds.push(requestId);
		if (pendingRequestIds.length > MAX_PENDING_REQUEST_IDS) {
			pendingRequestIds.splice(0, 1);
		}
	};

	// --- debounced rebuild (REQ-MC1-004/005/006) ------------------------------

	const publish = (
		sessionId: string,
		statusView: StatusView,
		sidebarView: MagicContextSidebarView | undefined,
	): void => {
		// Equality gate (REQ-MC1-007): a semantically equal view does not mint
		// a new revision and does not emit — but a pending discovery still gets
		// a replay of the current entry. The gate spans BOTH views, so a live
		// recomp tick that only moves the sidebar still publishes.
		const serialized = JSON.stringify(
			sidebarView ? { statusView, sidebarView } : statusView,
		);
		const existing = publishedBySession.get(sessionId);
		if (existing && existing.serialized === serialized) {
			if (pendingRequestIds.length > 0) emitSnapshot(existing);
			return;
		}
		revision += 1;
		const entry: PublishedMagicContextStatus = {
			sessionId,
			revision,
			statusView,
			...(sidebarView ? { sidebarView } : {}),
			serialized,
		};
		publishedBySession.set(sessionId, entry);
		emitSnapshot(entry);
	};

	const runBuild = (sessionId: string): void => {
		if (disposed) return;
		if (building.has(sessionId)) {
			// REQ-MC1-006: never overlap rebuilds for one session; the running
			// loop re-checks the dirty flag when it finishes.
			dirty.add(sessionId);
			return;
		}
		const ctx = contextBySession.get(sessionId);
		if (!ctx) return; // no current context for this session (REQ-MC1-008)
		building.add(sessionId);
		try {
			let guard = 0;
			do {
				dirty.delete(sessionId);
				const statusView = options.buildStatusView(ctx, sessionId);
				const sidebarView = options.buildSidebarView?.(ctx, sessionId);
				rebuilds += 1;
				// Session released (or producer disposed) while building: drop
				// the late result instead of publishing retired-session state.
				if (disposed || !contextBySession.has(sessionId)) return;
				publish(sessionId, statusView, sidebarView);
				guard += 1;
			} while (dirty.has(sessionId) && !disposed && guard < 16);
		} catch (err) {
			report(`status rebuild failed for session ${sessionId}: ${String(err)}`);
		} finally {
			building.delete(sessionId);
		}
	};

	const scheduleRebuild = (sessionId: string): void => {
		if (disposed) return;
		if (!contextBySession.has(sessionId)) return; // nothing to build from yet
		dirty.add(sessionId);
		if (building.has(sessionId)) return; // running loop picks it up
		if (timers.has(sessionId)) return; // already scheduled — coalesce
		timers.set(
			sessionId,
			setTimeout(() => {
				timers.delete(sessionId);
				runBuild(sessionId);
			}, debounceMs),
		);
	};

	// --- discovery (PRD §5.4, REQ-MC1-008) ------------------------------------

	const handleDiscover = (requestId: string): void => {
		if (disposed || !isBoundedIdentifier(requestId, MAX_REQUEST_ID_CHARS)) {
			return;
		}
		const sessionId = activeSessionId;
		if (sessionId === undefined) return; // no current session context known
		const entry = publishedBySession.get(sessionId);
		if (entry) {
			// Replay the cached view immediately; discovery never rebuilds when
			// a cache exists, and duplicate discoveries coalesce into the one
			// scheduled build below (no repeated computation).
			pendRequest(requestId);
			emitSnapshot(entry);
			return;
		}
		pendRequest(requestId);
		scheduleRebuild(sessionId);
	};

	const unsubscribeChannel = options.events.on(
		MAGIC_CONTEXT_STATUS_CHANNEL,
		(data) => {
			if (disposed) return;
			try {
				if (isMcStatusDiscoverEvent(data)) handleDiscover(data.requestId);
				// Foreign snapshots/withdraws on our channel are ignored; we only
				// ever answer discoveries.
			} catch (err) {
				report(`failed to handle producer-channel event: ${String(err)}`);
			}
		},
	);

	return {
		producerInstanceId,

		noteLifecycle(sessionId, ctx, reason) {
			if (disposed || sessionId.length === 0) return;
			activeSessionId = sessionId;
			contextBySession.set(sessionId, ctx);
			log(`mc status invalidation (${reason}) session=${sessionId}`);
			scheduleRebuild(sessionId);
		},

		invalidate(sessionId, reason) {
			if (disposed || sessionId.length === 0) return;
			log(`mc status invalidation (${reason}) session=${sessionId}`);
			scheduleRebuild(sessionId);
		},

		handleDiscover,

		releaseSession(sessionId) {
			if (disposed) return;
			const timer = timers.get(sessionId);
			if (timer !== undefined) {
				clearTimeout(timer);
				timers.delete(sessionId);
			}
			dirty.delete(sessionId);
			building.delete(sessionId);
			contextBySession.delete(sessionId);
			const hadPublished = publishedBySession.delete(sessionId);
			if (activeSessionId === sessionId) activeSessionId = undefined;
			// Only the retired session's state disappears; the producer itself
			// survives `/new`, `/resume` and `/fork` (REQ-MC1-009).
			if (hadPublished) {
				emitEvent({
					protocolVersion: MAGIC_CONTEXT_STATUS_PROTOCOL_VERSION,
					type: "withdraw",
					producerInstanceId,
					sessionId,
				});
			}
		},

		dispose(disposeOptions) {
			if (disposed) return;
			disposed = true;
			for (const timer of timers.values()) clearTimeout(timer);
			timers.clear();
			dirty.clear();
			building.clear();
			try {
				unsubscribeChannel();
			} catch (err) {
				report(`failed to unsubscribe producer channel: ${String(err)}`);
			}
			try {
				options.onDispose?.();
			} catch (err) {
				report(`dispose hook failed: ${String(err)}`);
			}
			if (disposeOptions?.withdraw !== false) {
				emitEvent({
					protocolVersion: MAGIC_CONTEXT_STATUS_PROTOCOL_VERSION,
					type: "withdraw",
					producerInstanceId,
					...(activeSessionId !== undefined
						? { sessionId: activeSessionId }
						: {}),
				});
			}
			publishedBySession.clear();
			contextBySession.clear();
			pendingRequestIds.length = 0;
			activeSessionId = undefined;
		},

		currentSessionId: () => activeSessionId,
		currentRevision: () => revision,
		publishedStatus: (sessionId) => {
			const key = sessionId ?? activeSessionId;
			if (key === undefined) return null;
			return publishedBySession.get(key) ?? null;
		},
		hasContext: (sessionId) => contextBySession.has(sessionId),
		pendingRebuilds: () => timers.size,
		rebuildCount: () => rebuilds,
	};
}

export interface RegisterMagicContextStatusObservabilityOptions {
	/**
	 * The same dynamic status-dependency resolver `/ctx-status` uses
	 * (REQ-MC1-001). Receives the current extension context.
	 */
	resolveStatusDeps?: (ctx: { cwd: string }) => CtxStatusRuntimeDeps;
	/** Static boot deps — the fallback mirroring `/ctx-status`'s `?? deps`. */
	baseDeps?: CtxStatusRuntimeDeps;
	/** Coalescing window override (tests). */
	debounceMs?: number;
	/** Non-fatal error sink (tests). */
	onWarn?(message: string): void;
}

/**
 * Both authoritative views from ONE detail read.
 *
 * The V1 build is exactly the pipeline `/ctx-status` renders (REQ-MC1-002).
 * The sidebar view is the same detail adapted to the shared `SidebarSnapshot`
 * and handed to the shared model (REQ-MC2-004), with live recomp/Dreamer
 * progress pulled from the session/project trackers. They are produced
 * together so a rebuild never reads the database twice for one publish.
 */
function buildAuthoritativeViews(
	pi: ExtensionAPI,
	options: RegisterMagicContextStatusObservabilityOptions,
	ctx: ExtensionContext,
	sessionId: string,
): { statusView: StatusView; sidebarView: MagicContextSidebarView } {
	const runtimeDeps = options.resolveStatusDeps?.(ctx) ?? options.baseDeps;
	if (!runtimeDeps) {
		throw new Error("mc status: no status-dependency resolver configured");
	}
	const projectIdentity =
		runtimeDeps.resolveProject?.(ctx).projectIdentity ??
		runtimeDeps.projectIdentity;
	const detail = buildPiStatusDetail(
		pi,
		ctx,
		{ ...runtimeDeps, projectIdentity },
		sessionId,
	);
	const statusView = buildSharedStatusView(
		statusViewSourceFromPiDetail(detail),
		{
			version: packageJson.version,
		},
	);
	const snapshot = piSidebarSnapshotFromDetail(detail, {
		projectIdentity,
		recompProgress: getPiRecompProgress(sessionId),
		dreamerProgress: getPiDreamerProgress(projectIdentity),
	});
	// Pi/OMP has no per-section TUI preference file like the OpenCode sidebar,
	// so every named section is offered and the consumer decides what to show.
	const sidebarView = buildMagicContextSidebarView(snapshot, {
		collapsed: false,
		sections: {
			historian: true,
			memory: true,
			status: true,
			dreamer: true,
			stats: true,
		},
		headerLabel: "MagicContext",
	});
	return { statusView, sidebarView };
}

/**
 * The authoritative V1 build alone, kept as the exported seam the existing
 * tests and the `/ctx-status`-shaped callers use.
 */
function buildAuthoritativeStatusView(
	pi: ExtensionAPI,
	options: RegisterMagicContextStatusObservabilityOptions,
	ctx: ExtensionContext,
	sessionId: string,
): StatusView {
	return buildAuthoritativeViews(pi, options, ctx, sessionId).statusView;
}

/**
 * Register the producer against the Pi/OMP extension runtime (REQ-MC1-001).
 *
 * Wiring (all existing seams, no new timers):
 * - producer channel → bridge discovery replies;
 * - `session_start` / `agent_end` / `session_compact` / assistant
 *   `message_end` → context capture + debounced rebuild (REQ-MC1-004);
 * - historian / recomp / command status mutations → the same debounced
 *   rebuild through the shared mutation seam;
 * - `session_shutdown` → that session's cache/context withdrawn only
 *   (REQ-MC1-009). The cheap `registerStatusLine()` footer and the
 *   `/ctx-status` command/dialog stay untouched (REQ-MC1-010/011).
 */
export function registerMagicContextStatusObservability(
	pi: ExtensionAPI,
	options: RegisterMagicContextStatusObservabilityOptions,
): MagicContextStatusProducer {
	const producer = createMagicContextStatusProducer({
		events: pi.events,
		buildStatusView: (ctx, sessionId) =>
			buildAuthoritativeStatusView(pi, options, ctx, sessionId),
		buildSidebarView: (ctx, sessionId) =>
			buildAuthoritativeViews(pi, options, ctx, sessionId).sidebarView,
		...(options.debounceMs !== undefined
			? { debounceMs: options.debounceMs }
			: {}),
		...(options.onWarn !== undefined ? { onWarn: options.onWarn } : {}),
		onDispose: () => unsubscribeMutation(),
	});

	const noteFromContext = (reason: string, ctx: ExtensionContext): void => {
		const sessionId = resolveSessionId(ctx);
		if (sessionId) producer.noteLifecycle(sessionId, ctx, reason);
	};

	pi.on("session_start", (_event, ctx) =>
		noteFromContext("session_start", ctx),
	);
	pi.on("agent_end", (_event, ctx) => noteFromContext("agent_end", ctx));
	pi.on("session_compact", (_event, ctx) =>
		noteFromContext("session_compact", ctx),
	);
	pi.on("message_end", (event, ctx) => {
		// Only assistant completions change rich status meaningfully; tool and
		// user message ends stay on the cheap footer path (REQ-MC1-004).
		const role = (event.message as { role?: unknown } | undefined)?.role;
		if (role !== "assistant") return;
		noteFromContext("assistant_message_end", ctx);
	});
	pi.on("session_shutdown", (_event, ctx) => {
		const sessionId = resolveSessionId(ctx);
		if (sessionId) producer.releaseSession(sessionId);
	});

	// Historian / recomp / command status mutations funnel through one shared
	// seam so this module never has to be imported by the mutation call sites.
	const unsubscribeMutation = onMagicContextStatusMutation((sessionId) => {
		producer.invalidate(sessionId, "status-mutation");
	});

	return producer;
}
