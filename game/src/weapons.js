// weapons.js — firing, spread/recoil, reload, switching, and the buy menu's
// economy. Bots and the player fire through this one path, so both obey the
// same accuracy rules: moving fire spreads, stopping to aim pays.
import { WEAPONS, GRENADES, ECONOMY, MOVE } from './config.js';
import { weaponOf, freshAmmo } from './state.js';
import { aimDir, eyePos, rightFromYaw, resolveHitscan, meleeHit, throwGrenade } from './combat.js';
import { gauss } from './rng.js';

export function currentDef(c) {
  const wid = weaponOf(c);
  return WEAPONS[wid] || null;
}
export function spreadNow(c, def) {
  let base = def.spread;
  if (def.adsSpread !== undefined) base = def.spread + (def.adsSpread - def.spread) * c.ads;
  let s = base + c.bloom + (c.speed2d / MOVE.RUN) * def.moveSpread;
  if (!c.onGround) s += 0.03;
  if (c.crouch > 0.5) s *= 0.75;
  s *= 1 - 0.45 * c.ads;
  return s;
}
const _o = { x: 0, y: 0, z: 0 }, _d = { x: 0, y: 0, z: 0 }, _r = { x: 0, y: 0, z: 0 }, _u = { x: 0, y: 0, z: 0 }, _m = { x: 0, y: 0, z: 0 }, _p = { x: 0, y: 0, z: 0 };
export function tryFire(S, c, triggerEdge) {
  if (!c.alive || c.reloading > 0 || c.channel) return false;
  if (S.time < c.nextShotAt) return false;
  const slot = c.slot;
  if (slot === 'frag' || slot === 'smoke') {
    if (c.grenades[slot] <= 0) return false;
    c.grenades[slot]--;
    eyePos(c, _o); aimDir(c, _d);
    throwGrenade(S, c, slot, _o, _d);
    c.nextShotAt = S.time + 0.45;
    if (c.grenades[slot] <= 0) c.slot = c.prevSlot && c.prevSlot !== slot ? c.prevSlot : 'secondary';
    return true;
  }
  const def = currentDef(c);
  if (!def) return false;
  if (def.id === 'blade') {
    c.nextShotAt = S.time + def.interval;
    meleeHit(S, c, def);
    S.events.push({ t: 'swing', id: c.id });
    return true;
  }
  if (!def.auto && !triggerEdge) return false;
  const ammo = c.ammo[def.id];
  if (!ammo || ammo.mag <= 0) {
    S.events.push({ t: 'dry', id: c.id });
    startReload(S, c);
    c.nextShotAt = S.time + 0.25;
    return false;
  }
  ammo.mag--;
  c.nextShotAt = S.time + def.interval;
  c.bloom = Math.min(def.bloomMax, c.bloom + def.bloom);
  c.recoilP += def.kick * (0.85 + 0.3 * c.rng());
  c.recoilY += gauss(c.rng) * def.kick * 0.35;
  if (c.isPlayer) S.stats.shots++;
  eyePos(c, _o); aimDir(c, _d); rightFromYaw(c.yaw, _r);
  // Muzzle: ahead and slightly to the right of the eye, for tracers and flashes.
  const mx = _o.x + _d.x * 0.45 + _r.x * 0.14, my = _o.y + _d.y * 0.45 - 0.09, mz = _o.z + _d.z * 0.45 + _r.z * 0.14;
  S.events.push({ t: 'shot', id: c.id, wid: def.id, x: mx, y: my, z: mz });
  S.noises.push({ x: c.pos.x, z: c.pos.z, radius: def.id === 'breacher' ? 32 : 26, until: S.time + 0.5, team: c.team });
  const spread = spreadNow(c, def);
  for (let p = 0; p < def.pellets; p++) {
    // Orthonormal basis around the aim direction; perturb within the spread cone.
    _u.x = _d.y * _r.z - _d.z * _r.y; _u.y = _d.z * _r.x - _d.x * _r.z; _u.z = _d.x * _r.y - _d.y * _r.x;
    const gx = gauss(c.rng) * spread, gy = gauss(c.rng) * spread;
    let px = _d.x + _r.x * gx + _u.x * gy, py = _d.y + _r.y * gx + _u.y * gy, pz = _d.z + _r.z * gx + _u.z * gy;
    const len = Math.hypot(px, py, pz) || 1;
    px /= len; py /= len; pz /= len;
    _m.x = mx; _m.y = my; _m.z = mz; _p.x = px; _p.y = py; _p.z = pz;
    const hit = resolveHitscan(S, c, _m, _p, def);
    S.events.push({ t: 'tracer', ox: mx, oy: my, oz: mz, x: hit.x, y: hit.y, z: hit.z, wid: def.id });
  }
  return true;
}
export function startReload(S, c) {
  const def = currentDef(c);
  if (!def || def.id === 'blade' || c.reloading > 0) return false;
  const ammo = c.ammo[def.id];
  if (!ammo || ammo.mag >= def.mag || ammo.reserve <= 0) return false;
  c.reloading = def.reload; c.reloadWid = def.id;
  S.events.push({ t: 'reload', id: c.id, wid: def.id });
  return true;
}
// Per-tick weapon upkeep: reload completion, bloom/recoil recovery, ADS blend.
export function stepWeaponTimers(S, c, dt, wantAds) {
  if (c.reloading > 0) {
    c.reloading -= dt;
    if (c.reloading <= 0) {
      c.reloading = 0;
      const def = WEAPONS[c.reloadWid], ammo = c.ammo[c.reloadWid];
      if (def && ammo) {
        const need = def.mag - ammo.mag, take = Math.min(need, ammo.reserve);
        ammo.mag += take; ammo.reserve -= take;
      }
      c.reloadWid = null;
    }
  }
  c.bloom = Math.max(0, c.bloom - dt * 0.09);
  c.recoilP = approach(c.recoilP, 0, dt * 0.055);
  c.recoilY = approach(c.recoilY, 0, dt * 0.09);
  const target = wantAds ? 1 : 0;
  c.ads = approach(c.ads, target, dt * 8);
}
function approach(v, target, step) {
  if (v < target) return Math.min(target, v + step);
  return Math.max(target, v - step);
}
export function switchSlot(S, c, slot) {
  if (!c.alive || c.channel) return false;
  if (slot === 'primary' && !c.weapons.primary) return false;
  if ((slot === 'frag' || slot === 'smoke') && c.grenades[slot] <= 0) return false;
  if (slot === c.slot) return false;
  if (slot === 'frag' || slot === 'smoke') c.prevSlot = c.slot;
  c.slot = slot; c.reloading = 0; c.reloadWid = null;
  c.nextShotAt = Math.max(c.nextShotAt, S.time + 0.18);
  S.events.push({ t: 'switch', id: c.id, slot });
  return true;
}
export function cycleSlot(S, c, dir) {
  const order = [];
  if (c.weapons.primary) order.push('primary');
  order.push('secondary', 'melee');
  if (c.grenades.frag > 0) order.push('frag');
  if (c.grenades.smoke > 0) order.push('smoke');
  const i = order.indexOf(c.slot);
  const next = order[(i + dir + order.length) % order.length];
  return switchSlot(S, c, next);
}
export function buyItem(S, c, itemId) {
  if (S.phase !== 'buy') return { ok: false, reason: 'Buy time is over' };
  if (itemId === 'armor') {
    if (c.armor >= 100) return { ok: false, reason: 'Armor already full' };
    if (c.money < ECONOMY.ARMOR) return { ok: false, reason: 'Not enough money' };
    c.money -= ECONOMY.ARMOR; c.armor = 100;
  } else if (itemId === 'kit') {
    if (c.team === S.attackers) return { ok: false, reason: 'Defenders only' };
    if (c.hasKit) return { ok: false, reason: 'Already carrying a kit' };
    if (c.money < ECONOMY.KIT) return { ok: false, reason: 'Not enough money' };
    c.money -= ECONOMY.KIT; c.hasKit = true;
  } else if (GRENADES[itemId]) {
    if (c.grenades[itemId] >= 2) return { ok: false, reason: 'Carrying the maximum' };
    if (c.money < GRENADES[itemId].price) return { ok: false, reason: 'Not enough money' };
    c.money -= GRENADES[itemId].price; c.grenades[itemId]++;
  } else if (WEAPONS[itemId] && WEAPONS[itemId].slot === 'primary') {
    if (c.weapons.primary === itemId) return { ok: false, reason: 'Already owned' };
    if (c.money < WEAPONS[itemId].price) return { ok: false, reason: 'Not enough money' };
    c.money -= WEAPONS[itemId].price;
    c.weapons.primary = itemId;
    c.ammo[itemId] = freshAmmo(itemId);
    c.slot = 'primary';
  } else {
    return { ok: false, reason: 'Unknown item' };
  }
  S.events.push({ t: 'buy', id: c.id, item: itemId });
  return { ok: true };
}
// Bots spend with simple rules: rifle first, then armor, then grenades and kit.
export function botBuy(S, c) {
  if (c.weapons.primary) {
    if (c.armor < 100 && c.money >= ECONOMY.ARMOR) { c.money -= ECONOMY.ARMOR; c.armor = 100; }
  } else if (c.money >= 3800 && c.id % 5 === 4) {
    c.weapons.primary = 'longshot'; c.money -= 3800; c.ammo.longshot = freshAmmo('longshot');
  } else if (c.money >= 2100) {
    c.weapons.primary = 'kr7'; c.money -= 2100; c.ammo.kr7 = freshAmmo('kr7');
  } else if (c.money >= 1100 && c.rng() < 0.4) {
    c.weapons.primary = 'breacher'; c.money -= 1100; c.ammo.breacher = freshAmmo('breacher');
  } else if (c.money >= 900) {
    c.weapons.primary = 'vex9'; c.money -= 900; c.ammo.vex9 = freshAmmo('vex9');
  }
  if (c.armor < 100 && c.money >= ECONOMY.ARMOR) { c.money -= ECONOMY.ARMOR; c.armor = 100; }
  if (c.money >= 300 && c.grenades.frag < 1) { c.money -= 300; c.grenades.frag++; }
  if (c.money >= 250 && c.grenades.smoke < 1 && c.rng() < 0.6) { c.money -= 250; c.grenades.smoke++; }
  if (c.team !== S.attackers && !c.hasKit && c.money >= ECONOMY.KIT) { c.money -= ECONOMY.KIT; c.hasKit = true; }
  if (c.weapons.primary) c.slot = 'primary';
}
