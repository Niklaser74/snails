import { Game, WEAPONS, TICK, RULES_VERSION } from './game.js';
import { snigelpost } from './online.js';
import { push } from './push.js';
import { SNAIL_STYLES, TEAM_COLORS } from './snails.js';
import { unlockAudio } from './audio.js';
import { LANGS, t, fmt, setLang, getLang, detectLang, applyDom } from './i18n.js';
import { initAnalytics, track, setAnalyticsLang } from './analytics.js';
import { platform } from './platform.js';
import { setMuted, isMuted } from './audio.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const hud = $('hud');
const menu = $('menu');
const help = $('help');
const gameover = $('gameover');

const LS_KEY = 'snackmageddon.settings';

let game = null;
let lastTs = 0;
let hudLast = 0;
let tutorial = null; // active first-match guide, see startTutorial()
let onlineMatch = null; // Snigelpost: { id, myTeam, startTick, match, pending }
let replayUntil = 0; // >0 while the opponent's turn is being shown at speed
let pollTimer = null;
const waiting = $('waiting');

// ---------- settings ----------
function loadSettings() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; }
}
function saveSettings(s) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
const DEFAULT_STYLE = 'cartoon'; // vald standarddesign: Tecknad (Worms-stil)
const settings = Object.assign({ teams: 2, per: 3, style: DEFAULT_STYLE, rows: [], lang: null, tutorialDone: false }, loadSettings());

// ---------- language ----------
setLang(settings.lang || detectLang());
const langSel = $('opt-lang');
for (const [id, name] of Object.entries(LANGS)) {
  const o = document.createElement('option');
  o.value = id; o.textContent = name;
  langSel.appendChild(o);
}
langSel.value = getLang();

const defaultTeamName = (i, lang = getLang()) => {
  const cur = getLang();
  setLang(lang);
  const name = t('team.' + i);
  setLang(cur);
  return name;
};
const isDefaultTeamName = (name, i) => Object.keys(LANGS).some((l) => defaultTeamName(i, l) === name);

const styleSel = $('opt-style');
function renderStyleOptions() {
  const cur = styleSel.value || settings.style;
  styleSel.innerHTML = '';
  for (const st of SNAIL_STYLES) {
    const o = document.createElement('option');
    o.value = st.id; o.textContent = t('style.' + st.id);
    styleSel.appendChild(o);
  }
  styleSel.value = cur;
}

function applyLanguage() {
  applyDom();
  renderStyleOptions();
  // team names that are still the default of some language follow the language switch
  document.querySelectorAll('.team-row').forEach((row, i) => {
    const input = row.querySelector('input');
    if (isDefaultTeamName(input.value.trim(), i)) input.value = defaultTeamName(i);
    row.querySelector('input').setAttribute('aria-label', t('menu.teamName'));
    const sel = row.querySelector('select');
    sel.setAttribute('aria-label', t('menu.player'));
    sel.options[0].textContent = t('menu.human');
    sel.options[1].textContent = t('menu.ai');
  });
  for (const b of $('weapons').children) b.title = t('weapon.' + b.dataset.id);
  if ($('offline-hint').dataset.ready) $('offline-hint').textContent = t('menu.offline');
  renderTutorial();
}
langSel.addEventListener('change', () => {
  settings.lang = langSel.value;
  setLang(settings.lang);
  setAnalyticsLang(settings.lang);
  saveSettings(settings);
  applyLanguage();
});

// ---------- usage counter (see supabase/README.md) ----------
initAnalytics(getLang());
track('app_open', {
  installed: matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
  touch: matchMedia('(pointer: coarse)').matches,
  w: innerWidth, h: innerHeight,
  platform: platform.id,
});
let matchStats = null; // { t0, weapons } for the running match

// ---------- menu ----------
$('opt-teams').value = settings.teams;
$('opt-per').value = settings.per;
renderStyleOptions();
styleSel.value = settings.style;

function renderTeamRows() {
  const n = +$('opt-teams').value;
  const box = $('team-rows');
  box.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const saved = settings.rows[i] || {};
    const row = document.createElement('div');
    row.className = 'team-row';
    const name = saved.name && !isDefaultTeamName(saved.name, i) ? saved.name : defaultTeamName(i);
    row.innerHTML = `
      <div class="swatch" style="background:${TEAM_COLORS[i].hex}"></div>
      <input type="text" maxlength="16" aria-label="${t('menu.teamName')}">
      <select aria-label="${t('menu.player')}"><option value="human">${t('menu.human')}</option><option value="ai">${t('menu.ai')}</option></select>`;
    row.querySelector('input').value = name;
    row.querySelector('select').value = saved.ai ? 'ai' : i === 0 ? 'human' : 'ai';
    box.appendChild(row);
  }
}
renderTeamRows();
applyLanguage();
$('opt-teams').addEventListener('change', renderTeamRows);

