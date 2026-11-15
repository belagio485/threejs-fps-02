// map.js — the original "Foundry Yard" map: collision boxes, bomb sites, spawns,
// and the waypoint graph bots navigate. Pure math, no three.js, so the sim and
// its tests can run without a renderer. Boxes are [x0,y0,z0,x1,y1,z1,kind].
// Yaw convention: forward = (-sin(yaw), 0, -cos(yaw)), matching three.js cameras.

export const BOXES = [
  // Perimeter.
  [-32, 0, -24, 32, 4, -23, 'wall'], [-32, 0, 23, 32, 4, 24, 'wall'],
  [-32, 0, -24, -31, 4, 24, 'wall'], [31, 0, -24, 32, 4, 24, 'wall'],
  // Warehouses (north / south blocks) and the central furnace.
  [-16, 0, -21, 6, 3.6, -13, 'building'], [-16, 0, 13, 6, 3.6, 21, 'building'],
  [-4, 0, -5, 4, 4.2, 5, 'furnace'],
  // West gate wall (three gaps) and east wall (centre double doors).
  [-20.3, 0, -12, -19.7, 3.4, -8, 'wall'], [-20.3, 0, -5, -19.7, 3.4, -1, 'wall'],
  [-20.3, 0, 1, -19.7, 3.4, 5, 'wall'], [-20.3, 0, 8, -19.7, 3.4, 12, 'wall'],
  [13.7, 0, -12, 14.3, 3.4, -2, 'wall'], [13.7, 0, 2, 14.3, 3.4, 12, 'wall'],
  // Connector stubs.
  [6, 0, -8.3, 9.5, 3.0, -7.7, 'wall'], [6, 0, 7.7, 9.5, 3.0, 8.3, 'wall'],
  // Overhead gantry deck (high: blocks shots and grenades, never movement) + pillars.
  [-0.9, 4.4, -12.4, 0.9, 4.8, 12.4, 'deck'],
  [-0.4, 0, -12.8, 0.4, 4.5, -12.0, 'pillar'], [-0.4, 0, 12.0, 0.4, 4.5, 12.8, 'pillar'],
  // Site tanks.
  [24, 0, -21.5, 27, 3.0, -18.5, 'tank'], [24, 0, 18.5, 27, 3.0, 21.5, 'tank'],
  // Low walls (shoot over standing, hidden crouched).
  [18.5, 0, -19.5, 21.5, 1.1, -18.9, 'lowwall'], [18.5, 0, 18.9, 21.5, 1.1, 19.5, 'lowwall'],
  [-1.5, 0, -6.8, 1.5, 1.1, -6.2, 'lowwall'], [-1.5, 0, 6.2, 1.5, 1.1, 6.8, 'lowwall'],
];
function bx(cx, cz, w, h, d, kind) { BOXES.push([cx - w / 2, 0, cz - d / 2, cx + w / 2, h, cz + d / 2, kind]); }
// Crates (1.2 m, waist cover).
for (const [x, z] of [[-11, -6.5], [-11, 6.5], [-8, 0], [8, -5.5], [8, 5.5], [20, -8], [20, 8],
  [-24, -8], [-24, 8], [24, -12], [24, 12], [0, -11], [0, 11], [27.5, -10], [27.5, 10],
  [-18, -10], [-18, 10]]) bx(x, z, 1.2, 1.15, 1.2, 'crate');
// Tall crates (block sight fully).
for (const [x, z] of [[-12, -2], [-12, 2], [16, -17], [16, 17], [26, -18], [26, 18], [-22, -3], [-22, 3]])
  bx(x, z, 1.4, 2.3, 1.4, 'tallcrate');
// Barrels.
for (const [x, z] of [[-6, -10.6], [-6, 10.6], [12, -4], [12, 4], [29.5, -14], [29.5, 14]])
  bx(x, z, 0.9, 1.05, 0.9, 'barrel');

export const SITES = {
  A: { id: 'A', x: 22, z: -17, r: 5.5 },
  B: { id: 'B', x: 22, z: 17, r: 5.5 },
};
export const SPAWNS = {
  RAIDERS: [[-29, -6], [-29, -3], [-29, 0], [-29, 3], [-29, 6]].map(([x, z]) => ({ x, z, yaw: -Math.PI / 2 })),
  SENTINELS: [[29, -6], [29, -3], [29, 0], [29, 3], [29, 6]].map(([x, z]) => ({ x, z, yaw: Math.PI / 2 })),
};
export const LAMPS = [[-20, -10], [-20, 10], [10, -14], [10, 14], [22, -10], [22, 10], [-28, 0], [28, 0]];

