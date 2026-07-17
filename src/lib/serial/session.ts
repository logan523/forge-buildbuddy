/**
 * Web Serial domain layer — connect + live monitor for C1. Pure-ish: the
 * only side effects are the Web Serial calls themselves (port.open/close,
 * stream piping); no three.js, no React, so it's usable from any future
 * surface (flashing in C2, I2C-scan verification in C3) without dragging in
 * UI. Types (SerialPort, Serial, SerialPortInfo, ...) come from the ambient
 * globals in ./types.ts — no import needed for them.
 */

import { LineSplitter } from "./line-parser";

/** True only in browsers that expose the Web Serial API (Chromium-based). */
export function serialSupported(): boolean {
  return typeof navigator !== "undefined" && "serial" in navigator;
}

// USB vendor IDs for the USB-to-serial chips builders actually plug in.
// Best-effort only — this is a driver-guessing convenience, not a device
// identity check, so it feeds copy like "Detected: WCH CH340", never a
// pass/fail gate. Finer-grained guesses (e.g. by usbProductId) can layer on
// top later without changing this function's contract.
const VENDOR_CHIP_NAMES: Record<number, string> = {
  0x1a86: "WCH CH340",
  0x10c4: "Silicon Labs CP210x",
  0x303a: "ESP32 native USB",
  0x0403: "FTDI",
};

/** Best-effort human name for the USB-serial chip behind a port. */
export function describePort(info: SerialPortInfo): string {
  if (info.usbVendorId != null && info.usbVendorId in VENDOR_CHIP_NAMES) {
    return VENDOR_CHIP_NAMES[info.usbVendorId];
  }
  return "USB serial device";
}

export type SerialSessionStatus = "open" | "closed";

export interface SerialSessionOptions {
  /** Defaults to 115200 — matches every sketch Forge generates (firmware.ts). */
  baudRate?: number;
  /** Fires once per complete line, in order, \r\n-normalized. */
  onLine: (line: string) => void;
  /** Lifecycle hook: "open" once port.open() succeeds, "closed" on any teardown. */
  onStatus?: (status: SerialSessionStatus) => void;
  /** Fires on teardown regardless of cause (explicit close() or the device vanishing). */
  onClose?: () => void;
}

export interface SerialSession {
  write(text: string): Promise<void>;
  close(): Promise<void>;
}

/**
 * Open a session on an already-picked port (navigator.serial.requestPort()
 * must be called from a real user gesture, so that call stays in the UI
 * layer — this takes the resulting SerialPort and does everything after).
 *
 * Follows the standard Web Serial read-loop shape (port.readable piped
 * through a TextDecoderStream, reader cancelled + released before
 * port.close()) so teardown is safe whether it's triggered by the caller,
 * a read error, or the device being unplugged mid-session.
 */
export async function openSession(
  port: SerialPort,
  options: SerialSessionOptions
): Promise<SerialSession> {
  const { baudRate = 115200, onLine, onStatus, onClose } = options;

  await port.open({ baudRate });
  onStatus?.("open");

  if (!port.readable) {
    await port.close().catch(() => {});
    throw new Error("Serial port opened without a readable stream.");
  }

  const splitter = new LineSplitter();
  const textDecoder = new TextDecoderStream();
  // TS types TextDecoderStream.writable as WritableStream<BufferSource>, one
  // notch wider than ReadableStream<Uint8Array>.pipeTo's expected type — a
  // Uint8Array always satisfies BufferSource, so this is a type-system gap,
  // not a real mismatch. Standard cast for this exact pairing.
  const readableStreamClosed = port.readable
    .pipeTo(textDecoder.writable as WritableStream<Uint8Array>)
    .catch(() => {
      // A broken upstream pipe (e.g. device unplugged) surfaces through the
      // reader loop below and is handled by teardown(); nothing more to do here.
    });
  const reader = textDecoder.readable.getReader();

  let closed = false;
  const teardown = async () => {
    if (closed) return;
    closed = true;
    try {
      await reader.cancel();
    } catch {
      /* already errored/closed */
    }
    await readableStreamClosed;
    try {
      reader.releaseLock();
    } catch {
      /* stream already torn down */
    }
    try {
      await port.close();
    } catch {
      /* device may already be gone */
    }
    onStatus?.("closed");
    onClose?.();
  };

  void (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          for (const line of splitter.push(value)) onLine(line);
        }
      }
    } catch {
      // Read failure — most commonly the board being unplugged mid-session.
    } finally {
      await teardown();
    }
  })();

  return {
    async write(text: string) {
      if (!port.writable) throw new Error("Serial port is not writable.");
      const writer = port.writable.getWriter();
      try {
        await writer.write(new TextEncoder().encode(text));
      } finally {
        writer.releaseLock();
      }
    },
    async close() {
      await teardown();
    },
  };
}
