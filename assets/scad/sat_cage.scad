// Forge sat_clock — brass wire cube cage (life-size craft)
// Default size from deriveCageEdgeMm (~48 mm), not illustration 68.
// openscad -o cage.stl -D 'size=48' -D 'rod_r=2.0' -D 'fn=48' assets/scad/sat_cage.scad
// Units: mm. Centered at origin (matches frame node local space).

size = 48;
rod_r = 2.0;
fn = 32;
corner_scale = 1.55;

module rod(p1, p2) {
  dir = p2 - p1;
  h = norm(dir);
  if (h > 0.01) {
    translate(p1)
      rotate([0, acos(dir.z / h), atan2(dir.y, dir.x)])
        cylinder(h = h, r = rod_r, $fn = fn);
  }
}

module cage() {
  h = size / 2;
  corners = [
    [-h, -h, -h], [h, -h, -h], [h, h, -h], [-h, h, -h],
    [-h, -h, h], [h, -h, h], [h, h, h], [-h, h, h]
  ];
  edges = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7]
  ];
  for (e = edges) {
    rod(corners[e[0]], corners[e[1]]);
  }
  for (c = corners) {
    translate(c) sphere(r = rod_r * corner_scale, $fn = fn);
  }
}

cage();
