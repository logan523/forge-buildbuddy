import "../../test-utils/dom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FlashFirmwareSection, FlashFlow } from "./flash-flow";
import type { FirmwareManifestEntry } from "@/lib/serial/manifest";

// esptool-js / real hardware is out of reach here — these tests cover:
//   1. FlashFirmwareSection's manifest-gated "honest card vs start button" logic
//   2. FlashFlow's boot-guidance panel (static, makes no esptool-js calls)
//   3. One real (unmocked) run through runAttempt's actual Transport/ESPLoader
//      construction, using a deliberately broken fake port so it fails fast
//      and deterministically instead of hanging on a real sync-retry timeout.
// The connecting -> flashing -> done happy path, and the wrong-mode /
// port-busy error classifications specifically, only make sense against a
// real board — see the C2 handoff notes for what that leaves unverified.

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = ORIGINAL_FETCH;
});

function mockManifestFetch(body: unknown, ok = true) {
  globalThis.fetch = (async () => ({
    ok,
    json: async () => body,
  })) as unknown as typeof fetch;
}

// --- FlashFirmwareSection ---------------------------------------------------

test("FlashFirmwareSection: no manifest reachable (default jsdom — fetch rejects on a relative URL) settles to the honest not-built card, no dead button", async () => {
  render(<FlashFirmwareSection onStart={() => {}} />);
  await waitFor(() => assert.ok(screen.getByText(/isn't built for ESP32-C3 yet/i)));
  assert.equal(screen.queryByRole("button", { name: /flash test firmware/i }), null);
});

test("FlashFirmwareSection: manifest fetches but has no esp32c3 entry -> the same honest card", async () => {
  mockManifestFetch({ families: {} });
  render(<FlashFirmwareSection onStart={() => {}} />);
  await waitFor(() => assert.ok(screen.getByText(/isn't built for ESP32-C3 yet/i)));
  assert.ok(screen.getByText(/Arduino IDE instead/i));
});

test("FlashFirmwareSection: a 404 (nobody has run firmware:diag yet) also settles to the honest card", async () => {
  mockManifestFetch(undefined, false);
  render(<FlashFirmwareSection onStart={() => {}} />);
  await waitFor(() => assert.ok(screen.getByText(/isn't built for ESP32-C3 yet/i)));
});

test("FlashFirmwareSection: manifest has an esp32c3 entry -> shows the start button and hands the exact entry to onStart", async () => {
  const entry: FirmwareManifestEntry = {
    bin: "/firmware/esp32c3/diag.bin",
    offset: 0,
    builtAt: "2026-07-17T00:00:00.000Z",
    sketch: "diag v1",
  };
  mockManifestFetch({ families: { esp32c3: entry } });

  let started: FirmwareManifestEntry | null = null;
  render(<FlashFirmwareSection onStart={(e) => (started = e)} />);

  const button = await waitFor(() => screen.getByRole("button", { name: /flash test firmware/i }));
  await userEvent.click(button);
  assert.deepEqual(started, entry);
});

// --- FlashFlow ---------------------------------------------------------------

const FAKE_ENTRY: FirmwareManifestEntry = {
  bin: "/firmware/esp32c3/diag.bin",
  offset: 0,
  builtAt: "2026-07-17T00:00:00.000Z",
  sketch: "diag v1",
};

// Never opened by the boot-guidance test (makes no esptool-js calls); the
// "Continue" test relies on it having no .open() so Transport.connect()
// fails immediately instead of retrying against real silence for ~20s.
function fakePort(): SerialPort {
  return {} as unknown as SerialPort;
}

test("FlashFlow: opens on the boot-guidance panel with the exact BOOT-mode copy", () => {
  render(
    <FlashFlow port={fakePort()} entry={FAKE_ENTRY} closeMonitorSession={async () => {}} onDone={async () => {}} onCancel={() => {}} />
  );
  assert.ok(screen.getByText(/put your board in flashing mode/i));
  assert.ok(
    screen.getByText(/hold the boot button, tap reset, then release boot — the board enters flashing mode/i)
  );
  assert.ok(screen.getByRole("button", { name: /^continue$/i }));
});

test("FlashFlow: Cancel from boot-guidance calls onCancel without starting an attempt", async () => {
  let cancelled = false;
  render(
    <FlashFlow
      port={fakePort()}
      entry={FAKE_ENTRY}
      closeMonitorSession={async () => {
        throw new Error("must not be called — Cancel shouldn't touch the port");
      }}
      onDone={async () => {}}
      onCancel={() => {
        cancelled = true;
      }}
    />
  );
  await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
  assert.equal(cancelled, true);
});

test("FlashFlow: Continue drives the real esptool-js Transport/ESPLoader construction; a synchronous connect failure surfaces as a calm generic error, and the monitor was closed first", async () => {
  let monitorClosed = false;
  render(
    <FlashFlow
      port={fakePort()} // no .open() — Transport.connect() throws immediately instead of retrying
      entry={FAKE_ENTRY}
      closeMonitorSession={async () => {
        monitorClosed = true;
      }}
      onDone={async () => {}}
      onCancel={() => {}}
    />
  );
  await userEvent.click(screen.getByRole("button", { name: /^continue$/i }));
  await waitFor(() => assert.ok(screen.getByText(/^flashing failed$/i)));
  assert.equal(monitorClosed, true, "esptool-js must never touch the port before the monitor session is closed");
  assert.ok(screen.getByRole("button", { name: /try again/i }));
});