function readConfig() {
  const rows = [...document.querySelectorAll('.team-row')].map((r, i) => ({
    name: r.querySelector('input').value.trim() || defaultTeamName(i),
    color: TEAM_COLORS[i].hex,
    ai: r.querySelector('select').value === 'ai',
  }));
  settings.teams = +$('opt-teams').value;
  settings.per = +$('opt-per').value;
  settings.style = styleSel.value;
  settings.rows = rows;
  saveSettings(settings);
  return { teams: rows, snailsPerTeam: settings.per, style: settings.style };
}

let starting = false;
async function startGame() {
  if (starting) return;
  starting = true;
  try {
    // portals show an ad between matches; audio is muted meanwhile
    if (game || platform.id !== 'web') {
      const wasMuted = isMuted();
      await platform.commercialBreak(() => setMuted(true), () => setMuted(wasMuted));
    }
  } finally { starting = false; }
  unlockAudio();
  const cfg = readConfig();
  // ?seed=1234 gives a reproducible map and match (used by tests and for sharing)
  const seedParam = new URLSearchParams(location.search).get('seed');
  if (seedParam !== null && seedParam !== '') cfg.seed = Number(seedParam) | 0;
  if (game && game.phase !== 'over') reportAbandon();
  matchStats = { t0: Date.now(), weapons: {} };
  game = new Game(canvas, cfg, {
    onGameOver: (winner) => {
      track('match_end', {
        turns: game.turnCount,
        durationSec: Math.round((Date.now() - matchStats.t0) / 1000),
        winner: winner ? (winner.ai ? 'ai' : 'human') : 'draw',
        weapons: matchStats.weapons,
      });
      matchStats = null;
      platform.gameplayStop();
      setTimeout(() => {
        $('go-title').textContent = winner ? t('go.win', { name: winner.name }) : t('go.draw');
        gameover.hidden = false;
      }, 2000);
    },
    onTurn: () => { camDrag.active = false; },
    onFire: (g) => { if (matchStats) matchStats.weapons[g.weaponId] = (matchStats.weapons[g.weaponId] || 0) + 1; },
  });
  track('match_start', { teams: cfg.teams.length, per: cfg.snailsPerTeam, humans: cfg.teams.filter((tm) => !tm.ai).length, style: cfg.style });
  platform.gameplayStart();
  window.__game = game;
  buildWeaponBar();
  menu.hidden = true;
  gameover.hidden = true;
  hud.hidden = false;
  lastTs = performance.now();
  acc = 0;
  if (!settings.tutorialDone && cfg.teams.some((tm) => !tm.ai)) startTutorial(); else endTutorial(false);
  tryFullscreen();
}

function reportAbandon() {
  if (!game || !matchStats) return;
  track('match_abandon', { turns: game.turnCount, durationSec: Math.round((Date.now() - matchStats.t0) / 1000) });
  matchStats = null;
}

function toMenu() {
  if (game && game.phase !== 'over' && !onlineMatch) { reportAbandon(); platform.gameplayStop(); }
  stopPolling();
  onlineMatch = null;
  replayUntil = 0;
  $('replaybar').hidden = true;
  waiting.hidden = true;
  $('btn-again').hidden = false;
  gameover.hidden = true;
  hud.hidden = true;
  menu.hidden = false;
  game = null;
  window.__game = null;
  refreshMatchList();
}
$('btn-start').addEventListener('click', startGame);
$('btn-help').addEventListener('click', () => (help.hidden = false));
$('btn-help-close').addEventListener('click', () => (help.hidden = true));
$('btn-guide').addEventListener('click', () => { settings.tutorialDone = false; saveSettings(settings); help.hidden = true; });
$('btn-again').addEventListener('click', startGame);
$('btn-tomenu').addEventListener('click', toMenu);
$('btn-menu').addEventListener('click', toMenu);

