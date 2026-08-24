/**
 * A Claim is a fact plus how we know it.
 *
 * This exists because of a specific bug. On 2026-08-24 the live prep screen
 * told a builder to buy a `0.96" SSD1306 OLED module` when the part they
 * needed was a 1S battery level indicator. Nothing was broken in the sense of
 * throwing: `getRealPart()` was typed to always return a spec, its key space
 * (`esp32_c3`, `oled_096`) silently did not match the catalog's (`esp32-c3`,
 * `battery-level-led`), the unchecked index returned `undefined`, and a `??`
 * chain filled the hole with a different part's SKU. Every layer behaved as
 * written. The builder buys the wrong thing.
 *
 * The fix is not more validation. It is removing the ability to hold a fact
 * without holding its provenance, so "we don't know" has somewhere to live
 * and cannot be quietly replaced by a neighbour's answer.
 *
 * The same rule, in Python, is `docs/rocket-poster-kit/export_bmp.py`: it
 * refuses to write a pixel that is not an exact ink rather than snapping it
 * to the nearest one. A poster that needs snapping has a bug upstream. A part
 * that needs a fallback SKU has a bug upstream too.
 */

/** How sure we are, ordered weakest to strongest for gates that care. */
export type ClaimKind = "unknown" | "derived" | "declared" | "evidenced";

/**
 * Evidence strength. Mirrors build-reality's tiers deliberately: an
 * instrument answering is not the same as a human saying it looks right.
 */
export type ClaimEvidenceTier = "self-report" | "assisted" | "instrument";

export type Claim<T> =
  /**
   * Computed by a pure function from something we control — the netlist, the
   * catalog, the compiled facts. `from` names that function or module so a
   * reader can go check. Not "true", but reproducible and attributable.
   */
  | { readonly kind: "derived"; readonly value: T; readonly from: string }
  /**
   * The builder told us. Outranks derivation about their own bench: their
   * board says `G`, their wire is brown, their part is in hole C1.
   */
  | { readonly kind: "declared"; readonly value: T; readonly at: string }
  /**
   * Something outside the model confirmed it — an I2C scan, a continuity
   * check, a build-id readback. The only kind a pre-power gate may lean on.
   */
  | {
      readonly kind: "evidenced";
      readonly value: T;
      readonly tier: ClaimEvidenceTier;
      readonly at: string;
    }
  /**
   * We do not know. `need` says what would close it, in words a beginner can
   * act on — this string is shown to them, so it is a sentence, not a code.
   *
   * There is deliberately no `value` field. That is the entire mechanism:
   * you cannot read a value off an unknown claim, so you cannot accidentally
   * render one.
   */
  | { readonly kind: "unknown"; readonly need: string };

/** A claim that definitely carries a value. `unknown` is excluded by type. */
export type KnownClaim<T> = Extract<Claim<T>, { value: T }>;
