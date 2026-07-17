/**
 * Minimal ambient Web Serial API typings (Chromium-only; not in TS's DOM lib
 * yet, and pulling in the full @types/w3c-web-serial package for four
 * interfaces isn't worth the dependency).
 *
 * IMPORTANT: this file has no top-level import/export on purpose. That makes
 * it a TS "script" rather than a module, so every declaration below merges
 * straight into the global scope — any file in the program can reference
 * `SerialPort`, `Serial`, `SerialPortInfo`, etc. by name with no import, and
 * `navigator.serial` type-checks everywhere via the Navigator merge. Adding
 * an import/export here would turn this into a module and break that.
 */

interface SerialPortInfo {
  usbVendorId?: number;
  usbProductId?: number;
}

interface SerialOptions {
  baudRate: number;
  dataBits?: 7 | 8;
  stopBits?: 1 | 2;
  parity?: "none" | "even" | "odd";
  bufferSize?: number;
  flowControl?: "none" | "hardware";
}

interface SerialPort extends EventTarget {
  readonly readable: ReadableStream<Uint8Array> | null;
  readonly writable: WritableStream<Uint8Array> | null;
  open(options: SerialOptions): Promise<void>;
  close(): Promise<void>;
  forget?(): Promise<void>;
  getInfo(): SerialPortInfo;
}

interface SerialPortFilter {
  usbVendorId?: number;
  usbProductId?: number;
}

interface SerialPortRequestOptions {
  filters?: SerialPortFilter[];
}

interface Serial extends EventTarget {
  requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>;
  getPorts(): Promise<SerialPort[]>;
}

// Pure declaration merge into lib.dom.d.ts's global Navigator — nothing in
// this file references the name "Navigator" itself, so the linter can't see
// the merge as a "use." That's expected for this pattern.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface Navigator {
  /** Undefined in browsers without Web Serial (Firefox, Safari, SSR). */
  readonly serial?: Serial;
}
