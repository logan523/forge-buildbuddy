// Forge sat_clock — metal stand (life-size desk prop)
// openscad -o stand.stl -D 'stem_h=90' -D 'foot_r=18' assets/scad/sat_stand.scad

stem_r = 2.2;
stem_h = 90;
foot_r = 18;
foot_h = 3.5;
fn = 48;

union() {
  // foot disk at Y=0 plane (scene: foot on ground)
  translate([0, 0, foot_h / 2])
    cylinder(h = foot_h, r = foot_r, center = true, $fn = fn);
  translate([0, 0, foot_h + stem_h / 2])
    cylinder(h = stem_h, r = stem_r, center = true, $fn = fn);
}
