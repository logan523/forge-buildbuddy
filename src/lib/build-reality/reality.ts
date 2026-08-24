/**
 * Pure reducer over BuildReality. No I/O, no Date.now() hidden in logic —
 * callers pass timestamps only through the exported helpers, which stamp
 * once at the boundary. Invariants live here, not in the UI:
 *   - `verified` REQUIRES an evidence source (state machine row: planned →
 *     verified is unreachable; verified without evidence is unrepresentable).
 *   - every mutation bumps `revision` and appends one event (capped).
 */

import type {
  ActualPart,
  BuildReality,
  Endpoint,
  EvidenceSource,
  FormFactor,
  JointRecord,
  JointState,
  WireColorDecl,
} from "./types";
import { EVIDENCE_TIER, MAX_EVENTS, REALITY_SCHEMA_VERSION } from "./types";

export function emptyReality(planId: string, now = new Date().toISOString()): BuildReality {
  return {
    schemaVersion: REALITY_SCHEMA_VERSION,
    planId,
    revision: 0,
    formFactor: "solder",
    joints: {},
    wireColors: { byConnection: {}, byNet: {} },
    actualParts: {},
    events: [],
    updatedAt: now,
  };
}

function bump(r: BuildReality, kind: BuildReality["events"][number]["kind"], detail: string, now: string): BuildReality {
  const events = [...r.events, { at: now, kind, detail }];
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  return { ...r, revision: r.revision + 1, events, updatedAt: now };
}

/** Unordered endpoint identity (eng E2): sort by `${ref}:${pin}` before storing/comparing. */
export function sortEndpoints(a: Endpoint, b: Endpoint): [Endpoint, Endpoint] {
  const ka = `${a.ref}:${a.pin}`;
  const kb = `${b.ref}:${b.pin}`;
  return ka <= kb ? [a, b] : [b, a];
}

export function sameJointIdentity(x: [Endpoint, Endpoint], y: [Endpoint, Endpoint]): boolean {
  const [x1, x2] = sortEndpoints(x[0], x[1]);
  const [y1, y2] = sortEndpoints(y[0], y[1]);
  return x1.ref === y1.ref && x1.pin === y1.pin && x2.ref === y2.ref && x2.pin === y2.pin;
}

const VALID_TRANSITIONS: Record<JointState, JointState[]> = {
  planned: ["placed", "made", "removed"],
  placed: ["made", "planned", "removed"],
  made: ["verified", "failed", "removed", "planned"],
  verified: ["failed", "removed"],
  failed: ["made", "removed", "planned"],
  removed: ["planned"],
};

export function declareColor(
  r: BuildReality,
  opts: {
    hex: string;
    name: string;
    label?: string;
    connectionId?: string;
    netName?: string;
  },
  now = new Date().toISOString()
): BuildReality {
  const decl: WireColorDecl = { hex: opts.hex, name: opts.name, label: opts.label, at: now };
  const byConnection = { ...r.wireColors.byConnection };
  const byNet = { ...r.wireColors.byNet };
  if (opts.connectionId) byConnection[opts.connectionId] = decl;
  if (opts.netName) byNet[opts.netName.toLowerCase()] = decl;
  const target = [opts.netName && `net ${opts.netName}`, opts.connectionId && `wire ${opts.connectionId}`]
    .filter(Boolean)
    .join(" + ");
  return bump(
    { ...r, wireColors: { byConnection, byNet } },
    "color-declared",
    `${target} = ${opts.label ?? opts.name}`,
    now
  );
}

export function clearColor(
  r: BuildReality,
  opts: { connectionId?: string; netName?: string },
  now = new Date().toISOString()
): BuildReality {
  const byConnection = { ...r.wireColors.byConnection };
  const byNet = { ...r.wireColors.byNet };
  if (opts.connectionId) delete byConnection[opts.connectionId];
  if (opts.netName) delete byNet[opts.netName.toLowerCase()];
  return bump(
    { ...r, wireColors: { byConnection, byNet } },
    "color-cleared",
    [opts.netName, opts.connectionId].filter(Boolean).join(" + "),
    now
  );
}

