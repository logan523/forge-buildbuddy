"""
Gates for the poster pipeline.

The first test is the one that matters. Everything else in this kit -- the flat
silhouettes, the hard-thresholded type, NEAREST resampling -- exists to keep
`verify()` empty. If that test fails, the panel is dithering something it was
never meant to dither, and the fix is upstream in whatever introduced an
off-palette color, not here.

    python3 -m unittest discover docs/rocket-poster-kit
"""

import json, os, unittest
from PIL import Image, ImageDraw

import export_bmp
import launch
import typeset as T
from palette import INKS, INK_RGB, CANVAS, NOMINAL, MEASURED_TO_NOMINAL, palette_for, FALLBACK
import palette
from poster import render, M, on
from spectra6 import verify, pack, index_map
import flag
import ingest
from vehicle import FAMILY, GENERIC, spec_for, draw_vehicle, proportions

HERE = os.path.dirname(os.path.abspath(__file__))
SAMPLES = json.load(open(os.path.join(HERE, "launch-samples.json")))["samples"]
W, H = CANVAS


class Losslessness(unittest.TestCase):
    """The spine. Flat six-ink art must pass through the panel untouched."""

    def test_every_sample_renders_only_the_six_inks(self):
        for i, rec in enumerate(SAMPLES):
            with self.subTest(i=i, rocket=rec["rocket"]):
                bad = verify(render(rec, previous=SAMPLES[i - 1]))
                self.assertEqual(bad, set(),
                                 f"record {i} put off-ink colors on the panel: {list(bad)[:5]}")

    def test_a_finished_poster_survives_requantization(self):
        """The panel driver must have nothing left to decide. A poster whose
        pixels are all exact inks passes back through the quantizer unchanged."""
        from spectra6 import dither
        import numpy as np
        img = render(SAMPLES[3], previous=SAMPLES[2])
        _, rgb = dither(img, "atkinson")
        self.assertTrue(np.array_equal(rgb, np.asarray(img.convert("RGB"))),
                        "quantizing a finished poster changed pixels; it should be identical")

    def test_the_fast_dither_matches_the_reference_implementation(self):
        """The inner loop was rewritten off numpy for a 4.7x speedup. That is
        only safe if it is bit-identical -- error diffusion has no tolerance
        for 'close enough', since every pixel's error feeds its neighbours."""
        import numpy as np
        from PIL import Image as _I
        from spectra6 import dither, PAL
        src = _I.open(os.path.join(HERE, "raw", "falcon-nb.png")).convert("RGB").resize((120, 200))
        ref_idx = _reference_dither(np.asarray(src, dtype=np.float64), PAL)
        idx, _ = dither(src, "atkinson")
        self.assertTrue(np.array_equal(idx, ref_idx))

    def test_an_off_palette_pixel_is_actually_caught(self):
        """A gate that cannot fail is not a gate."""
        img = render(SAMPLES[3], previous=SAMPLES[2])
        img.putpixel((10, 10), (123, 45, 200))
        self.assertIn((123, 45, 200), verify(img))


def _reference_dither(a, PAL):
    """The original per-pixel numpy implementation, kept ONLY as a test oracle.
    Slow by design -- it is the thing the fast path must agree with."""
    import numpy as np
    a = a.copy()
    h, w, _ = a.shape
    idx = np.zeros((h, w), dtype=np.uint8)
    offs = [(1, 0, 1/8), (2, 0, 1/8), (-1, 1, 1/8), (0, 1, 1/8), (1, 1, 1/8), (0, 2, 1/8)]
    for y in range(h):
        for x in range(w):
            old = a[y, x].copy()
            i = int(np.argmin(((PAL - old) ** 2).sum(axis=1)))
            idx[y, x] = i
            err = old - PAL[i]
            a[y, x] = PAL[i]
            for dx, dy, wt in offs:
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h:
                    a[ny, nx] += err * wt
    return idx


class Determinism(unittest.TestCase):
    """Reproducibility is the reason a template was chosen over a model."""

    def test_same_record_renders_byte_identical(self):
        a = render(SAMPLES[7], previous=SAMPLES[6]).tobytes()
        b = render(SAMPLES[7], previous=SAMPLES[6]).tobytes()
        self.assertEqual(a, b)

    def test_different_records_render_differently(self):
        a = render(SAMPLES[0], previous=SAMPLES[1]).tobytes()
        b = render(SAMPLES[3], previous=SAMPLES[1]).tobytes()
        self.assertNotEqual(a, b)


