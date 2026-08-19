import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import {
  assertDesignParityCoverage,
  DESIGN_PARITY_FIXTURES,
  DESIGN_PARITY_NETWORK_POLICY,
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

describe('built-product design parity routes', () => {
  it('covers every hand-written inventory row exactly once with the exact product URL tuple', () => {
    const inventoryIds = inventory.rows.map((row) => row.id);
    expect(inventoryIds).toHaveLength(16);
    expect(new Set(inventoryIds).size).toBe(16);
    expect([...DESIGN_PARITY_ROW_IDS].sort()).toEqual([...inventoryIds].sort());
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
});
