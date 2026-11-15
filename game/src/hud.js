// hud.js — every DOM readout: health, ammo, timer, score, killfeed, crosshair,
// minimap, buy menu, scoreboard, and the menu/pause/match-end screens. It reads
// state and reports clicks; it never simulates.
import { WEAPONS, GRENADES, ECONOMY, TEAM_INFO, ROUND } from './config.js';
import { BOXES, SITES } from './map.js';
import { weaponOf } from './state.js';
import { currentDef, spreadNow } from './weapons.js';

function $(id) { return document.getElementById(id); }
function setText(el, v) { if (el && el._v !== v) { el._v = v; el.textContent = v; } }
function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
export function createHUD(cb) {
  const refs = {
    cb, buyOpen: false, mode: 'match', difficulty: 'standard',
    hitUntil: 0, hitKill: false, dmgUntil: 0, dmgAngle: 0, dmgFlash: 0,
    lastKillLen: -1, lastBanner: null, lastMapDraw: 0, lastScoreDraw: 0,
    els: {},
  };
  const ids = ['hud', 'hp-num', 'hp-fill', 'armor-num', 'ammo-mag', 'ammo-reserve', 'weapon-name',
    'money', 'timer', 'timer-label', 'score-raiders', 'score-sentinels', 'round-num',
    'pips-raiders', 'pips-sentinels', 'killfeed', 'crosshair', 'hitmarker', 'bomb-status',
    'bomb-bar-fill', 'interact-prompt', 'channel-bar', 'channel-fill', 'channel-label',
    'banner', 'banner-title', 'banner-sub', 'toast', 'damage-vignette', 'damage-dir',
    'minimap', 'charge-tag', 'spec-msg', 'scope', 'buy-menu', 'buy-grid', 'buy-money',
    'buy-msg', 'buy-close', 'scoreboard', 'score-rows', 'menu', 'deploy-btn',
    'pause-menu', 'resume-btn', 'quit-btn', 'match-end', 'match-title', 'match-sub',
    'match-stats', 'play-again-btn', 'menu-btn', 'hint-bar'];
  for (const id of ids) refs.els[id] = $(id);
  // Mode / difficulty pickers.
  for (const b of document.querySelectorAll('[data-mode]')) {
    b.addEventListener('click', () => {
      refs.mode = b.dataset.mode;
      for (const x of document.querySelectorAll('[data-mode]')) x.classList.toggle('picked', x === b);
      cb.onClick();
    });
  }
  for (const b of document.querySelectorAll('[data-diff]')) {
    b.addEventListener('click', () => {
      refs.difficulty = b.dataset.diff;
      for (const x of document.querySelectorAll('[data-diff]')) x.classList.toggle('picked', x === b);
      cb.onClick();
    });
  }
  refs.els['deploy-btn'].addEventListener('click', () => cb.onDeploy(refs.mode, refs.difficulty));
  refs.els['resume-btn'].addEventListener('click', () => cb.onResume());
  refs.els['quit-btn'].addEventListener('click', () => cb.onQuitToMenu());
  refs.els['play-again-btn'].addEventListener('click', () => cb.onPlayAgain());
  refs.els['menu-btn'].addEventListener('click', () => cb.onQuitToMenu());
  refs.els['buy-close'].addEventListener('click', () => closeBuy(refs));
  buildPips(refs.els['pips-raiders'], 5);
  buildPips(refs.els['pips-sentinels'], 5);
  return refs;
}
function buildPips(el, n) {
  el.innerHTML = '';
  for (let i = 0; i < n; i++) { const d = document.createElement('span'); d.className = 'pip'; el.appendChild(d); }
}
function paintPips(el, wins, max) {
  const kids = el.children;
  for (let i = 0; i < kids.length; i++) {
    kids[i].classList.toggle('won', i < wins);
    kids[i].style.display = i < max ? '' : 'none';
  }
}
export function hudNoteHit(refs, head, killed, time) {
  refs.hitUntil = time + 0.14;
  refs.hitKill = killed;
  refs.els['hitmarker'].classList.toggle('head', !!head);
  refs.els['hitmarker'].classList.toggle('kill', !!killed);
}
export function hudNoteDamage(refs, fromX, fromZ, player, time) {
  refs.dmgFlash = 1;
  refs.dmgUntil = time + 1.0;
  const dx = fromX - player.pos.x, dz = fromZ - player.pos.z;
  const worldAng = Math.atan2(dx, dz);
  refs.dmgAngle = worldAng + Math.PI + player.yaw;
}
export function openBuy(refs, S) {
  if (S.phase !== 'buy' || refs.buyOpen) return;
  refs.buyOpen = true;
  refreshBuy(refs, S);
  refs.els['buy-menu'].classList.add('open');
  refs.cb.onBuyOpened();
}
export function closeBuy(refs) {
  if (!refs.buyOpen) return;
  refs.buyOpen = false;
  refs.els['buy-menu'].classList.remove('open');
  refs.cb.onBuyClosed();
}
export function toggleBuy(refs, S) {
  if (refs.buyOpen) closeBuy(refs);
  else openBuy(refs, S);
}
function refreshBuy(refs, S) {
  const p = S.combatants[S.playerId];
  const grid = refs.els['buy-grid'];
  grid.innerHTML = '';
  setText(refs.els['buy-money'], '$' + p.money);
  setText(refs.els['buy-msg'], '');
  const items = [];
  for (const id of ['vex9', 'kr7', 'breacher', 'longshot']) {
    const d = WEAPONS[id];
    items.push({ id, name: d.name, price: d.price, desc: dmgLine(d), owned: p.weapons.primary === id });
  }
  items.push({ id: 'frag', name: GRENADES.frag.name, price: GRENADES.frag.price, desc: 'Blast radius ' + GRENADES.frag.radius + ' m', owned: false, count: p.grenades.frag });
  items.push({ id: 'smoke', name: GRENADES.smoke.name, price: GRENADES.smoke.price, desc: 'Blocks sight for ' + GRENADES.smoke.duration + ' s', owned: false, count: p.grenades.smoke });
  items.push({ id: 'armor', name: 'Combat Armour', price: ECONOMY.ARMOR, desc: 'Halves bullet damage', owned: p.armor >= 100 });
  if (p.team !== S.attackers) items.push({ id: 'kit', name: 'Defuse Kit', price: ECONOMY.KIT, desc: 'Defuses in ' + ROUND.DEFUSE_KIT_TIME + ' s', owned: p.hasKit });
  for (const it of items) {
    const card = document.createElement('button');
    card.className = 'buy-card';
    const afford = p.money >= it.price;
    if (!afford || it.owned) card.classList.add('dim');
    card.innerHTML = '<span class="buy-name"></span><span class="buy-desc"></span><span class="buy-price"></span>';
    card.children[0].textContent = it.name + (it.count ? ' ×' + it.count : '') + (it.owned ? ' ✓' : '');
    card.children[1].textContent = it.desc;
    card.children[2].textContent = '$' + it.price;
    card.addEventListener('click', () => {
      const res = refs.cb.onBuy(it.id);
      if (!res.ok) setText(refs.els['buy-msg'], res.reason);
      else refs.cb.onClick();
      refreshBuy(refs, S);
    });
    grid.appendChild(card);
  }
}
function dmgLine(d) {
  return d.pellets > 1 ? d.pellets + ' pellets × ' + d.damage + ' dmg' : d.damage + ' dmg · ' + d.mag + ' rounds';
}
function drawMinimap(refs, S, p) {
  const cv = refs.els['minimap'];
  const g = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const sx = W / 64, sz = H / 48;
  const X = (x) => (x + 32) * sx, Z = (z) => (z + 24) * sz;
  g.fillStyle = '#12161d';
  g.fillRect(0, 0, W, H);
  for (const b of BOXES) {
    if (b[1] > 2) continue;
    g.fillStyle = b[6] === 'crate' || b[6] === 'tallcrate' ? '#6b5a3e' : '#4d545e';
    g.fillRect(X(b[0]), Z(b[2]), (b[3] - b[0]) * sx, (b[5] - b[2]) * sz);
  }
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    g.strokeStyle = '#f59e0b'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(X(s.x), Z(s.z), s.r * sx, 0, 7); g.stroke();
    g.fillStyle = '#f59e0b'; g.font = 'bold 11px Arial'; g.textAlign = 'center';
    g.fillText(key, X(s.x), Z(s.z) + 4);
  }
  for (const s of S.smokes) {
    g.fillStyle = 'rgba(190,195,200,0.4)';
    g.beginPath(); g.arc(X(s.x), Z(s.z), s.r * sx, 0, 7); g.fill();
  }
  if (S.bomb.state === 'dropped' || S.bomb.state === 'planted') {
    g.fillStyle = S.bomb.state === 'planted' ? '#ff2a1a' : '#ffd23e';
    const bx = X(S.bomb.x), bz = Z(S.bomb.z);
    g.beginPath(); g.moveTo(bx, bz - 5); g.lineTo(bx + 5, bz); g.lineTo(bx, bz + 5); g.lineTo(bx - 5, bz); g.fill();
  }
  for (const c of S.combatants) {
    if (!c.alive) continue;
    const isFoe = c.team !== p.team;
    if (isFoe && !(S.spotted[c.id] > S.time)) continue;
    g.fillStyle = isFoe ? '#ff5040' : TEAM_INFO[c.team].css;
    if (c.isPlayer) {
      const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
      const px = X(c.pos.x), pz = Z(c.pos.z);
      g.beginPath();
      g.moveTo(px + fx * 7, pz + fz * 7);
      g.lineTo(px - fz * 4.5 - fx * 3, pz + fx * 4.5 - fz * 3);
      g.lineTo(px + fz * 4.5 - fx * 3, pz - fx * 4.5 - fz * 3);
      g.fill();
    } else {
      g.beginPath(); g.arc(X(c.pos.x), Z(c.pos.z), 3.4, 0, 7); g.fill();
    }
  }
}
export function updateHUD(refs, S, p, dt, time) {
  const e = refs.els;
  const inGame = S.phase !== 'menu';
  e['hud'].style.display = inGame ? '' : 'none';
  if (!inGame) return;
  setText(e['hp-num'], String(Math.max(0, Math.ceil(p.hp))));
  e['hp-fill'].style.width = Math.max(0, p.hp) + '%';
  e['hp-fill'].classList.toggle('low', p.hp <= 30);
  setText(e['armor-num'], String(p.armor));
  const wid = weaponOf(p);
  const def = currentDef(p);
  if (def && def.id === 'blade') {
    setText(e['weapon-name'], def.name);
    setText(e['ammo-mag'], '—'); setText(e['ammo-reserve'], '');
  } else if (def) {
    setText(e['weapon-name'], def.name);
    const ammo = p.ammo[def.id];
    setText(e['ammo-mag'], ammo ? String(ammo.mag) : '0');
    setText(e['ammo-reserve'], ammo ? '/ ' + ammo.reserve : '');
    e['ammo-mag'].classList.toggle('low', ammo && ammo.mag <= def.mag * 0.25);
  } else {
    const g = GRENADES[wid];
    setText(e['weapon-name'], g ? g.name : '');
    setText(e['ammo-mag'], String(p.grenades[wid] || 0));
    setText(e['ammo-reserve'], '');
  }
  setText(e['money'], String(p.money));
  setText(e['score-raiders'], String(S.wins.RAIDERS));
  setText(e['score-sentinels'], String(S.wins.SENTINELS));
  setText(e['round-num'], 'ROUND ' + Math.max(1, S.round));
  paintPips(e['pips-raiders'], S.wins.RAIDERS, S.mode === 'match' ? ROUND.WIN_ROUNDS : ROUND.SKIRMISH_WIN);
  paintPips(e['pips-sentinels'], S.wins.SENTINELS, S.mode === 'match' ? ROUND.WIN_ROUNDS : ROUND.SKIRMISH_WIN);
  if (S.bomb.state === 'planted') {
    setText(e['timer-label'], 'DETONATION');
    setText(e['timer'], fmtTime(S.bomb.fuse));
    e['timer'].classList.add('urgent');
  } else if (S.phase === 'buy') {
    setText(e['timer-label'], 'BUY TIME');
    setText(e['timer'], fmtTime(S.phaseTime));
    e['timer'].classList.remove('urgent');
  } else if (S.phase === 'live') {
    setText(e['timer-label'], 'ROUND');
    setText(e['timer'], fmtTime(S.roundTime));
    e['timer'].classList.toggle('urgent', S.roundTime < 15);
  } else {
    setText(e['timer-label'], 'ROUND');
    setText(e['timer'], '--:--');
    e['timer'].classList.remove('urgent');
  }
  // Bomb status line.
  if (S.mode === 'match') {
    let bs = '', pct = 0;
    if (S.bomb.state === 'planted') { bs = 'CHARGE PLANTED · SITE ' + S.bomb.site; pct = (S.bomb.fuse / ROUND.FUSE_TIME) * 100; }
    else if (S.bomb.state === 'dropped') bs = 'CHARGE DROPPED';
    else if (p.carrier) bs = 'YOU CARRY THE CHARGE';
    else if (S.bomb.carrierId >= 0) bs = S.combatants[S.bomb.carrierId].name.toUpperCase() + ' CARRIES THE CHARGE';
    setText(e['bomb-status'], bs);
    e['bomb-bar-fill'].style.width = pct + '%';
    e['charge-tag'].style.display = p.carrier ? '' : 'none';
  } else {
    setText(e['bomb-status'], 'SKIRMISH · ELIMINATION ONLY');
    e['bomb-bar-fill'].style.width = '0%';
  }
  // Interact prompt + channel bar.
  let prompt = '';
  if (p.alive && S.phase === 'live' && S.mode === 'match') {
    if (p.carrier && S.bomb.state === 'carried' && SITES && inSite(p)) prompt = 'Hold F — plant the charge';
    else if (S.bomb.state === 'planted' && p.team !== S.attackers && Math.hypot(p.pos.x - S.bomb.x, p.pos.z - S.bomb.z) < ROUND.DEFUSE_RADIUS + 0.6) prompt = 'Hold F — defuse the charge';
  }
  setText(e['interact-prompt'], prompt);
  e['interact-prompt'].style.display = prompt ? '' : 'none';
  if (p.channel) {
    e['channel-bar'].style.display = '';
    setText(e['channel-label'], p.channel.kind === 'plant' ? 'PLANTING…' : 'DEFUSING…');
    e['channel-fill'].style.width = Math.min(100, p.channel.t * 100) + '%';
  } else {
    e['channel-bar'].style.display = 'none';
  }
  // Crosshair: gap follows live spread; hidden while scoped, dead, or in menus.
  const scoped = def && def.id === 'longshot' && p.ads > 0.7;
  e['scope'].style.display = scoped && p.alive ? '' : 'none';
  const showCross = p.alive && !scoped && !refs.buyOpen && S.phase !== 'roundEnd';
  e['crosshair'].style.display = showCross ? '' : 'none';
  if (showCross && def) {
    const gap = Math.max(4, Math.min(34, 5 + spreadNow(p, def) * 700));
    e['crosshair'].style.setProperty('--gap', gap.toFixed(1) + 'px');
    e['crosshair'].style.setProperty('--len', (def.id === 'blade' ? 4 : 9) + 'px');
  }
  e['hitmarker'].style.display = time < refs.hitUntil ? '' : 'none';
  // Damage feedback.
  refs.dmgFlash = Math.max(0, refs.dmgFlash - dt * 2.2);
  const lowHp = p.alive && p.hp <= 30 ? 0.22 + 0.1 * Math.sin(time * 5) : 0;
  e['damage-vignette'].style.opacity = Math.min(0.85, refs.dmgFlash * 0.55 + lowHp).toFixed(2);
  if (time < refs.dmgUntil && p.alive) {
    e['damage-dir'].style.display = '';
    e['damage-dir'].style.transform = 'translate(-50%,-50%) rotate(' + refs.dmgAngle.toFixed(2) + 'rad)';
  } else {
    e['damage-dir'].style.display = 'none';
  }
  // Killfeed.
  if (S.killfeed.length !== refs.lastKillLen || (S.killfeed.length && S.killfeed[S.killfeed.length - 1].t !== refs.lastKillT)) {
    refs.lastKillLen = S.killfeed.length;
    refs.lastKillT = S.killfeed.length ? S.killfeed[S.killfeed.length - 1].t : 0;
    e['killfeed'].innerHTML = '';
    for (let i = S.killfeed.length - 1; i >= 0; i--) {
      const k = S.killfeed[i];
      const div = document.createElement('div');
      div.className = 'feed-line' + (k.good ? ' good' : ' bad');
      div.textContent = k.text;
      e['killfeed'].appendChild(div);
    }
  }
  // Banner and toast.
  if (S.banner !== refs.lastBanner) {
    refs.lastBanner = S.banner;
    if (S.banner) {
      setText(e['banner-title'], S.banner.text);
      setText(e['banner-sub'], S.banner.sub);
      e['banner'].classList.remove('raiders', 'sentinels');
      if (S.banner.team) e['banner'].classList.add(S.banner.team.toLowerCase());
      e['banner'].style.display = '';
    } else {
      e['banner'].style.display = 'none';
    }
  }
  const showToast = S.toast && time < S.toastUntil;
  setText(e['toast'], showToast ? S.toast : '');
  e['toast'].style.display = showToast ? '' : 'none';
  e['spec-msg'].style.display = !p.alive && S.phase === 'live' ? '' : 'none';
  // Minimap (throttled) and scoreboard.
  if (time - refs.lastMapDraw > 0.15) { refs.lastMapDraw = time; drawMinimap(refs, S, p); }
  e['scoreboard'].style.display = refs.scoreOpen ? '' : 'none';
  if (refs.scoreOpen && time - refs.lastScoreDraw > 0.25) {
    refs.lastScoreDraw = time;
    drawScoreboard(refs, S);
  }
  if (refs.buyOpen && S.phase !== 'buy') closeBuy(refs);
}
function inSite(p) {
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    const dx = p.pos.x - s.x, dz = p.pos.z - s.z;
    if (dx * dx + dz * dz <= s.r * s.r) return true;
  }
  return false;
}
function drawScoreboard(refs, S) {
  const rows = [...S.combatants].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  const el = refs.els['score-rows'];
  el.innerHTML = '';
  for (const team of ['RAIDERS', 'SENTINELS']) {
    const head = document.createElement('div');
    head.className = 'score-head ' + team.toLowerCase();
    head.textContent = TEAM_INFO[team].name + ' — ' + S.wins[team] + ' rounds';
    el.appendChild(head);
    for (const c of rows) {
      if (c.team !== team) continue;
      const r = document.createElement('div');
      r.className = 'score-row' + (c.isPlayer ? ' me' : '');
      r.innerHTML = '<span></span><span></span><span></span><span></span>';
      r.children[0].textContent = c.name + (c.carrier ? ' ◆' : '') + (c.alive ? '' : ' †');
      r.children[1].textContent = c.kills + ' K';
      r.children[2].textContent = c.deaths + ' D';
      r.children[3].textContent = '$' + c.money;
      el.appendChild(r);
    }
  }
}
export function showMatchEnd(refs, S) {
  const p = S.combatants[S.playerId];
  const won = S.matchWinner === p.team;
  setText(refs.els['match-title'], won ? 'VICTORY' : 'DEFEAT');
  setText(refs.els['match-sub'], (TEAM_INFO[S.matchWinner].name) + ' win ' + S.wins[S.matchWinner] + '–' + S.wins[S.matchWinner === 'RAIDERS' ? 'SENTINELS' : 'RAIDERS']);
  const acc = S.stats.shots > 0 ? Math.round((S.stats.hits / S.stats.shots) * 100) : 0;
  setText(refs.els['match-stats'], p.kills + ' kills · ' + p.deaths + ' deaths · ' + acc + '% accuracy · ' + S.stats.headshots + ' headshots · ' + Math.round(p.damage) + ' damage');
  refs.els['match-end'].classList.add('open');
  refs.els['match-title'].classList.toggle('won', won);
}
export function hideMatchEnd(refs) { refs.els['match-end'].classList.remove('open'); }
export function showMenu(refs) {
  refs.els['menu'].classList.add('open');
  refs.els['hud'].style.display = 'none';
}
export function hideMenu(refs) { refs.els['menu'].classList.remove('open'); }
export function showPause(refs, show) { refs.els['pause-menu'].classList.toggle('open', show); }
