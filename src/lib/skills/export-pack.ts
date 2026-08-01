/**
 * Export skills as Agent Skills-compatible packs (SKILL.md + manifest).
 * Mirrors MathWorks selective skill install: one folder per skill.
 */

import type { Skill } from "./types";
import { SKILLS } from "./catalog";

export interface ExportedSkillFiles {
  /** Relative path under the export root, e.g. "wire-one-net/SKILL.md" */
  path: string;
  content: string;
}

function skillMarkdown(skill: Skill): string {
  const triggers = skill.triggers;
  const lines = [
    "---",
    `name: forge-${skill.id}`,
    `description: ${JSON.stringify(skill.summary)}`,
    "---",
    "",
    `# ${skill.name}`,
    "",
    skill.summary,
    "",
    "## When to use",
    "",
    `- Group: \`${skill.group}\``,
    triggers.stepKinds?.length ? `- Step kinds: ${triggers.stepKinds.join(", ")}` : "",
    triggers.netClasses?.length ? `- Net classes: ${triggers.netClasses.join(", ")}` : "",
    triggers.symptoms?.length ? `- Symptoms: ${triggers.symptoms.join(", ")}` : "",
    triggers.keywords?.length ? `- Keywords: ${triggers.keywords.join(", ")}` : "",
    "",
    "## Guidance",
    "",
    skill.guidance,
    "",
    "## Tools (Forge MCP)",
    "",
    ...skill.tools.map((t) => `- \`${t}\``),
    "",
    "## Goldens",
    "",
    ...skill.goldenIds.map((g) => `- \`${g}\``),
    "",
    "## Rules",
    "",
    "1. Pins and wire colors come only from compiled connections / wire-color authority.",
    "2. Never invent ordinal pin positions (leftmost/rightmost).",
    "3. Prefer isolate_step + get_step_facts over freeform prose.",
    "4. Live flash/serial requires the Forge web app (MCP returns live-required offline).",
    "",
  ];
  return lines.filter((l) => l !== undefined).join("\n");
}

function manifestYaml(skill: Skill): string {
  return [
    `id: forge-${skill.id}`,
    `name: ${skill.name}`,
    `group: ${skill.group}`,
    `summary: ${JSON.stringify(skill.summary)}`,
    `tools:`,
    ...skill.tools.map((t) => `  - ${t}`),
    `goldenIds:`,
    ...skill.goldenIds.map((g) => `  - ${g}`),
    "",
  ].join("\n");
}

/** All skill files for a catalog export. */
export function exportSkillPackFiles(catalog: Skill[] = SKILLS): ExportedSkillFiles[] {
  const files: ExportedSkillFiles[] = [];
  for (const skill of catalog) {
    const dir = skill.id;
    files.push({ path: `${dir}/SKILL.md`, content: skillMarkdown(skill) });
    files.push({ path: `${dir}/manifest.yaml`, content: manifestYaml(skill) });
  }
  files.push({
    path: "README.md",
    content: [
      "# Forge agent skills",
      "",
      "Install selectively (MathWorks lesson: fewer skills → better triggers):",
      "",
      "```bash",
      "cp -r wire-one-net i2c-ssd1306 ~/.claude/skills/",
      "# or",
      "cp -r */ ~/.agents/skills/",
      "```",
      "",
      "Pair with the Forge MCP server:",
      "",
      "```bash",
      "claude mcp add --transport stdio forge -- npx tsx scripts/forge-mcp-server.mjs",
      "```",
      "",
      "## Catalog",
      "",
      ...catalog.map((s) => `- **${s.id}** (\`${s.group}\`) — ${s.summary}`),
      "",
    ].join("\n"),
  });
  return files;
}
