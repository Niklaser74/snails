// Gamepad support (standard mapping). Polled once per frame; the result is
// written into game.input exactly like the keyboard does, so the simulation
// never knows the difference.
//   d-pad / left stick  walk (or move the marker), aim
//   A                   fire (hold to charge)      B      jump
//   LB / RB             previous / next weapon     right stick  pan the camera
//   Start               menu                        Y      mute
const DEAD = 0.35;
const state = { connected: false, prev: {}, pad: null };

export function gamepadConnected() { return state.connected; }

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
  const ev = { justConnected: !!pad && !was, prevWeapon: false, nextWeapon: false, menu: false, mute: false, any: false, camX: 0, camY: 0 };
  if (!pad) { state.prev = {}; return ev; }
  const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
  const left = pressed(pad, 14) || ax < -DEAD, right = pressed(pad, 15) || ax > DEAD;
  const up = pressed(pad, 12) || ay < -DEAD, down = pressed(pad, 13) || ay > DEAD;
  const fire = pressed(pad, 0), jump = pressed(pad, 1), lb = pressed(pad, 4), rb = pressed(pad, 5), start = pressed(pad, 9), y = pressed(pad, 3);
  const edge = (k, v) => { const e = v && !state.prev[k]; state.prev[k] = v; return e; };
  ev.prevWeapon = edge('lb', lb); ev.nextWeapon = edge('rb', rb); ev.menu = edge('start', start); ev.mute = edge('y', y);
  const jumpEdge = edge('jump', jump);
  ev.any = left || right || up || down || fire || jump || lb || rb || start;
  if (Math.abs(pad.axes[2] || 0) > DEAD) ev.camX = pad.axes[2];
  if (Math.abs(pad.axes[3] || 0) > DEAD) ev.camY = pad.axes[3];
  if (game && canControl) {
    const inp = game.input;
    inp.left = left; inp.right = right; inp.up = up; inp.down = down; inp.fire = fire;
    if (jumpEdge) inp.jump = true;
    state.drove = left || right || up || down || fire;
  } else if (state.drove && game) {
    // the pad let go of everything while control passed on (AI turn, replay): clear what it set
    const inp = game.input; inp.left = inp.right = inp.up = inp.down = inp.fire = false; state.drove = false;
  }
  return ev;
}
