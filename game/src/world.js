// world.js — builds the Foundry Yard scene from map data: styled geometry,
// procedural canvas textures, dusk lighting, site markers, and props. All art
// is generated at runtime; the game ships no image or model files.
import * as THREE from 'three';
import { BOXES, SITES, LAMPS } from './map.js';
import { PALETTE } from './config.js';

// Deterministic speckle so every load paints the same yard.
let _s = 1234567;
function rnd() { _s = (_s * 1103515245 + 12345) & 0x7fffffff; return _s / 0x7fffffff; }
function canvasTex(w, h, draw, rx, ry) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx || 1, ry || 1);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function speckle(g, w, h, n, colors, rMax) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[Math.floor(rnd() * colors.length)];
    g.globalAlpha = 0.12 + rnd() * 0.25;
    const r = 1 + rnd() * rMax;
    g.fillRect(rnd() * w, rnd() * h, r, r);
  }
  g.globalAlpha = 1;
}
function concreteTex(base) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 900, ['#000000', '#ffffff', '#3a3a3a'], 3);
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2;
    g.strokeRect(1, 1, w - 2, h - 2);
    g.beginPath(); g.moveTo(0, h * 0.5); g.lineTo(w, h * 0.5); g.stroke();
  }, 2, 1);
}
function metalTex() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#5d646e'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 64) {
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x, 0, 3, h);
      g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x + 3, 0, 2, h);
    }
    speckle(g, w, h, 500, ['#7a4a22', '#2c2c2c'], 4);
    for (let i = 0; i < 24; i++) {
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.beginPath(); g.arc(8 + (i % 4) * 64, 12 + Math.floor(i / 4) * 42, 2.5, 0, 7); g.fill();
    }
  }, 3, 1);
}
function hazardTex() {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#c9a227'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1d1d1d';
    for (let x = -h; x < w + h; x += 32) {
      g.beginPath(); g.moveTo(x, h); g.lineTo(x + 16, h); g.lineTo(x + 16 + h, 0); g.lineTo(x + h, 0); g.fill();
    }
  }, 4, 1);
}
function woodTex() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#7d6a4a'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 64) {
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, y, w, 3);
      g.strokeStyle = 'rgba(60,45,25,0.5)'; g.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        g.beginPath(); const yy = y + 10 + rnd() * 44;
        g.moveTo(0, yy); g.bezierCurveTo(w * 0.3, yy + 4, w * 0.6, yy - 4, w, yy); g.stroke();
      }
    }
    speckle(g, w, h, 300, ['#4a3d28'], 3);
  }, 1, 1);
}
function floorTex() {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#4a4d52'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 2600, ['#000000', '#ffffff', '#33302a'], 4);
    g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 3;
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, h); g.stroke();
      g.beginPath(); g.moveTo(0, i * 128); g.lineTo(w, i * 128); g.stroke();
    }
    g.fillStyle = 'rgba(245,158,11,0.16)';
    g.fillRect(w * 0.46, 0, w * 0.08, h);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    for (let i = 0; i < 8; i++) { g.beginPath(); g.arc(rnd() * w, rnd() * h, 20 + rnd() * 50, 0, 7); g.fill(); }
  }, 6, 5);
}
function barrelTex(base) {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 20, w, 6); g.fillRect(0, 102, w, 6);
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, 26, w, 3); g.fillRect(0, 108, w, 3);
    speckle(g, w, h, 150, ['#000000'], 3);
  }, 2, 1);
}
function letterTex(letter) {
  return canvasTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#f59e0b';
    g.font = 'bold 190px Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.strokeStyle = 'rgba(0,0,0,0.8)'; g.lineWidth = 14;
    g.strokeText(letter, w / 2, h / 2 + 8);
    g.fillText(letter, w / 2, h / 2 + 8);
  }, 1, 1);
}
function signTex(text, sub) {
  return canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = '#20262f'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#f59e0b'; g.lineWidth = 6; g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = '#e8e6df'; g.font = 'bold 52px Arial, sans-serif';
    g.textAlign = 'center'; g.fillText(text, w / 2, sub ? 58 : 80);
    if (sub) { g.fillStyle = '#f59e0b'; g.font = 'bold 30px Arial, sans-serif'; g.fillText(sub, w / 2, 102); }
  }, 1, 1);
}
function glowTex() {
  return canvasTex(128, 128, (g, w, h) => {
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, 'rgba(255,200,120,1)');
    grad.addColorStop(0.4, 'rgba(255,150,60,0.5)');
    grad.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
  }, 1, 1);
}

