// input.js — keyboard, mouse and pointer lock. Holds raw input state only;
// the sim reads it, main.js drains the discrete-action queue once per frame.
export function createInput() {
  return {
    keys: new Set(), dx: 0, dy: 0,
    firing: false, adsHeld: false, interact: false, scoreboard: false,
    triggerEdge: false, locked: false, queue: [], lastWheel: 0,
  };
}
const SLOT_KEYS = { Digit1: 'primary', Digit2: 'secondary', Digit3: 'melee', Digit4: 'frag', Digit5: 'smoke' };
// Set when the browser refuses pointer lock (denied, or an embedding page
// without the permission): the game then lets clicks fire without a lock,
// so it stays playable with drag-look instead of trapping the player.
let lockDenied = false;
export function attachInput(input, canvas, onLockChange) {
  const GAME_KEYS = new Set(['Space', 'Tab', 'ControlLeft', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyE', 'KeyR', 'KeyB', 'KeyQ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);
  window.addEventListener('keydown', (e) => {
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    input.keys.add(e.code);
    if (e.code === 'KeyF' || e.code === 'KeyE') input.interact = true;
    if (e.code === 'Tab') input.scoreboard = true;
    if (e.code === 'KeyR') input.queue.push('reload');
    if (e.code === 'KeyB') input.queue.push('buy');
    if (e.code === 'KeyQ') input.queue.push('cycle:-1');
    if (e.code === 'KeyP') input.queue.push('pause');
    if (SLOT_KEYS[e.code]) input.queue.push('slot:' + SLOT_KEYS[e.code]);
  });
  window.addEventListener('keyup', (e) => {
    input.keys.delete(e.code);
    if (e.code === 'KeyF' || e.code === 'KeyE') input.interact = false;
    if (e.code === 'Tab') input.scoreboard = false;
  });
  window.addEventListener('blur', () => {
    input.keys.clear();
    input.firing = false; input.adsHeld = false; input.interact = false;
  });
  let mouseDown = false;
  document.addEventListener('mousemove', (e) => {
    if (input.locked || mouseDown) { input.dx += e.movementX || 0; input.dy += e.movementY || 0; }
  });
  document.addEventListener('mousedown', (e) => {
    if (e.target.closest && e.target.closest('button, .menu, .buy-menu, a')) return;
    mouseDown = true;
    if (!input.locked && !lockDenied) { requestLock(canvas); return; }
    if (e.button === 0) { input.firing = true; input.triggerEdge = true; }
    if (e.button === 2) input.adsHeld = true;
  });
  document.addEventListener('mouseup', (e) => {
    mouseDown = false;
    if (e.button === 0) input.firing = false;
    if (e.button === 2) input.adsHeld = false;
  });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('wheel', (e) => {
    const now = performance.now();
    if (now - input.lastWheel < 130) return;
    input.lastWheel = now;
    input.queue.push(e.deltaY > 0 ? 'cycle:1' : 'cycle:-1');
  }, { passive: true });
  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === canvas;
    if (input.locked) lockDenied = false;
    if (!input.locked) { input.firing = false; input.adsHeld = false; }
    if (onLockChange) onLockChange(input.locked);
  });
  document.addEventListener('pointerlockerror', () => { lockDenied = true; });
}
export function requestLock(canvas) {
  if (document.pointerLockElement === canvas) return;
  try {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => { lockDenied = true; });
  } catch (_) { lockDenied = true; }
}
export function exitLock() {
  if (document.pointerLockElement) document.exitPointerLock();
}
