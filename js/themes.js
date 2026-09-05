// Terrain themes: colours and decorations for the ground, sky, water and
// backdrop. Purely visual, so the collision mask and the simulation never
// see them. "auto" picks a theme from the match seed, so both players in a
// Snigelpost match get the same one.
export const THEMES = {
  garden: {
    id: 'garden',
    soil: ['#8b5a34', '#6e4324', '#4a2c16'], speckle: 'rgba(0,0,0,0.12)', glint: 'rgba(255,220,160,0.10)',
    edge: ['#3f8f3b', '#6cc25a'], island: ['#6e4324', '#5bb04f'],
    sky: ['#5fb0ea', '#bfe3ff', '#f6e6c8'], sun: 'rgba(255,240,180,0.9)', hills: ['#9fcfe8', '#7fb98a'],
    cloud: 'rgba(255,255,255,0.85)', water: ['rgba(40,120,220,0.55)', 'rgba(30,90,200,0.55)'],
    slime: '190,255,150', deco: 'flowers',
  },
  beach: {
    id: 'beach',
    soil: ['#efd9a0', '#dcbb72', '#b8924a'], speckle: 'rgba(120,80,20,0.10)', glint: 'rgba(255,255,255,0.22)',
    edge: ['#d9b96f', '#fff0c2'], island: ['#dcbb72', '#f6e7b8'],
    sky: ['#3f9be0', '#a9dcff', '#ffe9c4'], sun: 'rgba(255,250,200,0.95)', hills: ['#8fd0f0', '#5ec6d6'],
    cloud: 'rgba(255,255,255,0.9)', water: ['rgba(40,190,210,0.55)', 'rgba(20,150,190,0.6)'],
    slime: '200,240,220', deco: 'palms',
  },
  jungle: {
    id: 'jungle',
    soil: ['#5a3b22', '#3e2915', '#2a1a0d'], speckle: 'rgba(0,0,0,0.18)', glint: 'rgba(120,200,90,0.12)',
    edge: ['#1f6b2a', '#3fa63a'], island: ['#3e2915', '#2f8a3a'],
    sky: ['#2e7d5b', '#9fd6a8', '#dfeec0'], sun: 'rgba(255,255,220,0.6)', hills: ['#4d9a6a', '#2f6b47'],
    cloud: 'rgba(255,255,255,0.55)', water: ['rgba(30,110,90,0.6)', 'rgba(20,80,70,0.65)'],
    slime: '170,255,120', deco: 'ferns',
  },
};
export const THEME_IDS = Object.keys(THEMES);
export function themeFor(seed, setting = 'auto') {
  if (THEMES[setting]) return THEMES[setting];
  return THEMES[THEME_IDS[Math.abs(seed | 0) % THEME_IDS.length]];
}

// Decorations painted onto the terrain picture along the surface. They use
// Math.random on purpose (decorative), and blow away with the ground.
export function paintDecorations(ctx, theme, heights, w) {
  const R = Math.random;
  for (let x = 40 + R() * 60; x < w - 40; x += 70 + R() * 90) {
    const xi = Math.floor(x), y = heights[xi];
    if (heights[Math.min(w - 1, xi + 12)] - y > 14 || y - heights[Math.max(0, xi - 12)] > 14) continue; // too steep
    if (theme.deco === 'flowers') flower(ctx, x, y + 1, R);
    else if (theme.deco === 'palms') (R() < 0.35 ? palm(ctx, x, y + 2, R) : shell(ctx, x, y + 1, R));
    else fern(ctx, x, y + 1, R);
  }
}
function flower(ctx, x, y, R) {
  const col = ['#ff6b8a', '#ffd166', '#c084fc', '#ffffff'][Math.floor(R() * 4)];
  ctx.strokeStyle = '#2f7a2b'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 2, y - 6, x, y - 11); ctx.stroke();
  ctx.fillStyle = col;
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 3, y - 11 + Math.sin(a) * 3, 2.2, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#ffb300'; ctx.beginPath(); ctx.arc(x, y - 11, 1.6, 0, Math.PI * 2); ctx.fill();
}
function palm(ctx, x, y, R) {
  const h = 34 + R() * 22, lean = (R() - 0.5) * 14;
  ctx.strokeStyle = '#8d6e3f'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + lean * 0.4, y - h * 0.6, x + lean, y - h); ctx.stroke();
  ctx.strokeStyle = '#2f9e44'; ctx.lineWidth = 3;
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI * 0.9 + (i / 5) * Math.PI * 0.8;
    ctx.beginPath(); ctx.moveTo(x + lean, y - h); ctx.quadraticCurveTo(x + lean + Math.cos(a) * 14, y - h + Math.sin(a) * 14 - 6, x + lean + Math.cos(a) * 22, y - h + Math.sin(a) * 22 + 6); ctx.stroke();
  }
  ctx.fillStyle = '#6d4c1e'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x + lean - 3 + i * 3, y - h + 3, 2.2, 0, Math.PI * 2); ctx.fill(); }
}
function shell(ctx, x, y, R) {
  ctx.fillStyle = ['#ffe0c2', '#f7c7c2', '#fff3d6'][Math.floor(R() * 3)]; ctx.strokeStyle = '#b08968'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(x, y, 4, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); for (let i = -2; i <= 2; i++) { ctx.moveTo(x, y); ctx.lineTo(x + i * 1.6, y - 3.6); } ctx.stroke();
}
function fern(ctx, x, y, R) {
  const n = 3 + Math.floor(R() * 3);
  ctx.strokeStyle = '#2f8a3a'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.45, len = 14 + R() * 12;
    const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.cos(a) * len * 0.5, ey - 4, ex, ey); ctx.stroke();
    ctx.fillStyle = '#3fa63a';
    for (let k = 1; k <= 3; k++) { const t = k / 4; ctx.beginPath(); ctx.ellipse(x + (ex - x) * t, y + (ey - y) * t, 3, 1.4, a, 0, Math.PI * 2); ctx.fill(); }
  }
}
