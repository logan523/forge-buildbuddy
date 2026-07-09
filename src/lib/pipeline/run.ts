import Anthropic from "@anthropic-ai/sdk";
import type { BuildPlan } from "@/lib/types";
import { applyTrustPipeline } from "@/lib/trust";
import { sanitizeStructuredNets } from "@/lib/electrical/schema";
import { sanitizeFormSpec } from "@/lib/product-visual/formspec/schema";
import { sanitizePoseHints } from "@/lib/product-3d/enrich-poses";
import { classifyInputHazards, safetyPreamble } from "./layer1-safety";
import { analyzeGaps } from "./layer4-gaps";
import { claudeJson } from "./claude";
import type {
  ExtractResult,
  GapResult,
  LayerResult,
  PipelineMeta,
  PrinciplesResult,
} from "./types";

/** Zod-sanitize structuredNets from raw LLM JSON (drop junk, keep valid). */
function netsFromLlm(raw: Partial<BuildPlan>): BuildPlan["structuredNets"] {
  const { structuredNets } = sanitizeStructuredNets((raw as BuildPlan).structuredNets);
  return structuredNets;
}

function formFromLlm(raw: Partial<BuildPlan>): BuildPlan["formSpec"] {
  const parsed = sanitizeFormSpec((raw as BuildPlan).formSpec);
  if (!parsed) return undefined;
  return { ...parsed, source: "llm", grade: parsed.grade || "assumed" };
}

/** Soft-parse optional 3D pose enrichment from LLM (layer/node keys, delta or absolute). */
function posesFromLlm(raw: Partial<BuildPlan>): BuildPlan["scenePoses"] {
  const hints = sanitizePoseHints((raw as BuildPlan).scenePoses);
  // Store as PoseLayout3D-compatible map; deltas kept via position field encoding is lossy —
  // store full hint objects (position/rotation/delta) on plan for resolve at build time.
  return hints as BuildPlan["scenePoses"];
}

const SYNTH_SYSTEM = `You are a hardware build plan generator for beginners. Output ONLY valid JSON BuildPlan fields.
You are the definitive reference — never say "as shown in the video."
Every step needs exact dimensions, pin numbers, wire colors, both ends of connections.
Include verification, whyThisWorks, beforeState, afterState, commonMistakes where useful.

CRITICAL — structuredNets is the electrical authority (not free text alone):
- Every power/ground/signal connection must appear in structuredNets.
- Member ref = short designator: U1 for first IC/module, U2 next, BT1 for battery cells.
- Pin names must match silkscreen: 3V3, GND, VCC, SDA, SCL, GPIO4, SIG, B+, B-, etc.
- Also fill wiringConnections as human-readable labels for the UI.

CRITICAL — formSpec is the physical product look (what sits on a desk), NOT a circuit block diagram:
- templateId MUST be one of: sat_clock | weather_stick | robot_chassis | sensor_pod | boxed_gadget | breadboard
- Pick the template that matches the finished physical object a beginner would recognize.
- sat_clock: bamboo/frame desk clock with display and optional solar wings
- weather_stick: tall outdoor/garden sensor on a stake
- robot_chassis: wheeled rover/bot
- sensor_pod: small handheld/wearable pod
- boxed_gadget: electronics in a case/enclosure
- breadboard: only if it is clearly a loose prototype, not a finished product
- productCaption: one plain sentence describing the finished object
- materials.base/frame/face when known (bamboo, brass, oled, …)
- params.heightScale / wingSpan: 0.7–1.4 composition knobs (1 = default)

OPTIONAL — scenePoses nudges the 3D product model (parametric scene remains authority):
- Keys = layer names: base | frame | face | wings | brain | sensor | touch | power | shell | body | wheels | mast
  OR node ids when known: face, brain, solar-l, solar-r, battery, …
- Prefer small delta offsets in mm: { "delta": [dx, dy, dz] } rather than absolute positions
- rotation optional as [rx, ry, rz] radians
- Only include scenePoses when the product description clearly needs a pose tweak (button on side, taller mast, etc.)
- Never invent photoreal mesh data — poses only

JSON shape:
{
  "title","description","difficulty":"beginner|intermediate|advanced",
  "estimatedTime","estimatedCost",
  "parts":[{"name","specification","quantity","notes?","mpn?"}],
  "tools":[{"name","required"}],
  "steps":[{
    "stepNumber","title","description",
    "goal":"one beginner sentence of what this step achieves",
    "youNeed":["OLED","Soldering iron","Pliers"],
    "actions":[{"n":1,"text":"short plain action","caution?":"optional warning"}],
    "doneWhen":"how the beginner knows they finished",
    "quickSummary?","whyThisWorks?","beforeState?","afterState?","commonMistakes?","toolTechnique?","verification?","safetyNotes?"
  }],
  "wiringConnections":[{"from","to","wireColor?"}],
  "structuredNets":[
    {"name":"GND","netClass":"gnd","members":[{"ref":"U1","pin":"GND"},{"ref":"U2","pin":"GND"}]},
    {"name":"3V3","netClass":"power","members":[{"ref":"U1","pin":"3V3"},{"ref":"U2","pin":"VCC"}]},
    {"name":"SDA","netClass":"i2c","members":[{"ref":"U1","pin":"GPIO4"},{"ref":"U2","pin":"SDA"}],"wireColor":"blue"}
  ],
  "formSpec":{
    "templateId":"sat_clock",
    "params":{"heightScale":1,"wingSpan":1},
    "materials":{"base":"bamboo","frame":"brass","face":"oled"},
    "productCaption":"Solar desk clock on bamboo base"
  },
  "scenePoses":{
    "touch":{"delta":[-15,0,0]},
    "wings":{"delta":[0,5,0]}
  },
  "warnings":["..."]
}`;

