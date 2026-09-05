// Destructible terrain. The collision mask is computed analytically (height
// map, cave discs, island ellipses, explosion discs) so that it is identical on
// every device. The canvas is only a picture of the mask and is skipped in
// headless mode (Node, tests, server-side verification).
import { dsin } from './dmath.js';
import { THEMES, paintDecorations } from './themes.js';

export class Terrain {
  constructor(width, height, rng, { headless = false, theme = THEMES.garden } = {}) {
    this.theme = theme;
    this.w = width;
    this.h = height;
    this.rng = rng;
    this.mask = new Uint8Array(width * height);
    this.heights = new Int32Array(width);
    this.canvas = null;
    this.ctx = null;
    if (!headless) {
      this.canvas = document.createElement('canvas');
      this.canvas.width = width;
      this.canvas.height = height;
      this.ctx = this.canvas.getContext('2d');
    }
    this.generate();
  }

  generate() {
    const { w, h, rng } = this;
    // ---- height map (integers, engine-independent sin) ----
    const base = h * 0.58;
    const waves = [];
    for (let i = 0; i < 5; i++) {
      waves.push({ amp: (h * 0.16) / (i + 1), freq: (6.283185307179586 * (1 + i * 1.7)) / w, phase: rng() * 6.283185307179586 });
    }
    const skew = rng() * 0.3 - 0.15;
    for (let x = 0; x < w; x++) {
      let y = base + skew * (x - w / 2);
      for (const wv of waves) y += dsin(x * wv.freq + wv.phase) * wv.amp;
      this.heights[x] = Math.round(Math.min(h * 0.85, Math.max(h * 0.25, y)));
    }
    // ---- mask from height map ----
    this.mask.fill(0);
    for (let x = 0; x < w; x++) {
      for (let y = this.heights[x]; y < h; y++) this.mask[y * w + x] = 1;
    }
    // ---- visuals ----
    if (this.ctx) this.paintBase();

    // caves: consume rng in a fixed order regardless of headless
    const caves = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < caves; i++) {
      const x = Math.round(w * (0.1 + rng() * 0.8));
      const y = Math.round(this.heights[x] + 40 + rng() * (h * 0.3));
      const r = Math.round(22 + rng() * 26);
      this.explode(x, y, r, false);
    }
    // floating islands
    const islands = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < islands; i++) {
      const x = Math.round(w * (0.1 + rng() * 0.8));
      const y = Math.round(this.heights[x] - 110 - rng() * 100);
      const rw = Math.round(50 + rng() * 70);
      if (y < 40) continue;
      this.addIsland(x, y, rw);
    }
  }

  paintBase() {
    const { ctx, w, h, rng } = this;
    const th = this.theme;
    ctx.clearRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, h * 0.25, 0, h);
    g.addColorStop(0, th.soil[0]);
    g.addColorStop(0.5, th.soil[1]);
    g.addColorStop(1, th.soil[2]);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x < w; x++) ctx.lineTo(x, this.heights[x]);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
    // speckles use Math.random on purpose: purely decorative, must not touch the sim rng
    ctx.fillStyle = th.speckle;
    for (let i = 0; i < w * 0.6; i++) {
      const x = Math.random() * w;
      const top = this.heights[Math.floor(x)];
      ctx.fillRect(x, top + Math.random() * (h - top), 2 + Math.random() * 3, 1 + Math.random() * 2);
    }
    ctx.fillStyle = th.glint;
    for (let i = 0; i < w * 0.3; i++) {
      const x = Math.random() * w;
      const top = this.heights[Math.floor(x)];
      ctx.fillRect(x, top + Math.random() * (h - top), 3, 1);
    }
    // grass: drawn from the height line downward so the picture matches the mask
    ctx.lineJoin = 'round';
    ctx.strokeStyle = th.edge[0];
    ctx.lineWidth = 8;
    ctx.beginPath();
    for (let x = 0; x < w; x++) x === 0 ? ctx.moveTo(x, this.heights[x] + 4) : ctx.lineTo(x, this.heights[x] + 4);
    ctx.stroke();
    ctx.strokeStyle = th.edge[1];
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = 0; x < w; x++) x === 0 ? ctx.moveTo(x, this.heights[x] + 1.5) : ctx.lineTo(x, this.heights[x] + 1.5);
    ctx.stroke();
    paintDecorations(ctx, th, this.heights, w);
    void rng;
  }

  addIsland(cx, cy, rw) {
    const ry = 12, yc = cy + 8;
    const { w, h } = this;
    const x0 = Math.max(0, cx - rw), x1 = Math.min(w - 1, cx + rw);
    const y0 = Math.max(0, yc - ry), y1 = Math.min(h - 1, yc + ry);
    for (let y = y0; y <= y1; y++) {
      const dy = (y - yc) / ry;
      for (let x = x0; x <= x1; x++) {
        const dx = (x - cx) / rw;
        if (dx * dx + dy * dy <= 1) this.mask[y * w + x] = 1;
      }
    }
    if (this.ctx) {
      const ctx = this.ctx;
      ctx.fillStyle = this.theme.island[0];
      ctx.beginPath(); ctx.ellipse(cx, yc, rw, ry, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = this.theme.island[1];
      ctx.beginPath(); ctx.ellipse(cx, cy + 2, rw, 6, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  solid(x, y) {
    x |= 0;
    y |= 0;
    if (x < 0 || x >= this.w) return true; // walls at world edge
    if (y < 0 || y >= this.h) return false;
    return this.mask[y * this.w + x] === 1;
  }

  // Remove a disc of terrain.
  explode(cx, cy, r, scorch = true) {
    const { w, h } = this;
    const x0 = Math.max(0, Math.floor(cx - r - 1));
    const x1 = Math.min(w - 1, Math.ceil(cx + r + 1));
    const y0 = Math.max(0, Math.floor(cy - r - 1));
    const y1 = Math.min(h - 1, Math.ceil(cy + r + 1));
    const r2 = r * r;
    for (let y = y0; y <= y1; y++) {
      const dy = y - cy;
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        if (dx * dx + dy * dy <= r2) this.mask[y * w + x] = 0;
      }
    }
    if (!this.ctx) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (scorch) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      ctx.strokeStyle = 'rgba(30,15,5,0.7)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // First solid row at or below y within maxDrop, or -1.
  groundBelow(x, y, maxDrop = 2000) {
    const end = Math.min(this.h, y + maxDrop);
    for (let yy = Math.floor(y); yy < end; yy++) if (this.solid(x, yy)) return yy;
    return -1;
  }
}
