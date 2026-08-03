import type { BuildPlan } from "@/lib/types";
import type { ElectricalModel, ErcReport, ErcViolation } from "./types";

/**
 * Electrical Rules Check (schematic-level).
 * Research basis: KiCad/Altium-style ERC — connectivity, power domains,
 * pin conflicts, missing power — scoped to hobby modules.
 *
 * error  → blocks PCB export & unacked power-on
 * warning → surfaces; publish kit discouraged
 * info    → claim hygiene / assumptions
 */

function push(list: ErcViolation[], v: ErcViolation) {
  list.push(v);
}

export function runErc(
  model: Omit<ElectricalModel, "erc">,
  plan: BuildPlan
): ErcReport {
  const errors: ErcViolation[] = [];
  const warnings: ErcViolation[] = [];
  const infos: ErcViolation[] = [];

  const byRef = new Map(model.components.map((c) => [c.ref, c]));

  // --- Unbound wiring ---
  for (const e of model.unboundEdges) {
    push(warnings, {
      id: `unbound-${e.from}-${e.to}`.slice(0, 80),
      severity: "warning",
      rule: "NET_UNBOUND",
      title: "Wiring edge not bound to components",
      detail: `${e.from} → ${e.to} (${e.reason}). ERC cannot fully check this net.`,
      mitigation: "Use clear device names in wiring (e.g. ESP32-C3 GPIO4, OLED SDA).",
    });
  }

  // Battery / charge pads are not "5V sources" — VIN@5 domain next to a cell is normal.
  const isBatteryishPad = (pin: string) =>
    /^(B\+|B-|BAT\+|BAT-|OUT\+|OUT-|\+|IN\+)$/i.test(pin) || pin === "-";

  // A "5V"/"VIN" pin on a board that regulates its own logic (logicVoltage 3.3,
  // i.e. it has an onboard LDO) is a power INPUT — it accepts ~3–6V and drops it
  // to 3.3V — not a 5V supply SOURCE. Such a pin must not, by itself, make its
  // net a "5V rail": the net's real voltage is set by whatever feeds the input
  // (e.g. a ≤4.2V battery through the charger's protected OUT). Without this, a
  // battery-powered ESP32-C3 (silkscreen "5V" pin) falsely trips VOLTAGE_DOMAIN
  // on every 3.7V-rated part sharing that rail.
  const isRegulatedInputPin = (m: { ref: string; pin: string }) => {
    if (!/^(5V|VIN)$/i.test(m.pin)) return false;
    return byRef.get(m.ref)?.logicVoltage === 3.3;
  };

  // --- Voltage domain: true 5V rails vs 3.3V-only pins ---
  for (const net of model.nets) {
    // Explicit 5V name or a silkscreen 5V pin (not VIN/BAT, nor a regulated input)
    const hasExplicit5vPin = net.members.some((m) => /^5V$/i.test(m.pin) && !isRegulatedInputPin(m));
    const railIs5 =
      net.name === "5V" ||
      hasExplicit5vPin ||
      (net.netClass === "power" &&
        net.members.some(
          (m) =>
            m.role === "power" &&
            (m.domainV ?? 0) >= 4.8 &&
            !isBatteryishPad(m.pin) &&
            !/^VIN$/i.test(m.pin) &&
            !isRegulatedInputPin(m)
        ));

    if (railIs5) {
      for (const m of net.members) {
        if (m.role === "gnd") continue;
        // Don't scold battery cells / BAT pads for sitting on a mixed power net with VIN
        if (isBatteryishPad(m.pin) && !hasExplicit5vPin && net.name !== "5V") continue;
        const max = m.maxVoltage;
        if (max != null && max < 4.5) {
          const comp = byRef.get(m.ref);
          push(errors, {
            id: `vdom-5v-${m.ref}-${m.pin}`,
            severity: "error",
            rule: "VOLTAGE_DOMAIN",
            title: `5V rail on ${m.ref}.${m.pin} (max ${max}V)`,
            detail: `Net ${net.name} looks like a 5V domain but ${m.ref}.${m.pin}${comp ? ` (${comp.name})` : ""} is limited to ${max}V. This can destroy 3.3V-only silicon (ESP32, many OLEDs, nRF24).`,
            mitigation: "Move this pin to 3.3V, or insert a level shifter / regulator.",
            refs: [m.ref],
            nets: [net.name],
          });
        }
      }
    }

    // Signal net: actual ~5V domain driver into fragile pin (maxVoltage is abs-max, not domain)
    if (net.netClass === "signal" || net.netClass === "i2c") {
      const high = net.members.filter((m) => (m.domainV ?? 0) >= 4.5);
      const fragile = net.members.filter(
        (m) => m.maxVoltage != null && m.maxVoltage < 4.0 && (m.domainV ?? 3.3) < 4.0
      );
      if (high.length && fragile.length) {
        // HC-SR04 ECHO classic: 5V-domain digital_out into 3.3V MCU
        const echoLike = net.members.some((m) => /ECHO/i.test(m.pin));
        if (echoLike || high.some((h) => h.role === "digital_out" || h.role === "digital_io")) {
          for (const f of fragile) {
            push(errors, {
              id: `vdom-sig-${net.name}-${f.ref}`,
              severity: "error",
              rule: "VOLTAGE_DOMAIN_SIGNAL",
              title: `Possible 5V signal into ${f.ref}.${f.pin}`,
              detail: `Net ${net.name} mixes a higher-voltage domain driver with a pin rated ${f.maxVoltage}V.`,
              mitigation: "Use a resistor divider or level shifter on the high-voltage output (e.g. HC-SR04 ECHO).",
              refs: [f.ref],
              nets: [net.name],
            });
          }
        }
      }
    }
  }

  // --- I2C bus presence ---
  const i2cParts = model.components.filter((c) =>
    c.pins.some((p) => p.role === "i2c_sda" || p.role === "i2c_scl")
  );
  if (i2cParts.length >= 1) {
    const sda = model.nets.find((n) => n.name === "SDA");
    const scl = model.nets.find((n) => n.name === "SCL");
    if (!sda || sda.members.length < 2) {
      push(warnings, {
        id: "i2c-sda-missing",
        severity: "warning",
        rule: "I2C_BUS",
        title: "I2C devices present but SDA net incomplete",
        detail: "Parts with SDA pins exist, but no multi-member SDA net was derived from wiring.",
        mitigation: "Wire all SDA pins to one net (shared bus) and name endpoints clearly.",
        refs: i2cParts.map((c) => c.ref),
      });
    }
    if (!scl || scl.members.length < 2) {
      push(warnings, {
        id: "i2c-scl-missing",
        severity: "warning",
        rule: "I2C_BUS",
        title: "I2C devices present but SCL net incomplete",
        detail: "Parts with SCL pins exist, but no multi-member SCL net was derived from wiring.",
        mitigation: "Wire all SCL pins to one shared clock net.",
        refs: i2cParts.map((c) => c.ref),
      });
    }
    // Pull-up awareness (info)
    const text = `${plan.title} ${plan.description} ${(plan.parts || []).map((p) => p.name).join(" ")}`.toLowerCase();
    if (!/pull-?up/.test(text)) {
      push(infos, {
        id: "i2c-pullup",
        severity: "info",
        rule: "I2C_PULLUP",
        title: "I2C pull-ups not mentioned",
        detail: "I2C requires pull-ups on SDA/SCL (often onboard modules). Not verified by netlist alone.",
        mitigation: "If the bus is flaky, add 4.7kΩ to 3.3V on SDA and SCL.",
      });
    }
  }

  // --- GND connectivity for multi-IC ---
  const active = model.components.filter((c) => !c.isLithiumCell);
  if (active.length >= 2) {
    // A module counts as grounded if it sits on ANY ground-class net — not only
    // the one named "GND". Protected power boards deliberately split ground into
    // separate domains (e.g. a TP4056's B- vs OUT-, bridged internally by its
    // protection FET), so the charge-side ground and the load-side ground are
    // different nets that are still one shared reference through the board.
    const gndNets = model.nets.filter((n) => n.name === "GND" || n.netClass === "gnd");
    const groundedRefs = new Set(gndNets.flatMap((n) => n.members.map((m) => m.ref)));
    const missingGnd = active.filter((c) => c.pins.some((p) => p.role === "gnd") && !groundedRefs.has(c.ref));
    if (missingGnd.length > 0 && gndNets.length > 0) {
      push(warnings, {
        id: "gnd-incomplete",
        severity: "warning",
        rule: "GND_CONNECTIVITY",
        title: "Some modules not on any GND net",
        detail: `No GND wiring derived for: ${missingGnd.map((c) => c.ref).join(", ")}. Shared ground is mandatory.`,
        mitigation: "Connect every module ground to a common ground (directly, or through the charger's ground pads).",
        refs: missingGnd.map((c) => c.ref),
        nets: ["GND"],
      });
    }
    if (gndNets.length === 0 && active.length >= 2) {
      push(errors, {
        id: "gnd-missing",
        severity: "error",
        rule: "GND_CONNECTIVITY",
        title: "No GND net derived from wiring",
        detail: "Multiple active components but ERC found no ground net. This is almost always wrong.",
        mitigation: "Add explicit GND connections between MCU and every module.",
      });
    }
  }

  // --- Li-ion charge topology ---
  const cells = model.components.filter((c) => c.isLithiumCell);
  const protectors = model.components.filter((c) => c.providesChargeProtection);
  if (cells.length > 0 && protectors.length === 0) {
    push(errors, {
      id: "lipo-no-protector",
      severity: "error",
      rule: "LIPO_PROTECTION",
      title: "Lithium cell without charge-protection component",
      detail: "Cell present in electrical model but no TP4056/BMS/protector module matched.",
      mitigation: "Add a protected TP4056 (DW01) or 1S BMS; never charge a bare cell from USB.",
      refs: cells.map((c) => c.ref),
    });
  }
  if (cells.length > 0 && protectors.length > 0) {
    // Soft check: cell should share a net with protector B+/BAT+
    const cellRefs = new Set(cells.map((c) => c.ref));
    const protRefs = new Set(protectors.map((c) => c.ref));
    let linked = false;
    for (const net of model.nets) {
      const refs = new Set(net.members.map((m) => m.ref));
      const hasCell = [...cellRefs].some((r) => refs.has(r));
      const hasProt = [...protRefs].some((r) => refs.has(r));
      if (hasCell && hasProt) linked = true;
    }
    if (!linked && model.nets.length > 0) {
      push(warnings, {
        id: "lipo-topology",
        severity: "warning",
        rule: "LIPO_TOPOLOGY",
        title: "Cell and charger may not share a net",
        detail: "Could not prove battery ± connects to charger BAT/B pads from wiring text.",
        mitigation: "Wire cell +/− only to charger BAT pads (or protected holder), not raw USB.",
        refs: [...cellRefs, ...protRefs],
      });
    }
  }

  // --- Output-output conflicts (digital_out on same signal net) ---
  for (const net of model.nets) {
    if (net.netClass === "power" || net.netClass === "gnd" || net.netClass === "i2c") continue;
    const outs = net.members.filter((m) => m.role === "digital_out");
    if (outs.length >= 2) {
      push(warnings, {
        id: `out-out-${net.name}`,
        severity: "warning",
        rule: "OUTPUT_CONTENTION",
        title: `Multiple outputs on net ${net.name}`,
        detail: `Outputs: ${outs.map((o) => `${o.ref}.${o.pin}`).join(", ")}. Contending drivers can damage pins.`,
        mitigation: "Ensure only one driver owns the net, or use open-drain / bus protocol.",
        refs: outs.map((o) => o.ref),
        nets: [net.name],
      });
    }
  }

  // --- Assumed pinouts ---
  for (const c of model.components) {
    if (c.pinoutGrade === "assumed") {
      push(infos, {
        id: `assumed-${c.ref}`,
        severity: "info",
        rule: "PINOUT_ASSUMED",
        title: `${c.ref} pinout is ASSUMED`,
        detail: `${c.name} is not high-confidence catalog-matched. Pin roles may be wrong.`,
        mitigation: "Verify silkscreen against a datasheet before power-on.",
        refs: [c.ref],
      });
    }
  }

  // --- Empty model ---
  if (model.components.length === 0) {
    push(infos, {
      id: "empty-model",
      severity: "info",
      rule: "EMPTY",
      title: "No electrical components modeled",
      detail: "Plan has no non-mechanical parts for ERC.",
      mitigation: "Add electronic parts to the BOM.",
    });
  }

  // --- Pad-level: every net member pin must exist on component (no synthetic unknowns for export) ---
  let padErrors = 0;
  for (const net of model.nets) {
    for (const m of net.members) {
      const comp = byRef.get(m.ref);
      if (!comp) continue;
      const known = comp.pins.some((p) => p.name.toUpperCase() === m.pin.toUpperCase());
      const isSynthGpio = /^GPIO\d+$/i.test(m.pin) && (comp.catalogId?.includes("esp32") || /esp32/i.test(comp.name));
      if (!known && !isSynthGpio && m.role === "unknown") {
        padErrors++;
        push(errors, {
          id: `pad-unknown-${m.ref}-${m.pin}`,
          severity: "error",
          rule: "PAD_UNKNOWN",
          title: `Unknown pad ${m.ref}.${m.pin}`,
          detail: `Net ${net.name} references a pin that is not on the component pinout and is not a known MCU GPIO.`,
          mitigation: "Fix structured net member pin name to match catalog silkscreen (VCC/GND/SDA/SCL/…).",
          refs: [m.ref],
          nets: [net.name],
        });
      }
    }
  }

  // --- Pad-level: same ref+pin on two different nets (short) ---
  const pinToNets = new Map<string, string[]>();
  for (const net of model.nets) {
    for (const m of net.members) {
      const k = `${m.ref}.${m.pin.toUpperCase()}`;
      const list = pinToNets.get(k) || [];
      if (!list.includes(net.name)) list.push(net.name);
      pinToNets.set(k, list);
    }
  }
  for (const [pinKey, netNames] of pinToNets) {
    if (netNames.length >= 2) {
      // Power/gnd aliases can be OK if both gnd-class — still flag signal multi-net
      const classes = netNames.map((n) => model.nets.find((x) => x.name === n)?.netClass);
      if (classes.every((c) => c === "gnd" || c === "power")) continue;
      push(errors, {
        id: `pad-multi-net-${pinKey}`,
        severity: "error",
        rule: "PAD_MULTI_NET",
        title: `Pad ${pinKey} appears on multiple nets`,
        detail: `Nets: ${netNames.join(", ")}. A pin cannot belong to disjoint nets (short or labeling error).`,
        mitigation: "Merge net names or remove the incorrect membership.",
        nets: netNames,
      });
    }
  }

  // --- MPN freeze coverage (info) ---
  for (const c of model.components) {
    const part = (plan.parts || []).find((p) => p.id === c.partId);
    if (c.catalogId && part && !part.mpn && !part.mpnVerifiedAt) {
      push(infos, {
        id: `mpn-missing-${c.ref}`,
        severity: "info",
        rule: "MPN_UNFROZEN",
        title: `${c.ref} has no frozen MPN`,
        detail: `${c.name} is catalog-linked but lacks manufacturer part number freeze.`,
        mitigation: "Add mpn/mpnVerifiedAt on catalog module for procurement certainty.",
        refs: [c.ref],
      });
    }
  }

  const clean = errors.length === 0;
  // Publish kit: allow with warnings, block on errors
  // PCB export additionally requires zero pad-level errors (already in errors)
  const canExportPcb = clean;
  const canPublishKit = clean;

  const summary = clean
    ? errors.length === 0 && warnings.length === 0
      ? "ERC clean — no errors or warnings."
      : `ERC clean of errors (${warnings.length} warning(s), ${infos.length} info).`
    : `ERC failed: ${errors.length} error(s), ${warnings.length} warning(s).`;

  return {
    errors,
    warnings,
    infos,
    clean,
    canExportPcb,
    canPublishKit,
    summary,
  };
}

/** Flatten ERC into safety-style findings for existing UI. */
export function ercToSafetyFindings(erc: ErcReport): {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  mitigation?: string;
}[] {
  const mapSev = (s: ErcViolation["severity"]): "critical" | "warning" | "info" =>
    s === "error" ? "critical" : s === "warning" ? "warning" : "info";

  return [...erc.errors, ...erc.warnings, ...erc.infos].map((v) => ({
    id: `erc-${v.id}`,
    severity: mapSev(v.severity),
    title: `[ERC:${v.rule}] ${v.title}`,
    detail: v.detail,
    mitigation: v.mitigation,
  }));
}
