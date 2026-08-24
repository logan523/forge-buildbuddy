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
const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  cleanup();
  // Reset the Web Serial mock between tests so "unsupported" is the default.
  try {
    delete (navigator as unknown as { serial?: unknown }).serial;
  } catch {
    /* ignore */
  }
  Date.now = realDateNow;
  globalThis.fetch = ORIGINAL_FETCH;
});

function mockManifestFetch(body: unknown) {
  globalThis.fetch = (async () => ({ ok: true, json: async () => body })) as unknown as typeof fetch;
}

/** A fake SerialPort backed by a real ReadableStream, so session.ts's actual
 * pipe/reader/teardown code runs unmocked — only the USB layer is faked. */
function makeFakePort(opts: { vendorId?: number; bootLines?: string[]; selfClose?: boolean } = {}) {
  const { vendorId = 0x303a, bootLines = [], selfClose = false } = opts;
  const encoder = new TextEncoder();
  let closeCalls = 0;
  // Captured so a test can push a line AFTER the initial render/interaction
  // (e.g. simulate a device answering mid-session) — start() only runs once,
  // synchronously, when the stream is first read, so this outer variable is
  // the only way to reach the controller later.
  let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
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
  return {
    port,
    closeCalls: () => closeCalls,
    pushLine: (text: string) => streamController?.enqueue(encoder.encode(text + "\n")),
  };
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

test("plan present + connected: a device that never answers turns amber with an inline debug panel that expands without losing the connection", async () => {
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

  const toggles = screen.getAllByText(/why isn't this found/i);
  assert.equal(toggles.length, 2, "both the OLED and the sensor are missing");

  // Clicking the toggle expands the panel IN PLACE — it must never call
  // onOpenUnstick (that would close the live serial connection, the exact
  // regression this rewrite fixes).
  await userEvent.click(toggles[0]);
  await waitFor(() => assert.ok(screen.getByText(/sda and scl wires are swapped/i)), { timeout: 2000 });
  assert.deepEqual(hints, [], "expanding the inline panel must not call onOpenUnstick / close the connection");
  assert.ok(screen.getByRole("button", { name: /disconnect/i }), "the live connection stays open while the panel is expanded");
  assert.ok(screen.getByText(/wiring check/i), "the wiring-check card (and its live re-scan loop) is still mounted");

  // The escape hatch still reaches the generic drawer with the right hint.
  await userEvent.click(screen.getByText(/open full troubleshooting/i));
  assert.deepEqual(hints, ["blank_display"], "OLED's escape hatch must emit unstick.ts's real blank_display symptom id");
});

test("plan present + connected, but onOpenUnstick omitted: the inline panel still renders, just with no escape-hatch link", async () => {
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

  await userEvent.click(screen.getAllByText(/why isn't this found/i)[0]);
  await waitFor(() => assert.ok(screen.getByText(/i2c address in code/i)), { timeout: 2000 });
  assert.equal(screen.queryByText(/open full troubleshooting/i), null);
});

test("plan present + connected: expanding a missing device's panel shows sibling-proven reassurance + a focused diagram, and the row flips to found live while the panel stays open", async () => {
  const { port, pushLine } = makeFakePort({ bootLines: ["FORGE-DIAG v1 sda=4 scl=5"] });
  mockSerial(async () => port);

  let now = 1_700_000_000_000;
  Date.now = () => now;

  render(<FlashConsole open onClose={() => {}} plan={planWithI2c} />);
  await userEvent.click(screen.getByRole("button", { name: /connect your board/i }));
  await waitFor(() => assert.ok(screen.getByText(/checking for OLED display/i)), { timeout: 2000 });

  // The sensor answers first; the OLED does not.
  pushLine("Found device at 0x44");
  await waitFor(() => assert.ok(screen.getByText(/✓ temp\/humidity sensor answered at 0x44/)));

  now += MISSING_AFTER_MS + 1000;
  await waitFor(
    () => assert.ok(screen.getByText(/OLED display \(0x3C\) hasn't answered yet/)),
    { timeout: 2500 }
  );

  await userEvent.click(screen.getByText(/why isn't this found/i));
  await waitFor(() => assert.ok(screen.getByText(/already answered on the exact same/i)));
  assert.ok(document.querySelector("svg"), "the focused circuit diagram renders");

  // The OLED itself now answers — proving the live re-scan loop (a real
  // setInterval + the underlying stream read) kept running underneath the
  // open panel, and that the SAME row instance (keyed by catalogId) flips
  // straight from the "missing" branch to the "found" branch.
  pushLine("Found device at 0x3C");
  await waitFor(() => assert.ok(screen.getByText(/✓ OLED display answered at 0x3C/)), { timeout: 2500 });
});

// --- B2: generic customFirmware flash section (replaces the old hardcoded plan-id gate) ---

const planWithCustomFirmware: BuildPlan = {
  ...planWithI2c,
  id: "solar-weather-clock",
  customFirmware: {
    id: "solar-weather-clock",
    label: "Solar Weather Clock firmware",
    boardFamily: "esp32c3",
    entryFile: "weather-clock.ino",
    files: [],
    authoredBy: "human",
  },
};

test("customFirmware present, but not compiled yet (no manifest.customSketches entry for this plan id) — honest message, no dead button", async () => {
  mockManifestFetch({ families: {} });
  const { port } = makeFakePort();
  mockSerial(async () => port);

  render(<FlashConsole open onClose={() => {}} plan={planWithCustomFirmware} />);
  await userEvent.click(screen.getByRole("button", { name: /connect your board/i }));
  await waitFor(() => assert.ok(screen.getByRole("button", { name: /disconnect/i })), { timeout: 2000 });

  await waitFor(() => assert.ok(screen.getByText(/Solar Weather Clock firmware isn't compiled yet/i)));
  assert.match(
    screen.getByText(/scripts\/compile-firmware\.mjs/).textContent ?? "",
    /--key solar-weather-clock/,
    "the exact compile command for this plan is shown, not a generic placeholder"
  );
  assert.equal(screen.queryByRole("button", { name: /flash solar weather clock firmware/i }), null);
});

test("customFirmware present AND compiled (manifest.customSketches has this plan's entry) — a real button, wired to the right entry, not the old hardcoded id gate", async () => {
  mockManifestFetch({
    families: {},
    customSketches: {
      "solar-weather-clock": {
        bin: "/firmware/esp32c3/solar-weather-clock.bin",
        offset: 0,
        builtAt: "2026-08-14T00:00:00.000Z",
        sketch: "Solar Weather Clock firmware",
        buildId: "a3f9c1c2",
      },
    },
  });
  const { port } = makeFakePort();
  mockSerial(async () => port);

  render(<FlashConsole open onClose={() => {}} plan={planWithCustomFirmware} />);
  await userEvent.click(screen.getByRole("button", { name: /connect your board/i }));
  await waitFor(() => assert.ok(screen.getByRole("button", { name: /disconnect/i })), { timeout: 2000 });

  const button = await waitFor(() => screen.getByRole("button", { name: /flash solar weather clock firmware/i }));
  await userEvent.click(button);
  // Clicking swaps the whole panel to FlashFlow's boot-guidance view — proves
  // the resolved manifest entry actually reached FlashFlow, the same
  // integration point every plan's custom firmware now shares (no more
  // one-off hardcoded id check).
  await waitFor(() => assert.ok(screen.getByText(/put your board in flashing mode/i)));
});

test("a plan with no customFirmware at all never renders the custom-firmware section", async () => {
  mockManifestFetch({ families: {} });
  const { port } = makeFakePort();
  mockSerial(async () => port);

  render(<FlashConsole open onClose={() => {}} plan={planWithI2c} />);
  await userEvent.click(screen.getByRole("button", { name: /connect your board/i }));
  await waitFor(() => assert.ok(screen.getByRole("button", { name: /disconnect/i })), { timeout: 2000 });

  assert.equal(screen.queryByText(/isn't compiled yet/i), null);
  assert.equal(screen.queryByText(/^Flash /i), null);
});
