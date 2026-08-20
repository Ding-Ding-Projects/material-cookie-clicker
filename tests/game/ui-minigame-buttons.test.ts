import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8').replace(/\r\n?/g, '\n');
const playable = read('src/renderer/screens/MinigamesScreen.tsx');
const events = read('src/renderer/screens/MinigameEventsScreen.tsx');
const action = read('src/renderer/components/MinigameAction.tsx');
const css = read('src/renderer/styles/index.css');
const ACTION_BASE_SELECTOR = ":root:root body button.md3-action:not(.golden-sprite):not(.achievement-badge):not(.mini-ticket):not(.cookie-btn)";

function balancedBlock(source: string, header: string): string {
  const start = source.indexOf(header);
  expect(start, `missing exact CSS header: ${header}`).toBeGreaterThanOrEqual(0);
  const open = source.indexOf('{', start + header.length);
  expect(open, `missing opening brace: ${header}`).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(open + 1, index);
  }
  throw new Error(`unterminated CSS block: ${header}`);
}

function literalActions(source: string): string[] {
  return [...source.matchAll(/\bdata-action="([a-z0-9-]+)"/g)].map((match) => match[1]);
}

describe('hand-written minigame button inventory', () => {
  it('keeps every reachable action on the shared component seam', () => {
    expect([...new Set(literalActions(playable))].sort()).toEqual([
      'breakout-advance',
      'breakout-left',
      'breakout-right',
      'daily-objective',
      'klondike-draw',
      'klondike-move',
      'lifecycle-abandon',
      'lifecycle-complete',
      'lifecycle-minimize',
      'lifecycle-restart',
      'lucky-draw',
      'minesweeper-flag-mode',
    ]);
    expect(playable).toContain('data-action={`start-${id}`}');
    expect(playable).toContain('data-action={`2048-${direction}`}');

    expect(playable.match(/<button\b/g)).toHaveLength(2);
    expect(playable.match(/className="minigame-memory-card"/g)).toHaveLength(1);
    expect(playable.match(/className="minigame-mine-cell"/g)).toHaveLength(1);
  });

  it('keeps the alternate event surface on the same variants instead of legacy buy buttons', () => {
    expect([...new Set(literalActions(events))].sort()).toEqual([
      'drawer-close',
      'drawer-draw',
      'event-abandon',
      'event-minimize',
      'event-restart',
      'event-resume',
      'event-schedule',
      'events-lucky-toggle',
    ]);
    expect(events).not.toMatch(/<button\b/);
    expect(events).not.toContain('className="buy-btn"');
    expect(events).not.toContain('className="settings-modes__button"');
  });

  it('uses local hidden vector icons and keeps a ref/focus seam', () => {
    expect(action).toContain('forwardRef<HTMLButtonElement, MinigameActionProps>');
    expect(action).toContain('ref={ref}');
    expect(action).toContain('aria-hidden="true" focusable="false"');
    expect(action).toContain('className="md3-action__label"');
    expect(action).toContain('<span lang="zh-HK">{text.yue}</span>');
  });
});

describe('Material action anatomy and cascade', () => {
  it('beats the generic normalization with explicit 48px button anatomy', () => {
    const base = balancedBlock(css, ACTION_BASE_SELECTOR);
    expect(base).toMatch(/^\s*appearance:\s*none\s*;/m);
    expect(base).toMatch(/^\s*-webkit-appearance:\s*none\s*;/m);
    expect(base).toMatch(/^\s*display:\s*inline-flex\s*;/m);
    expect(base).toMatch(/^\s*min-block-size:\s*48px\s*;/m);
    expect(base).toMatch(/^\s*min-inline-size:\s*48px\s*;/m);
    expect(base).toMatch(/^\s*border:\s*1px solid var\(--md3-action-outline, transparent\)\s*;/m);
    expect(base).toMatch(/^\s*border-radius:\s*var\(--md-sys-shape-corner-full\)\s*;/m);
    expect(base).toContain('var(--md3-action-container');
    expect(base).toContain('var(--md3-action-ink');
    expect(base).toMatch(/^\s*white-space:\s*normal\s*;/m);
    expect(base).toMatch(/^\s*overflow-wrap:\s*anywhere\s*;/m);
  });

  it('ships filled, tonal, outlined, text, and two distinct destructive variants', () => {
    for (const variant of ['filled', 'tonal', 'outlined', 'text', 'danger-text', 'danger-outlined']) {
      const block = balancedBlock(css, `.md3-action--${variant}`);
      expect(block).toContain('--md3-action-container:');
      expect(block).toContain('--md3-action-ink:');
      expect(block).toContain('--md3-action-outline:');
    }
  });

  it('has independent hover, pressed, focus, and disabled state layers', () => {
    expect(balancedBlock(css, `${ACTION_BASE_SELECTOR}::before`)).toMatch(/^\s*opacity:\s*0\s*;/m);
    expect(balancedBlock(css, `${ACTION_BASE_SELECTOR}:hover:not(:disabled):not([aria-disabled='true'])::before`))
      .toContain('var(--md-sys-state-hover-opacity)');
    expect(balancedBlock(css, `${ACTION_BASE_SELECTOR}:active:not(:disabled):not([aria-disabled='true'])::before`))
      .toContain('var(--md-sys-state-pressed-opacity)');
    const focus = balancedBlock(css, `${ACTION_BASE_SELECTOR}:focus-visible`);
    expect(focus).toMatch(/^\s*outline:\s*3px solid var\(--md-sys-color-primary\)\s*;/m);
    expect(balancedBlock(css, `${ACTION_BASE_SELECTOR}:focus-visible::before`)).toContain('var(--md-sys-state-focus-opacity)');
    const disabled = balancedBlock(css, `${ACTION_BASE_SELECTOR}:disabled`);
    expect(disabled).toContain('12%');
    expect(disabled).toContain('38%');
    expect(disabled).toMatch(/^\s*cursor:\s*not-allowed\s*;/m);
  });

  it('draws a 40px tonal icon surface inside a 48px target with a fixed 24px glyph', () => {
    const iconButton = balancedBlock(
      css,
      ":root:root body button.md3-action.md3-action--icon:not(.golden-sprite):not(.achievement-badge):not(.mini-ticket):not(.cookie-btn)",
    );
    expect(iconButton).toMatch(/^\s*inline-size:\s*48px\s*;/m);
    expect(iconButton).toMatch(/^\s*block-size:\s*48px\s*;/m);
    expect(iconButton).toMatch(/^\s*padding:\s*4px\s*;/m);
    expect(iconButton).toMatch(/^\s*background-clip:\s*content-box\s*;/m);
    const icon = balancedBlock(css, '.md3-action__icon');
    expect(icon).toMatch(/^\s*inline-size:\s*24px\s*;/m);
    expect(icon).toMatch(/^\s*block-size:\s*24px\s*;/m);
  });
});