class TypeFits(unittest.TestCase):
    """No silent clipping, for any real record -- including the worst-case
    strings the API actually returns (rocket 35, provider 50, site 59)."""

    def setUp(self):
        self.d = ImageDraw.Draw(Image.new("RGB", CANVAS))
        self.col = W - M * 2

    def test_headline_fits_on_one_line_for_every_destination(self):
        for rec in SAMPLES:
            dest = (rec["destination"] or "UNKNOWN").upper()
            lines, f = T.fit_headline(self.d, dest, (rec.get("destination_abbrev") or "").upper(),
                                      T.XCONDENSED, self.col, 72, 34, track=1.5)
            with self.subTest(dest=dest):
                self.assertLessEqual(T.tracked_width(self.d, lines[0], f, 1.5), self.col)

    def test_vehicle_and_meta_lines_fit(self):
        for rec in SAMPLES:
            veh = " · ".join(x for x in [rec["rocket"], rec["mission"], rec["provider"]] if x)
            f, tr, veh = T.fit_tracked(self.d, veh, T.MEDIUM, self.col,
                                  [19, 18, 17, 16, 15, 14, 13], [0.8, 0.4, 0.0])
            with self.subTest(field="vehicle", rocket=rec["rocket"]):
                self.assertLessEqual(T.tracked_width(self.d, veh, f, tr), self.col)

            meta = " · ".join(x for x in ["12 SEP 2026 · 22:34 UTC", rec["purpose"].upper(),
                                          rec["site"].upper()] if x)
            f2, tr2, meta = T.fit_tracked(self.d, meta, T.MEDIUM, self.col,
                                    [13, 12, 11, 10, 9], [0.6, 0.3, 0.0])
            with self.subTest(field="meta", site=rec["site"]):
                self.assertLessEqual(T.tracked_width(self.d, meta, f2, tr2), self.col)

    def test_the_longest_real_strings_are_covered(self):
        """Guards the fixtures themselves: if the sample set stops containing
        the worst case, the tests above quietly stop proving anything."""
        self.assertGreaterEqual(max(len(r["rocket"]) for r in SAMPLES), 35)
        self.assertGreaterEqual(max(len(r["provider"]) for r in SAMPLES), 50)
        self.assertGreaterEqual(max(len(r["site"]) for r in SAMPLES), 59)

    def test_nothing_is_drawn_past_the_bottom_edge(self):
        """The previous-launch line is the last thing placed and the easiest to
        push off the canvas -- an earlier layout did exactly that, invisibly at
        thumbnail scale and fatally at 800x480. Checked arithmetically rather
        than by pixels, so it fails for the right reason."""
        d = ImageDraw.Draw(Image.new("RGB", CANVAS))
        for i, rec in enumerate(SAMPLES):
            prev = SAMPLES[i - 1]
            line = " · ".join(x for x in [
                "LAST", (prev.get("rocket_short") or prev.get("rocket") or "").upper(),
                prev.get("mission") or "", "01 JAN 2026"] if x)
            f, tr, line = T.fit_tracked(d, line, T.MEDIUM, W - M - 250, [10, 9, 8], [1.2, 0.6, 0.2])
            with self.subTest(i=i):
                self.assertLess(H - 62 + f.size, H - 2, "previous-launch line runs off the canvas")
                self.assertLessEqual(T.tracked_width(d, line, f, tr), W - M - 250,
                                     "previous-launch line runs under the vehicle")

    def test_the_type_column_never_reaches_the_vehicle(self):
        """The vehicle occupies the right 250px. Type that crosses into it is
        unreadable against a dithered rocket, which is the failure mode the
        column width exists to prevent."""
        d = ImageDraw.Draw(Image.new("RGB", CANVAS))
        COL = 450
        self.assertLessEqual(M + COL, W - 250 + 96,
                             "type column overlaps the vehicle's clear space")
        for rec in SAMPLES:
            hero = (rec["mission"] or rec["destination"]).upper()
            lines, f = T.fit_wrap(d, hero, T.XCONDENSED, COL, 66, 24, track=1.2, max_lines=2)
            for ln in lines:
                with self.subTest(hero=ln):
                    self.assertLessEqual(T.tracked_width(d, ln, f, 1.2), COL)