export function buildWorld(scene) {
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 55, 130);
  const mats = {
    wall: new THREE.MeshStandardMaterial({ map: concreteTex('#6b6f76'), roughness: 0.95 }),
    building: new THREE.MeshStandardMaterial({ map: metalTex(), roughness: 0.8, metalness: 0.35 }),
    furnace: new THREE.MeshStandardMaterial({ color: 0x2e3138, roughness: 0.7, metalness: 0.5 }),
    crate: new THREE.MeshStandardMaterial({ map: woodTex(), roughness: 0.9 }),
    tallcrate: new THREE.MeshStandardMaterial({ map: woodTex(), color: 0xb9a888, roughness: 0.9 }),
    lowwall: new THREE.MeshStandardMaterial({ map: concreteTex('#7a7d82'), roughness: 0.95 }),
    deck: new THREE.MeshStandardMaterial({ map: hazardTex(), roughness: 0.8, metalness: 0.3 }),
    pillar: new THREE.MeshStandardMaterial({ color: PALETTE.steel, roughness: 0.7, metalness: 0.5 }),
    tank: new THREE.MeshStandardMaterial({ color: PALETTE.rust, roughness: 0.75, metalness: 0.4 }),
    barrelA: new THREE.MeshStandardMaterial({ map: barrelTex('#a33b2e'), roughness: 0.7, metalness: 0.3 }),
    barrelB: new THREE.MeshStandardMaterial({ map: barrelTex('#2e6b8a'), roughness: 0.7, metalness: 0.3 }),
  };
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const barrelGeo = new THREE.CylinderGeometry(0.45, 0.45, 1.05, 14);
  let barrelFlip = false;
  for (const b of BOXES) {
    const w = b[3] - b[0], h = b[4] - b[1], d = b[5] - b[2];
    const kind = b[6];
    let mesh;
    if (kind === 'barrel') {
      mesh = new THREE.Mesh(barrelGeo, barrelFlip ? mats.barrelB : mats.barrelA);
      barrelFlip = !barrelFlip;
    } else {
      mesh = new THREE.Mesh(unitBox, mats[kind] || mats.wall);
      mesh.scale.set(w, h, d);
    }
    mesh.position.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2);
    mesh.castShadow = h > 0.5 && kind !== 'deck';
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  // Ground.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(150, 130), new THREE.MeshStandardMaterial({ map: floorTex(), roughness: 0.96 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.01; ground.receiveShadow = true;
  scene.add(ground);
  // Furnace mouth glow.
  const mouth = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.4), new THREE.MeshBasicMaterial({ color: 0xff7a1a }));
  mouth.position.set(0, 0.9, 5.02); scene.add(mouth);
  const furnaceLight = new THREE.PointLight(0xff8c2e, 40, 20, 2);
  furnaceLight.position.set(0, 1.6, 7); scene.add(furnaceLight);
  // Site rings, letters, beacons.
  const refs = { beacons: {}, rings: {}, furnaceLight, bomb: null, bombLight: null };
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    const ring = new THREE.Mesh(new THREE.RingGeometry(s.r - 0.35, s.r, 48), new THREE.MeshBasicMaterial({ color: PALETTE.accent, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(s.x, 0.02, s.z);
    scene.add(ring); refs.rings[key] = ring;
    const letter = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), new THREE.MeshBasicMaterial({ map: letterTex(key), transparent: true, side: THREE.DoubleSide }));
    letter.position.set(s.x, 3.6, s.z); scene.add(letter);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 7, 12, 1, true), new THREE.MeshBasicMaterial({ color: PALETTE.accent, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.set(s.x, 3.5, s.z); scene.add(beam);
    refs.beacons[key] = beam;
    const siteLight = new THREE.PointLight(0xffb45e, 22, 16, 2);
    siteLight.position.set(s.x, 3.2, s.z); scene.add(siteLight);
  }
  // Lamp posts.
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 3.6, 8);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 0.8 });
  const headGeo = new THREE.SphereGeometry(0.22, 12, 10);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  for (const [x, z] of LAMPS) {
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(x, 1.8, z); pole.castShadow = true; scene.add(pole);
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(x, 3.7, z); scene.add(head);
  }
  // Signs and skyline silhouettes.
  const signDefs = [
    { text: 'FOUNDRY YARD', sub: 'SECTOR 7', x: -19.9, y: 2.6, z: 0, ry: Math.PI / 2 },
    { text: 'SITE A', sub: 'NORTH TANK', x: 14.35, y: 2.5, z: -7, ry: Math.PI / 2 },
    { text: 'SITE B', sub: 'SOUTH TANK', x: 14.35, y: 2.5, z: 7, ry: Math.PI / 2 },
  ];
  for (const sd of signDefs) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.1), new THREE.MeshBasicMaterial({ map: signTex(sd.text, sd.sub) }));
    sign.position.set(sd.x, sd.y, sd.z); sign.rotation.y = sd.ry; scene.add(sign);
  }
  const skyMat = new THREE.MeshBasicMaterial({ color: 0x141b28 });
  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * Math.PI * 2 + 0.2;
    const dist = 46 + rnd() * 14, hgt = 8 + rnd() * 14, wdt = 6 + rnd() * 8;
    const sil = new THREE.Mesh(unitBox, skyMat);
    sil.scale.set(wdt, hgt, wdt);
    sil.position.set(Math.cos(ang) * dist, hgt / 2 - 0.5, Math.sin(ang) * dist);
    scene.add(sil);
  }
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  sun.scale.set(34, 34, 1); sun.position.set(58, 13, -34); scene.add(sun);
  // The spark charge itself (shown when dropped or planted).
  const bombGroup = new THREE.Group();
  const bombBody = new THREE.Mesh(unitBox, new THREE.MeshStandardMaterial({ color: 0x1e2126, roughness: 0.6, metalness: 0.4 }));
  bombBody.scale.set(0.55, 0.32, 0.4); bombBody.position.y = 0.16; bombBody.castShadow = true;
  const bombLamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff2a1a }));
  bombLamp.position.set(0.18, 0.38, 0);
  bombGroup.add(bombBody); bombGroup.add(bombLamp);
  bombGroup.visible = false;
  scene.add(bombGroup);
  refs.bomb = bombGroup; refs.bombLamp = bombLamp;
  const bombLight = new THREE.PointLight(0xff2a1a, 0, 7, 2);
  scene.add(bombLight); refs.bombLight = bombLight;
  // Lights.
  scene.add(new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 0.9));
  const sunLight = new THREE.DirectionalLight(PALETTE.sun, 2.6);
  sunLight.position.set(38, 30, -22);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -38; sunLight.shadow.camera.right = 38;
  sunLight.shadow.camera.top = 32; sunLight.shadow.camera.bottom = -32;
  sunLight.shadow.camera.far = 110;
  sunLight.shadow.bias = -0.0004;
  scene.add(sunLight);
  return refs;
}
export function updateWorld(S, refs, time) {
  const pulse = 0.11 + 0.05 * Math.sin(time * 1.7);
  refs.beacons.A.material.opacity = pulse;
  refs.beacons.B.material.opacity = pulse;
  refs.furnaceLight.intensity = 36 + Math.sin(time * 7.3) * 4 + Math.sin(time * 13.1) * 3;
  const bomb = S.bomb;
  const show = bomb.state === 'dropped' || bomb.state === 'planted';
  refs.bomb.visible = show;
  if (show) {
    refs.bomb.position.set(bomb.x, 0, bomb.z);
    refs.bombLight.position.set(bomb.x, 0.8, bomb.z);
    if (bomb.state === 'planted') {
      const rate = bomb.fuse < 8 ? 9 : 3.5;
      const on = Math.sin(time * rate * Math.PI) > 0;
      refs.bombLamp.visible = on;
      refs.bombLight.intensity = on ? 14 : 0;
    } else {
      refs.bombLamp.visible = Math.sin(time * 2.4) > -0.4;
      refs.bombLight.intensity = 3;
    }
  } else {
    refs.bombLight.intensity = 0;
  }
}
