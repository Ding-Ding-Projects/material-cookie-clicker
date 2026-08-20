import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const referenceMarkupPath = resolve('design/tokens-type.html');
const referenceCssPath = resolve('design/reference-app/tokens-type.css');
const productCssPath = resolve('src/renderer/styles/design-parity-route.css');

const expectedRows = [
  ['Display large', 'type-display'],
  ['Display medium', 'type-display scale-medium'],
  ['Display small', 'type-display scale-small'],
  ['Headline large', 'type-headline'],
  ['Headline medium', 'type-headline scale-medium'],
  ['Headline small', 'type-headline scale-small'],
  ['Title large', 'type-title'],
  ['Title medium', 'type-title scale-medium'],
  ['Title small', 'type-title scale-small'],
  ['Body large', 'type-body'],
  ['Body medium', 'type-body scale-medium'],
  ['Body small', 'type-body scale-small'],
  ['Label large', 'type-label'],
  ['Label medium', 'type-label scale-medium'],
  ['Label small', 'type-label scale-small'],
] as const;

const selectorPairs = [
  ['.spec-shell', '.parity-spec-shell'],
  ['.type-scale', '.parity-type-scale'],
  ['.type-row', '.parity-type-scale > div'],
  ['.type-display', '.parity-type-display strong'],
  ['.type-headline', '.parity-type-headline strong'],
  ['.type-title', '.parity-type-title strong'],
  ['.type-body', '.parity-type-body strong'],
  ['.type-label', '.parity-type-label strong'],
  ['.scale-medium', '.parity-type-medium strong'],
  ['.scale-small', '.parity-type-small strong'],
] as const;

