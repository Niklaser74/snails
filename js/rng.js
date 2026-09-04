// Deterministic helpers: seeded PRNG, shuffle and state hashing.
// Everything here uses only integer/IEEE arithmetic, so results are identical
// in every JavaScript engine.

export function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher–Yates with the given rng. Array.prototype.sort with a random
// comparator is NOT deterministic across engines, so never use that.
export function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

// Incremental FNV-1a (32-bit) hasher.
export class Hasher {
  constructor() { this.h = 0x811c9dc5; this.f64 = new Float64Array(1); this.u32 = new Uint32Array(this.f64.buffer); }
  byte(b) { this.h = Math.imul(this.h ^ (b & 255), 0x01000193) >>> 0; return this; }
  u32v(v) { v >>>= 0; return this.byte(v).byte(v >>> 8).byte(v >>> 16).byte(v >>> 24); }
  int(v) { return this.u32v(v | 0); }
  num(v) { this.f64[0] = v; return this.u32v(this.u32[0]).u32v(this.u32[1]); }
  bytes(arr) {
    let h = this.h;
    for (let i = 0; i < arr.length; i++) h = Math.imul(h ^ arr[i], 0x01000193) >>> 0;
    this.h = h;
    return this;
  }
  hex() { return this.h.toString(16).padStart(8, '0'); }
}
