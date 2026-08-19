import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const stylesheetPath = resolve(process.cwd(), 'src/renderer/styles/index.css');
const stylesheet = readFileSync(stylesheetPath, 'utf8').replaceAll('\r\n', '\n');
const inventoryPath = resolve(process.cwd(), 'design/parity/inventory.json');
const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8')) as {
  auditRecords: Record<string, { status: string; primitives: Record<string, { status: string }> }>;
};

const requiredTokens = [
  '--md-sys-color-primary:',
  '--md-sys-color-surface-container-high:',
  '--md-sys-shape-corner-extra-large:',
  '--md-sys-elevation-level-3:',
  '--md-sys-state-hover-opacity:',
  '--md-sys-motion-easing-emphasized:',
  '--md-sys-typescale-title-medium-font:',
] as const;

const requiredPrimitiveSelectors = [
  "button:not(.golden-sprite):not(.achievement-badge):not(.mini-ticket):not(.cookie-btn)",
  ':root:root body .cookie-btn',
  "input[type='text']",
  "[role='tab'][aria-selected='true']",
  "input[type='checkbox']:not([role='switch'])",
  "input[type='checkbox'][role='switch']",
  "input[type='range']::-webkit-slider-runnable-track",
  "[role='dialog']",
  "[role='menu']",
  ".achievement-toast",
  "@media (prefers-reduced-motion: reduce)",
] as const;

const requiredChromeSurfaces = [
  '.achievement-cell',
  '.building-row',
  '.shop-row',
  '.item-card',
  '.stat-tile',
  '.canonical-tool-card',
  '.settings-block',
  '.regex-popover',
  '.anchored-panel',
] as const;

const requiredAuditIds = [
  'm3-foundations-v1',
  'm3-game-surface-v1',
  'm3-list-controls-v1',
  'm3-settings-v1',
  'm3-feedback-v1',
] as const;

function extractMaterialChrome(css: string): string {
  const marker = 'MATERIAL DESIGN 3 EXPRESSIVE PRODUCT CHROME';
  const markerIndex = css.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error('Material chrome section is missing');
  }
  return css.slice(markerIndex);
}

function auditMaterialChrome(css: string): void {
  const chrome = extractMaterialChrome(css);

  for (const token of requiredTokens) {
    if (!chrome.includes(token)) {
      throw new Error(`Missing Material token ${token}`);
    }
  }

  for (const selector of requiredPrimitiveSelectors) {
    if (!chrome.includes(selector)) {
      throw new Error(`Missing Material primitive selector ${selector}`);
    }
  }
  for (const surface of requiredChromeSurfaces) {
    if (!chrome.includes(surface)) {
      throw new Error(`Missing inventoried Material surface ${surface}`);
    }
  }

  if (!chrome.includes('color-mix(')) {
    throw new Error('Material state layers are missing');
  }
  if (!chrome.includes('outline: 3px solid var(--md-sys-color-primary)')) {
    throw new Error('Material focus ring is missing');
  }
  if (!chrome.includes('min-block-size: 48px')) {
    throw new Error('Minimum touch-target contract is missing');
  }

  const forbiddenChrome = [
    /button[^{}]*\{[^{}]*box-shadow:\s*var\(--press-/s,
    /\[role='dialog'\][^{}]*\{[^{}]*linear-gradient/s,
    /\[role='tab'\][^{}]*\{[^{}]*translateY/s,
    /input\[type='range'\]::-webkit-slider-runnable-track[^{}]*\{[^{}]*var\(--press-/s,
  ];
  for (const pattern of forbiddenChrome) {
    if (pattern.test(chrome)) {
      throw new Error(`Legacy product chrome survived: ${pattern.source}`);
    }
  }
}

function auditLedger(records: typeof inventory.auditRecords): void {
  for (const auditId of requiredAuditIds) {
    const audit = records[auditId];
    if (!audit || audit.status !== 'defect') {
      throw new Error(`Material audit ${auditId} must stay pending until visual evidence lands`);
    }
    const defects = Object.entries(audit.primitives).filter(([, primitive]) => primitive.status !== 'conforming');
    if (defects.length > 0) {
      throw new Error(`Material audit ${auditId} has nonconforming primitives: ${defects.map(([name]) => name).join(', ')}`);
    }
  }
}

describe('Material Design 3 Expressive product chrome', () => {
  it('provides fail-closed tokens and anatomy for every repaired primitive', () => {
    expect(() => auditMaterialChrome(stylesheet)).not.toThrow();
  });

  it.each(requiredTokens)('turns red when token %s disappears', (token) => {
    expect(() => auditMaterialChrome(stylesheet.replace(token, `--removed-${token.slice(2)}`))).toThrow(
      `Missing Material token ${token}`,
    );
  });

  it.each(requiredPrimitiveSelectors)('turns red when primitive %s disappears', (selector) => {
    expect(() => auditMaterialChrome(stylesheet.replaceAll(selector, `.removed-${selector.length}`))).toThrow(
      `Missing Material primitive selector ${selector}`,
    );
  });

  it.each(requiredChromeSurfaces)('turns red when inventoried surface %s disappears', (surface) => {
    expect(() => auditMaterialChrome(stylesheet.replaceAll(surface, `.removed-${surface.length}`))).toThrow(
      `Missing inventoried Material surface ${surface}`,
    );
  });

  it('keeps gameplay art exclusions explicit', () => {
    const chrome = extractMaterialChrome(stylesheet);
    for (const artClass of ['.golden-sprite', '.achievement-badge', '.mini-ticket']) {
      expect(chrome).toContain(`:not(${artClass})`);
    }
    expect(chrome).toContain(':root:root body .cookie-btn');
    expect(chrome).toContain(':root:root body .cookie-btn::before');
    expect(chrome).toContain('content: none');
  });

  it('keeps state, focus, target-size and reduced-motion evidence independent', () => {
    expect(() => auditMaterialChrome(stylesheet.replaceAll('color-mix(', 'removed-mix('))).toThrow(
      'Material state layers are missing',
    );
    expect(() =>
      auditMaterialChrome(stylesheet.replaceAll('outline: 3px solid var(--md-sys-color-primary)', 'outline: 0')),
    ).toThrow('Material focus ring is missing');
    expect(() => auditMaterialChrome(stylesheet.replaceAll('min-block-size: 48px', 'min-block-size: 40px'))).toThrow(
      'Minimum touch-target contract is missing',
    );
  });

  it('keeps repaired primitives conforming while overall visual evidence stays pending', () => {
    expect(() => auditLedger(inventory.auditRecords)).not.toThrow();
  });

  it.each(requiredAuditIds)('turns red when audit %s regresses', (auditId) => {
    const broken = structuredClone(inventory.auditRecords);
    broken[auditId].status = 'conforming';
    expect(() => auditLedger(broken)).toThrow(`Material audit ${auditId} must stay pending until visual evidence lands`);
  });
});
