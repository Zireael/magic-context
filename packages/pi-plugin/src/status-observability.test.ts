/**
 * Tests for the cross-extension Magic Context status observability producer
 * (PRD v2.0 §8, REQ-MC1-001..011, bead IMPL-004).
 *
 * Real envelopes on a real bus, the authoritative `buildPiStatusDetail →
 * statusViewSourceFromPiDetail → buildStatusView` pipeline against a real
 * test database, and the registration wiring. Removing lifecycle
 * registration, the shared-resolver linkage or the authoritative pipeline
 * breaks these tests.
 */
import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { resolveProjectIdentity } from "@magic-context/core/features/magic-context/memory/project-identity";
import { closeQuietly } from "@magic-context/core/shared/sqlite-helpers";
import { buildStatusView } from "@magic-context/core/shared/status-view";
import packageJson from "../package.json";
import {
	buildPiStatusDetail,
	statusViewSourceFromPiDetail,
} from "./dialogs/status-dialog";
import {
	notifyMagicContextStatusMutation,
	setMagicContextRecompActive,
} from "./status-line";
import {
	createMagicContextStatusProducer,
	DEFAULT_STATUS_DEBOUNCE_MS,
	isMcStatusDiscoverEvent,
	MAGIC_CONTEXT_STATUS_CHANNEL,
	type McStatusSnapshotEvent,
	registerMagicContextStatusObservability,
} from "./status-observability";
import { createTestDb, fakeContext } from "./test-utils.test";

const DEBOUNCE = 5;
const AFTER = 40;

const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

interface RecordedEvent {
	channel: string;
	data: Record<string, unknown>;
}

function makeBus() {
	const listeners = new Map<string, Set<(data: unknown) => void>>();
	const emitted: RecordedEvent[] = [];
	return {
		emitted,
		events: {
			on(channel: string, handler: (data: unknown) => void) {
				const set = listeners.get(channel) ?? new Set();
				set.add(handler);
				listeners.set(channel, set);
				return () => set.delete(handler);
			},
			emit(channel: string, data: unknown) {
				emitted.push({ channel, data: data as Record<string, unknown> });
				for (const handler of [...(listeners.get(channel) ?? [])]) {
					handler(data);
				}
			},
		},
		emitRaw(channel: string, data: unknown) {
			for (const handler of [...(listeners.get(channel) ?? [])]) handler(data);
		},
	};
}

type Bus = ReturnType<typeof makeBus>;

function snapshotEvents(bus: Bus): McStatusSnapshotEvent[] {
	return bus.emitted
		.filter(
			(entry) =>
				entry.channel === MAGIC_CONTEXT_STATUS_CHANNEL &&
				entry.data.type === "snapshot",
		)
		.map((entry) => entry.data as unknown as McStatusSnapshotEvent);
}

function withdrawEvents(bus: Bus): Array<Record<string, unknown>> {
	return bus.emitted
		.filter((entry) => entry.data.type === "withdraw")
		.map((entry) => entry.data);
}

