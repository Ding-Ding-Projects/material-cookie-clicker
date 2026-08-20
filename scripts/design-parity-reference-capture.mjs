import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { openIsolatedCdpSession } from './cdp-isolated-session.mjs';

const [portText, expectedUrl, outputRootText] = process.argv.slice(2);
if (!portText || !expectedUrl || !outputRootText) {
  console.error('usage: node scripts/design-parity-reference-capture.mjs <port> <current-url> <output-root>');
  process.exit(2);
}

const port = Number(portText);
const outputRoot = resolve(outputRootText);
const inventory = JSON.parse(await readFile(new URL('../design/parity/inventory.json', import.meta.url), 'utf8'));
const origin = new URL(expectedUrl).origin;

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
    width: 1400,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  for (const row of inventory.rows) {
    const route = new URL(row.reference.route, origin);
    const startedAt = new Date().toISOString();
    await session.send('Page.navigate', { url: route.href });
    await waitFor(session, 'document.readyState', 'complete');
    await waitFor(session, 'document.querySelector("#route-status")?.dataset.state', 'ready');
    await waitFor(
      session,
      'document.querySelector("#reference-frame")?.contentDocument?.body?.dataset.designParityState',
      row.tuple.state,
    );
    const state = await session.evaluate(`(()=>{
      const frame=document.querySelector('#reference-frame');
      const rect=frame.getBoundingClientRect();
      return {
        file: document.querySelector('#reference-path')?.textContent,
        width: frame.contentWindow.innerWidth,
        height: frame.contentWindow.innerHeight,
        scale: frame.contentWindow.devicePixelRatio,
        lang: frame.contentDocument.documentElement.lang,
        theme: frame.contentDocument.body.dataset.scheme,
        state: frame.contentDocument.body.dataset.designParityState,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      };
    })()`);
    const capture = await session.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: state.rect.x, y: state.rect.y, width: 1280, height: 800, scale: 1 },
    });
    const bytes = Buffer.from(capture.result.data, 'base64');
    const rowRoot = resolve(outputRoot, row.id);
    await mkdir(rowRoot, { recursive: true });
    const rawPath = resolve(rowRoot, 'reference.png');
    await writeFile(rawPath, bytes, { flag: 'wx' });
    receipts.push({
      version: 1,
      id: row.id,
      route: 'cheap-lowlevel-headless',
      logicalRoute: row.reference.route,
      physicalRoute: route.href,
      tuple: row.tuple,
      state,
      capture: { path: rawPath, sha256: sha256(bytes), width: 1280, height: 800, startedAt, capturedAt: new Date().toISOString() },
    });
  }
} finally {
  session.close();
}
await writeFile(resolve(outputRoot, 'reference-receipts.json'), `${JSON.stringify(receipts, null, 2)}\n`, { flag: 'wx' });
console.log(`Captured ${receipts.length} reference routes into ${outputRoot}`);
