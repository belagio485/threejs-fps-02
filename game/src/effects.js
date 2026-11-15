// effects.js — pooled particles, tracers, decals, muzzle flashes and smoke.
// Fixed pools, no allocation after setup; the sim feeds this module events.
import * as THREE from 'three';

function glowTexture() {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 64;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}
export function createEffects(scene) {
  const tex = glowTexture();
  const particles = [];
  for (let i = 0; i < 240; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    s.visible = false;
    scene.add(s);
    particles.push({ s, life: 0, max: 1, vx: 0, vy: 0, vz: 0, grav: 0, s0: 0.1, s1: 0.1, o0: 1 });
  }
  const tracers = [];
  for (let i = 0; i < 24; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    line.visible = false; line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  const decals = [];
  const decalGeo = new THREE.PlaneGeometry(0.22, 0.22);
  for (let i = 0; i < 40; i++) {
    const m = new THREE.Mesh(decalGeo, new THREE.MeshBasicMaterial({ color: 0x0d0d0d, transparent: true, opacity: 0.55, depthWrite: false }));
    m.visible = false;
    scene.add(m);
    decals.push(m);
  }
  const flashes = [];
  for (let i = 0; i < 12; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xffc46b, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.visible = false;
    scene.add(s);
    flashes.push({ s, life: 0 });
  }
  const boomLight = new THREE.PointLight(0xffa040, 0, 26, 2);
  scene.add(boomLight);
  return { particles, tracers, decals, flashes, boomLight, pCursor: 0, tCursor: 0, dCursor: 0, fCursor: 0, shake: 0 };
}
function spawnP(fx, x, y, z, vx, vy, vz, life, s0, s1, color, opacity, grav) {
  const p = fx.particles[fx.pCursor];
  fx.pCursor = (fx.pCursor + 1) % fx.particles.length;
  p.s.visible = true;
  p.s.position.set(x, y, z);
  p.s.material.color.setHex(color);
  p.s.material.opacity = opacity;
  p.s.material.rotation = Math.random() * Math.PI;
  p.life = life; p.max = life;
  p.vx = vx; p.vy = vy; p.vz = vz;
  p.s0 = s0; p.s1 = s1; p.o0 = opacity; p.grav = grav;
  p.s.scale.set(s0, s0, 1);
}
export function spawnFromEvents(fx, events, playerId) {
  for (const ev of events) {
    if (ev.t === 'tracer') {
      const tr = fx.tracers[fx.tCursor];
      fx.tCursor = (fx.tCursor + 1) % fx.tracers.length;
      const pos = tr.line.geometry.attributes.position;
      pos.setXYZ(0, ev.ox, ev.oy, ev.oz);
      pos.setXYZ(1, ev.x, ev.y, ev.z);
      pos.needsUpdate = true;
      tr.line.visible = true;
      tr.life = 0.07;
    } else if (ev.t === 'impact') {
      for (let i = 0; i < 4; i++) {
        spawnP(fx, ev.x, ev.y, ev.z,
          ev.nx * 2 + (Math.random() - 0.5) * 3, 1 + Math.random() * 2, ev.nz * 2 + (Math.random() - 0.5) * 3,
          0.25 + Math.random() * 0.2, 0.06, 0.02, 0xffc46b, 0.9, 6);
      }
      spawnP(fx, ev.x, ev.y, ev.z, 0, 0.4, 0, 0.4, 0.12, 0.3, 0x8a8a8a, 0.35, 0);
      const d = fx.decals[fx.dCursor];
      fx.dCursor = (fx.dCursor + 1) % fx.decals.length;
      d.visible = true;
      d.position.set(ev.x + ev.nx * 0.012, ev.y + ev.ny * 0.012, ev.z + ev.nz * 0.012);
      d.lookAt(ev.x + ev.nx, ev.y + ev.ny, ev.z + ev.nz);
      d.rotation.z = Math.random() * Math.PI;
    } else if (ev.t === 'blood') {
      for (let i = 0; i < 4; i++) {
        spawnP(fx, ev.x, ev.y, ev.z, (Math.random() - 0.5) * 2.4, 0.5 + Math.random(), (Math.random() - 0.5) * 2.4,
          0.35, 0.09, 0.04, 0x7a1414, 0.85, 7);
      }
    } else if (ev.t === 'shot' && ev.id !== playerId) {
      const f = fx.flashes[fx.fCursor];
      fx.fCursor = (fx.fCursor + 1) % fx.flashes.length;
      f.s.visible = true;
      f.s.position.set(ev.x, ev.y, ev.z);
      f.s.scale.set(0.42, 0.42, 1);
      f.life = 0.05;
    } else if (ev.t === 'explode') {
      fx.boomLight.position.set(ev.x, ev.y + 0.5, ev.z);
      fx.boomLight.intensity = 160;
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2, up = Math.random() * 5 + 1, sp = 2 + Math.random() * 6;
        spawnP(fx, ev.x, ev.y, ev.z, Math.cos(a) * sp, up, Math.sin(a) * sp,
          0.5 + Math.random() * 0.5, 0.5, 0.15, i % 3 === 0 ? 0xffd9a0 : 0xff7a1a, 0.95, 5);
      }
      for (let i = 0; i < 8; i++) {
        spawnP(fx, ev.x + (Math.random() - 0.5) * 2, ev.y + Math.random(), ev.z + (Math.random() - 0.5) * 2,
          (Math.random() - 0.5), 0.8 + Math.random() * 0.8, (Math.random() - 0.5),
          1.6, 0.8, 2.4, 0x555555, 0.4, -0.4);
      }
    } else if (ev.t === 'smoke') {
      for (let i = 0; i < 7; i++) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * 1.6;
        spawnP(fx, ev.x + Math.cos(a) * r, 0.5 + Math.random() * 0.8, ev.z + Math.sin(a) * r,
          (Math.random() - 0.5) * 0.3, 0.12 + Math.random() * 0.2, (Math.random() - 0.5) * 0.3,
          12, 0.9, 3.4, 0xbfc4c9, 0.34, -0.02);
      }
    }
  }
}
export function updateEffects(fx, dt) {
  for (const p of fx.particles) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) { p.s.visible = false; continue; }
    p.vy -= p.grav * dt;
    p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
    if (p.s.position.y < 0.05) { p.s.position.y = 0.05; p.vy = 0; }
    const k = 1 - p.life / p.max;
    const s = p.s0 + (p.s1 - p.s0) * k;
    p.s.scale.set(s, s, 1);
    p.s.material.opacity = p.o0 * Math.min(1, (p.life / p.max) * 2.5);
  }
  for (const tr of fx.tracers) {
    if (tr.life <= 0) continue;
    tr.life -= dt;
    tr.line.material.opacity = Math.max(0, tr.life / 0.07) * 0.85;
    if (tr.life <= 0) tr.line.visible = false;
  }
  for (const f of fx.flashes) {
    if (f.life <= 0) continue;
    f.life -= dt;
    if (f.life <= 0) f.s.visible = false;
  }
  fx.boomLight.intensity *= Math.exp(-7 * dt);
  if (fx.boomLight.intensity < 0.5) fx.boomLight.intensity = 0;
  fx.shake *= Math.exp(-5 * dt);
  if (fx.shake < 0.001) fx.shake = 0;
}
