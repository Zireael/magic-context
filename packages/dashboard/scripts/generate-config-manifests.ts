import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { piThinkingManifest, toolDescriptionManifest } from "./config-manifests";

const target = resolve(import.meta.dir, "../src/generated");
mkdirSync(target, { recursive: true });
for (const [name, value] of Object.entries({ "tool-descriptions": toolDescriptionManifest(), "pi-thinking-levels": await piThinkingManifest() })) {
  writeFileSync(resolve(target, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`);
  console.log(`Generated ${name}: ${Object.keys(value).length} entries`);
}
const format = Bun.spawnSync(["timeout", "30s", resolve(import.meta.dir, "../node_modules/.bin/biome"), "format", "--write", target], { cwd: resolve(import.meta.dir, ".."), stdout: "inherit", stderr: "inherit" });
if (format.exitCode !== 0) throw new Error("Could not format generated config manifests");
