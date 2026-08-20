import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { openIsolatedCdpSession } from './cdp-isolated-session.mjs';

const [portText, expectedUrl, outputRootText] = process.argv.slice(2);
if (!portText || !expectedUrl || !outputRootText) {
  console.error('usage: node scripts/design-parity-capture.mjs <port> <current-url> <output-root>');
  process.exit(2);
}

const port = Number(portText);
const outputRoot = resolve(outputRootText);
const inventory = JSON.parse(await readFile(new URL('../design/parity/inventory.json', import.meta.url), 'utf8'));

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function waitFor(session, expression, expected, timeoutMs = 10_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await session.evaluate(expression) === expected) return;
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(`Timed out waiting for ${expression}`);
}

await mkdir(outputRoot, { recursive: true });
const session = await openIsolatedCdpSession({ port, expectedUrl, timeoutMs: 15_000 });
const receipts = [];
try {
  await session.send('Page.enable');
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  for (const row of inventory.rows) {
    const query = new URL(row.product.route).search;
    const physicalUrl = new URL(expectedUrl);
    physicalUrl.search = query;
    const startedAt = new Date().toISOString();
    await session.send('Page.navigate', { url: physicalUrl.href });
    await waitFor(session, 'document.readyState', 'complete');
    await waitFor(
      session,
      `document.querySelector('main[data-design-parity-row="${row.id}"]')?.getAttribute('data-design-parity-state')`,
      row.tuple.state,
    );
    const state = await session.evaluate(`({
      row: document.querySelector('main[data-design-parity-row]')?.dataset.designParityRow,
      fixture: document.querySelector('main[data-design-parity-row]')?.dataset.designParityFixture,
      width: innerWidth,
      height: innerHeight,
      scale: devicePixelRatio,
      lang: document.documentElement.lang,
      theme: document.documentElement.dataset.theme,
      network: document.querySelector('main[data-design-parity-row]')?.dataset.network,
      motion: document.querySelector('main[data-design-parity-row]')?.dataset.motion
    })`);
    const capture = await session.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const bytes = Buffer.from(capture.result.data, 'base64');
    const rowRoot = resolve(outputRoot, row.id);
    await mkdir(rowRoot, { recursive: true });
    const rawPath = resolve(rowRoot, 'product.png');
    await writeFile(rawPath, bytes, { flag: 'wx' });
    receipts.push({
      version: 1,
      id: row.id,
      route: 'cheap-lowlevel-headless',
      logicalRoute: row.product.route,
      physicalRoute: physicalUrl.href,
      tuple: row.tuple,
      state,
      capture: { path: rawPath, sha256: sha256(bytes), width: 1280, height: 800, startedAt, capturedAt: new Date().toISOString() },
    });
  }
} finally {
  session.close();
}
await writeFile(resolve(outputRoot, 'product-receipts.json'), `${JSON.stringify(receipts, null, 2)}\n`, { flag: 'wx' });
console.log(`Captured ${receipts.length} product routes into ${outputRoot}`);
