// audio.js — every sound is synthesized with WebAudio: no audio files, no
// network. Callers pass a distance for world sounds; UI sounds use distance 0.
export function createAudio() {
  return { ctx: null, master: null, noiseBuf: null };
}
export function ensureAudio(a) {
  if (a.ctx) {
    if (a.ctx.state === 'suspended') a.ctx.resume().catch(() => {});
    return true;
  }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    a.ctx = new AC();
    a.master = a.ctx.createGain();
    a.master.gain.value = 0.5;
    a.master.connect(a.ctx.destination);
    const len = a.ctx.sampleRate;
    a.noiseBuf = a.ctx.createBuffer(1, len, a.ctx.sampleRate);
    const data = a.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return true;
  } catch (_) {
    a.ctx = null;
    return false;
  }
}
function att(dist) { return 1 / (1 + Math.max(0, dist) * 0.09); }
function tone(a, f, f2, dur, type, gain, when) {
  if (!a.ctx) return;
  const t = a.ctx.currentTime + (when || 0);
  const o = a.ctx.createOscillator(), g = a.ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(a.master);
  o.start(t); o.stop(t + dur + 0.02);
}
function noiseHit(a, dur, fType, freq, freqEnd, gain, when) {
  if (!a.ctx) return;
  const t = a.ctx.currentTime + (when || 0);
  const src = a.ctx.createBufferSource();
  src.buffer = a.noiseBuf; src.loop = true;
  const flt = a.ctx.createBiquadFilter();
  flt.type = fType; flt.frequency.setValueAtTime(freq, t);
  if (freqEnd) flt.frequency.exponentialRampToValueAtTime(Math.max(30, freqEnd), t + dur);
  const g = a.ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(flt); flt.connect(g); g.connect(a.master);
  src.start(t); src.stop(t + dur + 0.02);
}
export function playShot(a, wid, dist) {
  const g = att(dist);
  if (wid === 'longshot') { noiseHit(a, 0.28, 'lowpass', 2600, 300, 0.9 * g); tone(a, 140, 50, 0.22, 'sine', 0.5 * g); }
  else if (wid === 'breacher') { noiseHit(a, 0.2, 'lowpass', 3200, 500, 0.85 * g); tone(a, 110, 45, 0.16, 'sine', 0.4 * g); }
  else if (wid === 'kr7') { noiseHit(a, 0.11, 'lowpass', 3600, 700, 0.7 * g); tone(a, 190, 70, 0.07, 'square', 0.16 * g); }
  else if (wid === 'vex9') { noiseHit(a, 0.08, 'lowpass', 4200, 900, 0.55 * g); tone(a, 220, 80, 0.05, 'square', 0.12 * g); }
  else { noiseHit(a, 0.09, 'lowpass', 4000, 800, 0.6 * g); tone(a, 200, 70, 0.06, 'square', 0.14 * g); }
}
export function playReload(a, dist) { const g = att(dist); noiseHit(a, 0.05, 'highpass', 1800, 0, 0.25 * g); noiseHit(a, 0.05, 'highpass', 1400, 0, 0.3 * g, 0.35); }
export function playDry(a) { tone(a, 1400, 900, 0.04, 'square', 0.12); }
export function playStep(a, run, dist) { noiseHit(a, 0.05, 'lowpass', run ? 700 : 450, 0, (run ? 0.16 : 0.07) * att(dist)); }
export function playHit(a, head) { tone(a, head ? 1700 : 1250, 0, 0.05, 'sine', 0.28); }
export function playKill(a) { tone(a, 660, 0, 0.07, 'sine', 0.25); tone(a, 990, 0, 0.1, 'sine', 0.25, 0.07); }
export function playSwing(a) { noiseHit(a, 0.12, 'bandpass', 900, 2400, 0.2); }
export function playBounce(a, dist) { tone(a, 340, 200, 0.05, 'sine', 0.14 * att(dist)); }
export function playExplode(a, dist) {
  const g = Math.max(0.15, att(dist));
  noiseHit(a, 0.8, 'lowpass', 900, 50, 1.0 * g);
  tone(a, 70, 32, 0.7, 'sine', 0.7 * g);
}
export function playBeep(a, urgent, dist) { tone(a, urgent ? 1320 : 880, 0, 0.07, 'square', 0.16 * att(dist)); }
export function playPlanted(a) { tone(a, 520, 0, 0.14, 'square', 0.2); tone(a, 520, 0, 0.14, 'square', 0.2, 0.2); }
export function playDefused(a) { tone(a, 523, 0, 0.12, 'sine', 0.25); tone(a, 659, 0, 0.12, 'sine', 0.25, 0.11); tone(a, 784, 0, 0.2, 'sine', 0.25, 0.22); }
export function playRoundWin(a, won) {
  if (won) { tone(a, 392, 0, 0.12, 'triangle', 0.3); tone(a, 523, 0, 0.12, 'triangle', 0.3, 0.12); tone(a, 659, 0, 0.24, 'triangle', 0.3, 0.24); }
  else { tone(a, 330, 0, 0.16, 'triangle', 0.25); tone(a, 247, 0, 0.3, 'triangle', 0.25, 0.16); }
}
export function playBuy(a) { tone(a, 1180, 0, 0.05, 'sine', 0.2); tone(a, 1560, 0, 0.07, 'sine', 0.2, 0.05); }
export function playClick(a) { tone(a, 900, 0, 0.04, 'sine', 0.15); }
export function playGo(a) { tone(a, 220, 440, 0.28, 'sawtooth', 0.16); }
export function playDamage(a) { tone(a, 90, 50, 0.14, 'sine', 0.4); }
