import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');

function read(relative: string): string {
  return readFileSync(resolve(root, relative), 'utf8').replaceAll('\r\n', '\n');
}

const AD_JS_PATH = 'site/assets/site-ads.js';
const AD_CSS_PATH = 'site/assets/site-ads.css';
const AD_PAGE_PATH = 'site/features/house-ads.html';
const AD_DOC_PATH = 'docs/interface/house-ads.md';

describe('house ads module (site/assets/site-ads.js)', () => {
  it('exists and exports the required contract functions', () => {
    expect(existsSync(resolve(root, AD_JS_PATH)), `${AD_JS_PATH} must exist`).toBe(true);
    const source = read(AD_JS_PATH);
    for (const name of ['AD_SLOTS', 'renderHouseAds', 'dismissAd', 'resetDismissedAds', 'listAds']) {
      const exportPattern = new RegExp(
        `^export\\s+(const|function|async function)\\s+${name}\\b|^export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`,
        'm',
      );
      expect(source, `${AD_JS_PATH} must export ${name} at top level`).toMatch(exportPattern);
    }
  });

  it('gives every ad slot bilingual copy and a feature page that exists on disk', () => {
    const source = read(AD_JS_PATH);
    // Parse per-slot objects by brace-depth rather than evaluating the module (it references
    // browser globals such as `location`), so this stays tolerant of formatting while still
    // reading the real committed data rather than a restated copy of it.
    const arrayStart = source.search(/\bexport\s+const\s+AD_SLOTS\s*=\s*\[/);
    expect(arrayStart, `${AD_JS_PATH} must declare AD_SLOTS as an exported array literal`).toBeGreaterThanOrEqual(0);
    const sliceFrom = source.indexOf('[', arrayStart);
    let depth = 0;
    let sliceTo = -1;
    for (let index = sliceFrom; index < source.length; index += 1) {
      if (source[index] === '[') depth += 1;
      else if (source[index] === ']') {
        depth -= 1;
        if (depth === 0) {
          sliceTo = index + 1;
          break;
        }
      }
    }
    expect(sliceTo, `${AD_JS_PATH} AD_SLOTS array literal must be closed`).toBeGreaterThan(sliceFrom);
    const arrayLiteral = source.slice(sliceFrom + 1, sliceTo - 1);

    // Split the array body into top-level `{ ... }` slot objects by brace depth.
    const slotBlocks: string[] = [];
    let objDepth = 0;
    let objStart = -1;
    for (let index = 0; index < arrayLiteral.length; index += 1) {
      const ch = arrayLiteral[index];
      if (ch === '{') {
        if (objDepth === 0) objStart = index;
        objDepth += 1;
      } else if (ch === '}') {
        objDepth -= 1;
        if (objDepth === 0 && objStart >= 0) {
          slotBlocks.push(arrayLiteral.slice(objStart, index + 1));
          objStart = -1;
        }
      }
    }
    expect(slotBlocks.length, `${AD_JS_PATH} AD_SLOTS must contain at least one slot object`).toBeGreaterThan(0);

    for (const block of slotBlocks) {
      const idMatch = /\bid\s*:\s*'([^']+)'/.exec(block) ?? /\bid\s*:\s*"([^"]+)"/.exec(block);
      const label = idMatch ? idMatch[1] : block.slice(0, 40);

      // English copy: an `en: { ... }` block containing at least one non-empty quoted string.
      const enBlock = /\ben\s*:\s*\{([^{}]*)\}/.exec(block);
      expect(enBlock, `slot ${label} must carry an English "en" block`).not.toBeNull();
      expect(/['"`][^'"`]{3,}['"`]/.test(enBlock![1]), `slot ${label} English copy must not be empty`).toBe(true);

      // Cantonese copy: accept either a `zh` or `yue` block per this project's own convention.
      const cantoneseBlock = /\b(?:zh|yue)\s*:\s*\{([^{}]*)\}/.exec(block);
      expect(cantoneseBlock, `slot ${label} must carry a Cantonese copy block ("zh" or "yue")`).not.toBeNull();
      expect(/['"`][^'"`]{1,}['"`]/.test(cantoneseBlock![1]), `slot ${label} Cantonese copy must not be empty`).toBe(true);
      // Cantonese copy must contain actual CJK characters, not a placeholder ASCII string.
      expect(/[㐀-鿿]/.test(cantoneseBlock![1]), `slot ${label} Cantonese copy must contain Chinese characters`).toBe(true);

      // Feature target: accept either an `href`/`feature` field naming a page under site/features/.
      const featureMatch = /\b(?:href|feature)\s*:\s*(?:`[^`]*`|'[^']*'|"[^"]*")/.exec(block);
      expect(featureMatch, `slot ${label} must name a feature target (href or feature field)`).not.toBeNull();
      const rawTarget = featureMatch![0];
      const fileNameMatch = /([\w-]+\.html)/.exec(rawTarget);
      expect(fileNameMatch, `slot ${label} feature target must reference an .html file: ${rawTarget}`).not.toBeNull();
      const candidatePaths = [
        `site/features/${fileNameMatch![1]}`,
        `site/${fileNameMatch![1]}`,
      ];
      const exists = candidatePaths.some((candidate) => existsSync(resolve(root, candidate)));
      expect(exists, `slot ${label} feature target does not exist on disk: ${fileNameMatch![1]}`).toBe(true);
    }
  });

  it('makes no network call and carries no third-party ad-network identifier', () => {
    const source = read(AD_JS_PATH);
    for (const forbidden of ['fetch(', 'XMLHttpRequest', 'new WebSocket', 'sendBeacon']) {
      expect(source, `${AD_JS_PATH} must not call ${forbidden}`).not.toContain(forbidden);
    }
    // No http(s) URL other than this project's own GitHub Pages origin.
    const urls = [...source.matchAll(/https?:\/\/[^\s"'`)]+/g)].map((match) => match[0]);
    for (const url of urls) {
      expect(url, `${AD_JS_PATH} must not reference an external URL: ${url}`).toMatch(
        /^https:\/\/ding-ding-projects\.github\.io\/material-cookie-clicker\//,
      );
    }
    for (const network of ['googlesyndication', 'doubleclick', 'adsbygoogle', 'taboola', 'outbrain', 'pubmatic']) {
      expect(source.toLowerCase(), `${AD_JS_PATH} must not reference ${network}`).not.toContain(network);
    }
  });
});

