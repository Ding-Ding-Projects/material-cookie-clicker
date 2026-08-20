import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const references = [
  'achievement-badge.html', 'building-row.html', 'bulk-toolbar.html', 'cookie-surface.html',
  'game-layout.html', 'narrator-toast.html', 'prestige-gate.html', 'search-regex-builder.html',
  'settings-funny-sliders.html', 'stat-tile.html', 'tokens-color.html',
  'tokens-shape-elevation.html', 'tokens-type.html', 'tool-card.html', 'tools-tree.html',
  'upgrade-card.html',
] as const;

const requiredTokens = [
  '--md-sys-color-primary:', '--md-sys-color-surface-container-high:',
  '--md-sys-shape-corner-extra-large:', '--md-sys-elevation-level-3:',
  '--md-sys-state-hover-opacity:', '--md-sys-state-pressed-opacity:',
] as const;

const exactCopy: Readonly<Record<(typeof references)[number], readonly string[]>> = {
  'achievement-badge.html': ['Hundred Bakeries', '百間麵包店', 'Achievement unlocked · 成就解鎖'],
  'building-row.html': ["Grandma's Bakery", 'Buy · 買 — 🍪 1,240', 'Cookie Factory', '88,500', 'Cookie Rocket'],
  'bulk-toolbar.html': ['7 selected · 已選 7 項', '4 / 7 done · 完成 4 / 7'],
  'cookie-surface.html': ['Rest · 靜止', 'Focus-visible · 鍵盤焦點', 'Value popup · 數值彈出', 'Golden cookie · 金曲奇'],
  'game-layout.html': ['4.82 Qa', '18,420', 'Achievements · 成就', '7 / 17 unlocked · 已解鎖 7 / 17'],
  'narrator-toast.html': ['+1,337 cookies; frenzy active for 60s', '+2.4 M cookies over 6 h 12 m'],
  'prestige-gate.html': ['128 ascension points', 'Key 1 · 鎖匙一', 'Key 2 · 鎖匙二', 'Emergency exit · 緊急離開'],
  'search-regex-builder.html': ['bak(ery|eries)', '2 of 3 matches', 'Regex · 規則運算式'],
  'settings-funny-sliders.html': ['Current level: 2 of 5', '而家程度：4 / 5', 'Bilingual · 雙語'],
  'stat-tile.html': ['4.82 Qa', '18,420', '▲ +6.2%', '▼ −3.1%'],
  'tokens-color.html': ['--md-sys-color-primary', '--md-sys-color-surface-container-high', '--md-sys-color-error'],
  'tokens-shape-elevation.html': ['Extra small', '4px', 'Extra large', '28px', 'level 3'],
  'tokens-type.html': ['Display large', 'Headline large', 'Title large', 'Cookie cabinet · 曲奇機櫃'],
  'tool-card.html': ['undiscovered', 'locked', 'ready', 'unlocked', 'Open it now · 而家開啟'],
  'tools-tree.html': ['7 / 17', 'Tier 1 · 第 1 層', 'Tier 2 · 第 2 層', 'Tier 3 · 第 3 層'],
  'upgrade-card.html': ['Locked · 未解鎖 (12 / 50)', 'Buy · 買 — 🍪 5,000', 'Already owned · 已經買咗'],
};

describe('modern Material design references', () => {
  it('keeps the exact hand-written reference set on one local Material foundation', () => {
    expect(references).toHaveLength(16);
    for (const file of references) {
      const source = readFileSync(resolve('design', file), 'utf8');
      expect(source.startsWith('<!-- @dsCard group="')).toBe(true);
      expect(source).toContain('<link rel="stylesheet" href="./reference-app/material-reference.css">');
      expect(source).not.toMatch(/<style|https?:\/\/|--press-|--drop-|cabinet-frame|bevel|marquee/i);
      for (const text of exactCopy[file]) expect(source).toContain(text);
    }
  });

  it('contains Material roles, anatomy, state layers, focus, targets and reduced motion', () => {
    const css = readFileSync(resolve('design/reference-app/material-reference.css'), 'utf8');
    for (const token of requiredTokens) expect(css).toContain(token);
    for (const selector of ['.button.filled', '.icon-button', '.segmented', '.field input', '.search-field', '.popover', '.notice', '.card', '.cookie-button']) {
      expect(css).toContain(selector);
    }
    expect(css).toContain('min-inline-size: 48px');
    expect(css).toContain(':focus-visible');
    expect(css).toContain('color-mix(');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    for (const value of ['#7a4a1d', '#ffdcb8', '#6b4c3f', '#ffdbcb', '#5c4e00', '#fff3e6', '#f5dfc4', '#ba1a1a']) {
      expect(css).toContain(value);
    }
    expect(css).not.toMatch(/--press-|--drop-|cabinet-frame|bevel|marquee/i);
  });

  it('keeps every prior visual-evidence item explicitly pending after source modernization', () => {
    const inventory = JSON.parse(readFileSync(resolve('design/parity/inventory.json'), 'utf8')) as {
      rows: Array<{ sourceCommit: string; evidence: Record<string, { status: string; reason?: string }> }>;
    };
    expect(inventory.rows).toHaveLength(16);
    for (const row of inventory.rows) {
      expect(row.sourceCommit).toBe('pending-recapture-after-reference-modernization');
      expect(Object.keys(row.evidence).sort()).toEqual(['comparison', 'diff', 'productRaw', 'referenceRaw']);
      for (const evidence of Object.values(row.evidence)) {
        expect(evidence.status).toBe('pending');
        expect(evidence.reason?.trim().length).toBeGreaterThan(20);
      }
    }
  });
});
