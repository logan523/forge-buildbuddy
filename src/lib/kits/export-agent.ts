/**
 * Kit → agent pack stub (P2.5).
 * A published kit can export a mini skill + pointer for agents to load
 * alongside the Forge MCP tools (no full marketplace required).
 */

import type { BuildPlan } from "@/lib/types";
import { slugify } from "./store";
import { matchSkills } from "@/lib/skills";
import { expectedI2cAddresses } from "@/lib/serial/expected-devices";
import { stepKind } from "@/lib/steps/classify";

export interface KitAgentPack {
  slug: string;
  title: string;
  skillMd: string;
  manifestYaml: string;
  /** Tools agents should call for this kit. */
  tools: string[];
  /** Skill ids that match demo-like steps in the plan. */
  recommendedSkillIds: string[];
  expectedI2c: { label: string; addresses: number[] }[];
  /** Summary for kit listing / download. */
  readme: string;
}

/** Files to write or download for a kit agent pack (browser or script). */
export interface KitAgentPackFile {
  filename: string;
  content: string;
  mime: string;
}

/**
 * Bundle pack + plan into downloadable files. Plan is trust-pipelined by the caller
 * if needed; we re-export as pretty JSON.
 */
export function kitAgentPackFiles(
  plan: BuildPlan,
  pack: KitAgentPack
): KitAgentPackFile[] {
  return [
    {
      filename: `forge-kit-${pack.slug}-SKILL.md`,
      content: pack.skillMd,
      mime: "text/markdown;charset=utf-8",
    },
    {
      filename: `forge-kit-${pack.slug}-README.md`,
      content: pack.readme,
      mime: "text/markdown;charset=utf-8",
    },
    {
      filename: `forge-kit-${pack.slug}-manifest.yaml`,
      content: pack.manifestYaml,
      mime: "text/yaml;charset=utf-8",
    },
    {
      filename: `forge-kit-${pack.slug}-plan.json`,
      content: JSON.stringify(plan, null, 2),
      mime: "application/json;charset=utf-8",
    },
    {
      filename: `forge-kit-${pack.slug}-pack.json`,
      content: JSON.stringify(
        {
          version: 1,
          slug: pack.slug,
          title: pack.title,
          tools: pack.tools,
          recommendedSkillIds: pack.recommendedSkillIds,
          expectedI2c: pack.expectedI2c,
        },
        null,
        2
      ),
      mime: "application/json;charset=utf-8",
    },
  ];
}

/**
 * One self-contained JSON for agents/humans — no multi-file browser spam.
 * Unpack with any JSON tool; `files` maps relative path → content.
 */
export function kitAgentPackBundle(
  plan: BuildPlan,
  pack: KitAgentPack
): { version: number; slug: string; title: string; files: Record<string, string> } {
  const files = kitAgentPackFiles(plan, pack);
  const map: Record<string, string> = {};
  for (const f of files) {
    // Stable names inside the bundle (drop forge-kit-slug- prefix noise)
    if (f.filename.endsWith("-SKILL.md")) map["SKILL.md"] = f.content;
    else if (f.filename.endsWith("-README.md")) map["README.md"] = f.content;
    else if (f.filename.endsWith("-manifest.yaml")) map["manifest.yaml"] = f.content;
    else if (f.filename.endsWith("-plan.json")) map["plan.json"] = f.content;
    else if (f.filename.endsWith("-pack.json")) map["pack.json"] = f.content;
    else map[f.filename] = f.content;
  }
  return {
    version: 1,
    slug: pack.slug,
    title: pack.title,
    files: map,
  };
}

