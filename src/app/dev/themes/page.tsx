"use client";

/**
 * Theme judging board — four directions side by side, rendered from the REAL
 * primitives under each theme's actual tokens ([data-theme] scoping cascades
 * the CSS-variable overrides to descendants). Not linked from the app.
 *
 * The body-level paper texture can't retint per column (it lives on <body>),
 * so each column carries its own bg swatch.
 *
 * There used to be "open the app in this theme" links here, driven by a
 * floating dev pill that read ?theme= and stamped data-theme on the root. The
 * pill was removed 2026-08-24 — it sat in the corner of every screen, and the
 * rebrand it served has been parked since July. This board is the record of
 * that exploration; it is not a way to run the app in another skin.
 */
// These live here now rather than in the root layout: the rebrand is parked,
// and every production page was shipping three themes it had no way to apply.
import "../../themes/blueprint-evolved.css";
import "../../themes/field-notebook.css";
import "../../themes/kit-box.css";
import { Button, Card, Badge, Icon } from "@/components/ui";

const DIRECTIONS: { id: string | null; name: string; note: string }[] = [
  { id: null, name: "Incumbent", note: "Today's Blueprint, token-governed" },
  { id: "blueprint-evolved", name: "Blueprint+", note: "Same DNA; console = navy ink inverted" },
  { id: "field-notebook", name: "Field Notebook", note: "Kraft + ink + safety orange; amber instrument console" },
  { id: "kit-box", name: "Kit-Box", note: "Off-white + one hero color; chunkier, rounder" },
];

function Sample() {
  return (
    <div className="bg-bg p-4 space-y-3 h-full">
      <h2 className="font-serif text-2xl font-bold text-text">Step 4 of 11</h2>
      <p className="text-sm text-text-secondary leading-relaxed">
        Solder the red wire from the battery holder&apos;s + pad to the TP4056 B+ pad.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="md">Mark step complete</Button>
        <Button variant="secondary" size="md">
          <Icon name="bug" size={14} /> I&apos;m stuck
        </Button>
      </div>

      <Card>
        <p className="text-2xs font-semibold uppercase tracking-wider text-text-muted mb-1.5">
          Parts check
        </p>
        <div className="flex items-center gap-2 text-sm text-text">
          <Icon name="cpu" size={16} className="text-text-muted" />
          ESP32-C3 SuperMini
          <Badge tone="success" size="sm">Catalog match</Badge>
        </div>
        <div className="flex items-center gap-2 text-sm text-text mt-1.5">
          <Icon name="monitor" size={16} className="text-text-muted" />
          0.96&quot; OLED
          <Badge tone="warning" size="sm">Best guess — check the spec</Badge>
        </div>
      </Card>

      <div className="flex gap-1.5">
        <span className="px-2 py-1 rounded-sm text-2xs font-medium bg-success-soft text-success">Wiring ✓</span>
        <span className="px-2 py-1 rounded-sm text-2xs font-medium bg-warning-soft text-warning">Li-ion care</span>
        <span className="px-2 py-1 rounded-sm text-2xs font-medium bg-danger-soft text-danger">Hot iron</span>
      </div>

      {/* The console moment: firmware viewer / expanded Stage / hands-free */}
      <div
        className="rounded-lg border p-3 font-mono text-2xs leading-relaxed"
        style={{
          background: "var(--color-console-bg)",
          borderColor: "var(--color-console-border)",
          color: "var(--color-console-text)",
          boxShadow: "var(--shadow-console)",
        }}
      >
        <p style={{ color: "var(--color-console-text-muted)" }}>serial · 115200 baud</p>
        <p>FORGE-DIAG v1 sda=4 scl=5</p>
        <p>
          Found device at <span style={{ color: "var(--color-console-accent)" }}>0x3C</span> ✓ OLED
        </p>
        <p>
          Found device at <span style={{ color: "var(--color-console-accent)" }}>0x44</span> ✓ sensor
        </p>
      </div>
    </div>
  );
}

export default function ThemesJudgingBoard() {
  return (
    <main className="max-w-[1700px] mx-auto px-4 py-8">
      <h1 className="font-serif text-3xl font-bold text-text mb-1">Pick Forge&apos;s look</h1>
      <p className="text-sm text-text-secondary mb-6">
        Same real components, four token sets. For the full-app feel, open a direction below —
        the bottom-left pill switches anywhere, anytime.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {DIRECTIONS.map((d) => (
          <section
            key={d.name}
            {...(d.id ? { "data-theme": d.id } : {})}
            className="rounded-lg overflow-hidden border-2 border-border flex flex-col"
          >
            <div className="bg-surface px-4 py-3 border-b border-border-subtle">
              <p className="font-semibold text-text">{d.name}</p>
              <p className="text-2xs text-text-muted">{d.note}</p>
            </div>
            <Sample />
          </section>
        ))}
      </div>
    </main>
  );
}
