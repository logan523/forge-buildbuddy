import { test } from "node:test";
import assert from "node:assert/strict";
import { loadFirmwareManifest } from "./manifest";

function fakeFetch(response: { ok: boolean; json?: () => Promise<unknown> }): typeof fetch {
  return (async () => response as unknown as Response) as typeof fetch;
}

test("loadFirmwareManifest: a valid manifest with one family passes through untouched", async () => {
  const manifest = await loadFirmwareManifest(
    fakeFetch({
      ok: true,
      json: async () => ({
        families: {
          esp32c3: {
            bin: "/firmware/esp32c3/diag.bin",
            offset: 0,
            builtAt: "2026-07-17T00:00:00.000Z",
            sketch: "diag v1",
          },
        },
      }),
    })
  );
  assert.deepEqual(manifest, {
    families: {
      esp32c3: {
        bin: "/firmware/esp32c3/diag.bin",
        offset: 0,
        builtAt: "2026-07-17T00:00:00.000Z",
        sketch: "diag v1",
      },
    },
  });
});

test('loadFirmwareManifest: the honest empty manifest ({"families":{}}) round-trips to empty', async () => {
  const manifest = await loadFirmwareManifest(fakeFetch({ ok: true, json: async () => ({ families: {} }) }));
  assert.deepEqual(manifest, { families: {} });
});

test("loadFirmwareManifest: 404 (nobody has run firmware:diag yet) tolerates to empty", async () => {
  const manifest = await loadFirmwareManifest(fakeFetch({ ok: false }));
  assert.deepEqual(manifest, { families: {} });
});

test("loadFirmwareManifest: a rejected fetch (network error) tolerates to empty", async () => {
  const throwing = (async () => {
    throw new TypeError("Failed to fetch");
  }) as typeof fetch;
  const manifest = await loadFirmwareManifest(throwing);
  assert.deepEqual(manifest, { families: {} });
});

test("loadFirmwareManifest: malformed JSON (res.json() rejects) tolerates to empty", async () => {
  const manifest = await loadFirmwareManifest(
    fakeFetch({
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    })
  );
  assert.deepEqual(manifest, { families: {} });
});

test("loadFirmwareManifest: top-level shape wrong (not an object) tolerates to empty", async () => {
  const manifest = await loadFirmwareManifest(fakeFetch({ ok: true, json: async () => null }));
  assert.deepEqual(manifest, { families: {} });
});

test("loadFirmwareManifest: families missing entirely tolerates to empty", async () => {
  const manifest = await loadFirmwareManifest(fakeFetch({ ok: true, json: async () => ({}) }));
  assert.deepEqual(manifest, { families: {} });
});

test("loadFirmwareManifest: a malformed entry (missing fields) is dropped, valid siblings kept", async () => {
  const manifest = await loadFirmwareManifest(
    fakeFetch({
      ok: true,
      json: async () => ({
        families: {
          esp32c3: { bin: "/firmware/esp32c3/diag.bin", offset: 0, builtAt: "x", sketch: "diag v1" },
          broken: { bin: "/firmware/broken/diag.bin" }, // missing offset/builtAt/sketch
        },
      }),
    })
  );
  assert.deepEqual(Object.keys(manifest.families), ["esp32c3"]);
});

test("loadFirmwareManifest: offset must be a number, not a numeric string", async () => {
  const manifest = await loadFirmwareManifest(
    fakeFetch({
      ok: true,
      json: async () => ({
        families: { esp32c3: { bin: "/x", offset: "0", builtAt: "x", sketch: "x" } },
      }),
    })
  );
  assert.deepEqual(manifest, { families: {} });
});

test("loadFirmwareManifest: a non-object family value is dropped, not crashed on", async () => {
  const manifest = await loadFirmwareManifest(
    fakeFetch({
      ok: true,
      json: async () => ({ families: { esp32c3: "not an object" } }),
    })
  );
  assert.deepEqual(manifest, { families: {} });
});

test("loadFirmwareManifest: customSketches keyed by plan id passes through alongside families", async () => {
  const manifest = await loadFirmwareManifest(
    fakeFetch({
      ok: true,
      json: async () => ({
        families: {},
        customSketches: {
          "solar-weather-clock": {
            bin: "/firmware/esp32c3/weather-clock.bin",
            offset: 0,
            builtAt: "2026-08-14T00:00:00.000Z",
            sketch: "Solar Weather Clock v1",
            buildId: "a3f9c1c2",
          },
        },
      }),
    })
  );
  assert.deepEqual(manifest, {
    families: {},
    customSketches: {
      "solar-weather-clock": {
        bin: "/firmware/esp32c3/weather-clock.bin",
        offset: 0,
        builtAt: "2026-08-14T00:00:00.000Z",
        sketch: "Solar Weather Clock v1",
        buildId: "a3f9c1c2",
      },
    },
  });
});

test("loadFirmwareManifest: manifest with no customSketches key omits it from output (back-compat)", async () => {
  const manifest = await loadFirmwareManifest(
    fakeFetch({ ok: true, json: async () => ({ families: {} }) })
  );
  assert.deepEqual(manifest, { families: {} });
  assert.equal("customSketches" in manifest, false);
});

test("loadFirmwareManifest: a malformed customSketches entry is dropped, valid siblings kept", async () => {
  const manifest = await loadFirmwareManifest(
    fakeFetch({
      ok: true,
      json: async () => ({
        families: {},
        customSketches: {
          good: { bin: "/x", offset: 0, builtAt: "x", sketch: "x" },
          broken: { bin: "/y" },
        },
      }),
    })
  );
  assert.deepEqual(Object.keys(manifest.customSketches ?? {}), ["good"]);
});

test("loadFirmwareManifest: buildId is optional — an entry without it still validates", async () => {
  const manifest = await loadFirmwareManifest(
    fakeFetch({
      ok: true,
      json: async () => ({
        families: { esp32c3: { bin: "/x", offset: 0, builtAt: "x", sketch: "x" } },
      }),
    })
  );
  assert.deepEqual(manifest, {
    families: { esp32c3: { bin: "/x", offset: 0, builtAt: "x", sketch: "x" } },
  });
});

test("loadFirmwareManifest: buildId must be a string when present, not a number", async () => {
  const manifest = await loadFirmwareManifest(
    fakeFetch({
      ok: true,
      json: async () => ({
        families: { esp32c3: { bin: "/x", offset: 0, builtAt: "x", sketch: "x", buildId: 12345 } },
      }),
    })
  );
  assert.deepEqual(manifest, { families: {} });
});
