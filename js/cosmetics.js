// Cosmetics: shell patterns and hats for your own snails. Purely visual, so
// they never touch the simulation or its hash. Which ones a player may use
// is decided by the server (snails_unlocked in supabase/migrations); the
// thresholds here are the same numbers, used for the labels in the menu.
export const SHELLS = [
  { id: 'spiral', free: true },
  { id: 'stripes', free: true },
  { id: 'dots', free: true },
  { id: 'stars', need: { dailyBest: 250 } },
  { id: 'flame', need: { wins: 5 } },
  { id: 'gold', premium: true },
  { id: 'confetti', award: 'daily' }, // top three in shot of the day season points
];
export const HATS = [
  { id: 'none', free: true },
  { id: 'cap', free: true },
  { id: 'party', free: true },
  { id: 'crown', need: { wins: 10 } },
  { id: 'viking', need: { dailyBest: 350 } },
  { id: 'tophat', premium: true },
  { id: 'laurel', award: 'rank' }, // top three in season rating
];
export const DEFAULT_LOOK = { shell: 'spiral', hat: 'none' };

// same rule as the server: free ones always, earned ones by stats, premium never (yet)
export function unlockedFor(stats = {}, extra = []) {
  const ok = (c) => c.free || (c.need && ((c.need.wins && (stats.wins || 0) >= c.need.wins) || (c.need.dailyBest && (stats.dailyBest || 0) >= c.need.dailyBest)));
  return [...SHELLS, ...HATS].filter(ok).map((c) => c.id).concat(extra.filter((id) => [...SHELLS, ...HATS].some((c) => c.id === id)));
}
export function normalizeLook(look, unlocked) {
  const l = { ...DEFAULT_LOOK, ...(look || {}) };
  if (!SHELLS.some((s) => s.id === l.shell) || (unlocked && !unlocked.includes(l.shell))) l.shell = 'spiral';
  if (!HATS.some((h) => h.id === l.hat) || (unlocked && !unlocked.includes(l.hat))) l.hat = 'none';
  return l;
}

// ---------- drawing ----------
// Called by drawSnail after the style has drawn the snail (foot centre at 0,0,
// facing right). Every style has its shell around (-6,-15) with radius ~13.
const SHELL = { x: -6, y: -15, r: 13.5 };

export function drawShellPattern(ctx, look, teamColor) {
  const p = look?.shell || 'spiral';
  if (p === 'spiral') return;
  ctx.save();
  ctx.beginPath(); ctx.arc(SHELL.x, SHELL.y, SHELL.r - 1, 0, Math.PI * 2); ctx.clip();
  if (p === 'stripes') {
    ctx.strokeStyle = 'rgba(255,243,214,0.85)'; ctx.lineWidth = 3;
    for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(SHELL.x + i * 7 - 14, SHELL.y + 14); ctx.lineTo(SHELL.x + i * 7 + 2, SHELL.y - 14); ctx.stroke(); }
  } else if (p === 'dots') {
    ctx.fillStyle = 'rgba(255,243,214,0.9)';
    for (const [dx, dy, r] of [[-6, -7, 2.6], [3, -2, 2.2], [-9, 3, 2], [1, 7, 2.4], [7, -9, 1.6], [-1, -13, 1.5]]) { ctx.beginPath(); ctx.arc(SHELL.x + dx, SHELL.y + dy, r, 0, Math.PI * 2); ctx.fill(); }
  } else if (p === 'stars') {
    ctx.fillStyle = '#fff3a0';
    for (const [dx, dy, r] of [[-5, -6, 4], [5, 2, 3], [-8, 5, 2.5], [2, -11, 2]]) star(ctx, SHELL.x + dx, SHELL.y + dy, r);
  } else if (p === 'flame') {
    const g = ctx.createLinearGradient(SHELL.x, SHELL.y + 12, SHELL.x, SHELL.y - 12);
    g.addColorStop(0, 'rgba(255,90,30,0.95)'); g.addColorStop(0.6, 'rgba(255,200,40,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(SHELL.x - 13, SHELL.y + 13);
    for (let i = 0; i <= 6; i++) { const x = SHELL.x - 13 + i * 4.4; ctx.quadraticCurveTo(x + 1.5, SHELL.y - 4 - (i % 2) * 8, x + 4.4, SHELL.y + 2 + (i % 2) * 3); }
    ctx.lineTo(SHELL.x + 13, SHELL.y + 13); ctx.closePath(); ctx.fill();
  } else if (p === 'confetti') {
    const cols = ['#ff5fa2', '#ffe14d', '#4fc3f7', '#7ccf3a', '#ff8a3c'];
    for (let i = 0; i < 14; i++) {
      const a = (i * 2.4) % (Math.PI * 2), rr = 3 + ((i * 5) % 9);
      ctx.fillStyle = cols[i % cols.length];
      ctx.save(); ctx.translate(SHELL.x + Math.cos(a) * rr, SHELL.y + Math.sin(a) * rr); ctx.rotate(a);
      ctx.fillRect(-2.2, -1.2, 4.4, 2.4); ctx.restore();
    }
  } else if (p === 'gold') {
    const g = ctx.createRadialGradient(SHELL.x - 4, SHELL.y - 6, 2, SHELL.x, SHELL.y, 14);
    g.addColorStop(0, '#fff6c0'); g.addColorStop(0.5, '#f2c94c'); g.addColorStop(1, '#b8860b');
    ctx.fillStyle = g; ctx.fillRect(SHELL.x - 14, SHELL.y - 14, 28, 28);
    ctx.strokeStyle = 'rgba(120,80,0,0.6)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(SHELL.x, SHELL.y, 8, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(SHELL.x, SHELL.y, 4, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
  // keep the team readable: a thin ring in the team colour
  if (p === 'gold' || p === 'flame') { ctx.strokeStyle = teamColor; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(SHELL.x, SHELL.y, SHELL.r - 1.2, 0, Math.PI * 2); ctx.stroke(); }
}

// Cracks in the shell as the snail takes damage: one below 70 hp, two below
// 45, a missing chip below 25. Visual only.
export function drawCracks(ctx, hp, outline = '#3a2210') {
  if (hp == null || hp >= 70) return;
  const { x, y } = SHELL;
  ctx.save();
  ctx.strokeStyle = outline; ctx.lineWidth = 1.3; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x + 2, y - 12); ctx.lineTo(x - 1, y - 6); ctx.lineTo(x + 3, y - 2); ctx.lineTo(x + 1, y + 3); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - 1, y - 6); ctx.lineTo(x - 5, y - 4); ctx.stroke();
  if (hp < 45) {
    ctx.beginPath(); ctx.moveTo(x - 12, y - 2); ctx.lineTo(x - 7, y + 1); ctx.lineTo(x - 8, y + 6); ctx.lineTo(x - 3, y + 9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 7, y + 1); ctx.lineTo(x - 3, y - 1); ctx.stroke();
  }
  if (hp < 25) {
    // a chip missing at the rim: shows the soft body underneath
    ctx.fillStyle = '#e0a878';
    ctx.beginPath(); ctx.moveTo(x + 9, y - 10); ctx.lineTo(x + 13, y - 6); ctx.lineTo(x + 12, y - 1); ctx.lineTo(x + 7, y - 4); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 7, y - 4); ctx.lineTo(x + 3, y + 4); ctx.stroke();
  }
  ctx.restore();
}

