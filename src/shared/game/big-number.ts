/**
 * BigNum — a normalized decimal float (mantissa * 10^exponent) for cookie-clicker economies.
 *
 * WHY NOT PLAIN `number`:
 *   IEEE-754 doubles lose integer precision past 2^53 (~9.007e15). A clicker's
 *   generator/upgrade cost curves are geometric (baseCost * ratio^n) and are
 *   *designed* to blow past that within a normal play session — reaching 1e50,
 *   1e100, even 1e300+ at the high end of idle/prestige balancing. Once a
 *   `number` loses integer precision, cost comparisons and purchases start
 *   behaving inconsistently (e.g. `x + 1 === x`), which is fatal for a save
 *   file that is trusted to be monotonic.
 *
 * WHY NOT `bigint`:
 *   `bigint` has no fractional part. Growth curves like `1.15 ** n` and
 *   fractional CPS multipliers are inherently non-integer, so a bigint-based
 *   representation would need an ad-hoc fixed-point or float layer bolted on
 *   top anyway — at which point we have reinvented this module, worse.
 *
 * WHY NOT AN ARBITRARY-PRECISION DECIMAL LIBRARY:
 *   Full arbitrary precision (e.g. decimal.js) is overkill for a display-bound
 *   game economy where numbers are always rendered with a handful of
 *   significant digits. A normalized mantissa/exponent pair gives us all the
 *   dynamic range we need (up to double's exponent range, ~1e308) with cheap,
 *   dependency-free arithmetic, at the precision the UI can actually show.
 *
 * WHAT STAYS PLAIN `number`:
 *   Small discrete counters that never approach 2^53 — owned generator
 *   counts, achievement/upgrade ids' indices, timestamps (epoch ms), schema
 *   version integers, click counts within a session. Wrapping those in BigNum
 *   would only add overhead and noise; use BigNum exclusively for economy
 *   values (cookies, lifetime cookies, CPS, costs, ascension value).
 */

export interface BigNum {
  /** Significant digits, normalized so that 1 <= |mantissa| < 10, or mantissa === 0. */
  readonly mantissa: number;
  /** Power of ten the mantissa is scaled by. */
  readonly exponent: number;
}

const EPSILON = 1e-12;

/** Normalize a raw (mantissa, exponent) pair into canonical BigNum form. */
function normalize(mantissa: number, exponent: number): BigNum {
  if (!Number.isFinite(mantissa) || mantissa === 0) {
    return { mantissa: 0, exponent: 0 };
  }

  let m = mantissa;
  let e = exponent;

  // Push mantissa into [1, 10) (or (-10, -1] for negatives), carrying into exponent.
  while (Math.abs(m) >= 10) {
    m /= 10;
    e += 1;
  }
  while (Math.abs(m) < 1) {
    m *= 10;
    e -= 1;
  }

  // Guard against float noise pushing mantissa to exactly 10 or just under 1.
  if (Math.abs(m) >= 10 - EPSILON && Math.abs(m) < 10) {
    m = Math.sign(m) * (Math.abs(m) / 10);
    e += 1;
  }

  return { mantissa: m, exponent: e };
}

export function bnFromNumber(value: number): BigNum {
  if (!Number.isFinite(value) || value === 0) {
    return { mantissa: 0, exponent: 0 };
  }
  const exponent = Math.floor(Math.log10(Math.abs(value)));
  const mantissa = value / Math.pow(10, exponent);
  return normalize(mantissa, exponent);
}

export function bnToNumber(value: BigNum): number {
  if (value.mantissa === 0) return 0;
  return value.mantissa * Math.pow(10, value.exponent);
}

export function bnIsZero(value: BigNum): boolean {
  return value.mantissa === 0;
}

export function bnCompare(a: BigNum, b: BigNum): -1 | 0 | 1 {
  if (bnIsZero(a) && bnIsZero(b)) return 0;
  // Different signs.
  const signA = Math.sign(a.mantissa);
  const signB = Math.sign(b.mantissa);
  if (signA !== signB) return signA < signB ? -1 : 1;

  // Same sign: compare exponent first, then mantissa, flipping for negatives.
  if (a.exponent !== b.exponent) {
    const cmp = a.exponent < b.exponent ? -1 : 1;
    return (signA >= 0 ? cmp : (-cmp as -1 | 1));
  }
  if (Math.abs(a.mantissa - b.mantissa) < EPSILON) return 0;
  return a.mantissa < b.mantissa ? -1 : 1;
}

export function bnAdd(a: BigNum, b: BigNum): BigNum {
  if (bnIsZero(a)) return b;
  if (bnIsZero(b)) return a;

  const expDiff = a.exponent - b.exponent;
  if (Math.abs(expDiff) > 17) {
    // b is negligible relative to a (or vice versa) at double precision.
    return expDiff > 0 ? a : b;
  }

  if (expDiff >= 0) {
    const scaledB = b.mantissa / Math.pow(10, expDiff);
    return normalize(a.mantissa + scaledB, a.exponent);
  }
  const scaledA = a.mantissa / Math.pow(10, -expDiff);
  return normalize(scaledA + b.mantissa, b.exponent);
}

export function bnSub(a: BigNum, b: BigNum): BigNum {
  return bnAdd(a, { mantissa: -b.mantissa, exponent: b.exponent });
}

export function bnMul(a: BigNum, b: BigNum): BigNum {
  if (bnIsZero(a) || bnIsZero(b)) return { mantissa: 0, exponent: 0 };
  return normalize(a.mantissa * b.mantissa, a.exponent + b.exponent);
}

export function bnMulScalar(a: BigNum, scalar: number): BigNum {
  if (bnIsZero(a) || scalar === 0) return { mantissa: 0, exponent: 0 };
  return normalize(a.mantissa * scalar, a.exponent);
}

export function bnDiv(a: BigNum, b: BigNum): BigNum {
  if (bnIsZero(a)) return { mantissa: 0, exponent: 0 };
  if (bnIsZero(b)) {
    throw new RangeError("bnDiv: division by zero BigNum");
  }
  return normalize(a.mantissa / b.mantissa, a.exponent - b.exponent);
}

export function bnPow(base: BigNum, power: number): BigNum {
  if (power === 0) return bnFromNumber(1);
  if (bnIsZero(base)) return { mantissa: 0, exponent: 0 };
  // log10(base) = exponent + log10(mantissa); multiply by power, re-split.
  const log10Base = base.exponent + Math.log10(Math.abs(base.mantissa));
  const log10Result = log10Base * power;
  const resultExponent = Math.floor(log10Result);
  const resultMantissa =
    Math.pow(10, log10Result - resultExponent) * (base.mantissa < 0 && power % 2 !== 0 ? -1 : 1);
  return normalize(resultMantissa, resultExponent);
}

export function bnFloor(value: BigNum): BigNum {
  const asNumber = bnToNumber(value);
  // Only safe to floor via plain number when within safe integer range;
  // beyond that, fractional part is already insignificant.
  if (value.exponent < 15) {
    return bnFromNumber(Math.floor(asNumber));
  }
  return value;
}

export function bnMax(a: BigNum, b: BigNum): BigNum {
  return bnCompare(a, b) >= 0 ? a : b;
}

export function bnMin(a: BigNum, b: BigNum): BigNum {
  return bnCompare(a, b) <= 0 ? a : b;
}

export function bnClampNonNegative(value: BigNum): BigNum {
  return value.mantissa < 0 ? { mantissa: 0, exponent: 0 } : value;
}

export const BN_ZERO: BigNum = { mantissa: 0, exponent: 0 };
