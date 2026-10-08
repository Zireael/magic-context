#!/usr/bin/env bun
// Run RPC probes against Oh My Pi, keeping host state and request captures in a temporary directory.
import { spawn, execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repo = resolve(import.meta.dir, "../../../..");
const root = join(realpathSync(tmpdir()), "magic-context", "issue-641");
mkdirSync(root, { recursive: true });
Object.assign(process.env, { TMPDIR: root, HOME: root, CFFIXED_USER_HOME: root, MC_E2E_KEEP: "1" });
const { createPiIsolatedEnv, childEnv, writeConfigs } = await import("../../../../packages/e2e-tests/src/pi-runner/spawn");
const { prepareContextDatabase } = await import("../../../../packages/e2e-tests/src/prepare-context-db");
const { PiRpcProtocol, attachStrictJsonlReader } = await import("../../../../packages/e2e-tests/src/pi-runner/rpc-client");
const { MockProvider } = await import("../../../../packages/e2e-tests/src/mock-provider/server");
const mode = process.argv[2] ?? "slow";
if (!["fast", "slow", "refuse", "late-mc", "fenced"].includes(mode)) throw new Error("mode: fast|slow|refuse|late-mc|fenced");
const mock = new MockProvider();
const { baseURL } = await mock.start();
mock.setDefault({ text: "mock reply", usage: { input_tokens: 1000, output_tokens: 10 } });
const iso = createPiIsolatedEnv(undefined, "omp");
prepareContextDatabase(iso.dataDir);
writeConfigs(iso, { host: "omp", mockProviderURL: baseURL, modelContextLimit: 256000,
  magicContextConfig: { debug_rpc: true, memory: { enabled: false }, embedding: { provider: "off" }, dreamer: { disable: true } } });
const env = childEnv(iso);
Object.assign(env, { TMPDIR: root, MC641_ROOT: iso.baseDir, MC641_MODE: mode,
  MAGIC_CONTEXT_LOG_PATH: join(iso.baseDir, "magic-context.log"), MAGIC_CONTEXT_PI_SERVED_BODY_CAPTURE: "1" });
const probe = join(iso.baseDir, "probe.mjs");
writeFileSync(probe, `
import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { Database } from 'bun:sqlite';
const db = new Database(process.env.MAGIC_CONTEXT_STORAGE_DIR + '/context.db');
const audit = value => appendFileSync(process.env.MC641_ROOT + '/audit.jsonl', JSON.stringify({at:Date.now(), ...value})+'\\n');
export default async function(pi) {
  const mode = process.env.MC641_MODE;
  let managed = false;
  if (mode === 'fenced') pi.on('before_provider_request',(_event,ctx)=> {
    audit({phase:'provider-fence',managed});
    if (!managed) { pi.appendEntry('deadline-probe-refusal',{message:'No managed context receipt; refusing provider dispatch'}); ctx.abort(); }
  });
  const inspect = (event,ctx) => {
    db.query('SELECT count(*) FROM sqlite_master').get();
    const lsof = execFileSync('/usr/sbin/lsof',['-p',String(process.pid)],{encoding:'utf8'});
    const dbLines = lsof.split('\\n').filter(line => /\\.db(?:[- ]|$)/.test(line));
    audit({phase:'start',pid:process.pid,eventKeys:Object.keys(event),ctxKeys:Object.keys(ctx),eventSignal:!!event.signal,ctxSignal:!!ctx.signal,dbLines});
    if (!dbLines.length || dbLines.some(line => !line.includes(process.env.MC641_ROOT))) throw new Error('store isolation failed');
  };
  if (mode === 'late-mc') {
    const {default:magicContext} = await import(${JSON.stringify(join(repo, "packages/pi-plugin/dist/index.js"))});
    const proxied = new Proxy(pi,{get(target,key){
      if (key === 'on') return (name,handler) => target.on(name,name === 'context' ? async (event,ctx) => {
        inspect(event,ctx); await Bun.sleep(32000);
        audit({phase:'late-mc-start'}); const result = await handler(event,ctx);
        audit({phase:'late-mc-end',returnedMessages:result?.messages?.length}); return result;
      } : handler);
      const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
    }});
    await magicContext(proxied);
  } else pi.on('context',async (event,ctx) => {
    inspect(event,ctx);
    await Bun.sleep(mode === 'fast' ? 10 : mode === 'refuse' ? 25000 : 32000);
    if (mode === 'refuse') { pi.appendEntry('deadline-probe-refusal',{message:'Managed turn refused before host deadline'}); ctx.abort(); }
    managed = true;
    audit({phase:'end',eventSignal:!!event.signal,ctxSignal:!!ctx.signal});
    return {messages:event.messages.map(m => m.role === 'user' ? {...m,content:[{type:'text',text:'MC641_TRANSFORMED'}]} : m)};
  });
}
`);
const cli = resolve(repo, ".cache/issue-641/host/node_modules/@oh-my-pi/pi-coding-agent/dist/cli.js");
const version = execFileSync(process.execPath, [cli, "--version"], { env, cwd: iso.workdir, encoding: "utf8" }).trim();
const host = spawn(process.execPath, [cli, "--mode", "rpc", "--no-extensions", "--extension", probe, "--no-skills", "--no-rules", "--model", "mock/mock-model", "--api-key", "test-key-not-real"], { env, cwd: iso.workdir, stdio: ["pipe", "pipe", "pipe"] });
const rpc = new PiRpcProtocol();
attachStrictJsonlReader(host.stdout!, line => rpc.dispatchLine(line));
host.stderr!.on("data", data => appendFileSync(join(iso.baseDir, "stderr.txt"), data));
rpc.onEvent(event => appendFileSync(join(iso.baseDir, "events.jsonl"), JSON.stringify({at: Date.now(), ...event}) + "\n"));
const command = (type: string, params = {}) => rpc.sendCommand(line => host.stdin!.write(line), type, params, { timeoutMs: 90000 });
try {
  await command("get_state");
  const done = rpc.waitForEvent(e => e.type === "agent_end", { timeoutMs: 90000 });
  const start = Date.now();
  await command("prompt", { message: "MC641_ORIGINAL" });
  await done;
  // Keep the host alive after its deadline so late context handlers can publish DB and replay results.
  await Bun.sleep(Math.max(0, start + 35000 - Date.now()));
  const requests = mock.requests();
  writeFileSync(join(iso.baseDir, "provider-requests.json"), JSON.stringify(requests, null, 2));
  const lsof = execFileSync("/usr/sbin/lsof", ["-p", String(host.pid)], { encoding: "utf8" });
  writeFileSync(join(iso.baseDir, "lsof-end.txt"), lsof);
  const dbLines = lsof.split("\n").filter(line => /\.db(?:[- ]|$)/.test(line));
  if (!dbLines.length || dbLines.some(line => !line.includes(iso.baseDir))) throw new Error("store isolation failed");
  const body = JSON.stringify(requests.map(r => r.body.messages));
  const summary = { mode, version, root: iso.baseDir, pid: host.pid, requests: requests.length,
    firstRequestMs: requests[0] ? requests[0].receivedAt - start : null,
    originalOnWire: body.includes("MC641_ORIGINAL"), transformedOnWire: body.includes("MC641_TRANSFORMED"), dbLines };
  writeFileSync(join(iso.baseDir, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary));
  if (mode === "fast" && (!summary.transformedOnWire || summary.originalOnWire)) throw new Error("fast transform not observed");
  if (mode === "slow" && (!summary.originalOnWire || summary.transformedOnWire || requests.length !== 1)) throw new Error("timeout fallback not observed");
  if (["refuse","fenced"].includes(mode) && requests.length !== 0) throw new Error("refusal reached provider");
} finally {
  host.kill("SIGTERM");
  await new Promise(done => host.once("exit", done));
  await mock.stop();
}
