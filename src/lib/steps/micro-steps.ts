/**
 * Micro-step compiler — fans a wiring step's CompiledConnections into an
 * ordered, one-at-a-time "find → do → verify" sequence for total beginners.
 *
 * Derived from the connection truth (never LLM prose), so the per-wire
 * specificity can't drift from the netlist. Silkscreen labels only (honesty
 * pack — vendor pin ORDER varies, so we name the printed label, never a
 * physical position). Order is safest-first: grounds, then power, then signal.
 */

import type { CompiledConnection, CompiledCheck, MicroStep } from "@/lib/types";
import type { SymptomId } from "@/lib/unstick";

// Wire grounds first (a floating ground causes the weirdest bugs), then power,
// then the data/signal lines.
const CLASS_RANK: Record<string, number> = { gnd: 0, ground: 0, power: 1, i2c: 2, signal: 3 };
function rank(netClass: string): number {
  return CLASS_RANK[netClass.toLowerCase()] ?? 4;
}

/** Deep-link the inline "doesn't look right?" rescue to the symptom this wire causes when wrong. */
function rescueFor(netClass: string): SymptomId | undefined {
  const c = netClass.toLowerCase();
  if (c === "i2c") return "blank_display";
  if (c === "signal") return "touch_dead";
  if (c === "power" || c === "gnd" || c === "ground") return "no_power";
  return undefined;
}

export function buildMicroSteps(
  connections: CompiledConnection[],
  checks: CompiledCheck[],
  refToPartId?: Map<string, string>
): MicroStep[] {
  const ordered = [...connections].sort((a, b) => rank(a.netClass) - rank(b.netClass));
  const total = ordered.length;

  return ordered.map((c, i): MicroStep => {
    const isPower = /power/i.test(c.netClass);
    // Voltage band comes from the step's existing multimeter check for this device.
    const voltageCheck = isPower
      ? checks.find((ck) => ck.kind === "multimeter" && ck.instruction.includes(c.toLabel))
      : undefined;

    return {
      id: c.id,
      index: i + 1,
      total,
      colorName: c.colorName,
      colorHex: c.colorHex,
      netName: c.netName,
      fromPartId: refToPartId?.get(c.fromRef),
      toPartId: refToPartId?.get(c.toRef),
      fromLabel: c.fromLabel,
      fromPin: c.fromPin,
      toLabel: c.toLabel,
      toPin: c.toPin,
      netClass: c.netClass,
      // verb-first, both endpoints by printed label
      action: `Solder the ${c.colorName} wire from ${c.fromLabel} pin ${c.fromPin} to ${c.toLabel} pin ${c.toPin}.`,
      verify: {
        tug: "Gently tug the wire — it shouldn't move. If it wiggles, reheat the joint and add a little more solder.",
        continuity: `Set your multimeter to continuity (the beep mode). Touch one probe to ${c.fromPin} and the other to ${c.toPin} — it should beep.`,
        ...(voltageCheck ? { voltage: `Once powered, ${c.toPin} ↔ GND should read ${voltageCheck.expected}.` } : {}),
      },
      showTechnique: i === 0, // first wire of the step gets the solder technique inset
      rescueSymptomId: rescueFor(c.netClass),
    };
  });
}
