import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { posix, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const DESIGN_SYSTEM_ROOT = resolve('design/design-system');

const LOCAL_REFERENCE_CSP = [
  "default-src 'none'",
  "base-uri 'none'",
  "connect-src 'none'",
  "font-src 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  'img-src data:',
  "media-src 'none'",
  "object-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "worker-src 'none'",
].join('; ');

interface HtmlReferenceEntry {
  readonly kind: 'html';
  readonly file: string;
  readonly group: string;
  readonly sha256: string;
  readonly route: string;
  readonly csp: string;
  readonly localAssets: readonly string[];
}

interface SupportFileEntry {
  readonly kind: 'support';
  readonly file: string;
  readonly sha256: string;
}

type ManifestEntry = HtmlReferenceEntry | SupportFileEntry;

// This list is deliberately hand-written. A missing file must remain detectable even when
// directory discovery no longer finds it.
const HTML_REFERENCES: readonly HtmlReferenceEntry[] = [
  { kind: 'html', file: 'narrator-toast.html', group: 'Feedback', sha256: 'e37c0b62448ea444afcfc475f58912c84e3805b6a2f580108579a996ce6ac543', route: '/design/design-system/narrator-toast.html', csp: LOCAL_REFERENCE_CSP, localAssets: [] },
  { kind: 'html', file: 'tokens-color.html', group: 'Foundations', sha256: '1eec002ab7f7ab3c6b871732dff7b0959fa0c5aec0a72010d0c90ee794a4c29e', route: '/design/design-system/tokens-color.html', csp: LOCAL_REFERENCE_CSP, localAssets: [] },
  { kind: 'html', file: 'tokens-shape-elevation.html', group: 'Foundations', sha256: 'fc9ab3a686acc4102dd2eefa2fcce224ab8261b8e2072bc895fd26e513c571f1', route: '/design/design-system/tokens-shape-elevation.html', csp: LOCAL_REFERENCE_CSP, localAssets: [] },
  { kind: 'html', file: 'tokens-type.html', group: 'Foundations', sha256: '5da14e8784922fa635942962e774dfb61f27306cc58af6c8923c054f43b1a4c3', route: '/design/design-system/tokens-type.html', csp: LOCAL_REFERENCE_CSP, localAssets: [] },
  { kind: 'html', file: 'achievement-badge.html', group: 'Game Surfaces', sha256: '918098c969be983ec6439432498f38360239d7e504437eef0f8cc2588c91482a', route: '/design/design-system/achievement-badge.html', csp: LOCAL_REFERENCE_CSP, localAssets: [] },
  { kind: 'html', file: 'building-row.html', group: 'Game Surfaces', sha256: 'b992cae1a6dc03a536bf77402bcd293105fde01dd150e9f790fdccc49f91cc82', route: '/design/design-system/building-row.html', csp: LOCAL_REFERENCE_CSP, localAssets: [] },
  { kind: 'html', file: 'cookie-surface.html', group: 'Game Surfaces', sha256: 'ce3152be2d54f34c64e5d26a2c4b73268e9d4e43304bdbe4cd0c223851e62440', route: '/design/design-system/cookie-surface.html', csp: LOCAL_REFERENCE_CSP, localAssets: [] },
  { kind: 'html', file: 'game-layout.html', group: 'Game Surfaces', sha256: '6f72275e0fa360bae0b8c93aba9168f700da4985aaf5c559b13aed11d8944c48', route: '/design/design-system/game-layout.html', csp: LOCAL_REFERENCE_CSP, localAssets: [] },
  { kind: 'html', file: 'prestige-gate.html', group: 'Game Surfaces', sha256: 'b66c91e7ddc00bf0745b0555bde435d1b811d0f5ed31064ca85be96ac535d233', route: '/design/design-system/prestige-gate.html', csp: LOCAL_REFERENCE_CSP, localAssets: [] },
  { kind: 'html', file: 'stat-tile.html', group: 'Game Surfaces', sha256: '3e4a18417e5719a7ca06ced3ff8f09a2b1fa8d92f581211e0d54a2e8d121ca02', route: '/design/design-system/stat-tile.html', csp: LOCAL_REFERENCE_CSP, localAssets: [] },
  { kind: 'html', file: 'tool-card.html', group: 'Game Surfaces', sha256: '17424745d5c934f99b5e814489a6838ff0235562504cc2cf2698f2465fbb09f2', route: '/design/design-system/tool-card.html', csp: LOCAL_REFERENCE_CSP, localAssets: [] },
  { kind: 'html', file: 'tools-tree.html', group: 'Game Surfaces', sha256: '5345d8e0e8db28debbfc20d2a8f5048a08b1bafd6325deb6b7c7585a7affc3a9', route: '/design/design-system/tools-tree.html', csp: LOCAL_REFERENCE_CSP, localAssets: [] },
  { kind: 'html', file: 'upgrade-card.html', group: 'Game Surfaces', sha256: '65766b3b91cec4b28c51917d8bb4e2ec3afabd7d932b80cb3c4e3158a304f56d', route: '/design/design-system/upgrade-card.html', csp: LOCAL_REFERENCE_CSP, localAssets: [] },
  { kind: 'html', file: 'bulk-toolbar.html', group: 'List Controls', sha256: 'c7af148c30026e8e64ad9992465157ebeab73f514e665f037e11f5f7b8f739c1', route: '/design/design-system/bulk-toolbar.html', csp: LOCAL_REFERENCE_CSP, localAssets: [] },
  { kind: 'html', file: 'search-regex-builder.html', group: 'List Controls', sha256: '0221f4d7faacff47c4330dcd23b1fae060a3835ea92855a36ac6916ead5a3d5b', route: '/design/design-system/search-regex-builder.html', csp: LOCAL_REFERENCE_CSP, localAssets: [] },
  { kind: 'html', file: 'settings-funny-sliders.html', group: 'Settings', sha256: '68ed656a5457505b1ca6cc33cd8820bb74552a0ebc7b692d62481f5301681e51', route: '/design/design-system/settings-funny-sliders.html', csp: LOCAL_REFERENCE_CSP, localAssets: [] },
];

const SUPPORT_FILES: readonly SupportFileEntry[] = [
  { kind: 'support', file: '_adherence.oxlintrc.json', sha256: '0200757596e677c8285210778a3ba068daa1d85862e466e7937b4d782227906c' },
  { kind: 'support', file: '_ds_bundle.js', sha256: 'a13fdd5b3bbd7ea0aa97578dfaa0c13718801ade1ba186dfe1ace8c7145a340a' },
  { kind: 'support', file: '_ds_manifest.json', sha256: 'b20507f0739fb691c621a09522ac18222944917d88c7c4ee2358ddad56674438' },
];

const EXACT_MANIFEST: readonly ManifestEntry[] = [...HTML_REFERENCES, ...SUPPORT_FILES];

class DesignSystemIngestionError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DesignSystemIngestionError';
  }
}