function tryFullscreen() {
  const el = document.documentElement;
  if (matchMedia('(pointer: coarse)').matches && el.requestFullscreen && !document.fullscreenElement) {
    el.requestFullscreen().catch(() => {});
  }
}

// ---------- tutorial ----------
// A four-step guide shown during the player's first match. Each step completes
// when the player actually does the thing.
function startTutorial() {
  tutorial = { step: 1, x0: null, aim0: null, snail: null, turnAt4: null };
  renderTutorial();
}
function endTutorial(done, how = 'done') {
  if (done) {
    settings.tutorialDone = true;
    saveSettings(settings);
    track(how === 'skip' ? 'tutorial_skip' : 'tutorial_done', { step: tutorial?.step ?? 0 });
  }
  tutorial = null;
  $('tutorial').hidden = true;
}
function renderTutorial() {
  const box = $('tutorial');
  if (!tutorial) { box.hidden = true; return; }
  $('tut-step').textContent = t('tut.step', { n: tutorial.step });
  $('tut-text').textContent = t('tut.' + tutorial.step);
  $('tut-skip').textContent = tutorial.step === 4 ? t('tut.done') : t('tut.skip');
}
$('tut-skip').addEventListener('click', () => endTutorial(true, tutorial?.step === 4 ? 'done' : 'skip'));
function updateTutorial() {
  if (!tutorial || !game) return;
  const s = game.active;
  const box = $('tutorial');
  if (!s || game.ai || game.phase === 'over') { box.hidden = true; return; }
  if (tutorial.snail !== s) { tutorial.snail = s; tutorial.x0 = s.x; tutorial.aim0 = s.aim; }
  const before = tutorial.step;
  if (tutorial.step === 1 && Math.abs(s.x - tutorial.x0) > 30) tutorial.step = 2;
  else if (tutorial.step === 2 && Math.abs(s.aim - tutorial.aim0) > 0.25) tutorial.step = 3;
  else if (tutorial.step === 3 && game.hasFired) { tutorial.step = 4; tutorial.turnAt4 = game.turnCount; }
  else if (tutorial.step === 4 && game.turnCount > tutorial.turnAt4 && game.phase === 'aim') { endTutorial(true); return; }
  if (tutorial.step !== before || box.hidden) { box.hidden = false; renderTutorial(); }
}

// ---------- Snigelpost ----------
function playerName() { return (settings.playerName || '').trim() || t('online.defaultName'); }
function notice(text, ms = 6000) {
  const el = $('notice');
  el.textContent = text; el.hidden = false;
  clearTimeout(notice.timer);
  notice.timer = setTimeout(() => { el.hidden = true; }, ms);
}
function matchLabel(m) {
  const opp = m.names?.[m.my_team === 0 ? '1' : '0'];
  if (m.status === 'finished') return m.winner == null ? t('online.draw') : m.winner === m.my_team ? t('online.won') : t('online.lost');
  if (m.status === 'open' && m.my_team === 0) return t('online.open');
  return m.turn_team === m.my_team ? t('online.yourTurn') : t('online.theirTurn', { name: opp || '…' });
}
async function refreshMatchList() {
  if (!snigelpost.available()) return;
  const box = $('online-list');
  const status = $('online-status');
  try {
    const list = await snigelpost.list();
    box.innerHTML = '';
    if (!list.length) { status.textContent = t('online.none'); return; }
    status.textContent = '';
    for (const m of list) {
      const opp = m.names?.[m.my_team === 0 ? '1' : '0'];
      const mine = m.status !== 'finished' && m.turn_team === m.my_team && !(m.status === 'open' && m.turn_count >= 1);
      const row = document.createElement('div');
      row.className = 'mrow' + (mine ? ' turn' : '');
      row.innerHTML = `<div><div class="mname">${escapeHtml(t('online.vs', { name: opp || '…' }))}</div><div class="mstate">${escapeHtml(matchLabel(m))}</div></div>
        <button class="${mine ? 'play' : ''}">${mine ? t('online.play') : t('online.show')}</button><button class="del" title="${t('online.delete')}">✕</button>`;
      row.querySelector('button').addEventListener('click', () => openMatch(m.id));
      row.querySelector('.del').addEventListener('click', async () => { await snigelpost.remove(m.id).catch(() => {}); refreshMatchList(); });
      box.appendChild(row);
    }
  } catch (e) {
    status.textContent = /anonymous|signup|sign-in|disabled/i.test(e.message) ? t('online.disabled') : t('online.error', { msg: e.message });
  }
}
const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function openMatch(id) {
  const status = $('online-status');
  status.textContent = t('online.loading');
  try {
    let m = await snigelpost.get(id);
    if (m.my_team == null) { await snigelpost.join(id, playerName()); m = await snigelpost.get(id); push.notify(id, 'joined'); }
    if (m.rules_version !== RULES_VERSION) { status.textContent = t('online.rules'); return; }
    status.textContent = '';
    startOnlineGame(m);
  } catch (e) {
    status.textContent = /anonymous|signup|sign-in|disabled/i.test(e.message) ? t('online.disabled') : t('online.error', { msg: e.message });
  }
}

