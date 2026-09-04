import { Game, WEAPONS, TICK } from './game.js';
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
  if (game && game.phase !== 'over') { reportAbandon(); platform.gameplayStop(); }
  gameover.hidden = true;
  hud.hidden = true;
  menu.hidden = false;
  game = null;
  window.__game = null;
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
  if (!window.__manualTick) {
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
