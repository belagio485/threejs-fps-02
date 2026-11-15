// player.js — the human's body: acceleration-based movement, crouch, jump,
// collision sliding, mouse look, and firing. Runs inside the fixed-step sim.
import { MOVE } from './config.js';
import { collideMove } from './map.js';
import { tryFire, stepWeaponTimers, currentDef } from './weapons.js';

const SENS = 0.0022, TURN_RATE = 1.9;
// Look runs once per rendered frame (not per sim step): mouse deltas are
// per-frame quantities, movement is per-step.
export function applyLook(S, c, input, dt) {
  if (S.phase === 'menu') return;
  c.yaw -= input.dx * SENS;
  c.pitch -= input.dy * SENS;
  if (input.keys.has('ArrowLeft')) c.yaw += TURN_RATE * dt;
  if (input.keys.has('ArrowRight')) c.yaw -= TURN_RATE * dt;
  if (input.keys.has('ArrowUp')) c.pitch += TURN_RATE * 0.7 * dt;
  if (input.keys.has('ArrowDown')) c.pitch -= TURN_RATE * 0.7 * dt;
  c.pitch = Math.max(-1.45, Math.min(1.45, c.pitch));
  input.dx = 0; input.dy = 0;
}
export function stepPlayer(S, c, input, dt) {
  const edge = input.triggerEdge;
  input.triggerEdge = false;
  if (!c.alive || S.phase !== 'live') {
    c.vel.x *= Math.max(0, 1 - 8 * dt); c.vel.z *= Math.max(0, 1 - 8 * dt);
    c.speed2d = 0;
    stepWeaponTimers(S, c, dt, false);
    return;
  }
  const k = input.keys;
  const fwd = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
  const strafe = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
  const wantCrouch = k.has('ControlLeft') || k.has('KeyC');
  c.crouch += ((wantCrouch ? 1 : 0) - c.crouch) * Math.min(1, dt * 9);
  if (Math.abs(c.crouch - (wantCrouch ? 1 : 0)) < 0.02) c.crouch = wantCrouch ? 1 : 0;
  const walking = k.has('ShiftLeft') || k.has('ShiftRight');
  let speed = c.crouch > 0.5 ? MOVE.CROUCH : (walking ? MOVE.WALK : MOVE.RUN);
  if (c.ads > 0.5) speed *= MOVE.ADS_MULT;
  const sy = Math.sin(c.yaw), cy = Math.cos(c.yaw);
  // Forward (-sin, -cos) and right (cos, -sin) on the ground plane.
  let wx = (-sy) * fwd + cy * strafe, wz = (-cy) * fwd + (-sy) * strafe;
  const wl = Math.hypot(wx, wz);
  if (wl > 0) { wx = (wx / wl) * speed; wz = (wz / wl) * speed; }
  const accel = c.onGround ? MOVE.ACCEL : MOVE.ACCEL * 0.35;
  c.vel.x = approach(c.vel.x, wx, accel * dt);
  c.vel.z = approach(c.vel.z, wz, accel * dt);
  if (k.has('Space') && c.onGround) { c.vel.y = MOVE.JUMP; c.onGround = false; }
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
      const quiet = c.crouch > 0.5 || walking;
      S.events.push({ t: 'step', id: c.id, run: !quiet });
      S.noises.push({ x: c.pos.x, z: c.pos.z, radius: quiet ? 4 : 12, until: S.time + 0.4, team: c.team });
    }
  }
  const def = currentDef(c);
  const wantAds = input.adsHeld && def && def.id !== 'blade';
  stepWeaponTimers(S, c, dt, wantAds);
  if (input.firing) tryFire(S, c, edge);
}
function approach(v, target, step) {
  if (v < target) return Math.min(target, v + step);
  return Math.max(target, v - step);
}