function fail(code: string, message: string): never {
  throw new DesignSystemIngestionError(code, message);
}

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function loadImportedFiles(): Map<string, Buffer> {
  const entries = readdirSync(DESIGN_SYSTEM_ROOT, { withFileTypes: true });
  const files = new Map<string, Buffer>();
  for (const entry of entries) {
    if (!entry.isFile()) fail('UNEXPECTED_NODE', `Expected a file at design/design-system/${entry.name}`);
    files.set(entry.name, readFileSync(resolve(DESIGN_SYSTEM_ROOT, entry.name)));
  }
  return files;
}

function resourceReferences(source: string): string[] {
  const references: string[] = [];
  const attribute = /\b(?:src|href|poster|action)\s*=\s*(?:"([^"]*)"|'([^']*)')/giu;
  const cssUrl = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]+))\s*\)/giu;
  for (const match of source.matchAll(attribute)) references.push(match[1] ?? match[2] ?? '');
  for (const match of source.matchAll(cssUrl)) references.push(match[1] ?? match[2] ?? match[3] ?? '');
  return references.filter((value) => value !== '' && !value.startsWith('#')).sort();
}

function validateLocalAsset(reference: string, file: string): void {
  if (/^[a-z][a-z\d+.-]*:/iu.test(reference) || reference.startsWith('//') || reference.startsWith('/')) {
    fail('EXTERNAL_ASSET', `${file} references a non-local asset: ${reference}`);
  }
  const normalized = posix.normalize(reference.replaceAll('\\', '/'));
  if (normalized === '..' || normalized.startsWith('../')) {
    fail('ASSET_PATH_ESCAPE', `${file} references an asset outside design/design-system: ${reference}`);
  }
}

