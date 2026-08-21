import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(resolve(p), 'utf8').replaceAll('\r\n', '\n');

/**
 * The one-cookie exit refuses a close until `chrome.close` is bought. That is deliberate and the
 * price is fixed at 1 by decree, so a single click on the cookie affords it.
 *
 * What was broken was the OTHER half. `main.ts` sent `window:close-refused` and its own comment
 * said the renderer was told "so it can flash the price plate" — but no listener existed in the
 * preload or the renderer, so pressing the taskbar's Close window, or Alt+F4, before buying did
 * nothing whatsoever and gave no reason. A refusal with no feedback is indistinguishable from a
 * frozen application.
 *
 * Measured on a fresh save with nothing bought, by sending the exact messages the taskbar sends:
 *   SC_MINIMIZE -> IsIconic became true   (taskbar minimize works and is not gated)
 *   SC_CLOSE    -> IsWindow stayed true   (taskbar close is refused, as designed)
 *
 * This guard exists because the defect was a channel wired at one end and consumed at neither,
 * which is invisible from both sides: the send succeeds, and the absent listener is not an error.
 * AGENTS.md records the same shape for a bundled dependency nothing could find.
 */
describe('a refused close tells the player why', () => {
  const main = read('src/main/main.ts');
  const preload = read('src/preload/index.ts');
  const app = read('src/renderer/App.tsx');

  it('still refuses the close before the exit is bought', () => {
    // The mechanic itself. If this ever stops being true, the guard below is guarding nothing.
    expect(main).toMatch(/^\s*if \(!closeAllowed\) \{/m);
    expect(main).toContain("window:close-refused");
  });

  it('keeps the exit at exactly one cookie', () => {
    const unlocks = read('src/shared/game/control-unlocks.ts');
    const block = unlocks.slice(unlocks.indexOf('id: "chrome.close"'));
    expect(block.slice(0, block.indexOf('},'))).toMatch(/price: 1,/);
  });

  it('has a listener for the refusal in the preload', () => {
    // Anchored to lines so a commented-out registration cannot satisfy either assertion.
    expect(preload).toMatch(/^\s*onCloseRefused: \(listener: \(\) => void\)/m);
    expect(preload).toMatch(/^\s*ipcRenderer\.on\('window:close-refused', handler\);/m);
    // It must unsubscribe, or a reload stacks listeners.
    expect(preload).toMatch(/^\s*return \(\) => ipcRenderer\.removeListener\('window:close-refused', handler\);/m);
  });

  it('consumes the refusal in the title bar and says something about it', () => {
    expect(app).toMatch(/^\s*const off = window\.materialCookieClicker\?\.window\.onCloseRefused\?\.\(/m);
    // Focus goes to the plate that sells the exit, so the keyboard lands where the answer is.
    expect(app).toContain('closeSlotRef.current?.focus()');
    expect(app).toContain('focusRef={closeSlotRef}');
    // And it is said in words, not only by a shake and an outline.
    expect(app).toContain('The window did not close.');
    expect(app).toMatch(/aria-live="assertive"/);
  });

  it('does not make motion the only signal', () => {
    const css = read('src/renderer/styles/index.css');
    const block = css.slice(css.indexOf('.coin-slot--refused {'));
    // An outline survives prefers-reduced-motion; the animation does not.
    expect(block).toMatch(/outline:\s*2px solid/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\n\s*\.coin-slot--refused \{\n\s*animation: none;/);
  });
});
