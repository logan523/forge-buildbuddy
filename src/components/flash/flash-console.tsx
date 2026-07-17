"use client";

/**
 * Web Serial console (C1): connect to a board over USB and watch it live —
 * no separate app, no drivers to hunt down blind. Foundation for C2 (flash
 * over Web Serial) and C3 (I2C-scan verification against the plan) — both
 * build on the session this opens, so the connection is kept alive across
 * `open` toggles instead of being torn down whenever the panel is hidden
 * (see the `open` prop contract below).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { DrawerShell, Button, Badge } from "@/components/ui";
import { serialSupported, describePort, openSession, type SerialSession } from "@/lib/serial/session";
import { parseScannerLine } from "@/lib/serial/line-parser";
import type { FirmwareManifestEntry } from "@/lib/serial/manifest";
import { FlashFlow, FlashFirmwareSection } from "./flash-flow";

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
}

const BAUD_RATE = 115200;
const MAX_LINES = 500;

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

export function FlashConsole({ open, onClose, i2cPins }: FlashConsoleProps) {
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
  }, []);

  // Opens the monitor on an already-picked port — shared by connect() (fresh
  // navigator.serial.requestPort()) and reopenMonitorSession() (C2: reusing
  // the retained port after a flash, with no re-prompt).
  const openMonitorOnPort = useCallback(
    async (port: SerialPort) => {
      setUnplugged(false);
      setLines([]);
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
    [appendLine]
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

function ConsoleLine({ text }: { text: string }) {
  const parsed = parseScannerLine(text);
  if (parsed.kind === "i2c-found") {
    const addr = parsed.address.toString(16).toUpperCase().padStart(2, "0");
    return (
      <div className="flex items-center gap-2 py-0.5 flex-wrap">
        <span className="text-accent">{text}</span>
        <Badge tone="info" size="sm">device at 0x{addr}</Badge>
      </div>
    );
  }
  if (parsed.kind === "boot") {
    return <div className="text-console-text-muted py-0.5 whitespace-pre-wrap break-words">{text}</div>;
  }
  return <div className="py-0.5 whitespace-pre-wrap break-words">{text}</div>;
}
