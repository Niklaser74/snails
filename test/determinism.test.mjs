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

if (failed) { console.log(`\n${failed} test(s) failed`); process.exit(1); }
console.log('\nall tests passed');
