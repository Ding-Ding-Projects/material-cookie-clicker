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
    expect(render('prestige-gate--ready')).toContain('Emergency exit · 緊急離開');
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
});
