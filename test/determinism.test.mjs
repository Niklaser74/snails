// Determinism tests for the simulation. Runs headless in Node: no canvas, no DOM.
//   node test/determinism.test.mjs
import assert from 'node:assert/strict';
import { Game, RULES_VERSION } from '../js/game.js';

const cfg = (seed) => ({
  seed,
  snailsPerTeam: 2,
  teams: [
    { name: 'Slemligan', color: '#e2453c', ai: true },
    { name: 'Skalbaggarna', color: '#3b82f6', ai: true },
  ],
});

// Play `ticks` ticks (or until the match ends). Returns the game and the
// state hash at every turn change plus the final one.
function run(game, ticks) {
  const hashes = [];
  let lastTurn = game.turnCount;
  for (let i = 0; i < ticks; i++) {
    game.tick();
    if (game.turnCount !== lastTurn) { hashes.push(game.stateHash()); lastTurn = game.turnCount; }
    if (game.phase === 'over') break;
  }
  hashes.push(game.stateHash());
  return hashes;
}

const TICKS = 60 * 240; // four minutes of match time
let failed = 0;
function test(name, fn) {
  const t0 = Date.now();
  try { fn(); console.log(`ok   ${name} (${Date.now() - t0} ms)`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message}`); }
}

test('same seed and same AI produce identical state at every turn', () => {
  const a = new Game(null, cfg(1234));
  const b = new Game(null, cfg(1234));
  const ha = run(a, TICKS), hb = run(b, TICKS);
  assert.equal(ha.length, hb.length, 'different number of turns');
  ha.forEach((h, i) => assert.equal(h, hb[i], `hash differs at turn ${i}`));
  assert.ok(a.turnCount >= 5, `expected several turns, got ${a.turnCount}`);
  assert.deepEqual(a.recording.inputs, b.recording.inputs, 'recordings differ');
});

test('a recording replays to the same state without running the AI', () => {
  const live = new Game(null, cfg(777));
  const hl = run(live, TICKS);
  const rec = JSON.parse(JSON.stringify(live.recording)); // as it would come back from a server
  assert.equal(rec.rulesVersion, RULES_VERSION);
  const rep = Game.fromRecording(null, rec);
  assert.equal(rep.ai, null, 'AI must be off during replay');
  const hr = run(rep, live.tickCount);
  assert.equal(hl.length, hr.length, 'different number of turns in replay');
  hl.forEach((h, i) => assert.equal(h, hr[i], `replay diverged at turn ${i}`));
  assert.equal(rep.tickCount, live.tickCount);
  const bytes = JSON.stringify(rec).length;
  console.log(`     recording: ${rec.inputs.length} input changes over ${live.tickCount} ticks, ${bytes} bytes as JSON`);
});

test('different seeds produce different matches', () => {
  const a = new Game(null, cfg(1)), b = new Game(null, cfg(2));
  assert.notEqual(a.stateHash(), b.stateHash());
});

test('terrain and spawn are decided before the first tick', () => {
  const a = new Game(null, cfg(99)), b = new Game(null, cfg(99));
  assert.equal(a.stateHash(), b.stateHash());
  assert.equal(a.snails.length, 4);
  for (const s of a.snails) assert.ok(a.terrain.solid(s.x, s.y) || a.terrain.solid(s.x - 5, s.y) || a.terrain.solid(s.x + 5, s.y), `${s.name} is not standing on ground`);
});

test('human-style scripted input is recorded and replayed', () => {
  const c = cfg(4242);
  c.teams[0].ai = false;
  const live = new Game(null, c);
  // walk right for a second, aim up, charge for half a second, release
  const script = (g, t) => {
    const inp = g.input;
    inp.left = inp.right = inp.up = inp.down = inp.fire = false;
    if (t < 60) inp.right = true;
    else if (t < 80) inp.up = true;
    else if (t === 85) inp.weapon = 'granat';
    else if (t >= 90 && t < 120) inp.fire = true;
    else if (t === 130) inp.jump = true;
  };
  for (let t = 0; t < 60 * 20; t++) { if (!live.ai) script(live, t); live.tick(); }
  const rep = Game.fromRecording(null, JSON.parse(JSON.stringify(live.recording)));
  for (let t = 0; t < live.tickCount; t++) rep.tick();
  assert.equal(rep.stateHash(), live.stateHash(), 'scripted replay diverged');
  assert.ok(live.turnCount >= 2, 'the scripted shot should have ended the turn');
});

test('crates: health heals, weapon crates add ammo, blasts set them off', () => {
  const c = cfg(31337);
  c.teams[0].ai = false;
  const g = new Game(null, c);
  const s = g.active;
  const team = g.teams[s.team];
  s.hp = 50;
  g.crates.push({ x: s.x, y: s.y, vy: 0, type: 'health', weapon: null, landed: true, chute: true });
  g.tick();
  assert.equal(g.crates.length, 0, 'health crate not picked up');
  assert.equal(s.hp, 85);
  const before = team.ammo.saltregn;
  g.crates.push({ x: s.x, y: s.y, vy: 0, type: 'weapon', weapon: 'saltregn', landed: true, chute: true });
  g.tick();
  assert.equal(team.ammo.saltregn, before + 1, 'weapon crate did not add ammo');
  // a crate far from everyone, blown up by an explosion next to it
  const cx = 300, cy = g.terrain.groundBelow(300, 0) - 1;
  g.crates.push({ x: cx, y: cy, vy: 0, type: 'health', weapon: null, landed: true, chute: true });
  g.explosion(cx + 20, cy - 10, 20, 10, null);
  assert.equal(g.crates.length, 0, 'crate survived a blast');
  assert.equal(g.pendingBooms.length, 1, 'crate blast not queued');
  const solidBefore = g.terrain.solid(cx, cy + 3);
  g.tick();
  assert.equal(g.pendingBooms.length, 0);
  assert.ok(solidBefore && !g.terrain.solid(cx, cy + 3), 'crate explosion did not dig');
});

test('ammo: limited weapons count down and cannot be selected when empty', () => {
  const c = cfg(555);
  c.teams[0].ai = false;
  const g = new Game(null, c);
  const team = g.teams[g.active.team];
  team.ammo.dynamit = 1;
  g.input.weapon = 'dynamit';
  g.tick();
  assert.equal(g.weaponId, 'dynamit');
  g.input.fire = true; g.tick(); g.input.fire = false; g.tick();
  assert.equal(team.ammo.dynamit, 0);
  assert.equal(g.projectiles.filter((p) => p.type === 'dynamit').length, 1);
  // next turn for this team: dynamite must not be selectable
  for (let i = 0; i < 60 * 40 && !(g.active && g.active.team === team.index && g.phase === 'aim' && g.turnCount > 1); i++) g.tick();
  assert.equal(g.active.team, team.index);
  g.input.weapon = 'dynamit';
  g.tick();
  assert.equal(g.weaponId, 'bazooka', 'empty weapon was selected');
});

test('slime sticks where it lands and explodes after its fuse', () => {
  const c = cfg(909);
  c.teams[0].ai = false;
  const g = new Game(null, c);
  g.input.weapon = 'slem'; g.tick();
  g.active.aim = 0.8;
  g.input.fire = true; for (let i = 0; i < 25; i++) g.tick(); g.input.fire = false; g.tick();
  const p = g.projectiles.find((q) => q.type === 'slem');
  assert.ok(p, 'no slime ball in flight');
  let landedTick = -1;
  for (let i = 0; i < 60 * 6; i++) {
    g.tick();
    if (p.rest && landedTick < 0) landedTick = g.tickCount;
    if (!g.projectiles.includes(p)) break;
  }
  assert.ok(landedTick > 0, 'slime never came to rest');
  assert.ok(!g.projectiles.includes(p), 'slime never exploded');
  assert.ok(g.tickCount - landedTick <= 60 * 2 + 2, 'fuse longer than 2 s after landing');
});

test('salt rain: marker moves with left/right and five crystals fall and burst', () => {
  const c = cfg(2024);
  c.teams[0].ai = false;
  const g = new Game(null, c);
  const s = g.active;
  g.input.weapon = 'saltregn'; g.tick();
  assert.equal(g.weaponId, 'saltregn');
  const m0 = g.markerX, x0 = s.x;
  g.input.right = true; for (let i = 0; i < 30; i++) g.tick(); g.input.right = false;
  assert.ok(g.markerX > m0 + 100, 'marker did not move');
  assert.equal(s.x, x0, 'snail moved while aiming the marker');
  g.input.fire = true; g.tick(); g.input.fire = false;
  const drops = g.projectiles.filter((p) => p.type === 'saltregn');
  assert.equal(drops.length, 5);
  const solidBefore = g.terrain.mask.reduce((a, b) => a + b, 0);
  for (let i = 0; i < 60 * 8 && g.projectiles.length; i++) g.tick();
  assert.equal(g.projectiles.length, 0, 'crystals still in the air');
  const solidAfter = g.terrain.mask.reduce((a, b) => a + b, 0);
  assert.ok(solidAfter < solidBefore, 'salt rain did not scar the ground');
  assert.equal(g.teams[s.team].ammo.saltregn, 0);
});

if (failed) { console.log(`\n${failed} test(s) failed`); process.exit(1); }
console.log('\nall tests passed');