function makeCtx(sessionId: string): ExtensionContext {
	return fakeContext(sessionId) as unknown as ExtensionContext;
}
describe("Magic Context status observability producer (core)", () => {
	function makeProducer(
		bus: Bus,
		build: (ctx: ExtensionContext, sessionId: string) => unknown,
	) {
		return createMagicContextStatusProducer({
			events: bus.events,
			buildStatusView: build as never,
			debounceMs: DEBOUNCE,
			onWarn: () => undefined,
		});
	}

	const view = (marker: string) => ({
		title: "⚡ Magic Context Status",
		version: "vtest",
		marker,
		sections: [],
		warnings: [],
		footer: "Esc to close",
	});

	it("publishes a debounced snapshot envelope from the builder", async () => {
		const bus = makeBus();
		const producer = makeProducer(bus, (_ctx, sessionId) => ({
			...view(`view-${sessionId}`),
			sessionId,
		}));
		try {
			producer.noteLifecycle("ses-a", makeCtx("ses-a"), "session_start");
			// Debounced: nothing is published synchronously (REQ-MC1-005).
			expect(producer.pendingRebuilds()).toBe(1);
			expect(snapshotEvents(bus)).toHaveLength(0);
			await sleep(AFTER);
			expect(snapshotEvents(bus)).toHaveLength(1);
			const snapshot = snapshotEvents(bus)[0] as McStatusSnapshotEvent;
			expect(snapshot.protocolVersion).toBe(1);
			expect(snapshot.type).toBe("snapshot");
			expect(snapshot.producerInstanceId).toBe(producer.producerInstanceId);
			expect(snapshot.producerInstanceId.startsWith("mc-")).toBe(true);
			expect(snapshot.sessionId).toBe("ses-a");
			expect(snapshot.revision).toBe(1);
			expect(snapshot.payload.statusView).toEqual({
				...view("view-ses-a"),
				sessionId: "ses-a",
			});
			// Additive rich seam is absent in V1 (REQ-MC1-003).
			expect("sidebarView" in snapshot.payload).toBe(false);
			expect(producer.pendingRebuilds()).toBe(0);
		} finally {
			producer.dispose({ withdraw: false });
		}
	});

	it("coalesces a burst of invalidations into ONE rebuild (REQ-MC1-004/005/006)", async () => {
		const bus = makeBus();
		let builds = 0;
		const producer = makeProducer(bus, (_ctx, sessionId) => {
			builds += 1;
			return { ...view("x"), sessionId, n: builds };
		});
		try {
			for (let index = 0; index < 5; index += 1) {
				producer.noteLifecycle("ses-a", makeCtx("ses-a"), "agent_end");
			}
			await sleep(AFTER);
			expect(builds).toBe(1);
			expect(snapshotEvents(bus)).toHaveLength(1);
		} finally {
			producer.dispose({ withdraw: false });
		}
	});

	it("equality gate: an equal view does not mint a revision (REQ-MC1-007)", async () => {
		const bus = makeBus();
		let marker = "same";
		const producer = makeProducer(bus, (_ctx, _sessionId) => view(marker));
		try {
			producer.noteLifecycle("ses-a", makeCtx("ses-a"), "session_start");
			await sleep(AFTER);
			expect(snapshotEvents(bus)).toHaveLength(1);
			expect(producer.currentRevision()).toBe(1);

			// Rebuild runs, but the identical view emits nothing.
			producer.noteLifecycle("ses-a", makeCtx("ses-a"), "agent_end");
			await sleep(AFTER);
			expect(producer.rebuildCount()).toBe(2);
			expect(snapshotEvents(bus)).toHaveLength(1);
			expect(producer.currentRevision()).toBe(1);

			marker = "changed";
			producer.noteLifecycle("ses-a", makeCtx("ses-a"), "agent_end");
			await sleep(AFTER);
			expect(snapshotEvents(bus)).toHaveLength(2);
			expect(producer.currentRevision()).toBe(2);
		} finally {
			producer.dispose({ withdraw: false });
		}
	});
});
describe("Magic Context status observability producer (rich sidebarView)", () => {
	function makeSidebarProducer(
		bus: Bus,
		buildStatusView: (ctx: ExtensionContext, sessionId: string) => unknown,
		buildSidebarView?: (ctx: ExtensionContext, sessionId: string) => unknown,
	) {
		return createMagicContextStatusProducer({
			events: bus.events,
			buildStatusView: buildStatusView as never,
			...(buildSidebarView
				? { buildSidebarView: buildSidebarView as never }
				: {}),
			debounceMs: DEBOUNCE,
			onWarn: () => undefined,
		});
	}

	const status = (sessionId: string) => ({
		title: "Status",
		version: "vtest",
		sessionId,
		sections: [],
		warnings: [],
		footer: "Esc to close",
	});

	it("carries sidebarView alongside statusView when a builder is supplied", async () => {
		const bus = makeBus();
		const producer = makeSidebarProducer(
			bus,
			(_ctx, sessionId) => status(sessionId),
			(_ctx, sessionId) => ({
				header: { glyph: "M", label: "MagicContext", version: "vtest" },
				warnings: [],
				sessionId,
			}),
		);
		try {
			producer.noteLifecycle("ses-rich", makeCtx("ses-rich"), "session_start");
			await sleep(AFTER);
			const snapshot = snapshotEvents(bus)[0] as McStatusSnapshotEvent;
			expect(snapshot.payload.statusView).toEqual(status("ses-rich"));
			expect(snapshot.payload.sidebarView).toMatchObject({
				sessionId: "ses-rich",
			});
		} finally {
			producer.dispose({ withdraw: false });
		}
	});

	it("omits the key entirely for a V1-only producer (additive, not breaking)", async () => {
		const bus = makeBus();
		const producer = makeSidebarProducer(bus, (_ctx, sessionId) =>
			status(sessionId),
		);
		try {
			producer.noteLifecycle("ses-v1", makeCtx("ses-v1"), "session_start");
			await sleep(AFTER);
			const snapshot = snapshotEvents(bus)[0] as McStatusSnapshotEvent;
			// Omitted, not `undefined`: a V1 consumer sees the exact payload shape
			// it saw before rich parity existed.
			expect("sidebarView" in snapshot.payload).toBe(false);
			expect(Object.keys(snapshot.payload)).toEqual(["statusView"]);
		} finally {
			producer.dispose({ withdraw: false });
		}
	});

	it("a sidebar-only change still mints a revision and emits", async () => {
		const bus = makeBus();
		let tick = 0;
		const producer = makeSidebarProducer(
			bus,
			(_ctx, sessionId) => status(sessionId),
			// Status is constant; only the sidebar moves, as a live recomp tick does.
			() => ({
				header: { glyph: "M", label: "MagicContext", version: "vtest" },
				tick,
			}),
		);
		try {
			producer.noteLifecycle("ses-tick", makeCtx("ses-tick"), "session_start");
			await sleep(AFTER);
			expect(snapshotEvents(bus)).toHaveLength(1);
			tick = 1;
			producer.invalidate("ses-tick", "recomp-progress");
			await sleep(AFTER);
			const events = snapshotEvents(bus);
			expect(events).toHaveLength(2);
			expect(events[1]?.revision).toBe(2);
			expect(events[1]?.payload.sidebarView).toMatchObject({ tick: 1 });
		} finally {
			producer.dispose({ withdraw: false });
		}
	});

	it("an unchanged sidebar does not re-emit (equality gate spans both views)", async () => {
		const bus = makeBus();
		const producer = makeSidebarProducer(
			bus,
			(_ctx, sessionId) => status(sessionId),
			() => ({
				header: { glyph: "M", label: "MagicContext", version: "vtest" },
			}),
		);
		try {
			producer.noteLifecycle("ses-eq", makeCtx("ses-eq"), "session_start");
			await sleep(AFTER);
			producer.invalidate("ses-eq", "noise");
			await sleep(AFTER);
			expect(snapshotEvents(bus)).toHaveLength(1);
			expect(producer.currentRevision()).toBe(1);
		} finally {
			producer.dispose({ withdraw: false });
		}
	});
});

