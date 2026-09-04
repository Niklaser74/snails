// Browser tests with Playwright. Serves the repo over HTTP, plays through the
// real UI and cross-checks the browser simulation against a headless Node run.
//   npm run test:browser
// Screenshots land in test-results/.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { Game } from '../js/game.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'test-results');
fs.mkdirSync(outDir, { recursive: true });

const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.json': 'application/json', '.md': 'text/markdown',
};
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;

const launchOpts = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {};
const browser = await chromium.launch(launchOpts);
let failed = 0;

async function test(name, fn) {
  const t0 = Date.now();
  try { await fn(); console.log(`ok   ${name} (${Date.now() - t0} ms)`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.stack || e.message}`); }
}

// A page that collects console errors and page errors.
async function open(url, viewport = { width: 1280, height: 720 }, extra = {}) {
  const page = await browser.newPage({ viewport, ...extra });
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(base + url);
  await page.evaluate(() => { window.__manualTick = true; });
  return { page, errors };
}

const ticks = (page, n) => page.evaluate((n) => { const g = window.__game; for (let i = 0; i < n; i++) g.tick(); return { tick: g.tickCount, turn: g.turnCount, phase: g.phase, hash: g.stateHash() }; }, n);

await test('menu and design page load without errors', async () => {
  const { page, errors } = await open('/');
  await page.waitForSelector('#btn-start');
  assert.equal(await page.locator('#opt-style option').count(), 5, 'five snail styles in the menu');
  await page.screenshot({ path: path.join(outDir, 'menu.png') });
  await page.goto(base + '/design/snails.html');
  await page.waitForTimeout(300);
  assert.equal(await page.locator('canvas').count(), 5);
  assert.deepEqual(errors, []);
  await page.close();
});

await test('keyboard: walk, aim, pick grenade, charge and fire', async () => {
  const { page, errors } = await open('/?seed=4242');
  await page.selectOption('.team-row:nth-child(2) select', 'ai');
  await page.click('#btn-start');
  await page.waitForFunction(() => window.__game);
  const before = await page.evaluate(() => ({ x: __game.active.x, aim: __game.active.aim, w: __game.weaponId }));
  await page.keyboard.down('ArrowRight'); await ticks(page, 60); await page.keyboard.up('ArrowRight');
  await page.keyboard.down('ArrowUp'); await ticks(page, 20); await page.keyboard.up('ArrowUp');
  await page.keyboard.press('Digit2'); await ticks(page, 2);
  await page.keyboard.down('Space'); await ticks(page, 30);
  await page.screenshot({ path: path.join(outDir, 'charging.png') });
  const charging = await page.evaluate(() => ({ charging: __game.charging, power: __game.power, w: __game.weaponId }));
  await page.keyboard.up('Space'); await ticks(page, 2);
  const after = await page.evaluate(() => ({ x: __game.active.x, aim: __game.active.aim, phase: __game.phase, proj: __game.projectiles.map((p) => p.type) }));
  assert.ok(after.x > before.x, 'snail walked right');
  assert.ok(after.aim > before.aim, 'aim moved up');
  assert.equal(charging.w, 'granat');
  assert.ok(charging.charging && charging.power > 0.3, 'was charging');
  assert.equal(after.phase, 'retreat');
  assert.deepEqual(after.proj, ['granat']);
  await ticks(page, 60 * 6);
  await page.screenshot({ path: path.join(outDir, 'after-shot.png') });
  const later = await page.evaluate(() => ({ turn: __game.turnCount, proj: __game.projectiles.length }));
  assert.equal(later.proj, 0, 'grenade exploded');
  assert.ok(later.turn >= 2, 'turn passed to the AI');
  assert.deepEqual(errors, []);
  await page.close();
});

await test('AI vs AI in the browser matches the headless Node simulation', async () => {
  const seed = 20260904;
  const { page, errors } = await open(`/?seed=${seed}`);
  await page.selectOption('#opt-teams', '2');
  await page.selectOption('#opt-per', '3');
  for (const sel of await page.$$('.team-row select')) await sel.selectOption('ai');
  const rows = await page.$$eval('.team-row', (rs) => rs.map((r) => ({ name: r.querySelector('input').value, color: r.querySelector('.swatch').style.backgroundColor })));
  await page.click('#btn-start');
  await page.waitForFunction(() => window.__game);
  const cfg = await page.evaluate(() => ({ teams: __game.config.teams, snailsPerTeam: __game.config.snailsPerTeam, seed: __game.seed }));
  assert.equal(cfg.seed, seed);
  assert.equal(cfg.teams.length, rows.length);
  const node = new Game(null, cfg);
  const TOTAL = 60 * 150, CHUNK = 300;
  let b;
  for (let done = 0; done < TOTAL; done += CHUNK) {
    b = await ticks(page, CHUNK);
    for (let i = 0; i < CHUNK; i++) node.tick();
    assert.equal(b.hash, node.stateHash(), `browser and Node diverged at tick ${b.tick}`);
    if (done === CHUNK * 4) await page.screenshot({ path: path.join(outDir, 'ai-match.png') });
    if (b.phase === 'over') break;
  }
  assert.ok(b.turn >= 5, `expected several turns, got ${b.turn}`);
  const hp = await page.evaluate(() => __game.snails.map((s) => s.hp));
  assert.ok(hp.some((h) => h < 100), 'somebody got hit');
  assert.deepEqual(errors, []);
  await page.close();
});

await test('phone portrait: touch controls and HUD do not overlap', async () => {
  const { page, errors } = await open('/?seed=7', { width: 390, height: 844 }, { deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await page.click('#btn-start');
  await page.waitForFunction(() => window.__game);
  await ticks(page, 30);
  await page.screenshot({ path: path.join(outDir, 'mobile.png') });
  const box = async (sel) => page.locator(sel).boundingBox();
  const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  const left = await box('.touch.left'), right = await box('.touch.right');
  const weapons = await box('#weapons'), teams = await box('#hud-teams'), turn = await box('.hud-turn'), wind = await box('.hud-wind');
  assert.ok(!overlaps(left, right), 'touch button groups overlap');
  assert.ok(!overlaps(weapons, teams), 'weapon bar overlaps team list');
  assert.ok(!overlaps(turn, wind), 'turn chip overlaps wind');
  assert.ok(left.x + left.width <= 390 && right.x + right.width <= 390, 'buttons off screen');
  // the fire button must react to touch
  await page.locator('.tbtn.fire').dispatchEvent('pointerdown');
  await ticks(page, 10);
  assert.equal(await page.evaluate(() => __game.charging), true, 'touch fire did not start charging');
  await page.locator('.tbtn.fire').dispatchEvent('pointerup');
  await ticks(page, 5);
  assert.equal(await page.evaluate(() => __game.phase), 'retreat');
  assert.deepEqual(errors, []);
  await page.close();
});

await test('language switch translates the menu and default team names', async () => {
  const { page, errors } = await open('/');
  // headless Chromium is en-US, so the page starts in English
  assert.equal(await page.locator('#btn-start').textContent(), 'Start match');
  assert.equal(await page.inputValue('.team-row:nth-child(1) input'), 'Slime Gang');
  await page.selectOption('#opt-lang', 'sv');
  assert.equal(await page.locator('#btn-start').textContent(), 'Starta match');
  assert.equal(await page.inputValue('.team-row:nth-child(1) input'), 'Slemligan');
  assert.equal(await page.locator('#opt-style option').first().textContent(), 'Tecknad (Worms-stil)');
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'sv');
  // a custom name survives a switch, a default name follows it
  await page.fill('.team-row:nth-child(2) input', 'Mitt lag');
  await page.selectOption('#opt-lang', 'en');
  assert.equal(await page.inputValue('.team-row:nth-child(1) input'), 'Slime Gang');
  assert.equal(await page.inputValue('.team-row:nth-child(2) input'), 'Mitt lag');
  // the choice is remembered
  await page.selectOption('#opt-lang', 'sv');
  await page.reload();
  await page.waitForSelector('#btn-start');
  assert.equal(await page.locator('#btn-start').textContent(), 'Starta match');
  assert.deepEqual(errors, []);
  await page.close();
});

await test('first-match guide advances as the player walks, aims and fires', async () => {
  const { page, errors } = await open('/?seed=4242');
  await page.selectOption('.team-row:nth-child(2) select', 'ai');
  await page.click('#btn-start');
  await page.waitForFunction(() => window.__game);
  // the guide is evaluated by the HUD updater (throttled to ~80 ms), so give it a moment after each action
  const settle = async () => { await ticks(page, 5); await page.waitForTimeout(200); };
  await settle();
  const step = () => page.evaluate(() => ({ hidden: document.getElementById('tutorial').hidden, text: document.getElementById('tut-step').textContent }));
  assert.deepEqual(await step(), { hidden: false, text: 'Step 1 of 4' });
  await page.keyboard.down('ArrowRight'); await ticks(page, 60); await page.keyboard.up('ArrowRight'); await settle();
  assert.equal((await step()).text, 'Step 2 of 4');
  await page.keyboard.down('ArrowUp'); await ticks(page, 20); await page.keyboard.up('ArrowUp'); await settle();
  assert.equal((await step()).text, 'Step 3 of 4');
  await page.keyboard.down('Space'); await ticks(page, 20); await page.keyboard.up('Space'); await settle();
  assert.equal((await step()).text, 'Step 4 of 4');
  await page.click('#tut-skip');
  assert.equal((await step()).hidden, true);
  // done: a new match does not show the guide again
  await page.click('#btn-menu');
  await page.click('#btn-start');
  await page.waitForFunction(() => window.__game);
  await settle();
  assert.equal((await step()).hidden, true);
  assert.deepEqual(errors, []);
  await page.close();
});

await test('service worker registers and manifest is valid', async () => {
  const { page, errors } = await open('/');
  const sw = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return { scope: reg.scope, active: !!reg.active };
  });
  assert.ok(sw.active, 'service worker not active');
  const manifest = await page.evaluate(() => fetch('manifest.webmanifest').then((r) => r.json()));
  assert.equal(manifest.display, 'fullscreen');
  assert.ok(manifest.icons.some((i) => i.sizes === '512x512'));
  assert.deepEqual(errors, []);
  await page.close();
});

await browser.close();
server.close();
if (failed) { console.log(`\n${failed} browser test(s) failed`); process.exit(1); }
console.log('\nall browser tests passed');
