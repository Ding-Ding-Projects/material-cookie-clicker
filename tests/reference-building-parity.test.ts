import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const referencePath = resolve('design/building-row.html');
const stylesheetPath = resolve('design/reference-app/building-row.css');

const markup = readFileSync(referencePath, 'utf8');
const stylesheet = readFileSync(stylesheetPath, 'utf8');

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
}

function declarationsFor(source: string, selector: string): ReadonlyMap<string, string> {
  const clean = withoutComments(source);
  const needle = `${selector} {`;
  const positions: number[] = [];
  for (let offset = clean.indexOf(needle); offset !== -1; offset = clean.indexOf(needle, offset + needle.length)) {
    const before = offset === 0 ? '\n' : clean[offset - 1];
    if (before === '\n' || before === '\r') positions.push(offset);
  }
  if (positions.length !== 1) throw new Error(`Expected exactly one ${selector} rule, received ${positions.length}.`);

  const open = clean.indexOf('{', positions[0]);
  let depth = 0;
  let close = -1;
  for (let index = open; index < clean.length; index += 1) {
    if (clean[index] === '{') depth += 1;
    if (clean[index] === '}') depth -= 1;
    if (depth === 0) {
      close = index;
      break;
    }
  }
  if (close === -1) throw new Error(`Unclosed ${selector} rule.`);

  const declarations = new Map<string, string>();
  for (const item of clean.slice(open + 1, close).split(';')) {
    const separator = item.indexOf(':');
    if (separator === -1) continue;
    declarations.set(item.slice(0, separator).trim(), item.slice(separator + 1).trim());
  }
  return declarations;
}

function expectDeclaration(source: string, selector: string, property: string, expected: string): void {
  const actual = declarationsFor(source, selector).get(property);
  if (actual !== expected) throw new Error(`${selector} must declare ${property}: ${expected}; received ${actual ?? 'nothing'}.`);
}

function assertBuildingReferenceContract(html: string, css: string): void {
  const cleanMarkup = withoutComments(html);
  if (!cleanMarkup.includes('<link rel="stylesheet" href="./reference-app/building-row.css">')) {
    throw new Error('The building reference must link its dedicated stylesheet.');
  }

  expectDeclaration(css, '.building-gallery', 'gap', '16px');
  expectDeclaration(css, '.building-gallery .row', 'grid-template-columns', '34px minmax(0, 1fr) auto');
  expectDeclaration(css, '.building-gallery .row', 'grid-template-rows', 'auto auto');
  expectDeclaration(css, '.building-gallery .row', 'gap', '6px 10px');
  expectDeclaration(css, '.building-gallery .row', 'padding', '10px 12px');
  expectDeclaration(css, '.building-gallery .actions', 'grid-column', '1 / -1');
  expectDeclaration(css, '.building-gallery .row h3', 'font-size', '14px');
  expectDeclaration(css, '.building-gallery .row h3', 'font-weight', '900');
  expectDeclaration(css, '.building-gallery .row h3', 'line-height', '1.15');
  expectDeclaration(css, '.building-gallery .number', 'font-size', '22px');
  expectDeclaration(css, '.building-gallery .number', 'font-weight', '900');

  expect(cleanMarkup.match(/<article class="card row">/g)).toHaveLength(2);
  expect(cleanMarkup.match(/<article class="card row disabled">/g)).toHaveLength(1);
  const states = [...cleanMarkup.matchAll(/<div class="row-copy" data-state="(affordable|unaffordable|locked)">/g)].map(
    (match) => match[1],
  );
  if (states.length !== 3) throw new Error(`Expected three exact building states, received ${states.length}.`);
  expect(states).toEqual(['affordable', 'unaffordable', 'locked']);

  const artIds = [...cleanMarkup.matchAll(/<svg class="building-art" data-building-art="(grandma|factory|rocket)"/g)].map(
    (match) => match[1],
  );
  expect(artIds).toEqual(['grandma', 'factory', 'rocket']);
  expect(cleanMarkup.match(/<svg\b/g)).toHaveLength(3);
  expect(cleanMarkup).not.toMatch(/<img\b|src\/renderer|GeneratorIcon|icons\.tsx|https?:\/\//i);

  for (const copy of [
    '<span>Max</span><span class="max-zh">最多</span>',
    'Buy · 買 — 🍪 1,240',
    'Buy · 買 — 🍪 88,500',
    'Locked · 未解鎖',
    'Unlocks at 500 Cookie Factories owned · 擁有 500 間曲奇工廠先解鎖',
  ]) {
    if (!cleanMarkup.includes(copy)) throw new Error(`Missing exact bilingual building copy: ${copy}`);
  }

  const lockedRow = cleanMarkup.match(/<article class="card row disabled">[\s\S]*?<\/article>/)?.[0];
  if (!lockedRow) throw new Error('Missing the exact locked building row.');
  if ((lockedRow.match(/<button[^>]* disabled/g) ?? []).length !== 5) {
    throw new Error('The locked state must disable all four quantities and its purchase action.');
  }
}

describe('building-row design-reference parity', () => {
  it('matches the independent two-row product anatomy and bilingual states', () => {
    expect(() => assertBuildingReferenceContract(markup, stylesheet)).not.toThrow();
  });

  it('turns red for a one-row regression, then green after restore', () => {
    const broken = stylesheet.replace('grid-column: 1 / -1;', 'grid-column: 4;');
    expect(() => assertBuildingReferenceContract(markup, broken)).toThrow(
      '.building-gallery .actions must declare grid-column: 1 / -1; received 4.',
    );
    expect(() => assertBuildingReferenceContract(markup, stylesheet)).not.toThrow();
  });
});
