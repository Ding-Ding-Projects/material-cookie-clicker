import { describe, expect, it } from 'vitest';

import {
  ParityGuardError,
  applyNegativeMutation,
  loadInventory,
  loadNegativeFixture,
  runNegativeProof,
  validateInventory,
} from '../design/_verify/design-parity-guard.mjs';

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

  it('does not let open Material Design 3 defects pass the release boundary', () => {
    expect(() => validateInventory(loadInventory(), { mode: 'release' })).toThrowError(
      expect.objectContaining<Partial<ParityGuardError>>({ code: 'M3_AUDIT_DEFECT' }),
    );
  });

  it('does not let pending captures pass after the Material audit is green', () => {
    const inventory = structuredClone(loadInventory());
    for (const audit of Object.values(inventory.auditRecords) as Array<{ status: string; primitives: Record<string, { status: string }> }>) {
      audit.status = 'conforming';
      for (const primitive of Object.values(audit.primitives)) primitive.status = 'conforming';
    }
    expect(() => validateInventory(inventory, { mode: 'release' })).toThrowError(
      expect.objectContaining<Partial<ParityGuardError>>({ code: 'EVIDENCE_PENDING' }),
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
