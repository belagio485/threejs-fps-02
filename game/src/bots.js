// bots.js — bot brains: routes, holds, perception (sight + hearing), aim with
// reaction time and error, burst fire, strafing, and objective play (plant,
// defuse, retrieve). Bots use the same weapons and collision as the player.
import { MOVE, ROUND, DIFFICULTY } from './config.js';
import { nearestNode, findPath, NAV_NODES, HOLDS, LANE_ENTRIES, SITES, siteAt, yawTo, losClear, collideMove } from './map.js';
import { eyePos, eyeHeight, smokeBlocks } from './combat.js';
import { foesAlive } from './state.js';
import { tryFire, startReload, stepWeaponTimers, currentDef, switchSlot } from './weapons.js';
import { int, range, chance } from './rng.js';

function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export function initBot(c) {
  c.bot = {
    state: 'spawn', lane: null, hold: null, goals: [], path: null, pathI: 0,
    targetId: -1, lastKnown: null, seenAt: -99, reactUntil: 0, aimErr: 0.1,
    burstLeft: 0, pauseUntil: 0, strafeDir: 1, strafeUntil: 0,
    thinkAt: 0, investigateUntil: 0, patrolI: 0, stuckCheckAt: 0,
    lastX: c.pos.x, lastZ: c.pos.z, unstuckUntil: 0, sidestep: 1,
    desiredYaw: c.yaw, desiredPitch: 0, throwFrag: false, aimHead: false,
  };
}
export function seesTarget(S, observer, target, fovCos) {
  const dx = target.pos.x - observer.pos.x, dz = target.pos.z - observer.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 48) return false;
  if (dist > 6) {
    const fx = -Math.sin(observer.yaw), fz = -Math.cos(observer.yaw);
    if ((dx * fx + dz * fz) / (dist || 1) < fovCos) return false;
  }
  const oy = observer.pos.y + eyeHeight(observer), ty = target.pos.y + 1.2;
  if (!losClear(observer.pos.x, oy, observer.pos.z, target.pos.x, ty, target.pos.z)) return false;
  if (smokeBlocks(S, observer.pos.x, oy, observer.pos.z, target.pos.x, ty, target.pos.z)) return false;
  return true;
}
function setGoals(bot, goals) { bot.goals = goals; bot.path = null; bot.pathI = 0; }
function goalNodeId(g) { return typeof g === 'string' ? g : nearestNode(g[0], g[1]); }
// Roles for a fresh round: attackers take lanes toward the target site,
// defenders take hold spots. The human fills one slot on their team.
export function assignRoles(S) {
  const diff = DIFFICULTY[S.difficulty];
  const site = chance(S.rng, 0.5) ? 'A' : 'B';
  S.targetSite = site;
  const mainLane = site === 'A' ? (chance(S.rng, 0.5) ? 'north' : 'midN') : (chance(S.rng, 0.5) ? 'south' : 'midS');
  const lanes = ['north', 'midN', 'midS', 'south'].filter((l) => l !== mainLane);
  let ai = 0;
  const holds = [...HOLDS];
  for (const c of S.combatants) {
    if (c.isPlayer) continue;
    if (!c.bot) initBot(c);
    const b = c.bot;
    b.state = 'advance'; b.targetId = -1; b.lastKnown = null; b.goals = []; b.path = null;
    if (c.team === S.attackers) {
      b.lane = ai % 3 === 0 ? mainLane : lanes[ai % lanes.length];
      ai++;
      const entry = LANE_ENTRIES[b.lane];
      const siteNode = site === 'A' ? 'n5' : 's5';
      setGoals(b, [entry, siteNode]);
      b.role = 'attack';
    } else {
      const hold = holds.splice(Math.floor(c.rng() * holds.length), 1)[0] || HOLDS[4];
      b.hold = hold; b.role = 'defend';
      setGoals(b, [hold.node]);
      b.state = 'advance';
    }
    b.aimHead = c.rng() < (S.difficulty === 'veteran' ? 0.3 : 0.12);
    b.thinkAt = S.time + (c.id % 9) * 0.014;
  }
  return diff;
}
function ensurePath(S, c) {
  const b = c.bot;
  if (b.path || b.goals.length === 0) return;
  const goal = b.goals[0];
  const goalId = goalNodeId(goal);
  const fromId = nearestNode(c.pos.x, c.pos.z);
  // Already at the goal node: steer directly (a point goal) or arrive (a node).
  if (fromId === goalId) { b.path = []; b.pathI = 0; return; }
  b.path = findPath(fromId, goalId) || [goalId];
  b.pathI = 0;
}
function currentPoint(S, c) {
  const b = c.bot;
  if (b.path && b.pathI < b.path.length) {
    const n = NAV_NODES[b.path[b.pathI]];
    return { x: n[0], z: n[1], isNode: true };
  }
  if (b.goals.length > 0) {
    const g = b.goals[0];
    if (typeof g !== 'string') return { x: g[0], z: g[1], isNode: false };
    const n = NAV_NODES[g];
    return { x: n[0], z: n[1], isNode: true };
  }
  return null;
}
function thinkBot(S, c) {
  const b = c.bot, diff = DIFFICULTY[S.difficulty];
  // --- Sight: nearest visible foe becomes the target.
  let best = null, bestD = Infinity;
  for (const foe of foesAlive(S, c)) {
    const d = Math.hypot(foe.pos.x - c.pos.x, foe.pos.z - c.pos.z);
    const alerted = c.lastDamageFrom === foe.id && S.time - c.lastDamageAt < 2;
    if (d < bestD && (alerted || seesTarget(S, c, foe, 0.57))) { best = foe; bestD = d; }
  }
  if (best) {
    if (b.targetId !== best.id) {
      b.targetId = best.id;
      b.reactUntil = S.time + diff.reaction * range(c.rng, 0.8, 1.25);
      b.aimErr = diff.aimErr * 2.2;
      b.burstLeft = 0;
    }
    b.lastKnown = { x: best.pos.x, z: best.pos.z, t: S.time };
    b.seenAt = S.time;
    S.spotted[best.id] = S.time + 3;
  } else if (b.targetId !== -1 && S.time - b.seenAt > 4) {
    b.targetId = -1;
  }
  // --- Hearing: investigate noises from the other team (or explosions).
  // Objective states and the carrier are never pulled off their job by noise.
  if (b.targetId === -1 && S.time > b.investigateUntil && !c.carrier
    && b.state !== 'pickup' && b.state !== 'plant' && b.state !== 'defuse' && b.state !== 'rush') {
    for (const n of S.noises) {
      if (n.until < S.time || n.team === c.team) continue;
      const d = Math.hypot(n.x - c.pos.x, n.z - c.pos.z);
      if (d < n.radius * diff.hearMult && d > 4) {
        b.investigateUntil = S.time + 6;
        b.state = 'investigate';
        setGoals(b, [[n.x, n.z]]);
        break;
      }
    }
  }
  // --- Objective logic.
  const bomb = S.bomb;
  if (S.mode === 'match') {
    if (c.team === S.attackers) {
      if (bomb.state === 'planted') {
        // Guard the planted site from a nearby hold.
        if (b.state !== 'engage') {
          const siteNode = bomb.site === 'A' ? 'n5' : 's5';
          if (b.goals[0] !== siteNode) setGoals(b, [siteNode]);
          b.state = 'advance';
        }
      } else if (bomb.state === 'dropped' && !c.carrier) {
        // Nearest attacker goes to fetch the charge.
        let nearest = null, nd = Infinity;
        for (const o of S.combatants) {
          if (o.team !== c.team || !o.alive) continue;
          const d = Math.hypot(o.pos.x - bomb.x, o.pos.z - bomb.z);
          if (d < nd) { nd = d; nearest = o; }
        }
        if (nearest === c && b.state !== 'pickup') { b.state = 'pickup'; setGoals(b, [[bomb.x, bomb.z]]); }
      } else if (c.carrier && bomb.state === 'carried') {
        const siteNode = S.targetSite === 'A' ? 'n5' : 's5';
        if (siteAt(c.pos.x, c.pos.z) && b.targetId === -1) {
          b.state = 'plant';
        } else if (b.goals.length === 0 || b.state === 'pickup' || b.state === 'hold' || b.state === 'plant') {
          b.state = S.roundTime < 25 ? 'rush' : 'advance';
          setGoals(b, [siteNode]);
        }
      } else if (b.state === 'hold' || b.state === 'pickup' || (b.state === 'investigate' && S.time > b.investigateUntil)) {
        // Regroup: an attacker with nothing to do pushes the target site.
        const site = SITES[S.targetSite];
        if (Math.hypot(c.pos.x - site.x, c.pos.z - site.z) > 8) {
          b.state = 'advance';
          setGoals(b, [S.targetSite === 'A' ? 'n5' : 's5']);
        }
      }
      // Frag throw at a visible mid-range target.
      if (b.targetId !== -1 && c.grenades.frag > 0 && bestD > 12 && bestD < 28 && chance(c.rng, 0.1)) b.throwFrag = true;
    } else {
      if (bomb.state === 'planted') {
        if (bomb.defuserId === -1 || !S.combatants[bomb.defuserId].alive) {
          let nearest = null, nd = Infinity;
          for (const o of S.combatants) {
            if (o.team !== c.team || !o.alive) continue;
            const d = Math.hypot(o.pos.x - bomb.x, o.pos.z - bomb.z);
            if (d < nd) { nd = d; nearest = o; }
          }
          if (nearest) bomb.defuserId = nearest.id;
        }
        if (bomb.defuserId === c.id) {
          if (b.state !== 'defuse') { b.state = 'defuse'; setGoals(b, [[bomb.x, bomb.z]]); }
        } else if (b.state !== 'rotate') {
          b.state = 'rotate';
          setGoals(b, [bomb.site === 'A' ? 'n6' : 's6']);
        }
      } else if (b.state === 'rotate' || b.state === 'investigate') {
        if (S.time > b.investigateUntil && b.hold) { b.state = 'advance'; setGoals(b, [b.hold.node]); }
      }
    }
  }
  // Reload when the mag is dry, or low while nothing is in sight.
  const def = currentDef(c);
  if (def && def.id !== 'blade') {
    const ammo = c.ammo[def.id];
    if (ammo && (ammo.mag === 0 || (b.targetId === -1 && ammo.mag < def.mag * 0.3))) startReload(S, c);
  }
}
function actBot(S, c, dt) {
  const b = c.bot, diff = DIFFICULTY[S.difficulty];
  const target = b.targetId !== -1 ? S.combatants[b.targetId] : null;
  const targetVisible = target && target.alive && S.time - b.seenAt < 0.25;
  let moveX = 0, moveZ = 0, wantSpeed = MOVE.RUN;
  // --- Facing and movement intent. Planting stands still; defusing walks to
  // the charge first and only stands once within defuse reach.
  // Stand-and-channel range sits strictly inside the defuse radius, so a bot
  // that stops here is always close enough for rounds.js to run the channel.
  const nearBomb = Math.hypot(S.bomb.x - c.pos.x, S.bomb.z - c.pos.z) < ROUND.DEFUSE_RADIUS - 0.2;
  if (b.state === 'plant' || (b.state === 'defuse' && nearBomb)) {
    // Stand still: rounds.js runs the channel while the bot holds position.
    if (b.state === 'plant') b.desiredYaw = c.yaw;
    else b.desiredYaw = yawTo(c.pos.x, c.pos.z, S.bomb.x, S.bomb.z);
  } else if (targetVisible) {
    const dx = target.pos.x - c.pos.x, dz = target.pos.z - c.pos.z;
    const dist = Math.hypot(dx, dz) || 1;
    b.aimErr = Math.max(diff.aimErr * 0.45, b.aimErr - dt * 0.14);
    const aimY = target.pos.y + (b.aimHead ? 1.5 : 1.25);
    b.desiredYaw = yawTo(c.pos.x, c.pos.z, target.pos.x, target.pos.z) + (c.rng() - 0.5) * b.aimErr * 2;
    b.desiredPitch = Math.atan2(aimY - (c.pos.y + eyeHeight(c)), dist) + (c.rng() - 0.5) * b.aimErr;
    // Strafe perpendicular to the target, flipping on a timer or when blocked.
    if (S.time > b.strafeUntil || c.speed2d < 0.5) {
      b.strafeDir *= -1;
      b.strafeUntil = S.time + range(c.rng, 0.6, 1.2);
    }
    moveX = (-dz / dist) * b.strafeDir; moveZ = (dx / dist) * b.strafeDir;
    wantSpeed = MOVE.WALK;
    if (dist < 3) { moveX = -dx / dist; moveZ = -dz / dist; }
  } else {
    ensurePath(S, c);
    const pt = currentPoint(S, c);
    if (pt) {
      const dx = pt.x - c.pos.x, dz = pt.z - c.pos.z, dist = Math.hypot(dx, dz);
      if (dist < 1.0) {
        if (b.path && b.pathI < b.path.length) {
          b.pathI++;
          if (b.pathI >= b.path.length) {
            b.path = null;
            // A node goal is reached; a point goal keeps steering directly.
            if (typeof b.goals[0] === 'string') b.goals.shift();
          }
        } else {
          b.goals.shift();
          b.path = null;
        }
      } else {
        moveX = dx / dist; moveZ = dz / dist;
        b.desiredYaw = yawTo(c.pos.x, c.pos.z, pt.x, pt.z);
        if (b.state === 'investigate') wantSpeed = MOVE.WALK;
      }
    } else if (b.hold && c.team !== S.attackers) {
      b.state = 'hold';
      b.desiredYaw = yawTo(c.pos.x, c.pos.z, b.hold.look[0], b.hold.look[1]);
    } else if (b.state !== 'hold') {
      b.state = 'hold';
    }
    if (b.state === 'hold' && b.hold) {
      b.desiredYaw = yawTo(c.pos.x, c.pos.z, b.hold.look[0], b.hold.look[1]);
      c.crouch = 1;
    } else {
      c.crouch = targetVisible && bestDist(S, c) > 18 ? 1 : 0;
    }
  }
  // --- Stuck recovery: sidestep, then skip the current path node.
  if (S.time > b.stuckCheckAt) {
    const moved = Math.hypot(c.pos.x - b.lastX, c.pos.z - b.lastZ);
    if ((moveX !== 0 || moveZ !== 0) && moved < 0.25) {
      b.unstuckUntil = S.time + 0.6;
      b.sidestep *= -1;
      if (b.path && b.pathI < b.path.length - 1) b.pathI++;
    }
    b.lastX = c.pos.x; b.lastZ = c.pos.z;
    b.stuckCheckAt = S.time + 0.5;
  }
  if (S.time < b.unstuckUntil && (moveX !== 0 || moveZ !== 0)) {
    const px = -moveZ * b.sidestep, pz = moveX * b.sidestep;
    moveX = moveX * 0.4 + px * 0.9; moveZ = moveZ * 0.4 + pz * 0.9;
    const l = Math.hypot(moveX, moveZ) || 1;
    moveX /= l; moveZ /= l;
  }
  // --- Turn toward the desired yaw, then move.
  const turn = 4.5 * dt;
  const dy = angDiff(b.desiredYaw, c.yaw);
  c.yaw += Math.max(-turn, Math.min(turn, dy));
  c.pitch += Math.max(-3 * dt, Math.min(3 * dt, b.desiredPitch - c.pitch));
  const wx = moveX * wantSpeed, wz = moveZ * wantSpeed;
  c.vel.x = approach(c.vel.x, wx, MOVE.ACCEL * dt);
  c.vel.z = approach(c.vel.z, wz, MOVE.ACCEL * dt);
  c.vel.y -= MOVE.GRAVITY * dt;
  c.pos.y += c.vel.y * dt;
  if (c.pos.y <= 0) { c.pos.y = 0; c.vel.y = 0; c.onGround = true; }
  const height = MOVE.HEIGHT_STAND + (MOVE.HEIGHT_CROUCH - MOVE.HEIGHT_STAND) * c.crouch;
  collideMove(c.pos, c.vel, dt, MOVE.RADIUS, height);
  c.speed2d = Math.hypot(c.vel.x, c.vel.z);
  if (c.onGround && c.speed2d > 1) {
    c.stepPhase += c.speed2d * dt;
    if (c.stepPhase > 2.2) {
      c.stepPhase = 0;
      S.events.push({ t: 'step', id: c.id, run: c.speed2d > MOVE.WALK + 0.5 });
      S.noises.push({ x: c.pos.x, z: c.pos.z, radius: c.speed2d > MOVE.WALK + 0.5 ? 12 : 4, until: S.time + 0.4, team: c.team });
    }
  }
  // --- Fire control: bursts with pauses, only once reacted and roughly on aim.
  const def = currentDef(c);
  const wantAds = targetVisible && def && def.zoom < 0.85 && bestDist(S, c) > 12;
  stepWeaponTimers(S, c, dt, wantAds);
  if (b.throwFrag && c.grenades.frag > 0) {
    if (c.slot !== 'frag') switchSlot(S, c, 'frag');
    else if (tryFire(S, c, true)) b.throwFrag = false;
    return;
  }
  if (targetVisible && S.time > b.reactUntil && c.reloading <= 0) {
    if (Math.abs(angDiff(b.desiredYaw, c.yaw)) < 0.14 + b.aimErr) {
      if (b.burstLeft <= 0 && S.time > b.pauseUntil) b.burstLeft = int(c.rng, diff.burst[0], diff.burst[1]);
      if (b.burstLeft > 0) {
        const before = def && c.ammo[def.id] ? c.ammo[def.id].mag : 0;
        if (tryFire(S, c, true)) {
          const after = def && c.ammo[def.id] ? c.ammo[def.id].mag : 0;
          if (after < before || !def || def.id === 'blade') b.burstLeft--;
          if (b.burstLeft <= 0) b.pauseUntil = S.time + diff.burstPause * range(c.rng, 0.8, 1.3);
        }
      }
    }
  }
}
function bestDist(S, c) {
  const t = c.bot.targetId !== -1 ? S.combatants[c.bot.targetId] : null;
  if (!t) return Infinity;
  return Math.hypot(t.pos.x - c.pos.x, t.pos.z - c.pos.z);
}
function approach(v, target, step) {
  if (v < target) return Math.min(target, v + step);
  return Math.max(target, v - step);
}
export function stepBots(S, dt) {
  if (S.phase === 'buy' || S.phase === 'roundEnd' || S.phase === 'matchEnd') {
    for (const c of S.combatants) {
      if (c.isPlayer || !c.alive) continue;
      if (!c.bot) initBot(c);
      c.vel.x = 0; c.vel.z = 0; c.speed2d = 0;
      stepWeaponTimers(S, c, dt, false);
    }
    return;
  }
  if (S.phase !== 'live') return;
  for (const c of S.combatants) {
    if (c.isPlayer || !c.alive) continue;
    if (!c.bot) initBot(c);
    if (S.time >= c.bot.thinkAt) {
      c.bot.thinkAt = S.time + 0.12;
      thinkBot(S, c);
    }
    actBot(S, c, dt);
  }
}
