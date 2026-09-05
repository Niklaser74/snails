// Packages the game for Poki (zip upload in the developer portal): index.html
// at the root, relative paths only, no service worker or manifest, and the
// platform stamped so the adapter loads the Poki SDK wherever Poki hosts it.
//   node scripts/build-poki.mjs   -> dist/snackmageddon-poki.zip
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist', 'poki');
const zip = path.join(root, 'dist', 'snackmageddon-poki.zip');
const include = ['index.html', 'css', 'js', 'icons'];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const item of include) fs.cpSync(path.join(root, item), path.join(out, item), { recursive: true });

let html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
html = html.replace(/<link rel="manifest"[^>]*>\s*/g, '');
html = html.replace('<head>', '<head>\n<script>window.__PLATFORM = \'poki\';</script>');
fs.writeFileSync(path.join(out, 'index.html'), html);
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
fs.writeFileSync(path.join(out, 'VERSION.txt'), `Snailmageddon ${version} (Poki build)\n`);

fs.rmSync(zip, { force: true });
execFileSync('zip', ['-qr', zip, '.'], { cwd: out });
const size = (fs.statSync(zip).size / 1024).toFixed(0);
console.log(`built ${path.relative(root, zip)} (${size} kB) for version ${version}`);
