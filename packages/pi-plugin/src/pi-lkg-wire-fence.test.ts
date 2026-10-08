import { expect, test } from "bun:test";
import { resetLkgSlotsForTest } from "@magic-context/core/hooks/magic-context/lkg-slot";
import { createPiLkgCoordinator } from "./pi-lkg";
import { createTestDb } from "./test-utils.test";

const piConverter = await import(
	new URL(
		"./api/google-shared.js",
		import.meta.resolve("@earendil-works/pi-ai"),
	).href
);
const ompConverter = process.env.MC640_HOST
	? await import(
			`${process.env.MC640_HOST}/node_modules/@oh-my-pi/pi-ai/src/providers/anthropic.ts`
		)
	: undefined;

const model = {
	id: "fixture",
	provider: "anthropic",
	api: "anthropic-messages",
	input: ["text", "image"],
	reasoning: true,
	contextWindow: 1000000,
	maxTokens: 8192,
	compat: { officialEndpoint: true },
};
const messages = [
	{
		role: "user",
		content: [
			{ type: "text", text: "question" },
			{ type: "image", data: "YWJj", mimeType: "image/png" },
		],
		timestamp: 1,
	},
	{
		role: "assistant",
		content: [
			{ type: "text", text: "answer" },
			{ type: "thinking", thinking: "reason", thinkingSignature: "signature" },
			{
				type: "toolCall",
				id: "call1",
				name: "read",
				arguments: {
					path: "fixture",
					completedAt: 42,
					contextSnapshot: "argument",
				},
			},
		],
		api: "anthropic-messages",
		provider: "anthropic",
		model: "fixture",
		stopReason: "toolUse",
		timestamp: 2,
	},
	{
		role: "toolResult",
		toolCallId: "call1",
		toolName: "read",
		content: [
			{ type: "text", text: "result" },
			{ type: "image", data: "ZGVm", mimeType: "image/png" },
		],
		isError: false,
		timestamp: 3,
	},
];

function leafPaths(value: unknown, path: string[] = []): string[][] {
	if (!value || typeof value !== "object") return [path];
	return Object.entries(value).flatMap(([key, child]) =>
		leafPaths(child, [...path, key]),
	);
}

function replay(input: unknown[]) {
	resetLkgSlotsForTest();
	const db = createTestDb();
	try {
		const coordinator = createPiLkgCoordinator(db, (capture) => capture());
		const begin = (messages: unknown[]) =>
			coordinator.beginPass({
				sessionId: "wire",
				messages,
				entryIds: ["u", "a", "t"],
				modelKey: "anthropic/fixture",
				providerKey: "anthropic",
			});
		coordinator.captureAppliedPass({
			snapshot: begin(messages),
			outputMessages: messages,
			outputEntryIds: ["u", "a", "t"],
			cacheBusting: false,
		});
		return coordinator.replay(begin(input));
	} finally {
		db.close();
		resetLkgSlotsForTest();
	}
}

test("Pi LKG ignores only root completedAt and contextSnapshot bookkeeping", () => {
	for (const field of ["completedAt", "contextSnapshot"]) {
		const changed = structuredClone(messages);
		Object.assign(changed[1] as object, {
			[field]:
				field === "completedAt"
					? 100
					: { promptTokens: 1000, compactionEpoch: 0 },
		});
		expect(replay(changed).ok).toBe(true);
		if (ompConverter)
			expect(
				JSON.stringify(
					ompConverter.convertAnthropicMessages(changed, model, false),
				),
			).toBe(
				JSON.stringify(
					ompConverter.convertAnthropicMessages(messages, model, false),
				),
			);
		expect(
			JSON.stringify(
				piConverter.convertMessages(
					{ ...model, api: "google-generative-ai", provider: "google" },
					{ messages: changed },
				),
			),
		).toBe(
			JSON.stringify(
				piConverter.convertMessages(
					{ ...model, api: "google-generative-ai", provider: "google" },
					{ messages },
				),
			),
		);
	}
});

test("Pi LKG rejects every real-converter-visible leaf mutation including nested bookkeeping names", () => {
	const converters = [
		(input: unknown[]) =>
			piConverter.convertMessages(
				{ ...model, api: "google-generative-ai", provider: "google" },
				{ messages: input },
			),
	];
	if (ompConverter)
		converters.push((input) =>
			ompConverter.convertAnthropicMessages(input, model, false),
		);
	let checked = 0;
	for (const path of leafPaths(messages)) {
		const changed = structuredClone(messages) as unknown as Record<
			string,
			unknown
		>;
		let parent = changed;
		for (const key of path.slice(0, -1))
			parent = parent[key] as Record<string, unknown>;
		const key = path.at(-1);
		if (!key) throw new Error("Missing leaf key");
		const old = parent[key];
		parent[key] =
			typeof old === "boolean"
				? !old
				: typeof old === "number"
					? old + 1
					: `${old}x`;
		if (
			!converters.some(
				(convert) =>
					JSON.stringify(convert(changed as unknown as unknown[])) !==
					JSON.stringify(convert(messages)),
			)
		)
			continue;
		const result = replay(changed as unknown as unknown[]);
		expect(result.ok, path.join(".")).toBe(false);
		if (!result.ok) expect(result.reason).toBe("lkg_content_mismatch");
		checked++;
	}
	expect(checked).toBeGreaterThan(15);
});