function declarations(source: string, selector: string): readonly string[] {
  const normalized = source.replaceAll('\r\n', '\n');
  const header = `${selector} {`;
  const positions: number[] = [];
  for (let offset = normalized.indexOf(header); offset !== -1; offset = normalized.indexOf(header, offset + header.length)) {
    const before = normalized.slice(0, offset).trimEnd();
    if (before.length === 0 || before.endsWith('}')) positions.push(offset);
  }
  if (positions.length !== 1) {
    throw new Error(`Expected exactly one CSS selector ${selector}, received ${positions.length}`);
  }

  const open = normalized.indexOf('{', positions[0]);
  let depth = 0;
  let close = -1;
  for (let index = open; index < normalized.length; index += 1) {
    if (normalized[index] === '{') depth += 1;
    if (normalized[index] !== '}') continue;
    depth -= 1;
    if (depth === 0) {
      close = index;
      break;
    }
  }
  if (close === -1) throw new Error(`Unclosed CSS selector: ${selector}`);

  return normalized.slice(open + 1, close)
    .split(';')
    .map((declaration) => declaration.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .sort();
}

function validateReference(markup: string, referenceCss: string, productCss: string): void {
  if (!markup.includes('<link rel="stylesheet" href="./reference-app/material-reference.css">')) {
    throw new Error('Missing the shared static Material reference stylesheet');
  }
  if (!markup.includes('<link rel="stylesheet" href="./reference-app/tokens-type.css">')) {
    throw new Error('Missing the independent type-reference stylesheet');
  }
  if (!markup.includes('<div class="gallery"><div class="type-scale">') || markup.includes('class="card gallery type-scale"')) {
    throw new Error('The type scale must own its product-equivalent surface inside the gallery frame');
  }
  if (/design-parity-route|src\/renderer|https?:\/\//i.test(`${markup}\n${referenceCss}`)) {
    throw new Error('The checked-in reference must remain independent of product and network sources');
  }

  const rows = [...markup.matchAll(/<div class="type-row"><span>([^<]+)<\/span><strong class="([^"]+)">Cookie cabinet · 曲奇機櫃<\/strong><\/div>/g)]
    .map((match) => [match[1], match[2]] as const);
  if (JSON.stringify(rows) !== JSON.stringify(expectedRows)) {
    throw new Error(`Type row contract mismatch: expected ${JSON.stringify(expectedRows)}, received ${JSON.stringify(rows)}`);
  }

  for (const [referenceSelector, productSelector] of selectorPairs) {
    const referenceDeclarations = declarations(referenceCss, referenceSelector);
    const productDeclarations = declarations(productCss, productSelector);
    if (JSON.stringify(referenceDeclarations) !== JSON.stringify(productDeclarations)) {
      throw new Error(`CSS parity mismatch: ${referenceSelector} must equal ${productSelector}`);
    }
  }

  for (const declaration of ['height: 100%', 'min-height: 0', 'overflow: hidden']) {
    if (!declarations(referenceCss, 'html,\nbody').includes(declaration)) {
      throw new Error(`Missing viewport overflow declaration: ${declaration}`);
    }
  }
  if (!declarations(referenceCss, 'body').includes('padding: 0')) {
    throw new Error('The scroll shell, not body, must own the 1280x800 capture padding');
  }
}

describe('type-scale reference parity', () => {
  it('matches the exact product surface, rows, typography and 1280x800 overflow contract', () => {
    expect(existsSync(referenceCssPath), 'type-reference stylesheet must exist').toBe(true);
    const markup = readFileSync(referenceMarkupPath, 'utf8');
    const referenceCss = readFileSync(referenceCssPath, 'utf8');
    const productCss = readFileSync(productCssPath, 'utf8');
    expect(() => validateReference(markup, referenceCss, productCss)).not.toThrow();
  });

  it('turns red for each exact source boundary and green after restore', () => {
    expect(existsSync(referenceCssPath), 'type-reference stylesheet must exist').toBe(true);
    const markup = readFileSync(referenceMarkupPath, 'utf8');
    const referenceCss = readFileSync(referenceCssPath, 'utf8');
    const productCss = readFileSync(productCssPath, 'utf8');
    const cases = [
      {
        label: 'dedicated stylesheet link',
        brokenMarkup: markup.replace('./reference-app/tokens-type.css', './reference-app/tokens-type-missing.css'),
        brokenCss: referenceCss,
        error: 'Missing the independent type-reference stylesheet',
      },
      {
        label: '15-row class contract',
        brokenMarkup: markup.replace('type-label scale-small', 'type-label scale-tiny'),
        brokenCss: referenceCss,
        error: 'Type row contract mismatch',
      },
      {
        label: 'surface role',
        brokenMarkup: markup,
        brokenCss: referenceCss.replace(
          'background: var(--md-sys-color-surface-container)',
          'background: var(--md-sys-color-surface-container-low)',
        ),
        error: 'CSS parity mismatch: .type-scale must equal .parity-type-scale',
      },
      {
        label: 'row geometry',
        brokenMarkup: markup,
        brokenCss: referenceCss.replace('padding-block: 8px 18px', 'padding-block: 8px 16px'),
        error: 'CSS parity mismatch: .type-row must equal .parity-type-scale > div',
      },
      {
        label: 'title typography',
        brokenMarkup: markup,
        brokenCss: referenceCss.replace(
          'font: 700 26px/1.15 var(--font-en)',
          'font: 400 22px/28px var(--font-en)',
        ),
        error: 'CSS parity mismatch: .type-title must equal .parity-type-title strong',
      },
      {
        label: '1280x800 scrolling owner',
        brokenMarkup: markup,
        brokenCss: referenceCss.replace('overflow-y: auto', 'overflow-y: visible'),
        error: 'CSS parity mismatch: .spec-shell must equal .parity-spec-shell',
      },
    ] as const;

    for (const testCase of cases) {
      expect(
        () => validateReference(testCase.brokenMarkup, testCase.brokenCss, productCss),
        testCase.label,
      ).toThrow(testCase.error);
    }
    expect(() => validateReference(markup, referenceCss, productCss)).not.toThrow();
  });
});
