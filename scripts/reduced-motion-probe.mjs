/**
 * Capture harness helper, not a test: emulates prefers-reduced-motion on the running app, reloads
 * so any load-time gate re-runs, and PROVES the emulation took before anything is captured.
 *
 * A reduced-motion capture that was not actually taken under the preference is an ordinary
 * screenshot with a misleading label, so the proof is the point of this file.
 *
 * Usage: node scripts/reduced-motion-probe.mjs <port> <expected-page-url>
 */
import { openIsolatedCdpSession } from './cdp-isolated-session.mjs';

const [, , port, expectedUrl] = process.argv;
if (!port || !expectedUrl) {
  console.error('usage: node scripts/reduced-motion-probe.mjs <port> <expected-page-url>');
  process.exit(2);
}

const session = await openIsolatedCdpSession({ port, expectedUrl });
try {
  await session.send('Page.enable');
  await session.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await session.send('Page.reload', { ignoreCache: false });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if ((await session.evaluate('document.readyState')) === 'complete') break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await new Promise((resolve) => setTimeout(resolve, 800));
  const report = await session.evaluate(`JSON.stringify({
    reducedMotionActive: matchMedia('(prefers-reduced-motion: reduce)').matches,
    raidNodes: [...document.querySelectorAll('[class*="raid"],[class*="mouse"]')].slice(0, 6).map((node) => String(node.className)),
    runningAnimations: document.getAnimations ? document.getAnimations().filter((a) => a.playState === 'running').length : 'unavailable',
    text: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 220)
  }, null, 2)`);
  console.log(report);
} finally {
  session.close?.();
}
