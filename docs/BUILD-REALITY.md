# Build Reality — the builder's world as first-class truth

*Contract doc, sibling of `ELECTRICAL-CORE.md`. Written 2026-08-21 after Slices 1-3
of the Forge-10x cycle shipped. If you are an agent about to "fix" wire colors,
step assignment, or a gate verdict: read this first.*

## Why this exists

Forge's owner built a real Solar Weather Clock end to end. He abandoned the UI in
the first hour and used a chat window as the actual build tool. The transcript
(329 messages) shows why, and none of it was content quality:

- His boards said `G`, `OUT+`, `B-`. The plan said `GND`, `VCC`.
- His wires were brown/orange/whatever the kit had. The plan insisted on black/red.
- He needed hole coordinates (`C1`, `B16`), not "solder pad to pad".
- He needed ONE action at a time, then "what next".
- Four wires in one breadboard column shorted power to ground and the ESP got hot.
  Nothing in the product could have caught it; the chat caught it from coordinates.

**The plan says what SHOULD exist. BuildReality records what DOES.** Where they
disagree about the builder's own bench, reality wins.

## The model (`src/lib/build-reality/`)

```
BuildReality {
  schemaVersion, planId,
  revision,            // monotonic; the ONLY recompile key (never a content hash)
  formFactor,          // solder | breadboard | dupont
  joints,              // physical connections + their evidence
  wireColors,          // byNet + byConnection, each {hex, name, label?}
  actualParts,         // what's really on the bench
  breadboard?,         // {boardId, declarations}
  events,              // append-only trail, capped
}
```

### Load-bearing invariants

1. **`undefined` ≠ empty.** `readReality()` returning `undefined` means NOT YET
   HYDRATED (unknown). A hydrated-but-empty reality is a real object. Fail-closed
   gates must treat unknown as UNKNOWN — collapsing these two is a safety
   inversion, not a nit.
2. **Joint identity is an UNORDERED endpoint pair**, not the hub-relative
   `net:ref:pin` connection id. `pickHub` is member-order dependent; a re-derive
   can flip from/to. The connection id is a hint key; `endpoints` is the identity.
3. **`verified` requires evidence.** The reducer refuses a bare verified write.
   `planned → verified` is unreachable; you pass through `made`.
4. **Evidence tiers rank.** `i2c-scan`/`continuity`/`voltage` = instrument ·
   `photo` = assisted · `tug` = self-report · `imported` = self-report, always
   (an exported file must never counterfeit an instrument-tier gate pass).
5. **Verification is monotonic within a session.** A device flapping to "missing"
   NEVER rolls a joint back. Only explicit removal or a re-plan demotes.
6. **Every mutation bumps `revision` and appends one event.** Refused writes bump
   nothing (that's how tests detect refusal).

## Wire colors — precedence INVERTED (read before touching `wire-colors.ts`)

The old doctrine was "class standard beats any supplied color, and a divergent
color is a defect to warn about." That is now **wrong for the builder's own
declarations**:

```
builder's declaration  >  well-known net (SDA/SCL)  >  net class  >  plan color  >  grey
```

Resolution happens **exactly once**, in `applyTrustPipeline(plan, reality?)`,
which stamps `displayColorHex/Name/Label` (+ `memberColorOverrides`) onto each
`ElectricalNet`. Every renderer — compiled prose, spoken hands-free lines, 2D
sheets, pad map, 3D harness tubes, connection spars, missing-device panel — reads
the stamp with `netColorFor` as the no-reality fallback. There are 6+ such
callers; adding a 7th means reading the stamp, not calling the authority directly.

**`canonicalColorName` exists so step assignment can't move.** `assignEdges`
token-scores edges against authored prose ("the black wire"); if scoring used the
declared color, declaring "brown" would silently reshuffle which chapter owns a
wire. Scoring uses the canonical name. There is a regression test.

## Breadboard (`src/lib/breadboard/`)

Geometry as data: same column + same half = one node; the center gap breaks every
column; 830-tie rails are SEGMENTED by default (they break mid-board on most real
boards, and assuming continuity passes wiring that's physically open).

Rules return **verdict data, not errors** — a failed check is `{status: "blocked",
violations, unknowns}` with `ok: true` semantics, so agents/UI never retry a
safety verdict as if it were a transport failure. `unknown` (undeclared positions)
is never `clean`.

Violation copy has a house style, enforced by test: **causal and never-blame.**
"The five holes of a column are secretly ONE strip of metal inside the board —
your power and ground wires are touching each other right now." Not "you shorted
it."

## Gates

`prePowerGate(plan, reality, capability, breadboardVerdict?)` is **soft**: a
filling reassurance checklist, an explicit demoted override that is logged as a
`gate-override` event forever, and human-labeled blockers (raw net ids never reach
a beginner). Electrically fail-closed, emotionally open — the transcript's builder
abandons surfaces that block him without warmth.

Capability matters: Web Serial exists only in desktop Chromium. On a phone the
live-check row renders `unavailable` with an honest reason and **never blocks**.

## Storage

IndexedDB primary, localStorage fallback (detected by attempting an open — never
UA sniffing), `navigator.storage.persist()` requested at first write, photo-free
export/import as the insurance policy for the no-accounts decision. Legacy
`forge-wirechecks-<planId>-<step>` keys migrate on first hydrate; orphaned ids are
preserved, never dropped; enumeration is prefix + digit-suffix scoped because
planIds contain dashes.

## What is NOT here (deliberately)

No server, no accounts, no MCP transport (deferred 2026-08-21), no automated
re-planning, no LLM writing into reality. The Ask helper receives a capped
`realityDigest` string — read-only context, never a write path.
