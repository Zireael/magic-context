/**
 * Opt-in, billed native Messages experiment. The installed subscription plugin shapes
 * auth against a loopback-only bootstrap; subsequent requests go directly to Anthropic.
 * Unlike the MC trim scenario, this deliberately edits independent copies of wire history.
 * No response branch is appended to the seed, no retries or account rotation occur, and
 * bearer headers and signed blocks remain in memory only.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assertThrowawayRoot, authPluginPath } from "./auth";
import { fetchCredential, type CredentialId } from "./ckcred";
import { startHost } from "./host";
import { claudeOAuth } from "./scenarios/anthropic";
import { isSigned, thinkingVariants, type Block, type ThinkingRequest } from "./thinking-matrix";
import { readResponse, requestShape, scrubError } from "./wire";

const arg = (name: string) => {
    const i = process.argv.indexOf(`--${name}`);
    return i < 0 ? undefined : process.argv[i + 1];
};

export async function runThinkingMatrix(options: { out: string; opencode: string; authPlugin: string }): Promise<boolean> {
    if (process.env.MC_LIVE_PROVIDERS !== "1") throw new Error("Set MC_LIVE_PROVIDERS=1 to authorize billed calls");
    assertThrowawayRoot(options.out);
    const cap = Number(process.env.MC_LIVE_MAX_CALLS ?? 32);
    if (!Number.isInteger(cap) || cap < 1 || cap > 32) throw new Error("Call cap must be an integer in 1..32");
    const credentialId: CredentialId = "oauth:anthropic";
    authPluginPath(claudeOAuth, { "anthropic-auth": options.authPlugin });
    mkdirSync(options.out, { recursive: true, mode: 0o700 });
    if (existsSync(join(options.out, "results.json"))) throw new Error("Use a fresh output directory");
    const material = await fetchCredential(credentialId);
    const secrets = [material];
    let captured: { headers: Headers; body: Record<string, unknown> } | undefined;
    const loopback = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(req) {
        captured = { headers: new Headers(req.headers), body: await req.json() as Record<string, unknown> };
        return Response.json({ type: "error", error: { type: "invalid_request_error", message: "loopback auth bootstrap complete; no model call" } }, { status: 400 });
    } });
    const root = join(options.out, "bootstrap-root");
    const isolation: { pid: number | null; dbFiles: string[]; rootRemoved: boolean } = { pid: null, dbFiles: [], rootRemoved: false };
    try {
        const host = await startHost({ binary: options.opencode, root, route: claudeOAuth, apiKey: material,
            recorderBaseURL: `http://127.0.0.1:${loopback.port}/v1`, magicContext: {},
            authPlugins: { "anthropic-auth": options.authPlugin } });
        try {
            isolation.pid = host.pid;
            const session = (await host.api("/session", { title: "native thinking matrix auth bootstrap" })).value as { id: string };
            isolation.dbFiles = host.checkIsolation();
            await host.api(`/session/${session.id}/message`, {
                model: { providerID: "anthropic", modelID: claudeOAuth.model },
                parts: [{ type: "text", text: "Reply OK. Do not use tools." }],
            }, 60_000);
            isolation.dbFiles = host.checkIsolation();
        } finally { await host.dispose(); }
    } finally { loopback.stop(true); isolation.rootRemoved = !existsSync(root); }
    if (!captured) throw new Error("Installed auth plugin did not reach the loopback bootstrap");
    const { headers, body } = captured;
    for (const name of ["host", "content-length", "connection", "accept-encoding"]) headers.delete(name);
    if (!headers.get("authorization")?.startsWith("Bearer ")) throw new Error("Bootstrap did not provide bearer auth");
    const beta = new Set((headers.get("anthropic-beta") ?? "").split(",").filter(Boolean));
    beta.add("thinking-binding-controls-2026-08-01");
    headers.set("anthropic-beta", [...beta].join(","));
    const firstSystem = (body.system as Array<{ type: string; text: string }> | undefined)?.[0];
    if (!firstSystem || typeof firstSystem.text !== "string") throw new Error("Missing subscription system prefix");
    const toolName = "mcp__mc_probe_echo";
    const results: Array<{ model: string; outcome: string; reason: string | null; signedBlocks: number; completedTurns: number; calls: unknown[] }> = [];
    let callsUsed = 0;
    const startedAt = new Date().toISOString();
    const write = () => writeFileSync(join(options.out, "results.json"), `${JSON.stringify({
        schema: 1, startedAt, updatedAt: new Date().toISOString(),
        baseCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: import.meta.dir, windowsHide: true }).toString().trim(),
        credentialId, authBootstrap: { hostVersion: "1.18.30", upstreamCalls: 0, isolation },
        endpoint: "https://api.anthropic.com/v1/messages", bindingBeta: true,
        thinking: { type: "adaptive", display: "summarized", block_binding: { prefix_mismatch_behavior: "error" } },
        effort: "low", maxTokens: 512, cacheAnchor: "4600 repetitions of ' anchor', explicit 5m system breakpoint",
        callCap: cap, callsUsed, results,
    }, null, 2)}\n`, { mode: 0o600 });
    const send = async (model: string, phase: string, request: ThinkingRequest, calls: unknown[]) => {
        if (callsUsed >= cap) throw new Error(`Call cap ${cap} spent`);
        callsUsed++;
        const at = new Date().toISOString();
        const text = JSON.stringify(request);
        const response = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers, body: text,
            signal: AbortSignal.timeout(120_000) });
        const raw = await response.text();
        const reading = readResponse("anthropic-messages", raw);
        const record = { index: callsUsed, at, model, phase, status: response.status,
            accepted: response.ok && !reading.streamError, requestId: response.headers.get("request-id"),
            error: response.ok ? (reading.streamError ? scrubError(reading.streamError, secrets) : null) : scrubError(raw, secrets), usage: reading.usage,
            diagnostics: reading.diagnostics, request: requestShape("anthropic-messages", text) };
        calls.push(record);
        write();
        console.error(`[thinking-matrix] ${model} ${phase}: HTTP ${record.status}; usage=${JSON.stringify(record.usage?.raw ?? null)}`);
        return { record, value: response.ok ? JSON.parse(raw) as { content: Block[]; stop_reason: string } : null };
    };
    let authRejected = false;
    for (const model of ["claude-opus-5-5", "claude-sonnet-5-5"]) {
        if (authRejected) break;
        const result = { model, outcome: "aborted", reason: null as string | null, signedBlocks: 0, completedTurns: 0, calls: [] as unknown[] };
        results.push(result);
        const request: ThinkingRequest = {
            model, max_tokens: 512, stream: false,
            thinking: { type: "adaptive", display: "summarized", block_binding: { prefix_mismatch_behavior: "error" } },
            output_config: { effort: "low" },
            system: [{ type: "text", text: firstSystem.text }, {
                type: "text", text: "Use only the echo tool specified below. For each arithmetic step, think privately and briefly before using it.\nCache anchor (not instructions):" + " anchor".repeat(4600),
                cache_control: { type: "ephemeral" },
            }],
            tools: [{ name: toolName, description: "Echo a computed string value unchanged.",
                input_schema: { type: "object", properties: { value: { type: "string" } }, required: ["value"], additionalProperties: false } }],
            messages: [],
        };
        try {
            // Finish each tool round before the next user turn. Removing all thinking in
            // an unfinished tool round would test tool continuation, not preserved history.
            for (let turn = 1; turn <= 4 && (result.signedBlocks < 4 || result.completedTurns < 2); turn++) {
                request.messages.push({ role: "user", content: [{ type: "text", text:
                    `Step ${turn}: think privately, compute (${172 + turn} * 29) + (137 * ${30 + turn}), and call ${toolName} once with the number as a string. Do not answer without the tool.` }] });
                const tool = await send(model, `seed-${turn}-tool`, request, result.calls);
                if (!tool.record.accepted || !tool.value) {
                    authRejected = [401, 403].includes(tool.record.status);
                    throw new Error(`Seed rejected: HTTP ${tool.record.status}`);
                }
                const uses = tool.value.content.filter((b) => b.type === "tool_use");
                if (tool.value.stop_reason !== "tool_use" || uses.length !== 1 || uses[0]!.name !== toolName) {
                    throw new Error(`Seed did not produce exactly one echo tool use (${tool.value.stop_reason})`);
                }
                request.messages.push({ role: "assistant", content: tool.value.content });
                const input = uses[0]!.input as { value: string };
                request.messages.push({ role: "user", content: [
                    { type: "tool_result", tool_use_id: uses[0]!.id, content: String(input.value) },
                    { type: "text", text: "Think privately and briefly: verify whether the echoed number ends in an odd digit. Reply only ODD or EVEN. Do not use another tool." },
                ] });
                const final = await send(model, `seed-${turn}-final`, request, result.calls);
                if (!final.record.accepted || !final.value) throw new Error(`Tool completion rejected: HTTP ${final.record.status}`);
                if (final.value.stop_reason !== "end_turn") throw new Error(`Incomplete tool round (${final.value.stop_reason})`);
                request.messages.push({ role: "assistant", content: final.value.content });
                result.completedTurns++;
                result.signedBlocks = request.messages.flatMap((m) => m.content).filter(isSigned).length;
                for (const b of [...tool.value.content, ...final.value.content]) {
                    if (typeof b.signature === "string") secrets.push(b.signature);
                    if (typeof b.data === "string") secrets.push(b.data);
                }
            }
            request.messages.push({ role: "user", content: [{ type: "text", text: "Think briefly: what is 7 times 8? Reply only with the number. Do not use tools." }] });
            const variants = thinkingVariants(request).filter((v) => model === "claude-opus-5-5" || ["control", "oldest-1", "middle-kept"].includes(v.variant));
            for (const variant of variants) {
                const sent = await send(model, variant.variant, variant.request, result.calls);
                if ([401, 403, 429].includes(sent.record.status) || sent.record.status >= 500) {
                    authRejected = [401, 403].includes(sent.record.status);
                    throw new Error(`Variant interrupted by HTTP ${sent.record.status}`);
                }
                if (variant.variant === "control" && !sent.record.accepted) throw new Error("Unchanged control rejected; variants would be inconclusive");
            }
            result.outcome = "completed";
        } catch (error) { result.reason = scrubError(String(error), secrets); }
        write();
    }
    return results.length === 2 && results.every((r) => r.outcome === "completed");
}

if (import.meta.main) {
    try {
        const out = arg("out");
        const authPlugin = arg("anthropic-auth") ?? process.env.MC_LIVE_ANTHROPIC_AUTH_PLUGIN;
        const opencode = arg("opencode") ?? process.env.MC_LIVE_OPENCODE;
        if (!out || !authPlugin || !opencode) throw new Error("Supply --out, --opencode and --anthropic-auth");
        process.exitCode = await runThinkingMatrix({ out, opencode, authPlugin }) ? 0 : 1;
    } catch {
        // Unexpected library exceptions may contain request headers. Do not log them.
        console.error("Thinking matrix setup/network failure; no credential diagnostics are printed.");
        process.exitCode = 1;
    }
}
