// Synthesized sound effects (no asset files). Everything goes through one
// master gain so volume and mute are a single setting. Sounds are layered
// (noise burst + tone + sub-bass) rather than single beeps.
let ac = null;
let master = null;
let muted = false;
let volume = 0.8;
function ctx() {
  if (typeof window === 'undefined') return null;
  if (!ac) {
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain();
      master.gain.value = muted ? 0 : volume;
      master.connect(ac.destination);
    } catch { return null; }
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}
function applyGain() { if (master) master.gain.setTargetAtTime(muted ? 0 : volume, ac.currentTime, 0.02); }
export function unlockAudio() { ctx(); }
export function setMuted(m) { muted = !!m; applyGain(); }
export function isMuted() { return muted; }
export function setVolume(v) { volume = Math.max(0, Math.min(1, +v || 0)); applyGain(); }
export function getVolume() { return volume; }
const live = () => { const a = ctx(); return a && !muted && volume > 0 ? a : null; };

// A burst of filtered noise. type: lowpass/bandpass/highpass. decay shapes the envelope.
function noise(duration, gainV, freq, decay, type = 'lowpass', q = 1, delay = 0) {
  const a = live();
  if (!a) return;
  const len = Math.floor(a.sampleRate * duration);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = a.createGain();
  g.gain.value = gainV;
  src.connect(f).connect(g).connect(master);
  src.start(a.currentTime + delay);
}
// A tone sliding from freq0 to freq1 with an exponential fade.
function tone(freq0, freq1, duration, type, gainV, delay = 0, attack = 0.005) {
  const a = live();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq0, t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, freq1), t0 + duration);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gainV, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + duration + 0.05);
}
// Sub-bass thump felt more than heard, with a soft attack to avoid clicks.
function thump(size, delay = 0) {
  tone(90 * size, 28, 0.55 * size, 'sine', 0.7, delay, 0.015);
  tone(180, 40, 0.18, 'triangle', 0.25, delay, 0.005);
}

export const sfx = {
  explode(size = 1) {
    thump(size);
    noise(0.12, 0.7, 3500, 2, 'highpass', 0.7); // crack
    noise(0.55 * size, 0.55, 700, 2.2, 'lowpass'); // body
    noise(0.9 * size, 0.25, 260, 1.5, 'lowpass', 0.5, 0.05); // rumble tail
    for (let i = 0; i < 4; i++) noise(0.04, 0.18, 1800 + Math.random() * 2500, 4, 'bandpass', 4, 0.15 + Math.random() * 0.45); // debris
  },
  shoot() { noise(0.18, 0.4, 2200, 3, 'bandpass', 1.2); tone(520, 110, 0.22, 'square', 0.12); thump(0.35); },
  salt() { noise(0.16, 0.4, 5000, 3, 'highpass'); noise(0.3, 0.2, 2500, 2, 'bandpass', 2, 0.05); },
  bounce() { tone(320, 190, 0.09, 'triangle', 0.18); noise(0.05, 0.15, 1500, 3, 'bandpass'); },
  jump() { tone(180, 520, 0.16, 'sine', 0.16); noise(0.08, 0.08, 900, 3); },
  hurt() { tone(520, 190, 0.22, 'sawtooth', 0.1); noise(0.1, 0.15, 1200, 3, 'bandpass', 2); },
  splash() { noise(0.45, 0.45, 1000, 2.2); noise(0.6, 0.2, 400, 1.5, 'lowpass', 1, 0.08); tone(280, 70, 0.32, 'sine', 0.2); },
  tick() { tone(1500, 1400, 0.05, 'square', 0.05); },
  tickLow() { tone(900, 850, 0.06, 'square', 0.06); },
  turn() { tone(480, 760, 0.12, 'sine', 0.12); tone(760, 960, 0.12, 'sine', 0.1, 0.1); },
  splat() { noise(0.14, 0.35, 800, 3); tone(260, 80, 0.2, 'sine', 0.22); },
  // a shell cracking: crunchy noise plus a falling tone
  cracked() { noise(0.08, 0.5, 2600, 2, 'highpass'); noise(0.35, 0.4, 900, 2, 'bandpass', 1.5, 0.03); tone(400, 60, 0.5, 'sawtooth', 0.12, 0.05); thump(0.8, 0.05); },
  // shell shove: a dull thud plus a whip of air
  shove() { thump(0.6); noise(0.12, 0.45, 900, 2.5, 'bandpass', 1.2); noise(0.2, 0.25, 3000, 2, 'highpass', 1, 0.02); },
  // snail hop: a rising sparkle and a soft pop where it lands
  teleport() { tone(300, 1400, 0.35, 'sine', 0.14); tone(600, 2200, 0.3, 'triangle', 0.08, 0.05); noise(0.25, 0.2, 4000, 2, 'highpass', 1, 0.25); tone(500, 180, 0.15, 'sine', 0.15, 0.3); },
  crate() { tone(660, 990, 0.12, 'triangle', 0.15); tone(990, 1320, 0.15, 'triangle', 0.15, 0.09); },
  // the water is rising: two low warning notes
  sudden() { tone(220, 220, 0.25, 'square', 0.1); tone(196, 196, 0.35, 'square', 0.1, 0.3); noise(0.8, 0.15, 500, 1.5, 'lowpass', 1, 0.1); },
  // slow motion kicks in: a falling whoosh
  slowmo() { noise(1.0, 0.25, 1200, 1.2, 'bandpass', 0.8); tone(300, 40, 1.0, 'sine', 0.15, 0, 0.1); },
  win() { tone(400, 800, 0.4, 'triangle', 0.2); tone(600, 1200, 0.5, 'triangle', 0.2, 0.2); tone(800, 1600, 0.7, 'triangle', 0.18, 0.4); },
};
