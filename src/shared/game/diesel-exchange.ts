import {
  bnCompare,
  bnDiv,
  bnFromNumber,
  bnMul,
  bnMulScalar,
  bnPow,
  bnSub,
  bnToNumber,
  type BigNum,
} from "./big-number.js";

/**
 * THE DIESEL VOUCHER EXCHANGE — the cookie-side half of a two-application contract.
 *
 * WinForge (a separate Windows application, in its own repository) simulates a PWR plant whose
 * two emergency diesel generators are the "10-second diesel". This module lets a Material
 * Cookie Clicker player spend cookies on diesel fuel for that plant, by MINTING vouchers into a
 * small append-only JSON ledger that both applications can open on the same machine:
 *
 *     %APPDATA%/DingDingProjects/exchange/diesel-vouchers.json
 *
 * Everything here is pure: serialization, parsing, appending, and the price curve. No file
 * system, no clock, no randomness. The main process owns all three of those (see
 * src/main/diesel-ledger-service.ts) and the renderer never touches any of them directly.
 *
 * DIVISION OF LABOUR — this application only ever MINTS and LISTS. Setting a voucher's
 * `consumedAt` is WinForge's job and no cookie-side code may do it. As of this commit the
 * WinForge consumer has not been built, so no voucher this game writes has ever been consumed,
 * and the game says exactly that on screen rather than implying a delivery took place.
 *
 * The full, ordinary-language contract lives in docs/winforge-diesel-exchange.md.
 */

/** Bump only for a breaking change to the ledger's shape; readers must refuse a higher one. */
export const DIESEL_LEDGER_SCHEMA_VERSION = 1;

/** Path segments below the OS roaming application-data directory. */
export const DIESEL_LEDGER_DIR_SEGMENTS: readonly string[] = ["DingDingProjects", "exchange"];

export const DIESEL_LEDGER_FILE_NAME = "diesel-vouchers.json";

/** Human-readable form of the agreed location, for documentation and UI strings. */
export const DIESEL_LEDGER_DISPLAY_PATH = `%APPDATA%/${DIESEL_LEDGER_DIR_SEGMENTS.join("/")}/${DIESEL_LEDGER_FILE_NAME}`;

/**
 * One purchase of diesel fuel, paid for in cookies.
 *
 * `cookiesSpent` is a decimal STRING rather than a JSON number on purpose: the cookie economy
 * runs on a mantissa/exponent big number and outgrows IEEE-754 integers within an ordinary
 * session. A string keeps the receipt readable and lossless for a reader that only wants to
 * display it, and keeps this file free of the cookie side's own numeric representation.
 */
export interface DieselVoucher {
  /** Unique across the whole ledger. Minted by the writer; readers must not renumber. */
  readonly id: string;
  /** ISO-8601 UTC instant the voucher was minted, taken from the minting process's clock. */
  readonly mintedAt: string;
  /** Litres of diesel this voucher is worth. A positive integer. */
  readonly litres: number;
  /** What the player paid, in cookies, as a decimal or scientific-notation string. */
  readonly cookiesSpent: string;
  /** Null until WinForge consumes the voucher; then WinForge's own ISO-8601 instant. */
  readonly consumedAt: string | null;
}

export interface DieselVoucherLedger {
  readonly schemaVersion: number;
  readonly vouchers: readonly DieselVoucher[];
}

export function createEmptyLedger(): DieselVoucherLedger {
  return { schemaVersion: DIESEL_LEDGER_SCHEMA_VERSION, vouchers: [] };
}

export type ParseLedgerResult =
  | { readonly ok: true; readonly ledger: DieselVoucherLedger }
  | { readonly ok: false; readonly reason: "malformed"; readonly detail: string }
  | { readonly ok: false; readonly reason: "future-version"; readonly foundVersion: number };

/**
 * Validates raw parsed JSON as a ledger. NEVER throws — a caller holding a damaged file has to
 * be able to preserve it rather than crash on it, exactly as the save codec does.
 */
export function parseLedger(raw: unknown): ParseLedgerResult {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "malformed", detail: "Ledger is not a JSON object." };
  }
  const candidate = raw as Record<string, unknown>;
  const version = candidate.schemaVersion;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    return { ok: false, reason: "malformed", detail: "Ledger has no valid schemaVersion." };
  }
  if (version > DIESEL_LEDGER_SCHEMA_VERSION) {
    return { ok: false, reason: "future-version", foundVersion: version };
  }
  if (!Array.isArray(candidate.vouchers)) {
    return { ok: false, reason: "malformed", detail: "Ledger has no vouchers array." };
  }

  const vouchers: DieselVoucher[] = [];
  for (const [index, entry] of (candidate.vouchers as unknown[]).entries()) {
    const problem = describeVoucherProblem(entry);
    if (problem) {
      return { ok: false, reason: "malformed", detail: `Voucher at index ${index}: ${problem}` };
    }
    const voucher = entry as Record<string, unknown>;
    vouchers.push({
      id: voucher.id as string,
      mintedAt: voucher.mintedAt as string,
      litres: voucher.litres as number,
      cookiesSpent: voucher.cookiesSpent as string,
      consumedAt: (voucher.consumedAt as string | null) ?? null,
    });
  }

  return { ok: true, ledger: { schemaVersion: version, vouchers } };
}

