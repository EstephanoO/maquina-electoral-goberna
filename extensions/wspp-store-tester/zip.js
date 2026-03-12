// zip.js — empaqueta la extensión en whatsapp-helper.zip
// Excluye: node_modules/, src/, package.json, package-lock.json, build.js, zip.js, docs .md
// Output: apps/web/public/whatsapp-helper.zip (relativo a repo root)
//
// Estructura del zip: whatsapp-helper/manifest.json, whatsapp-helper/background.js, ...
// El usuario descarga, descomprime, y selecciona la carpeta "whatsapp-helper" en Chrome.

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const zipOut = path.join(repoRoot, 'apps/web/public/whatsapp-helper.zip');

// Create a temp dir with the clean folder name
const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'wspp-zip-'));
const stageDir = path.join(tmpBase, 'whatsapp-helper');
fs.mkdirSync(stageDir);

// Files to include in the zip (only what Chrome needs)
const include = [
  'manifest.json',
  'background.js',
  'inject.js',
  'content.js',
  'popup.html',
  'popup.js',
];

for (const file of include) {
  const src = path.join(__dirname, file);
  if (!fs.existsSync(src)) {
    console.error(`[WSPP ZIP] MISSING: ${file} — did you run 'npm run build' first?`);
    process.exit(1);
  }
  fs.copyFileSync(src, path.join(stageDir, file));
}

// Remove old zip
try { fs.unlinkSync(zipOut); } catch {}

// Create zip from the temp dir so the root folder is "whatsapp-helper/"
execSync(
  `zip -r "${zipOut}" whatsapp-helper`,
  { cwd: tmpBase, stdio: 'inherit' },
);

// Cleanup temp
fs.rmSync(tmpBase, { recursive: true, force: true });

// Show result
const size = fs.statSync(zipOut).size;
console.log(`[WSPP ZIP] whatsapp-helper.zip created (${(size / 1024).toFixed(1)} KB)`);
console.log(`[WSPP ZIP] Contents: ${include.join(', ')}`);
