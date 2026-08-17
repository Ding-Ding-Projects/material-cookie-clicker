import { bnToNumber, type BigNum } from "./big-number.js";

export type FormatLocale = "en" | "yue";
export type FormatStyle = "short" | "scientific";

const EN_SUFFIXES: readonly { threshold: number; suffix: string }[] = [
  { threshold: 1e30, suffix: " nonillion" },
  { threshold: 1e27, suffix: " octillion" },
  { threshold: 1e24, suffix: " septillion" },
  { threshold: 1e21, suffix: " sextillion" },
  { threshold: 1e18, suffix: " quintillion" },
  { threshold: 1e15, suffix: " quadrillion" },
  { threshold: 1e12, suffix: " trillion" },
  { threshold: 1e9, suffix: " billion" },
  { threshold: 1e6, suffix: " million" },
  { threshold: 1e3, suffix: " thousand" },
];

/**
 * Cantonese numeral grouping is genuinely base-10000, not base-1000 with translated suffixes:
 *   萬 (maahn)  = 10^4
 *   億 (yik)    = 10^8   (i.e. 萬^2, not 萬 * 1000)
 *   兆 (siuh)   = 10^12  (i.e. 萬^3)
 * This is why we cannot reuse the English suffix table with swapped strings — the boundaries
 * themselves fall in different places (10^4 / 10^8 / 10^12 rather than 10^3 / 10^6 / 10^9 / ...).
 */
const YUE_SUFFIXES: readonly { threshold: number; suffix: string }[] = [
  { threshold: 1e12, suffix: "兆" },
  { threshold: 1e8, suffix: "億" },
  { threshold: 1e4, suffix: "萬" },
];

const SCIENTIFIC_THRESHOLD_EXPONENT = 33;

function roundToPrecision(value: number, significantDigits: number): number {
  if (value === 0) return 0;
  const magnitude = Math.pow(10, significantDigits - 1 - Math.floor(Math.log10(Math.abs(value))));
  return Math.round(value * magnitude) / magnitude;
}

function formatScientific(value: BigNum): string {
  const mantissa = roundToPrecision(value.mantissa, 3);
  return `${mantissa.toFixed(2)}e${value.exponent}`;
}

function formatEnglish(value: BigNum): string {
  if (value.exponent >= SCIENTIFIC_THRESHOLD_EXPONENT) {
    return formatScientific(value);
  }
  const numeric = bnToNumber(value);
  if (Math.abs(numeric) < 1000) {
    return roundToPrecision(numeric, 4).toString();
  }
  for (const { threshold, suffix } of EN_SUFFIXES) {
    if (Math.abs(numeric) >= threshold) {
      const scaled = roundToPrecision(numeric / threshold, 4);
      return `${scaled}${suffix}`;
    }
  }
  return roundToPrecision(numeric, 4).toString();
}

function formatYue(value: BigNum): string {
  if (value.exponent >= SCIENTIFIC_THRESHOLD_EXPONENT) {
    return formatScientific(value);
  }
  const numeric = bnToNumber(value);
  if (Math.abs(numeric) < 1e4) {
    return roundToPrecision(numeric, 4).toString();
  }
  for (const { threshold, suffix } of YUE_SUFFIXES) {
    if (Math.abs(numeric) >= threshold) {
      const scaled = roundToPrecision(numeric / threshold, 4);
      return `${scaled}${suffix}`;
    }
  }
  return roundToPrecision(numeric, 4).toString();
}

/**
 * Formats a BigNum for display. `formatting is exact and must never be altered by any
 * humour setting` — this function has no dependency on any funny-level/language-mode
 * copy system; it only ever does arithmetic and produces digits plus grouping labels.
 */
export function formatBigNum(value: BigNum, locale: FormatLocale, style: FormatStyle = "short"): string {
  if (style === "scientific") return formatScientific(value);
  return locale === "yue" ? formatYue(value) : formatEnglish(value);
}

/**
 * PRICES ARE NEVER ROUNDED INTO A WORD.
 *
 * A counter may say "1.1 thousand" — it is a running total nobody has to act on. A PRICE is
 * different: it is the exact number of cookies that will leave your account when you press the
 * button, and "1.1 thousand" is not a number you can check against your balance. Every price
 * surface (buy buttons, upgrade tickets, tool nodes, the depot) therefore renders the literal
 * figure with digit grouping — "1,100", "26,370" — via `formatExact` below.
 *
 * Past 10^15 a literal figure stops being readable (and stops being meaningful: a double only
 * carries ~15 significant digits, so the tail is zeroes either way). There the compact form is
 * shown, and the full literal digits go into the control's aria-label/title instead, which is
 * what `formatExactDigits` is for.
 */
export const EXACT_DISPLAY_MAX_EXPONENT = 15;

function groupDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * The full literal figure, always — grouped digits, never a suffix, never scientific notation.
 * Below the double integer range this is plain arithmetic; above it the digits are rebuilt from
 * the normalized mantissa and padded with the zeroes the representation genuinely implies.
 */
export function formatExactDigits(value: BigNum): string {
  const numeric = bnToNumber(value);
  if (Number.isFinite(numeric) && Math.abs(numeric) < 1e21) {
    // Sub-1000 prices can be genuinely fractional (early generator costs); everything larger is
    // rounded to the whole cookie, because that is the granularity the wallet is compared at.
    const rounded = Math.abs(numeric) >= 1000 ? Math.round(numeric) : Math.round(numeric * 100) / 100;
    return rounded.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  if (value.mantissa === 0) return "0";
  const sign = value.mantissa < 0 ? "-" : "";
  const significant = (Math.abs(value.mantissa).toFixed(15).replace(".", "").replace(/0+$/, "") || "0");
  const totalDigits = value.exponent + 1;
  if (totalDigits <= 0) return formatScientific(value);
  const body =
    significant.length >= totalDigits
      ? significant.slice(0, totalDigits)
      : significant + "0".repeat(totalDigits - significant.length);
  return `${sign}${groupDigits(body)}`;
}

/**
 * What a price surface shows: the literal grouped figure below 10^15, and the ordinary compact
 * form above it (pair it with `formatExactDigits` in the aria-label there).
 */
export function formatExact(value: BigNum, locale: FormatLocale = "en"): string {
  if (value.exponent >= EXACT_DISPLAY_MAX_EXPONENT) return formatBigNum(value, locale);
  return formatExactDigits(value);
}
