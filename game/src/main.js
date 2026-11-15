// main.js — boot, the fixed-step simulation loop kept apart from rendering,
// event routing (sim -> audio/effects/HUD), camera work, and screen flow.
import * as THREE from 'three';
import { SIM_DT } from './config.js';
import { createMatch, playerOf, weaponOf } from './state.js';
import { buyItem, switchSlot, cycleSlot, startReload, currentDef } from './weapons.js';
import { stepProjectiles, eyeHeight } from './combat.js';
import { stepPlayer, applyLook } from './player.js';
import { stepBots, seesTarget } from './bots.js';
import { startMatch, stepRounds } from './rounds.js';
import { createInput, attachInput, requestLock, exitLock } from './input.js';
import { createAudio, ensureAudio, playShot, playReload, playDry, playStep, playHit, playKill, playSwing, playBounce, playExplode, playBeep, playPlanted, playDefused, playRoundWin, playBuy, playClick, playGo, playDamage } from './audio.js';
import { buildWorld, updateWorld } from './world.js';
import { buildViewmodel, updateViewmodel, vmFlash } from './viewmodel.js';
import { createBotMeshes, updateBotMeshes } from './botmesh.js';
import { createEffects, spawnFromEvents, updateEffects } from './effects.js';
import { createHUD, updateHUD, hudNoteHit, hudNoteDamage, openBuy, closeBuy, toggleBuy, showMatchEnd, hideMatchEnd, showMenu, hideMenu, showPause } from './hud.js';

const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.05, 220);
camera.rotation.order = 'YXZ';
scene.add(camera);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

let seed = (Math.random() * 0x7fffffff) | 0;
let S = createMatch('match', 'standard', seed);
let lastMode = 'match', lastDiff = 'standard';
const input = createInput();
const audio = createAudio();
const worldRefs = buildWorld(scene);
const vmRefs = buildViewmodel(camera);
const botMeshes = createBotMeshes(scene, S.combatants);
const fx = createEffects(scene);
let paused = false;
let prevPhase = S.phase;
let lastSpotCheck = 0;

const hud = createHUD({
  onClick: () => { ensureAudio(audio); playClick(audio); },
  onDeploy: (mode, diff) => deploy(mode, diff),
  onResume: () => { paused = false; showPause(hud, false); requestLock(canvas); },
  onQuitToMenu: () => quitToMenu(),
  onPlayAgain: () => deploy(lastMode, lastDiff),
  onBuy: (itemId) => buyItem(S, playerOf(S), itemId),
  onBuyOpened: () => exitLock(),
  onBuyClosed: () => { if ((S.phase === 'buy' || S.phase === 'live') && !paused) requestLock(canvas); },
});
attachInput(input, canvas, (locked) => {
  if (!locked && S.phase === 'live' && !hud.buyOpen && !paused) {
    paused = true;
    showPause(hud, true);
  }
});
showMenu(hud);

