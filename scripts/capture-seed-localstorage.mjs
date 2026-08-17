/**
 * Capture harness: pushes a pre-built save into the running app's localStorage over the
 * Chrome DevTools Protocol, then reloads the window so the game boots from it.
 *
 * This exists because the renderer persists to localStorage (see
 * src/renderer/game/persistence.ts — the save IPC bridge is not wired into preload yet), and a
 * localStorage value cannot be written from outside the browser process. It is a harness for
 * taking honest screenshots of a progressed save; nothing in the application depends on it.
 *
 * Usage: node scripts/capture-seed-localstorage.mjs <port> <save-json-path>
 */
import { readFileSync } from 'node:fs';

const port = process.argv[2] ?? '9222';
const savePath = process.argv[3];
if (!savePath) {
  console.error('usage: node scripts/capture-seed-localstorage.mjs <port> <save-json-path>');
  process.exit(2);
}

const payload = readFileSync(savePath, 'utf8');

const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = targets.find((t) => t.type === 'page');
if (!page) {
  console.error('no page target found');
  process.exit(1);
}

const socket = new WebSocket(page.webSocketDebuggerUrl);
let nextId = 1;
const pending = new Map();

function send(method, params) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve) => pending.set(id, resolve));
}

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  const resolve = pending.get(message.id);
  if (resolve) {
    pending.delete(message.id);
    resolve(message);
  }
});

await new Promise((resolve) => socket.addEventListener('open', resolve));

const expression = `window.localStorage.setItem('material-cookie-clicker:save:v1', ${JSON.stringify(payload)}); 'seeded'`;
const result = await send('Runtime.evaluate', { expression, returnByValue: true });
console.log('seed:', JSON.stringify(result.result?.result?.value ?? result.result));

await send('Page.reload', { ignoreCache: false });
console.log('reloaded');
socket.close();
