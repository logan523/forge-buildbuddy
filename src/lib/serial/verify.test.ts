import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createVerifyState,
  feedLine,
  deviceVerdicts,
  unexpectedDevices,
  allExpectedFound,
  MISSING_AFTER_MS,
} from "./verify";
import type { ScannerLine } from "./line-parser";
import type { ExpectedDevice } from "./expected-devices";

function device(overrides: Partial<ExpectedDevice> = {}): ExpectedDevice {
  return {
    addresses: [0x3c],
    label: "OLED display",
    partName: "OLED Display",
    catalogId: "ssd1306-i2c",
    symptomHint: "blank_display",
    ...overrides,
  };
}

const found = (address: number): ScannerLine => ({ kind: "i2c-found", address });

describe("createVerifyState", () => {
  it("starts with an empty foundAt map and the given startedAt", () => {
    assert.deepEqual(createVerifyState(1000), { startedAt: 1000, foundAt: new Map() });
  });
});

describe("feedLine", () => {
  it("boot-noise lines are a no-op — same state reference back", () => {
    const state = createVerifyState(0);
    const next = feedLine(state, { kind: "boot" }, 100);
    assert.equal(next, state);
  });

  it("plain lines are a no-op — same state reference back", () => {
    const state = createVerifyState(0);
    const next = feedLine(state, { kind: "plain" }, 100);
    assert.equal(next, state);
  });

  it("an i2c-found line records the address at the given timestamp", () => {
    const state = createVerifyState(0);
    const next = feedLine(state, found(0x3c), 500);
    assert.deepEqual(next.foundAt, new Map([[0x3c, 500]]));
    assert.equal(next.startedAt, 0);
  });

  it("does not mutate the original state's map (pure)", () => {
    const state = createVerifyState(0);
    const originalSize = state.foundAt.size;
    feedLine(state, found(0x3c), 500);
    assert.equal(state.foundAt.size, originalSize, "original state must be untouched");
  });

  it("a repeat of an already-known address is a no-op — same reference, first-seen time unchanged", () => {
    const state = feedLine(createVerifyState(0), found(0x3c), 500);
    const next = feedLine(state, found(0x3c), 9999);
    assert.equal(next, state);
    assert.equal(next.foundAt.get(0x3c), 500, "first-seen timestamp must not be overwritten by a later sighting");
  });

  it("accumulates multiple distinct addresses across calls", () => {
    let state = createVerifyState(0);
    state = feedLine(state, found(0x3c), 100);
    state = feedLine(state, found(0x44), 200);
    assert.deepEqual(state.foundAt, new Map([[0x3c, 100], [0x44, 200]]));
  });
});

