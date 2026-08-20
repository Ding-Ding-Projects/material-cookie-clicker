import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ParityGuardError,
  applyNegativeMutation,
  loadInventory,
  loadNegativeFixture,
  loadPromotionInventory,
  runNegativeProof,
  validateInventory,
} from '../design/_verify/design-parity-guard.mjs';

const SOURCE_COMMIT = '0123456789abcdef0123456789abcdef01234567';
const PRODUCT_ARTIFACT = 'a'.repeat(64);
const REFERENCE_ARTIFACT = 'b'.repeat(64);
const RUN_LEDGER = 'c'.repeat(64);
const RECEIPT = 'd'.repeat(64);
const INTERACTION = 'e'.repeat(64);

function hash(path: string): string {
  return createHash('sha256').update(readFileSync(resolve(path))).digest('hex');
}

function verifiedEvidenceFixture(): {
  inventory: ReturnType<typeof loadInventory>;
  promotionInventory: ReturnType<typeof loadPromotionInventory>;
} {
  const inventory = structuredClone(loadInventory());
  const promotionInventory = structuredClone(loadPromotionInventory());
  for (const row of inventory.rows) {
    row.sourceCommit = SOURCE_COMMIT;
    row.captureProvenance = {
      status: 'verified',
      route: 'cheap-lowlevel-headless',
      sourceCommit: SOURCE_COMMIT,
      runLedgerSha256: RUN_LEDGER,
      productArtifactSha256: PRODUCT_ARTIFACT,
      referenceArtifactSha256: REFERENCE_ARTIFACT,
    };
    for (const [key, suffix, artifact] of [
      ['referenceRaw', 'reference', REFERENCE_ARTIFACT],
      ['productRaw', 'product', PRODUCT_ARTIFACT],
    ] as const) {
      const evidence = row.evidence[key];
      evidence.status = 'verified';
      evidence.sha256 = hash(evidence.path);
      evidence.promotionRecordId = `${row.id}--${suffix}`;
      evidence.receiptSha256 = RECEIPT;
      delete evidence.reason;
      const record = promotionInventory.records.find((entry: any) => entry.id === evidence.promotionRecordId);
      Object.assign(record, {
        active: true,
        status: 'verified',
        receiptSha256: RECEIPT,
        path: evidence.path,
        sourceCommit: SOURCE_COMMIT,
        artifactSha256: artifact,
        captureSha256: evidence.sha256,
        interactionProofId: `${row.id}-${suffix}-route-ready`,
        interactionReceiptSha256: INTERACTION,
        inspectionStatus: 'inspected',
        reason: null,
      });
    }
    const comparison = row.evidence.comparison;
    comparison.status = 'verified';
    comparison.sha256 = hash(comparison.path);
    comparison.manifestPath = `design/parity/evidence/${row.id}/comparison.json`;
    comparison.manifestSha256 = hash(comparison.manifestPath);
    delete comparison.reason;
    const diff = row.evidence.diff;
    diff.status = 'verified';
    diff.sha256 = hash(diff.path);
    delete diff.reason;
  }
  return { inventory, promotionInventory };
}

