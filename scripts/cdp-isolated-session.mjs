const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

function normalizeUrl(value) {
  return new URL(value).href;
}

export function validateOnlyExpectedPageTarget(targets, expectedUrl, port) {
  if (!Array.isArray(targets)) throw new Error('Chrome DevTools /json/list did not return an array.');
  if (targets.length !== 1) {
    throw new Error(`Capture isolation failed: expected exactly one target, received ${targets.length}.`);
  }
  const [target] = targets;
  if (target?.type !== 'page') throw new Error(`Capture isolation failed: the only target is ${target?.type ?? 'unknown'}, not page.`);
  const actual = normalizeUrl(target.url);
  const expected = normalizeUrl(expectedUrl);
  if (actual !== expected) throw new Error(`Capture isolation failed: target URL ${actual} does not equal ${expected}.`);
  if (typeof target.webSocketDebuggerUrl !== 'string' || target.webSocketDebuggerUrl.length === 0) {
    throw new Error('Capture isolation failed: the page target has no WebSocket debugger URL.');
  }
  const debuggerUrl = new URL(target.webSocketDebuggerUrl);
  if (!LOOPBACK_HOSTS.has(debuggerUrl.hostname) || debuggerUrl.port !== String(port)) {
    throw new Error('Capture isolation failed: the debugger WebSocket is not on the requested loopback endpoint.');
  }
  return target;
}

export async function resolveOnlyExpectedPageTarget({ port, expectedUrl, timeoutMs = 5_000, fetchImpl = fetch }) {
  const response = await fetchImpl(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`Chrome DevTools target discovery returned HTTP ${response.status}.`);
  return validateOnlyExpectedPageTarget(await response.json(), expectedUrl, port);
}

export class CdpSession {
  #socket;
  #nextId = 1;
  #pending = new Map();
  #timeoutMs;

  constructor(socket, timeoutMs = 10_000) {
    this.#socket = socket;
    this.#timeoutMs = timeoutMs;
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      const pending = this.#pending.get(message.id);
      if (!pending) return;
      this.#pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(`Chrome DevTools ${pending.method} failed: ${message.error.message}`));
      else pending.resolve(message);
    });
    socket.addEventListener('close', () => {
      for (const pending of this.#pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`Chrome DevTools connection closed while ${pending.method} was pending.`));
      }
      this.#pending.clear();
    });
  }

  send(method, params = {}) {
    const id = this.#nextId++;
    this.#socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`Chrome DevTools ${method} exceeded ${this.#timeoutMs}ms.`));
      }, this.#timeoutMs);
      this.#pending.set(id, { method, resolve, reject, timer });
    });
  }

  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', { expression, returnByValue: true });
    if (response.result?.exceptionDetails) {
      throw new Error(response.result.exceptionDetails.exception?.description ?? JSON.stringify(response.result.exceptionDetails));
    }
    return response.result?.result?.value;
  }

  close() {
    this.#socket.close();
  }
}

export async function openIsolatedCdpSession({ port, expectedUrl, timeoutMs = 10_000, WebSocketImpl = WebSocket }) {
  const target = await resolveOnlyExpectedPageTarget({ port, expectedUrl, timeoutMs });
  const socket = new WebSocketImpl(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Chrome DevTools WebSocket exceeded ${timeoutMs}ms while opening.`)), timeoutMs);
    socket.addEventListener('open', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
    socket.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('Chrome DevTools WebSocket could not be opened.'));
    }, { once: true });
  });
  return new CdpSession(socket, timeoutMs);
}
