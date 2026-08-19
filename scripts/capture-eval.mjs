/**
 * Capture harness: evaluates one JavaScript expression in the running app and prints the result.
 * Used only to inspect real layout metrics while iterating on a capture — the application
 * itself has no idea this exists.
 *
 * Usage: node scripts/capture-eval.mjs <port> <expected-page-url> "<expression>"
 */
import { openIsolatedCdpSession } from './cdp-isolated-session.mjs';

const port = process.argv[2] ?? '9222';
const expectedUrl = process.argv[3];
const expression = process.argv[4];
if (!expectedUrl || !expression) {
  console.error('usage: node scripts/capture-eval.mjs <port> <expected-page-url> "<expression>"');
  process.exit(2);
}

const session = await openIsolatedCdpSession({ port, expectedUrl });
try {
  console.log(JSON.stringify(await session.evaluate(expression), null, 2));
} finally {
  session.close();
}
