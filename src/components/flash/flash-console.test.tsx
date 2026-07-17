import "../../test-utils/dom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FlashConsole } from "./flash-console";
import { MISSING_AFTER_MS } from "@/lib/serial/verify";
import { applyTrustPipeline } from "@/lib/trust";
import type { BuildPlan } from "@/lib/types";
import demo from "@/data/sat-line.json";

// C3: same demo fixture + applyTrustPipeline pattern every other test in this
// codebase uses (firmware.test.ts, cart.test.ts, ...) — enrichParts (which
// binds the catalogIds expected-devices.ts reads) runs inside the trust
// pipeline, not on the raw JSON. Expects OLED (0x3C/0x3D) + SHT31 (0x44/0x45).
const planWithI2c = applyTrustPipeline(demo as unknown as BuildPlan);

const realDateNow = Date.now;

afterEach(() => {
  cleanup();
  // Reset the Web Serial mock between tests so "unsupported" is the default.
  try {
    delete (navigator as unknown as { serial?: unknown }).serial;
  } catch {
    /* ignore */
  }
  Date.now = realDateNow;
});

/** A fake SerialPort backed by a real ReadableStream, so session.ts's actual
 * pipe/reader/teardown code runs unmocked — only the USB layer is faked. */
function makeFakePort(opts: { vendorId?: number; bootLines?: string[]; selfClose?: boolean } = {}) {
  const { vendorId = 0x303a, bootLines = [], selfClose = false } = opts;
  const encoder = new TextEncoder();
  let closeCalls = 0;
  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of bootLines) controller.enqueue(encoder.encode(line + "\n"));
      // selfClose simulates a device that goes away on its own (unplugged);
      // otherwise the stream stays open, like a board still connected and quiet.
      // Delayed rather than synchronous so the "connected" state has a real
      // chance to render/settle first, same as an actual unplug would. This
      // timer starts ticking the instant the port is constructed — before
      // render() even runs — racing the async connect chain; 400ms (bumped
      // from 50ms in C2) gives that chain comfortable headroom to actually
      // reach and be *observed* in the "connected" state under a full-suite
      // parallel test run, not just "eventually" but within the narrow
      // window before this fires and flips it back to disconnected.
      if (selfClose) setTimeout(() => controller.close(), 400);
    },
  });
  const writable = new WritableStream<Uint8Array>({ write() {} });
  const port = {
    readable,
    writable,
    async open() {},
    async close() {
      closeCalls++;
    },
    getInfo() {
      return { usbVendorId: vendorId };
    },
  } as unknown as SerialPort;
  return { port, closeCalls: () => closeCalls };
}

function mockSerial(requestPort: () => Promise<SerialPort>) {
  Object.defineProperty(navigator, "serial", {
    value: { requestPort, getPorts: async () => [] },
    configurable: true,
  });
}

test("open=false renders nothing, even though the component is mounted", () => {
  const { container } = render(<FlashConsole open={false} onClose={() => {}} />);
  assert.equal(container.textContent, "");
});

