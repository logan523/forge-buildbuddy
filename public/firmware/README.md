# Firmware manifest (one-tap "Flash test firmware")

`manifest.json` tells the app's flash flow (`src/components/flash/flash-flow.tsx`,
loaded via `src/lib/serial/manifest.ts`) which pre-built diagnostic binaries
exist and where to flash them. It ships checked in as the honest empty shape:

```json
{ "families": {} }
```

That means on a fresh checkout — or any machine without `arduino-cli` — the
"Flash test firmware" button shows its honest not-built-yet card instead of a
dead or broken flash. Nothing in the running app requires this manifest to be
populated.

## Building the diagnostic binary

Requires [arduino-cli](https://arduino.github.io/arduino-cli/) and the esp32
core (see `scripts/compile-firmware.mjs` for the exact install commands — it
prints them itself if arduino-cli is missing). Once installed:

```bash
npm run firmware:diag
```

This compiles `scripts/firmware-src/diag/diag.ino`, copies the merged
single-file binary it produces to `esp32c3/diag.bin`, and updates this
manifest's `families.esp32c3` entry with the bin path, flash offset, a build
timestamp, and which sketch version it is.

## Schema

```jsonc
{
  "families": {
    "<family>": {
      "bin": "/firmware/<family>/diag.bin", // path under /public the browser fetches
      "offset": 0,                           // flash address to write the binary at
      "builtAt": "2026-07-17T00:00:00.000Z", // ISO timestamp of the compile-firmware.mjs run
      "sketch": "diag v1"                    // human label for what's flashed
    }
  }
}
```

Only `esp32c3` exists today (that's the only board C1/C2 target). A family
key with no entry — including every key besides `esp32c3` right now — means
"not built for this board," not "broken."
