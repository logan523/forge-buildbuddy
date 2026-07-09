// BuildBuddy — 0.96" SSD1306 module (~27×27×4 mm)
// openscad -o oled.stl assets/scad/sat_oled.scad

w = 27;
h = 27;
d = 4;
fn = 24;

module rbox(ww, hh, dd, r = 0.4) {
  hull() {
    for (sx = [-1, 1], sy = [-1, 1]) {
      translate([sx * (ww / 2 - r), sy * (hh / 2 - r), 0])
        cylinder(h = dd, r = r, center = true, $fn = fn);
    }
  }
}

// PCB
translate([0, 0, -0.6]) rbox(w, h, 1.6);
// Bezel
rbox(w * 0.96, h * 0.9, 2.2);
// Active glass (inset)
translate([0, 1, 1.4])
  cube([w * 0.78, h * 0.62, 0.4], center = true);