describe("Magic Context status observability producer (discovery)", () => {
	function makeProducer(
		bus: Bus,
		build: (ctx: ExtensionContext, sessionId: string) => unknown,
	) {
		return createMagicContextStatusProducer({
			events: bus.events,
			buildStatusView: build as never,
			debounceMs: DEBOUNCE,
			onWarn: () => undefined,
		});
	}

	const view = (marker: string) => ({
		title: "⚡ Magic Context Status",
		version: "vtest",
		marker,
		sections: [],
		warnings: [],
		footer: "Esc to close",
	});

	it("replays the cache with requestId; duplicate discovers never rebuild", async () => {
		const bus = makeBus();
		let builds = 0;
		const producer = makeProducer(bus, () => {
			builds += 1;
			return view(`v${builds}`);
		});
		try {
			producer.noteLifecycle("ses-a", makeCtx("ses-a"), "session_start");
			await sleep(AFTER);
			expect(builds).toBe(1);
			expect(snapshotEvents(bus)).toHaveLength(1);

			bus.emitRaw(MAGIC_CONTEXT_STATUS_CHANNEL, {
				protocolVersion: 1,
				type: "discover",
				requestId: "b-1",
			});
			bus.emitRaw(MAGIC_CONTEXT_STATUS_CHANNEL, {
				protocolVersion: 1,
				type: "discover",
				requestId: "b-2",
			});
			expect(snapshotEvents(bus)).toHaveLength(3);
			expect(snapshotEvents(bus)[1]?.requestId).toBe("b-1");
			expect(snapshotEvents(bus)[2]?.requestId).toBe("b-2");
			expect(builds).toBe(1); // replay only (REQ-MC1-008)
		} finally {
			producer.dispose({ withdraw: false });
		}
	});

	it("discovery with no cache schedules exactly one build; none without context", async () => {
		const bus = makeBus();
		let builds = 0;
		const producer = makeProducer(bus, () => {
			builds += 1;
			return view(`v${builds}`);
		});
		try {
			// No session context at all: discovery is inert.
			bus.emitRaw(MAGIC_CONTEXT_STATUS_CHANNEL, {
				protocolVersion: 1,
				type: "discover",
				requestId: "b-0",
			});
			await sleep(AFTER);
			expect(builds).toBe(0);
			expect(snapshotEvents(bus)).toHaveLength(0);

			producer.noteLifecycle("ses-b", makeCtx("ses-b"), "session_start");
			bus.emitRaw(MAGIC_CONTEXT_STATUS_CHANNEL, {
				protocolVersion: 1,
				type: "discover",
				requestId: "b-1",
			});
			bus.emitRaw(MAGIC_CONTEXT_STATUS_CHANNEL, {
				protocolVersion: 1,
				type: "discover",
				requestId: "b-2",
			});
			await sleep(AFTER);
			expect(builds).toBe(1); // duplicate discoveries coalesce
			expect(snapshotEvents(bus)).toHaveLength(1);
			expect(snapshotEvents(bus)[0]?.requestId).toBe("b-1");
		} finally {
			producer.dispose({ withdraw: false });
		}
	});
});
describe("Magic Context status observability producer (session scope)", () => {
	function makeProducer(
		bus: Bus,
		build: (ctx: ExtensionContext, sessionId: string) => unknown,
	) {
		return createMagicContextStatusProducer({
			events: bus.events,
			buildStatusView: build as never,
			debounceMs: DEBOUNCE,
			onWarn: () => undefined,
		});
	}

	const view = (marker: string) => ({
		title: "⚡ Magic Context Status",
		version: "vtest",
		marker,
		sections: [],
		warnings: [],
		footer: "Esc to close",
	});

	it("keeps per-session caches isolated; release rejects late retired-session work (REQ-MC1-009)", async () => {
		const bus = makeBus();
		const producer = makeProducer(bus, (_ctx, sessionId) => ({
			...view(`view-${sessionId}`),
			sessionId,
		}));
		try {
			producer.noteLifecycle("ses-a", makeCtx("ses-a"), "session_start");
			producer.noteLifecycle("ses-b", makeCtx("ses-b"), "session_start");
			await sleep(AFTER);
			expect(snapshotEvents(bus)).toHaveLength(2);
			expect(snapshotEvents(bus)[0]?.sessionId).toBe("ses-a");
			expect(snapshotEvents(bus)[1]?.sessionId).toBe("ses-b");
			expect(producer.publishedStatus("ses-a")?.revision).toBe(1);
			expect(producer.publishedStatus("ses-b")?.revision).toBe(2);

			producer.releaseSession("ses-a");
			expect(withdrawEvents(bus)).toHaveLength(1);
			expect(withdrawEvents(bus)[0]?.sessionId).toBe("ses-a");
			expect(producer.publishedStatus("ses-a")).toBeNull();
			expect(producer.publishedStatus("ses-b")).not.toBeNull();
			expect(producer.hasContext("ses-a")).toBe(false);
			expect(producer.hasContext("ses-b")).toBe(true);

			// Delayed session-A work after release cannot publish or overwrite B.
			producer.invalidate("ses-a", "late-mutation");
			await sleep(AFTER);
			const after = snapshotEvents(bus);
			expect(after.filter((event) => event.sessionId === "ses-a")).toHaveLength(
				1,
			);
			expect(after.at(-1)?.sessionId).toBe("ses-b");
			expect(producer.rebuildCount()).toBe(2);
		} finally {
			producer.dispose({ withdraw: false });
		}
	});

	it("release before the debounce fires cancels that session's pending build", async () => {
		const bus = makeBus();
		let builds = 0;
		const producer = makeProducer(bus, () => {
			builds += 1;
			return view(`v${builds}`);
		});
		try {
			producer.noteLifecycle("ses-a", makeCtx("ses-a"), "session_start");
			producer.releaseSession("ses-a");
			await sleep(AFTER);
			expect(builds).toBe(0);
			expect(snapshotEvents(bus)).toHaveLength(0);

			producer.noteLifecycle("ses-b", makeCtx("ses-b"), "session_start");
			await sleep(AFTER);
			expect(builds).toBe(1);
			expect(snapshotEvents(bus)).toHaveLength(1);
			expect(snapshotEvents(bus)[0]?.sessionId).toBe("ses-b");
		} finally {
			producer.dispose({ withdraw: false });
		}
	});

	it("idle system: no rebuild, no permanent timer, no interval (REQ-MC1-005/008)", async () => {
		const bus = makeBus();
		const producer = makeProducer(bus, () => view("stable"));
		try {
			producer.noteLifecycle("ses-a", makeCtx("ses-a"), "session_start");
			await sleep(AFTER);
			expect(producer.rebuildCount()).toBe(1);
			expect(producer.pendingRebuilds()).toBe(0);
			await sleep(AFTER * 4);
			expect(producer.rebuildCount()).toBe(1);
			expect(snapshotEvents(bus)).toHaveLength(1);
		} finally {
			producer.dispose({ withdraw: false });
		}
		const source = readFileSync(
			new URL("./status-observability.ts", import.meta.url),
			"utf8",
		);
		expect(source).not.toMatch(/\bsetInterval\s*\(/);
	});

	it("a failing build warns, publishes nothing, and recovers next time", async () => {
		const bus = makeBus();
		const warnings: string[] = [];
		let fail = true;
		const producer = createMagicContextStatusProducer({
			events: bus.events,
			buildStatusView: () => {
				if (fail) throw new Error("db busy");
				return view("recovered");
			},
			debounceMs: DEBOUNCE,
			onWarn: (message) => warnings.push(message),
		});
		try {
			producer.noteLifecycle("ses-a", makeCtx("ses-a"), "session_start");
			await sleep(AFTER);
			expect(warnings.join(" ")).toContain("db busy");
			expect(snapshotEvents(bus)).toHaveLength(0);

			fail = false;
			producer.noteLifecycle("ses-a", makeCtx("ses-a"), "agent_end");
			await sleep(AFTER);
			expect(snapshotEvents(bus)).toHaveLength(1);
		} finally {
			producer.dispose({ withdraw: false });
		}
	});

	it("dispose withdraws, clears state and ignores late discoveries", async () => {
		const bus = makeBus();
		const producer = makeProducer(bus, () => view("x"));
		producer.noteLifecycle("ses-a", makeCtx("ses-a"), "session_start");
		await sleep(AFTER);
		expect(snapshotEvents(bus)).toHaveLength(1);

		producer.dispose();
		expect(withdrawEvents(bus)).toHaveLength(1);
		expect(withdrawEvents(bus)[0]?.sessionId).toBe("ses-a");
		expect(producer.publishedStatus()).toBeNull();

		bus.emitRaw(MAGIC_CONTEXT_STATUS_CHANNEL, {
			protocolVersion: 1,
			type: "discover",
			requestId: "late",
		});
		expect(snapshotEvents(bus)).toHaveLength(1);
	});

	it("the coalescing window defaults to the required 100–200 ms (REQ-MC1-005)", () => {
		expect(DEFAULT_STATUS_DEBOUNCE_MS).toBeGreaterThanOrEqual(100);
		expect(DEFAULT_STATUS_DEBOUNCE_MS).toBeLessThanOrEqual(200);
	});

	it("guards discovery envelopes structurally (PRD §5.4)", () => {
		expect(
			isMcStatusDiscoverEvent({
				protocolVersion: 1,
				type: "discover",
				requestId: "bridge-1",
			}),
		).toBe(true);
		expect(
			isMcStatusDiscoverEvent({
				protocolVersion: 2,
				type: "discover",
				requestId: "bridge-1",
			}),
		).toBe(false);
		expect(
			isMcStatusDiscoverEvent({ protocolVersion: 1, type: "discover" }),
		).toBe(false);
		expect(
			isMcStatusDiscoverEvent({
				protocolVersion: 1,
				type: "discover",
				requestId: "",
			}),
		).toBe(false);
		expect(
			isMcStatusDiscoverEvent({
				protocolVersion: 1,
				type: "discover",
				requestId: "bad\u0007id",
			}),
		).toBe(false);
	});
});
type Handlers = Record<
	string,
	Array<(event?: unknown, ctx?: unknown) => unknown>
>;

function makeMockPi(bus: Bus): { api: ExtensionAPI; handlers: Handlers } {
	const handlers: Handlers = {};
	const api = {
		events: bus.events,
		on(event: string, handler: (event?: unknown, ctx?: unknown) => unknown) {
			const list = handlers[event] ?? [];
			list.push(handler);
			handlers[event] = list;
		},
	} as unknown as ExtensionAPI;
	return { api, handlers };
}

function fire(
	handlers: Handlers,
	event: string,
	payload: unknown,
	ctx: unknown,
): void {
	for (const handler of handlers[event] ?? []) void handler(payload, ctx);
}

describe("Magic Context status observability registration", () => {
	it("published statusView deep-equals the authoritative /ctx-status build (oracle)", async () => {
		const bus = makeBus();
		const { api } = makeMockPi(bus);
		const db = createTestDb();
		const sessionId = "ses-oracle";
		try {
			const deps = {
				db,
				projectIdentity: resolveProjectIdentity(process.cwd()),
			};
			const producer = registerMagicContextStatusObservability(api, {
				resolveStatusDeps: () => deps,
				debounceMs: DEBOUNCE,
				onWarn: () => undefined,
			});
			try {
				const ctx = {
					...makeCtx(sessionId),
					getContextUsage: () => ({
						tokens: 40_000,
						percent: 20,
						contextWindow: 200_000,
					}),
					getSystemPrompt: () => "system prompt",
				} as unknown as ExtensionContext;
				producer.noteLifecycle(sessionId, ctx, "session_start");
				await sleep(AFTER);
				expect(snapshotEvents(bus)).toHaveLength(1);

				const direct = buildStatusView(
					statusViewSourceFromPiDetail(
						buildPiStatusDetail(api, ctx, deps, sessionId),
					),
					{ version: packageJson.version },
				);
				const published = snapshotEvents(bus)[0]?.payload.statusView;
				expect(published).toEqual(direct);
			} finally {
				producer.dispose({ withdraw: false });
			}
		} finally {
			closeQuietly(db);
		}
	});

	it("registers the required lifecycle handlers and filters message_end to assistant (REQ-MC1-004)", async () => {
		const bus = makeBus();
		const { api, handlers } = makeMockPi(bus);
		const db = createTestDb();
		try {
			const producer = registerMagicContextStatusObservability(api, {
				resolveStatusDeps: () => ({
					db,
					projectIdentity: resolveProjectIdentity(process.cwd()),
				}),
				debounceMs: DEBOUNCE,
				onWarn: () => undefined,
			});
			try {
				for (const event of [
					"session_start",
					"agent_end",
					"session_compact",
					"message_end",
					"session_shutdown",
				]) {
					expect((handlers[event] ?? []).length).toBeGreaterThanOrEqual(1);
				}

				const ctx = makeCtx("ses-roles");
				fire(handlers, "session_start", undefined, ctx);
				await sleep(AFTER);
				expect(producer.rebuildCount()).toBe(1);

				fire(handlers, "message_end", { message: { role: "tool" } }, ctx);
				fire(handlers, "message_end", { message: { role: "user" } }, ctx);
				await sleep(AFTER);
				expect(producer.rebuildCount()).toBe(1);

				fire(
					handlers,
					"message_end",
					{ message: { role: "assistant", content: [] } },
					ctx,
				);
				await sleep(AFTER);
				expect(producer.rebuildCount()).toBe(2);
			} finally {
				producer.dispose({ withdraw: false });
			}
		} finally {
			closeQuietly(db);
		}
	});
	it("published sidebarView header label follows the shared TUI preference file (default = OpenCode parity)", async () => {
		const bus = makeBus();
		const { api, handlers } = makeMockPi(bus);
		const db = createTestDb();
		const previousPrefsFile = process.env.OPENCODE_TUI_PREFERENCES_FILE;
		const dir = mkdtempSync(join(tmpdir(), "mc-header-label-"));
		try {
			// Point at a nonexistent file first: the tolerant reader resolves the
			// shared default, exactly like an untouched install.
			process.env.OPENCODE_TUI_PREFERENCES_FILE = join(dir, "absent.jsonc");
			const producer = registerMagicContextStatusObservability(api, {
				resolveStatusDeps: () => ({
					db,
					projectIdentity: resolveProjectIdentity(process.cwd()),
				}),
				debounceMs: DEBOUNCE,
				onWarn: () => undefined,
			});
			try {
				fire(
					handlers,
					"session_start",
					undefined,
					makeCtx("ses-label-default"),
				);
				await sleep(AFTER);
				expect(snapshotEvents(bus)).toHaveLength(1);
				expect(snapshotEvents(bus)[0]?.payload.sidebarView?.header.label).toBe(
					"Magic Context",
				);

				// A customized preference is observed by the NEXT rebuild — no
				// producer restart, no watcher: the label is read per build.
				writeFileSync(
					join(dir, "custom.jsonc"),
					`${JSON.stringify({ "magic-context": { header: { label: "Ctx Panel" } } })}
`,
					"utf8",
				);
				process.env.OPENCODE_TUI_PREFERENCES_FILE = join(dir, "custom.jsonc");
				fire(handlers, "session_start", undefined, makeCtx("ses-label-custom"));
				await sleep(AFTER);
				expect(snapshotEvents(bus)).toHaveLength(2);
				expect(snapshotEvents(bus)[1]?.payload.sidebarView?.header.label).toBe(
					"Ctx Panel",
				);
			} finally {
				producer.dispose({ withdraw: false });
			}
		} finally {
			if (previousPrefsFile === undefined) {
				delete process.env.OPENCODE_TUI_PREFERENCES_FILE;
			} else {
				process.env.OPENCODE_TUI_PREFERENCES_FILE = previousPrefsFile;
			}
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
describe("Magic Context status observability seams", () => {
	it("historian/recomp mutation seams invalidate through the shared registry", async () => {
		const bus = makeBus();
		const { api, handlers } = makeMockPi(bus);
		const db = createTestDb();
		try {
			const producer = registerMagicContextStatusObservability(api, {
				resolveStatusDeps: () => ({
					db,
					projectIdentity: resolveProjectIdentity(process.cwd()),
				}),
				debounceMs: DEBOUNCE,
				onWarn: () => undefined,
			});
			try {
				const ctx = makeCtx("ses-seams");
				fire(handlers, "session_start", undefined, ctx);
				await sleep(AFTER);
				expect(producer.rebuildCount()).toBe(1);

				notifyMagicContextStatusMutation("ses-seams", "historian");
				await sleep(AFTER);
				expect(producer.rebuildCount()).toBe(2);

				// Recomp start AND end both flow through status-line's seam and
				// coalesce into a single rebuild inside one window (REQ-MC1-006).
				setMagicContextRecompActive("ses-seams", true);
				setMagicContextRecompActive("ses-seams", false);
				await sleep(AFTER);
				expect(producer.rebuildCount()).toBe(3);

				// A mutation for a session we never captured context for builds nothing.
				notifyMagicContextStatusMutation("ses-unknown", "historian");
				await sleep(AFTER);
				expect(producer.rebuildCount()).toBe(3);
			} finally {
				producer.dispose({ withdraw: false });
				setMagicContextRecompActive("ses-seams", false);
			}
		} finally {
			closeQuietly(db);
		}
	});

	it("session_shutdown withdraws only that session; a later session still works (REQ-MC1-009)", async () => {
		const bus = makeBus();
		const { api, handlers } = makeMockPi(bus);
		const db = createTestDb();
		try {
			const producer = registerMagicContextStatusObservability(api, {
				resolveStatusDeps: () => ({
					db,
					projectIdentity: resolveProjectIdentity(process.cwd()),
				}),
				debounceMs: DEBOUNCE,
				onWarn: () => undefined,
			});
			try {
				const ctx = makeCtx("ses-gone");
				fire(handlers, "session_start", undefined, ctx);
				await sleep(AFTER);
				expect(snapshotEvents(bus)).toHaveLength(1);

				fire(handlers, "session_shutdown", undefined, ctx);
				expect(withdrawEvents(bus)).toHaveLength(1);
				expect(withdrawEvents(bus)[0]?.sessionId).toBe("ses-gone");
				expect(producer.publishedStatus("ses-gone")).toBeNull();
				expect(producer.hasContext("ses-gone")).toBe(false);

				// /resume semantics: shutdown → new session keeps publishing.
				fire(handlers, "session_start", undefined, makeCtx("ses-next"));
				await sleep(AFTER);
				expect(snapshotEvents(bus)).toHaveLength(2);
				expect(snapshotEvents(bus)[1]?.sessionId).toBe("ses-next");
			} finally {
				producer.dispose({ withdraw: false });
			}
		} finally {
			closeQuietly(db);
		}
	});

	it("negative controls: registration and authoritative linkage exist in production source", () => {
		const entry = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
		expect(entry).toMatch(/registerMagicContextStatusObservability\(/);
		// The SAME resolver /ctx-status uses (REQ-MC1-001)…
		expect(entry).toMatch(/resolveStatusDeps: resolveCtxStatusDeps/);
		// …the historian seam feeds the shared mutation registry (REQ-MC1-004)…
		expect(entry).toMatch(/notifyMagicContextStatusMutation\(/);
		// …and the preserved surfaces are still registered (REQ-MC1-010/011).
		expect(entry).toMatch(/registerStatusLine\(/);
		expect(entry).toMatch(/registerCtxStatusCommand\(/);

		const source = readFileSync(
			new URL("./status-observability.ts", import.meta.url),
			"utf8",
		);
		// The payload must come from the authoritative path — removing any
		// stage of the pipeline fails this control.
		expect(source).toMatch(/buildPiStatusDetail\(/);
		expect(source).toMatch(/statusViewSourceFromPiDetail\(/);
		expect(source).toMatch(/buildSharedStatusView\(/);
		expect(source).not.toMatch(/\bsetInterval\s*\(/);
	});
});
