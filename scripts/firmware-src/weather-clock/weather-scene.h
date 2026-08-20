// A little scene matching *today's actual weather* (g_outText, already
// fetched by fetchWeather() for the main clock view) — not just decoration,
// it reflects real data already flowing through the sketch. All procedural
// (circles/lines/dots), no bitmap assets needed.

const unsigned long WEATHER_SCENE_DURATION_MS = 6000UL;

void wsCloud(int cx, int cy) {
  display.fillCircle(cx - 6, cy, 5, SSD1306_WHITE);
  display.fillCircle(cx + 6, cy, 5, SSD1306_WHITE);
  display.fillCircle(cx, cy - 3, 6, SSD1306_WHITE);
  display.fillRect(cx - 6, cy, 12, 5, SSD1306_WHITE);
}

void wsSun(unsigned long elapsed) {
  int cx = 64, cy = 30;
  display.fillCircle(cx, cy, 10, SSD1306_WHITE);
  float rot = elapsed / 800.0f;
  for (int i = 0; i < 8; i++) {
    float a = rot + i * (PI / 4);
    int x1 = cx + (int)(14 * cos(a)), y1 = cy + (int)(14 * sin(a));
    int x2 = cx + (int)(20 * cos(a)), y2 = cy + (int)(20 * sin(a));
    display.drawLine(x1, y1, x2, y2, SSD1306_WHITE);
  }
}

void wsClouds(unsigned long elapsed) {
  int drift = (int)((elapsed / 40) % 140) - 20;
  wsCloud(20 + drift, 20);
  wsCloud(70 + drift, 38);
  wsCloud((30 + drift + 140) % 160 - 10, 12);
}

void wsRain(unsigned long elapsed) {
  wsCloud(64, 16);
  const int DROP_X[] = {14, 30, 46, 58, 72, 86, 100, 112};
  for (int i = 0; i < 8; i++) {
    int y = (int)((elapsed / 3 + i * 23) % 56) + 6;
    display.drawLine(DROP_X[i], y, DROP_X[i] - 2, y + 5, SSD1306_WHITE);
  }
}

void wsSnow(unsigned long elapsed) {
  wsCloud(64, 14);
  const int FLAKE_X[] = {10, 26, 42, 54, 68, 82, 96, 108, 120};
  for (int i = 0; i < 9; i++) {
    int y = (int)((elapsed / 8 + i * 19) % 58) + 6;
    int sway = (int)(3 * sin((elapsed / 300.0f) + i));
    display.fillCircle(FLAKE_X[i] + sway, y, 1, SSD1306_WHITE);
  }
}

void wsStorm(unsigned long elapsed) {
  wsCloud(64, 14);
  const int DROP_X[] = {16, 34, 50, 66, 82, 98, 112};
  for (int i = 0; i < 7; i++) {
    int y = (int)((elapsed / 3 + i * 26) % 56) + 8;
    display.drawLine(DROP_X[i], y, DROP_X[i] - 2, y + 5, SSD1306_WHITE);
  }
  if ((elapsed % 1500) < 120) {
    display.drawLine(64, 18, 58, 34, SSD1306_WHITE);
    display.drawLine(58, 34, 66, 34, SSD1306_WHITE);
    display.drawLine(66, 34, 60, 52, SSD1306_WHITE);
  }
}

void drawWeatherSceneMoment(unsigned long elapsed) {
  display.clearDisplay();

  if (g_outText == "Clear") wsSun(elapsed);
  else if (g_outText == "Rain" || g_outText == "Showers") wsRain(elapsed);
  else if (g_outText == "Snow") wsSnow(elapsed);
  else if (g_outText == "Storm") wsStorm(elapsed);
  else wsClouds(elapsed);  // Cloudy, Fog, or "--" (no data yet) — safe default

  display.setTextSize(1);
  display.setCursor(2, 54);
  display.print(g_outText);
  display.print(" outside");

  display.display();
}
