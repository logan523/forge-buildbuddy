/**
 * Runtime validation for LLM / untrusted structuredNets.
 * Soft-coerce: drop bad members/nets, never throw on parse.
 */
import { z } from "zod";
import type { StructuredNet, StructuredNetMember } from "@/lib/types";

const NET_CLASSES = ["power", "gnd", "signal", "i2c", "unknown"] as const;

export const StructuredNetMemberSchema = z.object({
  ref: z.string().trim().min(1).max(64),
  pin: z.string().trim().min(1).max(64),
  label: z.string().trim().max(128).optional(),
});

export const StructuredNetSchema = z.object({
  name: z.string().trim().min(1).max(64),
  members: z.array(StructuredNetMemberSchema).min(1).max(128),
  netClass: z.enum(NET_CLASSES).optional(),
  wireColor: z.string().trim().max(32).optional(),
});

export type StructuredNetsParseResult = {
  nets: StructuredNet[];
  /** Human-readable parse notes (dropped junk, coerced fields) */
  issues: string[];
  /** True when input was present but nothing usable survived */
  rejectedAll: boolean;
};

function coerceNetClass(raw: unknown): StructuredNet["netClass"] | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim().toLowerCase();
  if ((NET_CLASSES as readonly string[]).includes(t)) return t as StructuredNet["netClass"];
  // Common LLM synonyms
  if (t === "ground" || t === "gnd-net") return "gnd";
  if (t === "pwr" || t === "vcc" || t === "rail") return "power";
  if (t === "i²c" || t === "iic") return "i2c";
  if (t === "sig" || t === "data" || t === "gpio") return "signal";
  return "unknown";
}

function coerceMember(raw: unknown, path: string, issues: string[]): StructuredNetMember | null {
  if (!raw || typeof raw !== "object") {
    issues.push(`${path}: not an object`);
    return null;
  }
  const o = raw as Record<string, unknown>;
  // LLM sometimes uses designator / pad instead of ref / pin
  const ref = o.ref ?? o.designator ?? o.component ?? o.u;
  const pin = o.pin ?? o.pad ?? o.pinName ?? o.net_pin;
  const candidate = {
    ref: typeof ref === "string" || typeof ref === "number" ? String(ref) : ref,
    pin: typeof pin === "string" || typeof pin === "number" ? String(pin) : pin,
    label: typeof o.label === "string" ? o.label : undefined,
  };
  const r = StructuredNetMemberSchema.safeParse(candidate);
  if (!r.success) {
    issues.push(`${path}: ${r.error.issues.map((i) => i.message).join("; ")}`);
    return null;
  }
  return r.data;
}

function coerceNet(raw: unknown, index: number, issues: string[]): StructuredNet | null {
  if (!raw || typeof raw !== "object") {
    issues.push(`structuredNets[${index}]: not an object`);
    return null;
  }
  const o = raw as Record<string, unknown>;
  const nameRaw = o.name ?? o.net ?? o.netName;
  const name = typeof nameRaw === "string" || typeof nameRaw === "number" ? String(nameRaw).trim() : "";
  if (!name) {
    issues.push(`structuredNets[${index}]: missing name`);
    return null;
  }

  const membersRaw = o.members ?? o.pins ?? o.nodes;
  if (!Array.isArray(membersRaw)) {
    issues.push(`structuredNets[${index}] (${name}): members not an array`);
    return null;
  }

  const members: StructuredNetMember[] = [];
  membersRaw.forEach((m, mi) => {
    const cm = coerceMember(m, `structuredNets[${index}].members[${mi}]`, issues);
    if (cm) members.push(cm);
  });

  // Dedupe ref.pin within a net
  const seen = new Set<string>();
  const deduped = members.filter((m) => {
    const k = `${m.ref.toUpperCase()}.${m.pin.toUpperCase()}`;
    if (seen.has(k)) {
      issues.push(`structuredNets[${index}] (${name}): duplicate member ${k}`);
      return false;
    }
    seen.add(k);
    return true;
  });

  if (deduped.length === 0) {
    issues.push(`structuredNets[${index}] (${name}): no valid members`);
    return null;
  }

  const netClass = coerceNetClass(o.netClass ?? o.class ?? o.type);
  const wireColor =
    typeof o.wireColor === "string"
      ? o.wireColor.trim()
      : typeof o.color === "string"
        ? o.color.trim()
        : undefined;

  const candidate = {
    name,
    members: deduped,
    ...(netClass ? { netClass } : {}),
    ...(wireColor ? { wireColor } : {}),
  };

  const r = StructuredNetSchema.safeParse(candidate);
  if (!r.success) {
    issues.push(
      `structuredNets[${index}] (${name}): ${r.error.issues.map((i) => i.message).join("; ")}`
    );
    return null;
  }
  return r.data as StructuredNet;
}

/**
 * Parse untrusted structuredNets (LLM JSON, share links, demos).
 * Returns undefined nets when input is absent; empty nets + rejectedAll when all junk.
 */
export function parseStructuredNets(input: unknown): StructuredNetsParseResult {
  if (input == null) {
    return { nets: [], issues: [], rejectedAll: false };
  }
  if (!Array.isArray(input)) {
    return {
      nets: [],
      issues: ["structuredNets: expected array"],
      rejectedAll: true,
    };
  }
  if (input.length === 0) {
    return { nets: [], issues: [], rejectedAll: false };
  }

  const issues: string[] = [];
  const nets: StructuredNet[] = [];
  input.forEach((item, i) => {
    const n = coerceNet(item, i, issues);
    if (n) nets.push(n);
  });

  return {
    nets,
    issues,
    rejectedAll: nets.length === 0,
  };
}

/**
 * Sanitize plan.structuredNets in place for trust/pipeline.
 * Invalid input → undefined (fall back to free-text wiring).
 */
export function sanitizeStructuredNets(
  input: unknown
): { structuredNets?: StructuredNet[]; parseIssues: string[] } {
  const { nets, issues, rejectedAll } = parseStructuredNets(input);
  if (rejectedAll || (input != null && Array.isArray(input) && input.length > 0 && nets.length === 0)) {
    return {
      structuredNets: undefined,
      parseIssues: issues.length ? issues : ["structuredNets rejected"],
    };
  }
  if (nets.length === 0) {
    return { structuredNets: undefined, parseIssues: issues };
  }
  return { structuredNets: nets, parseIssues: issues };
}