function deploy(mode, diff) {
  ensureAudio(audio);
  lastMode = mode; lastDiff = diff;
  seed = (Math.random() * 0x7fffffff) | 0;
  S = createMatch(mode, diff, seed);
  paused = false;
  prevPhase = 'menu';
  hideMenu(hud); hideMatchEnd(hud); showPause(hud, false);
  startMatch(S);
  openBuy(hud, S);
}
function quitToMenu() {
  S = createMatch(lastMode, lastDiff, (Math.random() * 0x7fffffff) | 0);
  paused = false;
  prevPhase = 'menu';
  closeBuy(hud);
  hideMatchEnd(hud); showPause(hud, false);
  showMenu(hud);
  exitLock();
}
function handleActions() {
  const p = playerOf(S);
  for (const action of input.queue) {
    if (action === 'reload') startReload(S, p);
    else if (action.startsWith('slot:')) switchSlot(S, p, action.slice(5));
    else if (action.startsWith('cycle:')) cycleSlot(S, p, parseInt(action.slice(6), 10));
    else if (action === 'buy') toggleBuy(hud, S);
    else if (action === 'pause') {
      if (S.phase === 'live' || S.phase === 'buy') {
        paused = !paused;
        showPause(hud, paused);
        if (paused) exitLock(); else requestLock(canvas);
      }
    }
  }
  input.queue.length = 0;
  hud.scoreOpen = input.scoreboard;
}
function stepSim(dt) {
  S.time += dt;
  S.tick++;
  const p = playerOf(S);
  stepPlayer(S, p, input, dt);
  stepBots(S, dt);
  stepProjectiles(S, dt);
  stepRounds(S, dt, input);
}
function distToPlayer(x, y, z) {
  const p = playerOf(S);
  return Math.hypot(x - p.pos.x, (y || 0) - (p.pos.y + 1.4), z - p.pos.z);
}
function drainEvents(time) {
  const p = playerOf(S);
  spawnFromEvents(fx, S.events, p.id);
  for (const ev of S.events) {
    switch (ev.t) {
      case 'shot': {
        if (ev.id === p.id) { vmFlash(vmRefs, time); playShot(audio, ev.wid, 0); }
        else playShot(audio, ev.wid, distToPlayer(ev.x, ev.y, ev.z));
        break;
      }
      case 'reload': if (ev.id === p.id) playReload(audio, 0); else { const c = S.combatants[ev.id]; playReload(audio, distToPlayer(c.pos.x, c.pos.y, c.pos.z)); } break;
      case 'dry': if (ev.id === p.id) playDry(audio); break;
      case 'step': if (ev.id !== p.id) { const c = S.combatants[ev.id]; playStep(audio, ev.run, distToPlayer(c.pos.x, c.pos.y, c.pos.z)); } else playStep(audio, ev.run, 1.2); break;
      case 'hit':
        if (ev.attackerId === p.id) { playHit(audio, ev.head); hudNoteHit(hud, ev.head, ev.killed, time); if (ev.killed) playKill(audio); }
        if (ev.victimId === p.id) { playDamage(audio); const a = S.combatants[ev.attackerId]; if (a) hudNoteDamage(hud, a.pos.x, a.pos.z, p, time); }
        break;
      case 'swing': if (ev.id === p.id) playSwing(audio); break;
      case 'bounce': playBounce(audio, distToPlayer(ev.x, ev.y, ev.z)); break;
      case 'explode': {
        const d = distToPlayer(ev.x, ev.y, ev.z);
        playExplode(audio, d);
        fx.shake = Math.max(fx.shake, Math.max(0, 0.65 - d * 0.016));
        break;
      }
      case 'beep': playBeep(audio, ev.urgent, distToPlayer(ev.x, 0.6, ev.z)); break;
      case 'planted': playPlanted(audio); break;
      case 'defused': playDefused(audio); break;
      case 'roundEnd': playRoundWin(audio, ev.winner === p.team); break;
      case 'golive': playGo(audio); break;
      case 'buy': if (ev.id === p.id) playBuy(audio); break;
      case 'matchEnd': showMatchEnd(hud, S); exitLock(); break;
      default: break;
    }
  }
  S.events.length = 0;
}
function updateCamera(time, dt) {
  const p = playerOf(S);
  if (S.phase === 'menu' || S.phase === 'matchEnd') {
    const a = time * 0.07;
    camera.position.set(Math.cos(a) * 27, 15, Math.sin(a) * 27);
    camera.lookAt(0, 0.5, 0);
    if (Math.abs(camera.fov - 60) > 0.1) { camera.fov = 60; camera.updateProjectionMatrix(); }
    vmRefs.group.visible = false;
    return;
  }
  vmRefs.group.visible = p.alive;
  const eye = p.alive ? eyeHeight(p) : 1.1;
  const shx = (Math.random() - 0.5) * fx.shake * 0.12;
  const shy = (Math.random() - 0.5) * fx.shake * 0.12;
  camera.position.set(p.pos.x + shx, p.pos.y + eye + shy, p.pos.z);
  camera.rotation.y = p.yaw + p.recoilY;
  camera.rotation.x = p.pitch + p.recoilP;
  camera.rotation.z = 0;
  const def = currentDef(p);
  const zoom = def ? def.zoom : 1;
  const targetFov = 78 * (1 + (zoom - 1) * p.ads);
  if (Math.abs(camera.fov - targetFov) > 0.05) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 14);
    camera.updateProjectionMatrix();
  }
}
let lastNow = performance.now();
let acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const time = now / 1000;
  let frameDt = Math.min(0.1, (now - lastNow) / 1000);
  lastNow = now;
  handleActions();
  const p = playerOf(S);
  if (paused) { input.dx = 0; input.dy = 0; }
  if (!paused) {
    applyLook(S, p, input, frameDt);
    acc += frameDt;
    let steps = 0;
    while (acc >= SIM_DT && steps < 5) {
      stepSim(SIM_DT);
      acc -= SIM_DT;
      steps++;
    }
    if (steps === 5) acc = 0;
    // Buy menu opens itself at the start of every buy phase.
    if (S.phase === 'buy' && prevPhase !== 'buy') openBuy(hud, S);
    prevPhase = S.phase;
    // The minimap marks foes the player can currently see.
    if (S.phase === 'live' && time - lastSpotCheck > 0.25) {
      lastSpotCheck = time;
      for (const c of S.combatants) {
        if (c.team !== p.team && c.alive && seesTarget(S, p, c, 0.5)) S.spotted[c.id] = S.time + 3;
      }
    }
  }
  drainEvents(time);
  updateCamera(time, frameDt);
  updateWorld(S, worldRefs, time);
  updateBotMeshes(S, botMeshes, frameDt);
  updateViewmodel(vmRefs, p, weaponOf(p), frameDt, time);
  updateEffects(fx, frameDt);
  updateHUD(hud, S, p, frameDt, time);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
