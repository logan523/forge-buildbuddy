/**
 * Assembly Story bones — phases, joints, parts (not UI "layers").
 * Pure types + helpers; no WebGL.
 */

export interface PartAnchorDef {
  /** e.g. VIN, GND, SDA, cage-mid-L */
  name: string;
  /** Local mm offset from part origin */
  local: [number, number, number];
}

export interface PartDef {
  id: string;
  label: string;
  /** Scene node id (matches buildSatClockScene3D node ids) */
  nodeId: string;
  /** Form layer id for backward compat with existing viewer */
  layer: string;
  colorKey?: string;
  anchors?: PartAnchorDef[];
}

export interface JointDef {
  id: string;
  parentPartId: string;
  childPartId: string;
  /** Unit-ish explode axis in world space */
  axis: [number, number, number];
  /** mm distance at full explode */
  explodeDistance: number;
}

export interface PhaseDef {
  id: string;
  index: number;
  title: string;
  callout: string;
  /** Part ids introduced at this phase (cumulative through resolve) */
  addsParts: string[];
  /** Joint ids that become active */
  addsJoints: string[];
  /** Net name fragments that light up when both ends present */
  addsNets: string[];
  /** Prefer camera when scrub lands on this phase */
  cameraHint?: {
    position: [number, number, number];
    target: [number, number, number];
  };
}

export interface AssemblyRecipe {
  templateId: string;
  productLabel: string;
  parts: PartDef[];
  joints: JointDef[];
  phases: PhaseDef[];
  /** Map step mediaKind or keyword → phase index */
  stepToPhase?: Record<string, number>;
}

export interface AssemblyFrame {
  templateId: string;
  phaseIndex: number;
  phase: PhaseDef;
  /** Continuous scrub 0 … phases.length-1 */
  scrub: number;
  /** Part ids present at this frame */
  presentPartIds: string[];
  /** Node ids present */
  presentNodeIds: string[];
  /** Joint-based explode offsets keyed by child part id (mm world delta) */
  jointOffsets: Record<string, [number, number, number]>;
  /** Active net name fragments for harness filter */
  activeNetHints: string[];
  callout: string;
  cameraHint?: PhaseDef["cameraHint"];
}

function normAxis(a: [number, number, number]): [number, number, number] {
  const len = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / len, a[1] / len, a[2] / len];
}

/**
 * Resolve assembly frame at continuous scrub (0 = start of phase 0, N-1 = complete).
 * Integer phase floor; fractional part drives joint settle for the *next* phase's joints.
 */
export function resolveAssemblyFrame(
  recipe: AssemblyRecipe,
  scrub: number
): AssemblyFrame {
  const phases = recipe.phases;
  const max = Math.max(0, phases.length - 1);
  const s = Math.max(0, Math.min(max, scrub));
  const phaseIndex = Math.min(max, Math.floor(s + 1e-9));
  const phase = phases[phaseIndex]!;
  const frac = s - phaseIndex; // 0..1 within current phase toward next

  // Cumulative parts through this phase (inclusive)
  const presentPartIds = new Set<string>();
  for (let i = 0; i <= phaseIndex; i++) {
    for (const p of phases[i]!.addsParts) presentPartIds.add(p);
  }

  // Joints: all joints from phases 0..phaseIndex fully seated;
  // joints introduced at phaseIndex+1 partially offset if frac > 0
  const jointOffsets: Record<string, [number, number, number]> = {};
  const activeJoints: JointDef[] = [];

  for (let i = 0; i <= phaseIndex; i++) {
    for (const jid of phases[i]!.addsJoints) {
      const j = recipe.joints.find((x) => x.id === jid);
      if (j) activeJoints.push(j);
    }
  }

  // Fully assembled joints → zero offset
  for (const j of activeJoints) {
    jointOffsets[j.childPartId] = [0, 0, 0];
  }

  // Parts not yet present: full explode offset if we know a joint
  for (const part of recipe.parts) {
    if (presentPartIds.has(part.id)) continue;
    const j = recipe.joints.find((x) => x.childPartId === part.id);
    if (j) {
      const ax = normAxis(j.axis);
      const d = j.explodeDistance;
      jointOffsets[part.id] = [ax[0] * d, ax[1] * d, ax[2] * d];
    }
  }

  // During fractional scrub into next phase, ease next joints in from explode → rest
  if (frac > 0 && phaseIndex < max) {
    const next = phases[phaseIndex + 1]!;
    for (const pid of next.addsParts) presentPartIds.add(pid);
    for (const jid of next.addsJoints) {
      const j = recipe.joints.find((x) => x.id === jid);
      if (!j) continue;
      const ax = normAxis(j.axis);
      const d = j.explodeDistance * (1 - frac);
      jointOffsets[j.childPartId] = [ax[0] * d, ax[1] * d, ax[2] * d];
    }
  }

  // Global explode t: optional extra peel — not applied here (UI owns explode slider)

  const activeNetHints = new Set<string>();
  for (let i = 0; i <= phaseIndex; i++) {
    for (const n of phases[i]!.addsNets) activeNetHints.add(n.toLowerCase());
  }
  if (frac > 0 && phaseIndex < max) {
    for (const n of phases[phaseIndex + 1]!.addsNets) activeNetHints.add(n.toLowerCase());
  }

  const presentNodeIds = recipe.parts
    .filter((p) => presentPartIds.has(p.id))
    .map((p) => p.nodeId);

  return {
    templateId: recipe.templateId,
    phaseIndex,
    phase,
    scrub: s,
    presentPartIds: [...presentPartIds],
    presentNodeIds,
    jointOffsets,
    activeNetHints: [...activeNetHints],
    callout: phase.callout,
    cameraHint: phase.cameraHint,
  };
}

