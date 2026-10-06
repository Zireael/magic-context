import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { v2Root, REPEAT_CASES } from "./v2";

// Review evidence contains no v1 actions, rationales or judgments. The model's
// claim inventory is evidence to inspect, not an oracle for its own correctness.
const root = v2Root(process.argv[2]);
const pass = process.argv[3] ?? "A";
if (!["A", "B", "C"].includes(pass)) throw new Error("Invalid pass");
const cases = process.argv[4]?.split(",").map(Number) ?? (pass === "A" ? Array.from({ length: 40 }, (_, i) => i) : REPEAT_CASES);
const lines: string[] = [];
for (const index of cases) {
    const dir = join(root, "v2-results", pass);
    const candidates = await Bun.file(join(dir, `${index}-candidates.json`)).json();
    const decisions = await Bun.file(join(dir, `${index}-decisions.json`)).json();
    lines.push(`\nCASE ${index} (${candidates.facts.length} facts)`);
    candidates.facts.forEach((fact: any, i: number) => {
        const g = decisions.gates[i];
        lines.push(`\n${index}:${i + 1} FACT: ${fact.content}`, `PROPOSED ${g.proposed.action}${g.proposed.target ? ` #${g.proposed.target}` : ""}: ${g.proposed.text ?? ""}`,
            `CLAIMS: ${JSON.stringify(g.proposed.claims)}`, `GATE: ${g.rejected ? g.violations.join("; ") : "accepted"} → ${g.effective.action}`);
        candidates.matches[i].forEach((m: any, rank: number) => lines.push(`${rank + 1}. #${m.id}${m.id === g.proposed.target ? " TARGET" : ""}: ${m.content}`));
    });
}
const path = join(root, `v2-review-${pass}-${cases.join("-")}.txt`);
writeFileSync(path, lines.join("\n"), { mode: 0o600 });
console.log(path);
