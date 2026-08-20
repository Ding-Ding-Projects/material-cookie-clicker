import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import {
  assertDesignParityCoverage,
  DESIGN_PARITY_FIXTURES,
  DESIGN_PARITY_NETWORK_POLICY,
  DESIGN_PARITY_PAGE_COPY,
  DESIGN_PARITY_ROW_IDS,
  DesignParityRoute,
  resolveDesignParityRequest,
} from '../src/renderer/DesignParityRoute.js';

interface InventoryRow {
  readonly id: string;
  readonly product: { readonly route: string };
  readonly deterministic: { readonly fixture: string; readonly network: string };
}

const inventory = JSON.parse(readFileSync(resolve('design/parity/inventory.json'), 'utf8')) as { rows: InventoryRow[] };

const ALLOWED_DESIGN_ROUTE_TOKENS = [
  '--font-en',
  '--md-sys-color-error',
  '--md-sys-color-on-error',
  '--md-sys-color-on-primary',
  '--md-sys-color-on-primary-container',
  '--md-sys-color-on-secondary',
  '--md-sys-color-on-secondary-container',
  '--md-sys-color-on-surface',
  '--md-sys-color-on-surface-variant',
  '--md-sys-color-on-tertiary',
  '--md-sys-color-outline',
  '--md-sys-color-outline-variant',
  '--md-sys-color-primary',
  '--md-sys-color-primary-container',
  '--md-sys-color-secondary',
  '--md-sys-color-secondary-container',
  '--md-sys-color-surface',
  '--md-sys-color-surface-container',
  '--md-sys-color-surface-container-high',
  '--md-sys-color-surface-container-low',
  '--md-sys-color-tertiary',
  '--md-sys-elevation-level-0',
  '--md-sys-elevation-level-1',
  '--md-sys-elevation-level-2',
  '--md-sys-elevation-level-3',
  '--md-sys-shape-corner-extra-large',
  '--md-sys-shape-corner-extra-small',
  '--md-sys-shape-corner-full',
  '--md-sys-shape-corner-large',
  '--md-sys-shape-corner-medium',
  '--md-sys-shape-corner-small',
  '--on-tertiary-container',
  '--tertiary-container',
] as const;

const FORBIDDEN_DESIGN_ROUTE_TOKENS = [
  '--elevation-1', '--elevation-2', '--elevation-3', '--elevation-4', '--elevation-5',
  '--font-display', '--oven-glow', '--panel-inset',
  '--shape-full', '--shape-lg', '--shape-md', '--shape-sm', '--shape-xl', '--shape-xs',
] as const;

