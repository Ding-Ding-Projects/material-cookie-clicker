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
