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

import launch
import typeset as T
from palette import INKS, INK_RGB, CANVAS, palette_for, FALLBACK
from poster import render, M, BAND_TOP, FOOTER_H, on
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

    def test_dithering_a_finished_poster_is_a_no_op(self):
        """Not just 'legal' -- provably unchanged. This is the claim the whole
        flat direction rests on, so it is asserted rather than assumed."""
        from spectra6 import dither
        import numpy as np
        img = render(SAMPLES[3], previous=SAMPLES[2])
        _, rgb = dither(img, "atkinson")
        self.assertTrue(np.array_equal(rgb, np.asarray(img.convert("RGB"))),
                        "quantizing a finished poster changed pixels; it should be identical")

    def test_an_off_palette_pixel_is_actually_caught(self):
        """A gate that cannot fail is not a gate."""
        img = render(SAMPLES[3], previous=SAMPLES[2])
        img.putpixel((10, 10), (123, 45, 200))
        self.assertIn((123, 45, 200), verify(img))


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
            f, tr = T.fit_tracked(self.d, veh, T.MEDIUM, self.col,
                                  [19, 18, 17, 16, 15, 14, 13], [0.8, 0.4, 0.0])
            with self.subTest(field="vehicle", rocket=rec["rocket"]):
                self.assertLessEqual(T.tracked_width(self.d, veh, f, tr), self.col)

            meta = " · ".join(x for x in ["12 SEP 2026 · 22:34 UTC", rec["purpose"].upper(),
                                          rec["site"].upper()] if x)
            f2, tr2 = T.fit_tracked(self.d, meta, T.MEDIUM, self.col,
                                    [13, 12, 11, 10, 9], [0.6, 0.3, 0.0])
            with self.subTest(field="meta", site=rec["site"]):
                self.assertLessEqual(T.tracked_width(self.d, meta, f2, tr2), self.col)

    def test_the_longest_real_strings_are_covered(self):
        """Guards the fixtures themselves: if the sample set stops containing
        the worst case, the tests above quietly stop proving anything."""
        self.assertGreaterEqual(max(len(r["rocket"]) for r in SAMPLES), 35)
        self.assertGreaterEqual(max(len(r["provider"]) for r in SAMPLES), 50)
        self.assertGreaterEqual(max(len(r["site"]) for r in SAMPLES), 59)

    def test_no_type_pixels_land_in_the_footer_strip(self):
        """The band-overflow bug this caught once: a tall headline pushed the
        meta line off the bottom, where it vanished silently."""
        for i, rec in enumerate(SAMPLES):
            img = render(rec, previous=SAMPLES[i - 1])
            pal = palette_for(rec["destination"])
            strip = img.crop((0, H - FOOTER_H + 1, W, H - 2))
            colors = {c for _, c in strip.getcolors(W * H)}
            with self.subTest(i=i):
                self.assertTrue(colors <= {pal.accent, on(pal.accent)},
                                f"record {i} leaked {colors - {pal.accent, on(pal.accent)}} into the footer")


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
        import numpy as np
        idx = index_map(render(SAMPLES[3], previous=SAMPLES[2]))
        b = np.frombuffer(pack(idx), dtype=np.uint8).reshape(H, W // 2)
        back = np.zeros((H, W), np.uint8)
        back[:, 0::2], back[:, 1::2] = b >> 4, b & 0x0F
        self.assertTrue(np.array_equal(back, idx))

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
