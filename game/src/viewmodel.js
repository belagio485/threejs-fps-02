// viewmodel.js — the first-person weapon models: procedural low-poly guns,
// hands-free, with bob, recoil kick, reload dip, ADS centring and muzzle flash.
import * as THREE from 'three';
import { WEAPONS } from './config.js';

const GUNMETAL = 0x565d68, DARK = 0x3a3f46, GRIP = 0x6b4e2e, ACCENT = 0xa8adb4;
function box(w, h, d, color, x, y, z, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.3 }));
  m.position.set(x, y, z);
  return m;
}
function cyl(r, len, color, x, y, z, axis) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.35 }));
  if (axis === 'z') m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  return m;
}
function buildGun(id) {
  const g = new THREE.Group();
  if (id === 'p9') {
    g.add(box(0.05, 0.05, 0.24, GUNMETAL, 0, 0, -0.1));
    g.add(box(0.045, 0.11, 0.06, GRIP, 0, -0.07, 0.02));
    g.add(box(0.02, 0.02, 0.05, DARK, 0, 0.035, -0.18));
  } else if (id === 'vex9') {
    g.add(box(0.06, 0.08, 0.42, GUNMETAL, 0, 0, -0.12));
    g.add(cyl(0.02, 0.16, DARK, 0, 0.01, -0.38, 'z'));
    g.add(box(0.04, 0.13, 0.05, DARK, 0, -0.09, -0.1));
    g.add(box(0.045, 0.09, 0.06, GRIP, 0, -0.07, 0.06));
    g.add(box(0.05, 0.04, 0.14, DARK, 0, 0, 0.2));
  } else if (id === 'kr7') {
    g.add(box(0.06, 0.09, 0.55, GUNMETAL, 0, 0, -0.14));
    g.add(cyl(0.018, 0.24, DARK, 0, 0.02, -0.5, 'z'));
    g.add(box(0.04, 0.14, 0.06, DARK, 0, -0.1, -0.12));
    g.add(box(0.045, 0.09, 0.06, GRIP, 0, -0.07, 0.05));
    g.add(box(0.05, 0.05, 0.2, DARK, 0, -0.01, 0.24));
    g.add(box(0.02, 0.03, 0.06, ACCENT, 0, 0.06, -0.05));
  } else if (id === 'breacher') {
    g.add(box(0.07, 0.09, 0.5, 0x3a2c20, 0, 0, -0.1));
    g.add(cyl(0.032, 0.42, DARK, 0, 0.04, -0.32, 'z'));
    g.add(cyl(0.026, 0.3, GUNMETAL, 0, -0.01, -0.3, 'z'));
    g.add(box(0.05, 0.08, 0.18, 0x3a2c20, 0, -0.02, 0.22));
  } else if (id === 'longshot') {
    g.add(box(0.055, 0.08, 0.6, 0x243028, 0, 0, -0.12));
    g.add(cyl(0.016, 0.42, DARK, 0, 0.02, -0.6, 'z'));
    g.add(cyl(0.03, 0.14, DARK, 0, 0.07, -0.1, 'z'));
    g.add(box(0.04, 0.1, 0.05, DARK, 0, -0.08, -0.08));
    g.add(box(0.05, 0.07, 0.2, 0x243028, 0, -0.01, 0.26));
  } else if (id === 'blade') {
    const blade = box(0.012, 0.05, 0.3, ACCENT, 0, 0.01, -0.18);
    blade.rotation.x = -0.25;
    g.add(blade);
    g.add(box(0.03, 0.04, 0.12, GRIP, 0, -0.02, 0.02));
  } else if (id === 'frag') {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), new THREE.MeshStandardMaterial({ color: 0x2e4426, roughness: 0.7 }));
    s.position.set(0, 0, -0.08); g.add(s);
    g.add(cyl(0.02, 0.03, DARK, 0, 0.06, -0.08, 'y'));
  } else if (id === 'smoke') {
    g.add(cyl(0.045, 0.14, 0x9aa0a6, 0, 0, -0.08, 'y'));
    g.add(cyl(0.046, 0.03, 0x2e6b8a, 0, 0.05, -0.08, 'y'));
  }
  return g;
}
const TIP_Z = { p9: -0.26, vex9: -0.48, kr7: -0.64, breacher: -0.56, longshot: -0.84, blade: -0.3, frag: -0.1, smoke: -0.1 };
export function buildViewmodel(camera) {
  const group = new THREE.Group();
  group.position.set(0.24, -0.22, -0.5);
  const weapons = {};
  for (const id of ['p9', 'vex9', 'kr7', 'breacher', 'longshot', 'blade', 'frag', 'smoke']) {
    const w = buildGun(id);
    w.visible = false;
    group.add(w);
    weapons[id] = w;
  }
  const flashCv = document.createElement('canvas');
  flashCv.width = 64; flashCv.height = 64;
  const fg = flashCv.getContext('2d');
  const grad = fg.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,240,180,1)');
  grad.addColorStop(0.5, 'rgba(255,160,60,0.7)');
  grad.addColorStop(1, 'rgba(255,120,30,0)');
  fg.fillStyle = grad; fg.fillRect(0, 0, 64, 64);
  const flashTex = new THREE.CanvasTexture(flashCv);
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true }));
  flash.scale.set(0.3, 0.3, 1);
  flash.visible = false;
  group.add(flash);
  // Warm fill so the weapon reads in the dusk light; short range, so the
  // world beyond arm's length is barely touched.
  const fill = new THREE.PointLight(0xffd9a8, 0.9, 2.5, 2);
  fill.position.set(0.1, 0.25, 0.15);
  group.add(fill);
  camera.add(group);
  return { group, weapons, flash, flashUntil: 0, bobPhase: 0, adsPos: 0 };
}
export function vmFlash(refs, time) { refs.flashUntil = time + 0.045; }
export function updateViewmodel(refs, c, wid, dt, time) {
  for (const id in refs.weapons) refs.weapons[id].visible = id === wid;
  const w = refs.weapons[wid];
  if (!w) return;
  refs.bobPhase += dt * (2 + c.speed2d * 1.6);
  const bobAmp = Math.min(0.014, c.speed2d * 0.0022) * (c.onGround ? 1 : 0);
  const bobY = Math.sin(refs.bobPhase * 2) * bobAmp;
  const bobX = Math.cos(refs.bobPhase) * bobAmp * 0.6;
  // ADS pulls the weapon to the centre of the screen.
  refs.adsPos += ((c.ads > 0.5 ? 1 : 0) - refs.adsPos) * Math.min(1, dt * 12);
  const a = refs.adsPos;
  const hip = { x: 0.24, y: -0.22, z: -0.5 };
  const ads = { x: 0, y: -0.148, z: -0.35 };
  let kickZ = c.recoilP * 0.55, kickRX = c.recoilP * 0.9;
  if (c.reloading > 0) {
    const total = (WEAPONS[c.reloadWid] || {}).reload || 1.5;
    const prog = 1 - c.reloading / total;
    const dip = Math.sin(Math.min(1, Math.max(0, prog)) * Math.PI);
    kickRX += dip * 0.55;
    refs.group.position.y = hip.y + (ads.y - hip.y) * a + bobY - dip * 0.05;
  } else {
    refs.group.position.y = hip.y + (ads.y - hip.y) * a + bobY;
  }
  refs.group.position.x = hip.x + (ads.x - hip.x) * a + bobX;
  refs.group.position.z = hip.z + (ads.z - hip.z) * a + kickZ;
  refs.group.rotation.x = kickRX;
  refs.group.rotation.z = c.recoilY * 0.6;
  refs.flash.visible = time < refs.flashUntil;
  if (refs.flash.visible) {
    refs.flash.position.set(0, 0.02, TIP_Z[wid] || -0.3);
    refs.flash.material.rotation = Math.random() * Math.PI;
    const s = 0.24 + Math.random() * 0.14;
    refs.flash.scale.set(s, s, 1);
  }
}
