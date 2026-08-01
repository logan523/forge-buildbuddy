/**
 * P1.3 — when every step is marked complete, optionally require live I2C
 * verify (or an honest soft-skip) before the full "you built it" celebration.
 * Pure: no React, no serial I/O.
 */

export type WiringVerifyStatus = "not-required" | "pending" | "passed" | "skipped";

export type BuildDonePhase = "building" | "verify-board" | "celebrate";

export interface BuildDoneGateInput {
  allStepsComplete: boolean;
  /** From expectedI2cAddresses(plan).length — 0 means no live verify gate. */
  expectedI2cCount: number;
  /**
   * pending = not yet checked (default when I2C devices exist)
   * passed = live verify all found
   * skipped = user soft-skipped (no board)
   * not-required = plan has no I2C devices (or gate disabled)
   */
  wiringVerify: WiringVerifyStatus;
}

export interface BuildDoneGate {
  phase: BuildDonePhase;
  softSkipAllowed: boolean;
  headline: string;
  body: string;
}

/**
 * Resolve what the end-of-build UI should show.
 * - building: incomplete steps
 * - verify-board: steps done, I2C expected, not yet passed/skipped
 * - celebrate: steps done and verify satisfied or not applicable
 */
export function resolveBuildDoneGate(input: BuildDoneGateInput): BuildDoneGate {
  if (!input.allStepsComplete) {
    return { phase: "building", softSkipAllowed: false, headline: "", body: "" };
  }

  if (input.expectedI2cCount === 0 || input.wiringVerify === "not-required") {
    return {
      phase: "celebrate",
      softSkipAllowed: false,
      headline: "You built it.",
      body: "Steps done. Show it off — or turn it into a kit someone else can build.",
    };
  }

  if (input.wiringVerify === "pending") {
    const n = input.expectedI2cCount;
    return {
      phase: "verify-board",
      softSkipAllowed: true,
      headline: "One more check — does the board talk?",
      body: `Connect USB and run the wiring check (${n} I2C device${
        n === 1 ? "" : "s"
      } expected). No board handy? You can skip — steps are still done.`,
    };
  }

  if (input.wiringVerify === "passed") {
    return {
      phase: "celebrate",
      softSkipAllowed: false,
      headline: "You built it.",
      body: "Steps done and the board answered on the bus. Show it off — or turn it into a kit.",
    };
  }

  // skipped
  return {
    phase: "celebrate",
    softSkipAllowed: false,
    headline: "You built it.",
    body: "Steps done. Live bus check skipped — re-open Serial anytime to verify.",
  };
}

/** Initial verify status for a plan: pending if I2C devices exist, else not-required. */
export function initialWiringVerifyStatus(expectedI2cCount: number): WiringVerifyStatus {
  return expectedI2cCount > 0 ? "pending" : "not-required";
}
