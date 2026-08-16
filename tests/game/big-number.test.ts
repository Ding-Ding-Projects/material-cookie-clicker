import { describe, expect, it } from "vitest";
import {
  BN_ZERO,
  bnAdd,
  bnClampNonNegative,
  bnCompare,
  bnDiv,
  bnFloor,
  bnFromNumber,
  bnIsZero,
  bnMax,
  bnMin,
  bnMul,
  bnMulScalar,
  bnPow,
  bnSub,
  bnToNumber,
} from "../../src/shared/game/big-number";

describe("BigNum normalization", () => {
  it("keeps mantissa in [1, 10) for positive values", () => {
    const v = bnFromNumber(12345);
    expect(v.mantissa).toBeGreaterThanOrEqual(1);
    expect(v.mantissa).toBeLessThan(10);
    expect(v.exponent).toBe(4);
    expect(bnToNumber(v)).toBeCloseTo(12345, 6);
  });

  it("keeps mantissa in (-10, -1] for negative values", () => {
    const v = bnFromNumber(-500);
    expect(Math.abs(v.mantissa)).toBeGreaterThanOrEqual(1);
    expect(Math.abs(v.mantissa)).toBeLessThan(10);
    expect(bnToNumber(v)).toBeCloseTo(-500, 6);
  });

  it("normalizes zero to the canonical zero form", () => {
    const v = bnFromNumber(0);
    expect(v.mantissa).toBe(0);
    expect(v.exponent).toBe(0);
    expect(bnIsZero(v)).toBe(true);
    expect(bnIsZero(BN_ZERO)).toBe(true);
  });

  it("round-trips values well past double integer precision (1e300)", () => {
    const v = bnFromNumber(1e300);
    expect(v.exponent).toBe(300);
    expect(v.mantissa).toBeCloseTo(1, 6);
  });
});

describe("BigNum arithmetic across exponent boundaries", () => {
  it("adds two values with very different exponents (small one is preserved unless negligible)", () => {
    const big = bnFromNumber(1e10);
    const small = bnFromNumber(1e9);
    const sum = bnAdd(big, small);
    expect(bnToNumber(sum)).toBeCloseTo(1.1e10, -1);
  });

  it("adding a negligibly small value to a huge one leaves the huge value effectively unchanged", () => {
    const huge = bnFromNumber(1e50);
    const tiny = bnFromNumber(1);
    const sum = bnAdd(huge, tiny);
    expect(bnCompare(sum, huge)).toBe(0);
  });

  it("subtracts correctly across an exponent carry (10 - 1 = 9, no boundary crossing)", () => {
    const a = bnFromNumber(10);
    const b = bnFromNumber(1);
    expect(bnToNumber(bnSub(a, b))).toBeCloseTo(9, 6);
  });

  it("subtracts across an exponent boundary (100 - 1 = 99, exponent drops from 2 to 1)", () => {
    const a = bnFromNumber(100);
    const b = bnFromNumber(1);
    const result = bnSub(a, b);
    expect(result.exponent).toBe(1);
    expect(bnToNumber(result)).toBeCloseTo(99, 6);
  });

  it("multiplies across exponent boundaries (mantissa overflow carries into exponent)", () => {
    // 5e10 * 5e10 = 2.5e21 -- mantissa 5*5=25 must carry: 2.5, exponent 21.
    const a = bnFromNumber(5e10);
    const b = bnFromNumber(5e10);
    const result = bnMul(a, b);
    expect(result.exponent).toBe(21);
    expect(result.mantissa).toBeCloseTo(2.5, 6);
  });

  it("divides across exponent boundaries", () => {
    const a = bnFromNumber(1e10);
    const b = bnFromNumber(1e3);
    const result = bnDiv(a, b);
    expect(bnToNumber(result)).toBeCloseTo(1e7, -1);
  });

  it("divides by zero throws rather than silently producing Infinity", () => {
    expect(() => bnDiv(bnFromNumber(5), BN_ZERO)).toThrow(RangeError);
  });

  it("bnMulScalar scales without losing precision across exponents", () => {
    const v = bnFromNumber(1e15);
    const result = bnMulScalar(v, 3);
    expect(bnToNumber(result)).toBeCloseTo(3e15, 5);
  });

  it("bnPow raises to a fractional and integer power correctly", () => {
    expect(bnToNumber(bnPow(bnFromNumber(2), 10))).toBeCloseTo(1024, 6);
    expect(bnToNumber(bnPow(bnFromNumber(1.15), 0))).toBeCloseTo(1, 9);
  });

  it("bnPow handles very large exponents without overflowing to Infinity", () => {
    const result = bnPow(bnFromNumber(1.15), 5000);
    expect(Number.isFinite(result.mantissa)).toBe(true);
    expect(Number.isFinite(result.exponent)).toBe(true);
    expect(result.exponent).toBeGreaterThan(300);
  });

  it("bnFloor floors within safe range and is a no-op for astronomically large values", () => {
    expect(bnToNumber(bnFloor(bnFromNumber(9.9)))).toBe(9);
    const huge = bnFromNumber(1e20);
    expect(bnCompare(bnFloor(huge), huge)).toBe(0);
  });

  it("bnCompare orders correctly across signs and exponents", () => {
    expect(bnCompare(bnFromNumber(5), bnFromNumber(10))).toBe(-1);
    expect(bnCompare(bnFromNumber(10), bnFromNumber(5))).toBe(1);
    expect(bnCompare(bnFromNumber(5), bnFromNumber(5))).toBe(0);
    expect(bnCompare(bnFromNumber(-5), bnFromNumber(5))).toBe(-1);
    expect(bnCompare(bnFromNumber(-10), bnFromNumber(-5))).toBe(-1);
    expect(bnCompare(bnFromNumber(1e20), bnFromNumber(1e10))).toBe(1);
  });

  it("bnMax and bnMin pick correctly", () => {
    const a = bnFromNumber(5);
    const b = bnFromNumber(10);
    expect(bnToNumber(bnMax(a, b))).toBe(10);
    expect(bnToNumber(bnMin(a, b))).toBe(5);
  });

  it("bnClampNonNegative clamps negatives to zero and preserves non-negatives", () => {
    expect(bnIsZero(bnClampNonNegative(bnFromNumber(-5)))).toBe(true);
    expect(bnToNumber(bnClampNonNegative(bnFromNumber(5)))).toBe(5);
  });
});