function isMyTurn(m) {
  return m.status !== 'finished' && m.turn_team === m.my_team && !(m.status === 'open' && m.turn_count >= 1);
}

function startOnlineGame(m) {
  unlockAudio();
  stopPolling();
  matchStats = null;
  const hooks = {
    onWaitTurn: (g) => {
      if (!onlineMatch) return;
      if (g.tickCount <= onlineMatch.startTick) { showWaiting(); return; } // nothing new was played on this device
      submitTurn(false, null);
    },
    onGameOver: (winner) => {
      if (!onlineMatch) return;
      if (game.tickCount > onlineMatch.startTick) submitTurn(true, winner ? winner.index : null);
      else setTimeout(() => showGameOverOnline(), 1500);
    },
    onTurn: () => { camDrag.active = false; },
  };
  const { game: g, myTeam, replayFrom } = snigelpost.buildGame(canvas, m, hooks, settings.style);
  onlineMatch = { id: m.id, myTeam, startTick: m.tick_count, match: m, pending: null };
  game = g;
  window.__game = g;
  buildWeaponBar();
  menu.hidden = true; gameover.hidden = true; waiting.hidden = true; help.hidden = true;
  hud.hidden = false;
  $('btn-again').hidden = true;
  lastTs = performance.now(); acc = 0;
  endTutorial(false);
  const mine = isMyTurn(m);
  // fast-forward silently to the part worth watching
  const showFrom = mine ? replayFrom : m.tick_count;
  while (g.tickCount < showFrom && !g.paused && g.phase !== 'over') g.tick();
  if (mine && replayFrom < m.tick_count) { replayUntil = m.tick_count; $('replaybar').hidden = false; }
  else { replayUntil = 0; afterReplay(); }
  if (m.status === 'open' && m.turn_count === 0) showWaiting(); // show the invite link before the first turn
  track('match_start', { teams: 2, per: m.config.snailsPerTeam, humans: 2, style: settings.style, online: true });
}

function afterReplay() {
  $('replaybar').hidden = true;
  replayUntil = 0;
  const o = onlineMatch;
  if (!o) return;
  const m = o.match, g = game;
  if (g.tickCount >= m.tick_count && m.last_hash && g.stateHash() !== m.last_hash) notice(t('online.desync'), 9000);
  if (m.status === 'finished') { showGameOverOnline(); return; }
  if (!isMyTurn(m)) showWaiting();
}
$('btn-skip-replay').addEventListener('click', () => {
  if (!replayUntil || !game) return;
  while (game.tickCount < replayUntil && !game.paused) game.tick();
  afterReplay();
});

function showGameOverOnline() {
  const m = onlineMatch?.match;
  if (!m) return;
  $('go-title').textContent = m.winner == null ? t('online.draw') : m.winner === m.my_team ? t('online.won') : t('online.lost');
  $('btn-again').hidden = true;
  waiting.hidden = true;
  gameover.hidden = false;
}

async function submitTurn(finished, winnerTeam) {
  const o = onlineMatch, g = game;
  if (!o || !g) return;
  o.pending = { finished, winnerTeam };
  showWaiting();
  $('wait-status').textContent = t('online.sending');
  try {
    const m = await snigelpost.submit(o.match, g, o.startTick, finished, winnerTeam);
    o.match = { ...o.match, ...m, turns: undefined };
    o.startTick = m.tick_count;
    o.pending = null;
    $('wait-status').textContent = t('online.sent');
    push.notify(o.id, finished ? 'finished' : 'turn');
    track('match_end', { turns: g.turnCount, durationSec: 0, winner: finished ? (winnerTeam === o.myTeam ? 'human' : winnerTeam == null ? 'draw' : 'human') : 'pending', weapons: {}, online: true });
    renderWaiting();
    if (finished) setTimeout(() => showGameOverOnline(), 1500);
  } catch (e) {
    $('wait-status').textContent = t('online.error', { msg: e.message });
    $('btn-wait-refresh').textContent = t('online.retry');
  }
}

