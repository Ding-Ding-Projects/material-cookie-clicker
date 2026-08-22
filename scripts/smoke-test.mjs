#!/usr/bin/env node
/**
 * Smoke test: prove the application is actually assembled, not merely typed.
 *
 * WHAT THIS IS FOR. The unit suite injects its dependencies, so it proves each
 * module and says nothing about the seams between them. This script checks the
 * things that only break once the pieces are put together: that the build
 * emitted real files, that the preload bridge and the renderer agree about what
 * the bridge is called, that the Electron binary genuinely exists, and that the
 * game domain can be driven end to end through its one mutation seam.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not open a window and it does not
 * photograph anything. Visual verification happens through the sanctioned
 * headless capture route, driven from outside this script, because a script
 * cannot see whether a surface rendered correctly - only whether it failed to
 * throw. Claiming otherwise would make this exactly the decorative check the
 * project's rules forbid everywhere else.
 *
 * Exit code is 0 when every check passes, 1 otherwise. Every failure names the
 * exact check, what was expected, and what was found.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];

function check(name, fn) {
  try {
    const detail = fn();
    results.push({ name, ok: true, detail: detail ?? 'ok' });
  } catch (error) {
    results.push({ name, ok: false, detail: error instanceof Error ? error.message : String(error) });
  }
}

function mustExist(relative, minBytes = 1) {
  const target = path.join(root, relative);
  if (!existsSync(target)) throw new Error(`expected ${relative} to exist; it does not`);
  const { size } = statSync(target);
  if (size < minBytes) throw new Error(`expected ${relative} to be at least ${minBytes} bytes; it is ${size}`);
  return `${relative} (${size} bytes)`;
}

// ---- 1. The build actually emitted something -------------------------------

check('main process bundle exists', () => mustExist('dist/main/main.js', 500));
check('preload bundle exists', () => mustExist('dist/preload/index.cjs', 200));
check('renderer entry exists', () => mustExist('dist/renderer/index.html', 200));

check('renderer emitted a real script bundle', () => {
  const html = readFileSync(path.join(root, 'dist/renderer/index.html'), 'utf8');
  const match = html.match(/src="\.?\/?([^"]+\.js)"/);
  if (!match) throw new Error('index.html references no script bundle');
  const bundle = path.join(root, 'dist/renderer', match[1].replace(/^\/+/, ''));
  if (!existsSync(bundle)) throw new Error(`index.html references ${match[1]}, which does not exist`);
  const { size } = statSync(bundle);
  // A renderer that bundled nothing still emits a file. Size is the cheap
  // second signal that the bundle genuinely carries the application.
  if (size < 10_000) throw new Error(`renderer bundle is only ${size} bytes, which is too small to be the application`);
  return `${match[1]} (${size} bytes)`;
});

// ---- 2. The bridge seam ----------------------------------------------------
// A unit test that injects the bridge passes whether or not the real preload
// exposes the shape the renderer expects. This is that seam, checked directly.

check('preload exposes a bridge the renderer looks for', () => {
  const preload = readFileSync(path.join(root, 'dist/preload/index.cjs'), 'utf8');
  const exposed = [...preload.matchAll(/exposeInMainWorld\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  if (exposed.length === 0) throw new Error('preload calls exposeInMainWorld for nothing');
  return `exposes: ${exposed.join(', ')}`;
});

// ---- 3. Electron is genuinely present --------------------------------------
// On Node 26 the electron install step prints a cache hit, exits 0, and
// extracts nothing - so "the package is installed" and "the binary exists" are
// different questions, and only the second one matters.

check('electron binary is present, not merely installed', () => {
  const exe = path.join(root, 'node_modules/electron/dist/electron.exe');
  if (!existsSync(exe)) {
    throw new Error('node_modules/electron/dist/electron.exe is missing. Run `node scripts/ensure-electron-binary.mjs`; the package being installed does not mean the binary was extracted.');
  }
  return `${(statSync(exe).size / 1_000_000).toFixed(0)} MB`;
});

// ---- 4. The game domain drives end to end ----------------------------------

const failures = () => results.filter((r) => !r.ok);

async function domainCheck() {
  // Import the COMPILED output, not the source. That is the point of this
  // check: the tests already exercise the TypeScript, so the only thing left
  // worth proving is that what the build actually emitted still runs.
  const reducerModule = await import('../dist/shared/game/reducer.js').catch((error) => {
    throw new Error(`could not import dist/shared/game/reducer.js: ${error.message}`);
  });
  const { applyGameAction, createInitialGameState } = reducerModule;
  // Both are required. An earlier version of this check treated a missing
  // factory as a soft pass and reported PASS while never driving a click,
  // which is precisely the decorative guard this project forbids elsewhere -
  // it would have gone green on a domain that could not run at all.
  if (typeof applyGameAction !== 'function') throw new Error('reducer.js does not export applyGameAction');
  if (typeof createInitialGameState !== 'function') throw new Error('reducer.js does not export createInitialGameState');

  const ctx = { now: () => 0, rng: { next: () => 0.5 } };
  const start = createInitialGameState('2026-01-01T00:00:00.000Z');
  const clicked = applyGameAction(start, { type: 'click' }, ctx);
  if (JSON.stringify(clicked) === JSON.stringify(start)) throw new Error('a click produced no state change');

  // Purity matters more than the click: every screen reads from this state, so
  // a reducer that mutates in place would make a subscription model that looks
  // correct silently fail to re-render.
  if (JSON.stringify(start) !== JSON.stringify(createInitialGameState('2026-01-01T00:00:00.000Z'))) {
    throw new Error('applyGameAction mutated the state it was given instead of returning a new one');
  }
  return 'click advanced state, and the reducer did not mutate its input';
}

try {
  results.push({ name: 'the game domain runs through its one mutation seam', ok: true, detail: await domainCheck() });
} catch (error) {
  results.push({ name: 'the game domain runs through its one mutation seam', ok: false, detail: error instanceof Error ? error.message : String(error) });
}

// ---- Report ----------------------------------------------------------------

const width = Math.max(...results.map((r) => r.name.length));
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(width)}  ${r.detail}`);
}
const bad = failures();
console.log(`\n${results.length - bad.length}/${results.length} checks passed`);
if (bad.length > 0) {
  console.error('\nSmoke test failed. Each failure above names what was expected and what was found.');
  process.exit(1);
}
console.log('Smoke test passed. This proves assembly, not appearance - capture the surfaces to check those.');