test("unsupported browser: honest message, no fake connect button", () => {
  // jsdom's navigator has no .serial — the default, unmocked state.
  render(<FlashConsole open onClose={() => {}} />);
  assert.ok(screen.getByText(/can't talk to USB devices/i));
  assert.ok(screen.getByText(/Chrome or Edge/i));
  assert.equal(screen.queryByRole("button", { name: /connect/i }), null);
});

test("supported + disconnected: shows the Connect button", () => {
  mockSerial(async () => makeFakePort().port);
  render(<FlashConsole open onClose={() => {}} />);
  assert.ok(screen.getByRole("button", { name: /connect your board/i }));
});

test("connect flow: picker cancel (NotFoundError) is a calm, non-scary message", async () => {
  mockSerial(async () => {
    throw new DOMException("No port selected by the user.", "NotFoundError");
  });
  render(<FlashConsole open onClose={() => {}} />);
  await userEvent.click(screen.getByRole("button", { name: /connect your board/i }));
  await waitFor(() => assert.ok(screen.getByText(/no board selected/i)));
  // Still offers another attempt — this isn't a dead end.
  assert.ok(screen.getByRole("button", { name: /connect your board/i }));
});

test("connect flow: full happy path shows the board, baud, and live output", async () => {
  const { port } = makeFakePort({
    vendorId: 0x303a,
    bootLines: ["Forge I2C scanner", "SDA=GPIO4  SCL=GPIO5", "Found device at 0x3C"],
  });
  mockSerial(async () => port);

  render(<FlashConsole open onClose={() => {}} />);
  await userEvent.click(screen.getByRole("button", { name: /connect your board/i }));

  // Generous timeout: C2's FlashFirmwareSection fires a manifest fetch as
  // soon as this view reaches "connected," adding real async work a
  // full-suite parallel run can occasionally push past the default 1000ms.
  await waitFor(() => assert.ok(screen.getByText("ESP32 native USB")), { timeout: 2000 });
  assert.ok(screen.getByText(/115200 baud/));
  assert.ok(screen.getByRole("button", { name: /disconnect/i }));

  await waitFor(() => assert.ok(screen.getByText("Found device at 0x3C")));
  // "Found device at 0x3C" (the raw line) contains "device at 0x3C" as a
  // substring, so the highlighted line PLUS its own address chip both match
  // — two hits is the correct shape, not an ambiguity bug.
  assert.equal(
    screen.getAllByText(/device at 0x3C/).length,
    2,
    "the raw i2c-found line plus its own address chip"
  );
  assert.ok(screen.getByText(/SDA=GPIO4\s+SCL=GPIO5/), "plain lines render too, unhighlighted");
});

test("Disconnect is a deliberate action — no 'unplugged' note afterward", async () => {
  const { port, closeCalls } = makeFakePort({ bootLines: ["hello"] });
  mockSerial(async () => port);

  render(<FlashConsole open onClose={() => {}} />);
  await userEvent.click(screen.getByRole("button", { name: /connect your board/i }));
  await waitFor(() => assert.ok(screen.getByRole("button", { name: /disconnect/i })), { timeout: 2000 });

  await userEvent.click(screen.getByRole("button", { name: /disconnect/i }));
  await waitFor(() => assert.ok(screen.getByRole("button", { name: /connect your board/i })));
  assert.ok(closeCalls() >= 1, "the underlying port was actually closed");
  assert.equal(screen.queryByText(/board disconnected/i), null, "expected disconnects stay quiet");
});

test("the board going away on its own surfaces a gentle reconnect note", async () => {
  const { port } = makeFakePort({ bootLines: ["hello"], selfClose: true });
  mockSerial(async () => port);

  render(<FlashConsole open onClose={() => {}} />);
  await userEvent.click(screen.getByRole("button", { name: /connect your board/i }));
  // C2 added a manifest fetch to the "connected" render path (FlashFirmwareSection),
  // which under a full-suite parallel run adds enough real async/scheduling
  // pressure to occasionally miss testing-library's default 1000ms budget —
  // same generous-timeout treatment the very next assertion already uses below.
  await waitFor(() => assert.ok(screen.getByRole("button", { name: /disconnect/i })), { timeout: 2000 });

  // The fake stream closes itself right after its boot lines — same shape as
  // an unplug: the read loop ends without anyone clicking Disconnect.
  await waitFor(() => assert.ok(screen.getByText(/board disconnected/i)), { timeout: 2000 });
  assert.ok(screen.getByRole("button", { name: /connect your board/i }));
});

// --- C3: Wiring check card -------------------------------------------------

test("no plan prop: connecting never shows a Wiring check card (today's mounting passes none)", async () => {
  const { port } = makeFakePort({ bootLines: ["Found device at 0x3C"] });
  mockSerial(async () => port);

  render(<FlashConsole open onClose={() => {}} />);
  await userEvent.click(screen.getByRole("button", { name: /connect your board/i }));
  await waitFor(() => assert.ok(screen.getByRole("button", { name: /disconnect/i })), { timeout: 2000 });

  assert.equal(screen.queryByText(/wiring check/i), null);
});

test("plan present + connected: one waiting row per expected I2C device before anything answers", async () => {
  const { port } = makeFakePort({ bootLines: [] });
  mockSerial(async () => port);

  render(<FlashConsole open onClose={() => {}} plan={planWithI2c} />);
  await userEvent.click(screen.getByRole("button", { name: /connect your board/i }));

  await waitFor(() => assert.ok(screen.getByText(/wiring check/i)), { timeout: 2000 });
  assert.ok(screen.getByText(/checking for OLED display/i));
  assert.ok(screen.getByText(/checking for temp\/humidity sensor/i));
});

test("plan present + connected: a matching found line flips that device's row to a green verdict, others stay waiting", async () => {
  const { port } = makeFakePort({ bootLines: ["Found device at 0x3C"] });
  mockSerial(async () => port);

  render(<FlashConsole open onClose={() => {}} plan={planWithI2c} />);
  await userEvent.click(screen.getByRole("button", { name: /connect your board/i }));

  await waitFor(() => assert.ok(screen.getByText(/✓ OLED display answered at 0x3C/)), { timeout: 2000 });
  assert.ok(screen.getByText(/checking for temp\/humidity sensor/i), "SHT31 hasn't answered yet, still waiting");
});

test("plan present + connected: an address nobody expects shows as an unexpected-device info row, not a failure", async () => {
  const { port } = makeFakePort({ bootLines: ["Found device at 0x27"] });
  mockSerial(async () => port);

  render(<FlashConsole open onClose={() => {}} plan={planWithI2c} />);
  await userEvent.click(screen.getByRole("button", { name: /connect your board/i }));

  await waitFor(() => assert.ok(screen.getByText(/unexpected device at 0x27/i)), { timeout: 2000 });
  // Neither expected device answered, so both are still legitimately waiting — an
  // unexpected extra device is informational, never itself a "missing" verdict.
  assert.ok(screen.getByText(/checking for OLED display/i));
  assert.ok(screen.getByText(/checking for temp\/humidity sensor/i));
});

test("plan present + connected: a device that never answers turns amber with a working Debug button after the verification window", async () => {
  const { port } = makeFakePort({ bootLines: ["FORGE-DIAG v1 sda=4 scl=5"] }); // boots, but never finds anything
  mockSerial(async () => port);
  const hints: string[] = [];

  let now = 1_700_000_000_000;
  Date.now = () => now;

  render(<FlashConsole open onClose={() => {}} plan={planWithI2c} onOpenUnstick={(hint) => hints.push(hint)} />);
  await userEvent.click(screen.getByRole("button", { name: /connect your board/i }));
  await waitFor(() => assert.ok(screen.getByText(/checking for OLED display/i)), { timeout: 2000 });

  // Jump the mocked wall clock past the verification window — the console's
  // own 1s ticking interval (a real timer) is what actually re-renders with
  // this new value, so this still needs a short real wait below.
  now += MISSING_AFTER_MS + 1000;

  await waitFor(
    () => assert.ok(screen.getByText(/OLED display \(0x3C\) hasn't answered yet/)),
    { timeout: 2500 }
  );
  assert.ok(screen.getByText(/temp\/humidity sensor \(0x44\) hasn't answered yet/));

  const debugButtons = screen.getAllByRole("button", { name: /debug this/i });
  assert.equal(debugButtons.length, 2, "both the OLED and the sensor are missing");

  await userEvent.click(debugButtons[0]);
  assert.deepEqual(hints, ["blank_display"], "OLED's Debug button must emit unstick.ts's real blank_display symptom id");

  await userEvent.click(debugButtons[1]);
  assert.deepEqual(
    hints,
    ["blank_display", "sensor_wrong"],
    "the sensor's Debug button must emit unstick.ts's real sensor_wrong symptom id"
  );
});

test("plan present + connected, but onOpenUnstick omitted: missing devices show no Debug button (nothing to call)", async () => {
  const { port } = makeFakePort({ bootLines: [] });
  mockSerial(async () => port);

  let now = 1_700_000_000_000;
  Date.now = () => now;

  render(<FlashConsole open onClose={() => {}} plan={planWithI2c} />);
  await userEvent.click(screen.getByRole("button", { name: /connect your board/i }));
  await waitFor(() => assert.ok(screen.getByText(/checking for OLED display/i)), { timeout: 2000 });

  now += MISSING_AFTER_MS + 1000;
  await waitFor(
    () => assert.ok(screen.getByText(/OLED display \(0x3C\) hasn't answered yet/)),
    { timeout: 2500 }
  );
  assert.equal(screen.queryByRole("button", { name: /debug this/i }), null);
});