export const NAV_NODES = {
  w0: [-28, 0], w1: [-24, -6], w2: [-24, 6], w3: [-21, -6.5], w4: [-21, 0], w5: [-21, 6.5],
  n0: [-24, -22], n1: [-10, -22], n2: [4, -22], n2b: [8, -22.3], n3: [12, -19.5], n4: [18, -18],
  n5: [22, -17], n6: [16, -15], n7: [26, -12],
  s0: [-24, 22], s1: [-10, 22], s2: [4, 22], s2b: [8, 22.3], s3: [12, 19.5], s4: [18, 18],
  s5: [22, 17], s6: [16, 15], s7: [26, 12],
  m0: [-14, -8], m1: [-14, 0], m2: [-14, 8], m3: [-8, -9], m4: [-8, 9], m5: [0, -9],
  m6: [0, 9], m7: [8, -9], m8: [8, 9], m9: [10, 0], m10: [10, -6], m11: [10, 6],
  m12: [12, -10], m13: [12, 10],
  e0: [14, 0], e1: [18, -4], e2: [18, 4], e3: [24, -8], e4: [24, 8], e5: [28, 0], e6: [18, 0], e7: [24, 0],
  hA1: [28, -16], hA2: [17, -13], hB1: [28, 16], hB2: [17, 13], hM: [17, 0],
};
const NAV_PAIRS = [
  ['w0', 'w1'], ['w0', 'w2'], ['w0', 'w4'], ['w1', 'w3'], ['w2', 'w5'],
  ['w1', 'n0'], ['w2', 's0'], ['w0', 'n0'], ['w0', 's0'], ['w3', 'n0'], ['w5', 's0'],
  ['w3', 'm0'], ['w4', 'm1'], ['w5', 'm2'], ['w1', 'm0'], ['w2', 'm2'],
  ['n0', 'n1'], ['n1', 'n2'], ['n2', 'n2b'], ['n2b', 'n3'], ['n3', 'n4'], ['n4', 'n5'],
  ['n6', 'n5'], ['n5', 'n7'], ['n6', 'e3'], ['n7', 'e3'], ['n7', 'e5'],
  ['s0', 's1'], ['s1', 's2'], ['s2', 's2b'], ['s2b', 's3'], ['s3', 's4'], ['s4', 's5'],
  ['s6', 's5'], ['s5', 's7'], ['s6', 'e4'], ['s7', 'e4'], ['s7', 'e5'],
  ['m0', 'm1'], ['m1', 'm2'], ['m0', 'm3'], ['m2', 'm4'], ['m3', 'm5'], ['m4', 'm6'],
  ['m5', 'm7'], ['m6', 'm8'], ['m7', 'm12'], ['m8', 'm13'], ['m12', 'm9'], ['m13', 'm9'],
  ['m12', 'm10'], ['m13', 'm11'], ['m10', 'm9'], ['m11', 'm9'], ['m9', 'e0'],
  ['m12', 'n3'], ['m13', 's3'], ['e0', 'e6'], ['e6', 'e1'], ['e6', 'e2'], ['e6', 'e7'],
  ['e1', 'e3'], ['e2', 'e4'], ['e3', 'e7'], ['e4', 'e7'], ['e7', 'e5'], ['e3', 'e5'], ['e4', 'e5'],
  ['e1', 'n6'], ['e2', 's6'],
  ['hA1', 'n5'], ['hA1', 'n7'], ['hA2', 'n6'], ['hA2', 'e1'],
  ['hB1', 's5'], ['hB1', 's7'], ['hB2', 's6'], ['hB2', 'e2'], ['hM', 'e6'], ['hM', 'e7'],
];
export const NAV_ADJ = {};
for (const id of Object.keys(NAV_NODES)) NAV_ADJ[id] = [];
for (const [a, b] of NAV_PAIRS) { NAV_ADJ[a].push(b); NAV_ADJ[b].push(a); }
// Defender hold spots: node + where to look.
export const HOLDS = [
  { node: 'hA1', site: 'A', look: [18, -19] }, { node: 'hA2', site: 'A', look: [12, -19.5] },
  { node: 'hB1', site: 'B', look: [18, 19] }, { node: 'hB2', site: 'B', look: [12, 19.5] },
  { node: 'hM', site: null, look: [10, 0] },
];
export const LANE_ENTRIES = { north: 'n1', midN: 'm5', midS: 'm6', south: 's1' };

