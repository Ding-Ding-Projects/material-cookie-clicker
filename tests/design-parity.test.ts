import { describe, expect, it } from 'vitest';

import {
  ParityGuardError,
  applyNegativeMutation,
  loadInventory,
  loadNegativeFixture,
  runNegativeProof,
  validateInventory,
} from '../design/_verify/design-parity-guard.mjs';

function historicalVerifiedEvidenceFixture(): ReturnType<typeof loadInventory> {
  const inventory = structuredClone(loadInventory());
  for (const row of inventory.rows) {
    row.sourceCommit = '13e09369a3b6f9336d4604f7b8eade652276a4e5';
    for (const evidence of Object.values(row.evidence) as Array<{ status: string; reason?: string }>) {
      evidence.status = 'verified';
      delete evidence.reason;
    }
  }
  return inventory;
}

describe('design parity inventory', () => {
  it('covers the exact hand-written checked-in reference set', () => {
    expect(validateInventory(loadInventory(), { mode: 'structure' })).toEqual({
      rowCount: 16,
      referenceCount: 16,
      mode: 'structure',
    });
  });

  it('turns red for every exact negative fixture and green after restore', () => {
    const results = runNegativeProof();
    expect(results).toHaveLength(19);
    expect(results.every((result) => result.red && result.restored === 'green')).toBe(true);
  });

  it('does not let stale evidence pass after reference fine alignment', () => {
    expect(() => validateInventory(loadInventory(), { mode: 'release' })).toThrowError(
      expect.objectContaining<Partial<ParityGuardError>>({ code: 'EVIDENCE_PENDING' }),
    );
  });

  it('still rejects an unapproved historical visual difference when its evidence fixture is verified', () => {
    expect(() => validateInventory(historicalVerifiedEvidenceFixture(), { mode: 'release' })).toThrowError(
      expect.objectContaining<Partial<ParityGuardError>>({ code: 'DIFF_REVIEW_DEFECT' }),
    );
  });

  it('checks raw receipt bindings before it reaches the visual review verdict', () => {
    const inventory = historicalVerifiedEvidenceFixture();
    delete inventory.rows[0].evidence.referenceRaw.receiptPath;
    expect(() => validateInventory(inventory, { mode: 'release' })).toThrowError(
      expect.objectContaining<Partial<ParityGuardError>>({ code: 'EVIDENCE_RECEIPT_MISSING' }),
    );
  });

  it('turns release-evidence boundaries red and restores the honest evidence contract green', () => {
    const source = historicalVerifiedEvidenceFixture();
    expect(validateInventory(source, { mode: 'evidence' })).toEqual({ rowCount: 16, referenceCount: 16, mode: 'evidence' });
    const cases: Array<[string, (inventory: any) => void, string]> = [
      ['missing receipt', (inventory) => { delete inventory.rows[0].evidence.referenceRaw.receiptPath; }, 'EVIDENCE_RECEIPT_MISSING'],
      ['path escape', (inventory) => { inventory.rows[0].evidence.referenceRaw.path = '../../package.json'; }, 'EVIDENCE_PATH_ESCAPE'],
      ['source mismatch', (inventory) => { inventory.rows[0].sourceCommit = '0000000000000000000000000000000000000000'; }, 'EVIDENCE_SOURCE_MISMATCH'],
      ['receipt substitution', (inventory) => { const evidence = inventory.rows[0].evidence; evidence.referenceRaw.receiptPath = evidence.comparison.manifestPath; evidence.referenceRaw.receiptSha256 = evidence.comparison.manifestSha256; }, 'EVIDENCE_RECEIPT_INVALID'],
      ['comparison substitution', (inventory) => { const evidence = inventory.rows[0].evidence; evidence.comparison.manifestPath = evidence.diff.path; evidence.comparison.manifestSha256 = evidence.diff.sha256; }, 'COMPARISON_BINDING_MISMATCH'],
      ['diff substitution', (inventory) => { const evidence = inventory.rows[0].evidence; evidence.diff.path = evidence.comparison.manifestPath; evidence.diff.sha256 = evidence.comparison.manifestSha256; }, 'DIFF_BINDING_MISMATCH'],
    ];
    for (const [label, mutate, code] of cases) {
      const broken = structuredClone(source);
      mutate(broken);
      expect(() => validateInventory(broken, { mode: 'evidence' }), label).toThrowError(
        expect.objectContaining<Partial<ParityGuardError>>({ code }),
      );
      expect(validateInventory(source, { mode: 'evidence' }).mode).toBe('evidence');
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
