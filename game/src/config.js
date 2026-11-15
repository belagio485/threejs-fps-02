// config.js — every tuning number in one place. No other module hard-codes balance.
export const SIM_DT = 1 / 60;
export const TEAMS = { RAIDERS: 'RAIDERS', SENTINELS: 'SENTINELS' };
export const TEAM_INFO = {
  RAIDERS: { name: 'Raiders', css: '#f59e0b', color: 0xf59e0b, dark: 0x7c4a03 },
  SENTINELS: { name: 'Sentinels', css: '#2dd4bf', color: 0x2dd4bf, dark: 0x0f4a42 },
};
export const ROUND = {
  BUY_TIME: 12, ROUND_TIME: 100, END_TIME: 4.5,
  WIN_ROUNDS: 5, MAX_ROUNDS: 9, SKIRMISH_WIN: 3, SKIRMISH_MAX: 5,
  PLANT_TIME: 3.0, FUSE_TIME: 35, DEFUSE_TIME: 5.0, DEFUSE_KIT_TIME: 2.5,
  HALFTIME_AFTER: 4, PICKUP_RADIUS: 1.2, DEFUSE_RADIUS: 1.7,
};
export const ECONOMY = {
  START: 800, MAX: 9000, KILL: 300,
  WIN_ELIM: 1400, WIN_OBJECTIVE: 1600, LOSS: 1000, LOSS_STREAK: 300, LOSS_STREAK_MAX: 3,
  ARMOR: 500, KIT: 400,
};
// damage = close-range body damage; falloff [startM, endM, endMult]; spread in radians.
export const WEAPONS = {
  p9: { id: 'p9', name: 'P9 Sidearm', slot: 'secondary', price: 0, damage: 26, headMult: 2.2, interval: 0.16, mag: 12, reserve: 48, reload: 1.5, spread: 0.012, moveSpread: 0.03, bloom: 0.006, bloomMax: 0.05, kick: 0.011, pellets: 1, falloff: [15, 35, 0.7], auto: false, zoom: 0.82 },
  vex9: { id: 'vex9', name: 'VEX-9 Repeater', slot: 'primary', price: 900, damage: 24, headMult: 2.4, interval: 0.08, mag: 30, reserve: 90, reload: 2.0, spread: 0.02, moveSpread: 0.035, bloom: 0.005, bloomMax: 0.06, kick: 0.007, pellets: 1, falloff: [14, 32, 0.65], auto: true, zoom: 0.8 },
  kr7: { id: 'kr7', name: 'KR-7 Carbine', slot: 'primary', price: 2100, damage: 31, headMult: 3.6, interval: 0.1, mag: 30, reserve: 90, reload: 2.4, spread: 0.008, moveSpread: 0.045, bloom: 0.007, bloomMax: 0.07, kick: 0.012, pellets: 1, falloff: [20, 42, 0.7], auto: true, zoom: 0.78 },
  breacher: { id: 'breacher', name: 'Breacher-12', slot: 'primary', price: 1100, damage: 11, headMult: 1.8, interval: 0.78, mag: 6, reserve: 24, reload: 2.8, spread: 0.055, moveSpread: 0.03, bloom: 0.02, bloomMax: 0.08, kick: 0.05, pellets: 8, falloff: [8, 20, 0.45], auto: false, zoom: 0.85 },
  longshot: { id: 'longshot', name: 'Longshot-88', slot: 'primary', price: 3800, damage: 108, headMult: 3.0, interval: 1.05, mag: 5, reserve: 15, reload: 3.2, spread: 0.055, adsSpread: 0.0008, moveSpread: 0.06, bloom: 0.03, bloomMax: 0.05, kick: 0.035, pellets: 1, falloff: [30, 60, 0.85], auto: false, zoom: 0.3 },
  blade: { id: 'blade', name: 'Utility Blade', slot: 'melee', price: 0, damage: 55, headMult: 1, interval: 0.45, mag: 0, reserve: 0, reload: 0, spread: 0, moveSpread: 0, bloom: 0, bloomMax: 0, kick: 0, pellets: 1, falloff: [0, 0, 1], auto: false, zoom: 1, meleeRange: 2.1 },
};
export const GRENADES = {
  frag: { id: 'frag', name: 'Frag Charge', price: 300, fuse: 2.1, radius: 6.5, damage: 95 },
  smoke: { id: 'smoke', name: 'Smoke Canister', price: 250, fuse: 1.4, radius: 3.2, duration: 13 },
};
export const MOVE = {
  RUN: 5.4, WALK: 2.7, CROUCH: 2.2, ADS_MULT: 0.62, JUMP: 4.6, GRAVITY: 13.5,
  ACCEL: 42, FRICTION: 10.5, EYE_STAND: 1.62, EYE_CROUCH: 1.12,
  RADIUS: 0.35, HEIGHT_STAND: 1.8, HEIGHT_CROUCH: 1.25,
};
export const DIFFICULTY = {
  recruit: { label: 'Recruit', reaction: 0.5, aimErr: 0.085, burst: [2, 3], burstPause: 0.45, aggression: 0.55, hearMult: 0.8 },
  standard: { label: 'Standard', reaction: 0.34, aimErr: 0.058, burst: [3, 5], burstPause: 0.32, aggression: 0.72, hearMult: 1.0 },
  veteran: { label: 'Veteran', reaction: 0.22, aimErr: 0.04, burst: [4, 6], burstPause: 0.24, aggression: 0.88, hearMult: 1.15 },
};
export const BOT_NAMES = ['Ash', 'Bram', 'Cinder', 'Dusk', 'Ember', 'Flint', 'Gale', 'Holt', 'Iris', 'Joss'];
export const PALETTE = {
  sky: 0x1b2436, horizon: 0x3a2b22, fog: 0x232c3d, sun: 0xffb45e, hemiSky: 0x8fa8cc,
  hemiGround: 0x3d3428, ground: 0x4a4d52, wall: 0x6b6f76, wallDark: 0x54575e,
  rust: 0x8a5a2b, steel: 0x39424e, accent: 0xf59e0b, teal: 0x2dd4bf,
  crate: 0x7d6a4a, crateDark: 0x5d4f38, barrel: 0xa33b2e, barrel2: 0x2e6b8a,
};