describe('responsive, reduced-motion, and accessibility contracts', () => {
  it('keeps actions and custom board cells at least 48px', () => {
    const memory = balancedBlock(
      css,
      ":root:root body button.minigame-memory-card:not(.golden-sprite):not(.achievement-badge):not(.mini-ticket):not(.cookie-btn)",
    );
    expect(memory).toMatch(/^\s*min-inline-size:\s*48px\s*;/m);
    expect(memory).toMatch(/^\s*min-block-size:\s*48px\s*;/m);
    const mineGridAt = css.lastIndexOf('.minigame-grid-row--mines {');
    expect(mineGridAt).toBeGreaterThanOrEqual(0);
    const mines = balancedBlock(css.slice(mineGridAt), '.minigame-grid-row--mines');
    expect(mines).toMatch(/^\s*grid-template-columns:\s*repeat\(8, 48px\)\s*;/m);
    expect(balancedBlock(css, '.minigame-board--mines-wrap')).toMatch(/^\s*overflow-x:\s*auto\s*;/m);
  });

  it('uses a one-column 320px-safe action layout and stops motion transitions', () => {
    const narrowAt = css.lastIndexOf('@media (max-width: 480px)');
    expect(narrowAt).toBeGreaterThanOrEqual(0);
    const narrow = balancedBlock(css.slice(narrowAt), '@media (max-width: 480px)');
    expect(balancedBlock(narrow, '.minigame-picker')).toMatch(/^\s*grid-template-columns:\s*minmax\(0, 1fr\)\s*;/m);
    expect(narrow).toContain('flex: 1 1 100%');

    const reducedAt = css.lastIndexOf('@media (prefers-reduced-motion: reduce)');
    expect(reducedAt).toBeGreaterThanOrEqual(0);
    const reduced = balancedBlock(css.slice(reducedAt), '@media (prefers-reduced-motion: reduce)');
    expect(reduced).toContain(ACTION_BASE_SELECTOR);
    expect(reduced).toMatch(/^\s*transition:\s*none\s*;/m);
  });

  it('keeps state, disabled reasons, grids, roving focus, and focus handoffs explicit', () => {
    expect(playable).toContain('aria-describedby={drawUnavailable ? \'lucky-draw-unavailable\' : undefined}');
    expect(playable).toContain("const lastLuckyResult = structure.luckyChance.lastResult");
    expect(playable).toContain("lastLuckyResult?.kind === 'duplicate'");
    expect(playable).toContain('role="grid"');
    expect(playable.match(/role="row"/g)).toHaveLength(2);
    expect(playable.match(/role="gridcell"/g)).toHaveLength(2);
    expect(playable).toContain('aria-rowcount={game.height}');
    expect(playable).toContain('aria-colcount={game.width}');
    expect(playable).toContain('tabIndex={index === focusIndex ? 0 : -1}');
    expect(playable).toContain("event.key === 'ArrowLeft'");
    expect(playable).toContain('pendingActiveFocusRef.current = true');
    expect(playable).toContain('pendingPickerFocusRef.current = true');
    expect(playable).toContain('luckyResultRef.current.focus()');
    expect(playable).toContain('aria-labelledby={`memory-card-${index}-label`}');
    expect(playable).toContain('aria-labelledby={`mine-cell-${index}-label`}');
    expect(playable.match(/className="minigame-live-result" role="status" aria-live="polite"/g)).toHaveLength(2);
    expect(playable).toContain('Pair matched.');
    expect(playable).toContain('mine revealed.');
  });
});
