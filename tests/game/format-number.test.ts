import { describe, expect, it } from "vitest";
import { bnFromNumber } from "../../src/shared/game/big-number";
import { formatBigNum } from "../../src/shared/game/format-number";

describe("English formatting (base-1000 grouping)", () => {
  it("shows small numbers plainly", () => {
    expect(formatBigNum(bnFromNumber(42), "en")).toBe("42");
  });

  it("groups at thousand", () => {
    expect(formatBigNum(bnFromNumber(1500), "en")).toBe("1.5 thousand");
  });

  it("groups at million", () => {
    expect(formatBigNum(bnFromNumber(2500000), "en")).toBe("2.5 million");
  });

  it("groups at billion", () => {
    expect(formatBigNum(bnFromNumber(3000000000), "en")).toBe("3 billion");
  });

  it("falls back to scientific notation for extremely large exponents", () => {
    const result = formatBigNum(bnFromNumber(1e40), "en");
    expect(result).toMatch(/e40$/);
  });
});

describe("Cantonese formatting (base-10000 grouping) — genuinely different arithmetic", () => {
  it("shows small numbers plainly, matching English below the first grouping boundary", () => {
    expect(formatBigNum(bnFromNumber(9999), "yue")).toBe("9999");
  });

  it("groups at 萬 (10^4), NOT at 10^3 the way English groups at 'thousand'", () => {
    // 15000 in English is "15 thousand" (10^3 boundary); in Cantonese it is 1.5萬 (10^4 boundary).
    expect(formatBigNum(bnFromNumber(15000), "yue")).toBe("1.5萬");
  });

  it("stays within 萬 up to just under 億 (10^8)", () => {
    // 99,990,000 is still expressed in 萬 (9999萬), not 億, because it is < 1e8.
    expect(formatBigNum(bnFromNumber(99990000), "yue")).toBe("9999萬");
  });

  it("groups at 億 (10^8) exactly at the boundary", () => {
    expect(formatBigNum(bnFromNumber(1e8), "yue")).toBe("1億");
  });

  it("groups at 兆 (10^12) exactly at the boundary", () => {
    expect(formatBigNum(bnFromNumber(1e12), "yue")).toBe("1兆");
  });

  it("expresses a value between 億 and 兆 in 億, not 萬 (confirms base-10000 stacking, not base-1000)", () => {
    // 250 * 10^8 = 2.5e10, which is between the 億 and 兆 boundaries.
    expect(formatBigNum(bnFromNumber(2.5e10), "yue")).toBe("250億");
  });

  it("falls back to scientific notation for extremely large exponents, same as English", () => {
    const result = formatBigNum(bnFromNumber(1e40), "yue");
    expect(result).toMatch(/e40$/);
  });
});

describe("explicit scientific style", () => {
  it("always uses scientific notation regardless of locale", () => {
    expect(formatBigNum(bnFromNumber(12345), "en", "scientific")).toMatch(/^1\.23e4$/);
    expect(formatBigNum(bnFromNumber(12345), "yue", "scientific")).toMatch(/^1\.23e4$/);
  });
});
