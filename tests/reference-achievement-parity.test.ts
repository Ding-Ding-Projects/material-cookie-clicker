import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const referencePath = resolve('design/achievement-badge.html');
const stylesheetPath = resolve('design/reference-app/achievement-badge.css');

const markup = readFileSync(referencePath, 'utf8');
const stylesheet = readFileSync(stylesheetPath, 'utf8');

function withoutComments(source: string): string {
  return source
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

function escaped(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ruleStarts(source: string, selector: string): readonly number[] {
  const matcher = new RegExp(`^\\s*${escaped(selector)}\\s*\\{`, 'gm');
  return [...source.matchAll(matcher)].map((match) => match.index ?? -1);
}

function declarationsFor(source: string, selector: string): ReadonlyMap<string, string> {
  const clean = withoutComments(source);
  const starts = ruleStarts(clean, selector);
  if (starts.length !== 1) throw new Error(`Expected exactly one ${selector} rule, received ${starts.length}.`);

  const open = clean.indexOf('{', starts[0]);
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
  if (actual !== expected) {
    throw new Error(`${selector} must declare ${property}: ${expected}; received ${actual ?? 'nothing'}.`);
  }
}

function expectNoRule(source: string, selector: string): void {
  const count = ruleStarts(withoutComments(source), selector).length;
  if (count !== 0) throw new Error(`${selector} is common reference chrome and must not be redefined here.`);
}

function occurrences(source: string, value: string): number {
  return source.split(value).length - 1;
}

function assertAchievementReferenceContract(html: string, css: string): void {
  const cleanMarkup = withoutComments(html);
  const foundationLink = '<link rel="stylesheet" href="./reference-app/material-reference.css">';
  const achievementLink = '<link rel="stylesheet" href="./reference-app/achievement-badge.css">';
  if (occurrences(cleanMarkup, foundationLink) !== 1) throw new Error('Expected exactly one Material foundation link.');
  if (occurrences(cleanMarkup, achievementLink) !== 1) throw new Error('Expected exactly one achievement stylesheet link.');
  if (cleanMarkup.indexOf(achievementLink) <= cleanMarkup.indexOf(foundationLink)) {
    throw new Error('The achievement stylesheet must load after the Material foundation.');
  }

  expectDeclaration(css, '.achievement-grid-ref', 'grid-template-columns', 'repeat(2, 150px)');
  expectDeclaration(css, '.achievement-grid-ref', 'gap', '20px');
  expectDeclaration(css, '.achievement-card-ref', 'width', '150px');
  expectDeclaration(css, '.achievement-card-ref', 'height', '142px');
  expectDeclaration(css, '.achievement-card-ref', 'min-height', '142px');
  expectDeclaration(css, '.achievement-card-ref', 'max-height', '142px');
  expectDeclaration(css, '.achievement-card-ref', 'grid-template-rows', '90px 16px 14px');
  expectDeclaration(css, '.achievement-card-ref', 'gap', '4px');
  expectDeclaration(css, '.achievement-card-ref', 'padding', '6px');
  expectDeclaration(css, '.achievement-card-ref .art', 'height', '90px');
  expectDeclaration(css, '.achievement-card-ref .art', 'min-height', '0');
  expectDeclaration(css, '.achievement-card-ref .medal', 'width', '90px');
  expectDeclaration(css, '.achievement-card-ref .medal', 'height', '90px');
  expectDeclaration(css, '.achievement-card-ref h3', 'font-size', '14px');
  expectDeclaration(css, '.achievement-card-ref h3', 'line-height', '16px');
  expectDeclaration(css, '.achievement-card-ref h3', 'font-weight', '900');
  expectDeclaration(css, '.achievement-card-ref .bilingual', 'font-size', '12px');
  expectDeclaration(css, '.achievement-card-ref .bilingual', 'line-height', '14px');
  expectDeclaration(css, '.achievement-card-ref .bilingual', 'font-weight', '700');

  expectDeclaration(css, '.achievement-toast-ref', 'width', '320px');
  expectDeclaration(css, '.achievement-toast-ref', 'min-width', '320px');
  expectDeclaration(css, '.achievement-toast-ref', 'max-width', '320px');
  expectDeclaration(css, '.achievement-toast-ref', 'height', '72px');
  expectDeclaration(css, '.achievement-toast-ref', 'min-height', '72px');
  expectDeclaration(css, '.achievement-toast-ref', 'max-height', '72px');
  expectDeclaration(css, '.achievement-toast-ref', 'grid-template-columns', '44px minmax(0, 1fr) 48px');
  expectDeclaration(css, '.achievement-toast-ref', 'grid-template-rows', '27px 27px');
  expectDeclaration(css, '.achievement-toast-ref', 'gap', '0 12px');
  expectDeclaration(css, '.achievement-toast-ref', 'padding', '8px');
  expectDeclaration(css, '.achievement-toast-ref .toast-medal-ref', 'width', '44px');
  expectDeclaration(css, '.achievement-toast-ref .toast-medal-ref', 'height', '44px');
  expectDeclaration(css, '.achievement-toast-ref strong', 'font-size', '14px');
  expectDeclaration(css, '.achievement-toast-ref strong', 'line-height', '18px');
  expectDeclaration(css, '.achievement-toast-ref > span:not(.toast-medal-ref)', 'font-size', '13px');
  expectDeclaration(css, '.achievement-toast-ref > span:not(.toast-medal-ref)', 'line-height', '18px');
  expectDeclaration(css, '.achievement-toast-ref .achievement-toast-dismiss-ref', 'width', '48px');
  expectDeclaration(css, '.achievement-toast-ref .achievement-toast-dismiss-ref', 'height', '48px');
  expectDeclaration(css, '.achievement-toast-ref .achievement-toast-dismiss-ref', 'min-inline-size', '48px');

  for (const selector of ['.theme-toggle', '.spec-section', '.section-title']) expectNoRule(css, selector);

  const cards = [...cleanMarkup.matchAll(/<article class="card state-card achievement-card-ref" data-achievement-state="(locked|unlocked)">/g)];
  if (cards.length !== 2 || cards[0][1] !== 'locked' || cards[1][1] !== 'unlocked') {
    throw new Error('Expected one locked card followed by one unlocked card.');
  }
  if (occurrences(cleanMarkup, '<span class="medal locked"') !== 1
    || occurrences(cleanMarkup, '<span class="medal"') !== 1
    || occurrences(cleanMarkup, '<span class="medal toast-medal-ref"') !== 1) {
    throw new Error('The reference must keep exactly three independently authored medal marks.');
  }
  if (/<svg\b|<img\b|src\/renderer|AchievementMedal|icons\.tsx|https?:\/\//i.test(cleanMarkup)) {
    throw new Error('The checked-in reference must not import product medal art or external images.');
  }

  const toastTags = [...cleanMarkup.matchAll(/<aside\b[^>]*class="notice achievement-toast-ref"[^>]*>/g)].map(
    (match) => match[0],
  );
  if (toastTags.length !== 1) throw new Error(`Expected exactly one achievement unlock notification, received ${toastTags.length}.`);
  for (const semantics of ['role="status"', 'aria-live="polite"', 'aria-atomic="true"']) {
    if (!toastTags[0].includes(semantics)) throw new Error(`Missing notification semantic: ${semantics}`);
  }
  const dismissButtons = [...cleanMarkup.matchAll(/<button\b[^>]*class="icon-button achievement-toast-dismiss-ref"[^>]*>×<\/button>/g)]
    .map((match) => match[0]);
  if (dismissButtons.length !== 1) {
    throw new Error(`Expected exactly one achievement notification dismiss button, received ${dismissButtons.length}.`);
  }
  const dismiss = dismissButtons[0];
  for (const contract of [
    'type="button"',
    'data-action="dismiss-achievement-toast"',
    'aria-label="Dismiss achievement notification · 關閉成就通知"',
    'onclick="this.closest(\'.achievement-toast-ref\').hidden = true"',
  ]) {
    if (!dismiss.includes(contract)) throw new Error(`Missing dismiss contract: ${contract}`);
  }
}

describe('achievement-badge design-reference parity', () => {
  it('matches the independent card typography, fixed notification geometry, and dismiss semantics', () => {
    expect(() => assertAchievementReferenceContract(markup, stylesheet)).not.toThrow();
  });

  it('turns red for an inexact card, then green after restore', () => {
    const broken = stylesheet.replace('  height: 142px;', '  height: 141px;');
    expect(() => assertAchievementReferenceContract(markup, broken)).toThrow(
      '.achievement-card-ref must declare height: 142px; received 141px.',
    );
    expect(() => assertAchievementReferenceContract(markup, stylesheet)).not.toThrow();
  });

  it('turns red for a decorative dismiss button, then green after restore', () => {
    const broken = markup.replace("this.closest('.achievement-toast-ref').hidden = true", 'return false');
    expect(() => assertAchievementReferenceContract(broken, stylesheet)).toThrow(
      'Missing dismiss contract: onclick="this.closest(\'.achievement-toast-ref\').hidden = true"',
    );
    expect(() => assertAchievementReferenceContract(markup, stylesheet)).not.toThrow();
  });
});
