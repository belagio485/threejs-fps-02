// state.js — the single match state. Every module reads and mutates this one
// object; no other module keeps match state of its own.
import { ECONOMY, WEAPONS, BOT_NAMES } from './config.js';
import { SPAWNS } from './map.js';
import { mulberry32 } from './rng.js';

export function freshAmmo(wid) {
  const d = WEAPONS[wid];
  return { mag: d.mag, reserve: d.reserve };
}
// Resolve a combatant's selected slot to a weapon id ('frag'/'smoke' stay grenades).
export function weaponOf(c) {
  if (c.slot === 'primary') return c.weapons.primary || 'p9';
  if (c.slot === 'secondary') return 'p9';
  if (c.slot === 'melee') return 'blade';
  return c.slot;
}
export function makeCombatant(id, name, team, isPlayer, spawn, rng) {
  return {
    id, name, team, isPlayer, alive: true, hp: 100, armor: 0, hasKit: false,
    pos: { x: spawn.x, y: 0, z: spawn.z }, vel: { x: 0, y: 0, z: 0 },
    yaw: spawn.yaw, pitch: 0, crouch: 0, onGround: true,
    weapons: { primary: null, secondary: 'p9', melee: 'blade' },
    grenades: { frag: 0, smoke: 0 }, slot: 'secondary',
    ammo: { p9: freshAmmo('p9') },
    reloading: 0, reloadWid: null, nextShotAt: 0, triggerHeld: false,
    bloom: 0, recoilP: 0, recoilY: 0, ads: 0, firing: false,
    money: ECONOMY.START, kills: 0, deaths: 0, damage: 0,
    carrier: false, channel: null, stepPhase: 0, speed2d: 0,
    lastDamageAt: -99, lastDamageFrom: -1, rng, bot: null,
  };
}
export function createMatch(mode, difficulty, seed) {
  const rng = mulberry32(seed);
  const combatants = [];
  const names = [...BOT_NAMES];
  for (let i = 0; i < 10; i++) {
    const team = i < 5 ? 'RAIDERS' : 'SENTINELS';
    const spawn = SPAWNS[team][i % 5];
    const isPlayer = i === 0;
    const name = isPlayer ? 'You' : names.splice(Math.floor(rng() * names.length), 1)[0];
    combatants.push(makeCombatant(i, name, team, isPlayer, spawn, mulberry32(seed + 101 * (i + 1))));
  }
  combatants[0].carrier = mode === 'match';
  return {
    mode, difficulty, seed, rng, phase: 'menu', time: 0, tick: 0,
    round: 0, wins: { RAIDERS: 0, SENTINELS: 0 }, lossStreak: { RAIDERS: 0, SENTINELS: 0 },
    phaseTime: 0, roundTime: 0, attackers: 'RAIDERS', swapped: false,
    combatants, playerId: 0,
    bomb: { state: mode === 'match' ? 'carried' : 'none', carrierId: 0, x: 0, z: 0, site: null, fuse: 0, defuserId: -1, planterId: -1, progress: 0, lastBeep: 0 },
    events: [], noises: [], projectiles: [], smokes: [], spotted: {},
    killfeed: [], banner: null, toast: null, toastUntil: 0,
    roundWinner: null, matchWinner: null, targetSite: 'A',
    stats: { shots: 0, hits: 0, headshots: 0 },
  };
}
// Return a combatant to its spawn, fresh for a new round. Loadout survival is
// decided by rounds.js before this runs.
export function spawnCombatant(c, spawn) {
  c.pos.x = spawn.x; c.pos.y = 0; c.pos.z = spawn.z;
  c.vel.x = 0; c.vel.y = 0; c.vel.z = 0;
  c.yaw = spawn.yaw; c.pitch = 0; c.crouch = 0; c.onGround = true;
  c.alive = true; c.hp = 100; c.reloading = 0; c.reloadWid = null;
  c.nextShotAt = 0; c.triggerHeld = false; c.bloom = 0; c.recoilP = 0; c.recoilY = 0;
  c.ads = 0; c.firing = false; c.channel = null; c.carrier = false; c.stepPhase = 0; c.speed2d = 0;
  for (const wid in c.ammo) { const d = WEAPONS[wid]; c.ammo[wid].mag = d.mag; c.ammo[wid].reserve = d.reserve; }
  if (c.bot) { c.bot.state = 'spawn'; c.bot.path = null; c.bot.pathI = 0; c.bot.targetId = -1; c.bot.lastKnown = null; c.bot.reactUntil = 0; c.bot.burstLeft = 0; c.bot.pauseUntil = 0; c.bot.holdYaw = null; }
}
export function playerOf(S) { return S.combatants[S.playerId]; }
export function countAlive(S, team) {
  let n = 0;
  for (const c of S.combatants) if (c.team === team && c.alive) n++;
  return n;
}
export function foesAlive(S, c) {
  const out = [];
  for (const o of S.combatants) if (o.team !== c.team && o.alive) out.push(o);
  return out;
}
export function pushKill(S, text, good) {
  S.killfeed.push({ text, good, t: S.time });
  if (S.killfeed.length > 5) S.killfeed.shift();
}
export function setBanner(S, text, sub, team) {
  S.banner = { text, sub: sub || '', team: team || null };
}
export function setToast(S, text, dur) {
  S.toast = text; S.toastUntil = S.time + (dur || 3);
}
