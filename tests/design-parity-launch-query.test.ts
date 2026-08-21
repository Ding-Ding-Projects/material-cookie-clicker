import { describe, expect, it } from 'vitest';

import { designParitySearchFromArgv, mayNavigateTo } from '../src/main/design-parity-launch.js';

/**
 * The main process turns one launch argument into the query string the renderer parses, so a
 * capture harness can reach the deterministic design-parity route. Before this existed the product
 * side of the parity pipeline was unreachable by construction: `loadFile` was called with no
 * `search`, and the `will-navigate` guard refuses any navigation away from the loaded URL, so the
 * route could not be reached at launch OR over CDP afterwards.
 *
 * That makes this the OUTER of two gates on caller-supplied input, which is why it is tested for
 * what it REFUSES at least as carefully as for what it accepts.
 */
describe('design-parity launch query', () => {
  const full =
    'designParity=stat-tile--gallery&panel=statistics&theme=light&width=1280&height=800&scale=1&state=gallery&locale=en-HK';

  it('accepts the exact query shape the inventory records for a product route', () => {
    const search = designParitySearchFromArgv(['electron.exe', '.', `--design-parity-query=${full}`]);
    expect(search).toBeDefined();
    const params = new URLSearchParams(search!.slice(1));
    expect(params.get('designParity')).toBe('stat-tile--gallery');
    expect(params.get('theme')).toBe('light');
    expect(params.get('width')).toBe('1280');
    expect(params.get('height')).toBe('800');
    expect(params.get('scale')).toBe('1');
    expect(params.get('state')).toBe('gallery');
    expect(params.get('locale')).toBe('en-HK');
  });

  it('is absent unless the flag is actually passed', () => {
    expect(designParitySearchFromArgv(['electron.exe', '.'])).toBeUndefined();
    expect(designParitySearchFromArgv([])).toBeUndefined();
    // A near-miss flag name must not be treated as the real one.
    expect(designParitySearchFromArgv(['--design-parity=stat-tile--gallery'])).toBeUndefined();
  });

  it('refuses every input outside its allowlist', () => {
    const refused: Readonly<Record<string, string>> = {
      'unknown key': `${full}&evil=1`,
      'unknown key alone': 'designParity=stat-tile--gallery&redirect=https://example.com',
      'missing the row id': 'theme=light&width=1280&height=800&scale=1&state=gallery&locale=en-HK',
      'row id with a path traversal': 'designParity=../../etc/passwd',
      'row id with a scheme': 'designParity=file:///c:/windows',
      'row id in the wrong shape': 'designParity=StatTile',
      'theme outside the pair': `designParity=stat-tile--gallery&theme=neon`,
      'width that is not a number': `designParity=stat-tile--gallery&width=12eight0`,
      'width with too many digits': `designParity=stat-tile--gallery&width=128000`,
      'scale with two decimals': `designParity=stat-tile--gallery&scale=1.25`,
      'locale in the wrong shape': `designParity=stat-tile--gallery&locale=english`,
      'empty value': 'designParity=',
      'empty query': '',
    };
    for (const [why, raw] of Object.entries(refused)) {
      expect(
        designParitySearchFromArgv(['electron.exe', '.', `--design-parity-query=${raw}`]),
        why,
      ).toBeUndefined();
    }
  });

  it('refuses an oversized argument rather than parsing it', () => {
    const huge = `designParity=stat-tile--gallery&state=${'a'.repeat(300)}`;
    expect(designParitySearchFromArgv(['electron.exe', '.', `--design-parity-query=${huge}`])).toBeUndefined();
  });

  it('tolerates a leading question mark, because a caller copying a route will include one', () => {
    const withMark = designParitySearchFromArgv(['electron.exe', '.', `--design-parity-query=?${full}`]);
    const without = designParitySearchFromArgv(['electron.exe', '.', `--design-parity-query=${full}`]);
    expect(withMark).toBe(without);
  });
});

/**
 * The navigation guard exists to stop the renderer navigating anywhere at all. The parity capture
 * harness drives sixteen rows through one session, so a narrow exception was cut for moving between
 * fixtures of the SAME document. This is the security-sensitive half of that helper, so what it
 * REFUSES matters far more than what it allows.
 */
describe('design-parity navigation guard', () => {
  const base = 'file:///C:/app/dist/renderer/index.html';
  const query = '?designParity=stat-tile--gallery&theme=light&width=1280&height=800&scale=1&state=gallery&locale=en-HK';
  const loaded = `${base}?designParity=cookie-surface--gallery&theme=light&width=1280&height=800&scale=1&state=gallery&locale=en-HK`;

  it('allows staying exactly where it is', () => {
    expect(mayNavigateTo(loaded, loaded)).toBe(true);
  });

  it('allows moving to another parity fixture of the same document', () => {
    expect(mayNavigateTo(loaded, base + query)).toBe(true);
  });

  it('refuses anything that is not the same document', () => {
    const refused: Readonly<Record<string, string>> = {
      'a different path': `file:///C:/app/dist/renderer/other.html${query}`,
      'a parent directory': `file:///C:/app/dist/other.html${query}`,
      'a path prefix trick': `file:///C:/app/dist/renderer/index.html.evil${query}`,
      'a different protocol': `https://example.com/dist/renderer/index.html${query}`,
      'a remote host': `file://evil.example.com/C:/app/dist/renderer/index.html${query}`,
      'embedded credentials': `https://user:pass@example.com/dist/renderer/index.html${query}`,
      'a fragment': `${base}${query}#somewhere`,
      'a data URL': 'data:text/html,<h1>hi</h1>',
      'a javascript URL': 'javascript:alert(1)',
      'about:blank': 'about:blank',
      'no query at all': base,
      'an unrelated query': `${base}?next=https://example.com`,
      'a valid query plus an unknown key': `${base}${query}&evil=1`,
      'an off-contract theme': `${base}?designParity=stat-tile--gallery&theme=neon`,
      'not a URL': 'not a url at all',
    };
    for (const [why, next] of Object.entries(refused)) {
      expect(mayNavigateTo(loaded, next), why).toBe(false);
    }
  });

  it('refuses navigation away even when the CURRENT url carries a fragment', () => {
    expect(mayNavigateTo(`${loaded}#here`, base + query)).toBe(false);
  });
});
