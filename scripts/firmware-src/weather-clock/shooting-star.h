// "Make a wish" — a shooting star streaks across a starfield, lands, and a
// sparkle celebrates. Procedural (no sprite for the star itself — just a
// bright head plus a hand-computed fading trail along its path), reusing
// bitmaps.h's existing sparkle_frames for the landing moment.

const int8_t STAR_FIELD[][2] = {
  {6, 50}, {18, 10}, {34, 55}, {48, 14}, {60, 48}, {74, 8}, {90, 52},
  {104, 16}, {116, 44}, {122, 6}, {26, 30}, {80, 30}, {40, 42}, {110, 28},
};
const int STAR_FIELD_COUNT = sizeof(STAR_FIELD) / sizeof(STAR_FIELD[0]);

const unsigned long STAR_STREAK_END = 2200UL;
const unsigned long STAR_MOMENT_DURATION_MS = 5000UL;
const int STAR_START_X = 6, STAR_START_Y = 4;
const int STAR_END_X = 100, STAR_END_Y = 42;

void drawShootingStarMoment(unsigned long elapsed) {
  display.clearDisplay();
  for (int i = 0; i < STAR_FIELD_COUNT; i++) {
    display.drawPixel(STAR_FIELD[i][0], STAR_FIELD[i][1], SSD1306_WHITE);
  }

  if (elapsed < STAR_STREAK_END) {
    float t = elapsed / (float)STAR_STREAK_END;
    // Trail: a handful of points walked back along the same path, thinning
    // out (every other pixel skipped) the further back they sit.
    for (int i = 0; i < 7; i++) {
      float tt = t - i * 0.03f;
      if (tt < 0) break;
      if (i > 2 && (i % 2 == 0)) continue;  // thin the tail
      int tx = STAR_START_X + (int)(tt * (STAR_END_X - STAR_START_X));
      int ty = STAR_START_Y + (int)(tt * (STAR_END_Y - STAR_START_Y));
      display.drawPixel(tx, ty, SSD1306_WHITE);
    }
    int hx = STAR_START_X + (int)(t * (STAR_END_X - STAR_START_X));
    int hy = STAR_START_Y + (int)(t * (STAR_END_Y - STAR_START_Y));
    display.fillCircle(hx, hy, 1, SSD1306_WHITE);
  } else {
    unsigned long lt = elapsed - STAR_STREAK_END;
    int fi = (int)((lt / 220) % sparkle_frame_count);
    display.drawBitmap(STAR_END_X - 8, STAR_END_Y - 8, sparkle_frames[fi], 16, 16, SSD1306_WHITE);
  }

  display.display();
}
