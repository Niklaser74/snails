// Gamepad support (standard mapping). Polled once per frame; the result is
// written into game.input exactly like the keyboard does, so the simulation
// never knows the difference.
//   d-pad / left stick  walk (or move the marker), aim
//   A                   fire (hold to charge)      B      jump
//   LB / RB             previous / next weapon     right stick  pan the camera
//   Start               menu                        Y      mute
// Browsers (and Android TVs, Bluetooth remotes, some HID devices) may report a
// pad that nobody is holding. The pad therefore only writes the fields it
// changes itself; the keyboard and the touch buttons keep working alongside it.
const DEAD = 0.35;
const KEYS = ['left', 'right', 'up', 'down', 'fire'];
const state = { connected: false, active: false, prev: {}, pad: null };

export function gamepadConnected() { return state.connected; }
export function gamepadActive() { return state.active; }

function getPad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) if (p && p.connected) return p;
  return null;
}
const pressed = (pad, i) => !!(pad.buttons[i] && (pad.buttons[i].pressed || pad.buttons[i].value > 0.5));

// Returns the edge-triggered events of this frame: { prevWeapon, nextWeapon, menu, mute, any }
export function pollGamepad(game, canControl) {
  const pad = getPad();
  const was = state.connected;
  state.connected = !!pad;
  const ev = { justConnected: false, prevWeapon: false, nextWeapon: false, menu: false, mute: false, any: false, camX: 0, camY: 0 };
  if (!pad) { state.prev = {}; state.active = false; return ev; }
  const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
  const left = pressed(pad, 14) || ax < -DEAD, right = pressed(pad, 15) || ax > DEAD;
  const up = pressed(pad, 12) || ay < -DEAD, down = pressed(pad, 13) || ay > DEAD;
  const fire = pressed(pad, 0), jump = pressed(pad, 1), lb = pressed(pad, 4), rb = pressed(pad, 5), start = pressed(pad, 9), y = pressed(pad, 3);
  const edge = (k, v) => { const e = v && !state.prev[k]; state.prev[k] = v; return e; };
  ev.prevWeapon = edge('lb', lb); ev.nextWeapon = edge('rb', rb); ev.menu = edge('start', start); ev.mute = edge('y', y);
  const jumpEdge = edge('jump', jump);
  ev.any = left || right || up || down || fire || jump || lb || rb || start || y;
  if (Math.abs(pad.axes[2] || 0) > DEAD) ev.camX = pad.axes[2];
  if (Math.abs(pad.axes[3] || 0) > DEAD) ev.camY = pad.axes[3];
  // "connected" means someone is actually pressing it, not that the browser lists it
  if ((ev.any || ev.camX || ev.camY) && !state.active) { state.active = true; ev.justConnected = true; }
  const now = { left, right, up, down, fire };
  if (game && canControl) {
    const inp = game.input;
    for (const k of KEYS) if (now[k] !== !!state.prev[k]) inp[k] = now[k]; // edges only: never clobber keyboard or touch
    if (jumpEdge) inp.jump = true;
  } else if (game) {
    // control passed on (AI turn, replay, menu) while the pad held something: release what it set
    for (const k of KEYS) if (state.prev[k]) game.input[k] = false;
  }
  for (const k of KEYS) state.prev[k] = now[k];
  return ev;
}