function showWaiting() {
  if (!onlineMatch) return;
  waiting.hidden = false;
  // my own turn is on hold while the overlay is up (invite link before turn 1)
  if (game && isMyTurn(onlineMatch.match) && game.tickCount <= onlineMatch.startTick) game.paused = true;
  renderWaiting();
  startPolling();
}
function renderWaiting() {
  const o = onlineMatch;
  if (!o) return;
  const m = o.match;
  const opp = m.names?.[o.myTeam === 0 ? '1' : '0'];
  const invite = $('wait-invite');
  const mine = isMyTurn(m) && !o.pending && game && game.tickCount <= o.startTick;
  $('btn-wait-play').hidden = !mine;
  $('btn-wait-refresh').hidden = mine;
  renderPushBox(m);
  $('btn-wait-refresh').textContent = o.pending ? t('online.retry') : t('online.refresh');
  if (m.status === 'open') {
    $('wait-title').textContent = t('online.inviteTitle');
    $('wait-text').textContent = t('online.inviteText');
    invite.hidden = false;
    $('wait-link').value = snigelpost.inviteLink(m.id);
    $('btn-share').hidden = !navigator.share;
  } else if (m.status === 'finished') {
    $('wait-title').textContent = t('online.finished');
    $('wait-text').textContent = matchLabel(m);
    invite.hidden = true;
  } else {
    $('wait-title').textContent = t('online.theirTurn', { name: opp || '…' });
    $('wait-text').textContent = t('online.waitText', { name: opp || '…' });
    invite.hidden = true;
  }
}
// "notify me" box in the waiting overlay
let pushSub = undefined; // undefined = not checked yet
async function renderPushBox(m) {
  const box = $('wait-push'), btn = $('btn-push'), hint = $('push-hint');
  const usable = push.supported() && platform.useServiceWorker && m.status !== 'finished';
  box.hidden = !usable;
  if (!usable) return;
  if (pushSub === undefined) { pushSub = null; pushSub = await push.current(); }
  if (push.needsInstall()) { btn.hidden = true; hint.textContent = t('online.pushIos'); return; }
  if (push.permission() === 'denied') { btn.hidden = true; hint.textContent = t('online.pushDenied'); return; }
  if (pushSub) { btn.hidden = true; hint.textContent = t('online.pushOn'); return; }
  btn.hidden = false; hint.textContent = '';
}
$('btn-push').addEventListener('click', async () => {
  const btn = $('btn-push');
  btn.disabled = true;
  try {
    pushSub = await push.subscribe(getLang());
    track('push_on', {});
  } catch (e) {
    $('push-hint').textContent = push.permission() === 'denied' ? t('online.pushDenied') : t('online.pushFail');
  }
  btn.disabled = false;
  if (onlineMatch) renderPushBox(onlineMatch.match);
});

$('btn-copy').addEventListener('click', async () => {
  const link = $('wait-link').value;
  try { await navigator.clipboard.writeText(link); $('wait-status').textContent = t('online.copied'); }
  catch { $('wait-link').select(); }
});
$('btn-share').addEventListener('click', () => navigator.share?.({ title: 'Snäckmageddon', url: $('wait-link').value }).catch(() => {}));
$('btn-wait-refresh').addEventListener('click', () => { if (onlineMatch?.pending) submitTurn(onlineMatch.pending.finished, onlineMatch.pending.winnerTeam); else pollMatch(true); });
$('btn-wait-menu').addEventListener('click', () => toMenu());
$('btn-wait-play').addEventListener('click', () => { waiting.hidden = true; stopPolling(); if (game) { game.paused = false; lastTs = performance.now(); acc = 0; } });

function startPolling() { stopPolling(); pollTimer = setInterval(() => pollMatch(false), 8000); }
function stopPolling() { if (pollTimer) clearInterval(pollTimer); pollTimer = null; }
async function pollMatch(manual) {
  const o = onlineMatch;
  if (!o || waiting.hidden || o.pending) return;
  try {
    const m = await snigelpost.get(o.id);
    if (m.turn_count > o.match.turn_count || m.status !== o.match.status || (m.guest && !o.match.guest)) {
      stopPolling();
      startOnlineGame(m);
    } else if (manual) $('wait-status').textContent = matchLabel(m);
  } catch (e) { if (manual) $('wait-status').textContent = t('online.error', { msg: e.message }); }
}
addEventListener('visibilitychange', () => { if (!document.hidden) pollMatch(false); });

