#!/usr/bin/env bun
// Run with: timeout 600 bun packages/plugin/scripts/perf-audit/pi.ts
// --report <run.ts JSON> summarizes the real handler's cross-cutting SQL costs.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateSyntheticFixture } from "../../../pi-plugin/scripts/experiments/perf/fixtures";
import type { PerfRunReport } from "../../../pi-plugin/scripts/experiments/perf/run";

console.log(`Bun ${Bun.version}; median of 5 warm samples, 1k/10k/60k Pi messages`);
const reportIndex = process.argv.indexOf("--report");
if (reportIndex >= 0) {
 const report = await Bun.file(process.argv[reportIndex + 1]!).json() as PerfRunReport;
 for (const pass of report.passes) {
  console.log(JSON.stringify({ messages: pass.inputMessages, phases: pass.phases,
   stages: pass.stages.filter(s => /Identity|Snapshot|Reasoning|Floor|M0|Injection/i.test(s.stage)),
   queries: pass.dbQueries.filter(q => /session_meta|source_contents|pi-msg|compartments|pending_ops|memories/.test(q.sql))
    .map(q => ({ ms: +q.elapsedMs.toFixed(3), operations: q.operations, sql: q.sql.replace(/\s+/g, " ") })) }));
 }
 process.exit(0);
}

const root = mkdtempSync(join(tmpdir(), "mc-pi-audit-"));
process.env.MAGIC_CONTEXT_TEST_DATA_DIR = root;
process.env.XDG_DATA_HOME = root;
process.env.NODE_ENV = "test";
const { Database } = await import("../../src/shared/sqlite");
const { initializeDatabase } = await import("../../src/features/magic-context/storage-db");
const { runMigrations } = await import("../../src/features/magic-context/migrations");
const { getOrCreateSessionMeta } = await import("../../src/features/magic-context/storage-meta");
const { getMemoriesByProject } = await import("../../src/features/magic-context/memory/storage-memory");
const { stripSystemInjection } = await import("../../src/hooks/magic-context/system-injection-stripper");
const { lkgContentFields } = await import("../../src/hooks/magic-context/lkg-slot");
const { capturePiServedArray, flushPiServedArrayLedger } = await import("../../../pi-plugin/src/served-array-ledger");
const { createPiLkgCoordinator, clearPiLkgSessionState } = await import("../../../pi-plugin/src/pi-lkg");
const { measurePiTailHygiene, assertPiTailHygieneContentUnchanged, clearPiTailHygieneContentMemo } = await import("../../../pi-plugin/src/tail-hygiene-walk-pi");
const { tokenizePiMessages } = await import("../../../pi-plugin/src/tokenize-pi-messages");
const { createPiTagSnapshotReader } = await import("../../../pi-plugin/src/tag-snapshot-pi");
const { readPiSessionMessages } = await import("../../../pi-plugin/src/read-session-pi");
const { hasPiFallbackMessageTags, hasPiFallbackToolOwnerTags } = await import("../../src/features/magic-context/storage-tags");
const { hasPiFallbackMessageTags: cachedMessageProbe, hasPiFallbackToolOwnerTags: cachedToolProbe } = await import("../../../pi-plugin/src/fallback-tag-probes-pi");
const { runPiDebugAssertion } = await import("../../../pi-plugin/src/debug-assertions-pi");
const { __test: handlerTest, clearContextHandlerSession } = await import("../../../pi-plugin/src/context-handler");
const { createPiTranscript } = await import("../../../pi-plugin/src/transcript-pi");
const { createPiM0M1PassSnapshot } = await import("../../../pi-plugin/src/inject-compartments-pi");
const { findFirstKeptEntryId } = await import("../../../pi-plugin/src/pi-historian-runner");

function median(run: () => unknown): number {
 run();
 const samples = Array.from({ length: 5 }, () => { const start = performance.now(); run(); return performance.now() - start; });
 return +samples.sort((a, b) => a - b)[2]!.toFixed(3);
}

