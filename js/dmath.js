// Engine-independent trig. Math.sin/Math.cos may differ by an ULP between
// JavaScript engines, which is enough to desync a replay. These polynomial
// versions use only +,-,* and / with literal coefficients, so every engine
// produces bit-identical results. Accuracy ~1e-7, plenty for a game.

export const PI = 3.141592653589793;
export const TAU = 6.283185307179586;

function sinReduced(r) {
  // |r| <= PI/2, odd Taylor polynomial to r^11
  const r2 = r * r;
  return r * (1 + r2 * (-1 / 6 + r2 * (1 / 120 + r2 * (-1 / 5040 + r2 * (1 / 362880 + r2 * (-1 / 39916800))))));
}

export function dsin(x) {
  // reduce to r in [-PI/2, PI/2] with sign flip for odd half-turns
  const k = Math.round(x / PI);
  const r = x - k * PI;
  const s = sinReduced(r);
  return (k & 1) ? -s : s;
}

export function dcos(x) {
  return dsin(x + PI / 2);
}

export function dhypot(x, y) {
  return Math.sqrt(x * x + y * y); // sqrt is correctly rounded in IEEE 754
}

// atan2 approximation (used by the AI only, but kept deterministic anyway).
export function datan2(y, x) {
  const ax = Math.abs(x), ay = Math.abs(y);
  const a = Math.min(ax, ay) / (Math.max(ax, ay) || 1);
  const s = a * a;
  let r = ((-0.0464964749 * s + 0.15931422) * s - 0.327622764) * s * a + a;
  if (ay > ax) r = 1.57079637 - r;
  if (x < 0) r = PI - r;
  if (y < 0) r = -r;
  return r;
}
