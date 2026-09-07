# Standing up the rocket frame

Plug it in and it shows the next rocket launch. After a one-time card write and
a WiFi join, nothing else on your network needs to be awake.

Everything below has been run on this machine except the three steps marked
**UNVERIFIED** — those need the physical board.

---

## 1. Write the card

```bash
cd docs/rocket-poster-kit
python3 bake_assets.py --out /Volumes/ROCKET --plan     # see what it will write
python3 bake_assets.py --out /Volumes/ROCKET            # write it
python3 bake_assets.py --out /Volumes/ROCKET --verify   # read it back
```

**The card must be FAT32.** macOS formats anything new or large as exFAT or
APFS, and the frame mounts neither — it just looks dead, with no error. The
16 GB card in the box is already FAT32. To reformat: Disk Utility → Erase →
**MS-DOS (FAT)**. `bake_assets.py` checks and refuses rather than writing a
card the frame cannot read.

Expect about **103 files, 2.7 MB**: 19 scene plates, 12 vehicles × 3 layers,
28 flags, 18 glyph atlases, and `manifest.json`.

Then delete the shadow files Finder leaves behind, which the firmware's
enumerator trips over:

```bash
find /Volumes/ROCKET -name '._*' -delete
```

## 2. Build and flash — **UNVERIFIED** past the build

The build is verified; the flash needs the board.

```bash
brew install cmake ninja librsvg      # cmake/ninja are NOT bundled with IDF v6
python3 -m pip install qrcode pillow  # the splash step needs both

cd ~/esp/esp-idf && . ./export.sh
cd ~/esp/esp32-photoframe
git checkout rocket-frame
./build.py --board waveshare_photopainter_73
idf.py -p /dev/cu.usbmodem* flash monitor
```

**Disconnect the battery before plugging in USB-C.** The AXP2101 power chip
restarts unpredictably with both connected — Waveshare has confirmed this. It
looks like a firmware crash and is not one.

**If the board doesn't appear as a serial port:** hold **BOOT**, press **PWR**,
release BOOT. That is download mode.

## 3. Join it to WiFi — **UNVERIFIED**

On first boot with no credentials the frame raises its own access point
(`PhotoFrame - XXXXXX`) and shows a QR code. Join it, pick your network, done.
The base firmware handles this; nothing rocket-specific is involved.

## 4. Watch it work — **UNVERIFIED**

`idf.py monitor` should show, in this order:

```
I rocket: build <sha> board waveshare_photopainter_73
I rocket: record dest=LOW EARTH ORBIT t0=2026-09-09T09:00:00Z family=falcon cc=USA
I rocket: card: plate=1 vehicle=1 flag=1 atlases=18
I rocket: state=fresh  decision=redrew
```

Then a full refresh — **25 to 30 seconds of colour passes that look broken**.
That is normal for six-colour e-ink, not a fault.

---

## When something is wrong

The frame never blanks: e-ink holds its image with the power off, so every
failure leaves the last poster up. That means **the panel looks the same
whether it is working or wedged**, and the log is where the states differ.

| Log line | What happened | What to do |
|---|---|---|
| `state=no-sd` | card absent, unreadable, or no `manifest.json` | reseat it; re-run the bake with `--verify` |
| `state=bad-card` | manifest won't parse, or its `format_version` is one this firmware doesn't know | re-bake the card with the matching kit |
| `state=no-network` | fetch or parse failed | check WiFi; it retries on the next wake |
| `state=budget-spent` | 15 requests/hour used, or upstream returned 429 | wait — this is correct behaviour, not a fault |
| `no vehicle art for 'x'` | that rocket family has no artwork | the poster still renders, without a rocket |

The 15/hour limit is **per IP address**, shared with everything else in the
house. The frame counts attempts rather than successes, because a timeout costs
the upstream a slot too, and it treats a 429 as final regardless of its own
count.

## What is genuinely not done

- **6 of 24 test launches have no rocket artwork.** They render correctly —
  sky, text, flag — but with no vehicle. The parametric fallback drawing that
  Python uses for these is not ported to C.
- **No over-the-air updates.** Changing firmware means USB-C. The OTA the base
  firmware ships was pointed at *upstream's* releases, which would have replaced
  this frame's software with stock photoframe on one tap; it is repointed at a
  repo that does not exist yet, so it fails closed and never offers anything.
- **Nothing has run on real hardware.** The renderer is proven byte-for-byte
  against 18 reference frames and the firmware builds clean, but no panel has
  been lit by this code.

## Changing the artwork

Adding a rocket family is a bake and a file copy — no toolchain, no reflash:

```bash
# drop a new render into vehicles-tonal/, then
python3 bake_assets.py --out /Volumes/ROCKET --only <family>
```

Changing the *layout* is different: that is Python, and the C has to follow.
`firmware/test/run_conformance.sh` rebuilds, re-bakes and re-diffs the whole
frame against the 24 frozen goldens in seconds, and it is the only thing
standing between a layout edit and a frame that quietly disagrees with its own
design.
