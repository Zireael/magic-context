import { expect, it } from "bun:test";
import {
	outgoingContextRefusal,
	PROTECTED_TOOL_RESULTS_OVER_LIMIT,
} from "@magic-context/core/hooks/magic-context/emergency-fail-closed";
import {
	assertPiRawFallbackFits,
	estimatePiOutgoingInputTokens,
} from "./pi-raw-fallback";

it("Pi refuses incomplete fallback even when the byte proxy fits", () => {
	expect(() =>
		assertPiRawFallbackFits(
			[{ role: "user", content: "hello" }],
			20000,
			() => {},
			null,
		),
	).toThrow();
});
it("Pi admits a complete calibrated fallback and refuses the locally fitting over-wall request", () => {
	const messages = [{ role: "user", content: "hello" }];
	const observed = {
		modelKey: "anthropic/claude-fable-5-1",
		systemTokens: 10000,
		toolDefinitionTokens: 0,
	};
	expect(() =>
		assertPiRawFallbackFits(messages, 20000, () => {}, null, observed),
	).not.toThrow();
	expect(() =>
		assertPiRawFallbackFits(messages, 12000, () => {}, null, observed),
	).toThrow();
});
it("Pi refuses a complete protected over-limit final envelope but not untrusted counts", () => {
	const messages = [
		{
			role: "toolResult",
			toolCallId: "large",
			toolName: "probe",
			content: [{ type: "text", text: "word ".repeat(96000) }],
		},
	];
	const observed = {
		modelKey: "anthropic/claude-fable-5-1",
		systemTokens: 100,
		toolDefinitionTokens: 0,
	};
	const estimate = estimatePiOutgoingInputTokens(messages, observed);
	expect(estimate.trusted).toBe(true);
	expect(outgoingContextRefusal(estimate, 16000, 96000)).toBe(
		PROTECTED_TOOL_RESULTS_OVER_LIMIT,
	);
	expect(
		outgoingContextRefusal(
			estimatePiOutgoingInputTokens(messages),
			16000,
			96000,
		),
	).toBeUndefined();
	expect(
		outgoingContextRefusal(
			estimatePiOutgoingInputTokens([{ role: "unknown" }], observed),
			16000,
			96000,
		),
	).toBeUndefined();
});
