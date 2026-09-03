// Destructible terrain backed by an offscreen canvas + a solid-pixel mask.

export class Terrain {
  constructor(width, height, rng) {
    this.w = width;
    this.h = height;
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.mask = new Uint8Array(width * height);
    this.rng = rng;
    this.heights = new Float32Array(width);
    this.generate();
  }

  generate() {
    const { w, h, rng, ctx } = this;
    // layered sines for rolling hills
    const base = h * 0.58;
    const waves = [];
    for (let i = 0; i < 5; i++) {
      waves.push({
        amp: (h * 0.16) / (i + 1),
        freq: (Math.PI * 2 * (1 + i * 1.7)) / w,
        phase: rng() * Math.PI * 2,
      });
    }
    const skew = rng() * 0.3 - 0.15;
    for (let x = 0; x < w; x++) {
      let y = base + skew * (x - w / 2);
      for (const wv of waves) y += Math.sin(x * wv.freq + wv.phase) * wv.amp;
      this.heights[x] = Math.min(h * 0.85, Math.max(h * 0.25, y));
    }

    // fill
    ctx.clearRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, h * 0.25, 0, h);
    g.addColorStop(0, '#8b5a34');
    g.addColorStop(0.5, '#6e4324');
    g.addColorStop(1, '#4a2c16');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x < w; x++) ctx.lineTo(x, this.heights[x]);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    // speckles
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let i = 0; i < w * 0.6; i++) {
      const x = rng() * w;
      const y = this.heights[Math.floor(x)] + rng() * (h - this.heights[Math.floor(x)]);
      ctx.fillRect(x, y, 2 + rng() * 3, 1 + rng() * 2);
    }
    ctx.fillStyle = 'rgba(255,220,160,0.10)';
    for (let i = 0; i < w * 0.3; i++) {
      const x = rng() * w;
      const y = this.heights[Math.floor(x)] + rng() * (h - this.heights[Math.floor(x)]);
      ctx.fillRect(x, y, 3, 1);
    }

    // grass on top
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#3f8f3b';
    ctx.lineWidth = 8;
    ctx.beginPath();
    for (let x = 0; x < w; x++) x === 0 ? ctx.moveTo(x, this.heights[x] + 2) : ctx.lineTo(x, this.heights[x] + 2);
    ctx.stroke();
    ctx.strokeStyle = '#6cc25a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = 0; x < w; x++) x === 0 ? ctx.moveTo(x, this.heights[x]) : ctx.lineTo(x, this.heights[x]);
    ctx.stroke();

    this.rebuildMask();

    // a few caves / cutouts for variety
    const caves = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < caves; i++) {
      const x = w * (0.1 + rng() * 0.8);
      const y = this.heights[Math.floor(x)] + 40 + rng() * (h * 0.3);
      this.explode(x, y, 22 + rng() * 26, false);
    }
    // small floating islands
    const islands = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < islands; i++) {
      const x = w * (0.1 + rng() * 0.8);
      const y = this.heights[Math.floor(x)] - 110 - rng() * 100;
      if (y < 40) continue;
      const rw = 50 + rng() * 70;
      ctx.fillStyle = '#6e4324';
      ctx.beginPath();
      ctx.ellipse(x, y + 8, rw, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5bb04f';
      ctx.beginPath();
      ctx.ellipse(x, y + 2, rw, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      this.rebuildMask(Math.floor(x - rw - 2), Math.floor(y - 12), Math.ceil(rw * 2 + 4), 32);
    }
  }

  rebuildMask(x0 = 0, y0 = 0, rw = this.w, rh = this.h) {
    const data = this.ctx.getImageData(x0, y0, rw, rh).data;
    for (let y = 0; y < rh; y++) {
      for (let x = 0; x < rw; x++) {
        this.mask[(y0 + y) * this.w + (x0 + x)] = data[(y * rw + x) * 4 + 3] > 40 ? 1 : 0;
      }
    }
  }

  solid(x, y) {
    x |= 0;
    y |= 0;
    if (x < 0 || x >= this.w) return true; // walls at world edge
    if (y < 0) return false;
    if (y >= this.h) return false;
    return this.mask[y * this.w + x] === 1;
  }

  // Remove a disc of terrain. Returns nothing.
  explode(cx, cy, r, scorch = true) {
    const { ctx, w, h } = this;
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
    const x0 = Math.max(0, Math.floor(cx - r - 3));
    const x1 = Math.min(w - 1, Math.ceil(cx + r + 3));
    const y0 = Math.max(0, Math.floor(cy - r - 3));
    const y1 = Math.min(h - 1, Math.ceil(cy + r + 3));
    const r2 = r * r;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= r2) this.mask[y * w + x] = 0;
      }
    }
  }

  // Find the ground y (first solid pixel) below (x, y) within maxDrop, or -1.
  groundBelow(x, y, maxDrop = 2000) {
    for (let yy = Math.floor(y); yy < Math.min(this.h, y + maxDrop); yy++) {
      if (this.solid(x, yy)) return yy;
    }
    return -1;
  }
}