describe('house ads stylesheet (site/assets/site-ads.css)', () => {
  it('hard-codes no hex colour for the card surface and uses Material tokens', () => {
    expect(existsSync(resolve(root, AD_CSS_PATH)), `${AD_CSS_PATH} must exist`).toBe(true);
    const css = read(AD_CSS_PATH);
    const cardBlockMatch = /\.site-house-ad\s*\{([^{}]*)\}/.exec(css);
    expect(cardBlockMatch, `${AD_CSS_PATH} must declare a .site-house-ad rule`).not.toBeNull();
    const cardBlock = cardBlockMatch![1];
    const backgroundLine = /background(?:-color)?\s*:\s*([^;]+);/.exec(cardBlock);
    expect(backgroundLine, `${AD_CSS_PATH} .site-house-ad must declare a background`).not.toBeNull();
    expect(backgroundLine![1], `${AD_CSS_PATH} card surface background must not be a hard-coded hex colour`).not.toMatch(
      /#[0-9a-fA-F]{3,8}\b/,
    );
    expect(backgroundLine![1], `${AD_CSS_PATH} card surface background must use a Material token`).toContain('var(--m3-');
  });
});

describe('house ads feature page (site/features/house-ads.html)', () => {
  it('carries the full Open Graph set and a favicon link', () => {
    expect(existsSync(resolve(root, AD_PAGE_PATH)), `${AD_PAGE_PATH} must exist`).toBe(true);
    const markup = read(AD_PAGE_PATH);
    expect(markup, 'og:title').toMatch(/^<meta property="og:title" content="[^"]+" \/>$/m);
    expect(markup, 'og:description').toMatch(/^<meta property="og:description" content="[^"]+" \/>$/m);
    expect(markup, 'og:url').toMatch(/^<meta property="og:url" content="https:\/\/[^"]+" \/>$/m);
    expect(markup, 'og:type').toMatch(/^<meta property="og:type" content="[^"]+" \/>$/m);
    expect(markup, 'og:site_name').toMatch(/^<meta property="og:site_name" content="[^"]+" \/>$/m);
    const ogImage = /^<meta property="og:image" content="([^"]+)" \/>$/m.exec(markup);
    expect(ogImage, 'og:image').not.toBeNull();
    expect(ogImage![1], 'og:image must be absolute https').toMatch(/^https:\/\//);
    expect(markup, 'og:image:width').toMatch(/^<meta property="og:image:width" content="1280" \/>$/m);
    expect(markup, 'og:image:height').toMatch(/^<meta property="og:image:height" content="640" \/>$/m);
    expect(markup, 'og:image:alt').toMatch(/^<meta property="og:image:alt" content="[^"]+" \/>$/m);
    expect(markup, 'twitter:card').toMatch(/^<meta name="twitter:card" content="summary_large_image" \/>$/m);
    expect(markup, 'favicon link').toMatch(/^<link rel="icon" href="[^"]*favicon\.svg" type="image\/svg\+xml" \/>$/m);
  });
});

describe('house ads documentation (docs/interface/house-ads.md)', () => {
  it('has all six required sections', () => {
    expect(existsSync(resolve(root, AD_DOC_PATH)), `${AD_DOC_PATH} must exist`).toBe(true);
    const doc = read(AD_DOC_PATH);
    for (const heading of ['## Behavior', '## Configuration', '## Failure modes', '## Security and privacy', '## Verification', '## Suggested articles']) {
      expect(doc, `${AD_DOC_PATH} must contain ${heading}`).toMatch(new RegExp(`^${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
    }
  });
});