export function yawTo(x0, z0, x1, z1) { return Math.atan2(-(x1 - x0), -(z1 - z0)); }
export function siteAt(x, z) {
  for (const key of ['A', 'B']) {
    const s = SITES[key], dx = x - s.x, dz = z - s.z;
    if (dx * dx + dz * dz <= s.r * s.r) return s;
  }
  return null;
}
export function nearestNode(x, z) {
  let best = 'w0', bd = Infinity;
  for (const id in NAV_NODES) {
    const n = NAV_NODES[id], dx = n[0] - x, dz = n[1] - z, d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = id; }
  }
  return best;
}
// Breadth-first path; returns node ids excluding start, including goal. Called
// only when a bot picks a new goal, never per frame.
export function findPath(fromId, toId) {
  if (fromId === toId) return [toId];
  const prev = { [fromId]: null }, queue = [fromId];
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi];
    for (const nb of NAV_ADJ[cur]) {
      if (nb in prev) continue;
      prev[nb] = cur;
      if (nb === toId) {
        const path = [nb];
        let p = cur;
        while (p !== null) { path.push(p); p = prev[p]; }
        path.reverse();
        return path.slice(1);
      }
      queue.push(nb);
    }
  }
  return null;
}
// Slab ray vs all boxes. dir must be unit length. Fills out {nx,ny,nz} with the
// entry-face normal; returns Infinity when nothing is hit within maxDist.
export function rayWall(ox, oy, oz, dx, dy, dz, maxDist, out) {
  let best = Infinity, bnx = 0, bny = 0, bnz = 0;
  for (let i = 0; i < BOXES.length; i++) {
    const b = BOXES[i];
    let tmin = 0, tmax = maxDist, nx = 0, ny = 0, nz = 0, ok = true;
    // X slab
    if (Math.abs(dx) < 1e-9) { if (ox < b[0] || ox > b[3]) ok = false; }
    else {
      let t1 = (b[0] - ox) / dx, t2 = (b[3] - ox) / dx, s = -1;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s = 1; }
      if (t1 > tmin) { tmin = t1; nx = s; ny = 0; nz = 0; }
      if (t2 < tmax) tmax = t2;
    }
    if (ok) {
      if (Math.abs(dy) < 1e-9) { if (oy < b[1] || oy > b[4]) ok = false; }
      else {
        let t1 = (b[1] - oy) / dy, t2 = (b[4] - oy) / dy, s = -1;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s = 1; }
        if (t1 > tmin) { tmin = t1; nx = 0; ny = s; nz = 0; }
        if (t2 < tmax) tmax = t2;
      }
    }
    if (ok) {
      if (Math.abs(dz) < 1e-9) { if (oz < b[2] || oz > b[5]) ok = false; }
      else {
        let t1 = (b[2] - oz) / dz, t2 = (b[5] - oz) / dz, s = -1;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s = 1; }
        if (t1 > tmin) { tmin = t1; nx = 0; ny = 0; nz = s; }
        if (t2 < tmax) tmax = t2;
      }
    }
    if (ok && tmin <= tmax && tmin < best && tmin > 0.001) { best = tmin; bnx = nx; bny = ny; bnz = nz; }
  }
  if (out) { out.nx = bnx; out.ny = bny; out.nz = bnz; }
  return best;
}
export function losClear(ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return true;
  return rayWall(ax, ay, az, dx / len, dy / len, dz / len, len - 0.05, null) === Infinity;
}
// Axis-separated slide: move, then push out of any overlapped box on that axis.
export function collideMove(p, v, dt, radius, height) {
  p.x += v.x * dt;
  pushOut(p, v, 'x', radius, height);
  p.z += v.z * dt;
  pushOut(p, v, 'z', radius, height);
}
function pushOut(p, v, axis, r, h) {
  for (let i = 0; i < BOXES.length; i++) {
    const b = BOXES[i];
    if (p.y >= b[4] || p.y + h <= b[1]) continue;
    if (p.x + r <= b[0] || p.x - r >= b[3]) continue;
    if (p.z + r <= b[2] || p.z - r >= b[5]) continue;
    if (axis === 'x') {
      const pl = (p.x + r) - b[0], pr = b[3] - (p.x - r);
      p.x = pl < pr ? b[0] - r : b[3] + r;
      v.x = 0;
    } else {
      const pl = (p.z + r) - b[2], pr = b[5] - (p.z - r);
      p.z = pl < pr ? b[2] - r : b[5] + r;
      v.z = 0;
    }
  }
}
