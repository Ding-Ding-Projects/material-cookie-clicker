import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { DESIGN_PARITY_PAGE_COPY } from '../src/renderer/DesignParityRoute.js';

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
  'cookie-surface.html': ['Rest · 靜止', 'Hover · 滑鼠移入', 'Pressed · 撳落', 'Focus-visible · 鍵盤焦點', 'Reduced motion · 減少動態', 'Disabled · 停用'],
  'game-layout.html': ['4.82 Qa', '18,420', 'Achievements · 成就', '7 / 17 unlocked · 已解鎖 7 / 17'],
  'narrator-toast.html': ['+1,337 cookies; frenzy active for 60s', '+2.4 M cookies over 6 h 12 m'],
  'prestige-gate.html': ['128 ascension points', 'Key 1 · 鎖匙一', 'Key 2 · 鎖匙二', 'Emergency exit · 緊急離開'],
  'search-regex-builder.html': ['bak(ery|eries)', '2 of 3 matches', 'Regex · 規則運算式'],
  'settings-funny-sliders.html': ['Current level: 2 of 5', '而家程度：4 / 5', 'Bilingual · 雙語'],
  'stat-tile.html': ['4.82 Qa', '18,420', '▲ +6.2%', '▼ −3.1%'],
  'tokens-color.html': ['--md-sys-color-primary', '--md-sys-color-surface-container-high', '--md-sys-color-error'],
  'tokens-shape-elevation.html': ['Extra small', '--md-sys-shape-corner-extra-small', 'Extra large', '--md-sys-shape-corner-extra-large', '--md-sys-elevation-level-3'],
  'tokens-type.html': ['Display large', 'Headline large', 'Title large', 'Cookie cabinet · 曲奇機櫃'],
  'tool-card.html': ['undiscovered', 'locked', 'ready', 'unlocked', 'Open it now · 而家開啟'],
  'tools-tree.html': ['7 / 17', 'Tier 1 · 第 1 層', 'Tier 2 · 第 2 層', 'Tier 3 · 第 3 層'],
  'upgrade-card.html': ['Locked · 未解鎖 (12 / 50)', 'Buy · 買 — 🍪 5,000', 'Already owned · 已經買咗'],
};

const rowByFile = new Map(
  (JSON.parse(readFileSync(resolve('design/parity/inventory.json'), 'utf8')) as { rows: Array<{ id: keyof typeof DESIGN_PARITY_PAGE_COPY; reference: { file: string } }> }).rows
    .map((row) => [row.reference.file, row.id] as const),
);

function normalizedMarkupText(value: string): string {
  return value.replaceAll('&amp;', '&').replaceAll('&#39;', "'").trim();
}

function assertCommonMetrics(css: string): void {
  for (const contract of [
    'padding: 28px 44px 72px',
    '.spec-intro { display: grid; justify-items: start; gap: 18px; }',
    'width: min(640px, 100%)',
    '.spec-section { display: grid; gap: 22px; margin-top: 58px; }',
    '.gallery { display: grid; align-content: start; gap: 28px; }',
    'font-size: 36px; line-height: 44px',
  ]) {
    if (!css.includes(contract)) throw new Error(`Missing exact reference metric: ${contract}`);
  }
}

