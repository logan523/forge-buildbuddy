"use client";

/**
 * "Get your computer ready" (C4) — the universal fallback that works on
 * every browser and every board, regardless of whether Web Serial flashing
 * (flash-console.tsx / flash-flow.tsx) is available or the board is even
 * one Forge recognizes. Plain reference steps: install the IDE, add board
 * support, install the board package, install libraries, plug in and
 * select the board — with a driver escape hatch for when the port never
 * shows up.
 *
 * Deliberately dumb: a numbered checklist with session-local checkboxes
 * (useState, no localStorage — this is a reference card, not tracked
 * progress) that degrades gracefully when `setupInfo` is null (unknown
 * board — see the honest state in build-ui.tsx): steps that need a
 * specific board package collapse away and only the IDE + driver-notes
 * steps remain, renumbered so there are never gaps.
 */

import { useState, type ReactNode } from "react";
import type { BoardFamily, BoardSetupDriverNote, BoardSetupInfo } from "@/lib/firmware";
import { Icon } from "@/components/ui";

export interface ComputerReadyProps {
  /** Detected board family, or null when Forge doesn't recognize the board. */
  family: BoardFamily | null;
  /** boardSetupInfo(family) — pass null for the unknown-board path. */
  setupInfo: BoardSetupInfo | null;
  /** FirmwarePackage.libraries for this build. Pass [] when there's no firmware package yet. */
  libraries: string[];
}

const FAMILY_LABEL: Partial<Record<BoardFamily, string>> = {
  esp32c3: "ESP32-C3",
  esp32: "ESP32",
  nano: "Arduino Nano",
  pico: "Raspberry Pi Pico",
};

const GENERIC_IDE_URL = "https://www.arduino.cc/en/software";

// Mirrors firmware.ts's USB_UART_DRIVER_NOTES (same two official vendor
// pages) so the unknown-board path — which never gets a resolved
// BoardSetupInfo to read driverNotes from — still has somewhere honest to
// point a beginner whose port never shows up. Not a second source of truth,
// just the same two facts available without a resolved family.
const GENERIC_DRIVER_NOTES: BoardSetupDriverNote[] = [
  { chip: "CH340", url: "https://www.wch-ic.com/downloads/CH341SER_ZIP.html", hint: "most common on budget boards" },
  { chip: "CP210x", url: "https://www.silabs.com/developer-tools/usb-to-uart-bridge-vcp-drivers", hint: "common on official dev boards" },
];

// "Wire" ships with every board core already ("WiFi" too, on the off chance
// it ever lands in a sketch's libraries list) — nothing to install. Same
// filter firmware.ts's platformioIni() applies to lib_deps.
const BUILTIN_LIBS = new Set(["Wire", "WiFi"]);

interface ChecklistStep {
  id: string;
  content: ReactNode;
}

