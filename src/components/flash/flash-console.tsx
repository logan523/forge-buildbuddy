"use client";

/**
 * Web Serial console (C1): connect to a board over USB and watch it live —
 * no separate app, no drivers to hunt down blind. Also hosts C2 (flash over
 * Web Serial, see FlashFlow below) and C3 (I2C-scan verification against the
 * plan, see the Wiring check card below) — both build on the session this
 * opens, so the connection is kept alive across `open` toggles instead of
 * being torn down whenever the panel is hidden (see the `open` prop
 * contract below).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { DrawerShell, Button, Badge } from "@/components/ui";
import { serialSupported, describePort, openSession, type SerialSession } from "@/lib/serial/session";
import { parseScannerLine } from "@/lib/serial/line-parser";
import type { FirmwareManifestEntry } from "@/lib/serial/manifest";
import { expectedI2cAddresses, type ExpectedDevice } from "@/lib/serial/expected-devices";
import {
  createVerifyState,
  feedLine,
  deviceVerdicts,
  unexpectedDevices,
  type VerifyState,
  type DeviceVerdict,
  type UnexpectedDevice,
  allExpectedFound,
} from "@/lib/serial/verify";
import type { BuildPlan } from "@/lib/types";
import { FlashFlow, FlashFirmwareSection } from "./flash-flow";
import { MissingDeviceDebugPanel } from "./missing-device-panel";

export interface FlashConsoleProps {
  /**
   * Whether the panel is currently visible. The component stays mounted
   * (and keeps any open serial session alive) even when `open` is false —
   * only the DrawerShell chrome unmounts — so switching to another drawer
   * and back doesn't drop the board's connection or scrollback.
   */
  open: boolean;
  onClose: () => void;
  /**
   * I2C pins to send to the diagnostic sketch right after a one-tap flash
   * (C2's "Flash test firmware" flow, below) — defaults to the ESP32-C3
   * defaults (matches firmware.ts / diag.ino) until a future slice wires
   * the actual plan-derived pins through from the build orchestrator.
   */
  i2cPins?: { sda: number; scl: number };
  /**
   * C3: when present, the connected view cross-checks the live I2C scan
   * against this plan's expected devices (src/lib/serial/expected-devices.ts)
   * and shows a "Wiring check" card above the log. Today's mounting passes
   * none — the card simply doesn't render, and nothing else about the
   * console changes.
   */
  plan?: BuildPlan;
  /**
   * C3: fired when the builder taps "Debug this" on a device that hasn't
   * answered yet, with a real unstick.ts SymptomId string (see
   * expected-devices.ts's symptomHintForCategory — "blank_display" for a
   * missing display, "sensor_wrong" for a missing sensor). This component
   * only emits the hint; actually opening the Unstick drawer on it is a
   * later slice's job (the owner of build-drawers.tsx wires that up).
   */
  onOpenUnstick?: (symptomHint: string) => void;
  /**
   * P2: fired once when every expected I2C device is "found" — clears the
   * end-of-build verify gate (wiringVerify → passed).
   */
  onWiringVerified?: () => void;
}

const BAUD_RATE = 115200;
const MAX_LINES = 500;

// Stable empty-array references for the "nothing to verify" renders (no
// plan, or no live session yet) — avoids handing React a fresh `[]` every
// render when there's genuinely nothing new to show.
const EMPTY_DEVICES: ExpectedDevice[] = [];
const EMPTY_VERDICTS: DeviceVerdict[] = [];
const EMPTY_UNEXPECTED: UnexpectedDevice[] = [];

interface LogLine {
  id: number;
  text: string;
}

type Phase =
  | { kind: "disconnected" }
  | { kind: "connecting" }
  | { kind: "connected"; portLabel: string }
  | { kind: "error"; message: string };

function friendlyConnectError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotFoundError") {
    return "No board selected. Click Connect and choose it from the browser's picker.";
  }
  if (name === "SecurityError") {
    return "The browser blocked the connection. Click Connect to try again.";
  }
  if (name === "NetworkError" || name === "InvalidStateError") {
    return "That port couldn't be opened — it may already be in use by another app or tab.";
  }
  return "Couldn't connect. Unplug and replug the board, then try again.";
}

