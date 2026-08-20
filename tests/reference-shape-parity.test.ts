import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve('.');
const htmlPath = resolve(root, 'design/tokens-shape-elevation.html');
const sharedCssPath = resolve(root, 'design/reference-app/material-reference.css');
const routeCssPath = resolve(root, 'design/reference-app/tokens-shape.css');

const samples = [
  ['extra-small', '--md-sys-shape-corner-extra-small', '--md-sys-elevation-level-1'],
  ['small', '--md-sys-shape-corner-small', '--md-sys-elevation-level-1'],
  ['medium', '--md-sys-shape-corner-medium', '--md-sys-elevation-level-2'],
  ['large', '--md-sys-shape-corner-large', '--md-sys-elevation-level-3'],
  ['extra-large', '--md-sys-shape-corner-extra-large', '--md-sys-elevation-level-3'],
  ['full', '--md-sys-shape-corner-full', '--md-sys-elevation-level-1'],
] as const;

function normalize(value: string): string {
  return value.replaceAll('\r\n', '\n');
}

function countExact(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

function htmlElementBlock(source: string, startTag: string, endTag: string): string {
  const normalized = normalize(source);
  const lines = normalized.split('\n');
  const matchingLines = lines.flatMap((line, index) => line.trim() === startTag ? [index] : []);
  if (matchingLines.length === 0) throw new Error(`Missing exact element: ${startTag}`);
  if (matchingLines.length > 1) throw new Error(`Duplicate exact element: ${startTag}`);
  const end = lines.findIndex((line, index) => index > matchingLines[0] && line.trim() === endTag);
  if (end < 0) throw new Error(`Unclosed exact element: ${startTag}`);
  return lines.slice(matchingLines[0], end + 1).join('\n');
}

function cssBlock(source: string, selector: string): string {
  const normalized = normalize(source);
  const header = `${selector} {`;
  const lines = normalized.split('\n');
  const matchingLines = lines.flatMap((line, index) => line.trim() === header ? [index] : []);
  if (matchingLines.length === 0) throw new Error(`Missing exact selector: ${selector}`);
  if (matchingLines.length > 1) throw new Error(`Duplicate exact selector: ${selector}`);
  const start = lines.slice(0, matchingLines[0]).reduce((offset, line) => offset + line.length + 1, 0)
    + lines[matchingLines[0]].indexOf(selector);

  let depth = 0;
  for (let index = start + selector.length; index < normalized.length; index += 1) {
    if (normalized[index] === '{') depth += 1;
    if (normalized[index] !== '}') continue;
    depth -= 1;
    if (depth === 0) return normalized.slice(start, index + 1);
  }
  throw new Error(`Unclosed exact selector: ${selector}`);
}

function requireDeclarations(block: string, declarations: readonly string[], contract: string): void {
  for (const declaration of declarations) {
    if (!block.includes(declaration)) throw new Error(`${contract} is missing ${declaration}`);
  }
}

function assertShapeReference(html: string, sharedCss: string, routeCss: string): void {
  const sharedLink = '<link rel="stylesheet" href="./reference-app/material-reference.css">';
  const routeLink = '<link rel="stylesheet" href="./reference-app/tokens-shape.css">';
  if (countExact(html, sharedLink) !== 1 || countExact(html, routeLink) !== 1) {
    throw new Error('Shape reference must load each shared and route stylesheet exactly once');
  }
  if (html.indexOf(sharedLink) > html.indexOf(routeLink)) {
    throw new Error('Shape route stylesheet must load after the shared foundation');
  }
  if (!html.includes('<body class="tokens-shape-page" data-scheme="light">')) {
    throw new Error('Shape reference must declare its exact route scope');
  }
  if (html.includes('style="border-radius:') || html.includes('style="box-shadow:')) {
    throw new Error('Shape and elevation bindings must remain independent stylesheet declarations');
  }

  requireDeclarations(cssBlock(sharedCss, 'body'), [
    'min-height: 800px;',
    'padding: 28px 44px 72px;',
    'font: 400 16px/1.5 var(--font-en);',
  ], 'Shared page metrics');

  requireDeclarations(cssBlock(routeCss, 'html'), [
    'overflow-y: auto;',
    'scrollbar-color: auto;',
    'scrollbar-width: auto;',
  ], 'Native scrollbar contract');
  const scrollingCss = `${sharedCss}\n${routeCss}`;
  if (/::-webkit-scrollbar|scrollbar-gutter/.test(scrollingCss)) {
    throw new Error('Shape reference must retain the native browser scrollbar');
  }
  for (const match of scrollingCss.matchAll(/^\s*scrollbar-(?:color|width):\s*([^;]+);/gm)) {
    if (match[1].trim() !== 'auto') throw new Error('Shape reference must retain the native browser scrollbar');
  }

  requireDeclarations(cssBlock(routeCss, '.tokens-shape-page .theme-toggle'), [
    'min-block-size: 40px;',
    'padding: 10px 24px;',
    'border-radius: var(--md-sys-shape-corner-full);',
    'box-shadow: var(--md-sys-elevation-level-0);',
    'font: 500 16px/24px var(--font-en);',
    'letter-spacing: normal;',
  ], 'Theme toggle metrics');
  requireDeclarations(cssBlock(routeCss, '.tokens-shape-page .spec-section'), [
    'gap: 22px;',
    'margin-top: 58px;',
  ], 'Section metrics');
  requireDeclarations(cssBlock(routeCss, '.tokens-shape-page .section-title'), [
    'gap: 16px;',
    'font: 400 22px/28px var(--font-en);',
  ], 'Section title metrics');

  requireDeclarations(cssBlock(routeCss, '.tokens-shape-page .shape-grid'), [
    'grid-template-columns: repeat(3, minmax(0, 1fr));',
    'gap: 32px;',
  ], 'Three-by-two shape grid');
  requireDeclarations(cssBlock(routeCss, '.tokens-shape-page .shape-sample'), [
    'min-height: 190px;',
    'display: grid;',
    'place-content: center;',
    'gap: 10px;',
    'padding: 24px;',
    'border: 1px solid var(--md-sys-color-outline-variant);',
    'background: var(--md-sys-color-surface-container);',
    'text-align: center;',
  ], 'Shape card geometry and surface');
  requireDeclarations(cssBlock(routeCss, '.tokens-shape-page .shape-sample > strong'), [
    'font: 700 16px/24px var(--font-en);',
  ], 'Shape label type');
  requireDeclarations(cssBlock(routeCss, '.tokens-shape-page .shape-sample > code'), [
    'font: 600 13px/1.4 ui-monospace, Consolas, monospace;',
  ], 'Shape token type');

  if (countExact(html, '<article class="card shape-sample" data-shape-sample="') !== samples.length) {
    throw new Error('Shape reference must render exactly six independently bound samples');
  }
  for (const [name, shapeToken, elevationToken] of samples) {
    const sampleAttribute = `data-shape-sample="${name}"`;
    const sampleMarkup = htmlElementBlock(
      html,
      `<article class="card shape-sample" ${sampleAttribute}>`,
      '</article>',
    );
    if (countExact(sampleMarkup, `<code>${shapeToken}</code>`) !== 1) {
      throw new Error(`Missing exact ${name} shape token label: ${shapeToken}`);
    }
    if (countExact(sampleMarkup, `<code>${elevationToken}</code>`) !== 1) {
      throw new Error(`Missing exact ${name} elevation token label: ${elevationToken}`);
    }
    requireDeclarations(cssBlock(routeCss, `.tokens-shape-page .shape-sample[${sampleAttribute}]`), [
      `border-radius: var(${shapeToken});`,
      `box-shadow: var(${elevationToken});`,
    ], `Independent ${name} shape/elevation binding`);
  }
}

describe('shape and elevation design reference parity', () => {
  it('loads a dedicated route stylesheet after the shared Material foundation', () => {
    const html = readFileSync(htmlPath, 'utf8');
    expect(existsSync(routeCssPath), 'missing design/reference-app/tokens-shape.css').toBe(true);
    expect(html).toContain('<link rel="stylesheet" href="./reference-app/tokens-shape.css">');
  });

  it('locks common chrome, native scrolling, exact card geometry, surface, elevation and type', () => {
    const html = readFileSync(htmlPath, 'utf8');
    const sharedCss = readFileSync(sharedCssPath, 'utf8');
    const routeCss = existsSync(routeCssPath) ? readFileSync(routeCssPath, 'utf8') : '';
    expect(() => assertShapeReference(html, sharedCss, routeCss)).not.toThrow();
  });

  it('turns red when one independent elevation binding drifts, then green after restore', () => {
    const html = readFileSync(htmlPath, 'utf8');
    const sharedCss = readFileSync(sharedCssPath, 'utf8');
    const routeCss = existsSync(routeCssPath) ? readFileSync(routeCssPath, 'utf8') : '';
    const target = 'box-shadow: var(--md-sys-elevation-level-2);';
    expect(countExact(routeCss, target), 'medium elevation mutation target must be exact').toBe(1);
    const broken = routeCss.replace(target, 'box-shadow: var(--md-sys-elevation-level-1);');
    expect(() => assertShapeReference(html, sharedCss, broken)).toThrow(/medium shape\/elevation binding/i);
    expect(() => assertShapeReference(html, sharedCss, routeCss)).not.toThrow();
  });
});
