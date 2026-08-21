/**
 * Capture driver for the chrome-and-motion-states lane: appearance-editor, event-pool-remaining,
 * golden-dial-miss, prestige-keyed, factory-reduced-motion, raid-reduced-motion.
 *
 * Follows the established pattern (scripts/capture-graphics-progression.mjs,
 * scripts/design-parity-capture.mjs): push a pre-seeded save into localStorage over an isolated
 * CDP session, reload, drive real clicks through Input.dispatchMouseEvent / Runtime.evaluate
 * click() calls, then Page.captureScreenshot.
 *
 * Usage: node scripts/capture-chrome-states-driver.mjs <port> <expected-page-url> <save-path> <out-dir>
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { openIsolatedCdpSession } from './cdp-isolated-session.mjs';

const port = process.argv[2];
const expectedUrl = process.argv[3];
const savePath = process.argv[4];
const outDir = process.argv[5];
if (!port || !expectedUrl || !savePath || !outDir) {
  console.error('usage: node scripts/capture-chrome-states-driver.mjs <port> <expected-page-url> <save-path> <out-dir>');
  process.exit(2);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function waitFor(session, expression, timeoutMs = 10_000) {
  const started = Date.now();
  for (;;) {
    const value = await session.evaluate(expression);
    if (value) return value;
    if (Date.now() - started > timeoutMs) throw new Error(`Timed out waiting for ${expression}`);
    await new Promise((done) => setTimeout(done, 150));
  }
}

async function click(session, selector) {
  await session.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error('missing ' + ${JSON.stringify(selector)}); el.click(); return true; })()`);
}

mkdirSync(outDir, { recursive: true });

const saveJson = readFileSync(savePath, 'utf8');

const session = await openIsolatedCdpSession({ port, expectedUrl, timeoutMs: 15_000 });
const results = [];

async function seedAndReload(localStorageExtra = {}) {
  const setters = [`window.localStorage.clear()`, `window.localStorage.setItem('material-cookie-clicker:save:v1', ${JSON.stringify(saveJson)})`];
  for (const [key, value] of Object.entries(localStorageExtra)) {
    setters.push(`window.localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(value)})`);
  }
  setters.push(`'seeded'`);
  await session.evaluate(setters.join('; '));
  await session.send('Page.navigate', { url: expectedUrl });
  await waitFor(session, `document.readyState === 'complete'`);
  await waitFor(session, `document.querySelector('.console') !== null || document.body.textContent.length > 0`);
}

async function capture(stateId) {
  const shot = await session.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const bytes = Buffer.from(shot.result.data, 'base64');
  if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error(`${stateId} capture is not a PNG.`);
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const path = resolve(outDir, `${stateId}.png`);
  writeFileSync(path, bytes);
  const record = { state: stateId, path, sha256: sha256(bytes), width, height, capturedAt: new Date().toISOString() };
  results.push(record);
  return record;
}

try {
  await session.send('Page.enable');
  await session.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  /* ---------------------------------------------------------------- appearance-editor */
  await seedAndReload();
  await waitFor(session, `document.querySelector('#console-tools') !== null`);
  await click(session, '#console-tools');
  await waitFor(session, `document.querySelector('.tool-node, [data-tool-id]') !== null || document.body.textContent.includes('Appearance Editor')`);
  // The appearanceEditor tool card's "Open it now" button. tools.ts renders real feature buttons;
  // find by accessible text rather than a brittle structural selector.
  await session.evaluate(`(() => {
    const buttons = [...document.querySelectorAll('button.open-real-feature__button')];
    const btn = buttons.find((b) => /appearance editor/i.test(b.closest('.item-card')?.textContent ?? ''));
    if (!btn) throw new Error('appearance editor open-now button not found');
    btn.click();
    return true;
  })()`);
  await waitFor(session, `document.querySelector('#canonical-appearance button') !== null`, 15_000);
  // Click, then poll: the teleport scroll and the button click can land in the same tick as a
  // still-settling tab switch, so retry the click rather than firing it exactly once.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await session.evaluate(`document.querySelector('.identity-appearance-editor') !== null`)) break;
    await session.evaluate(`document.querySelector('#canonical-appearance button')?.click()`);
    await new Promise((done) => setTimeout(done, 300));
  }
  await waitFor(session, `document.querySelector('.identity-appearance-editor') !== null`, 5_000);
  await capture('appearance-editor');

  /* --------------------------------------------------------------------- golden-dial-miss */
  await seedAndReload({ 'material-cookie-clicker:golden:fast': '1' });
  await waitFor(session, `document.querySelector('.golden-sprite') !== null`, 20_000);
  await click(session, '.golden-sprite');
  await waitFor(session, `document.querySelector('.golden-dial-card__stop') !== null`);
  // Press immediately: elapsed since catch is near zero, so the needle sits at position 0 —
  // outside every rolled zone (zoneCentre is drawn from [zoneHalfWidth, 1-zoneHalfWidth]).
  await click(session, '.golden-dial-card__stop');
  await waitFor(session, `document.querySelector('.golden-dial-card[data-feedback="miss"]') !== null`, 5_000);
  await capture('golden-dial-miss');

  /* ------------------------------------------------------------------------ prestige-keyed */
  await seedAndReload();
  await waitFor(session, `document.querySelector('#console-prestige') !== null`, 15_000);
  await click(session, '#console-prestige');
  await waitFor(session, `document.querySelector('.gate-trigger.tone-prestige') !== null`);
  await click(session, '.gate-trigger.tone-prestige');
  await waitFor(session, `document.querySelector('.gate.tone-prestige .gate__key-toggle') !== null`);
  await session.evaluate(`(() => {
    const keys = [...document.querySelectorAll('.gate.tone-prestige .gate__key-toggle')];
    keys.forEach((k) => k.click());
    return keys.length;
  })()`);
  await waitFor(session, `[...document.querySelectorAll('.gate.tone-prestige .gate__key-toggle')].every((k) => k.getAttribute('aria-pressed') === 'true')`);
  // Move the slider partway — enough to prove it unlocked, short of the 100 that completes it.
  await session.evaluate(`(() => {
    const input = document.querySelector('.gate.tone-prestige input[type="range"]');
    if (!input) throw new Error('slider not found');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, '55');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return input.value;
  })()`);
  await capture('prestige-keyed');

  /* -------------------------------------------------------------------- factory-reduced-motion */
  await session.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await seedAndReload();
  await waitFor(session, `window.matchMedia('(prefers-reduced-motion: reduce)').matches === true`);
  await waitFor(session, `document.querySelector('#console-factory') !== null`, 15_000);
  await click(session, '#console-factory');
  await waitFor(session, `(document.querySelector('[role="dialog"]')?.textContent?.length ?? 0) > 50`, 10_000);
  await capture('factory-reduced-motion');

  await session.send('Emulation.setEmulatedMedia', { features: [] });
} finally {
  session.close();
}

console.log(JSON.stringify(results, null, 2));
