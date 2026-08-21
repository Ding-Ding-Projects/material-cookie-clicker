/**
 * Capture harness for the golden cookie challenge families.
 *
 * Photographs the built application at 1440x900 with one of the fifty challenges open, once per
 * FAMILY, so all five controls are evidenced rather than only the ones that are easy to reach.
 *
 * WHY THIS RE-STAMPS THE SAVE INSTEAD OF LOADING IT AS WRITTEN.
 *
 * A golden cookie has a short window and the card closes when it runs out. The seed files carry the
 * instant they were generated, so by the time a separate vitest run has finished and this script has
 * connected, the cookie has already fled and the capture is of a "The golden cookie got away."
 * toast — a different screen wearing the challenge's label. Three attempts were lost to exactly
 * that before this script existed.
 *
 * So the two timestamps that decide the window are rebased to NOW immediately before each seed.
 * This is the same correction `capture-seed-random-events.test.ts#makeLive` makes for the same
 * reason, and it changes nothing about the challenge itself: which challenge is open, its rolled
 * target, its round and its progress are all exactly as the domain wrote them.
 *
 * This script never launches anything. The caller starts Electron on a named cheap Lowlevel
 * headless desktop with --remote-debugging-port=<port> first, following the same division of
 * labour as every other capture script here.
 *
 * Usage:
 *   node scripts/capture-golden-challenges.mjs <port> <expected-page-url> <save-dir> <out-dir>
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
  console.error('usage: node scripts/capture-golden-challenges.mjs <port> <expected-page-url> <save-dir> <out-dir>');
  process.exit(2);
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** One per family, so every control is photographed rather than only the reachable ones. */
const STATES = ['golden-dial', 'golden-mash', 'golden-hold', 'golden-sequence', 'golden-pick'];

/**
 * Move the golden cookie's clock to now.
 *
 * Only the two instants that decide whether the window is still open are touched. Everything that
 * describes the CHALLENGE -- its id, its rolled target, its round, its progress -- is left exactly
 * as written, so the capture is of the state the domain produced and not one this script invented.
 */
function rebaseToNow(saveJson) {
  const save = JSON.parse(saveJson);
  const golden = save.goldenCookie;
  if (!golden || !golden.dial) throw new Error('Save has no open challenge to capture.');
  const now = Date.now();
  golden.spawnedAtEpochMs = now;
  golden.dial.roundStartedAtEpochMs = now;
  return JSON.stringify(save);
}

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

  for (const state of STATES) {
    const save = rebaseToNow(readFileSync(resolve(saveDir, `${state}.json`), 'utf8'));
    await session.evaluate(
      `window.localStorage.setItem('material-cookie-clicker:save:v1', ${JSON.stringify(save)}); 'seeded'`,
    );
    await session.send('Page.navigate', { url: expectedUrl });

    // Wait for the CARD, not merely for the document: a complete readyState with no card means the
    // cookie fled during load, and capturing then would photograph the aftermath toast.
    let title = null;
    const startedAt = Date.now();
    while (Date.now() - startedAt < 10_000) {
      const readyState = await session.evaluate('document.readyState');
      if (readyState === 'complete') {
        title = await session.evaluate(
          "document.querySelector('#golden-dial-title')?.textContent?.trim() ?? null",
        );
        if (title) break;
      }
      await new Promise((done) => setTimeout(done, 100));
    }
    if (!title) throw new Error(`Timed out waiting for the ${state} challenge card to render.`);

    // Assert the control that belongs to this family is the one on screen. Without this a capture
    // could silently fall back to the dial and still look like evidence for four other families.
    const control = await session.evaluate(`(() => {
      const custom = document.querySelector('.golden-challenge');
      if (custom) return custom.className.replace('golden-challenge ', '');
      return document.querySelector('.golden-dial[role="slider"]') ? 'golden-challenge--dial' : 'none';
    })()`);
    const expected = `golden-challenge--${state.replace('golden-', '')}`;
    if (control !== expected) {
      throw new Error(`${state} rendered ${control}, expected ${expected}.`);
    }

    const observed = await session.evaluate('({ width: innerWidth, height: innerHeight, scale: devicePixelRatio })');
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
    results.push({ state, challenge: title, control, path, sha256: sha256(bytes), width: 1440, height: 900 });
  }
} finally {
  session.close();
}

console.log(JSON.stringify(results, null, 2));
