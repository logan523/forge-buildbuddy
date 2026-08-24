import { test } from "node:test";
import assert from "node:assert/strict";

import {
  derived,
  declared,
  evidenced,
  unknown,
  derivedOr,
  isKnown,
  valueOrUndefined,
  fold,
  mapClaim,
  strongest,
  meetsBar,
  provenanceLabel,
  type Claim,
} from "./index";

test("an unknown claim has no value to read, by construction", () => {
  const u = unknown<string>("we haven't matched this to a verified part yet");
  assert.equal(isKnown(u), false);
  assert.equal(valueOrUndefined(u), undefined);
  // The type has no `value` field at all; this asserts the runtime agrees.
  assert.equal("value" in u, false, "unknown carries a value — the whole gate leaks");
});

test("derivedOr is the replacement for ?? — absence becomes honest, not borrowed", () => {
  // The exact shape of the wrong-part bug: getRealPart returns undefined,
  // and the old code fell through to another part's SKU.
  const missing = derivedOr(undefined, "real-parts", "no verified part match yet");
  assert.equal(missing.kind, "unknown");
  assert.equal(valueOrUndefined(missing), undefined);

  const present = derivedOr("SSD1306", "real-parts", "no verified part match yet");
  assert.deepEqual(present, { kind: "derived", value: "SSD1306", from: "real-parts" });
});

test("a blank string is absence, not a value", () => {
  // A part card rendering an empty 'Look for:' line is the same lie as a
  // wrong one, just quieter.
  for (const blank of ["", "   ", "\n"]) {
    assert.equal(derivedOr(blank, "x", "need").kind, "unknown", `${JSON.stringify(blank)} passed as a value`);
  }
});

test("fold forces the unknown branch to be written", () => {
  const render = (c: Claim<string>) =>
    fold(c, { known: (v) => `Look for: ${v}`, unknown: (need) => need });

  assert.equal(render(derived("SHT3x breakout", "catalog")), "Look for: SHT3x breakout");
  assert.equal(
    render(unknown("we haven't verified which exact part this is")),
    "we haven't verified which exact part this is",
  );
});

test("mapClaim preserves provenance and never resurrects an unknown", () => {
  assert.deepEqual(mapClaim(derived(2, "f"), (n) => n * 2), { kind: "derived", value: 4, from: "f" });
  const d = mapClaim(declared("brown", "T0"), (s) => s.toUpperCase());
  assert.equal(d.kind, "declared");
  assert.equal(valueOrUndefined(d), "BROWN");

  const u = mapClaim(unknown<number>("no reading yet"), (n) => n * 2);
  assert.equal(u.kind, "unknown");
  assert.equal(valueOrUndefined(u), undefined);
});

test("precedence: evidence > declaration > derivation > unknown", () => {
  const u = unknown<string>("nothing yet");
  const de = derived("GND", "netlist");
  const dc = declared("G", "T1");
  const ev = evidenced("G", "instrument", "T2");

  // His board says G; the plan says GND. About his bench, he wins.
  assert.equal(valueOrUndefined(strongest(de, dc)), "G");
  assert.equal(strongest(de, dc).kind, "declared");
  assert.equal(strongest(de, dc, ev).kind, "evidenced");
  assert.equal(strongest(u, de).kind, "derived");
  assert.equal(strongest(u).kind, "unknown");
  assert.equal(strongest().kind, "unknown", "no inputs must not invent an answer");
});

test("gates fail closed: unknown never passes, and a tug is not an instrument", () => {
  const bar = { kind: "evidenced", tier: "instrument" } as const;

  assert.equal(meetsBar(unknown("not checked"), bar), false, "unknown passed a gate");
  assert.equal(meetsBar(derived(true, "netlist"), bar), false, "derivation passed as evidence");
  assert.equal(meetsBar(declared(true, "T"), bar), false, "a tap passed as evidence");
  assert.equal(meetsBar(evidenced(true, "self-report", "T"), bar), false, "a tug passed as instrument");
  assert.equal(meetsBar(evidenced(true, "assisted", "T"), bar), false, "a photo passed as instrument");
  assert.equal(meetsBar(evidenced(true, "instrument", "T"), bar), true);

  // Weaker bars accept stronger claims, never the reverse.
  assert.equal(meetsBar(evidenced(true, "instrument", "T"), { kind: "declared" }), true);
  assert.equal(meetsBar(declared(true, "T"), { kind: "declared" }), true);
  assert.equal(meetsBar(derived(true, "n"), { kind: "declared" }), false);
  assert.equal(meetsBar(derived(true, "n"), { kind: "derived" }), true);
});

test("provenance labels are plain words a beginner can read", () => {
  assert.equal(provenanceLabel(derived(1, "netlist")), "from the circuit");
  assert.equal(provenanceLabel(declared(1, "T")), "you told us");
  assert.equal(provenanceLabel(evidenced(1, "instrument", "T")), "proven live");
  assert.equal(provenanceLabel(unknown("x")), "not known yet");

  // No raw identifiers leak into copy the builder sees.
  for (const c of [derived(1, "some-internal-module"), unknown<number>("x")]) {
    assert.doesNotMatch(provenanceLabel(c), /[_-]|\bnetlist\b|\bmodule\b/, "provenance label leaks jargon");
  }
});

test("the wrong-part bug cannot be expressed", () => {
  // Given a lookup that misses, there is no path from here to another part's
  // SKU. The old chain was: real?.mpnOrSku ?? part.mpn ?? spec.split(".")[0].
  const lookup = (_id: string): { mpnOrSku: string } | undefined => undefined;
  const guidance = derivedOr<string>(
    lookup("battery-level-led")?.mpnOrSku,
    "real-parts",
    "no verified match yet",
  );

  assert.equal(guidance.kind, "unknown");
  const rendered = fold<string, string>(guidance, { known: (v) => v, unknown: (need) => need });
  assert.doesNotMatch(rendered, /SSD1306|OLED|TP4056|16340/, "a neighbour's part leaked through");
});
