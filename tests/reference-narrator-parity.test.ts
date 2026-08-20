import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const referenceHtml = readFileSync(resolve('design/narrator-toast.html'), 'utf8');
const referenceCssPath = resolve('design/reference-app/narrator-toast.css');
const productCss = readFileSync(resolve('src/renderer/styles/design-parity-route.css'), 'utf8');

function ruleDeclarations(source: string, selector: string): ReadonlyMap<string, string> {
  const normalized = source.replace(/\r\n?|\n/g, '\n');
  const lines = normalized.split('\n');
  const exactLine = `${selector} {`;
  const matches = lines.flatMap((line, index) => line.trim() === exactLine ? [index] : []);
  if (matches.length === 0) throw new Error(`Missing exact CSS rule: ${selector}`);
  if (matches.length > 1) throw new Error(`Duplicate exact CSS rule: ${selector}`);

  const first = lines.slice(0, matches[0]).reduce((length, line) => length + line.length + 1, 0);
  const open = normalized.indexOf('{', first + selector.length);
  let depth = 0;
  let close = -1;
  for (let index = open; index < normalized.length; index += 1) {
    if (normalized[index] === '{') depth += 1;
    if (normalized[index] === '}') {
      depth -= 1;
      if (depth === 0) {
        close = index;
        break;
      }
    }
  }
  if (close < 0) throw new Error(`Unclosed exact CSS rule: ${selector}`);

  const declarations = new Map<string, string>();
  for (const candidate of normalized.slice(open + 1, close).split(';')) {
    const separator = candidate.indexOf(':');
    if (separator < 0) continue;
    const property = candidate.slice(0, separator).trim();
    const value = candidate.slice(separator + 1).trim();
    if (declarations.has(property)) throw new Error(`Duplicate ${property} declaration in ${selector}`);
    declarations.set(property, value);
  }
  return declarations;
}

function requireDeclaration(
  declarations: ReadonlyMap<string, string>,
  selector: string,
  property: string,
  expected: string,
): void {
  const actual = declarations.get(property);
  if (actual !== expected) {
    throw new Error(`${selector} ${property}: expected ${expected}, received ${actual ?? '<missing>'}`);
  }
}

function requireRule(
  source: string,
  selector: string,
  expected: Readonly<Record<string, string>>,
): void {
  const declarations = ruleDeclarations(source, selector);
  for (const [property, value] of Object.entries(expected)) {
    requireDeclaration(declarations, selector, property, value);
  }
}

function requireSingle(source: string, needle: string, label: string): void {
  const first = source.indexOf(needle);
  if (first < 0) throw new Error(`Missing ${label}`);
  if (source.indexOf(needle, first + needle.length) >= 0) throw new Error(`Duplicate ${label}`);
}

function assertStandaloneNarratorReference(html: string, css: string): void {
  const sharedStylesheet = './reference-app/material-reference.css';
  const narratorStylesheet = './reference-app/narrator-toast.css';
  requireSingle(html, `href="${sharedStylesheet}"`, 'shared reference stylesheet');
  requireSingle(html, `href="${narratorStylesheet}"`, 'narrator reference stylesheet');
  if (html.indexOf(narratorStylesheet) < html.indexOf(sharedStylesheet)) {
    throw new Error('Narrator stylesheet must load after the shared reference stylesheet');
  }
  requireSingle(html, 'class="narrator-toast-reference"', 'standalone narrator page class');
  requireSingle(html, 'class="gallery narrator-toast-gallery"', 'standalone narrator gallery class');
  if ((html.match(/<aside\b[^>]*\brole="status"/g) ?? []).length !== 2) {
    throw new Error('Expected exactly two independently semantic status notices');
  }
  for (const label of ['Dismiss golden moment', 'Dismiss offline report']) {
    requireSingle(html, `type="button" class="icon-button" aria-label="${label}"`, `${label} control`);
  }
  if (/parity-toast-stack|canonical-notice|src\/renderer/.test(html + css)) {
    throw new Error('Standalone reference must not import or impersonate product-route markup');
  }

  requireRule(css, '.narrator-toast-reference .theme-toggle', {
    'min-height': '40px',
    padding: '10px 24px',
    font: '500 14px/20px var(--font-en)',
    'letter-spacing': '0.1px',
  });
  requireRule(css, '.narrator-toast-reference .spec-section', {
    gap: '22px',
    'margin-top': '58px',
  });
  requireRule(css, '.narrator-toast-reference .section-title', {
    gap: '18px',
    font: '400 22px/28px var(--font-en)',
  });
  requireRule(css, '.narrator-toast-gallery', {
    width: 'min(660px, 100%)',
    gap: '22px',
  });
  requireRule(css, '.narrator-toast-gallery .notice', {
    height: '117px',
    'min-height': '117px',
    'grid-template-columns': '1fr auto',
    gap: '8px 18px',
    padding: '22px 24px',
    'font-size': '16px',
    'line-height': '21px',
  });
  requireRule(css, '.narrator-toast-gallery .notice .icon-button', {
    'inline-size': '48px',
    'block-size': '48px',
    'min-inline-size': '48px',
    'min-block-size': '48px',
    padding: '0',
    'border-radius': 'var(--md-sys-shape-corner-full)',
    font: '500 14px/20px var(--font-en)',
    'letter-spacing': '0.1px',
  });
}

describe('narrator toast standalone reference parity', () => {
  it('keeps the measured product notice geometry authoritative', () => {
    requireRule(productCss, '.parity-toast-stack', {
      width: 'min(660px, 100%)',
      gap: '22px',
    });
    requireRule(productCss, '.parity-toast-stack .canonical-notice', {
      'grid-template-columns': '1fr auto',
      gap: '8px 18px',
      padding: '22px 24px',
    });
    requireRule(productCss, '.parity-toast-stack .canonical-notice button', {
      width: '48px',
      height: '48px',
      'border-radius': 'var(--md-sys-shape-corner-full)',
    });
    requireRule(productCss, '.parity-theme-toggle', {
      'min-height': '40px',
      padding: '10px 24px',
    });
    requireRule(productCss, '.parity-spec-section', {
      gap: '22px',
      'margin-top': '58px',
    });
    requireRule(productCss, '.parity-spec-section > h2', {
      gap: '18px',
      font: '400 22px/28px var(--font-en)',
    });
  });

  it('matches the product geometry while preserving independent static semantics', () => {
    const referenceCss = readFileSync(referenceCssPath, 'utf8');
    expect(() => assertStandaloneNarratorReference(referenceHtml, referenceCss)).not.toThrow();
  });

  it('turns red for geometry or semantics drift, then green after restore', () => {
    const referenceCss = readFileSync(referenceCssPath, 'utf8');
    const brokenHeight = referenceCss.replace('height: 117px;', 'height: 118px;');
    expect(brokenHeight).not.toBe(referenceCss);
    expect(() => assertStandaloneNarratorReference(referenceHtml, brokenHeight)).toThrow(/height: expected 117px/i);

    const brokenSemantics = referenceHtml.replace('role="status"', 'data-role="status"');
    expect(brokenSemantics).not.toBe(referenceHtml);
    expect(() => assertStandaloneNarratorReference(brokenSemantics, referenceCss)).toThrow(/two independently semantic status notices/i);
    expect(() => assertStandaloneNarratorReference(referenceHtml, referenceCss)).not.toThrow();
  });
});
