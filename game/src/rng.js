// rng.js — small seeded RNG (mulberry32) so bot behaviour is reproducible per match.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function range(rng, lo, hi) { return lo + rng() * (hi - lo); }
export function int(rng, lo, hi) { return lo + Math.floor(rng() * (hi - lo + 1)); }
export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
export function chance(rng, p) { return rng() < p; }
// Approximately normal in [-1, 1], for spread and aim error. No allocation.
export function gauss(rng) { return (rng() + rng() + rng()) - 1.5; }
