import { describe, expect, it } from "vitest";
import { bnFromNumber } from "../../src/shared/game/big-number";
import { ascensionValue, canPrestige, performPrestige, prestigeMultiplierFor } from "../../src/shared/game/prestige";
import { freshState } from "./test-helpers";

describe("ascensionValue", () => {
  it("is zero below the curve's threshold", () => {
    expect(ascensionValue(bnFromNumber(0))).toBe(0);
    expect(ascensionValue(bnFromNumber(1e6))).toBe(0);
  });

  it("computes cube-root-of-(lifetime/1e12), floored", () => {
    // 8e12 / 1e12 = 8; cube root of 8 = 2.
    expect(ascensionValue(bnFromNumber(8e12))).toBe(2);
    // 27e12 / 1e12 = 27; cube root of 27 = 3.
    expect(ascensionValue(bnFromNumber(27e12))).toBe(3);
  });
});

describe("prestigeMultiplierFor", () => {
  it("is exactly 1 at zero ascension points", () => {
    expect(prestigeMultiplierFor(0)).toBe(1);
  });

  it("adds 1% per ascension point", () => {
    expect(prestigeMultiplierFor(10)).toBeCloseTo(1.1, 9);
    expect(prestigeMultiplierFor(100)).toBeCloseTo(2, 9);
  });
});

describe("canPrestige", () => {
  it("is false below the 1e12 lifetime threshold", () => {
    expect(canPrestige(freshState({ lifetimeCookies: bnFromNumber(1e11) }))).toBe(false);
  });

  it("is true at or above the 1e12 lifetime threshold", () => {
    expect(canPrestige(freshState({ lifetimeCookies: bnFromNumber(1e12) }))).toBe(true);
  });
});

describe("performPrestige", () => {
  it("resets cookies, lifetimeCookies, and generator counts", () => {
    const state = freshState({
      cookies: bnFromNumber(5000),
      lifetimeCookies: bnFromNumber(8e12),
      generators: [{ id: "cursor", count: 50 }, { id: "grandma", count: 20 }],
    });
    const { state: next } = performPrestige(state);
    expect(next.cookies.mantissa).toBe(0);
    expect(next.lifetimeCookies.mantissa).toBe(0);
    for (const g of next.generators) {
      expect(g.count).toBe(0);
    }
  });

  it("resets non-permanent upgrades but preserves upgrades listed as permanentUnlockIds", () => {
    const state = freshState({
      lifetimeCookies: bnFromNumber(8e12),
      upgrades: [
        { id: "reinforced_finger", purchasedAtTickCount: 5 },
        { id: "permanent_thing", purchasedAtTickCount: 10 },
      ],
      prestige: { ascensionPoints: 0, totalPrestigeCount: 0, permanentUnlockIds: ["permanent_thing"] },
    });
    const { state: next } = performPrestige(state);
    const ids = next.upgrades.map((u) => u.id);
    expect(ids).toContain("permanent_thing");
    expect(ids).not.toContain("reinforced_finger");
  });

  it("PRESERVES achievements and ADDS to ascension points rather than resetting them", () => {
    const state = freshState({
      lifetimeCookies: bnFromNumber(27e12), // earns 3 ascension points
      achievements: [{ id: "first_bite", unlockedAtIso: "2026-01-01T00:00:00.000Z" }],
      prestige: { ascensionPoints: 5, totalPrestigeCount: 1, permanentUnlockIds: [] },
    });
    const { state: next, pointsEarned } = performPrestige(state);

    expect(pointsEarned).toBe(3);
    expect(next.achievements).toEqual(state.achievements); // untouched
    expect(next.prestige.ascensionPoints).toBe(5 + 3); // added, not replaced
    expect(next.prestige.totalPrestigeCount).toBe(2);
  });

  it("preserves stats (e.g. totalClicks, clockAnomalyCount) across prestige", () => {
    const state = freshState({
      lifetimeCookies: bnFromNumber(8e12),
      stats: { totalClicks: 12345, totalCookiesBaked: bnFromNumber(999), clockAnomalyCount: 2 },
    });
    const { state: next } = performPrestige(state);
    expect(next.stats).toEqual(state.stats);
  });
});