describe("deviceVerdicts", () => {
  it("an expected device is 'waiting' before anything is found and before MISSING_AFTER_MS elapses", () => {
    const state = createVerifyState(0);
    const verdicts = deviceVerdicts(state, [device()], 100);
    assert.deepEqual(verdicts, [{ device: device(), status: "waiting" }]);
  });

  it("an expected device is 'found' once its primary address is seen, with foundAddress set", () => {
    const state = feedLine(createVerifyState(0), found(0x3c), 50);
    const verdicts = deviceVerdicts(state, [device()], 100);
    assert.deepEqual(verdicts, [{ device: device(), status: "found", foundAddress: 0x3c }]);
  });

  it("an expected device is 'found' via its ALT address, not just the primary", () => {
    const bme = device({ addresses: [0x76, 0x77], catalogId: "bme280", label: "pressure/temp/humidity sensor" });
    const state = feedLine(createVerifyState(0), found(0x77), 50);
    const verdicts = deviceVerdicts(state, [bme], 100);
    assert.deepEqual(verdicts, [{ device: bme, status: "found", foundAddress: 0x77 }]);
  });

  it("stays 'waiting' one millisecond before MISSING_AFTER_MS has elapsed", () => {
    const state = createVerifyState(0);
    const verdicts = deviceVerdicts(state, [device()], MISSING_AFTER_MS - 1);
    assert.equal(verdicts[0].status, "waiting");
  });

  it("becomes 'missing' at exactly MISSING_AFTER_MS elapsed with nothing found (inclusive boundary)", () => {
    const state = createVerifyState(0);
    const verdicts = deviceVerdicts(state, [device()], MISSING_AFTER_MS);
    assert.equal(verdicts[0].status, "missing");
  });

  it("stays 'missing' well past MISSING_AFTER_MS", () => {
    const state = createVerifyState(0);
    const verdicts = deviceVerdicts(state, [device()], MISSING_AFTER_MS * 10);
    assert.equal(verdicts[0].status, "missing");
  });

  it("elapsed time is measured from startedAt, not from zero", () => {
    const state = createVerifyState(5000);
    // Only MISSING_AFTER_MS - 1 ms have actually elapsed since startedAt.
    const verdicts = deviceVerdicts(state, [device()], 5000 + MISSING_AFTER_MS - 1);
    assert.equal(verdicts[0].status, "waiting");
  });

  it("a late-arriving address flips a device back from missing to found — found is never a dead end", () => {
    let state = createVerifyState(0);
    // Confirm it would read as missing without the late line.
    assert.equal(deviceVerdicts(state, [device()], MISSING_AFTER_MS + 5000)[0].status, "missing");
    state = feedLine(state, found(0x3c), MISSING_AFTER_MS + 5000);
    const verdicts = deviceVerdicts(state, [device()], MISSING_AFTER_MS + 5001);
    assert.deepEqual(verdicts[0], { device: device(), status: "found", foundAddress: 0x3c });
  });

  it("multiple expected devices get independent verdicts", () => {
    const oled = device();
    const sht = device({ addresses: [0x44], catalogId: "sht31d", label: "temp/humidity sensor" });
    const bme = device({ addresses: [0x76, 0x77], catalogId: "bme280", label: "pressure/temp/humidity sensor" });

    const state = feedLine(createVerifyState(0), found(0x3c), 10); // only the OLED answers
    const verdicts = deviceVerdicts(state, [oled, sht, bme], MISSING_AFTER_MS);

    assert.deepEqual(verdicts, [
      { device: oled, status: "found", foundAddress: 0x3c },
      { device: sht, status: "missing" },
      { device: bme, status: "missing" },
    ]);
  });

  it("an empty expected list yields no verdicts", () => {
    assert.deepEqual(deviceVerdicts(createVerifyState(0), [], 100), []);
  });
});

describe("allExpectedFound", () => {
  it("false when empty (nothing to verify)", () => {
    assert.equal(allExpectedFound([]), false);
  });

  it("true only when every device is found", () => {
    const oled = device();
    const sht = device({ addresses: [0x44], catalogId: "sht31d", label: "sht" });
    let state = createVerifyState(0);
    state = feedLine(state, found(0x3c), 10);
    const half = deviceVerdicts(state, [oled, sht], 20);
    assert.equal(allExpectedFound(half), false);
    state = feedLine(state, found(0x44), 30);
    const full = deviceVerdicts(state, [oled, sht], 40);
    assert.equal(allExpectedFound(full), true);
  });
});

describe("unexpectedDevices", () => {
  it("a found address matching no expected device is reported", () => {
    const state = feedLine(createVerifyState(0), found(0x27), 100); // e.g. a PCF8574 I2C backpack
    assert.deepEqual(unexpectedDevices(state, [device()]), [{ address: 0x27, firstSeenAt: 100 }]);
  });

  it("a found address matching an expected device's PRIMARY address is not unexpected", () => {
    const state = feedLine(createVerifyState(0), found(0x3c), 100);
    assert.deepEqual(unexpectedDevices(state, [device()]), []);
  });

  it("a found address matching an expected device's ALT address is not unexpected", () => {
    const bme = device({ addresses: [0x76, 0x77], catalogId: "bme280" });
    const state = feedLine(createVerifyState(0), found(0x77), 100);
    assert.deepEqual(unexpectedDevices(state, [bme]), []);
  });

  it("multiple unexpected addresses are sorted ascending", () => {
    let state = createVerifyState(0);
    state = feedLine(state, found(0x50), 100);
    state = feedLine(state, found(0x20), 200);
    state = feedLine(state, found(0x68), 300);
    assert.deepEqual(unexpectedDevices(state, []), [
      { address: 0x20, firstSeenAt: 200 },
      { address: 0x50, firstSeenAt: 100 },
      { address: 0x68, firstSeenAt: 300 },
    ]);
  });

  it("nothing found yields no unexpected devices", () => {
    assert.deepEqual(unexpectedDevices(createVerifyState(0), [device()]), []);
  });
});
