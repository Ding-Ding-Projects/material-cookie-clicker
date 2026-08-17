/**
 * Capture harness: evaluates one JavaScript expression in the running app and prints the result.
 * Used only to inspect real layout metrics while iterating on a capture — the application
 * itself has no idea this exists.
 *
 * Usage: node scripts/capture-eval.mjs <port> "<expression>"
 */
const port = process.argv[2] ?? '9222';
const expression = process.argv[3];
if (!expression) {
  console.error('usage: node scripts/capture-eval.mjs <port> "<expression>"');
  process.exit(2);
}

const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = targets.find((t) => t.type === 'page');
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
const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
console.log(JSON.stringify(result.result?.result?.value ?? result.result, null, 2));
socket.close();
