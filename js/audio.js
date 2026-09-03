// Tiny synthesized sound effects (no asset files needed).
let ac = null;
let muted = false;
function ctx() {
  if (!ac) {
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}
export function unlockAudio() { ctx(); }
export function setMuted(m) { muted = m; }
export function isMuted() { return muted; }

function noise(duration, gainV, filterFreq, decay) {
  const a = ctx();
  if (!a || muted) return;
  const len = Math.floor(a.sampleRate * duration);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = filterFreq;
  const g = a.createGain();
  g.gain.value = gainV;
  src.connect(f).connect(g).connect(a.destination);
  src.start();
}
function tone(freq0, freq1, duration, type, gainV) {
  const a = ctx();
  if (!a || muted) return;
  const o = a.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq0, a.currentTime);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, freq1), a.currentTime + duration);
  const g = a.createGain();
  g.gain.setValueAtTime(gainV, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + duration);
  o.connect(g).connect(a.destination);
  o.start();
  o.stop(a.currentTime + duration);
}

export const sfx = {
  explode(size = 1) { noise(0.5 * size, 0.6, 600, 2); tone(120, 30, 0.4 * size, 'sine', 0.5); },
  shoot() { noise(0.15, 0.3, 2500, 3); tone(400, 120, 0.15, 'square', 0.15); },
  salt() { noise(0.12, 0.35, 4000, 4); },
  bounce() { tone(300, 200, 0.08, 'triangle', 0.15); },
  jump() { tone(200, 500, 0.15, 'sine', 0.15); },
  hurt() { tone(500, 200, 0.2, 'sawtooth', 0.12); },
  splash() { noise(0.4, 0.4, 900, 2.5); tone(300, 80, 0.3, 'sine', 0.2); },
  tick() { tone(1200, 1200, 0.04, 'square', 0.05); },
  turn() { tone(500, 800, 0.12, 'sine', 0.12); },
  win() { tone(400, 800, 0.4, 'triangle', 0.2); setTimeout(() => tone(600, 1200, 0.5, 'triangle', 0.2), 200); },
};
