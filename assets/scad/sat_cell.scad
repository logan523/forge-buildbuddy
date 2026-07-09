// BuildBuddy sat_clock — real 16340 cell (Ø16.5 × 34 mm)
// Local Y = length (matches RealPartSpec / sat-pins ±Y terminals)
// openscad -o cell.stl -D 'radius=8.25' -D 'height=34' -D 'fn=48' assets/scad/sat_cell.scad

radius = 8.25;
height = 34;
fn = 48;

union() {
  cylinder(h = height * 0.88, r = radius, center = true, $fn = fn);
  translate([0, 0, height * 0.44])
    cylinder(h = height * 0.08, r = radius * 0.55, center = true, $fn = fn);
  translate([0, 0, -height * 0.44])
    cylinder(h = height * 0.06, r = radius * 0.95, center = true, $fn = fn);
}
