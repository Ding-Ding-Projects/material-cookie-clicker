/** Clears any emulated media so a following capture is taken under default conditions. */
import { openIsolatedCdpSession } from './cdp-isolated-session.mjs';
const [, , port, expectedUrl] = process.argv;
const session = await openIsolatedCdpSession({ port, expectedUrl });
try {
  await session.send('Page.enable');
  await session.send('Emulation.setEmulatedMedia', { features: [] });
  await session.send('Page.reload', { ignoreCache: false });
  for (let i = 0; i < 80; i += 1) {
    if ((await session.evaluate('document.readyState')) === 'complete') break;
    await new Promise((r) => setTimeout(r, 100));
  }
  await new Promise((r) => setTimeout(r, 500));
  console.log(await session.evaluate(`JSON.stringify({ reduced: matchMedia('(prefers-reduced-motion: reduce)').matches })`));
} finally { session.close?.(); }
