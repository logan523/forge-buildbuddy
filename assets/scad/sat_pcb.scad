// Forge — FR4 blank (defaults = ESP32-C3 SuperMini real mm)
// openscad -o pcb.stl -D 'w=22.5' -D 'h=18' -D 'd=3.2' assets/scad/sat_pcb.scad
// Board in XY, thickness Z; origin center.

w = 22.5;
h = 18;
d = 3.2;
fn = 24;

module rbox(ww, hh, dd, r = 0.5) {
  hull() {
    for (sx = [-1, 1], sy = [-1, 1]) {
      translate([sx * (ww / 2 - r), sy * (hh / 2 - r), 0])
        cylinder(h = dd, r = r, center = true, $fn = fn);
    }
  }
}

difference() {
  rbox(w, h, d);
  // USB-C recess on short edge (−Y)
  translate([0, -h / 2, 0])
    cube([9, 2.8, d * 0.7], center = true);
}
