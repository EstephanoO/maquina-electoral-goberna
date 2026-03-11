// zip.js — empaqueta la extensión en whatsapp-helper.zip
// Excluye: node_modules/, src/, package.json, package-lock.json, build.js, zip.js
// Output: apps/web/public/whatsapp-helper.zip (relativo a repo root)

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const extDir = 'extensions/wspp-store-tester';
const zipOut = 'apps/web/public/whatsapp-helper.zip';

// Remove old zip first
try { execSync(`rm -f ${zipOut}`, { cwd: repoRoot, stdio: 'inherit' }); } catch {}

execSync(
  [
    'zip -r', zipOut, extDir,
    '--exclude', `"${extDir}/node_modules/*"`,
    '--exclude', `"${extDir}/src/*"`,
    '--exclude', `"${extDir}/package.json"`,
    '--exclude', `"${extDir}/package-lock.json"`,
    '--exclude', `"${extDir}/build.js"`,
    '--exclude', `"${extDir}/zip.js"`,
    '--exclude', `"${extDir}/.DS_Store"`,
  ].join(' '),
  { cwd: repoRoot, stdio: 'inherit' },
);

console.log(`[WSPP ZIP] ✓ ${zipOut} created`);
