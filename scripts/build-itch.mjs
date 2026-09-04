// Packages the game for itch.io (HTML5 upload): a zip with index.html at the
// root and only the files the game needs.
//   node scripts/build-itch.mjs   -> dist/snackmageddon-itch.zip
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist', 'itch');
const zip = path.join(root, 'dist', 'snackmageddon-itch.zip');
const include = ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'icons', 'design'];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const item of include) fs.cpSync(path.join(root, item), path.join(out, item), { recursive: true });

// itch serves uploads from a sandboxed CDN origin: a service worker would be
// registered against the wrong scope, so the platform adapter disables it there.
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
fs.writeFileSync(path.join(out, 'VERSION.txt'), `Snäckmageddon ${version}\n`);

fs.rmSync(zip, { force: true });
execFileSync('zip', ['-qr', zip, '.'], { cwd: out });
const size = (fs.statSync(zip).size / 1024).toFixed(0);
console.log(`built ${path.relative(root, zip)} (${size} kB) for version ${version}`);