async function layer2(client: Anthropic, text: string, hazards: string[]): Promise<PrinciplesResult> {
  const raw = (await claudeJson({
    client,
    temperature: 0,
    maxTokens: 1024,
    system: "Hardware engineering coach. Output ONLY JSON.",
    user: `Restate this project in first principles for a beginner build plan.
Hazard tags: ${hazards.join(", ") || "none"}
Project text:
${text.slice(0, 12000)}

JSON: {
  "functionalGoal": "one sentence",
  "constraints": ["..."],
  "risks": ["..."],
  "simplicityNotes": ["how to keep v0 uncomfortably simple"]
}`,
  })) as PrinciplesResult;
  return {
    functionalGoal: raw.functionalGoal || "Build the described device",
    constraints: raw.constraints || [],
    risks: raw.risks || [],
    simplicityNotes: raw.simplicityNotes || [],
  };
}

async function layer3(client: Anthropic, text: string, principles: PrinciplesResult): Promise<ExtractResult> {
  const raw = (await claudeJson({
    client,
    temperature: 0,
    maxTokens: 3072,
    system: "Extract hardware BOM facts only. No assembly steps. Output ONLY JSON.",
    user: `Goal: ${principles.functionalGoal}
Risks: ${principles.risks.join("; ")}

Source:
${text.slice(0, 14000)}

JSON: {
  "title": "...",
  "description": "...",
  "parts": [{"name","specification","quantity","notes?","confidence":"CERTAIN|IMPLIED|ASSUMED"}],
  "tools": [{"name","required":true}],
  "openQuestions": ["..."]
}`,
  })) as ExtractResult;
  return {
    title: raw.title || "Hardware project",
    description: raw.description || "",
    parts: Array.isArray(raw.parts) ? raw.parts : [],
    tools: Array.isArray(raw.tools) ? raw.tools : [],
    openQuestions: raw.openQuestions || [],
  };
}

async function layer5(
  client: Anthropic,
  text: string,
  principles: PrinciplesResult,
  extract: ExtractResult,
  gaps: GapResult,
  safety: string
): Promise<Partial<BuildPlan>> {
  return (await claudeJson({
    client,
    temperature: 0.1,
    maxTokens: 8192,
    timeoutMs: 90000,
    system: SYNTH_SYSTEM,
    user: `SAFETY REQUIREMENTS:
${safety}

FUNCTIONAL GOAL: ${principles.functionalGoal}
CONSTRAINTS: ${principles.constraints.join("; ")}
RISKS: ${principles.risks.join("; ")}
SIMPLICITY: ${principles.simplicityNotes.join("; ")}

EXTRACTED PARTS:
${JSON.stringify(extract.parts, null, 2)}

TOOLS:
${JSON.stringify(extract.tools)}

CATALOG / GAPS:
${gaps.catalogHints.join("\n")}
Missing: ${gaps.missingSpecs.join("; ")}
BLOCKERS (must resolve in plan): ${gaps.blockers.join("; ")}

OPEN QUESTIONS: ${extract.openQuestions.join("; ")}

ORIGINAL SOURCE (for detail only — do not reference the video):
${text.slice(0, 10000)}

Produce the complete beginner build plan JSON now.`,
  })) as Partial<BuildPlan>;
}

/** Single-pass fallback (legacy path). */
async function singlePass(client: Anthropic, text: string): Promise<Partial<BuildPlan>> {
  return (await claudeJson({
    client,
    temperature: 0.1,
    maxTokens: 8192,
    system: SYNTH_SYSTEM,
    user: `Create a complete build plan for this project:\n\n${text}`,
  })) as Partial<BuildPlan>;
}

export type PipelineProgress = {
  layer: number;
  name: string;
  status: "start" | "done";
  detail?: string;
};

