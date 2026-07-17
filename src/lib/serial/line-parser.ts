/**
 * Pure serial-line handling — no I/O, no DOM, no React. This is the
 * unit-tested core of the serial console (src/lib/serial/line-parser.test.ts).
 */

/**
 * Incremental line splitter: decoded text chunks in, complete lines out.
 * Handles both "\n" and "\r\n" terminators and carries a partial trailing
 * line across chunk boundaries until its terminator arrives.
 *
 * Feed it strings (session.ts pipes the raw USB bytes through a
 * TextDecoderStream first, so by the time text reaches this class it's
 * already decoded) — this class only owns line-boundary bookkeeping.
 */
export class LineSplitter {
  private buffer = "";

  /** Feed one chunk of decoded text; returns zero or more completed lines. */
  push(chunk: string): string[] {
    this.buffer += chunk;
    const lines: string[] = [];
    for (;;) {
      const nl = this.buffer.indexOf("\n");
      if (nl === -1) break;
      let line = this.buffer.slice(0, nl);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      lines.push(line);
      this.buffer = this.buffer.slice(nl + 1);
    }
    return lines;
  }

  /** The not-yet-terminated tail currently buffered (mainly for tests). */
  pendingTail(): string {
    return this.buffer;
  }

  /** Emit any buffered partial line as a final line (e.g. on disconnect) and reset. */
  flush(): string[] {
    let line = this.buffer;
    this.buffer = "";
    if (line.endsWith("\r")) line = line.slice(0, -1);
    return line ? [line] : [];
  }
}

export type ScannerLine =
  | { kind: "i2c-found"; address: number }
  | { kind: "boot" }
  | { kind: "plain" };

// Matches the EXACT print format of the generated I2C scanner sketch
// (src/lib/firmware.ts, sketchI2cScanner's loop()):
//
//   Serial.print("Found device at 0x");
//   if (addr < 16) Serial.print("0");
//   Serial.println(addr, HEX);
//
// Arduino's `Serial.println(byte, HEX)` prints uppercase hex with no
// leading zero, so the sketch pads it itself — the wire format is always
// exactly two hex digits, e.g. "Found device at 0x3C" for the OLED at 0x3C.
// Matched case-insensitively so a manual/adjacent sketch that lowercases
// hex still classifies correctly.
const I2C_FOUND_RE = /found device at 0x([0-9a-f]{1,2})\b/i;

// ESP32 ROM bootloader banner noise, e.g.:
//   rst:0x1 (POWERON_RESET),boot:0x13 (SPI_FAST_FLASH_BOOT)
// Beginners see this on every power-up/reset and it looks like a crash —
// worth telling apart from real scanner/sketch output.
const BOOT_NOISE_RE = /\brst:|\bboot:/i;

/**
 * Classify one already-split serial line. Anticipates C3 (I2C-scan
 * verification): the console highlights "i2c-found" lines live, and a later
 * slice will cross-check found addresses against the plan's expected parts.
 */
export function parseScannerLine(line: string): ScannerLine {
  const found = line.match(I2C_FOUND_RE);
  if (found) {
    const address = parseInt(found[1], 16);
    if (!Number.isNaN(address)) return { kind: "i2c-found", address };
  }
  if (BOOT_NOISE_RE.test(line)) return { kind: "boot" };
  return { kind: "plain" };
}