describe('modern Material design references', () => {
  it('keeps the exact hand-written reference set on one local Material foundation', () => {
    expect(references).toHaveLength(16);
    for (const file of references) {
      const source = readFileSync(resolve('design', file), 'utf8');
      expect(source.startsWith('<!-- @dsCard group="')).toBe(true);
      expect(source).toContain('<link rel="stylesheet" href="./reference-app/material-reference.css">');
      expect(source).not.toMatch(/<style|https?:\/\/|--press-|--drop-|cabinet-frame|bevel|marquee/i);
      for (const text of exactCopy[file]) expect(source).toContain(text);
      const rowId = rowByFile.get(file);
      if (!rowId) throw new Error(`Missing inventory row for ${file}`);
      const title = source.match(/<header class="spec-intro"><h1>(.*?)<\/h1>/s)?.[1];
      const lede = source.match(/<header class="spec-intro">.*?<p>(.*?)<\/p>/s)?.[1];
      const section = source.match(/<h2 class="section-title">(.*?)<\/h2>/s)?.[1];
      expect(normalizedMarkupText(title ?? '')).toBe(DESIGN_PARITY_PAGE_COPY[rowId].title);
      expect(normalizedMarkupText(lede ?? '')).toBe(DESIGN_PARITY_PAGE_COPY[rowId].lede);
      expect(normalizedMarkupText(section ?? '')).toBe(DESIGN_PARITY_PAGE_COPY[rowId].section);
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
    expect(() => assertCommonMetrics(css)).not.toThrow();
  });

  it('turns red when an exact common metric disappears and green after restore', () => {
    const css = readFileSync(resolve('design/reference-app/material-reference.css'), 'utf8');
    expect(() => assertCommonMetrics(css.replace('padding: 28px 44px 72px', 'padding: 28px 40px 72px'))).toThrow(
      'Missing exact reference metric: padding: 28px 44px 72px',
    );
    expect(() => assertCommonMetrics(css)).not.toThrow();
  });

  it('locks the residual structural parity contracts', () => {
    const css = readFileSync(resolve('design/reference-app/material-reference.css'), 'utf8');
    const building = readFileSync(resolve('design/building-row.html'), 'utf8');
    const type = readFileSync(resolve('design/tokens-type.html'), 'utf8');
    const shape = readFileSync(resolve('design/tokens-shape-elevation.html'), 'utf8');
    const achievement = readFileSync(resolve('design/achievement-badge.html'), 'utf8');
    const tool = readFileSync(resolve('design/tool-card.html'), 'utf8');
    expect(css).toContain('grid-template-columns: 64px minmax(220px, 1fr) 64px minmax(520px, 1.6fr)');
    expect(css).not.toContain('grid-template: auto auto / 64px');
    expect(building.match(/<article class="card row">/g)).toHaveLength(2);
    expect(building.match(/<article class="card row disabled">/g)).toHaveLength(1);
    for (const family of ['display', 'headline', 'title', 'body', 'label']) {
      expect(type).toContain(`class="type-${family} scale-medium"`);
      expect(type).toContain(`class="type-${family} scale-small"`);
    }
    expect(css).toContain('padding-block: 8px 18px');
    expect(shape.match(/class="card shape-sample"/g)).toHaveLength(6);
    expect(css).toContain('.shape-sample { min-height: 190px;');
    expect(css).toContain('background: var(--md-sys-color-surface-container); text-align: center;');
    expect(achievement).toContain('class="medal toast-medal-ref"');
    expect(css).toContain('width: 322px; height: 74px; min-height: 74px');
    expect(css).toContain('.notice .icon-button { background: var(--md-sys-color-secondary-container)');
    expect(tool).toContain('class="card tool-card locked-ref"');
    expect(tool.match(/class="progress" value="100" max="100"/g)).toHaveLength(2);
    expect(css).toContain('.tool-card { height: 390px; min-height: 390px;');
    expect(css).toContain('.tool-card .chip { min-height: 22px;');
    expect(css).toContain('.tool-card .progress { height: 6px; }');
  });

  it('turns red when the building flow regresses to two CSS rows and green after restore', () => {
    const css = readFileSync(resolve('design/reference-app/material-reference.css'), 'utf8');
    const broken = css.replace(
      'grid-template-columns: 64px minmax(220px, 1fr) 64px minmax(520px, 1.6fr)',
      'grid-template: auto auto / 64px minmax(0, 1fr) auto',
    );
    expect(broken).not.toContain('grid-template-columns: 64px minmax(220px, 1fr) 64px minmax(520px, 1.6fr)');
    expect(css).toContain('grid-template-columns: 64px minmax(220px, 1fr) 64px minmax(520px, 1.6fr)');
  });

  it('binds every refreshed evidence item to the domain-art isolation source', () => {
    const inventory = JSON.parse(readFileSync(resolve('design/parity/inventory.json'), 'utf8')) as {
      rows: Array<{ sourceCommit: string; evidence: Record<string, { status: string; reason?: string }> }>;
    };
    expect(inventory.rows).toHaveLength(16);
    for (const row of inventory.rows) {
      expect(row.sourceCommit).toBe('6f878d9fc1dc6246a7a078ce33aa9b12531fe775');
      expect(Object.keys(row.evidence).sort()).toEqual(['comparison', 'diff', 'productRaw', 'referenceRaw']);
      for (const evidence of Object.values(row.evidence)) {
        expect(evidence.status).toBe('verified');
        expect(evidence.reason).toBeUndefined();
      }
    }
  });
});
