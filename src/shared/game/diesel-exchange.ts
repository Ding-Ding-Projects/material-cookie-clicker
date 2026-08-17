import { bnToNumber, type BigNum } from "./big-number.js";

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

// ------------------------------------------------------------------- the receipt string ----

/**
 * THERE IS NO PRICE CURVE HERE ANY MORE, and that is the point.
 *
 * An earlier build sold litres for cookies on a 1.15 curve — `costOfLitre`, `costOfLitres` and
 * `maxAffordableLitres` lived at this spot. Diesel is manufactured now (diesel-factory.ts):
 * cookies buy wells, refining columns and tanks, and the litres those tanks hold are the only
 * litres the depot can ship. The functions were DELETED rather than left behind unused, because
 * a dead cookies-per-litre rate sitting in the file is exactly the thing a future change would
 * pick back up by accident.
 *
 * What survives is this one formatter, because a voucher still carries a cookie figure — see
 * diesel-factory.ts#amortizedCookiesFor for what that figure now means.
 */

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
