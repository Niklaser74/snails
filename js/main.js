import { Game, WEAPONS } from './game.js';
import { SNAIL_STYLES, TEAM_COLORS } from './snails.js';
import { unlockAudio } from './audio.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const hud = $('hud');
const menu = $('menu');
const help = $('help');
const gameover = $('gameover');

const DEFAULT_TEAM_NAMES = ['Slemligan', 'Skalbaggarna', 'Salta Hundar', 'Turbosniglarna'];
const LS_KEY = 'snackmageddon.settings';

let game = null;
let lastTs = 0;
let hudLast = 0;

// ---------- settings / menu ----------
function loadSettings() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; }
}
function saveSettings(s) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
const settings = Object.assign({ teams: 2, per: 3, style: 'cartoon', rows: [] }, loadSettings());

const styleSel = $('opt-style');
for (const st of SNAIL_STYLES) {
  const o = document.createElement('option');
  o.value = st.id; o.textContent = st.name;
  styleSel.appendChild(o);
}
styleSel.value = settings.style;
$('opt-teams').value = settings.teams;
$('opt-per').value = settings.per;

function renderTeamRows() {
  const n = +$('opt-teams').value;
  const box = $('team-rows');
  box.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const saved = settings.rows[i] || {};
    const row = document.createElement('div');
    row.className = 'team-row';
    row.innerHTML = `
      <div class="swatch" style="background:${TEAM_COLORS[i].hex}"></div>
      <input type="text" maxlength="16" value="${saved.name || DEFAULT_TEAM_NAMES[i]}" aria-label="Lagnamn">
      <select aria-label="Spelare"><option value="human">Människa</option><option value="ai">Dator</option></select>`;
    row.querySelector('select').value = saved.ai ? 'ai' : i === 0 ? 'human' : 'ai';
    box.appendChild(row);
  }
}
renderTeamRows();
$('opt-teams').addEventListener('change', renderTeamRows);

function readConfig() {
  const rows = [...document.querySelectorAll('.team-row')].map((r, i) => ({
    name: r.querySelector('input').value.trim() || DEFAULT_TEAM_NAMES[i],
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

function startGame() {
  unlockAudio();
  const cfg = readConfig();
  game = new Game(canvas, cfg, {
    onGameOver: (winner) => {
      setTimeout(() => {
        $('go-title').textContent = winner ? `${winner.name} vinner!` : 'Oavgjort!';
        gameover.hidden = false;
      }, 2000);
    },
    onTurn: () => { camDrag.active = false; },
  });
  window.__game = game;
  buildWeaponBar();
  menu.hidden = true;
  gameover.hidden = true;
  hud.hidden = false;
  lastTs = performance.now();
  tryFullscreen();
}

$('btn-start').addEventListener('click', startGame);
$('btn-help').addEventListener('click', () => (help.hidden = false));
$('btn-help-close').addEventListener('click', () => (help.hidden = true));
$('btn-again').addEventListener('click', startGame);
$('btn-tomenu').addEventListener('click', () => { gameover.hidden = true; hud.hidden = true; menu.hidden = false; game = null; });
$('btn-menu').addEventListener('click', () => { hud.hidden = true; menu.hidden = false; game = null; });

function tryFullscreen() {
  const el = document.documentElement;
  if (matchMedia('(pointer: coarse)').matches && el.requestFullscreen && !document.fullscreenElement) {
    el.requestFullscreen().catch(() => {});
  }
}

// ---------- weapons bar ----------
function buildWeaponBar() {
  const box = $('weapons');
  box.innerHTML = '';
  WEAPONS.forEach((w, i) => {
    const b = document.createElement('button');
    b.dataset.id = w.id;
    b.innerHTML = `${w.icon}<small>${i + 1}</small>`;
    b.title = w.name;
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
  if (k) { if (!game.ai || k === 'fire') { /* humans only */ } if (!game.ai) game.input[k] = true; e.preventDefault(); }
  if (/^Digit[1-4]$/.test(e.code)) game.selectWeapon(WEAPONS[+e.code[5] - 1].id);
  if (e.code === 'Tab') {
    e.preventDefault();
    const i = WEAPONS.findIndex((w) => w.id === game.weaponId);
    game.selectWeapon(WEAPONS[(i + 1) % WEAPONS.length].id);
  }
  if (e.code === 'Escape') { $('btn-menu').click(); }
});
addEventListener('keyup', (e) => {
  if (!game) return;
  const k = keyMap[e.code];
  if (k && !game.ai) game.input[k] = false;
});
addEventListener('blur', () => { if (game) for (const k in game.input) game.input[k] = false; });

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
}, { passive: false });

// ---------- HUD ----------
const windFill = $('wind-fill');
function updateHud(now) {
  if (!game || now - hudLast < 80) return;
  hudLast = now;
  const st = game.hudState();
  const team = $('hud-team');
  if (st.team) { team.textContent = `${st.team.name} · ${st.snail?.name ?? ''}${st.ai ? ' (dator)' : ''}`; team.style.background = st.team.color; }
  const timer = $('hud-timer');
  timer.textContent = st.phase === 'aim' || st.phase === 'retreat' ? Math.ceil(st.timer) : '·';
  timer.classList.toggle('low', st.phase === 'aim' && st.timer < 10);
  $('hud-message').textContent = st.message;
  const w = Math.abs(st.wind) * 45;
  windFill.style.width = w + 'px';
  windFill.style.left = st.wind >= 0 ? '50%' : `calc(50% - ${w}px)`;
  const rows = $('hud-teams');
  if (rows.childElementCount !== st.teams.length) {
    rows.innerHTML = st.teams.map(() => '<div class="trow"><span class="tname"></span><div class="tbar"><div></div></div><span class="tcount"></span></div>').join('');
  }
  const max = 100 * (game.config.snailsPerTeam || 3);
  st.teams.forEach((t, i) => {
    const r = rows.children[i];
    r.classList.toggle('dead', t.alive === 0);
    r.querySelector('.tname').textContent = t.name;
    const bar = r.querySelector('.tbar > div');
    bar.style.width = (100 * t.hp) / max + '%';
    bar.style.background = t.color;
    r.querySelector('.tcount').textContent = `${t.alive}`;
  });
  for (const b of $('weapons').children) {
    b.classList.toggle('sel', b.dataset.id === st.weapon);
    b.disabled = st.phase !== 'aim' || st.ai;
  }
}

// ---------- loop ----------
function frame(ts) {
  requestAnimationFrame(frame);
  if (!game) return;
  const dt = (ts - lastTs) / 1000;
  lastTs = ts;
  game.update(dt);
  game.render();
  updateHud(ts);
}
requestAnimationFrame(frame);

// ---------- PWA ----------
let deferredPrompt = null;
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  $('btn-install').hidden = false;
});
$('btn-install').addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $('btn-install').hidden = true;
});
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(() => {
      $('offline-hint').textContent = 'Spelet är sparat för offline-spel.';
    }).catch(() => {});
  });
}
