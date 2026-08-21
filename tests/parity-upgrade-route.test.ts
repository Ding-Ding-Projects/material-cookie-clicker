import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { UPGRADE_PARITY_ART, UpgradeParityScene } from '../src/renderer/parity/UpgradeParityScene.js';

const root = resolve(import.meta.dirname, '..');
const scenePath = resolve(root, 'src/renderer/parity/UpgradeParityScene.tsx');
const sceneCssPath = resolve(root, 'src/renderer/styles/parity-upgrade-scene.css');
const globalCssPath = resolve(root, 'src/renderer/styles/index.css');
const sceneSource = readFileSync(scenePath, 'utf8').replace(/\r\n?/g, '\n');
const sceneCss = readFileSync(sceneCssPath, 'utf8').replace(/\r\n?/g, '\n');
const globalCss = readFileSync(globalCssPath, 'utf8').replace(/\r\n?/g, '\n');

const panelSelector =
  ":root:root[data-design-parity='upgrade-card--gallery'] body .design-parity-route .parity-upgrade-scene__panel";
const titleSelector =
  ":root:root[data-design-parity='upgrade-card--gallery'] body .design-parity-route .parity-upgrade-scene__title";
const countSelector =
  ":root:root[data-design-parity='upgrade-card--gallery'] body .design-parity-route .parity-upgrade-scene__count";
const gridSelector =
  ":root:root[data-design-parity='upgrade-card--gallery'] body .design-parity-route .parity-upgrade-scene__grid";
const cardSelector =
  ":root:root[data-design-parity='upgrade-card--gallery'] body .design-parity-route .parity-upgrade-scene .parity-upgrade-card";
const buyableSelector =
  ":root:root[data-design-parity='upgrade-card--gallery'] body .design-parity-route[data-design-parity-row='upgrade-card--gallery'] .parity-upgrade-scene .parity-upgrade-scene__grid button.parity-upgrade-card.parity-upgrade-card--buyable";
const ownedSelector =
  ":root:root[data-design-parity='upgrade-card--gallery'] body .design-parity-route .parity-upgrade-scene .shelf-stamp.parity-upgrade-card--owned";
const artSelector =
  ":root:root[data-design-parity='upgrade-card--gallery'] body .design-parity-route .parity-upgrade-scene .parity-upgrade-card__art";
const iconSelector =
  ":root:root[data-design-parity='upgrade-card--gallery'] body .design-parity-route .parity-upgrade-scene .parity-upgrade-card__art .game-icon";
const descriptionSelector =
  ":root:root[data-design-parity='upgrade-card--gallery'] body .design-parity-route .parity-upgrade-scene .parity-upgrade-card__description";
const stateSelector =
  ":root:root[data-design-parity='upgrade-card--gallery'] body .design-parity-route .parity-upgrade-scene .parity-upgrade-card__state";

type Specificity = readonly [ids: number, classes: number, types: number];

function balancedBlock(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`Missing exact CSS selector: ${selector}`);
  const open = source.indexOf('{', start + selector.length);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(open + 1, index);
  }
  throw new Error(`Unterminated CSS block: ${selector}`);
}

