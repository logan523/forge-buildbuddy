# TODOS

Deferred work with enough context to pick up cold. Newest first.

## Electrons on the Wire — current-flow animation (DEFERRED by eng review 2026-07-10)

**What:** Animate current flowing along the 3D wire tubes (bright charge streaming from
the cell through the MCU to peripherals, faster/brighter where more current flows,
returning on GND), driven by real per-wire current.

**Why deferred:** An eng review + independent outside voice + verified code refuted the
approach and surfaced a foundation gap. Do NOT build until the foundation lands and the
browser preview is back (it's been down, so wire-touching visual work ships unverifiable).

**The findings (all verified in code):**
1. **Rendered power/GND tubes are NOT netlist-derived.** `buildHarnesses` skips every
   >2-member net (`harness.ts:393` `if (nodePins.length !== 2) continue`) and renders a
   hand-authored teaching table instead (`harness.ts:409-438`: OLED_VCC, SYS_3V3, SYS_GND…).
   So "truth-graded current on the existing tubes" is false for exactly the power/GND rails
   the feature is about.
2. **Full MNA is inert for the animation.** A star net is a loopless tree → branch currents
   are fixed by KCL alone; wire resistance changes only node voltages, never currents. The
   O(N³) solve computes voltages the animation never uses. Correct current = O(N) subtree sum
   (leaf = load mA, trunk = sum of its subtree).
3. **The dependent-source LDO model isn't buildable.** No regulator element exists in the
   netlist (`harness.ts:426` is `charger OUT+ → brain 3V3`; "3V3" is a domain label, not a
   regulated node). The nearest identify-the-LDO heuristic false-positives on the TP4056.
4. **Refactoring operating-point.ts onto MNA would regress the brownout gate.** Honest copper
   R is milliohms; today's sag comes from op-point's fabricated ~0.3-0.5Ω cell-resistance
   proxy. Keep `operating-point.ts` as the closed-form, non-gating estimate.

**The honest version (when unblocked):** generate the power/GND star topology FROM the
multi-member nets (reconciling the teaching defaults) so the tubes ARE the netlist; attribute
KCL subtree-sum currents; orient direction by role (power flows from source, gnd returns),
NOT by sign(ΔV); add a physical-plausibility gate (constant-current load + finite source R can
return a finite NEGATIVE rail voltage — non-singular, so "never NaN" misses it); show ordinal
current (faster/brighter = more), never numeric mA per tube; grade "illustrative", not
"measured". "Charging" is a different circuit (source→charger→cell), a separate solve — not
`animation.reverse()`.

**Depends on:** the harness power/GND reconciliation (below) + browser preview access.

## Harness power/GND tubes should derive from the netlist (FOUNDATION)

**What:** Generate the power/GND wire tubes from the multi-member nets (star/MST from a chosen
hub) instead of the hand-authored teaching table in `harness.ts:409-438`, so the rendered
tubes equal the netlist.

**Why:** Unblocks Electrons on the Wire honestly, and closes a real honesty gap — the
Conformance Ledger currently proves the compiled *table* matches the netlist but does NOT
audit the 3D *harness tubes*, which today are teaching defaults with hand-authored net names.

**Pros:** the render becomes provably netlist-derived end to end (the 3D, not just the table);
the money-shot animation becomes truth-gradeable.
**Cons:** touches the rendered wiring (the whole 3D look) — must be visually verified, so it's
preview-gated. Risk of regressing the current legible teaching layout.
**Depends on:** browser preview access to verify the wiring still reads correctly.

## Extend the Conformance Ledger to audit the 3D harness tubes (SMALL, verifiable now)

**What:** `conformance.ts` audits `plan.steps[].compiled.connections` (the table). It does NOT
audit the rendered `WireRoute3D` harness routes. Add an audit that checks each harness tube's
netName against `model.nets` (the same bijection), so the teaching-default tubes surface as
"decorative" in the seal.

**Why:** Turns the outside voice's finding into a permanent guard; makes the seal honest about
the 3D, not just the table.
**Pros:** pure + golden-testable (no preview needed); directly uses what the review found.
**Cons:** will (correctly) drop the seal below 100% until the harness reconciliation above lands
— which is the honest state, but worth knowing it flips the seal amber.