export function ComputerReady({ family, setupInfo, libraries }: ComputerReadyProps) {
  const [expanded, setExpanded] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const toggleChecked = (id: string) => setChecked((c) => ({ ...c, [id]: !c[id] }));

  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
    } catch {
      /* clipboard unavailable — the text is still visible to copy by hand */
    }
  };

  const label = (family && FAMILY_LABEL[family]) || null;
  const ideUrl = setupInfo?.ideUrl ?? GENERIC_IDE_URL;
  const driverNotes = setupInfo?.driverNotes ?? GENERIC_DRIVER_NOTES;
  const installLibs = libraries.filter((l) => !BUILTIN_LIBS.has(l));

  const steps: ChecklistStep[] = [
    {
      id: "ide",
      content: (
        <>
          <p className="text-sm text-text">
            Install the free <strong>Arduino IDE</strong> — the program that turns your code into something the
            board understands.
          </p>
          <a
            href={ideUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 mt-1.5 text-xs font-medium text-accent hover:underline"
          >
            Download Arduino IDE <Icon name="external-link" size={12} />
          </a>
        </>
      ),
    },
  ];

  if (setupInfo) {
    steps.push({
      id: "board-support",
      content: setupInfo.boardManagerUrl ? (
        <>
          <p className="text-sm text-text">Add board support.</p>
          <p className="text-xs text-text-secondary mt-0.5">
            Arduino IDE → Settings → paste this into <strong>Additional boards manager URLs</strong>:
          </p>
          <div className="mt-1.5 flex items-center gap-1.5">
            <code className="flex-1 min-w-0 truncate text-[11px] font-mono px-2 py-1.5 rounded-lg bg-surface-overlay text-text-secondary">
              {setupInfo.boardManagerUrl}
            </code>
            <button
              type="button"
              onClick={() => copy("board-support", setupInfo.boardManagerUrl!)}
              aria-label="Copy board manager URL"
              className="shrink-0 text-2xs px-2 py-1.5 rounded-lg border border-border-subtle text-text-secondary hover:text-text cursor-pointer"
            >
              {copiedId === "board-support" ? "Copied ✓" : "Copy"}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-text">Add board support.</p>
          <p className="text-xs text-text-secondary mt-0.5">
            Built into the Arduino IDE already — nothing to add for {label ?? "this board"}.
          </p>
        </>
      ),
    });

    steps.push({
      id: "board-package",
      content: (
        <>
          <p className="text-sm text-text">Install the board package.</p>
          <p className="text-xs text-text-secondary mt-0.5">Tools → Board → Boards Manager, search for:</p>
          <div className="mt-1.5 flex items-center gap-1.5">
            <code className="flex-1 min-w-0 truncate text-[11px] font-mono px-2 py-1.5 rounded-lg bg-surface-overlay text-text-secondary">
              {setupInfo.boardPackageName}
            </code>
            <button
              type="button"
              onClick={() => copy("board-package", setupInfo.boardPackageName)}
              aria-label="Copy board package name"
              className="shrink-0 text-2xs px-2 py-1.5 rounded-lg border border-border-subtle text-text-secondary hover:text-text cursor-pointer"
            >
              {copiedId === "board-package" ? "Copied ✓" : "Copy"}
            </button>
          </div>
        </>
      ),
    });
  }

  if (installLibs.length > 0) {
    steps.push({
      id: "libraries",
      content: (
        <>
          <p className="text-sm text-text">Install libraries.</p>
          <p className="text-xs text-text-secondary mt-0.5">
            Tools → Manage Libraries, search + install each — tap a name to copy it:
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {installLibs.map((lib) => (
              <button
                key={lib}
                type="button"
                onClick={() => copy(`lib:${lib}`, lib)}
                aria-label={`Copy library name ${lib}`}
                className="text-2xs px-2 py-1 rounded-md border border-border-subtle text-text-secondary hover:border-accent/40 hover:text-accent cursor-pointer"
              >
                {copiedId === `lib:${lib}` ? "Copied ✓" : lib}
              </button>
            ))}
          </div>
        </>
      ),
    });
  }

  steps.push({
    id: "plug-in",
    content: (
      <>
        <p className="text-sm text-text">Plug in your board and select it.</p>
        <p className="text-xs text-text-secondary mt-0.5">
          {setupInfo?.boardSelectName ? (
            <>
              Tools → Board → select <strong>{setupInfo.boardSelectName}</strong>, then Tools → Port → pick the new
              port that appeared.
            </>
          ) : (
            <>
              Tools → Board → select the entry that matches {label ? <strong>{label}</strong> : "your board"}, then
              Tools → Port → pick the new port that appeared.
            </>
          )}
        </p>
        <details className="mt-2">
          <summary className="text-[11px] font-medium text-accent cursor-pointer">If no port appears</summary>
          <div className="mt-1.5 space-y-1.5">
            <p className="text-[11px] text-text-muted">
              Most boards need no driver at all on a modern Mac or Windows 10/11. If Tools → Port still stays empty
              after plugging in, your board&apos;s USB chip may need one:
            </p>
            {driverNotes.map((d) => (
              <p key={d.chip} className="text-[11px]">
                <a
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-accent hover:underline"
                >
                  {d.chip} driver
                </a>
                <span className="text-text-muted"> — {d.hint}</span>
              </p>
            ))}
          </div>
        </details>
      </>
    ),
  });

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="w-full text-left p-3 rounded-xl border border-accent/20 bg-accent/5 hover:bg-accent/10 transition-colors cursor-pointer flex items-center justify-between gap-3"
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium text-accent">First time? Get your computer ready</span>
          <span className="block text-2xs text-text-muted mt-0.5">
            A quick reference for the IDE, drivers, and libraries — nothing here is saved or tracked.
          </span>
        </span>
        <Icon name="chevron-down" size={16} className="text-accent shrink-0" />
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-surface overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(false)}
        className="w-full text-left px-4 py-3 flex items-center justify-between gap-3 bg-accent/5 cursor-pointer"
      >
        <span className="text-sm font-medium text-accent">
          Get your computer ready{label ? ` for ${label}` : ""}
        </span>
        <Icon name="chevron-down" size={16} className="text-accent shrink-0 rotate-180" />
      </button>

      <ol className="p-4 space-y-3">
        {steps.map((step, i) => (
          <li key={step.id} className="flex gap-3 items-start">
            <input
              type="checkbox"
              checked={!!checked[step.id]}
              onChange={() => toggleChecked(step.id)}
              aria-label={`Step ${i + 1} done`}
              className="mt-1 w-4 h-4 min-w-4 accent-[#0891b2] cursor-pointer shrink-0"
            />
            <div className={`min-w-0 flex-1 ${checked[step.id] ? "opacity-50" : ""}`}>
              <span className="text-2xs font-semibold text-text-muted uppercase tracking-wide">Step {i + 1}</span>
              <div className="mt-0.5">{step.content}</div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