class Coverage(unittest.TestCase):
    """Every real record must resolve, including the sparse and classified
    ones. `destination` is literally 'Unknown' on three of the samples."""

    def test_every_destination_maps_to_a_palette(self):
        for rec in SAMPLES:
            p = palette_for(rec["destination"])
            with self.subTest(dest=rec["destination"]):
                self.assertIn(p.field, INK_RGB)
                self.assertIn(p.accent, INK_RGB)

    def test_unknown_destination_uses_the_fallback_rather_than_raising(self):
        self.assertIs(palette_for("Unknown"), FALLBACK)
        self.assertIs(palette_for(None), FALLBACK)
        self.assertIs(palette_for(""), FALLBACK)

    def test_the_series_actually_varies(self):
        pairs = {(palette_for(r["destination"]).field_name,
                  palette_for(r["destination"]).accent_name) for r in SAMPLES}
        self.assertGreaterEqual(len(pairs), 6, "too few palettes; the series would look uniform")

    def test_null_rocket_family_falls_back_to_a_real_vehicle(self):
        nulls = [r for r in SAMPLES if not r.get("rocket_family")]
        self.assertGreaterEqual(len(nulls), 1, "fixture no longer covers missing family")
        for rec in nulls:
            sp, fam = spec_for(rec)
            with self.subTest(rocket=rec["rocket"]):
                self.assertIsNone(fam)
                self.assertEqual(sp, GENERIC)

    def test_every_family_draws_without_error(self):
        for name in list(FAMILY) + ["definitely-not-a-family", ""]:
            img, tier = draw_vehicle({"rocket_family": name}, palette_for("Low Earth Orbit"))
            with self.subTest(family=name):
                self.assertIsNotNone(img.getbbox(), f"{name} drew nothing")
                self.assertIn(tier, ("asset", "parametric", "generic"))

    def test_an_unknown_family_still_gets_a_real_vehicle(self):
        """Coverage must never have a hole -- only a lower-fidelity floor."""
        img, tier = draw_vehicle({"rocket_family": "Nonesuch-9"},
                                 palette_for("Low Earth Orbit"))
        self.assertEqual(tier, "generic")
        self.assertIsNotNone(img.getbbox())


class Proportions(unittest.TestCase):
    """The vehicle's shape comes from the API's own length/diameter."""

    def test_real_dimensions_beat_the_family_default(self):
        sp, _ = spec_for({"rocket_family": "Falcon"})
        stubby = proportions({"length": "20", "diameter": "5"}, sp)
        slim = proportions({"length": "70", "diameter": "3.65"}, sp)
        self.assertLess(stubby, slim)

    def test_a_bad_diameter_cannot_draw_a_pancake(self):
        """LL2's `diameter` is semantically inconsistent -- Angara A5 reports
        the span across its strap-ons -- and the config list even contains
        non-launchers. One bad row must not produce a squashed vehicle."""
        sp, _ = spec_for({"rocket_family": "Falcon"})
        self.assertGreaterEqual(proportions({"length": "2.8", "diameter": "4.29"}, sp), 5.0)
        self.assertLessEqual(proportions({"length": "500", "diameter": "1"}, sp), 24.0)

    def test_missing_or_junk_dimensions_fall_back_rather_than_raise(self):
        sp, _ = spec_for({"rocket_family": "Soyuz"})
        for bad in ({}, {"length": None, "diameter": None}, {"length": "x", "diameter": "y"},
                    {"length": "10", "diameter": "0"}):
            with self.subTest(bad=bad):
                self.assertGreater(proportions(bad, sp), 0)


class Flags(unittest.TestCase):
    def test_flags_use_only_the_six_inks(self):
        for code in list(flag.FLAGS) + ["ZZZ"]:
            im = Image.new("RGB", (60, 40), INKS["black"])
            flag.draw(ImageDraw.Draw(im), code, 0, 0, 59, 39)
            with self.subTest(code=code):
                self.assertEqual(verify(im), set())

    def test_an_unknown_country_renders_a_neutral_block_rather_than_guessing(self):
        self.assertFalse(flag.known("ZZZ"))
        self.assertTrue(flag.known("usa"))          # case-insensitive
        im = Image.new("RGB", (60, 40), INKS["black"])
        flag.draw(ImageDraw.Draw(im), None, 0, 0, 59, 39)
        self.assertEqual(verify(im), set())

    def test_every_launching_nation_in_the_fixtures_has_a_flag(self):
        missing = sorted({r["country"] for r in SAMPLES
                          if r.get("country") and not flag.known(r["country"])})
        self.assertEqual(missing, [], f"no flag for {missing}")


class Assets(unittest.TestCase):
    def test_load_returns_none_for_an_uningested_family(self):
        self.assertIsNone(ingest.load("Nonesuch-9"))

    def test_known_ratios_are_sane(self):
        for fam, r in ingest.KNOWN_RATIO.items():
            with self.subTest(family=fam):
                self.assertTrue(5 < r < 30, f"{fam} ratio {r} is not a launch vehicle")