export async function runPipeline(opts: {
  text: string;
  sourceUrl?: string;
  apiKey: string;
  /** Fired at each real layer boundary so callers can show honest progress. */
  onProgress?: (p: PipelineProgress) => void;
}): Promise<BuildPlan> {
  const t0 = Date.now();
  const layers: LayerResult[] = [];
  const client = new Anthropic({ apiKey: opts.apiKey });
  const emit = (layer: number, name: string, status: "start" | "done", detail?: string) => {
    try {
      opts.onProgress?.({ layer, name, status, detail });
    } catch {
      /* progress is best-effort; never fail the pipeline on a reporting error */
    }
  };

  // L1
  emit(1, "safety", "start");
  const l1t = Date.now();
  const hazardTags = classifyInputHazards(opts.text);
  const safety = safetyPreamble(hazardTags);
  layers.push({ layer: 1, name: "safety", ok: true, durationMs: Date.now() - l1t, detail: hazardTags.join(",") });

  try {
    // L2
    emit(2, "principles", "start");
    const l2t = Date.now();
    const principles = await layer2(client, opts.text, hazardTags);
    layers.push({ layer: 2, name: "principles", ok: true, durationMs: Date.now() - l2t });

    // L3
    emit(3, "extract", "start");
    const l3t = Date.now();
    const extract = await layer3(client, opts.text, principles);
    layers.push({
      layer: 3,
      name: "extract",
      ok: true,
      durationMs: Date.now() - l3t,
      detail: `${extract.parts.length} parts`,
    });

    // L4
    emit(4, "gaps+catalog", "start");
    const l4t = Date.now();
    const gaps = analyzeGaps(extract);
    layers.push({
      layer: 4,
      name: "gaps+catalog",
      ok: true,
      durationMs: Date.now() - l4t,
      detail: `${gaps.blockers.length} blockers`,
    });

    // L5
    emit(5, "synthesize", "start");
    const l5t = Date.now();
    const raw = await layer5(client, opts.text, principles, extract, gaps, safety);
    layers.push({ layer: 5, name: "synthesize", ok: true, durationMs: Date.now() - l5t });

    // L6
    emit(6, "trust-post", "start");
    const l6t = Date.now();
    const plan = applyTrustPipeline({
      ...raw,
      id: `build-${Date.now()}`,
      generatedAt: new Date().toISOString(),
      sourceUrl: opts.sourceUrl,
      title: raw.title || extract.title,
      description: raw.description || extract.description,
      difficulty: raw.difficulty || "intermediate",
      estimatedTime: raw.estimatedTime || "2-4 hours",
      estimatedCost: raw.estimatedCost || "$20-50",
      parts: raw.parts || extract.parts.map((p, i) => ({
        id: `p-${i}`,
        name: p.name,
        specification: p.specification,
        quantity: p.quantity || 1,
        notes: p.notes,
      })),
      tools: raw.tools || extract.tools || [],
      steps: raw.steps || [],
      wiringConnections: raw.wiringConnections || [],
      structuredNets: netsFromLlm(raw as Partial<BuildPlan>),
      formSpec: formFromLlm(raw as Partial<BuildPlan>),
      scenePoses: posesFromLlm(raw as Partial<BuildPlan>),
      warnings: raw.warnings || [],
    } as BuildPlan);

    layers.push({ layer: 6, name: "trust-post", ok: true, durationMs: Date.now() - l6t });

    const meta: PipelineMeta = {
      layers,
      durationMs: Date.now() - t0,
      hazardTags,
      principles,
      mode: "six-layer",
    };

    return { ...plan, pipelineMeta: meta };
  } catch (err) {
    console.warn("Six-layer pipeline failed, falling back to single-pass:", err);
    // Single-pass is still a synthesis pass — keep the UI on that honest stage.
    emit(5, "synthesize", "start");
    const lft = Date.now();
    const raw = await singlePass(client, opts.text);
    layers.push({
      layer: 0,
      name: "single-pass-fallback",
      ok: true,
      durationMs: Date.now() - lft,
      detail: err instanceof Error ? err.message : "error",
    });

    const plan = applyTrustPipeline({
      ...raw,
      id: `build-${Date.now()}`,
      generatedAt: new Date().toISOString(),
      sourceUrl: opts.sourceUrl,
      title: raw.title || "Build plan",
      description: raw.description || "",
      difficulty: raw.difficulty || "intermediate",
      estimatedTime: raw.estimatedTime || "2-4 hours",
      estimatedCost: raw.estimatedCost || "$20-50",
      parts: raw.parts || [],
      tools: raw.tools || [],
      steps: raw.steps || [],
      wiringConnections: raw.wiringConnections || [],
      structuredNets: netsFromLlm(raw as Partial<BuildPlan>),
      formSpec: formFromLlm(raw as Partial<BuildPlan>),
      scenePoses: posesFromLlm(raw as Partial<BuildPlan>),
      warnings: raw.warnings || [],
    } as BuildPlan);

    return {
      ...plan,
      pipelineMeta: {
        layers,
        durationMs: Date.now() - t0,
        hazardTags,
        mode: "single-pass-fallback",
      },
    };
  }
}
