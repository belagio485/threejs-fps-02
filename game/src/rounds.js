// rounds.js — the round state machine: buy time, live play, bomb plant/defuse
// channels, win conditions, economy, halftime side swap, and match end.
import { ROUND, ECONOMY } from './config.js';
import { siteAt, SPAWNS } from './map.js';
import { spawnCombatant, countAlive, setBanner, setToast, freshAmmo } from './state.js';
import { botBuy } from './weapons.js';
import { assignRoles } from './bots.js';
import { explode } from './combat.js';

export function startMatch(S) {
  S.round = 0;
  nextRound(S);
}
function swapSides(S) {
  for (const c of S.combatants) c.team = c.team === 'RAIDERS' ? 'SENTINELS' : 'RAIDERS';
  S.attackers = S.attackers === 'RAIDERS' ? 'SENTINELS' : 'RAIDERS';
  S.swapped = true;
  setToast(S, 'Sides swapped — attack and defence exchange', 4);
}
export function nextRound(S) {
  S.round++;
  if (S.mode === 'match' && S.round === ROUND.HALFTIME_AFTER + 1 && !S.swapped) swapSides(S);
  const perTeam = { RAIDERS: 0, SENTINELS: 0 };
  for (const c of S.combatants) {
    // Death last round costs the loadout: primary, grenades, armor and kit.
    if (!c.alive) {
      c.weapons.primary = null;
      c.ammo = { p9: freshAmmo('p9') };
      c.grenades.frag = 0; c.grenades.smoke = 0;
      c.armor = 0; c.hasKit = false;
    }
    const spawn = SPAWNS[c.team][perTeam[c.team] % 5];
    perTeam[c.team]++;
    spawnCombatant(c, spawn);
    if (!c.isPlayer) botBuy(S, c);
  }
  S.projectiles.length = 0; S.smokes.length = 0; S.noises.length = 0;
  S.spotted = {}; S.killfeed.length = 0; S.banner = null;
  S.bomb.state = S.mode === 'match' ? 'carried' : 'none';
  S.bomb.site = null; S.bomb.fuse = 0; S.bomb.progress = 0; S.bomb.lastBeep = 0;
  S.bomb.defuserId = -1; S.bomb.planterId = -1;
  const carrier = S.combatants.find((c) => c.isPlayer && c.team === S.attackers)
    || S.combatants.find((c) => c.team === S.attackers);
  if (carrier && S.mode === 'match') {
    carrier.carrier = true;
    S.bomb.carrierId = carrier.id;
    S.bomb.x = carrier.pos.x; S.bomb.z = carrier.pos.z;
  } else {
    S.bomb.carrierId = -1;
  }
  assignRoles(S);
  S.roundTime = ROUND.ROUND_TIME;
  S.phaseTime = ROUND.BUY_TIME;
  S.phase = 'buy';
  S.roundWinner = null;
  S.events.push({ t: 'roundStart', round: S.round });
  setToast(S, 'Round ' + S.round + ' — press B to buy', 3.5);
}
function endRound(S, winner, reason) {
  S.roundWinner = winner;
  S.wins[winner]++;
  const loser = winner === 'RAIDERS' ? 'SENTINELS' : 'RAIDERS';
  const objective = reason === 'detonated' || reason === 'defused';
  const winPay = objective ? ECONOMY.WIN_OBJECTIVE : ECONOMY.WIN_ELIM;
  S.lossStreak[winner] = 0;
  S.lossStreak[loser] = Math.min(ECONOMY.LOSS_STREAK_MAX, S.lossStreak[loser] + 1);
  const lossPay = ECONOMY.LOSS + ECONOMY.LOSS_STREAK * (S.lossStreak[loser] - 1);
  for (const c of S.combatants) {
    c.money = Math.min(ECONOMY.MAX, c.money + (c.team === winner ? winPay : lossPay));
  }
  const reasonText = {
    eliminated: 'Enemy team eliminated', detonated: 'The charge detonated',
    defused: 'The charge was defused', time: 'Time expired',
  }[reason] || reason;
  setBanner(S, (winner === 'RAIDERS' ? 'Raiders' : 'Sentinels') + ' take the round', reasonText, winner);
  S.events.push({ t: 'roundEnd', winner, reason });
  const target = S.mode === 'match' ? ROUND.WIN_ROUNDS : ROUND.SKIRMISH_WIN;
  const maxRounds = S.mode === 'match' ? ROUND.MAX_ROUNDS : ROUND.SKIRMISH_MAX;
  if (S.wins[winner] >= target || S.round >= maxRounds) {
    S.matchWinner = S.wins.RAIDERS === S.wins.SENTINELS ? winner : (S.wins.RAIDERS > S.wins.SENTINELS ? 'RAIDERS' : 'SENTINELS');
  }
  S.phase = 'roundEnd';
  S.phaseTime = ROUND.END_TIME;
}
// Plant/defuse channels: hold still in the right place while holding interact
// (the player) or holding the objective state (bots). Progress decays on break.
function stepChannels(S, dt, input) {
  const bomb = S.bomb;
  if (S.mode !== 'match') return;
  if (bomb.state === 'carried') {
    const carrier = S.combatants[bomb.carrierId];
    const site = carrier && carrier.alive ? siteAt(carrier.pos.x, carrier.pos.z) : null;
    const holding = carrier && (carrier.isPlayer ? !!(input && input.interact) : (carrier.bot && carrier.bot.state === 'plant'));
    if (site && holding && carrier.speed2d < 0.6) {
      bomb.progress += dt / ROUND.PLANT_TIME;
      carrier.channel = { kind: 'plant', t: bomb.progress };
      if (bomb.progress >= 1) {
        bomb.state = 'planted'; bomb.site = site.id; bomb.fuse = ROUND.FUSE_TIME;
        bomb.planterId = carrier.id; bomb.progress = 0; bomb.lastBeep = 0;
        carrier.carrier = false; carrier.channel = null;
        S.events.push({ t: 'planted', site: site.id, x: carrier.pos.x, z: carrier.pos.z });
        bomb.x = carrier.pos.x; bomb.z = carrier.pos.z;
        setToast(S, 'Charge planted at Site ' + site.id + '!', 4);
      }
    } else {
      bomb.progress = Math.max(0, bomb.progress - dt * 2);
      if (carrier) carrier.channel = null;
    }
    return;
  }
  if (bomb.state === 'planted') {
    let defuser = null, nd = Infinity;
    for (const c of S.combatants) {
      if (!c.alive || c.team === S.attackers) continue;
      const d = Math.hypot(c.pos.x - bomb.x, c.pos.z - bomb.z);
      if (d > ROUND.DEFUSE_RADIUS || c.speed2d >= 0.6) continue;
      const holding = c.isPlayer ? !!(input && input.interact) : (c.bot && c.bot.state === 'defuse');
      if (holding && d < nd) { nd = d; defuser = c; }
    }
    if (defuser) {
      const need = defuser.hasKit ? ROUND.DEFUSE_KIT_TIME : ROUND.DEFUSE_TIME;
      bomb.progress += dt / need;
      defuser.channel = { kind: 'defuse', t: bomb.progress };
      if (bomb.progress >= 1) {
        bomb.state = 'defused'; bomb.progress = 0;
        defuser.channel = null;
        S.events.push({ t: 'defused', id: defuser.id });
        endRound(S, defuser.team, 'defused');
      }
    } else {
      bomb.progress = Math.max(0, bomb.progress - dt * 2);
      for (const c of S.combatants) if (c.channel && c.channel.kind === 'defuse') c.channel = null;
    }
  }
}
export function stepRounds(S, dt, input) {
  // Prune expired noises and smoke in place (no per-tick allocation).
  for (let i = S.noises.length - 1; i >= 0; i--) {
    if (S.noises[i].until <= S.time) { S.noises[i] = S.noises[S.noises.length - 1]; S.noises.pop(); }
  }
  for (let i = S.smokes.length - 1; i >= 0; i--) {
    if (S.smokes[i].until <= S.time) { S.smokes[i] = S.smokes[S.smokes.length - 1]; S.smokes.pop(); }
  }
  if (S.phase === 'buy') {
    S.phaseTime -= dt;
    if (S.phaseTime <= 0) {
      S.phase = 'live'; S.phaseTime = 0;
      S.events.push({ t: 'golive' });
    }
    return;
  }
  if (S.phase === 'roundEnd') {
    S.phaseTime -= dt;
    if (S.phaseTime <= 0) {
      if (S.matchWinner) {
        S.phase = 'matchEnd';
        S.events.push({ t: 'matchEnd', winner: S.matchWinner });
      } else {
        nextRound(S);
      }
    }
    return;
  }
  if (S.phase !== 'live') return;
  // Dropped charge pickup.
  if (S.bomb.state === 'dropped') {
    for (const c of S.combatants) {
      if (!c.alive || c.team !== S.attackers) continue;
      if (Math.hypot(c.pos.x - S.bomb.x, c.pos.z - S.bomb.z) < ROUND.PICKUP_RADIUS) {
        c.carrier = true; S.bomb.state = 'carried'; S.bomb.carrierId = c.id;
        S.events.push({ t: 'pickup', id: c.id });
        if (c.isPlayer) setToast(S, 'You picked up the charge', 2.5);
        break;
      }
    }
  }
  stepChannels(S, dt, input);
  if (S.phase !== 'live') return; // defuse may have ended the round
  if (S.bomb.state === 'planted') {
    S.bomb.fuse -= dt;
    const gap = Math.max(0.22, S.bomb.fuse * 0.035);
    if (S.time - S.bomb.lastBeep > gap) {
      S.bomb.lastBeep = S.time;
      S.events.push({ t: 'beep', x: S.bomb.x, z: S.bomb.z, urgent: S.bomb.fuse < 8 });
    }
    if (S.bomb.fuse <= 0) {
      S.bomb.state = 'exploded';
      explode(S, S.bomb.x, 0.6, S.bomb.z, S.bomb.planterId);
      endRound(S, S.attackers, 'detonated');
      return;
    }
  } else {
    S.roundTime -= dt;
  }
  const atkAlive = countAlive(S, S.attackers);
  const defTeam = S.attackers === 'RAIDERS' ? 'SENTINELS' : 'RAIDERS';
  const defAlive = countAlive(S, defTeam);
  if (S.bomb.state === 'planted') {
    if (defAlive === 0) { endRound(S, S.attackers, 'eliminated'); return; }
    // Attackers all dead: defenders must still defuse before the fuse ends.
  } else {
    if (atkAlive === 0 && defAlive === 0) { endRound(S, defTeam, 'eliminated'); return; }
    if (atkAlive === 0) { endRound(S, defTeam, 'eliminated'); return; }
    if (defAlive === 0) { endRound(S, S.attackers, 'eliminated'); return; }
    if (S.roundTime <= 0) { endRound(S, defTeam, 'time'); return; }
  }
}
