/**
 * Capture harness: pushes a pre-built save into the running app's localStorage over the
 * Chrome DevTools Protocol, then reloads the window so the game boots from it.
 *
 * This exists because the renderer persists to localStorage (see
 * src/renderer/game/persistence.ts — the save IPC bridge is not wired into preload yet), and a
 * localStorage value cannot be written from outside the browser process. It is a harness for
 * taking honest screenshots of a progressed save; nothing in the application depends on it.
 *
 * Usage: node scripts/capture-seed-localstorage.mjs <port> <expected-page-url> <save-json-path>
 */
import { readFileSync } from 'node:fs';
import { openIsolatedCdpSession } from './cdp-isolated-session.mjs';

const port = process.argv[2] ?? '9222';
const expectedUrl = process.argv[3];
const savePath = process.argv[4];
if (!expectedUrl || !savePath) {
  console.error('usage: node scripts/capture-seed-localstorage.mjs <port> <expected-page-url> <save-json-path>');
  process.exit(2);
}

const payload = readFileSync(savePath, 'utf8');

const session = await openIsolatedCdpSession({ port, expectedUrl });
const expression = `window.localStorage.setItem('material-cookie-clicker:save:v1', ${JSON.stringify(payload)}); 'seeded'`;
try {
  console.log('seed:', JSON.stringify(await session.evaluate(expression)));
  await session.send('Page.reload', { ignoreCache: false });
  console.log('reloaded');
} finally {
  session.close();
}
