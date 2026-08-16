import assert from "node:assert/strict";
import test from "node:test";

import { assertFactsInvariant, formatBilingual, resolveCopy, type CopyBundle } from "../src/language.ts";

// Invented copy fixtures used to exercise the invariant. They describe nothing
// about a real person, amount or filing.
const consistent: CopyBundle = {
  reviewNotice: {
    en: [
      "Review all 5 sections before printing.",
      "Please review all 5 sections before printing.",
      "Have a look at all 5 sections before printing.",
      "Give all 5 sections a once-over before printing.",
      "Eyeball all 5 sections before you hit print.",
    ],
    zh: [
      "列印前請檢查全部 5 個部分。",
      "列印前記得檢查全部 5 個部分。",
      "列印前睇一睇全部 5 個部分。",
      "列印之前，全部 5 個部分都要睇過。",
      "印之前，5 個部分一個都唔好漏。",
    ],
  },
};

const inconsistent: CopyBundle = {
  reviewNotice: {
    en: [
      "Review all 5 sections before printing.",
      "Please review all 5 sections before printing.",
      // This variant changes a fact, which is exactly what the check catches.
      "Have a look at all 6 sections before printing.",
      "Give all 5 sections a once-over before printing.",
      "Eyeball all 5 sections before you hit print.",
    ],
    zh: [
      "列印前請檢查全部 5 個部分。",
      "列印前記得檢查全部 5 個部分。",
      "列印前睇一睇全部 5 個部分。",
      "列印之前，全部 5 個部分都要睇過。",
      "印之前，5 個部分一個都唔好漏。",
    ],
  },
};

test("humour that only changes tone passes the invariant", () => {
  assert.deepEqual(assertFactsInvariant(consistent), []);
});

test("a humour variant that changes a number is reported", () => {
  assert.deepEqual(assertFactsInvariant(inconsistent), ["reviewNotice"]);
});

test("a changed official name is reported", () => {
  const bundle: CopyBundle = {
    mailNotice: {
      en: [
        "The package is prepared for CRA mail-in review.",
        "The package is prepared for CRA mail-in review.",
        "The package is prepared for mail-in review.",
        "The package is prepared for CRA mail-in review.",
        "The package is prepared for CRA mail-in review.",
      ],
      zh: ["同上。", "同上。", "同上。", "同上。", "同上。"],
    },
  };
  assert.deepEqual(assertFactsInvariant(bundle), ["mailNotice"]);
});

test("a changed link is reported", () => {
  const bundle: CopyBundle = {
    sourceNotice: {
      en: [
        "See https://example.org/guide for the source.",
        "See https://example.org/guide for the source.",
        "See https://example.org/other for the source.",
        "See https://example.org/guide for the source.",
        "See https://example.org/guide for the source.",
      ],
      zh: ["同上。", "同上。", "同上。", "同上。", "同上。"],
    },
  };
  assert.deepEqual(assertFactsInvariant(bundle), ["sourceNotice"]);
});

test("copy resolves per language mode and humour level", () => {
  assert.equal(resolveCopy(consistent, "reviewNotice", "en", 1, 3), "Review all 5 sections before printing.");
  assert.equal(resolveCopy(consistent, "reviewNotice", "zh", 1, 3), "列印前睇一睇全部 5 個部分。");
  assert.equal(
    resolveCopy(consistent, "reviewNotice", "both", 1, 1),
    formatBilingual("Review all 5 sections before printing.", "列印前請檢查全部 5 個部分。"),
  );
});

test("out-of-range humour levels are clamped rather than failing", () => {
  assert.equal(resolveCopy(consistent, "reviewNotice", "en", 0, 1), "Review all 5 sections before printing.");
  assert.equal(resolveCopy(consistent, "reviewNotice", "en", 99, 1), "Eyeball all 5 sections before you hit print.");
});

test("a missing key is visible instead of blank", () => {
  assert.equal(resolveCopy(consistent, "absent", "en", 1, 1), "absent");
});