export function setJointState(
  r: BuildReality,
  joint: {
    connectionId: string;
    netName: string;
    netClass: string;
    endpoints: [Endpoint, Endpoint];
  },
  state: JointState,
  evidence?: { source: EvidenceSource },
  now = new Date().toISOString()
): BuildReality {
  const existing = r.joints[joint.connectionId];
  const from: JointState = existing?.state ?? "planned";
  if (state === "verified" && !evidence) {
    // Invariant: verified requires evidence. Refuse silently-stronger states.
    return r;
  }
  if (from !== state && !VALID_TRANSITIONS[from].includes(state)) {
    return r;
  }
  const rec: JointRecord = {
    connectionId: joint.connectionId,
    netName: joint.netName,
    netClass: joint.netClass,
    endpoints: sortEndpoints(joint.endpoints[0], joint.endpoints[1]),
    state,
    evidence: evidence
      ? { source: evidence.source, tier: EVIDENCE_TIER[evidence.source], at: now }
      : state === "verified"
        ? existing?.evidence
        : undefined,
    at: now,
  };
  return bump(
    { ...r, joints: { ...r.joints, [joint.connectionId]: rec } },
    "joint-state",
    `${joint.connectionId} → ${state}${evidence ? ` (${evidence.source})` : ""}`,
    now
  );
}

export function recordActualPart(r: BuildReality, part: Omit<ActualPart, "at">, now = new Date().toISOString()): BuildReality {
  const rec: ActualPart = { ...part, at: now };
  return bump(
    { ...r, actualParts: { ...r.actualParts, [part.planPartId]: rec } },
    "part-recorded",
    `${part.planPartId} = ${part.name}`,
    now
  );
}

export function setBoardSpec(r: BuildReality, boardId: string, now = new Date().toISOString()): BuildReality {
  const next: BuildReality = {
    ...r,
    formFactor: "breadboard",
    breadboard: { boardId, declarations: r.breadboard?.declarations ?? {} },
  };
  return bump(next, "form-factor", `breadboard: ${boardId}`, now);
}

export function declareBreadboardHole(
  r: BuildReality,
  decl: { key: string; netName: string; netClass: string; label: string; hole: import("../breadboard/spec").HoleRef },
  now = new Date().toISOString()
): BuildReality {
  if (!r.breadboard) return r;
  const prev = r.breadboard.declarations[decl.key];
  const declarations = {
    ...r.breadboard.declarations,
    [decl.key]: {
      ...decl,
      at: now,
      history: prev ? [...prev.history, { hole: prev.hole, at: prev.at }] : [],
    },
  };
  return bump(
    { ...r, breadboard: { ...r.breadboard, declarations } },
    "joint-state",
    `${decl.label} → ${"row" in decl.hole ? `${decl.hole.row}${decl.hole.column}` : decl.hole.railId}`,
    now
  );
}

export function clearBreadboardHole(r: BuildReality, key: string, now = new Date().toISOString()): BuildReality {
  if (!r.breadboard || !r.breadboard.declarations[key]) return r;
  const declarations = { ...r.breadboard.declarations };
  delete declarations[key];
  return bump({ ...r, breadboard: { ...r.breadboard, declarations } }, "joint-state", `cleared ${key}`, now);
}

export function setFormFactor(r: BuildReality, formFactor: FormFactor, now = new Date().toISOString()): BuildReality {
  if (r.formFactor === formFactor) return r;
  return bump({ ...r, formFactor }, "form-factor", formFactor, now);
}

/** Resolve the builder's declared color for a connection (connection beats net). */
export function colorForConnection(
  r: BuildReality | undefined,
  connectionId: string,
  netName: string
): WireColorDecl | undefined {
  if (!r) return undefined;
  return r.wireColors.byConnection[connectionId] ?? r.wireColors.byNet[netName.toLowerCase()];
}