/** Apply joint offsets + optional global explode onto scene node positions (pure). */
export function applyFrameToNodes<
  T extends { id: string; position: [number, number, number]; explodeDir?: [number, number, number] },
>(
  nodes: T[],
  recipe: AssemblyRecipe,
  frame: AssemblyFrame,
  /** 0–1 extra disassembly along joint axes */
  explode = 0
): T[] {
  const partByNode = new Map(recipe.parts.map((p) => [p.nodeId, p]));
  return nodes.map((n) => {
    const part = partByNode.get(n.id);
    if (!part) return n;
    if (!frame.presentPartIds.includes(part.id) && !frame.presentNodeIds.includes(n.id)) {
      // Keep node but caller may hide; still apply offset for ghost
    }
    const baseOff = frame.jointOffsets[part.id] || ([0, 0, 0] as [number, number, number]);
    let [dx, dy, dz] = baseOff;
    if (explode > 0) {
      const j = recipe.joints.find((x) => x.childPartId === part.id);
      if (j) {
        const ax = normAxis(j.axis);
        const d = j.explodeDistance * explode;
        dx += ax[0] * d;
        dy += ax[1] * d;
        dz += ax[2] * d;
      } else if (n.explodeDir) {
        const [ex, ey, ez] = n.explodeDir;
        const len = Math.hypot(ex, ey, ez) || 1;
        const d = 28 * explode;
        dx += (ex / len) * d;
        dy += (ey / len) * d;
        dz += (ez / len) * d;
      }
    }
    if (dx === 0 && dy === 0 && dz === 0) return n;
    return {
      ...n,
      position: [n.position[0] + dx, n.position[1] + dy, n.position[2] + dz] as [
        number,
        number,
        number,
      ],
    };
  });
}

export function partPresent(frame: AssemblyFrame, partId: string): boolean {
  return frame.presentPartIds.includes(partId);
}

export function nodePresent(frame: AssemblyFrame, nodeId: string): boolean {
  return frame.presentNodeIds.includes(nodeId);
}

/** Map build step → phase index via mediaKind / title keywords. */
export function phaseIndexForStep(
  recipe: AssemblyRecipe,
  step?: { title?: string; description?: string; mediaKind?: string } | null
): number {
  if (!step) return recipe.phases.length - 1;
  const mk = step.mediaKind || "";
  if (recipe.stepToPhase?.[mk] != null) return recipe.stepToPhase[mk]!;
  const t = `${step.title || ""} ${step.description || ""} ${mk}`.toLowerCase();
  if (/stand|base|foundation|bamboo/.test(t)) return 0;
  if (/brass|cage|wire.?frame|bend/.test(t)) return 1;
  if (/battery|tp4056|charg|16340|power/.test(t)) return 2;
  if (/esp|mcu|upload|firmware|usb/.test(t) && !/oled|display/.test(t)) return 3;
  if (/oled|display|ssd1306|desolder/.test(t)) return 4;
  if (/touch|ttp|sensor|sht|temp|humid/.test(t)) return 5;
  if (/solar|wing|panel/.test(t)) return 6;
  if (/final|complete|assembl/.test(t)) return 7;
  return Math.min(7, recipe.phases.length - 1);
}