describe('design parity inventory', () => {
  it('covers the exact hand-written checked-in reference set while promotion remains pending', () => {
    expect(validateInventory(loadInventory(), { mode: 'structure' })).toEqual({
      rowCount: 16,
      referenceCount: 16,
      mode: 'structure',
    });
    expect(loadPromotionInventory().records).toHaveLength(32);
    expect(loadPromotionInventory().records.every((record: any) => record.active === false && record.status === 'pending')).toBe(true);
  });

  it('turns red for every exact negative fixture and green after restore', () => {
    const results = runNegativeProof();
    expect(results).toHaveLength(19);
    expect(results.every((result) => result.red && result.restored === 'green')).toBe(true);
  });

  it('rejects the current provenance-incomplete evidence before visual review', () => {
    expect(() => validateInventory(loadInventory(), { mode: 'release' })).toThrowError(
      expect.objectContaining<Partial<ParityGuardError>>({ code: 'EVIDENCE_PENDING' }),
    );
  });

  it('accepts a fully bound evidence fixture but still rejects its unapproved visual difference for release', () => {
    const fixture = verifiedEvidenceFixture();
    expect(validateInventory(fixture.inventory, { mode: 'evidence', promotionInventory: fixture.promotionInventory })).toEqual({
      rowCount: 16,
      referenceCount: 16,
      mode: 'evidence',
    });
    expect(() => validateInventory(fixture.inventory, { mode: 'release', promotionInventory: fixture.promotionInventory })).toThrowError(
      expect.objectContaining<Partial<ParityGuardError>>({ code: 'DIFF_REVIEW_DEFECT' }),
    );
  });

  it('checks promotion bindings before it reaches the visual review verdict', () => {
    const fixture = verifiedEvidenceFixture();
    delete fixture.inventory.rows[0].evidence.referenceRaw.promotionRecordId;
    expect(() => validateInventory(fixture.inventory, { mode: 'release', promotionInventory: fixture.promotionInventory })).toThrowError(
      expect.objectContaining<Partial<ParityGuardError>>({ code: 'EVIDENCE_PROMOTION_RECORD_MISSING' }),
    );
  });

  it('turns promotion boundaries red and restores the exact fixture green', () => {
    const source = verifiedEvidenceFixture();
    expect(validateInventory(source.inventory, { mode: 'evidence', promotionInventory: source.promotionInventory }).mode).toBe('evidence');
    const cases: Array<[string, (inventory: any, promotion: any) => void, string]> = [
      ['missing promotion id', (inventory) => { delete inventory.rows[0].evidence.referenceRaw.promotionRecordId; }, 'EVIDENCE_PROMOTION_RECORD_MISSING'],
      ['path escape', (inventory) => { inventory.rows[0].evidence.referenceRaw.path = '../../package.json'; }, 'EVIDENCE_PATH_ESCAPE'],
      ['source mismatch', (inventory) => { inventory.rows[0].sourceCommit = '0'.repeat(40); }, 'EVIDENCE_PROMOTION_RECORD_INVALID'],
      ['inactive record', (_inventory, promotion) => { promotion.records[0].active = false; promotion.records[0].status = 'pending'; promotion.records[0].receiptSha256 = null; promotion.records[0].sourceCommit = null; promotion.records[0].artifactSha256 = null; promotion.records[0].captureSha256 = null; promotion.records[0].interactionProofId = null; promotion.records[0].interactionReceiptSha256 = null; promotion.records[0].inspectionStatus = 'pending'; promotion.records[0].reason = 'fixture'; }, 'EVIDENCE_PROMOTION_RECORD_INVALID'],
      ['comparison substitution', (inventory) => { const evidence = inventory.rows[0].evidence; evidence.comparison.manifestPath = evidence.diff.path; evidence.comparison.manifestSha256 = evidence.diff.sha256; }, 'COMPARISON_BINDING_MISMATCH'],
      ['diff substitution', (inventory) => { const evidence = inventory.rows[0].evidence; evidence.diff.path = evidence.comparison.manifestPath; evidence.diff.sha256 = evidence.comparison.manifestSha256; }, 'DIFF_BINDING_MISMATCH'],
    ];
    for (const [label, mutate, code] of cases) {
      const brokenInventory = structuredClone(source.inventory);
      const brokenPromotion = structuredClone(source.promotionInventory);
      mutate(brokenInventory, brokenPromotion);
      expect(() => validateInventory(brokenInventory, { mode: 'evidence', promotionInventory: brokenPromotion }), label).toThrowError(
        expect.objectContaining<Partial<ParityGuardError>>({ code }),
      );
      expect(validateInventory(source.inventory, { mode: 'evidence', promotionInventory: source.promotionInventory }).mode).toBe('evidence');
    }
  });

  it('rejects an audit summary that contradicts its primitive records', () => {
    const inventory = structuredClone(loadInventory());
    inventory.auditRecords['m3-game-surface-v1'].status = 'defect';
    expect(() => validateInventory(inventory, { mode: 'release' })).toThrowError(
      expect.objectContaining<Partial<ParityGuardError>>({ code: 'M3_AUDIT_SUMMARY_MISMATCH' }),
    );
  });

  it('proves every fixture mutates the exact selected row', () => {
    const inventory = loadInventory();
    const fixture = loadNegativeFixture();
    for (const fixtureCase of fixture.breaks) {
      const broken = applyNegativeMutation(inventory, fixtureCase, fixture.rowId);
      expect(broken).not.toEqual(inventory);
    }
  });
});