function collectDesignRouteTokens(source: string): string[] {
  return [...new Set([...source.matchAll(/var\((--[a-z0-9-]+)/g)].map((match) => match[1]))].sort();
}

function validateDesignRouteTokenSet(source: string): void {
  const actual = collectDesignRouteTokens(source);
  const expected = [...ALLOWED_DESIGN_ROUTE_TOKENS].sort();
  if (actual.length !== expected.length || actual.some((token, index) => token !== expected[index])) {
    throw new Error(`Design route token set mismatch: expected ${expected.join(', ')}, received ${actual.join(', ')}`);
  }
  for (const forbidden of FORBIDDEN_DESIGN_ROUTE_TOKENS) {
    if (source.includes(`var(${forbidden})`)) throw new Error(`Forbidden design route token: ${forbidden}`);
  }
}

const PARITY_REPAIR_RULES = [
  { selector: ':root:root body .design-parity-route', declarations: ['font: 400 16px/1.5 var(--font-en);'] },
  { selector: ':root:root body .design-parity-route .parity-theme-toggle', declarations: ['font: 500 16px/24px var(--font-en);', 'padding: 10px 24px;'] },
  { selector: ':root:root body .design-parity-route .parity-spec-section > h2', declarations: ['gap: 16px;', 'text-transform: none;'] },
  { selector: ':root:root body .design-parity-route .bulk-toolbar', declarations: ['min-height: 126px;', 'border: 1px solid var(--md-sys-color-outline-variant);'] },
  { selector: ':root:root body .design-parity-route .parity-progress-card progress', declarations: ['height: 10px;'] },
  { selector: ':root:root body .design-parity-route .parity-cookie-state', declarations: ['width: 132px;', 'height: auto;'] },
  { selector: ':root:root body .design-parity-route .parity-game-layout > .hud', declarations: ['gap: 14px;'] },
  { selector: ':root:root body .design-parity-route .parity-layout-cookie', declarations: ['grid-template-rows: 1fr 60px;', 'place-items: center;'] },
  { selector: ':root:root body .design-parity-route .parity-layout-dialog', declarations: ['animation: none;', 'opacity: 1;', 'height: auto;'] },
  { selector: ':root:root body .design-parity-route .parity-toast-stack .canonical-notice', declarations: ['grid-template-columns: 1fr 48px;', 'padding: 22px 24px;'] },
  { selector: ':root:root body .design-parity-route .gate.tone-prestige', declarations: ['min-height: 520px;', 'width: min(480px, 100%);'] },
  { selector: ':root:root body .design-parity-route .parity-regex-popover', declarations: ['position: static;', 'width: min(380px, 100%);'] },
  { selector: ":root:root body .design-parity-route .parity-regex-popover .flag-row input[type='checkbox']", declarations: ['appearance: auto;', 'min-height: 0;'] },
  { selector: ':root:root body .design-parity-route .settings-block', declarations: ['display: grid;', 'padding: 20px;'] },
  { selector: ':root:root body .design-parity-route .tools-hud', declarations: ['grid-template-columns: auto minmax(180px, 1fr) auto;', 'min-height: 82px;'] },
  { selector: ':root:root body .design-parity-route .parity-tools-tree .tools-tier__heading', declarations: ['font: 500 18px/24px var(--font-en);', 'border-bottom: 8px solid var(--md-sys-color-primary);'] },
  { selector: ':root:root body .design-parity-route .parity-tools-tree .item-card.undiscovered', declarations: ['opacity: .58;'] },
] as const;

function exactCssRuleBody(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = [...source.matchAll(new RegExp(`(?:^|\\r?\\n)${escaped}\\s*\\{([^{}]*)\\}`, 'g'))];
  if (matches.length !== 1) throw new Error(`Expected exactly one parity repair selector ${selector}, received ${matches.length}`);
  return matches[0][1].replace(/\s+/g, ' ').trim();
}

function assertParityRouteRepairContract(routeSource: string, cssSource: string): void {
  if (/scrollbar-gutter\s*:/u.test(cssSource)) throw new Error('Stable scrollbar gutter must stay absent from the parity route.');
  const scopedStart = cssSource.indexOf(':root:root body .design-parity-route {');
  const scopedEnd = cssSource.indexOf('.parity-upgrade-shelf {', scopedStart);
  if (scopedStart < 0 || scopedEnd < 0) throw new Error('The scoped parity repair block must have exact boundaries.');
  if (cssSource.slice(scopedStart, scopedEnd).includes('!important')) throw new Error('Scoped parity repair rules must win through specificity.');
  for (const rule of PARITY_REPAIR_RULES) {
    const body = exactCssRuleBody(cssSource, rule.selector);
    for (const declaration of rule.declarations) {
      if (!body.includes(declaration)) throw new Error(`Parity repair selector ${rule.selector} is missing ${declaration}`);
    }
  }

  const exactSourceLines = [
    "import { DestructiveGate } from './components/DestructiveGate.js';",
    '<DestructiveGate tone="prestige"',
    'onClick={() => setDialogOpen(false)}',
    'onClick={() => setGoldenVisible(false)}',
    'level={funnyLevelEn}',
    'level={funnyLevelYue}',
    'value={level}',
    'TREE_TIERS[tier].filter(matches).map((tool)',
    'onClick={() => setProgressVisible((visible) => !visible)}',
  ];
  for (const line of exactSourceLines) {
    if (!routeSource.includes(line)) throw new Error(`Parity route repair source is missing exact boundary ${line}`);
  }
  if (routeSource.includes('className="gate parity-gate"')) throw new Error('The bespoke prestige gate must not return.');
}

describe('built-product design parity routes', () => {
  it('covers every hand-written inventory row exactly once with the exact product URL tuple', () => {
    const inventoryIds = inventory.rows.map((row) => row.id);
    expect(inventoryIds).toHaveLength(16);
    expect(new Set(inventoryIds).size).toBe(16);
    expect([...DESIGN_PARITY_ROW_IDS].sort()).toEqual([...inventoryIds].sort());
    expect(Object.keys(DESIGN_PARITY_PAGE_COPY).sort()).toEqual([...inventoryIds].sort());
    assertDesignParityCoverage(inventoryIds);

    for (const row of inventory.rows) {
      const request = resolveDesignParityRequest(new URL(row.product.route).searchParams);
      expect(request).toMatchObject({ kind: 'valid', rowId: row.id, width: 1280, height: 800, scale: 1, theme: 'light', locale: 'en-HK' });
      if (request?.kind !== 'valid') throw new Error(`Expected a valid route for ${row.id}`);
      expect(DESIGN_PARITY_FIXTURES[request.rowId]).toBe(row.deterministic.fixture);
      const markup = renderToStaticMarkup(createElement(DesignParityRoute, { request }));
      expect(markup).toContain(`data-design-parity-row="${row.id}"`);
      expect(markup).toContain(`data-design-parity-fixture="${row.deterministic.fixture}"`);
      expect(markup).toContain('data-motion="paused"');
      expect(markup).toContain('data-network="blocked"');
      const renderedText = markup.replaceAll('&amp;', '&').replaceAll('&#x27;', "'");
      expect(renderedText).toContain(DESIGN_PARITY_PAGE_COPY[request.rowId].title);
      expect(renderedText).toContain(DESIGN_PARITY_PAGE_COPY[request.rowId].section);
    }
  });

  it('rejects unknown rows and any tuple drift instead of capturing mislabeled pixels', () => {
    expect(resolveDesignParityRequest('?designParity=not-a-row&theme=light&width=1280&height=800&scale=1&state=gallery&locale=en-HK')).toEqual({ kind: 'rejected', rowId: 'not-a-row', reason: 'unknown-row' });
    expect(resolveDesignParityRequest('?designParity=game-layout--main&theme=dark&width=1280&height=800&scale=1&state=main&locale=en-HK')).toEqual({ kind: 'rejected', rowId: 'game-layout--main', reason: 'tuple-mismatch' });
    expect(resolveDesignParityRequest('?theme=light')).toBeNull();
  });

  it('makes the exact coverage guard turn red for a missing row, then green after restore', () => {
    const missingOne = DESIGN_PARITY_ROW_IDS.filter((id) => id !== 'upgrade-card--gallery');
    expect(() => assertDesignParityCoverage(missingOne)).toThrow(/coverage mismatch/i);
    expect(() => assertDesignParityCoverage([...missingOne, 'upgrade-card--gallery'])).not.toThrow();
    expect(() => assertDesignParityCoverage([...DESIGN_PARITY_ROW_IDS, DESIGN_PARITY_ROW_IDS[0]])).toThrow(/coverage mismatch/i);
  });

  it('locks the exact deterministic counts, labels, and mixed states that frame the references', () => {
    const render = (rowId: string): string => {
      const row = inventory.rows.find((candidate) => candidate.id === rowId);
      if (!row) throw new Error(`Missing inventory row ${rowId}`);
      const request = resolveDesignParityRequest(new URL(row.product.route).searchParams);
      if (!request) throw new Error(`Missing request for ${rowId}`);
      return renderToStaticMarkup(createElement(DesignParityRoute, { request })).replaceAll('&#x27;', "'");
    };

    expect(render('achievement-badge--gallery')).toContain('Hundred Bakeries · 百間麵包店');
    expect(render('building-row--gallery')).toContain("Grandma's Bakery");
    expect(render('building-row--gallery')).toContain('Buy · 買 — 🍪 1,240');
    expect(render('bulk-toolbar--progress')).toContain('4 / 7 done · 完成 4 / 7');
    expect(render('game-layout--main')).toContain('4.82 Qa');
    expect(render('game-layout--main')).toContain('Achievements · 成就');
    expect(render('narrator-toast--gallery')).toContain('+1,337 cookies; frenzy active for 60s');
    expect(render('narrator-toast--gallery')).toContain('+2.4 M cookies over 6 h 12 m');
    expect(render('prestige-gate--ready')).toContain('Emergency exit · 緊急退出');
    expect(render('search-regex-builder--open')).toContain('bak(ery|eries)');
    expect(render('search-regex-builder--open')).toContain('2 of 3 matches');
    expect(render('settings-funny-sliders--default')).toContain('Current level: 2 of 5');
    expect(render('settings-funny-sliders--default')).toContain('而家程度：4 / 5');
    expect(render('stat-tile--gallery')).toContain('4.82 Qa');
    expect(render('stat-tile--gallery')).toContain('18,420');
    expect(render('tools-tree--mixed')).toContain('7<span class="tools-hud__counter-sep">/</span>17');
    for (const state of ['undiscovered', 'locked', 'ready', 'unlocked']) {
      expect(render('tool-card--gallery')).toContain(`tool-node ${state}`);
    }
    for (const label of ['Locked · 未解鎖 (12 / 50)', 'Buy · 買 — 🍪 5,000', 'Already owned · 已經買咗']) {
      expect(render('upgrade-card--gallery')).toContain(label);
    }
  });

  it('renders every route without network access or external assets', () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error('network forbidden')));
    vi.stubGlobal('fetch', fetchSpy);
    try {
      for (const row of inventory.rows) {
        expect(row.deterministic.network).toBe(DESIGN_PARITY_NETWORK_POLICY);
        const request = resolveDesignParityRequest(new URL(row.product.route).searchParams);
        if (request === null) throw new Error(`Missing route request for ${row.id}`);
        const markup = renderToStaticMarkup(createElement(DesignParityRoute, { request }));
        expect(markup).not.toMatch(/(?:src|href)="https?:\/\//i);
      }
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps the App seam on URLSearchParams and the product route free of reference markup imports', () => {
    const appSource = readFileSync(resolve('src/renderer/App.tsx'), 'utf8');
    const routeSource = readFileSync(resolve('src/renderer/DesignParityRoute.tsx'), 'utf8');
    expect(appSource).toMatch(/^\s*const parityRequest = resolveDesignParityRequest\(window\.location\.search\);$/m);
    expect(appSource).toMatch(/^\s*return parityRequest \? <DesignParityRoute request=\{parityRequest\} \/> : <GameApp \/>;$/m);
    expect(routeSource).not.toMatch(/design\/reference-app|\.\.\/\.\.\/design|dangerouslySetInnerHTML|fetch\s*\(/);
  });

  it('uses the exact current design-route token set and proves legacy tokens turn the guard red', () => {
    const css = readFileSync(resolve('src/renderer/styles/design-parity-route.css'), 'utf8');
    const liveTokens = readFileSync(resolve('src/renderer/styles/index.css'), 'utf8');
    const referenceTokens = readFileSync(resolve('design/reference-app/material-reference.css'), 'utf8');
    const tokenMarkup = ['tokens-color--roles', 'tokens-shape-elevation--scale'].map((rowId) => {
      const row = inventory.rows.find((candidate) => candidate.id === rowId);
      if (!row) throw new Error(`Missing inventory row ${rowId}`);
      const request = resolveDesignParityRequest(new URL(row.product.route).searchParams);
      if (!request) throw new Error(`Missing request for ${rowId}`);
      return renderToStaticMarkup(createElement(DesignParityRoute, { request }));
    }).join('\n');
    const current = `${css}\n${tokenMarkup}`;

    expect(() => validateDesignRouteTokenSet(`${current}\n.broken { box-shadow: var(--elevation-4); }`)).toThrow(/token set mismatch|forbidden/i);
    expect(() => validateDesignRouteTokenSet(current)).not.toThrow();
    for (const forbidden of FORBIDDEN_DESIGN_ROUTE_TOKENS) expect(current).not.toContain(`var(${forbidden})`);
    for (const token of ALLOWED_DESIGN_ROUTE_TOKENS) {
      expect(liveTokens, `${token} must be defined by the live renderer`).toContain(`${token}:`);
      if (token === '--tertiary-container') {
        expect(referenceTokens).toContain('--md-sys-color-tertiary-container:');
      } else if (token === '--on-tertiary-container') {
        expect(referenceTokens).toContain('--md-sys-color-on-tertiary-container:');
      } else {
        expect(referenceTokens, `${token} must be defined by the modern reference`).toContain(`${token}:`);
      }
    }
  });

  it('locks the hand-written parity repair boundary and proves an exact removal turns red before restore', () => {
    const routeSource = readFileSync(resolve('src/renderer/DesignParityRoute.tsx'), 'utf8');
    const cssSource = readFileSync(resolve('src/renderer/styles/design-parity-route.css'), 'utf8');
    const selector = ':root:root body .design-parity-route .parity-theme-toggle';
    const brokenCss = cssSource.replace(`${selector} {`, `${selector}-REMOVED {`);
    const brokenRoute = routeSource.replace("import { DestructiveGate } from './components/DestructiveGate.js';", '');

    expect(() => assertParityRouteRepairContract(routeSource, cssSource)).not.toThrow();
    expect(brokenCss).not.toBe(cssSource);
    expect(brokenRoute).not.toBe(routeSource);
    expect(() => assertParityRouteRepairContract(routeSource, brokenCss)).toThrow(/exactly one parity repair selector/i);
    expect(() => assertParityRouteRepairContract(brokenRoute, cssSource)).toThrow(/DestructiveGate/);
  });
});
