// build.js — esbuild config para la extensión Chrome WSPP
// Uso: node build.js          (build una vez)
//      node build.js --watch  (watch mode)
//
// Outputs:
//   inject.js    ← src/inject-entry.js   (format: iife, world: MAIN)
//   background.js ← src/background-entry.js (format: iife, service worker)

import * as esbuild from 'esbuild';

const isWatch = process.argv.includes('--watch');

const sharedConfig = {
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: ['chrome109'],  // MV3 minimum supported
  logLevel: 'info',
  // No minification — easier debugging in production extensions
  minify: false,
};

const builds = [
  {
    ...sharedConfig,
    entryPoints: ['src/inject-entry.js'],
    outfile: 'inject.js',
    globalName: undefined,  // IIFE wraps everything, no global export
  },
  {
    ...sharedConfig,
    entryPoints: ['src/background-entry.js'],
    outfile: 'background.js',
  },
];

if (isWatch) {
  // Watch mode: rebuild on file changes
  const contexts = await Promise.all(builds.map(cfg => esbuild.context(cfg)));
  await Promise.all(contexts.map(ctx => ctx.watch()));
  console.log('[WSPP BUILD] Watching for changes...');
} else {
  // Single build
  const results = await Promise.all(builds.map(cfg => esbuild.build(cfg)));
  const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
  const totalWarnings = results.reduce((sum, r) => sum + r.warnings.length, 0);
  console.log(`[WSPP BUILD] Done. Errors: ${totalErrors}, Warnings: ${totalWarnings}`);
  if (totalErrors > 0) process.exit(1);
}
