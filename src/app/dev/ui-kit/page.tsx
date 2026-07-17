"use client";

/**
 * /dev/ui-kit — visual catalog of src/components/ui/* primitives (D3).
 * Not linked from the app. Migrating existing screens onto these is a later slice.
 */
import { useState } from "react";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge, confidenceTier, type BadgeTone } from "@/components/ui/badge";
import { DrawerShell } from "@/components/ui/drawer-shell";
import { Icon, type IconProps } from "@/components/ui/icon";
import { InfoPopover } from "@/components/ui/tooltip";

const VARIANTS: ButtonVariant[] = ["primary", "secondary", "ghost", "danger"];
const SIZES: ButtonSize[] = ["sm", "md", "lg"];
const TONES: BadgeTone[] = ["success", "info", "warning", "danger", "neutral"];
const CONFIDENCE_SAMPLES = [90, 40, 10];
const ICON_NAMES: IconProps["name"][] = [
  "zap",
  "book-open",
  "microscope",
  "mic",
  "cpu",
  "monitor",
  "battery",
  "thermometer",
  "wrench",
  "package",
  "shield-alert",
  "shopping-cart",
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-serif text-lg text-text">{title}</h2>
      {children}
    </section>
  );
}

export default function UiKitDevPage() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="min-h-screen p-8 max-w-4xl mx-auto space-y-10">
      <header>
        <h1 className="font-serif text-2xl text-text">UI kit</h1>
        <p className="text-sm text-text-muted mt-1">src/components/ui — dev catalog, not linked from the app.</p>
      </header>

      <Section title="Button">
        <div className="space-y-3">
          {VARIANTS.map((variant) => (
            <div key={variant} className="flex items-center gap-3 flex-wrap">
              <span className="text-xs text-text-muted w-20 shrink-0">{variant}</span>
              {SIZES.map((size) => (
                <Button key={size} variant={variant} size={size}>
                  {size}
                </Button>
              ))}
              <Button variant={variant} loading>
                loading
              </Button>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Card">
        <div className="grid grid-cols-2 gap-4">
          <Card>padded (default)</Card>
          <Card padded={false}>
            <div className="p-2 text-xs text-text-muted">padded=false (content supplies its own padding)</div>
          </Card>
          <Card elevated>elevated (shadow-card)</Card>
          <Card padded={false} elevated>
            <div className="p-2 text-xs text-text-muted">padded=false + elevated</div>
          </Card>
        </div>
      </Section>

      <Section title="Badge">
        <div className="flex items-center gap-2 flex-wrap">
          {TONES.map((tone) => (
            <Badge key={tone} tone={tone}>
              {tone}
            </Badge>
          ))}
          {TONES.map((tone) => (
            <Badge key={`${tone}-sm`} tone={tone} size="sm">
              {tone} sm
            </Badge>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {CONFIDENCE_SAMPLES.map((score) => {
            const tier = confidenceTier(score);
            return (
              <Badge key={score} tone={tier.tone}>
                score {score}: {tier.label}
              </Badge>
            );
          })}
          <Badge tone={confidenceTier(null).tone}>score null: {confidenceTier(null).label}</Badge>
        </div>
      </Section>

      <Section title="DrawerShell">
        <Button variant="primary" onClick={() => setDrawerOpen(true)}>
          Open drawer
        </Button>
        {drawerOpen && (
          <DrawerShell
            title="Example drawer"
            onClose={() => setDrawerOpen(false)}
            width="md"
            footer={
              <Button variant="primary" className="w-full" onClick={() => setDrawerOpen(false)}>
                Done
              </Button>
            }
          >
            <p className="text-sm text-text-secondary">
              Backdrop click, the close button, or Esc all close this drawer.
            </p>
          </DrawerShell>
        )}
      </Section>

      <Section title="Icon">
        <div className="flex flex-wrap gap-4">
          {ICON_NAMES.map((name) => (
            <div key={name} className="flex flex-col items-center gap-1 w-16">
              <Icon name={name} size={22} className="text-text" label={name} />
              <span className="text-[10px] text-text-muted text-center">{name}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="InfoPopover">
        <div className="flex items-center gap-6">
          <p className="text-sm text-text">
            Inline:{" "}
            <InfoPopover
              anchor="inline"
              trigger="SDA"
              triggerLabel="What is SDA?"
              triggerClassName="underline decoration-dotted decoration-accent/60 underline-offset-2"
            >
              Serial Data — the wire that carries I2C data between chips.
            </InfoPopover>
          </p>
          <InfoPopover
            anchor="sheet"
            trigger="?"
            triggerLabel="What's this part?"
            triggerClassName="w-5 h-5 rounded-full bg-accent/10 text-accent text-xs font-bold inline-flex items-center justify-center hover:bg-accent/20"
          >
            This part number is a best guess from the module catalog — always check the spec before buying.
          </InfoPopover>
        </div>
      </Section>
    </div>
  );
}