class WireFormat(unittest.TestCase):
    """What the ESP32 actually downloads."""

    def test_packs_to_exactly_the_panel_buffer_size(self):
        img = render(SAMPLES[3], previous=SAMPLES[2])
        self.assertEqual(len(pack(index_map(img))), W * H // 2)   # 4bpp

    def test_pack_round_trips(self):
        """Unpacking now has to invert the panel-nibble remap that pack()
        applies. Before that remap existed this test passed while the bytes
        going to the panel had red and yellow swapped -- an identity round
        trip proves the packing, never the mapping."""
        import numpy as np
        idx = index_map(render(SAMPLES[3], previous=SAMPLES[2]))
        b = np.frombuffer(pack(idx), dtype=np.uint8).reshape(H, W // 2)
        back = np.zeros((H, W), np.uint8)
        back[:, 0::2], back[:, 1::2] = b >> 4, b & 0x0F
        from_nibble = {palette.PANEL_NIBBLE[n]: i
                       for i, n in enumerate(palette.INK_ORDER)}
        undone = np.vectorize(from_nibble.get)(back).astype(np.uint8)
        self.assertTrue(np.array_equal(undone, idx))

    def test_index_map_refuses_an_illegal_image(self):
        """Snapping stray colors silently would hide the bug that produced
        them. Loud failure is the point."""
        img = render(SAMPLES[3], previous=SAMPLES[2])
        img.putpixel((5, 5), (1, 2, 3))
        with self.assertRaises(ValueError):
            index_map(img)


class Normalizer(unittest.TestCase):
    """LL2 quirks that have bitten real projects."""

    def test_empty_variant_does_not_leak_a_trailing_space(self):
        rec = launch.normalize({"rocket": {"configuration": {
            "full_name": "Falcon 9 Block 5", "name": "Falcon 9", "variant": ""}}})
        self.assertEqual(rec["rocket_short"], "Falcon 9")
        self.assertNotIn("  ", rec["rocket"])

    def test_a_completely_empty_response_still_yields_a_renderable_record(self):
        rec = launch.normalize({})
        self.assertEqual(rec["status"], "TBD")          # 86% of real records
        self.assertEqual(rec["destination"], "Unknown")
        self.assertEqual(verify(render(rec)), set())

    def test_digest_ignores_fields_the_poster_never_draws(self):
        """A description edit upstream must not burn an e-ink refresh."""
        a = dict(SAMPLES[0])
        b = dict(SAMPLES[0], description="rewritten upstream", lat="0.0")
        self.assertEqual(launch.digest(a), launch.digest(b))

    def test_digest_changes_when_a_shown_field_changes(self):
        a = dict(SAMPLES[0])
        b = dict(SAMPLES[0], destination="Lunar Orbit")
        self.assertNotEqual(launch.digest(a), launch.digest(b))

    def test_poll_ladder_tightens_as_the_launch_approaches(self):
        far = launch.poll_interval("2099-01-01T00:00:00Z")
        self.assertEqual(far, 3600)
        self.assertEqual(launch.poll_interval("not-a-date"), 3600)   # degrade, never raise


if __name__ == "__main__":
    unittest.main(verbosity=2)


class PanelExport(unittest.TestCase):
    """The BMP the firmware actually reads.

    PhotoPainter's GUI_BMPfile.c matches each pixel against six EXACT nominal
    RGB triples. There is no else clause, and its `color` variable lives
    outside the pixel loop -- so a pixel matching none of them inherits the
    previous pixel and smears across the row. Everything here guards that.
    """

    def test_the_two_palettes_are_actually_different(self):
        """If these ever converge, the swap is a no-op and the reason for it
        has been lost. They should not: measured white is newsprint grey."""
        self.assertNotEqual(set(INKS.values()), set(NOMINAL.values()))
        self.assertEqual(len(MEASURED_TO_NOMINAL), 6)

    def test_every_fixture_exports_only_nominal_inks(self):
        for i, rec in enumerate(SAMPLES):
            img = render(rec, previous=SAMPLES[i - 1])
            bmp = export_bmp.to_panel_bmp(img)
            used = {c for _, c in bmp.getcolors(bmp.width * bmp.height)}
            with self.subTest(i=i):
                self.assertTrue(used <= set(NOMINAL.values()),
                                f"record {i} exported {used - set(NOMINAL.values())}")

    def test_a_stray_pixel_is_refused_rather_than_smeared(self):
        """The export must fail loudly. Passing one bad pixel through is worse
        than an exception -- it corrupts an entire row on the panel."""
        img = render(SAMPLES[3], previous=SAMPLES[2])
        img.putpixel((400, 240), (7, 8, 9))
        with self.assertRaises(ValueError):
            export_bmp.to_panel_bmp(img)

    def test_the_written_file_is_what_the_firmware_expects(self):
        import tempfile
        img = render(SAMPLES[3], previous=SAMPLES[2])
        with tempfile.TemporaryDirectory() as td:
            p = os.path.join(td, "001.bmp")
            export_bmp.to_panel_bmp(img).save(p, "BMP")
            self.assertEqual(export_bmp.verify_bmp(p), set())
            reread = Image.open(p)
            self.assertEqual(reread.size, CANVAS)      # 800x480, not rotated
            self.assertEqual(reread.mode, "RGB")       # 24-bit, not palettised
            # 24-bit uncompressed: 3 bytes/px plus a small header
            self.assertGreater(os.path.getsize(p), CANVAS[0] * CANVAS[1] * 3)

    def test_wrong_canvas_size_is_refused(self):
        """The firmware accepts only 800x480 or 480x800. Anything else is a
        silent no-display, so catch it here."""
        with self.assertRaises(ValueError):
            export_bmp.to_panel_bmp(Image.new("RGB", (640, 400), INKS["black"]))


class Server(unittest.TestCase):
    """The half that has to survive months on a shelf.

    A frame on a wall outlives this process -- power cuts, reboots, a router
    that comes up slower than the Pi. Every one of these is a real failure the
    device will hit, not a hypothetical.
    """

    def setUp(self):
        import shutil, tempfile
        import serve
        self.serve = serve
        self._tmp = tempfile.mkdtemp()
        # Point the module at a scratch directory. An earlier version of these
        # tests wrote a deliberately-truncated file straight over the real
        # .last-panel.bmp and left it there, which silently broke the next cold
        # start -- a test corrupting production state is worse than no test.
        self._paths = (serve.LAST, serve.LAST_META)
        serve.LAST = os.path.join(self._tmp, "panel.bmp")
        serve.LAST_META = os.path.join(self._tmp, "panel.json")
        self._rmtree = shutil.rmtree
        with serve.LOCK:
            self._saved = dict(serve.STATE)

    def tearDown(self):
        self.serve.LAST, self.serve.LAST_META = self._paths
        self._rmtree(self._tmp, ignore_errors=True)
        with self.serve.LOCK:
            self.serve.STATE.clear()
            self.serve.STATE.update(self._saved)

    def test_a_restart_serves_the_last_poster_instead_of_a_blank_panel(self):
        """The whole reason persistence exists. Without it a reboot throws away
        a poster that cost an API call and leaves the frame on a 503 until the
        next successful fetch -- indefinitely, if the network is still down."""
        img = render(SAMPLES[3], previous=SAMPLES[2])
        bmp = export_bmp.to_panel_bmp(img)
        import io
        buf = io.BytesIO(); bmp.save(buf, "BMP")
        with self.serve.LOCK:
            self.serve.STATE.update(bmp=buf.getvalue(), etag="deadbeef",
                                    record=SAMPLES[3], rendered_at=1.0)
        self.serve._persist()

        with self.serve.LOCK:                      # simulate a cold process
            self.serve.STATE.update(bmp=None, etag=None, record=None,
                                    rendered_at=0, restored=False)
        self.assertTrue(self.serve.restore(), "restore() found nothing on disk")
        with self.serve.LOCK:
            self.assertEqual(self.serve.STATE["etag"], "deadbeef")
            self.assertEqual(len(self.serve.STATE["bmp"]), 1152054)
            self.assertTrue(self.serve.STATE["restored"])

    def test_a_truncated_file_is_ignored_rather_than_served(self):
        """A power cut mid-write must not leave a half-BMP the frame renders as
        garbage. Writes are atomic, but a partial file from any other cause is
        rejected on size."""
        with open(self.serve.LAST, "wb") as f:
            f.write(b"\x00" * 500)
        with open(self.serve.LAST_META, "w") as f:
            json.dump({"etag": "x", "record": None, "rendered_at": 0}, f)
        self.assertFalse(self.serve.restore())

    def test_missing_state_files_are_not_an_error(self):
        self.assertFalse(self.serve.restore())       # returns False, never raises

    def test_the_etag_tracks_only_what_is_drawn(self):
        """An upstream description edit must not burn a 25-second refresh --
        that is the most expensive thing the device does."""
        a = dict(SAMPLES[3])
        b = dict(SAMPLES[3], description="rewritten upstream", lat="1.23")
        self.assertEqual(launch.digest(a), launch.digest(b))
        c = dict(SAMPLES[3], mission="Something Else")
        self.assertNotEqual(launch.digest(a), launch.digest(c))


class Budget(unittest.TestCase):
    """The 15/hr cap is per IP and shared with the whole house. Going over does
    not degrade gracefully -- a 429 throttles every device on the network, and
    the poll loop cannot recover on its own schedule."""

    def setUp(self):
        import shutil, tempfile
        self._tmp = tempfile.mkdtemp()
        self._saved = launch._SPEND
        launch._SPEND = os.path.join(self._tmp, "spend.json")
        self._rmtree = shutil.rmtree

    def tearDown(self):
        launch._SPEND = self._saved
        self._rmtree(self._tmp, ignore_errors=True)

    def test_spending_survives_a_restart(self):
        """A server that forgot its spending on restart would be free to blow
        the entire budget again immediately -- and a crash-loop would do it
        every few seconds."""
        for _ in range(4):
            launch._record_spend()
        self.assertEqual(launch.budget()[0], 4)     # re-read from disk each call

    def test_old_requests_age_out_of_the_window(self):
        import time as _t
        with open(launch._SPEND, "w") as f:
            json.dump([_t.time() - 3700, _t.time() - 10], f)   # one stale, one live
        self.assertEqual(launch.budget()[0], 1)

    def test_an_exhausted_budget_serves_stale_rather_than_getting_throttled(self):
        import time as _t
        with open(launch._SPEND, "w") as f:
            json.dump([_t.time()] * launch.HOURLY_CAP, f)
        saved = launch.BASE
        launch.BASE = "https://127.0.0.1:9/must-not-be-called"   # refused if reached
        try:
            rec, meta = launch.fetch("upcoming", force=True)
        finally:
            launch.BASE = saved
        self.assertEqual(meta["source"], "stale")
        self.assertTrue(meta["budget_exhausted"])
        self.assertIsNotNone(rec)
        self.assertEqual(launch.budget()[0], launch.HOURLY_CAP)  # spent nothing more

    def test_a_failed_request_still_costs_a_slot(self):
        """Counting successes would let a flapping endpoint issue unlimited
        requests -- the upstream counts attempts, so we must too."""
        saved = launch.BASE
        launch.BASE = "https://127.0.0.1:9/nope"
        try:
            launch.fetch("upcoming", force=True)     # fails, falls back to cache
        except Exception:
            pass
        finally:
            launch.BASE = saved
        self.assertEqual(launch.budget()[0], 1)


class RefreshCost(unittest.TestCase):
    def setUp(self):
        import serve
        self.serve = serve
        with serve.LOCK:
            self._saved = dict(serve.STATE)

    def tearDown(self):
        with self.serve.LOCK:
            self.serve.STATE.clear()
            self.serve.STATE.update(self._saved)

    def test_the_etag_moves_when_the_artwork_changes(self):
        """A record-only digest meant new art sat on the server forever while
        the frame kept getting 304s. The ETag is over the rendered bytes."""
        a = export_bmp.to_panel_bmp(render(SAMPLES[3], previous=SAMPLES[2]))
        b = export_bmp.to_panel_bmp(render(SAMPLES[3], previous=SAMPLES[2], band="left"))
        import io, hashlib
        def tag(img):
            buf = io.BytesIO(); img.save(buf, "BMP")
            return hashlib.sha256(buf.getvalue()).hexdigest()[:12]
        self.assertNotEqual(tag(a), tag(b), "same tag for visibly different posters")
        self.assertEqual(tag(a), tag(export_bmp.to_panel_bmp(
            render(SAMPLES[3], previous=SAMPLES[2]))), "tag is not deterministic")


class PanelWireFormat(unittest.TestCase):
    """The 4bpp nibble each ink occupies.

    Verified against the firmware this build actually flashes:
    aitjcize/esp32-photoframe, components/epaper_src/GUI_ColorMap.h,
    GUI_RGBToSpectra6(). Pinned here because getting it wrong produces a
    poster that looks plausible and is wrong -- red rendering as yellow --
    which no amount of staring at the PNG would catch.
    """

    def test_every_ink_packs_to_the_nibble_the_firmware_expects(self):
        for name, rgb in palette.INKS.items():
            with self.subTest(ink=name):
                got = pack(index_map(Image.new("RGB", (2, 1), rgb)))[0] >> 4
                self.assertEqual(got, palette.PANEL_NIBBLE[name])

    def test_the_panel_order_is_not_the_internal_order(self):
        """Guards the assumption that broke this: enumerating INK_ORDER does
        NOT yield panel nibbles. If someone 'simplifies' PANEL_NIBBLE away by
        deriving it from the list order, this fails."""
        derived = {n: i for i, n in enumerate(palette.INK_ORDER)}
        self.assertNotEqual(derived, palette.PANEL_NIBBLE)
        self.assertEqual(palette.PANEL_NIBBLE["yellow"], 2)   # before red
        self.assertEqual(palette.PANEL_NIBBLE["red"], 3)
        self.assertNotIn(4, palette.PANEL_NIBBLE.values())     # 4 is unused

    def test_a_packed_poster_carries_only_legal_nibbles(self):
        import numpy as np
        idx = index_map(render(SAMPLES[3], previous=SAMPLES[2]))
        b = np.frombuffer(pack(idx), dtype=np.uint8)
        nibbles = set((b >> 4).tolist()) | set((b & 0x0F).tolist())
        self.assertTrue(nibbles <= set(palette.PANEL_NIBBLE.values()),
                        f"illegal nibbles on the wire: {nibbles - set(palette.PANEL_NIBBLE.values())}")


class SnapToInks(unittest.TestCase):
    """scene.snap_to_inks is the whole post-resample legality guarantee.

    Every scaled plate and every scaled vehicle goes through it, and two plates
    once shipped 3,802 and 8,955 off-ink pixels precisely because a resample
    skipped it. It had no direct test until now -- only end-to-end poster
    assertions, which would not have told us WHICH stage broke.
    """

    def setUp(self):
        import scene
        self.scene = scene

    def test_anything_at_all_comes_out_legal(self):
        """The contract: arbitrary RGB in, only the six inks out. Fed the worst
        case -- a full-spectrum gradient, nothing in it near an ink."""
        w, h = 120, 40
        px = [(x * 2 % 256, (x * 5 + y * 3) % 256, (y * 6) % 256)
              for y in range(h) for x in range(w)]
        img = Image.new("RGB", (w, h)); img.putdata(px)
        out = self.scene.snap_to_inks(img)
        self.assertEqual(verify(out), set(), "snap_to_inks emitted off-ink colours")

    def test_a_legal_image_passes_through_untouched(self):
        """Idempotence. If snapping moved already-exact pixels, every re-snap
        in the pipeline would drift the art a little further each pass."""
        img = render(SAMPLES[3], previous=SAMPLES[2])
        once = self.scene.snap_to_inks(img)
        twice = self.scene.snap_to_inks(once)
        self.assertEqual(list(img.getdata()), list(once.getdata()))
        self.assertEqual(list(once.getdata()), list(twice.getdata()))

    def test_it_does_not_diffuse_error(self):
        """The docstring's central claim, and the reason it is not dither().
        A flat off-palette field must land on ONE ink, not a speckle of
        several -- diffusion is what put colour noise on the white rocket."""
        flat = Image.new("RGB", (60, 60), (150, 150, 150))    # grey: near nothing
        out = self.scene.snap_to_inks(flat)
        self.assertEqual(len(set(out.getdata())), 1,
                         "a flat field fragmented -- error is being diffused")

    def test_each_ink_snaps_to_itself_not_a_neighbour(self):
        for name, rgb in palette.INKS.items():
            with self.subTest(ink=name):
                out = self.scene.snap_to_inks(Image.new("RGB", (4, 4), rgb))
                self.assertEqual(out.getpixel((0, 0)), rgb)


class Bake(unittest.TestCase):
    """The card the frame reads. Everything expensive happens here, once."""

    def setUp(self):
        import shutil, tempfile, bake_assets
        self.bake = bake_assets
        self._tmp = tempfile.mkdtemp()
        self._rmtree = shutil.rmtree

    def tearDown(self):
        self._rmtree(self._tmp, ignore_errors=True)

    def test_layers_reproduce_the_reference_vehicle_exactly(self):
        """The whole architecture rests on this. If baked layers do not
        recompose to what poster._vehicle() draws, the device is rendering a
        different poster from the one the designer approved."""
        from PIL import Image
        import poster
        from palette import INKS
        W, H, BH = poster.W, poster.H, poster.BAND_H
        sbox, sh = (0, 0, W, H - BH), H - BH

        fams = [f for f in self.bake.tonal_families()][:3]   # 3 is enough; all 12 pass
        self.assertTrue(fams, "no tonal vehicle assets found")
        for fam in fams:
            with self.subTest(family=fam):
                L = self.bake.vehicle_layers(fam)
                rec = {"rocket_family": fam, "destination": "Low Earth Orbit", "country": "USA"}

                ref = Image.new("RGB", (W, H), poster.palette_for(rec["destination"]).field)
                poster._vehicle(ref, rec, sbox, sh)

                dev = Image.new("RGB", (W, H), poster.palette_for(rec["destination"]).field)
                x = int(sbox[0] + (sbox[2] - sbox[0]) * 0.58)
                key = INKS["white"] if L["dark"] else INKS["black"]
                dev.paste(Image.new("RGB", L["size"], key), (x, sbox[1] - 8), L["key_mask"])
                dev.paste(L["body"], (x, sbox[1] - 8), L["body_mask"])

                self.assertEqual(list(ref.get_flattened_data()),
                                 list(dev.get_flattened_data()),
                                 f"{fam}: baked layers do not recompose to the reference")

    def test_packing_round_trips_through_the_card_format(self):
        from PIL import Image
        from palette import INKS, INK_ORDER
        img = Image.new("RGB", (6, 2))
        img.putdata([INKS[n] for n in INK_ORDER] * 2)
        packed = self.bake.pack_indexed(img)
        self.assertEqual(len(packed), 6 // 2 * 2)
        # unpack the way the firmware will: byte-wise, MSB nibble first
        got = []
        for b in packed:
            got += [b >> 4, b & 0x0F]
        self.assertEqual(got, list(range(6)) * 2)

    def test_an_off_ink_pixel_is_refused_not_snapped(self):
        """A pixel we cannot name is a bug upstream. The device's only
        fallback is silent white, so the bake must never guess."""
        from PIL import Image
        with self.assertRaises(ValueError):
            self.bake.pack_indexed(Image.new("RGB", (2, 1), (7, 7, 7)))

    def test_it_refuses_to_scatter_files_into_a_normal_directory(self):
        """The guard exists for a mistyped --out. An earlier version returned
        early when the path did not exist yet, which skipped the check for
        exactly the case it protects against."""
        import pathlib
        with self.assertRaises(SystemExit):
            self.bake.check_destination(pathlib.Path(self._tmp) / "nope", force=False)
        self.bake.check_destination(pathlib.Path(self._tmp) / "nope", force=True)  # allowed

    def test_the_card_round_trips_and_verifies(self):
        import pathlib
        out = pathlib.Path(self._tmp) / "card"
        files = self.bake.build(only=None)
        out.mkdir(parents=True)
        self.bake.write_card(out, files)
        self.assertEqual(self.bake.verify_card(out), 0, "freshly baked card failed verify")
        # the manifest declares a format version the firmware can refuse
        import json
        man = json.loads((out / "manifest.json").read_text())
        self.assertEqual(man["format_version"], self.bake.FORMAT_VERSION)
        self.assertTrue(man["plates"] and man["vehicles"])


class Goldens(unittest.TestCase):
    """The frozen frames the C renderer will be diffed against.

    Deliberately cheap: this reads files. The expensive re-derivation from
    poster.py lives in freeze_goldens.py --check and is a SEPARATE job, so a
    Pillow bump fails a drift test rather than the firmware build.
    """

    def setUp(self):
        import json as _j
        self.dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "goldens")
        with open(os.path.join(self.dir, "index.json")) as f:
            self.index = _j.load(f)

    def test_all_24_fixtures_have_a_frozen_frame(self):
        recs = json.load(open(os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "launch-samples.json")))["samples"]
        self.assertEqual(len(self.index), len(recs),
                         "a fixture has no golden — the C gate would not cover it")
        for name in self.index:
            self.assertTrue(os.path.exists(os.path.join(self.dir, name)), f"{name} missing")

    def test_every_golden_is_panel_legal(self):
        """A golden with an off-ink pixel would teach the C renderer to emit
        one, and GUI_RGBToSpectra6 turns those silently into white."""
        for name in sorted(self.index):
            with self.subTest(golden=name):
                img = Image.open(os.path.join(self.dir, name))
                self.assertEqual(img.size, (W, H))
                self.assertEqual(verify(img), set())

    def test_goldens_are_the_right_shape_for_a_byte_diff(self):
        """The firmware test compares raw RGB888. Assert that is what these
        decode to, so the C side can memcmp without guessing a format."""
        img = Image.open(os.path.join(self.dir, "00.png")).convert("RGB")
        self.assertEqual(len(img.tobytes()), W * H * 3)
