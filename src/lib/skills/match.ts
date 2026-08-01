/**
 * Select skills for a context. Cap results so agents don't thrash (MathWorks:
 * install only relevant skill groups).
 */

import type { Skill, SkillMatchContext } from "./types";
import { SKILLS } from "./catalog";

const DEFAULT_CAP = 3;

function scoreSkill(skill: Skill, ctx: SkillMatchContext): number {
  const t = skill.triggers;
  let score = 0;

  if (ctx.stepKind && t.stepKinds?.includes(ctx.stepKind)) score += 3;

  if (ctx.netClasses?.length && t.netClasses?.length) {
    const want = new Set(t.netClasses.map((c) => c.toLowerCase()));
    for (const nc of ctx.netClasses) {
      if (want.has(nc.toLowerCase())) score += 4;
    }
  }

  if (ctx.symptom && t.symptoms?.includes(ctx.symptom)) score += 5;

  if (ctx.templateId && t.templateIds?.includes(ctx.templateId)) score += 2;

  if (ctx.stepBlob && t.keywords?.length) {
    const blob = ctx.stepBlob.toLowerCase();
    for (const kw of t.keywords) {
      if (blob.includes(kw.toLowerCase())) score += 2;
    }
  }

  return score;
}

/**
 * Skills relevant to this step/context, highest score first, capped.
 * Zero-score skills are never returned (must have at least one trigger hit).
 */
export function matchSkills(
  ctx: SkillMatchContext,
  opts?: { cap?: number; catalog?: Skill[] }
): Skill[] {
  const cap = opts?.cap ?? DEFAULT_CAP;
  const catalog = opts?.catalog ?? SKILLS;
  return catalog
    .map((skill) => ({ skill, score: scoreSkill(skill, ctx) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.skill.id.localeCompare(b.skill.id))
    .slice(0, cap)
    .map((x) => x.skill);
}

/** Compact digest for prompts / Ask-step grounding. */
export function skillsDigest(skills: Skill[]): string {
  if (!skills.length) return "";
  return skills
    .map((s) => `[${s.id}] ${s.summary}\n${s.guidance}`)
    .join("\n\n");
}
