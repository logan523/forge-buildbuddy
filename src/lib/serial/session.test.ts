import { test } from "node:test";
import assert from "node:assert/strict";
import { serialSupported, describePort } from "./session";

test("serialSupported is false without a DOM (SSR / node:test has no navigator)", () => {
  assert.equal(serialSupported(), false);
});

test("serialSupported reflects navigator.serial presence when navigator exists", () => {
  // Node ships a read-only global `navigator` getter, so swap it via
  // defineProperty (configurable) rather than plain assignment.
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  try {
    Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });
    assert.equal(serialSupported(), false, "no .serial property");
    Object.defineProperty(globalThis, "navigator", { value: { serial: {} }, configurable: true });
    assert.equal(serialSupported(), true);
  } finally {
    if (original) Object.defineProperty(globalThis, "navigator", original);
  }
});

test("describePort recognizes the known USB-serial chips by vendor ID", () => {
  assert.equal(describePort({ usbVendorId: 0x1a86 }), "WCH CH340");
  assert.equal(describePort({ usbVendorId: 0x10c4 }), "Silicon Labs CP210x");
  assert.equal(describePort({ usbVendorId: 0x303a }), "ESP32 native USB");
  assert.equal(describePort({ usbVendorId: 0x0403 }), "FTDI");
});

test("describePort falls back honestly for unknown or missing vendor IDs", () => {
  assert.equal(describePort({ usbVendorId: 0xffff }), "USB serial device");
  assert.equal(describePort({}), "USB serial device");
});