if (snigelpost.available()) {
  $('online').hidden = false;
  $('opt-name').value = settings.playerName || '';
  $('opt-name').addEventListener('change', () => { settings.playerName = $('opt-name').value.trim().slice(0, 24); saveSettings(settings); });
  $('btn-online-create').addEventListener('click', async () => {
    const b = $('btn-online-create');
    b.disabled = true;
    settings.playerName = $('opt-name').value.trim().slice(0, 24); saveSettings(settings);
    try { const m = await snigelpost.create(+$('opt-per').value, playerName()); await openMatch(m.id); }
    catch (e) { $('online-status').textContent = /anonymous|signup|sign-in|disabled/i.test(e.message) ? t('online.disabled') : t('online.error', { msg: e.message }); }
    b.disabled = false;
  });
  refreshMatchList();
  const joinId = new URLSearchParams(location.search).get('match');
  if (joinId) openMatch(joinId);
}

// ---------- weapons bar ----------
function buildWeaponBar() {
  const box = $('weapons');
  box.innerHTML = '';
  WEAPONS.forEach((w, i) => {
    const b = document.createElement('button');
    b.dataset.id = w.id;
    b.innerHTML = `${w.icon}<small>${i + 1}</small><span class="ammo"></span>`;
    b.title = t('weapon.' + w.id);
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); game?.selectWeapon(w.id); });
    box.appendChild(b);
  });
}

// ---------- input ----------
const keyMap = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  Space: 'fire', Enter: 'jump', ShiftLeft: 'jump', ShiftRight: 'jump',
};
addEventListener('keydown', (e) => {
  if (!game || !menu.hidden) return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  const k = keyMap[e.code];
  if (k) { if (!game.ai) game.input[k] = true; e.preventDefault(); }
  if (e.code === 'Escape') { toMenu(); return; }
  if (game.ai || game.replay) return;
  if (/^Digit[1-6]$/.test(e.code)) game.selectWeapon(WEAPONS[+e.code[5] - 1].id);
  if (e.code === 'Tab') {
    e.preventDefault();
    const ammo = game.active ? game.teams[game.active.team].ammo : {};
    let i = WEAPONS.findIndex((w) => w.id === game.weaponId);
    for (let k = 0; k < WEAPONS.length; k++) {
      i = (i + 1) % WEAPONS.length;
      if (ammo[WEAPONS[i].id] > 0) { game.selectWeapon(WEAPONS[i].id); break; }
    }
  }
});
addEventListener('keyup', (e) => {
  if (!game) return;
  const k = keyMap[e.code];
  if (k && !game.ai) game.input[k] = false;
});
addEventListener('blur', () => { if (game) for (const k in game.input) if (k !== 'weapon') game.input[k] = false; });

// touch buttons
for (const b of document.querySelectorAll('.tbtn')) {
  const key = b.dataset.key;
  const down = (e) => { e.preventDefault(); b.classList.add('down'); if (game && !game.ai) game.input[key] = true; unlockAudio(); };
  const up = (e) => { e.preventDefault(); b.classList.remove('down'); if (game && !game.ai) game.input[key] = false; };
  b.addEventListener('pointerdown', down);
  b.addEventListener('pointerup', up);
  b.addEventListener('pointercancel', up);
  b.addEventListener('pointerleave', up);
  b.addEventListener('contextmenu', (e) => e.preventDefault());
}

// camera drag / pinch / wheel
const camDrag = { active: false, id: null, lx: 0, ly: 0, pinch: null };
const pointers = new Map();
canvas.addEventListener('pointerdown', (e) => {
  if (!game) return;
  unlockAudio();
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  canvas.setPointerCapture(e.pointerId);
  if (pointers.size === 1) { camDrag.active = true; camDrag.lx = e.clientX; camDrag.ly = e.clientY; }
  else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    camDrag.pinch = Math.hypot(a.x - b.x, a.y - b.y);
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (!game || !pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const cam = game.cam;
  if (pointers.size === 2 && camDrag.pinch) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    cam.zoom *= d / camDrag.pinch;
    camDrag.pinch = d;
    cam.manual = true;
    cam.punch = null;
  } else if (camDrag.active) {
    const dx = e.clientX - camDrag.lx, dy = e.clientY - camDrag.ly;
    if (Math.abs(dx) + Math.abs(dy) > 2) cam.manual = true;
    cam.x -= dx / cam.zoom; cam.y -= dy / cam.zoom;
    camDrag.lx = e.clientX; camDrag.ly = e.clientY;
  }
});
const endPointer = (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) camDrag.pinch = null; if (pointers.size === 0) camDrag.active = false; };
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', (e) => {
  if (!game) return;
  e.preventDefault();
  game.cam.zoom *= e.deltaY < 0 ? 1.1 : 0.9;
  game.cam.manual = true;
  game.cam.punch = null;
}, { passive: false });