function declarations(block: string): ReadonlyMap<string, string> {
  const values = new Map<string, string>();
  for (const candidate of block.replace(/\/\*[\s\S]*?\*\//g, '').split(';')) {
    const colon = candidate.indexOf(':');
    if (colon < 0) continue;
    const property = candidate.slice(0, colon).trim();
    const value = candidate.slice(colon + 1).trim().replace(/\s+/g, ' ');
    if (property) values.set(property, value);
  }
  return values;
}

function requireDeclaration(
  source: string,
  selector: string,
  property: string,
  expected: string,
): void {
  const actual = declarations(balancedBlock(source, selector)).get(property);
  if (actual !== expected) {
    throw new Error(`${selector} must declare ${property}: ${expected}; received ${actual ?? '(missing)'}`);
  }
}

function specificity(selector: string): Specificity {
  const ids = selector.match(/#[a-z0-9_-]+/gi)?.length ?? 0;
  const classNames = selector.match(/\.[a-z0-9_-]+/gi)?.length ?? 0;
  const attributes = selector.match(/\[[^\]]+\]/g)?.length ?? 0;
  const pseudoClasses = [...selector.matchAll(/:(?!:)([a-z-]+)(?:\([^)]*\))?/gi)]
    .filter((match) => match[1].toLowerCase() !== 'not')
    .length;
  const types = selector.match(/(?:^|[\s>+~])(?:body|button)(?=[\s.#:[>+~]|$)/gi)?.length ?? 0;
  return [ids, classNames + attributes + pseudoClasses, types];
}

function compareSpecificity(left: Specificity, right: Specificity): number {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function selectorContaining(source: string, marker: string): string {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) throw new Error(`Missing CSS selector marker: ${marker}`);
  const lineStart = source.lastIndexOf('\n', markerIndex) + 1;
  const open = source.indexOf('{', markerIndex);
  if (open < 0) throw new Error(`Missing opening brace after CSS selector marker: ${marker}`);
  return source.slice(lineStart, open).trim();
}

function occurrenceCount(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

function assertUpgradeParityCss(candidate: string): void {
  requireDeclaration(candidate, panelSelector, 'gap', '28px');
  requireDeclaration(candidate, panelSelector, 'padding', '20px');
  requireDeclaration(candidate, panelSelector, 'border-radius', 'var(--md-sys-shape-corner-extra-large)');
  requireDeclaration(candidate, panelSelector, 'background', 'var(--md-sys-color-surface-container-low)');
  requireDeclaration(candidate, panelSelector, 'box-shadow', 'var(--md-sys-elevation-level-1)');

  requireDeclaration(candidate, titleSelector, 'font', '500 18px/24px var(--font-en)');
  requireDeclaration(candidate, countSelector, 'min-block-size', '32px');
  requireDeclaration(candidate, countSelector, 'padding', '6px 12px');
  requireDeclaration(candidate, countSelector, 'background', 'var(--md-sys-color-secondary-container)');

  requireDeclaration(candidate, gridSelector, 'grid-template-columns', 'repeat(3, minmax(0, 1fr))');
  requireDeclaration(candidate, gridSelector, 'align-items', 'stretch');
  requireDeclaration(candidate, gridSelector, 'gap', '22px');

  const actualBuyableSelector = selectorContaining(
    candidate,
    'button.parity-upgrade-card',
  );
  if (actualBuyableSelector !== buyableSelector) {
    throw new Error(`Unexpected buyable-card selector: ${actualBuyableSelector}`);
  }

  for (const selector of [cardSelector, actualBuyableSelector]) {
    requireDeclaration(candidate, selector, 'display', 'grid');
    requireDeclaration(candidate, selector, 'align-items', 'stretch');
    requireDeclaration(candidate, selector, 'width', 'auto');
    requireDeclaration(candidate, selector, 'height', 'auto');
    requireDeclaration(candidate, selector, 'inline-size', 'auto');
    requireDeclaration(candidate, selector, 'block-size', 'auto');
    requireDeclaration(candidate, selector, 'min-block-size', '220px');
    requireDeclaration(candidate, selector, 'padding', '20px');
    requireDeclaration(candidate, selector, 'border', '1px dashed var(--md-sys-color-outline-variant)');
    requireDeclaration(candidate, selector, 'border-radius', 'var(--md-sys-shape-corner-extra-large)');
    requireDeclaration(candidate, selector, 'background-color', 'var(--md-sys-color-surface-container-low)');
    requireDeclaration(candidate, selector, 'box-shadow', 'var(--md-sys-elevation-level-1)');
    requireDeclaration(candidate, selector, 'opacity', '1');
  }

  requireDeclaration(candidate, ownedSelector, 'width', 'auto');
  requireDeclaration(candidate, ownedSelector, 'height', 'auto');
  requireDeclaration(candidate, ownedSelector, 'inline-size', 'auto');
  requireDeclaration(candidate, ownedSelector, 'block-size', 'auto');
  requireDeclaration(candidate, ownedSelector, 'opacity', '1');
  requireDeclaration(candidate, ownedSelector, 'background-color', 'var(--tertiary-container)');

  requireDeclaration(candidate, artSelector, 'min-block-size', '64px');
  requireDeclaration(candidate, artSelector, 'font-size', '44px');
  requireDeclaration(candidate, iconSelector, 'width', '44px');
  requireDeclaration(candidate, iconSelector, 'height', '44px');
  requireDeclaration(candidate, iconSelector, 'inline-size', '44px');
  requireDeclaration(candidate, iconSelector, 'block-size', '44px');

  for (const selector of [descriptionSelector, stateSelector]) {
    requireDeclaration(candidate, selector, 'overflow', 'visible');
    requireDeclaration(candidate, selector, 'text-overflow', 'clip');
    requireDeclaration(candidate, selector, 'white-space', 'normal');
  }
  requireDeclaration(candidate, descriptionSelector, 'font', '400 16px/24px var(--font-en)');
  requireDeclaration(candidate, stateSelector, 'font', '700 16px/24px var(--font-en)');
}

describe('upgrade parity route', () => {
  it('keeps exact copy, three distinct states, and independent product-authored SVG families', () => {
    const markup = renderToStaticMarkup(createElement(UpgradeParityScene));
    expect(markup).toContain('Upgrades · 升級');
    expect(markup.match(/data-parity-upgrade-state=/g)).toHaveLength(3);
    expect(markup).toContain('Locked · 未解鎖 (12 / 50)');
    expect(markup).toContain('Buy · 買 — 🍪 5,000');
    expect(markup).toContain('Already owned · 已經買咗');
    expect(markup).toMatch(
      /<h2 class="parity-upgrade-scene__title"><span>Upgrades · 升級<\/span><span class="parity-upgrade-scene__count">1 \/ 3<\/span><\/h2>/,
    );
    expect(markup.match(/<svg\b/g)).toHaveLength(3);
    expect(markup.match(/focusable="false"/g)).toHaveLength(3);
    expect(markup.match(/viewBox="0 0 32 32"/g)).toHaveLength(3);
    expect(UPGRADE_PARITY_ART).toEqual({ locked: 'locked', buyable: 'click', owned: 'global' });
    expect(sceneSource).toContain('<UpgradeIcon family={UPGRADE_PARITY_ART.owned} />');
    expect(sceneSource).not.toMatch(/[🔒🥄🧈]/u);
  });

  it('computes a source-level style contract that wins the generic cascade', () => {
    expect(() => assertUpgradeParityCss(sceneCss)).not.toThrow();
    expect(sceneCss).not.toContain('material-reference.css');
    expect(sceneCss).not.toMatch(/url\s*\(/i);
  });

  it('turns red when the owned stamp collapses and green after restore', () => {
    const needle = `${ownedSelector} {\n  width: auto;`;
    expect(occurrenceCount(sceneCss, needle)).toBe(1);
    const broken = sceneCss.replace(needle, `${ownedSelector} {\n  width: 22px;`);
    expect(broken).not.toBe(sceneCss);
    expect(() => assertUpgradeParityCss(broken)).toThrow(/must declare width: auto; received 22px/);
    expect(() => assertUpgradeParityCss(sceneCss)).not.toThrow();
  });

  /**
   * This used to assert the buyable selector outranked the Material Design 3 blanket button rule.
   * That rule was removed on 2026-08-20 when the owner reverted the M3 migration, so there is no
   * longer a generic selector to outrank and the specificity requirement went with it.
   *
   * The breakage is still worth catching, so the test keeps its shape and now asserts through the
   * surviving exact-selector check. Deleting it outright would have quietly dropped the coverage.
   */
  it('turns red when the buyable selector is weakened and green after restore', () => {
    const weakened = '.parity-upgrade-scene button.parity-upgrade-card--buyable';
    expect(occurrenceCount(sceneCss, buyableSelector)).toBe(4);
    const broken = sceneCss.replace(buyableSelector, weakened);
    expect(broken).not.toBe(sceneCss);
    expect(() => assertUpgradeParityCss(broken)).toThrow(/Unexpected buyable-card selector/);
    expect(() => assertUpgradeParityCss(sceneCss)).not.toThrow();
  });
});