/** Default: one bundle download. Pass `{ multi: true }` for legacy multi-file. */
export function downloadKitAgentPackInBrowser(
  plan: BuildPlan,
  authorName?: string,
  opts?: { multi?: boolean }
): number {
  const pack = exportKitAgentPack(plan, { authorName });
  if (opts?.multi) {
    const files = kitAgentPackFiles(plan, pack);
    files.forEach((f, i) => {
      setTimeout(() => downloadBlob(f.filename, f.content, f.mime), i * 180);
    });
    return files.length;
  }
  const bundle = kitAgentPackBundle(plan, pack);
  downloadBlob(
    `forge-kit-${pack.slug}-agent-pack.json`,
    JSON.stringify(bundle, null, 2),
    "application/json;charset=utf-8"
  );
  return 1;
}

function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportKitAgentPack(plan: BuildPlan, opts?: { authorName?: string }): KitAgentPack {
  const slug = slugify(plan.title || plan.id || "kit");
  const skillIds = new Set<string>();
  for (const step of plan.steps || []) {
    const skills = matchSkills({
      stepKind: stepKind(step),
      netClasses: (step.compiled?.connections ?? []).map((c) => c.netClass),
      stepBlob: `${step.title} ${step.description || ""}`,
    });
    for (const s of skills) skillIds.add(s.id);
  }
  const recommendedSkillIds = [...skillIds];
  const i2c = expectedI2cAddresses(plan);

  const skillMd = [
    "---",
    `name: forge-kit-${slug}`,
    `description: ${JSON.stringify(`Build kit: ${plan.title}`)}`,
    "---",
    "",
    `# Kit: ${plan.title}`,
    "",
    plan.description || "A Forge hardware kit.",
    "",
    opts?.authorName ? `Author: ${opts.authorName}` : "",
    "",
    "## Goal",
    "",
    "Help a beginner complete this kit using Forge MCP tools and the recommended skills.",
    "",
    "## Recommended skills",
    "",
    ...recommendedSkillIds.map((id) => `- \`forge-${id}\` (or repo skill \`${id}\`)`),
    "",
    "## Tools",
    "",
    "- `compile_plan` / `get_step_facts` — instruction truth",
    "- `audit_plan` — table + 3D + render integrity",
    "- `run_tasks` — offline task suite when plan is Sat Line-class",
    "- `expected_i2c` — addresses for live verify",
    "- Live: `flash_firmware` / serial only in the Forge web app",
    "",
    "## Expected I2C (if any)",
    "",
    i2c.length
      ? i2c.map((d) => `- ${d.label}: ${d.addresses.map((a) => "0x" + a.toString(16)).join(" / ")}`).join("\n")
      : "- (none)",
    "",
    "## Rules",
    "",
    "1. Load the kit plan JSON into tools that require `plan`.",
    "2. Never invent pins — only compiled connections.",
    "3. After wiring software steps, prefer live I2C verify when a board is available.",
    "",
  ]
    .filter((l) => l !== undefined)
    .join("\n");

  const manifestYaml = [
    `id: forge-kit-${slug}`,
    `title: ${JSON.stringify(plan.title)}`,
    `skills:`,
    ...recommendedSkillIds.map((id) => `  - ${id}`),
    `partCount: ${plan.parts?.length ?? 0}`,
    `stepCount: ${plan.steps?.length ?? 0}`,
    "",
  ].join("\n");

  const readme = [
    `# ${plan.title} — agent pack`,
    "",
    "1. Install recommended skills from `agent-skills/forge/`.",
    "2. Run Forge MCP: `npm run mcp:server`.",
    "3. Pass this kit's plan JSON as `plan` or set `FORGE_PLAN`.",
    "",
    `Recommended skill ids: ${recommendedSkillIds.join(", ") || "(none matched)"}`,
    "",
    `Parts: ${plan.parts?.length ?? 0} · Steps: ${plan.steps?.length ?? 0}`,
    "",
  ].join("\n");

  return {
    slug,
    title: plan.title,
    skillMd,
    manifestYaml,
    tools: [
      "compile_plan",
      "get_step_facts",
      "audit_plan",
      "match_skills",
      "expected_i2c",
      "run_tasks",
    ],
    recommendedSkillIds,
    expectedI2c: i2c.map((d) => ({ label: d.label, addresses: d.addresses })),
    readme,
  };
}
