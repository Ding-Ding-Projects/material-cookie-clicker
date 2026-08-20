import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  RUN_LEDGER_MARKER,
  assertNoHardcodedCaptureIdentity,
  loadJsonStrict,
  requiredPromotionRecordFields,
  validatePromotionInventory,
  validatePromotionReceipt,
  validateRunLedger,
  validateRunLedgerFile,
} from '../scripts/promotion-receipt-contract.mjs';

const COMMIT = '0123456789abcdef0123456789abcdef01234567';
const STALE_COMMIT = 'fedcba9876543210fedcba9876543210fedcba98';
const STARTED_AT = '2026-08-18T20:00:00.000Z';
const CAPTURED_AT = '2026-08-18T20:12:00.000Z';

type Fixture = {
  root: string;
  repoRoot: string;
  runRoot: string;
  ledger: Record<string, any>;
  ledgerSha256: string;
  receipt: Record<string, any>;
  inventory: Record<string, any>;
};

let fixture: Fixture;

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function png(width: number, height: number): Buffer {
  const raw = Buffer.alloc(height * (1 + width * 4));
  const compressed = deflateSync(raw);
  const chunk = (type: string, body: Buffer): Buffer => {
    const typeBytes = Buffer.from(type, 'ascii');
    const length = Buffer.alloc(4);
    length.writeUInt32BE(body.length, 0);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, body])), 0);
    return Buffer.concat([length, typeBytes, body, checksum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function rel(root: string, target: string): string {
  return relative(root, target).replaceAll('\\', '/');
}

function asset(runRoot: string, path: string, bytes: Buffer | string): { path: string; sha256: string } {
  const absolute = join(runRoot, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, bytes);
  return { path, sha256: sha256(Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)) };
}

function makeFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'promotion-receipt-contract-'));
  const repoRoot = join(root, 'repo');
  const runRoot = join(root, 'run');
  mkdirSync(repoRoot, { recursive: true });
  mkdirSync(runRoot, { recursive: true });
  const ownerMarkerPath = join(runRoot, '.task-owned.json');
  const ownerMarker = { version: 1, marker: RUN_LEDGER_MARKER, taskId: 'promotion-receipt-contract', repoRoot, runRoot, sourceCommit: COMMIT, createdAt: STARTED_AT };
  writeJson(ownerMarkerPath, ownerMarker);

  const rawBytes = png(1280, 800);
  const promotedPath = join(repoRoot, 'captures', 'settings-dark.png');
  mkdirSync(dirname(promotedPath), { recursive: true });
  writeFileSync(promotedPath, rawBytes);
  const rawPath = join(runRoot, 'captures', 'settings-dark-product.png');
  mkdirSync(dirname(rawPath), { recursive: true });
  writeFileSync(rawPath, rawBytes);

  const productIndex = asset(runRoot, 'build/product/index.html', '<!doctype html><link rel="stylesheet" href="./assets/app.css"><script src="./assets/app.js"></script>\n');
  const productScript = asset(runRoot, 'build/product/assets/app.js', 'document.body.dataset.capture = "settings-dark";\n');
  const productStyle = asset(runRoot, 'build/product/assets/app.css', 'body { background: #111827; }\n');
  const referenceIndex = asset(runRoot, 'build/reference/index.html', '<!doctype html><link rel="stylesheet" href="./assets/reference.css"><script src="./assets/reference.js"></script>\n');
  const referenceScript = asset(runRoot, 'build/reference/assets/reference.js', 'document.body.dataset.reference = "settings-dark";\n');
  const referenceStyle = asset(runRoot, 'build/reference/assets/reference.css', 'body { background: #111827; }\n');

  const build = (kind: 'product' | 'reference', indexHtml: { path: string; sha256: string }, scripts: Array<{ path: string; sha256: string }>, styles: Array<{ path: string; sha256: string }>) => ({
    version: 1,
    kind,
    sourceCommit: COMMIT,
    artifactPath: scripts[0].path,
    artifactSha256: scripts[0].sha256,
    artifactBuiltAt: STARTED_AT,
    loadedUrl: 'file:///' + indexHtml.path,
    indexHtml,
    scripts,
    styles,
  });
  const writeBuild = (kind: 'product' | 'reference', value: Record<string, any>): Record<string, any> => {
    const receiptPath = 'build/' + kind + '/build-receipt.json';
    const absolute = join(runRoot, receiptPath);
    writeJson(absolute, value);
    return { ...value, receiptPath, receiptSha256: sha256(readFileSync(absolute)) };
  };
  const productReceipt = writeBuild('product', build('product', productIndex, [productScript], [productStyle]));
  const referenceReceipt = writeBuild('reference', build('reference', referenceIndex, [referenceScript], [referenceStyle]));

  const writeProof = (side: 'product' | 'reference', value: Record<string, any>): Record<string, any> => {
    const proofPath = 'proofs/' + side + '-runtime.json';
    const absolute = join(runRoot, proofPath);
    writeJson(absolute, value);
    return { ...value, proofPath, proofSha256: sha256(readFileSync(absolute)) };
  };
  const productRuntime = writeProof('product', { launchPid: 32145, hwnd: '0x123456', hwndResolvedLive: true, consoleErrorCount: 0, pageErrorCount: 0, visibleDesktopUntouched: true, expectedSurfaceOnly: true, unrelatedTargetsObserved: false, observedAt: '2026-08-18T20:09:00.000Z' });
  const referenceRuntime = writeProof('reference', { launchPid: 32146, hwnd: '0x123457', hwndResolvedLive: true, consoleErrorCount: 0, pageErrorCount: 0, visibleDesktopUntouched: true, expectedSurfaceOnly: true, unrelatedTargetsObserved: false, observedAt: '2026-08-18T20:09:01.000Z' });

  const reviewer = 'promotion-contract-fixture-review';
  const reviewedAt = '2026-08-18T20:13:00.000Z';
  const proof = (side: 'product' | 'reference', kind: 'interaction' | 'privacy', value: Record<string, any>) => {
    const path = 'proofs/' + side + '-' + kind + '.json';
    const bytes = Buffer.from(JSON.stringify(value) + '\n');
    asset(runRoot, path, bytes);
    return { path, sha256: sha256(bytes) };
  };
  const productInteraction = proof('product', 'interaction', { version: 1, proof: 'settings-opened-from-navigation', side: 'product' });
  const productPrivacy = proof('product', 'privacy', { version: 1, visibleDesktopUntouched: true, expectedSurfaceOnly: true, sensitiveDataReviewed: true, unrelatedTargetsObserved: false, reviewer, reviewedAt });
  const referenceInteraction = proof('reference', 'interaction', { version: 1, proof: 'settings-opened-from-navigation', side: 'reference' });
  const referencePrivacy = proof('reference', 'privacy', { version: 1, visibleDesktopUntouched: true, expectedSurfaceOnly: true, sensitiveDataReviewed: true, unrelatedTargetsObserved: false, reviewer, reviewedAt });
  const inspection = { decoded: true, pixelsInspected: true, targetVisible: true, expectedStateVisible: true, sensitiveDataReviewed: true, reviewer, reviewedAt };
  const capture = (side: 'product' | 'reference', runtime: Record<string, any>, interaction: Record<string, string>, privacy: Record<string, string>) => ({
    version: 1,
    id: 'settings-dark--' + side,
    rowId: 'settings-dark',
    side,
    rawPath: 'captures/settings-dark-' + side + '.png',
    promotedPath: 'captures/settings-dark.png',
    sha256: sha256(rawBytes),
    interactionProofId: 'settings-opened-from-navigation',
    interactionReceiptPath: interaction.path,
    interactionReceiptSha256: interaction.sha256,
    privacyScanPath: privacy.path,
    privacyScanSha256: privacy.sha256,
    width: 1280,
    height: 800,
    scale: 1,
    startedAt: '2026-08-18T20:10:00.000Z',
    capturedAt: CAPTURED_AT,
    inspection,
    runtime,
  });
  const productCapture = capture('product', productRuntime, productInteraction, productPrivacy);
  const referenceCapture = capture('reference', referenceRuntime, referenceInteraction, referencePrivacy);
  writeFileSync(join(runRoot, productCapture.rawPath), rawBytes);
  writeFileSync(join(runRoot, referenceCapture.rawPath), rawBytes);

  const cleanupProofPath = join(runRoot, 'proofs', 'cleanup.json');
  const cleanupProof = { completed: true, ownedOnly: true, completedAt: CAPTURED_AT };
  writeJson(cleanupProofPath, cleanupProof);
  const ledger = {
    version: 1,
    owner: { marker: RUN_LEDGER_MARKER, markerPath: '.task-owned.json', markerSha256: sha256(readFileSync(ownerMarkerPath)), taskId: 'promotion-receipt-contract', repoRoot, runRoot, createdAt: STARTED_AT },
    route: 'cheap-lowlevel-headless',
    source: { startCommit: COMMIT, endCommit: COMMIT },
    rows: ['settings-dark'],
    builds: { product: productReceipt, reference: referenceReceipt },
    runtime: { product: productRuntime, reference: referenceRuntime },
    captures: { [productCapture.id]: productCapture, [referenceCapture.id]: referenceCapture },
    cleanup: { ...cleanupProof, proofPath: 'proofs/cleanup.json', proofSha256: sha256(readFileSync(cleanupProofPath)) },
  };
  const ledgerPath = join(runRoot, 'run-ledger.json');
  writeJson(ledgerPath, ledger);
  const ledgerSha256 = sha256(readFileSync(ledgerPath));

  const receipt = {
    version: 1,
    id: productCapture.id,
    route: 'cheap-lowlevel-headless',
    provenance: { runLedgerPath: 'run-ledger.json', runLedgerSha256: ledgerSha256 },
    source: {
      startCommit: COMMIT,
      endCommit: COMMIT,
      artifactPath: productReceipt.artifactPath,
      artifactSha256: productReceipt.artifactSha256,
      buildReceiptPath: productReceipt.receiptPath,
      buildReceiptSha256: productReceipt.receiptSha256,
      artifactBuiltAt: STARTED_AT,
    },
    capture: {
      rawPath: productCapture.rawPath,
      promotedPath: productCapture.promotedPath,
      sha256: productCapture.sha256,
      rawSha256: productCapture.sha256,
      mimeType: 'image/png',
      startedAt: productCapture.startedAt,
      capturedAt: productCapture.capturedAt,
      width: productCapture.width,
      height: productCapture.height,
    },
    state: { surface: 'desktop-app', screen: 'settings', state: 'default', theme: 'dark', viewport: { width: 1280, height: 800, scale: 1 }, captureKind: 'page' },
    privacy: { visibleDesktopUntouched: true, expectedSurfaceOnly: true, sensitiveDataReviewed: true, unrelatedTargetsObserved: false, mocked: false, handEdited: false },
    inspection,
    runtime: {
      launchPid: productRuntime.launchPid,
      hwnd: productRuntime.hwnd,
      hwndResolvedLive: true,
      consoleErrorCount: 0,
      pageErrorCount: 0,
      interactionProofId: productCapture.interactionProofId,
      interactionReceiptPath: productCapture.interactionReceiptPath,
      interactionReceiptSha256: productCapture.interactionReceiptSha256,
      privacyScanPath: productCapture.privacyScanPath,
      privacyScanSha256: productCapture.privacyScanSha256,
      cleanupCompleted: true,
      cleanupOwnedOnly: true,
    },
    inventory: { path: 'design/parity/evidence/promotion-inventory.json', recordId: productCapture.id },
    documentation: [
      { path: 'README.md', alt: 'Settings in dark theme at 1280 by 800' },
      { path: 'docs/features/settings.md', alt: 'Settings in dark theme at 1280 by 800' },
    ],
  };
  const receiptPath = join(repoRoot, 'design', 'parity', 'evidence', receipt.id + '.json');
  writeJson(receiptPath, receipt);
  writeFileSync(join(repoRoot, 'README.md'), '![Settings in dark theme at 1280 by 800](captures/settings-dark.png)\n', 'utf8');
  const documentationPath = join(repoRoot, 'docs', 'features', 'settings.md');
  mkdirSync(dirname(documentationPath), { recursive: true });
  writeFileSync(documentationPath, '<img src=\"captures/settings-dark.png\" alt=\"Settings in dark theme at 1280 by 800\">\n', 'utf8');
  const inventory = {
    schemaVersion: 2,
    records: [{
      id: receipt.id,
      active: true,
      status: 'verified',
      rowId: 'settings-dark',
      evidenceKey: 'productRaw',
      receiptSha256: sha256(readFileSync(receiptPath)),
      path: 'captures/settings-dark.png',
      sourceCommit: COMMIT,
      artifactSha256: productReceipt.artifactSha256,
      captureSha256: receipt.capture.sha256,
      screen: 'settings',
      state: 'default',
      theme: 'dark',
      viewportWidth: 1280,
      viewportHeight: 800,
      scale: 1,
      interactionProofId: productCapture.interactionProofId,
      interactionReceiptSha256: productCapture.interactionReceiptSha256,
      inspectionStatus: 'inspected',
      reason: null,
    }],
  };
  writeJson(join(repoRoot, 'design', 'parity', 'evidence', 'promotion-inventory.json'), inventory);
  return { root, repoRoot, runRoot, ledger, ledgerSha256, receipt, inventory };
}

