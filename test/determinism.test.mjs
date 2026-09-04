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

test('a snail drowned by sudden death ends the turn and the match at once', () => {
  const c = cfg(77);
  c.teams[0].ai = false; c.snailsPerTeam = 1;
  const g = new Game(null, c);
  // put the active snail on the water line; the next tick drowns it
  const s = g.active;
  s.y = g.waterY + 10;
  g.tick();
  assert.equal(s.alive, false, 'snail should have drowned');
  assert.notEqual(g.phase, 'aim', 'turn kept running with a dead active snail');
  for (let i = 0; i < 60 * 3 && g.phase !== 'over'; i++) g.tick();
  assert.equal(g.phase, 'over', 'match did not end within 3 s');
  assert.equal(g.winner.index, 1, 'the other team should win');
});

test('Snigelpost: a turn played on one device resumes exactly on the other', () => {
  const cfg = { seed: 555, snailsPerTeam: 2, teams: [{ name: 'A', color: '#e2453c', ai: false }, { name: 'B', color: '#3b82f6', ai: false }] };
  const shoot = (g) => {
    g.input.up = true; for (let i = 0; i < 10; i++) g.tick(); g.input.up = false;
    g.input.fire = true; for (let i = 0; i < 25; i++) g.tick(); g.input.fire = false;
    for (let i = 0; i < 60 * 40 && !g.paused && g.phase !== 'over'; i++) g.tick();
  };
  // device A (host) plays turn 1 and pauses when it becomes B's turn
  const waits = [];
  const a = new Game(null, cfg, { onWaitTurn: (g, team) => waits.push({ team, tick: g.tickCount, hash: g.stateHash() }) }, { localTeams: [0] });
  assert.equal(a.paused, false);
  shoot(a);
  assert.equal(a.paused, true, 'host did not pause at the turn boundary');
  assert.equal(waits.length, 1); assert.equal(waits[0].team, 1);
  // the hook sees the finished tick: same tick count and hash as afterwards
  assert.equal(waits[0].tick, a.tickCount);
  assert.equal(waits[0].hash, a.stateHash());
  const turn1 = { start: 0, end: a.tickCount, inputs: a.inputsSince(0), hash: a.stateHash() };
  assert.ok(turn1.inputs.length > 2 && turn1.inputs.every(([t]) => t < turn1.end));
  // device B (guest): replay turn 1, verify, play turn 2
  const rec1 = { rulesVersion: 2, seed: 555, teams: cfg.teams, snailsPerTeam: 2, inputs: turn1.inputs };
  const b = new Game(null, cfg, {}, { replay: rec1, liveAfter: turn1.end, localTeams: [1] });
  while (b.tickCount < turn1.end) b.tick();
  assert.equal(b.stateHash(), turn1.hash, 'guest state differs after replaying the host turn');
  assert.equal(b.paused, false, 'guest paused on its own turn');
  assert.equal(b.active.team, 1);
  shoot(b);
  assert.equal(b.paused, true);
  const turn2 = { start: turn1.end, end: b.tickCount, inputs: b.inputsSince(turn1.end), hash: b.stateHash() };
  assert.ok(turn2.inputs.every(([t]) => t >= turn2.start && t < turn2.end), 'turn 2 inputs outside its tick range');
  // device A again: replay both turns, must land on B's hash with A to play
  const rec2 = { ...rec1, inputs: [...turn1.inputs, ...turn2.inputs] };
  const a2 = new Game(null, cfg, {}, { replay: rec2, liveAfter: turn2.end, localTeams: [0] });
  while (a2.tickCount < turn2.end) a2.tick();
  assert.equal(a2.stateHash(), turn2.hash, 'host state differs after replaying both turns');
  assert.equal(a2.paused, false);
  assert.equal(a2.active.team, 0);
  // and it keeps recording from there
  shoot(a2);
  assert.ok(a2.inputsSince(turn2.end).length > 0);
  assert.ok(a2.paused || a2.phase === 'over');
});

test('turn time and sudden death are match rules that travel with the recording', () => {
  const base = cfg(99);
  const std = new Game(null, base);
  assert.deepEqual(std.rules, { turnTime: 45, suddenDeath: 16 }, 'defaults');
  assert.equal(std.timer, 45);
  const fast = new Game(null, { ...base, turnTime: 20, suddenDeath: 0 });
  assert.equal(fast.timer, 20);
  assert.equal(fast.recording.turnTime, 20);
  assert.equal(fast.recording.suddenDeath, 0);
  // unknown values fall back to the defaults, so a tampered config cannot desync a match
  assert.deepEqual(new Game(null, { ...base, turnTime: 7, suddenDeath: 'x' }).rules, { turnTime: 45, suddenDeath: 16 });
  // sudden death off: the water never rises, however long the match runs
  const water0 = fast.waterY;
  run(fast, TICKS);
  assert.ok(fast.turnCount > 16, `expected more than 16 turns, got ${fast.turnCount}`);
  assert.equal(fast.waterY, water0, 'water rose with sudden death off');
  assert.ok(std.waterY === water0, 'water should not have moved before the match ran');
  // a replay of the fast game uses the fast rules and lands on the same state
  const rec = JSON.parse(JSON.stringify(fast.recording));
  const rep = Game.fromRecording(null, rec);
  assert.deepEqual(rep.rules, { turnTime: 20, suddenDeath: 0 });
  run(rep, fast.tickCount);
  assert.equal(rep.stateHash(), fast.stateHash(), 'replay with rules diverged');
  // the timer is part of the state hash, so two devices with different rules notice at once
  assert.notEqual(new Game(null, { ...base, turnTime: 20 }).stateHash(), new Game(null, base).stateHash(), 'turn time not in the hash');
});

if (failed) { console.log(`\n${failed} test(s) failed`); process.exit(1); }
console.log('\nall tests passed');
