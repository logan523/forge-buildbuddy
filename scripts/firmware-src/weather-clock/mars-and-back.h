// "I love you to Mars and back" — a rare, full-screen special moment.
// Earth/Mars/stars are drawn as primitives (no bitmap needed); only the
// rocket is a sprite, animated along a computed arc rather than hand-placed
// per frame — swap rocket_right_frames/rocket_left_frames for outbound vs.
// return so the nose always points the way it's flying. Heart on arrival
// reuses bitmaps.h's existing heart_frames — no need for a second heart.

const unsigned char PROGMEM rocket_right_f0[] = {
  0x00, 0x00,
  0x00, 0x00,
  0x00, 0x00,
  0x18, 0x00,
  0x38, 0x00,
  0x0F, 0xF8,
  0x0F, 0xFC,
  0x7E, 0x7E,
  0x7E, 0x7E,
  0x0F, 0xFC,
  0x0F, 0xF8,
  0x38, 0x00,
  0x18, 0x00,
  0x00, 0x00,
  0x00, 0x00,
  0x00, 0x00,
};
const unsigned char PROGMEM rocket_right_f1[] = {
  0x00, 0x00,
  0x00, 0x00,
  0x00, 0x00,
  0x18, 0x00,
  0x38, 0x00,
  0x0F, 0xF8,
  0xFF, 0xFC,
  0xFE, 0x7E,
  0xFE, 0x7E,
  0xFF, 0xFC,
  0x0F, 0xF8,
  0x38, 0x00,
  0x18, 0x00,
  0x00, 0x00,
  0x00, 0x00,
  0x00, 0x00,
};
const unsigned char* const rocket_right_frames[] = { rocket_right_f0, rocket_right_f1 };

const unsigned char PROGMEM rocket_left_f0[] = {
  0x00, 0x00,
  0x00, 0x00,
  0x00, 0x00,
  0x00, 0x18,
  0x00, 0x1C,
  0x1F, 0xF0,
  0x3F, 0xF0,
  0x7E, 0x7E,
  0x7E, 0x7E,
  0x3F, 0xF0,
  0x1F, 0xF0,
  0x00, 0x1C,
  0x00, 0x18,
  0x00, 0x00,
  0x00, 0x00,
  0x00, 0x00,
};
const unsigned char PROGMEM rocket_left_f1[] = {
  0x00, 0x00,
  0x00, 0x00,
  0x00, 0x00,
  0x00, 0x18,
  0x00, 0x1C,
  0x1F, 0xF0,
  0x3F, 0xFF,
  0x7E, 0x7F,
  0x7E, 0x7F,
  0x3F, 0xFF,
  0x1F, 0xF0,
  0x00, 0x1C,
  0x00, 0x18,
  0x00, 0x00,
  0x00, 0x00,
  0x00, 0x00,
};
const unsigned char* const rocket_left_frames[] = { rocket_left_f0, rocket_left_f1 };

// Fixed starfield — hand-placed once, not randomized, so it doesn't flicker
// or drift between frames.
const int8_t MARS_STARS[][2] = {
  {4, 4}, {20, 55}, {36, 8}, {50, 52}, {62, 6}, {72, 50}, {88, 4}, {94, 55},
  {44, 20}, {58, 38}, {76, 22}, {30, 35}, {100, 20}, {2, 50},
};
const int MARS_STAR_COUNT = sizeof(MARS_STARS) / sizeof(MARS_STARS[0]);

const int EARTH_X = 18, EARTH_Y = 32, EARTH_R = 11;
const int MARS_X = 108, MARS_Y = 32, MARS_R = 6;

const unsigned long MARS_OUTBOUND_END = 3200UL;
const unsigned long MARS_PAUSE_END = 4700UL;
const unsigned long MARS_RETURN_END = 7900UL;
const unsigned long MARS_MOMENT_DURATION_MS = 8000UL;

void drawMarsAndBackMoment(unsigned long elapsed) {
  display.clearDisplay();

  for (int i = 0; i < MARS_STAR_COUNT; i++) {
    display.drawPixel(MARS_STARS[i][0], MARS_STARS[i][1], SSD1306_WHITE);
  }

  display.fillCircle(EARTH_X, EARTH_Y, EARTH_R, SSD1306_WHITE);
  display.fillCircle(EARTH_X - 4, EARTH_Y - 4, 2, SSD1306_BLACK);
  display.fillCircle(EARTH_X + 4, EARTH_Y + 4, 2, SSD1306_BLACK);

  display.fillCircle(MARS_X, MARS_Y, MARS_R, SSD1306_WHITE);
  display.fillCircle(MARS_X - 2, MARS_Y - 2, 1, SSD1306_BLACK);

  int startX = EARTH_X + EARTH_R + 2;
  int endX = MARS_X - MARS_R - 2;
  int flameFrame = (int)((elapsed / 150) % 2);

  if (elapsed < MARS_OUTBOUND_END) {
    float t = easeInOutQuad(elapsed / (float)MARS_OUTBOUND_END);  // gentle accel/decel, not constant speed
    int px = startX + (int)(t * (endX - startX));
    int py = EARTH_Y - (int)(6 * sin(t * PI));  // gentle upward bow
    display.drawBitmap(px - 8, py - 8, rocket_right_frames[flameFrame], 16, 16, SSD1306_WHITE);
  } else if (elapsed < MARS_PAUSE_END) {
    unsigned long pt = elapsed - MARS_OUTBOUND_END;
    int hf = (int)((pt / 250) % heart_frame_count);
    display.drawBitmap(MARS_X - 8, MARS_Y - MARS_R - 20, heart_frames[hf], 16, 16, SSD1306_WHITE);
  } else if (elapsed < MARS_RETURN_END) {
    float t = easeInOutQuad((elapsed - MARS_PAUSE_END) / (float)(MARS_RETURN_END - MARS_PAUSE_END));
    int px = endX + (int)(t * (startX - endX));
    int py = EARTH_Y - (int)(6 * sin(t * PI));
    display.drawBitmap(px - 8, py - 8, rocket_left_frames[flameFrame], 16, 16, SSD1306_WHITE);
  }

  display.display();
}