beforeEach(() => { fixture = makeFixture(); });
afterEach(() => { rmSync(fixture.root, { recursive: true, force: true }); });

const receiptOptions = () => ({ expectedCommit: COMMIT, ledger: fixture.ledger, ledgerSha256: fixture.ledgerSha256, inventory: fixture.inventory, repoRoot: fixture.repoRoot, runRoot: fixture.runRoot });

describe('promotion evidence contract', () => {
  it('requires the owner marker/task-owned roots, route, rows, and stable source commit', () => {
    expect(() => validateRunLedger(fixture.ledger, { repoRoot: fixture.repoRoot, runRoot: fixture.runRoot, expectedCommit: COMMIT, requiredRowIds: ['settings-dark'] })).not.toThrow();
    for (const mutate of [
      (ledger: any) => { ledger.owner.marker = ''; },
      (ledger: any) => { ledger.owner.runRoot = fixture.repoRoot; },
      (ledger: any) => { ledger.route = 'visible-desktop'; },
      (ledger: any) => { ledger.rows = []; },
      (ledger: any) => { ledger.source.endCommit = STALE_COMMIT; },
    ]) {
      const broken = structuredClone(fixture.ledger);
      mutate(broken);
      expect(() => validateRunLedger(broken, { repoRoot: fixture.repoRoot, runRoot: fixture.runRoot, expectedCommit: COMMIT, requiredRowIds: ['settings-dark'] })).toThrow();
    }
  });

  it('binds both build receipts to actual index.html, JavaScript, and CSS hash sets', () => {
    const options = { repoRoot: fixture.repoRoot, runRoot: fixture.runRoot, expectedCommit: COMMIT, requiredRowIds: ['settings-dark'] };
    expect(() => validateRunLedgerFile('run-ledger.json', options)).not.toThrow();
    writeFileSync(join(fixture.runRoot, fixture.ledger.builds.product.styles[0].path), 'tampered style\n', 'utf8');
    expect(() => validateRunLedgerFile('run-ledger.json', options)).toThrow();
    const missingAssets = structuredClone(fixture.ledger);
    missingAssets.builds.reference.scripts = [];
    writeJson(join(fixture.runRoot, 'run-ledger.json'), missingAssets);
    expect(() => validateRunLedgerFile('run-ledger.json', options)).toThrow();
  });

  it('requires live positive PID/HWND and no hardcoded fallback identity', () => {
    expect(() => validatePromotionReceipt(fixture.receipt, receiptOptions())).not.toThrow();
    for (const mutate of [
      (receipt: any) => { receipt.runtime.launchPid = 0; },
      (receipt: any) => { receipt.runtime.hwnd = '0'; },
      (receipt: any) => { receipt.runtime.hwndResolvedLive = false; },
    ]) {
      const broken = structuredClone(fixture.receipt);
      mutate(broken);
      expect(() => validatePromotionReceipt(broken, receiptOptions())).toThrow();
    }
  });

  it('requires interaction, privacy, inspection reviewedAt, and owned cleanup proof', () => {
    expect(() => validatePromotionReceipt(fixture.receipt, receiptOptions())).not.toThrow();
    for (const path of ['runtime.interactionProofId', 'runtime.interactionReceiptSha256', 'inspection.reviewedAt', 'runtime.cleanupOwnedOnly'] as const) {
      const broken = structuredClone(fixture.receipt);
      const [parent, key] = path.split('.') as [string, string];
      broken[parent][key] = typeof broken[parent][key] === 'boolean' ? false : '';
      expect(() => validatePromotionReceipt(broken, receiptOptions()), path).toThrow();
    }
  });

  it('requires viewport scale and exact Markdown/HTML image links with alt text', () => {
    expect(() => validatePromotionReceipt(fixture.receipt, receiptOptions())).not.toThrow();
    const noScale = structuredClone(fixture.receipt);
    delete noScale.state.viewport.scale;
    expect(() => validatePromotionReceipt(noScale, receiptOptions())).toThrow();
    writeFileSync(join(fixture.repoRoot, 'README.md'), '![Settings](captures/settings-dark.png)\n', 'utf8');
    expect(() => validatePromotionReceipt(fixture.receipt, receiptOptions())).toThrow();
    writeFileSync(join(fixture.repoRoot, 'README.md'), 'Settings in dark theme at 1280 by 800\n', 'utf8');
    expect(() => validatePromotionReceipt(fixture.receipt, receiptOptions())).toThrow();
  });

  it('requires all 13 inventory fields and one active exact record', () => {
    expect(requiredPromotionRecordFields).toEqual([
      'path', 'sourceCommit', 'artifactSha256', 'captureSha256', 'screen', 'state', 'theme',
      'viewportWidth', 'viewportHeight', 'scale', 'interactionProofId', 'interactionReceiptSha256', 'inspectionStatus',
    ]);
    expect(() => validatePromotionInventory(fixture.inventory, { expectedIds: [fixture.receipt.id] })).not.toThrow();
    for (const field of requiredPromotionRecordFields) {
      const broken = structuredClone(fixture.inventory);
      delete broken.records[0][field];
      expect(() => validatePromotionInventory(broken, { expectedIds: [fixture.receipt.id] }), field).toThrow();
    }
    const wrongRecord = structuredClone(fixture.inventory);
    wrongRecord.records[0].id = 'wrong-record';
    expect(() => validatePromotionReceipt(fixture.receipt, { ...receiptOptions(), inventory: wrongRecord })).toThrow();
  });

  it('keeps 32 stale receipts pending and rejects stale active promotion', () => {
    const records = Array.from({ length: 32 }, (_, index) => ({
      id: 'stale-' + String(index).padStart(2, '0'),
      active: false,
      status: 'pending',
      rowId: 'stale-row-' + index,
      evidenceKey: index % 2 ? 'referenceRaw' : 'productRaw',
      receiptSha256: null,
      path: 'captures/stale-' + index + '.png',
      sourceCommit: null,
      artifactSha256: null,
      captureSha256: null,
      screen: 'settings',
      state: 'default',
      theme: 'dark',
      viewportWidth: 1280,
      viewportHeight: 800,
      scale: 1,
      interactionProofId: null,
      interactionReceiptSha256: null,
      inspectionStatus: 'pending',
      reason: 'stale receipt awaits recapture at the current source commit',
    }));
    const pending = { schemaVersion: 2, records };
    expect(() => validatePromotionInventory(pending, { expectedIds: records.map((record) => record.id) })).not.toThrow();
    const activeStale = structuredClone(pending);
    activeStale.records[0].active = true;
    activeStale.records[0].status = 'verified';
    expect(() => validatePromotionInventory(activeStale)).toThrow();
    const staleReceipt = structuredClone(fixture.receipt);
    staleReceipt.source.startCommit = STALE_COMMIT;
    expect(() => validatePromotionReceipt(staleReceipt, receiptOptions())).toThrow();
  });

  it('rejects receipt, promoted, documentation, inventory, and run paths that escape their roots', () => {
    for (const [field, value] of [
      ['source.buildReceiptPath', '../../outside/build.json'],
      ['source.artifactPath', '../../outside/app.js'],
      ['capture.promotedPath', '../../outside/capture.png'],
      ['inventory.path', '../../outside/inventory.json'],
      ['documentation.0.path', '../../outside/README.md'],
      ['runtime.interactionReceiptPath', '../../outside/interaction.json'],
      ['provenance.runLedgerPath', '../../outside/run-ledger.json'],
    ] as const) {
      const broken = structuredClone(fixture.receipt);
      const parts = field.split('.');
      if (parts[0] === 'documentation') broken.documentation[0].path = value;
      else broken[parts[0]][parts[1]] = value;
      expect(() => validatePromotionReceipt(broken, receiptOptions()), field).toThrow();
    }
  });

  it('rejects hardcoded SOURCE_COMMIT, numeric PID/HWND tuples, raw copy promotion, and arbitrary JS glob picks', () => {
    expect(() => assertNoHardcodedCaptureIdentity('const source = await readSourceCommit(); const pid = process.pid; const hwnd = await resolveLiveWindowHandle();')).not.toThrow();
    for (const bad of [
      'const SOURCE_COMMIT = "0123456789abcdef0123456789abcdef01234567";',
      'const runtime = { launchPid: 32145, hwnd: "0x123456" };',
      'const runtime = { hwnd: 456789 };',
      'const pair = ("referenceRaw", 32145, 123456);',
      'shutil.copyfile(reference_source, promoted_path);',
      'const artifact = next(repo.glob("*.js"));',
      "const artifact = next(glob('*.js'));",
    ]) {
      expect(() => assertNoHardcodedCaptureIdentity(bad), bad).toThrow();
    }
  });

  it('keeps the shipped parity pipeline free of hardcoded provenance and direct raw promotion', () => {
    for (const path of [
      'scripts/design-parity-capture.mjs',
      'scripts/design-parity-reference-capture.mjs',
      'scripts/design-parity-evidence.py',
    ]) {
      expect(() => assertNoHardcodedCaptureIdentity(readFileSync(resolve(path), 'utf8'), { path }), path).not.toThrow();
    }
  });

  it('loads strict JSON fixtures and rejects malformed or duplicate-key evidence', () => {
    const validPath = join(fixture.runRoot, 'valid.json');
    writeFileSync(validPath, '{"version":1,"id":"fixture"}\n', 'utf8');
    expect(loadJsonStrict(validPath)).toEqual({ version: 1, id: 'fixture' });
    const malformedPath = join(fixture.runRoot, 'malformed.json');
    writeFileSync(malformedPath, '{"version":1,\n', 'utf8');
    expect(() => loadJsonStrict(malformedPath)).toThrow();
    const duplicatePath = join(fixture.runRoot, 'duplicate.json');
    writeFileSync(duplicatePath, '{"version":1,"version":2}\n', 'utf8');
    expect(() => loadJsonStrict(duplicatePath)).toThrow();
  });
});