function validateHtmlReference(entry: HtmlReferenceEntry, bytes: Buffer): void {
  const expectedRoute = `/design/design-system/${entry.file}`;
  if (entry.route !== expectedRoute || decodeURIComponent(entry.route) !== entry.route) {
    fail('ROUTE_DRIFT', `${entry.file} has a non-canonical route`);
  }
  if (entry.csp !== LOCAL_REFERENCE_CSP) fail('CSP_DRIFT', `${entry.file} has a non-canonical CSP`);

  const source = bytes.toString('utf8');
  if (!source.startsWith(`<!-- @dsCard group="${entry.group}" -->`)) {
    fail('GROUP_DRIFT', `${entry.file} does not retain its declared design-system group`);
  }
  if (!/^<!DOCTYPE html>/imu.test(source)) fail('HTML_BOUNDARY_DRIFT', `${entry.file} is not a complete HTML document`);
  if (/https?:\/\//iu.test(source)) fail('REMOTE_URL', `${entry.file} contains a remote URL`);
  if (/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\b|\bnavigator\.sendBeacon\b/iu.test(source)) {
    fail('NETWORK_API', `${entry.file} contains a network API`);
  }
  if (/<(?:base|iframe|object|embed)\b/iu.test(source)) fail('EMBED_BOUNDARY', `${entry.file} can escape its static-document boundary`);
  if (/http-equiv\s*=\s*["']Content-Security-Policy["']/iu.test(source)) {
    fail('DOCUMENT_CSP_OVERRIDE', `${entry.file} overrides the response CSP contract`);
  }
  for (const script of source.matchAll(/<script\b([^>]*)>/giu)) {
    if (/\bsrc\s*=/iu.test(script[1] ?? '')) fail('EXTERNAL_SCRIPT', `${entry.file} loads an external script`);
  }

  const references = resourceReferences(source);
  references.forEach((reference) => validateLocalAsset(reference, entry.file));
  if (JSON.stringify(references) !== JSON.stringify([...entry.localAssets].sort())) {
    fail('LOCAL_ASSET_DRIFT', `${entry.file} local asset references changed`);
  }
}

function validateImportedDesignSystem(files: ReadonlyMap<string, Buffer>): {
  fileCount: number;
  htmlCount: number;
  supportCount: number;
  routeCount: number;
} {
  const expectedNames = EXACT_MANIFEST.map((entry) => entry.file).sort();
  const actualNames = [...files.keys()].sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    fail('FILE_SET_DRIFT', `Expected ${expectedNames.length} exact imported files, received ${actualNames.length}`);
  }

  for (const entry of EXACT_MANIFEST) {
    const bytes = files.get(entry.file);
    if (!bytes) fail('FILE_SET_DRIFT', `Missing imported file: ${entry.file}`);
    if (sha256(bytes) !== entry.sha256) fail('HASH_DRIFT', `SHA-256 drift: ${entry.file}`);
    if (entry.kind === 'html') validateHtmlReference(entry, bytes);
  }

  return {
    fileCount: EXACT_MANIFEST.length,
    htmlCount: HTML_REFERENCES.length,
    supportCount: SUPPORT_FILES.length,
    routeCount: HTML_REFERENCES.length,
  };
}

describe('design-system data ingestion', () => {
  it('keeps the exact hand-written 16 HTML plus 3 support-file manifest', () => {
    expect(validateImportedDesignSystem(loadImportedFiles())).toEqual({
      fileCount: 19,
      htmlCount: 16,
      supportCount: 3,
      routeCount: 16,
    });
  });

  it('keeps every route bounded, every response CSP local-only, and every asset local', () => {
    const files = loadImportedFiles();
    for (const entry of HTML_REFERENCES) {
      expect(entry.route).toBe(`/design/design-system/${entry.file}`);
      expect(entry.csp).toBe(LOCAL_REFERENCE_CSP);
      expect(entry.localAssets).toEqual([]);
      expect(() => validateHtmlReference(entry, files.get(entry.file)!)).not.toThrow();
    }
    expect(new Set(HTML_REFERENCES.map((entry) => entry.route)).size).toBe(16);
  });

  it('keeps the imported bundle manifest aligned with the exact HTML reference list', () => {
    const imported = JSON.parse(readFileSync(resolve(DESIGN_SYSTEM_ROOT, '_ds_manifest.json'), 'utf8')) as {
      cards: Array<{ path: string; group: string }>;
      globalCssPaths: string[];
      fonts: string[];
      brandFonts: string[];
    };
    expect(imported.cards).toEqual(HTML_REFERENCES.map((entry) => ({ path: entry.file, group: entry.group })));
    expect(imported.globalCssPaths).toEqual([]);
    expect(imported.fonts).toEqual([]);
    expect(imported.brandFonts).toEqual([]);
  });

  it('turns red for a missing file and green after the exact file set is restored', () => {
    const original = loadImportedFiles();
    const missing = new Map(original);
    missing.delete('game-layout.html');
    expect(() => validateImportedDesignSystem(missing)).toThrowError(
      expect.objectContaining<Partial<DesignSystemIngestionError>>({ code: 'FILE_SET_DRIFT' }),
    );
    expect(validateImportedDesignSystem(original).fileCount).toBe(19);
  });

  it('turns red for hash drift and green after the exact bytes are restored', () => {
    const original = loadImportedFiles();
    const drifted = new Map(original);
    drifted.set('game-layout.html', Buffer.concat([drifted.get('game-layout.html')!, Buffer.from('\n')]));
    expect(() => validateImportedDesignSystem(drifted)).toThrowError(
      expect.objectContaining<Partial<DesignSystemIngestionError>>({ code: 'HASH_DRIFT' }),
    );
    expect(validateImportedDesignSystem(original).fileCount).toBe(19);
  });
});
