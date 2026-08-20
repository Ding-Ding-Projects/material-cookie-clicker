/**
 * Capture harness for the graphics-progression completeness receipt.
 *
 * Photographs the built application (dist/main + dist/renderer, run under Electron) at exactly
 * 1440x900 in three `look` ladder states — before/affordable/after — over an isolated Chrome
 * DevTools Protocol session, following the same pattern as scripts/design-parity-capture.mjs and
 * scripts/capture-seed-localstorage.mjs: push a pre-seeded save into localStorage, reload, wait
 * for the `data-look-*` attributes to render, then take a raw CDP screenshot.
 *
 * The Electron main window is created at width:1440, height:900 with frame:false (see
 * src/main/main.ts), so its content area IS 1440x900 with no OS chrome to subtract. The device
 * metrics override below pins the CDP viewport to the same tuple regardless of host DPI.
 *
 * This script never launches anything itself. The caller starts Electron on a named cheap
 * Lowlevel headless desktop with --remote-debugging-port=<port> first, then invokes this against
 * the already-running, already-isolated target — the same division of labour as every other
 * capture script in this repository.
 *
 * The three save files are produced separately by
 * scripts/capture-seed-graphics-progression.test.ts (a vitest harness, because it needs the
 * TypeScript game/save-codec modules); this script only speaks plain JSON and CDP.
 *
 * Usage:
 *   node scripts/capture-graphics-progression.mjs <port> <expected-page-url> <save-dir> <out-dir>
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { openIsolatedCdpSession } from './cdp-isolated-session.mjs';

const port = process.argv[2];
const expectedUrl = process.argv[3];
const saveDir = process.argv[4];
const outDir = process.argv[5];
if (!port || !expectedUrl || !saveDir || !outDir) {
  console.error('usage: node scripts/capture-graphics-progression.mjs <port> <expected-page-url> <save-dir> <out-dir>');
  process.exit(2);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

const STATE_IDS = ['before', 'affordable', 'after'];

mkdirSync(outDir, { recursive: true });

const session = await openIsolatedCdpSession({ port, expectedUrl, timeoutMs: 15_000 });
const results = [];
try {
  await session.send('Page.enable');
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  for (const state of STATE_IDS) {
    const save = readFileSync(resolve(saveDir, `${state}.json`), 'utf8');
    const seedExpression = `window.localStorage.setItem('material-cookie-clicker:save:v1', ${JSON.stringify(save)}); 'seeded'`;
    await session.evaluate(seedExpression);
    await session.send('Page.navigate', { url: expectedUrl });
    let ready = false;
    const startedAt = Date.now();
    while (Date.now() - startedAt < 10_000) {
      const readyState = await session.evaluate('document.readyState');
      if (readyState === 'complete') {
        const attr = await session.evaluate("document.documentElement.getAttribute('data-look-palette')");
        if (attr === 'off' || attr === 'on') {
          ready = true;
          break;
        }
      }
      await new Promise((done) => setTimeout(done, 100));
    }
    if (!ready) throw new Error(`Timed out waiting for the ${state} capture to render.`);
    const observed = await session.evaluate(`({
      width: innerWidth,
      height: innerHeight,
      scale: devicePixelRatio,
      lookPalette: document.documentElement.getAttribute('data-look-palette'),
      lookCabinet: document.documentElement.getAttribute('data-look-cabinet')
    })`);
    if (observed.width !== 1440 || observed.height !== 900) {
      throw new Error(`${state} viewport was ${observed.width}x${observed.height}, not 1440x900.`);
    }
    const capture = await session.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const bytes = Buffer.from(capture.result.data, 'base64');
    if (
      bytes.length < 24
      || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
      || bytes.readUInt32BE(16) !== 1440
      || bytes.readUInt32BE(20) !== 900
    ) {
      throw new Error(`${state} capture is not a 1440x900 PNG.`);
    }
    const path = resolve(outDir, `${state}.png`);
    writeFileSync(path, bytes);
    results.push({ state, path, sha256: sha256(bytes), width: 1440, height: 900, observed });
  }
} finally {
  session.close();
}

console.log(JSON.stringify(results, null, 2));