export function drawHat(ctx, look, outline = '#4a2e1c') {
  const h = look?.hat || 'none';
  if (h === 'none') return;
  const x = SHELL.x, top = SHELL.y - SHELL.r; // top of the shell
  ctx.save();
  ctx.strokeStyle = outline; ctx.lineWidth = 1.4; ctx.lineJoin = 'round';
  if (h === 'cap') {
    ctx.fillStyle = '#2f6fdd';
    ctx.beginPath(); ctx.arc(x, top + 3, 9, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1f4aa0';
    ctx.beginPath(); ctx.moveTo(x + 4, top + 3); ctx.lineTo(x + 16, top + 5); ctx.lineTo(x + 14, top + 7.5); ctx.lineTo(x + 3, top + 6); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (h === 'party') {
    ctx.fillStyle = '#ff5fa2';
    ctx.beginPath(); ctx.moveTo(x - 8, top + 4); ctx.lineTo(x + 8, top + 4); ctx.lineTo(x + 1, top - 16); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffe14d';
    for (const [dx, dy] of [[-2, -2], [3, -6], [-1, -10]]) { ctx.beginPath(); ctx.arc(x + dx, top + dy, 1.6, 0, Math.PI * 2); ctx.fill(); }
    ctx.beginPath(); ctx.arc(x + 1, top - 16, 2.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  } else if (h === 'crown') {
    ctx.fillStyle = '#f2c94c';
    ctx.beginPath(); ctx.moveTo(x - 9, top + 5); ctx.lineTo(x - 9, top - 6); ctx.lineTo(x - 4, top - 1); ctx.lineTo(x, top - 9); ctx.lineTo(x + 4, top - 1); ctx.lineTo(x + 9, top - 6); ctx.lineTo(x + 9, top + 5); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e2453c';
    for (const dx of [-5, 0, 5]) { ctx.beginPath(); ctx.arc(x + dx, top + 2, 1.5, 0, Math.PI * 2); ctx.fill(); }
  } else if (h === 'viking') {
    ctx.fillStyle = '#8d8d8d';
    ctx.beginPath(); ctx.arc(x, top + 4, 10, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff3d6';
    for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + d * 8, top + 2); ctx.quadraticCurveTo(x + d * 16, top - 2, x + d * 13, top - 12); ctx.quadraticCurveTo(x + d * 12, top - 4, x + d * 6, top - 2); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    ctx.strokeStyle = '#555'; ctx.beginPath(); ctx.moveTo(x - 10, top + 3); ctx.lineTo(x + 10, top + 3); ctx.stroke();
  } else if (h === 'laurel') {
    ctx.fillStyle = '#4caf50'; ctx.strokeStyle = '#2e7d32'; ctx.lineWidth = 1;
    for (const d of [-1, 1]) for (let i = 0; i < 4; i++) {
      const a = Math.PI + d * (0.35 + i * 0.4), r = SHELL.r + 1;
      const cx = SHELL.x + Math.cos(a) * r, cy = SHELL.y + Math.sin(a) * r;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(a + Math.PI / 2 + d * 0.5);
      ctx.beginPath(); ctx.ellipse(0, 0, 4.5, 2.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
    }
    ctx.fillStyle = '#f2c94c'; ctx.beginPath(); ctx.arc(x, top - 1, 2.2, 0, Math.PI * 2); ctx.fill();
  } else if (h === 'tophat') {
    ctx.fillStyle = '#222';
    ctx.fillRect(x - 11, top + 2, 22, 3); ctx.strokeRect(x - 11, top + 2, 22, 3);
    ctx.fillRect(x - 7, top - 14, 14, 16); ctx.strokeRect(x - 7, top - 14, 14, 16);
    ctx.fillStyle = '#e2453c'; ctx.fillRect(x - 7, top - 2, 14, 3);
  }
  ctx.restore();
}

function star(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill();
}