export function FlashConsole({
  open,
  onClose,
  i2cPins,
  plan,
  onOpenUnstick,
  onWiringVerified,
}: FlashConsoleProps) {
  const supported = serialSupported();
  const [phase, setPhase] = useState<Phase>({ kind: "disconnected" });
  const [lines, setLines] = useState<LogLine[]>([]);
  const [unplugged, setUnplugged] = useState(false);
  // C2: set while the "Flash test firmware" guided flow owns the view.
  const [flashEntry, setFlashEntry] = useState<FirmwareManifestEntry | null>(null);
  // The raw port, retained across monitor open/close cycles so the C2 flash
  // flow (and the auto-reopen after it finishes) can reuse it without ever
  // re-prompting the browser's device picker. State, not a ref: the render
  // below branches on it, and refs can't be read during render.
  const [connectedPort, setConnectedPort] = useState<SerialPort | null>(null);
  // C3: null whenever there's no plan or no live session to verify against —
  // seeded fresh (new startedAt) at the top of every connect attempt, below.
  const [verifyState, setVerifyState] = useState<VerifyState | null>(null);
  // C3: the "now" deviceVerdicts is computed against, updated once a second
  // while connected so the "waiting -> missing" transition (pure elapsed
  // time, see verify.ts) reaches the screen even when the board stays
  // completely silent. This is state (not a Date.now() call inline in the
  // render below) on purpose: components must render the same output for
  // the same props/state (react-hooks/purity) — Date.now() itself only ever
  // gets called from the effect below, never during render.
  const [verifyNow, setVerifyNow] = useState<number | null>(null);

  const sessionRef = useRef<SerialSession | null>(null);
  const expectedCloseRef = useRef(false);
  const nextLineIdRef = useRef(0);
  const logRef = useRef<HTMLDivElement>(null);
  const pinnedToBottomRef = useRef(true);

  const appendLine = useCallback((text: string) => {
    const id = nextLineIdRef.current++;
    setLines((prev) => {
      const trimmed = prev.length >= MAX_LINES ? prev.slice(prev.length - MAX_LINES + 1) : prev;
      return [...trimmed, { id, text }];
    });
    // C3: harmless when verifyState is null (no plan / not connected yet) —
    // the functional updater below is a no-op in that case, so appendLine
    // doesn't need `plan` in its own dependency list at all.
    setVerifyState((prev) => (prev ? feedLine(prev, parseScannerLine(text), Date.now()) : prev));
  }, []);

  // Opens the monitor on an already-picked port — shared by connect() (fresh
  // navigator.serial.requestPort()) and reopenMonitorSession() (C2: reusing
  // the retained port after a flash, with no re-prompt).
  const openMonitorOnPort = useCallback(
    async (port: SerialPort) => {
      setUnplugged(false);
      setLines([]);
      // C3: a fresh session starts a fresh missing-detection clock — see
      // verify.ts's file header for why elapsed-time-since-here is the only
      // signal available to detect a device that never answers. verifyNow is
      // reset alongside it (not left stale from a prior session) — the
      // render below falls back to verifyState.startedAt whenever verifyNow
      // hasn't ticked yet, so a stale verifyNow here would otherwise measure
      // elapsed time against the WRONG session's clock for up to a second.
      setVerifyState(plan ? createVerifyState(Date.now()) : null);
      setVerifyNow(null);
      setPhase({ kind: "connecting" });
      try {
        const portLabel = describePort(port.getInfo());
        const session = await openSession(port, {
          baudRate: BAUD_RATE,
          onLine: appendLine,
          onClose: () => {
            sessionRef.current = null;
            if (!expectedCloseRef.current) setUnplugged(true);
            expectedCloseRef.current = false;
            setPhase({ kind: "disconnected" });
          },
        });
        sessionRef.current = session;
        setConnectedPort(port);
        setPhase({ kind: "connected", portLabel });
      } catch (err) {
        setPhase({ kind: "error", message: friendlyConnectError(err) });
      }
    },
    [appendLine, plan]
  );

  const connect = useCallback(async () => {
    if (!supported || !navigator.serial) return;
    let port: SerialPort;
    try {
      port = await navigator.serial.requestPort();
    } catch (err) {
      setPhase({ kind: "error", message: friendlyConnectError(err) });
      return;
    }
    await openMonitorOnPort(port);
  }, [supported, openMonitorOnPort]);

  const disconnect = useCallback(async () => {
    expectedCloseRef.current = true;
    await sessionRef.current?.close();
    sessionRef.current = null;
    setPhase({ kind: "disconnected" });
  }, []);

  // C2: reopens the monitor on the SAME port the flash flow just used, with
  // no re-prompt — the whole point of retaining connectedPort.
  const reopenMonitorSession = useCallback(async () => {
    if (connectedPort) await openMonitorOnPort(connectedPort);
  }, [connectedPort, openMonitorOnPort]);

  const handleFlashDone = useCallback(
    async (pins: { sda: number; scl: number }) => {
      await reopenMonitorSession();
      // Best effort — diag.ino's 2s config window just keeps its own
      // defaults (4/5) if this races the board still finishing its boot,
      // which isn't a failure, so a lost write here isn't either.
      await sessionRef.current?.write(JSON.stringify(pins) + "\n").catch(() => {});
      setFlashEntry(null);
    },
    [reopenMonitorSession]
  );

  // Belt-and-suspenders: if the whole app tears this down mid-session
  // (route change etc.), don't leave the port locked open.
  useEffect(() => {
    return () => {
      expectedCloseRef.current = true;
      sessionRef.current?.close();
    };
  }, []);

  const handleScroll = () => {
    const el = logRef.current;
    if (!el) return;
    pinnedToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  };

  useEffect(() => {
    if (!pinnedToBottomRef.current) return;
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  // C3: while connected with a plan to verify, refresh `verifyNow` once a
  // second so a device that's simply gone quiet (no new lines at all) still
  // crosses the waiting -> missing threshold on screen instead of waiting
  // forever for a line that's never coming. No setState call runs
  // synchronously in the effect body itself (react-hooks/set-state-in-effect)
  // — the render below covers the gap before the first tick by falling back
  // to verifyState.startedAt, which reads as "zero elapsed so far," exactly
  // right for a session that just started.
  useEffect(() => {
    if (phase.kind !== "connected" || !plan) return;
    const interval = setInterval(() => setVerifyNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [phase.kind, plan]);

  const expectedDevices = plan ? expectedI2cAddresses(plan) : EMPTY_DEVICES;
  // Date.now() itself is never called here (react-hooks/purity forbids
  // impure calls during render) — verifyNow (set from the effect above) is
  // the freshest clock reading we have; until its first tick, startedAt
  // doubles as "now" (zero elapsed, correctly all-"waiting").
  const verifyClockNow = verifyNow ?? verifyState?.startedAt ?? 0;
  const verdicts = verifyState ? deviceVerdicts(verifyState, expectedDevices, verifyClockNow) : EMPTY_VERDICTS;
  const unexpected = verifyState ? unexpectedDevices(verifyState, expectedDevices) : EMPTY_UNEXPECTED;

  // Fire once when the live bus proves every expected device — end-of-build gate.
  const verifiedRef = useRef(false);
  useEffect(() => {
    if (!onWiringVerified || verifiedRef.current) return;
    if (allExpectedFound(verdicts)) {
      verifiedRef.current = true;
      onWiringVerified();
    }
  }, [verdicts, onWiringVerified]);

  if (!open) return null;

  return (
    <DrawerShell title="Serial console" onClose={onClose} width="lg">
      {!supported && (
        <p className="text-sm text-text-secondary leading-relaxed">
          Your browser can&apos;t talk to USB devices — this works in Chrome or Edge. You can
          still use the code package with the Arduino IDE.
        </p>
      )}

      {supported && flashEntry && connectedPort ? (
        // C2 guided flash — gated on `flashEntry` alone, independent of
        // `phase`, which churns through disconnected/connecting/connected
        // while esptool-js drives the port directly underneath this view.
        <FlashFlow
          port={connectedPort}
          entry={flashEntry}
          i2cPins={i2cPins}
          closeMonitorSession={disconnect}
          onDone={handleFlashDone}
          onCancel={() => setFlashEntry(null)}
        />
      ) : (
        <>
          {supported && phase.kind !== "connected" && (
            <div className="space-y-3">
              <p className="text-sm text-text-secondary leading-relaxed">
                Plug your board in over USB, then connect here to watch it boot and print live —
                no extra app needed.
              </p>
              <Button variant="primary" onClick={connect} loading={phase.kind === "connecting"}>
                Connect your board
              </Button>
              {phase.kind === "error" && <p className="text-xs text-text-muted">{phase.message}</p>}
              {unplugged && phase.kind === "disconnected" && (
                <p className="text-xs text-warning">
                  Board disconnected. Plug it back in, then click Connect when you&apos;re ready.
                </p>
              )}
            </div>
          )}

          {supported && phase.kind === "connected" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full bg-success shrink-0" aria-hidden="true" />
                  <span className="text-sm text-text truncate">{phase.portLabel}</span>
                  <Badge tone="neutral" size="sm">{BAUD_RATE} baud</Badge>
                </div>
                <Button variant="secondary" size="sm" onClick={disconnect}>
                  Disconnect
                </Button>
              </div>

              {plan && (
                <WiringCheckCard plan={plan} verdicts={verdicts} unexpected={unexpected} onOpenUnstick={onOpenUnstick} />
              )}

              <div
                ref={logRef}
                onScroll={handleScroll}
                role="log"
                aria-label="Serial output"
                className="max-h-[50vh] overflow-y-auto rounded-lg bg-console-bg text-console-text font-mono text-2xs leading-relaxed p-3"
              >
                {lines.length === 0 ? (
                  <p className="text-console-text-muted">Waiting for data…</p>
                ) : (
                  lines.map((line) => <ConsoleLine key={line.id} text={line.text} />)
                )}
              </div>

              <FlashFirmwareSection onStart={setFlashEntry} />
            </div>
          )}
        </>
      )}
    </DrawerShell>
  );
}

/** "0x3C"-style two-digit uppercase hex, matching the wire format exactly (line-parser.ts / diag.ino). */
function hexAddr(n: number): string {
  return n.toString(16).toUpperCase().padStart(2, "0");
}

function ConsoleLine({ text }: { text: string }) {
  const parsed = parseScannerLine(text);
  if (parsed.kind === "i2c-found") {
    return (
      <div className="flex items-center gap-2 py-0.5 flex-wrap">
        <span className="text-accent">{text}</span>
        <Badge tone="info" size="sm">device at 0x{hexAddr(parsed.address)}</Badge>
      </div>
    );
  }
  if (parsed.kind === "boot") {
    return <div className="text-console-text-muted py-0.5 whitespace-pre-wrap break-words">{text}</div>;
  }
  return <div className="py-0.5 whitespace-pre-wrap break-words">{text}</div>;
}

/**
 * C3: "Wiring check" card — one row per expected I2C device (waiting /
 * found / missing), plus an info row for any address the scan found that no
 * expected device claims. Renders nothing when there's genuinely nothing to
 * report (e.g. a plan with no I2C parts and nothing unexpected on the bus
 * either) rather than showing an empty card shell.
 */
function WiringCheckCard({
  plan,
  verdicts,
  unexpected,
  onOpenUnstick,
}: {
  plan: BuildPlan;
  verdicts: DeviceVerdict[];
  unexpected: UnexpectedDevice[];
  onOpenUnstick?: (symptomHint: string) => void;
}) {
  if (verdicts.length === 0 && unexpected.length === 0) return null;
  return (
    <div className="rounded-lg border border-border-subtle bg-surface p-3 space-y-2">
      <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Wiring check</p>
      <ul className="space-y-1.5">
        {verdicts.map((v) => (
          <DeviceVerdictRow key={v.device.catalogId} plan={plan} verdict={v} verdicts={verdicts} onOpenUnstick={onOpenUnstick} />
        ))}
        {unexpected.map((u) => (
          <li key={u.address} className="text-xs text-text-muted">
            Unexpected device at 0x{hexAddr(u.address)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DeviceVerdictRow({
  plan,
  verdict,
  verdicts,
  onOpenUnstick,
}: {
  plan: BuildPlan;
  verdict: DeviceVerdict;
  verdicts: DeviceVerdict[];
  onOpenUnstick?: (symptomHint: string) => void;
}) {
  const { device, status, foundAddress } = verdict;
  // Lazy-mount the debug panel's diagram/diagnosis work only once the
  // builder actually opens it — stays mounted after that (even if they
  // collapse it again) so reopening doesn't redo the work or lose state.
  const [everOpened, setEverOpened] = useState(false);

  if (status === "waiting") {
    return (
      <li className="flex items-center gap-2 text-sm text-text-muted">
        <MiniSpinner />
        Checking for {device.label}…
      </li>
    );
  }

  if (status === "found") {
    return (
      <li className="text-sm text-success">
        ✓ {device.label} answered at 0x{hexAddr(foundAddress ?? device.addresses[0])}
      </li>
    );
  }

  // Missing — expand in place rather than jumping to a separate drawer, so
  // the live serial connection and the scan's 3s re-check loop never stop:
  // reflow the joint and watch this same row flip to the "found" branch
  // above while the panel stays open.
  return (
    <li>
      <details onToggle={(e) => (e.target as HTMLDetailsElement).open && setEverOpened(true)}>
        <summary className="flex items-center justify-between gap-2 flex-wrap list-none cursor-pointer">
          <span className="text-sm text-warning">
            ✗ {device.label} (0x{hexAddr(device.addresses[0])}) hasn&apos;t answered yet
          </span>
          <span className="text-xs text-accent font-medium shrink-0">Why isn&apos;t this found? ▾</span>
        </summary>
        {everOpened && (
          <MissingDeviceDebugPanel
            plan={plan}
            verdict={verdict}
            verdicts={verdicts}
            onOpenFullUnstick={onOpenUnstick ? () => onOpenUnstick(device.symptomHint) : undefined}
          />
        )}
      </details>
    </li>
  );
}

function MiniSpinner() {
  return (
    <svg className="animate-spin w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