// ---------- HUD ----------
const windFill = $('wind-fill');
function updateHud(now) {
  if (!game || now - hudLast < 80) return;
  hudLast = now;
  const st = game.hudState();
  const team = $('hud-team');
  if (st.team) { team.textContent = `${st.team.name} · ${st.snail?.name ?? ''}${st.ai ? ' ' + t('hud.ai') : ''}`; team.style.background = st.team.color; }
  const timer = $('hud-timer');
  timer.textContent = st.phase === 'aim' || st.phase === 'retreat' ? Math.ceil(st.timer) : '·';
  timer.classList.toggle('low', st.phase === 'aim' && st.timer < 10);
  $('hud-message').textContent = fmt(st.message);
  const w = Math.abs(st.wind) * 45;
  windFill.style.width = w + 'px';
  windFill.style.left = st.wind >= 0 ? '50%' : `calc(50% - ${w}px)`;
  const rows = $('hud-teams');
  if (rows.childElementCount !== st.teams.length) {
    rows.innerHTML = st.teams.map(() => '<div class="trow"><span class="tname"></span><div class="tbar"><div></div></div><span class="tcount"></span></div>').join('');
  }
  const max = 100 * (game.config.snailsPerTeam || 3);
  st.teams.forEach((tm, i) => {
    const r = rows.children[i];
    r.classList.toggle('dead', tm.alive === 0);
    r.querySelector('.tname').textContent = tm.name;
    const bar = r.querySelector('.tbar > div');
    bar.style.width = (100 * tm.hp) / max + '%';
    bar.style.background = tm.color;
    r.querySelector('.tcount').textContent = `${tm.alive}`;
  });
  for (const b of $('weapons').children) {
    const a = st.ammo ? st.ammo[b.dataset.id] : Infinity;
    b.classList.toggle('sel', b.dataset.id === st.weapon);
    b.querySelector('.ammo').textContent = a === Infinity ? '' : a;
    b.disabled = st.phase !== 'aim' || st.ai || !(a > 0);
  }
  updateTutorial();
}

// ---------- loop ----------
// Fixed-step simulation: the game only ever advances in whole ticks of TICK
// seconds, however fast the display runs. Rendering happens once per frame.
let acc = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  if (!game) return;
  acc += Math.min(0.25, (ts - lastTs) / 1000);
  lastTs = ts;
  let n = 0;
  // window.__manualTick lets tests drive game.tick() themselves
  if (replayUntil) {
    // showing the opponent's turn at triple speed
    for (let i = 0; i < 3 && game.tickCount < replayUntil; i++) game.tick();
    acc = 0;
    if (game.tickCount >= replayUntil) afterReplay();
  } else if (!window.__manualTick) {
    while (acc >= TICK && n < 6) { game.tick(); acc -= TICK; n++; }
    if (n === 6) acc = 0; // tab was hidden or the device is too slow: drop time instead of spiralling
  }
  game.render();
  updateHud(ts);
}
requestAnimationFrame(frame);

// ---------- platform ----------
if (!platform.allowExternalLinks) {
  for (const a of document.querySelectorAll('a[href]')) a.hidden = true;
  $('btn-install').hidden = true;
}
platform.init().then(() => platform.loaded());

// ---------- PWA ----------
let deferredPrompt = null;
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (platform.id === 'web') $('btn-install').hidden = false;
});
$('btn-install').addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $('btn-install').hidden = true;
});
if (platform.useServiceWorker && 'serviceWorker' in navigator && location.protocol !== 'file:') {
  addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(() => {
      $('offline-hint').dataset.ready = '1';
      $('offline-hint').textContent = t('menu.offline');
    }).catch(() => {});
  });
}
