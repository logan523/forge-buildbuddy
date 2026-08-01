/**
 * Write agent skill packs to disk.
 *
 *   npm run skills:export
 *   npm run skills:export -- ./dist/forge-skills
 *
 * Default output: agent-skills/forge/ under the repo.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exportSkillPackFiles } from "../src/lib/skills/export-pack.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outRoot = path.resolve(process.argv[2] || path.join(ROOT, "agent-skills", "forge"));

const files = exportSkillPackFiles();
for (const f of files) {
  const dest = path.join(outRoot, f.path);
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, f.content, "utf8");
}
console.log(`Exported ${files.length} files → ${outRoot}`);
console.log("Install example: cp -r agent-skills/forge/i2c-ssd1306 ~/.claude/skills/");
