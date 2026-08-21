import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * THIS GAME IS EXEMPT FROM THE GLOBAL MATERIAL DESIGN 3 REQUIREMENT.
 *
 * On 2026-08-19 commit f3a477a migrated the application chrome to Material Design 3, following the
 * standing global instruction that every user-facing app conform to it. On 2026-08-20 the owner
 * reverted that decision for this project: "i never said to migrate to material design 3", and
 * "i want it to have the cookie clicker feel".
 *
 * The harm was one rule. At roughly (0,6,2) specificity it reached every button in the application
 * except four classes exempted by name, and it reset exactly the four properties the arcade look is
 * built from:
 *
 *   border: 0              -> every bevel and cabinet frame gone
 *   background-image: none -> every gradient and texture gone
 *   box-shadow: <level-0>  -> every bit of depth gone
 *   filter: none           -> every glow gone
 *
 * This guard exists because the global instruction that produced the migration is still in force
 * elsewhere, so an agent reading it and finding no exemption here will migrate this app again. That
 * has to fail loudly rather than land as a surprise redesign.
 *
 * WHAT THIS DOES NOT FORBID:
 *
 * The `--md-sys-*` token ALIASES. Those are names mapped onto the game's own tokens and repaint
 * nothing; roughly 70 later declarations and three sibling stylesheets read them, so removing the
 * names would resolve those to `unset` and blank real surfaces. Aliasing is fine; repainting is not.
 *
 * A CLASS-SCOPED treatment such as `button.md3-action`. That is opt-in — a component asked for it.
 * The harm was an unqualified `button` selector reaching components that never opted into anything.
 */
describe('Material Design 3 is not re-applied to this game', () => {
  const raw = readFileSync(resolve('src/renderer/styles/index.css'), 'utf8').replaceAll('\r\n', '\n');
  // Strip comments before scanning. Without this the scan matches the very comment that documents
  // the removed rule, and a guard that fails on its own explanation is a guard nobody keeps. This
  // repository has hit the comment-becomes-part-of-the-selector trap before.
  const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');

  it('has no blanket rule flattening every button in the application', () => {
    // Anchored to the line so a commented-out rule cannot satisfy it, and matched by shape rather
    // than by the exact old text so a reworded revival is still caught. The negative lookahead is
    // what separates "every button" from an opt-in component class.
    const blanket = css
      .split('\n')
      .filter((line) => /^\s*:root:root body button(?![.#[])/.test(line));
    expect(
      blanket,
      'a blanket `body button:not(...)` rule is how the arcade look was flattened once already',
    ).toEqual([]);
  });

  it('does not strip the four properties the arcade look is built from, app-wide', () => {
    // A scoped rule may legitimately reset these on one surface. What must not return is a reset
    // applied through a selector that reaches every button at once.
    const bodyWide = css.split('\n\n').filter((block) => {
      const selector = block.split('{')[0] ?? '';
      if (!/:root:root body (?:button|:is\(button)(?![.#[])/.test(selector)) return false;
      return /border:\s*0|background-image:\s*none|filter:\s*none/.test(block);
    });
    expect(bodyWide, 'reset these per surface, never across every button at once').toEqual([]);
  });

  it('keeps the token aliases, which are names and not appearance', () => {
    expect(raw).toMatch(/^\s*--md-sys-color-primary: var\(--primary\);/m);
    expect(raw).toContain('MATERIAL TOKEN ALIASES');
  });

  it('records the exemption where an agent will actually read it', () => {
    expect(readFileSync(resolve('AGENTS.md'), 'utf8')).toMatch(/exempt from Material Design 3/i);
  });
});
