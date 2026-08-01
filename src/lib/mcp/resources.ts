/**
 * MCP-style resources — on-demand rules (MathWorks pattern).
 * Agents pull these instead of stuffing authorities into every prompt.
 */

import { NET_CLASS_HEX, WIRE_NAME_HEX, netColorFor, wireColorName } from "@/lib/wire-colors";

export interface ForgeResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  /** Body as text (markdown or JSON string). */
  text: string;
}

function wireColorAuthorityMd(): string {
  const classRows = Object.entries(NET_CLASS_HEX)
    .map(([k, hex]) => `| ${k} | ${wireColorName(hex)} | \`${hex}\` |`)
    .join("\n");
  return [
    "# Wire color authority",
    "",
    "Every surface that colors a wire resolves through this table.",
    "",
    "## Precedence",
    "",
    "1. Well-known net name: SDA → blue, SCL → yellow",
    "2. Net class standard (class wins over LLM wireColor on classed nets)",
    "3. Plan-supplied wireColor only for unclassed `other` nets",
    "4. Fallback grey",
    "",
    "## Net classes",
    "",
    "| Class | Color | Hex |",
    "|-------|-------|-----|",
    classRows,
    "",
    "## Examples",
    "",
    `- I2C_SDA → ${wireColorName(netColorFor("i2c", undefined, "I2C_SDA"))}`,
    `- I2C_SCL → ${wireColorName(netColorFor("i2c", undefined, "I2C_SCL"))}`,
    `- power → ${wireColorName(netColorFor("power", undefined, "3V3"))}`,
    `- gnd → ${wireColorName(netColorFor("gnd", undefined, "GND"))}`,
    "",
    "Source: `src/lib/wire-colors.ts`",
    "",
  ].join("\n");
}

function pinLabelPolicyMd(): string {
  return [
    "# Pin label policy",
    "",
    "- Name pins by **silkscreen labels only** (e.g. GPIO4, SDA, GND).",
    "- Never use ordinal/physical positions (\"leftmost pin\", \"third from the right\").",
    "- Vendor pin order varies on commodity modules; ordinal phrases reverse power.",
    "- Compiled connections and micro-steps are the only pin/color truth for agents.",
    "",
    "Source: `src/lib/steps/compile.ts`, instruction overhaul design.",
    "",
  ].join("\n");
}

function liIonSafetyMd(): string {
  return [
    "# Li-ion safety (non-negotiable)",
    "",
    "- Never suggest removing a cell's insulating wrap.",
    "- Never suggest bypassing protection circuits or charging unprotected packs.",
    "- Never work on a circuit while powered for wiring changes.",
    "- Li-ion without protection is blocked by hardcoded validators — do not override.",
    "",
    "Source: trust/safety validators + step-help system rules.",
    "",
  ].join("\n");
}

function gradeMeaningsMd(): string {
  return [
    "# Step / connection grade meanings",
    "",
    "| Grade | Meaning |",
    "|-------|---------|",
    "| consistent | 2-member net rendered exactly as in the model |",
    "| derived | Star/hub leg of a multi-member net |",
    "| unavailable | No electrical model — do not claim verified wiring |",
    "",
    "Never say \"verified\" unless a live check (serial I2C, etc.) actually passed.",
    "",
  ].join("\n");
}

/** All resources the MCP server can list/read. */
export function listForgeResources(): Omit<ForgeResource, "text">[] {
  return FORGE_RESOURCES.map(({ uri, name, description, mimeType }) => ({
    uri,
    name,
    description,
    mimeType,
  }));
}

export function readForgeResource(uri: string): ForgeResource | null {
  const hit = FORGE_RESOURCES.find((r) => r.uri === uri || r.uri === normalizeUri(uri));
  return hit ?? null;
}

function normalizeUri(uri: string): string {
  return uri.replace(/^resource:\/\//, "forge://").replace(/^forge:\/\//, "forge://");
}

const FORGE_RESOURCES: ForgeResource[] = [
  {
    uri: "forge://wire-color-authority",
    name: "Wire color authority",
    description: "SDA/SCL and net-class color table — single source for text, 2D, 3D.",
    mimeType: "text/markdown",
    text: wireColorAuthorityMd(),
  },
  {
    uri: "forge://pin-label-only",
    name: "Pin label policy",
    description: "Silkscreen labels only; no ordinal pin positions.",
    mimeType: "text/markdown",
    text: pinLabelPolicyMd(),
  },
  {
    uri: "forge://li-ion-rules",
    name: "Li-ion safety rules",
    description: "Hard safety rules agents must not override.",
    mimeType: "text/markdown",
    text: liIonSafetyMd(),
  },
  {
    uri: "forge://step-grade-meanings",
    name: "Grade meanings",
    description: "consistent vs derived vs unavailable — honesty vocabulary.",
    mimeType: "text/markdown",
    text: gradeMeaningsMd(),
  },
  {
    uri: "forge://wire-color-authority.json",
    name: "Wire colors (JSON)",
    description: "Machine-readable class and name hex maps.",
    mimeType: "application/json",
    text: JSON.stringify(
      {
        names: WIRE_NAME_HEX,
        classes: NET_CLASS_HEX,
        wellKnown: { sda: "blue", scl: "yellow" },
      },
      null,
      2
    ),
  },
];