function describeVoucherProblem(entry: unknown): string | null {
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return "not an object.";
  const v = entry as Record<string, unknown>;
  if (typeof v.id !== "string" || v.id.length === 0) return "id must be a non-empty string.";
  if (typeof v.mintedAt !== "string" || v.mintedAt.length === 0) return "mintedAt must be an ISO-8601 string.";
  if (typeof v.litres !== "number" || !Number.isInteger(v.litres) || v.litres <= 0) {
    return "litres must be a positive integer.";
  }
  if (typeof v.cookiesSpent !== "string") return "cookiesSpent must be a decimal string.";
  if (v.consumedAt !== null && typeof v.consumedAt !== "string" && v.consumedAt !== undefined) {
    return "consumedAt must be null or an ISO-8601 string.";
  }
  return null;
}

/**
 * Appends one voucher. APPEND-ONLY is the whole contract: existing entries are copied through
 * untouched, in order, so a `consumedAt` WinForge has already written can never be reverted by
 * a mint that happens afterwards. A duplicate id is refused rather than overwriting.
 */
export function appendVoucher(ledger: DieselVoucherLedger, voucher: DieselVoucher): DieselVoucherLedger {
  if (ledger.vouchers.some((v) => v.id === voucher.id)) {
    throw new RangeError(`A voucher with id ${voucher.id} is already in the ledger.`);
  }
  return { schemaVersion: DIESEL_LEDGER_SCHEMA_VERSION, vouchers: [...ledger.vouchers, voucher] };
}

/** The exact bytes written to disk: pretty-printed, two-space indented, trailing newline. */
export function serializeLedger(ledger: DieselVoucherLedger): string {
  return `${JSON.stringify(
    {
      schemaVersion: ledger.schemaVersion,
      vouchers: ledger.vouchers.map((v) => ({
        id: v.id,
        mintedAt: v.mintedAt,
        litres: v.litres,
        cookiesSpent: v.cookiesSpent,
        consumedAt: v.consumedAt,
      })),
    },
    null,
    2,
  )}\n`;
}

export interface LedgerSummary {
  readonly voucherCount: number;
  readonly totalLitres: number;
  /** How many vouchers carry a `consumedAt`. Written by WinForge, never by this application. */
  readonly consumedCount: number;
}

export function summarizeLedger(ledger: DieselVoucherLedger): LedgerSummary {
  let totalLitres = 0;
  let consumedCount = 0;
  for (const voucher of ledger.vouchers) {
    totalLitres += voucher.litres;
    if (voucher.consumedAt !== null) consumedCount += 1;
  }
  return { voucherCount: ledger.vouchers.length, totalLitres, consumedCount };
}

// ----------------------------------------------------------------- the price curve ----

/**
 * THE RATE. The first litre costs a thousand cookies, and every litre already minted makes the
 * next one 15% dearer — the same 1.15 growth ratio every generator tier uses (generators.ts),
 * so the depot reads as one more rung of an economy the player already understands rather than
 * a bolt-on. Ten litres cost about 20,300 cookies; a hundred litres about 1.74 billion. That
 * keeps it a real sink at every stage of a run instead of a rounding error by mid-game.
 *
 * The curve is over LIFETIME litres minted, not litres currently held, because a voucher leaves
 * this application for good the moment it is written. There is nothing to sell back.
 */
export const DIESEL_FIRST_LITRE_COST = 1000;
export const DIESEL_COST_RATIO = 1.15;

/** Cost of one litre when `alreadyMinted` litres have been minted over the save's lifetime. */
export function costOfLitre(alreadyMinted: number): BigNum {
  return bnMulScalar(bnPow(bnFromNumber(DIESEL_COST_RATIO), alreadyMinted), DIESEL_FIRST_LITRE_COST);
}

/**
 * Cost of `quantity` litres bought in one press, summed as the geometric series
 * `first * r^minted * (r^quantity - 1) / (r - 1)` rather than litre-by-litre, so a large
 * purchase costs the same whether it is made in one press or many.
 */
export function costOfLitres(alreadyMinted: number, quantity: number): BigNum {
  if (quantity <= 0) return bnFromNumber(0);
  const ratio = bnFromNumber(DIESEL_COST_RATIO);
  const head = bnMulScalar(bnPow(ratio, alreadyMinted), DIESEL_FIRST_LITRE_COST);
  const series = bnDiv(bnSub(bnPow(ratio, quantity), bnFromNumber(1)), bnFromNumber(DIESEL_COST_RATIO - 1));
  return bnMul(head, series);
}

/**
 * Renders a cookie amount as the decimal/scientific string a voucher's `cookiesSpent` carries.
 * Plain digits while the amount fits comfortably in an ordinary number, scientific notation
 * beyond that — never the game's own compact "1.2M" display form, which is lossy and would
 * make the receipt unreadable to a program on the other side of the contract.
 */
export function cookiesSpentString(value: BigNum): string {
  const asNumber = bnToNumber(value);
  if (Number.isFinite(asNumber) && Math.abs(asNumber) < 1e15) {
    return Number.isInteger(asNumber) ? String(asNumber) : asNumber.toFixed(2);
  }
  return `${value.mantissa.toFixed(6)}e${value.exponent}`;
}

/** The most litres `budget` cookies can buy, given `alreadyMinted`. Never negative. */
export function maxAffordableLitres(alreadyMinted: number, budget: BigNum): number {
  let quantity = 0;
  // Small, bounded, and honest: the curve grows 15% a litre, so even an absurd budget stops
  // well inside this cap, and a loop cannot drift the way a closed-form logarithm can.
  while (quantity < 10000 && bnCompare(budget, costOfLitres(alreadyMinted, quantity + 1)) >= 0) {
    quantity += 1;
  }
  return quantity;
}
