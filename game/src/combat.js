// combat.js — hitscan resolution, damage, grenade physics and explosions.
// All geometry is plain numbers; nothing here knows about three.js or the DOM.
import { ECONOMY, GRENADES } from './config.js';
import { rayWall, losClear, BOXES } from './map.js';
import { pushKill } from './state.js';

export function dirFromYawPitch(yaw, pitch, out) {
  const cp = Math.cos(pitch);
  out.x = -Math.sin(yaw) * cp; out.y = Math.sin(pitch); out.z = -Math.cos(yaw) * cp;
  return out;
}
export function rightFromYaw(yaw, out) {
  out.x = Math.cos(yaw); out.y = 0; out.z = -Math.sin(yaw);
  return out;
}
export function eyeHeight(c) { return 1.62 - 0.5 * c.crouch; }
export function eyePos(c, out) {
  out.x = c.pos.x; out.y = c.pos.y + eyeHeight(c); out.z = c.pos.z;
  return out;
}
// Aim direction including the recoil offset the shooter has accumulated.
export function aimDir(c, out) {
  return dirFromYawPitch(c.yaw + c.recoilY, c.pitch + c.recoilP, out);
}
function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return Infinity;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  if (d2 > r * r) return Infinity;
  const t = tca - Math.sqrt(r * r - d2);
  return t > 0.001 ? t : Infinity;
}
// Ray vs the vertical capsule of a body: closest approach to its spine segment.
function rayCapsule(ox, oy, oz, dx, dy, dz, c) {
  const y0 = c.pos.y + 0.25, y1 = c.pos.y + 1.35 - 0.4 * c.crouch, r = 0.36;
  // Closest point on the segment to the ray, solved in the XZ/Y param space.
  const px = c.pos.x - ox, py = y0 - oy, pz = c.pos.z - oz;
  const segLen = y1 - y0;
  // Solve for ray t and segment s minimising distance (segment is vertical).
  const a = 1, b = -dy * segLen, cc = segLen * segLen;
  const d = dx * px + dy * py + dz * pz, e = -segLen * py;
  const det = a * cc - b * b;
  let t, s;
  if (Math.abs(det) < 1e-9) { t = d; s = 0; }
  else { t = (d * cc - b * e) / det; s = (a * e - b * d) / det; }
  s = Math.max(0, Math.min(1, s));
  // Recompute t for the clamped s.
  t = dx * px + dy * (py + s * segLen) + dz * pz;
  if (t < 0.001) return Infinity;
  const hx = ox + dx * t - c.pos.x, hy = oy + dy * t - (y0 + s * segLen), hz = oz + dz * t - c.pos.z;
  const dist2 = hx * hx + hy * hy + hz * hz;
  if (dist2 > r * r) return Infinity;
  return Math.max(0.001, t - Math.sqrt(r * r - dist2));
}
export function damageAtRange(def, dist) {
  const [s, e, m] = def.falloff;
  if (dist <= s || e <= s) return def.damage;
  const f = Math.min(1, (dist - s) / (e - s));
  return def.damage * (1 - (1 - m) * f);
}
const _hit = { nx: 0, ny: 0, nz: 0 };
// Fire one hitscan pellet. Returns the hit distance and pushes hit/impact events.
export function resolveHitscan(S, shooter, o, d, def) {
  const wallDist = rayWall(o.x, o.y, o.z, d.x, d.y, d.z, 120, _hit);
  let bestT = wallDist, victim = null, head = false;
  for (const c of S.combatants) {
    if (c === shooter || !c.alive) continue;
    const headY = c.pos.y + 1.52 - 0.47 * c.crouch;
    const th = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, c.pos.x, headY, c.pos.z, 0.26);
    let t = th, isHead = true;
    if (t === Infinity) { t = rayCapsule(o.x, o.y, o.z, d.x, d.y, d.z, c); isHead = false; }
    if (t < bestT) { bestT = t; victim = c; head = isHead; }
  }
  const px = o.x + d.x * bestT, py = o.y + d.y * bestT, pz = o.z + d.z * bestT;
  if (victim) {
    const dmg = damageAtRange(def, bestT) * (head ? def.headMult : 1);
    applyDamage(S, victim, shooter, dmg, head, def.id);
    S.events.push({ t: 'blood', x: px, y: py, z: pz });
  } else if (wallDist < 120) {
    S.events.push({ t: 'impact', x: px, y: py, z: pz, nx: _hit.nx, ny: _hit.ny, nz: _hit.nz });
  }
  return { dist: bestT, x: px, y: py, z: pz, victim, head };
}
export function applyDamage(S, victim, attacker, dmg, head, wid) {
  if (!victim.alive) return;
  let dealt = dmg;
  if (victim.armor > 0) {
    dealt = dmg * 0.5;
    victim.armor = Math.max(0, victim.armor - Math.ceil(dmg * 0.5));
  }
  victim.hp -= dealt;
  victim.lastDamageAt = S.time;
  victim.lastDamageFrom = attacker ? attacker.id : -1;
  if (attacker) {
    attacker.damage += dealt;
    if (attacker.isPlayer) { S.stats.hits++; if (head) S.stats.headshots++; }
  }
  const killed = victim.hp <= 0;
  S.events.push({ t: 'hit', attackerId: attacker ? attacker.id : -1, victimId: victim.id, dmg: dealt, head, killed });
  if (victim.isPlayer && attacker) S.events.push({ t: 'damage', fromX: attacker.pos.x, fromZ: attacker.pos.z });
  if (killed) killCombatant(S, victim, attacker, wid, head);
}
export function killCombatant(S, victim, attacker, wid, head) {
  victim.alive = false; victim.hp = 0; victim.deaths++; victim.channel = null; victim.reloading = 0;
  if (attacker && attacker !== victim) {
    attacker.kills++;
    attacker.money = Math.min(9000, attacker.money + ECONOMY.KILL);
  }
  const aName = attacker ? attacker.name : 'The yard';
  pushKill(S, aName + (head ? ' ▸ ' : '  ') + victim.name, attacker ? attacker.team === S.combatants[S.playerId].team : false);
  S.events.push({ t: 'kill', attackerId: attacker ? attacker.id : -1, victimId: victim.id, wid, head });
  if (victim.carrier && S.bomb.state === 'carried') {
    victim.carrier = false;
    S.bomb.state = 'dropped'; S.bomb.carrierId = -1;
    S.bomb.x = victim.pos.x; S.bomb.z = victim.pos.z;
    S.events.push({ t: 'bombdrop', x: victim.pos.x, z: victim.pos.z });
  }
}
export function meleeHit(S, attacker, def) {
  const o = eyePos(attacker, { x: 0, y: 0, z: 0 });
  const d = aimDir(attacker, { x: 0, y: 0, z: 0 });
  const wallDist = rayWall(o.x, o.y, o.z, d.x, d.y, d.z, def.meleeRange, null);
  let best = null, bestD = def.meleeRange;
  for (const c of S.combatants) {
    if (c === attacker || !c.alive || c.team === attacker.team) continue;
    const dx = c.pos.x - attacker.pos.x, dz = c.pos.z - attacker.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > bestD) continue;
    const dot = (dx * d.x + dz * d.z) / (dist || 1);
    if (dot < 0.5) continue;
    best = c; bestD = dist;
  }
  if (best && bestD < wallDist) {
    applyDamage(S, best, attacker, def.damage, false, def.id);
    return true;
  }
  return false;
}
export function throwGrenade(S, owner, kind, o, d) {
  const speed = kind === 'frag' ? 13 : 11;
  S.projectiles.push({
    kind, ownerId: owner.id, x: o.x, y: o.y, z: o.z,
    vx: d.x * speed, vy: d.y * speed + 1.6, vz: d.z * speed,
    fuse: GRENADES[kind].fuse, rest: false,
  });
  S.events.push({ t: 'throw', id: owner.id, kind });
}
export function stepProjectiles(S, dt) {
  for (let i = S.projectiles.length - 1; i >= 0; i--) {
    const p = S.projectiles[i];
    p.fuse -= dt;
    if (!p.rest) {
      p.vy -= 12 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.12) { p.y = 0.12; if (Math.abs(p.vy) > 1.5) S.events.push({ t: 'bounce', x: p.x, y: p.y, z: p.z }); p.vy = -p.vy * 0.42; p.vx *= 0.7; p.vz *= 0.7; }
      for (let j = 0; j < BOXES.length; j++) {
        const b = BOXES[j];
        if (p.x < b[0] - 0.12 || p.x > b[3] + 0.12 || p.z < b[2] - 0.12 || p.z > b[5] + 0.12) continue;
        if (p.y < b[1] - 0.12 || p.y > b[4] + 0.12) continue;
        // Resolve along the smallest penetration and reflect that component.
        const dxl = p.x - (b[0] - 0.12), dxr = (b[3] + 0.12) - p.x;
        const dzl = p.z - (b[2] - 0.12), dzr = (b[5] + 0.12) - p.z;
        const dyl = p.y - (b[1] - 0.12), dyr = (b[4] + 0.12) - p.y;
        const m = Math.min(dxl, dxr, dzl, dzr, dyl, dyr);
        if (m === dxl) { p.x = b[0] - 0.12; p.vx = -Math.abs(p.vx) * 0.42; }
        else if (m === dxr) { p.x = b[3] + 0.12; p.vx = Math.abs(p.vx) * 0.42; }
        else if (m === dzl) { p.z = b[2] - 0.12; p.vz = -Math.abs(p.vz) * 0.42; }
        else if (m === dzr) { p.z = b[5] + 0.12; p.vz = Math.abs(p.vz) * 0.42; }
        else if (m === dyl) { p.y = b[1] - 0.12; p.vy = -Math.abs(p.vy) * 0.42; }
        else { p.y = b[4] + 0.12; p.vy = Math.abs(p.vy) * 0.42; }
        S.events.push({ t: 'bounce', x: p.x, y: p.y, z: p.z });
      }
      if (Math.hypot(p.vx, p.vy, p.vz) < 0.6) p.rest = true;
    }
    if (p.fuse <= 0) {
      S.projectiles[i] = S.projectiles[S.projectiles.length - 1];
      S.projectiles.pop();
      if (p.kind === 'frag') explode(S, p.x, p.y, p.z, p.ownerId);
      else {
        S.smokes.push({ x: p.x, z: p.z, r: GRENADES.smoke.radius, until: S.time + GRENADES.smoke.duration, born: S.time });
        S.events.push({ t: 'smoke', x: p.x, z: p.z });
      }
    }
  }
}
export function explode(S, x, y, z, ownerId) {
  const def = GRENADES.frag;
  const owner = S.combatants[ownerId];
  S.events.push({ t: 'explode', x, y, z });
  S.noises.push({ x, z, radius: 40, until: S.time + 0.6 });
  for (const c of S.combatants) {
    if (!c.alive) continue;
    const dx = c.pos.x - x, dy = (c.pos.y + 1) - y, dz = c.pos.z - z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > def.radius) continue;
    if (!losClear(x, y, z, c.pos.x, c.pos.y + 1, c.pos.z)) continue;
    const dmg = def.damage * (1 - 0.8 * (dist / def.radius));
    applyDamage(S, c, owner && owner !== c ? owner : null, dmg, false, 'frag');
  }
}
// Does any live smoke volume block the segment? Bots and tracers both use this.
export function smokeBlocks(S, ax, ay, az, bx, by, bz) {
  for (const s of S.smokes) {
    if (s.until <= S.time) continue;
    const cx = s.x, cy = 1.0, cz = s.z;
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len2 = dx * dx + dy * dy + dz * dz;
    let t = len2 > 0 ? ((cx - ax) * dx + (cy - ay) * dy + (cz - az) * dz) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const px = ax + dx * t - cx, py = ay + dy * t - cy, pz = az + dz * t - cz;
    if (px * px + py * py + pz * pz < s.r * s.r * 0.81) return true;
  }
  return false;
}
