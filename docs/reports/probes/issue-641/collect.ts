#!/usr/bin/env bun
// Preserve the probe result files in Git; large synthetic databases remain disposable.
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Database } from "bun:sqlite";
const repo = resolve(import.meta.dir,"../../../..");
const allowed = join(realpathSync(tmpdir()),"magic-context","issue-641")+"/";
const evidence = join(import.meta.dir,"evidence");
mkdirSync(evidence,{recursive:true});
const receipt: unknown[] = [];
for (const rootArg of process.argv.slice(2)) {
  const root = realpathSync(rootArg);
  if (!root.startsWith(allowed)) throw new Error("not a disposable issue-641 root: "+root);
  const names = readdirSync(root);
  if (names.includes("summary.json")) {
    const summary = JSON.parse(readFileSync(join(root,"summary.json"),"utf8"));
    const requests = JSON.parse(readFileSync(join(root,"provider-requests.json"),"utf8"));
    const audit = readFileSync(join(root,"audit.jsonl"),"utf8").trim().split("\n").map(line=>JSON.parse(line));
    const events = readFileSync(join(root,"events.jsonl"),"utf8").trim().split("\n").map(line=>JSON.parse(line));
    const db = new Database(join(root,"data/cortexkit/magic-context/context.db"),{readonly:true});
    const state = {
      tags:db.query("SELECT session_id,status,count(*) AS n FROM tags GROUP BY session_id,status").all(),
      meta:db.query("SELECT session_id,last_transform_error,last_input_tokens,last_context_percentage FROM session_meta").all(),
      lkg:db.query("SELECT session_id,json_prefix_chars,json_prefix_hash,captured_at,capture_sequence FROM lkg_slots").all(),
      decisions:db.query("SELECT * FROM transform_decisions").all(),
    };
    db.close();
    const ledgerDir = join(root,"data/cortexkit/magic-context/pi-served-array-digests");
    let ledger: unknown[] = [];
    try {ledger=readdirSync(ledgerDir).flatMap(f=>readFileSync(join(ledgerDir,f),"utf8").trim().split("\n").filter(Boolean).map(line=>JSON.parse(line)));} catch { /* Modes without Magic Context have no served-array ledger. */ }
    writeFileSync(join(evidence,`host-${summary.mode}.json`),JSON.stringify({summary,audit,state,ledger,events:events.filter(e=>["extension_error","agent_end","message_end"].includes(e.type)),requests},null,2)+"\n");
    copyFileSync(join(root,"lsof-end.txt"),join(evidence,`host-${summary.mode}-lsof.txt`));
    receipt.push({mode:summary.mode,root,requestBodySha256:requests.map((r:any)=>createHash("sha256").update(r.rawBody ?? JSON.stringify(r.body)).digest("hex"))});
  } else {
    const report = JSON.parse(readFileSync(join(root,"report.json"),"utf8"));
    const label = receipt.filter((r:any)=>r.kind==="fixture").length === 0 ? "master" : "issue-640-tip";
    writeFileSync(join(evidence,`fixture-${label}.json`),JSON.stringify(report,null,2)+"\n");
    for (const file of names.filter(name=>name.endsWith("-lsof.txt") || name.endsWith("-markers.jsonl"))) copyFileSync(join(root,file),join(evidence,`${label}-${file}`));
    receipt.push({kind:"fixture",label,root});
  }
}
const sourceDir = join(repo,".cache/issue-641/host/node_modules/@oh-my-pi/pi-coding-agent");
const sources: Array<[string,Array<[number,number]>]> = [["src/extensibility/extensions/runner.ts",[[130,143],[261,279],[293,368],[1490,1575],[1969,2036],[2038,2073]]],["src/sdk.ts",[[4141,4150]]]];
let excerpts = "OMP @oh-my-pi/pi-coding-agent 18.8.6; MIT; Stencil Labs, Inc. / Mario Zechner.\nOriginal line numbers preserved below.\n";
for (const [file,ranges] of sources) {
  const source = readFileSync(join(sourceDir,file),"utf8");
  excerpts += `\n${file} SHA256 ${createHash("sha256").update(source).digest("hex")}\n`;
  const lines=source.split("\n");
  for(const [first,last] of ranges) excerpts += lines.slice(first-1,last).map((line,i)=>`${i+first}: ${line}`.trimEnd()).join("\n")+"\n";
}
writeFileSync(join(evidence,"omp-source-excerpts.txt"),excerpts);
copyFileSync(join(sourceDir,"LICENSE"),join(evidence,"omp-LICENSE.txt"));
writeFileSync(join(evidence,"receipts.json"),JSON.stringify(receipt,null,2)+"\n");
console.log(`Preserved ${receipt.length} run receipts in ${evidence}`);
