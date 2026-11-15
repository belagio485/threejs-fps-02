// botmesh.js — procedural soldier bodies for bots: team-coloured vest and
// helmet, walk-cycle limbs, crouch squash, and a fall-over death pose. Meshes
// mirror sim state; they own no gameplay state.
import * as THREE from 'three';
import { TEAM_INFO } from './config.js';

const shared = {};
function mat(color, rough) {
  const key = color + ':' + (rough || 0.8);
  if (!shared[key]) shared[key] = new THREE.MeshStandardMaterial({ color, roughness: rough || 0.8 });
  return shared[key];
}
function limb(w, h, d, material, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
export function createBotMeshes(scene, combatants) {
  const meshes = {};
  for (const c of combatants) {
    if (c.isPlayer) continue;
    const info = TEAM_INFO[c.team];
    const g = new THREE.Group();
    const uniform = mat(0x3a3f46), vest = mat(info.color, 0.7), dark = mat(0x22252a), skin = mat(0xc9a586, 0.9);
    const legL = limb(0.16, 0.78, 0.18, uniform, -0.11, 0.39, 0);
    const legR = limb(0.16, 0.78, 0.18, uniform, 0.11, 0.39, 0);
    const torso = limb(0.44, 0.58, 0.26, uniform, 0, 1.07, 0);
    const vestM = limb(0.47, 0.42, 0.3, vest, 0, 1.1, 0);
    const armL = limb(0.12, 0.55, 0.14, uniform, -0.3, 1.12, 0);
    const armR = limb(0.12, 0.55, 0.14, uniform, 0.3, 1.12, 0);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 12), skin);
    head.position.set(0, 1.52, 0); head.castShadow = true;
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(info.dark, 0.6));
    helmet.position.set(0, 1.54, 0);
    const visor = limb(0.24, 0.06, 0.05, dark, 0, 1.54, -0.15);
    const gun = limb(0.07, 0.09, 0.55, dark, 0.22, 1.18, -0.3);
    g.add(legL, legR, torso, vestM, armL, armR, head, helmet, visor, gun);
    // Pivot the limbs at the hip/shoulder by offsetting their geometry.
    legL.geometry.translate(0, -0.39, 0); legL.position.y = 0.78;
    legR.geometry.translate(0, -0.39, 0); legR.position.y = 0.78;
    armL.geometry.translate(0, -0.27, 0); armL.position.y = 1.38;
    armR.geometry.translate(0, -0.27, 0); armR.position.y = 1.38;
    scene.add(g);
    meshes[c.id] = { group: g, legL, legR, armL, armR, torso, head, vestM, helmet, deathT: 0 };
  }
  return meshes;
}
export function updateBotMeshes(S, meshes, dt) {
  for (const c of S.combatants) {
    if (c.isPlayer) continue;
    const m = meshes[c.id];
    if (!m) continue;
    // Recolour every frame: teams swap sides at half-time.
    m.vestM.material = mat(TEAM_INFO[c.team].color, 0.7);
    m.helmet.material = mat(TEAM_INFO[c.team].dark, 0.6);
    m.group.position.set(c.pos.x, c.pos.y, c.pos.z);
    m.group.rotation.y = c.yaw;
    if (!c.alive) {
      m.deathT = Math.min(1, m.deathT + dt * 3.2);
      const fall = m.deathT * m.deathT * (Math.PI / 2) * 0.94;
      m.group.rotation.x = -fall;
      m.group.position.y = c.pos.y + Math.sin(fall) * 0.1;
      continue;
    }
    if (m.deathT > 0) { m.deathT = 0; m.group.rotation.x = 0; }
    const speedF = Math.min(1, c.speed2d / 3);
    const phase = (c.stepPhase / 2.2) * Math.PI * 2;
    const swing = Math.sin(phase) * 0.55 * speedF;
    m.legL.rotation.x = swing;
    m.legR.rotation.x = -swing;
    m.armL.rotation.x = -swing * 0.5;
    // Right arm holds the gun forward; left arm steadies it when aiming.
    m.armR.rotation.x = -1.15 + swing * 0.15;
    m.group.scale.y = 1 - 0.2 * c.crouch;
    m.group.rotation.x = 0;
  }
}