try {
 for (const size of [1000, 10000, 60000]) {
  const db = new Database(join(root, `context-${size}.db`));
  initializeDatabase(db); runMigrations(db); getOrCreateSessionMeta(db, "audit");
  const fixture = generateSyntheticFixture({ messages: size });
  const messages = fixture.entries.map(e => (e as unknown as {message: unknown}).message);
  const ids = fixture.entries.map(e => e.id);
  // The host's usual ~4 KiB read result and occasional screenshot dominate bytes.
  for (const message of messages as {role: string; content: unknown}[]) {
   if (message.role === "toolResult") (message.content as {text: string}[])[0]!.text = "result line\n".repeat(350);
  }
  db.transaction(() => {
   const tag = db.prepare("INSERT INTO tags(session_id,tag_number,message_id,type,status,byte_size) VALUES('audit',?,?,'message','active',100)");
   const memory = db.prepare("INSERT INTO memories(project_path,content,normalized_hash,category,status,source_type,created_at,updated_at,first_seen_at,last_seen_at) VALUES('audit',?,?,'context','active','manual',1,1,1,1)");
   for (let i = 0; i < size; i++) { tag.run(i + 1, ids[i]); memory.run(`memory ${i}: ${"body ".repeat(100)}`, String(i)); }
  })();
  const readTags = createPiTagSnapshotReader(db); const tags = readTags("audit");
  const hygieneInput = { messages, tags, protectedTagNumbers: new Set<number>(), stableId: (_:unknown,i:number) => ids[i] };
  const measured = measurePiTailHygiene(hygieneInput);
  const coordinator = createPiLkgCoordinator(db, () => {});
  const begin = () => coordinator.beginPass({ sessionId: "audit", messages, entryIds: ids, modelKey: "anthropic/audit", providerKey: "anthropic" });
  const snapshot = begin();
  let serializedOutput: unknown;
  const capture = () => { serializedOutput = coordinator.captureAppliedPass({ snapshot, outputMessages: messages, outputEntryIds: ids, cacheBusting: false }); };
  const cache = new Map();
  const idByRef = new Map(messages.map((m,i)=>[m,ids[i]!]));
  const tokenOptions = { cache, stableId: (m:unknown) => idByRef.get(m) };
  tokenizePiMessages(messages, tokenOptions);
  const ctx = { sessionManager: { getBranch: () => fixture.entries, getSessionId: () => "audit", getSessionFile: () => undefined } };
  const transcript = createPiTranscript(messages, `identity-${size}`, ids);
  const assignments = new Map<string,number>();
  db.transaction(() => {
   const source = db.prepare("INSERT INTO source_contents(session_id,tag_id,content,created_at) VALUES(?,?,?,1)");
   let number = 0;
   for (const message of transcript.messages) {
    let ordinal = 0;
    for (const part of message.parts) if (part.kind === "text") {
     assignments.set(`${message.info.id}:p${ordinal++}`, ++number);
     source.run(`identity-${size}`, number, part.getText() ?? "");
    }
   }
   const compartment = db.prepare("INSERT INTO compartments(session_id,sequence,start_message,end_message,title,content,p1,p2,p3,p4,created_at) VALUES('audit',?,0,100,'title',?,?,?,?,?,1)");
   const body = "compartment body\n".repeat(240);
   for(let i=0;i<Math.ceil(size/100);i++) compartment.run(i,body,body,body,body,body);
  })();
  const tagger = { getAssignments: () => assignments };
  const plan = () => handlerTest.buildPiTextIdentityPlan(db,`identity-${size}`,tagger as never,transcript,new Set(ids));
  const timings = {
   ledger: median(() => capturePiServedArray("audit", messages, { storageDir: root })),
   lkgInput: median(begin), lkgOutput: median(capture),
   ledgerWithLkg: median(() => capturePiServedArray("audit-reuse", messages, { storageDir: root, serializedOutput } as never)),
   detachedFields: median(() => messages.map(lkgContentFields)),
   hygiene: median(() => measurePiTailHygiene(hygieneInput)),
   assertion: median(() => assertPiTailHygieneContentUnchanged({ ...hygieneInput, expectedSignature: measured.contentSignature })),
   debugDisabled: median(() => runPiDebugAssertion(() => assertPiTailHygieneContentUnchanged({ ...hygieneInput, expectedSignature: measured.contentSignature }))),
   reminderRegex: median(() => { for(const m of messages as {content: unknown}[]) { if(typeof m.content === "string") stripSystemInjection(m.content); else for(const p of m.content as {text?:string}[]) if(p.text) stripSystemInjection(p.text); } }),
   meta4Reads: median(() => { for(let i=0;i<4;i++) getOrCreateSessionMeta(db,"audit"); }),
   memoryRowsForCount: median(() => getMemoriesByProject(db,"audit").length),
   fallbackProbes: median(() => { hasPiFallbackMessageTags(db,"audit"); hasPiFallbackMessageTags(db,"audit"); hasPiFallbackToolOwnerTags(db,"audit"); }),
   cachedFallbackProbes: median(() => { cachedMessageProbe(db,"audit"); cachedMessageProbe(db,"audit"); cachedToolProbe(db,"audit"); }),
   tagSnapshot: median(() => readTags("audit")),
   branchConversion: median(() => readPiSessionMessages(ctx as never)),
   tokenCacheHit: median(() => tokenizePiMessages(messages,tokenOptions)),
   tokenUncached: median(() => tokenizePiMessages(messages)),
   prefixCloneTwice: median(() => { const prefix=[{role:"user",content:"history ".repeat(size)}]; structuredClone(prefix); structuredClone(prefix); }),
   identityPlan: median(plan),
   m0PassSnapshot: median(() => createPiM0M1PassSnapshot({db,sessionId:"audit",compactionOff:false})),
   firstKeptEntry: median(() => findFirstKeptEntryId(fixture.entries,Math.floor(size/2))),
   threeMetadataWrites: median(() => {
    db.prepare("UPDATE session_meta SET conversation_tokens = 1, tool_call_tokens = 1 WHERE session_id = 'audit'").run();
    db.prepare("UPDATE session_meta SET new_work_tokens = 1, total_input_tokens = 1 WHERE session_id = 'audit'").run();
    db.prepare("UPDATE session_meta SET channel2_nudge_state = '' WHERE session_id = 'audit' AND channel2_nudge_state = 'pending'").run();
   }),
  };
  db.prepare("UPDATE session_meta SET cached_m0_bytes = ?, cached_m1_bytes = ?, cached_m0_mural_data_url = ? WHERE session_id = 'audit'").run(Buffer.from("m0 ".repeat(5000)),Buffer.from("m1 ".repeat(100)),"data:image/png;base64,"+"a".repeat(1024*1024));
  Object.assign(timings, { meta4BlobReads: median(() => { for(let i=0;i<4;i++) getOrCreateSessionMeta(db,"audit"); }), m0BlobSnapshot: median(() => createPiM0M1PassSnapshot({db,sessionId:"audit",compactionOff:false})) });
  const plans = ["message_id", "tool_owner_message_id"].map(column => db.prepare(`EXPLAIN QUERY PLAN SELECT 1 FROM tags WHERE session_id = ? AND type = ? AND ${column} LIKE 'pi-msg-%' LIMIT 1`).all("audit",column === "message_id" ? "message" : "tool"));
  console.log(JSON.stringify({ messages: size, bytes: Buffer.byteLength(JSON.stringify(messages)), ms: timings, plans }));
  flushPiServedArrayLedger(); clearContextHandlerSession(`identity-${size}`); clearPiLkgSessionState("audit"); clearPiTailHygieneContentMemo(); db.close();
 }
} finally { flushPiServedArrayLedger(); rmSync(root,{recursive:true,force:true}); }
