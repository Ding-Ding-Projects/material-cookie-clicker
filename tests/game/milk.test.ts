import { describe, expect, it } from "vitest";

import { bnFromNumber } from "../../src/shared/game/big-number.js";
import { totalCps } from "../../src/shared/game/cps.js";
import {
  kittenMultiplier,
  maximumMilkPercent,
  MILK_BANDS,
  MILK_PERCENT_PER_ACHIEVEMENT,
  milkBandForPercent,
  milkPercent,
  milkPercentForAchievements,
  milkTideFraction,
} from "../../src/shared/game/milk.js";
import { ACHIEVEMENT_DEFINITIONS } from "../../src/shared/game/achievements.js";
import { createInitialGameState } from "../../src/shared/game/reducer.js";
import { computeMultipliers } from "../../src/shared/game/upgrades.js";
import type { GameState } from "../../src/shared/game/types.js";

const NOW = "2025-01-01T00:00:00.000Z";

function stateWithAchievements(count: number, extra: Partial<GameState> = {}): GameState {
  const base = createInitialGameState(NOW);
  return {
    ...base,
    achievements: ACHIEVEMENT_DEFINITIONS.slice(0, count).map((def) => ({
      id: def.id,
      unlockedAtIso: NOW,
    })),
    ...extra,
  };
}

describe("milk level", () => {
  it("is 4% per unlocked achievement and nothing else", () => {
    expect(MILK_PERCENT_PER_ACHIEVEMENT).toBe(4);
    expect(milkPercentForAchievements(0)).toBe(0);
    expect(milkPercentForAchievements(1)).toBe(4);
    expect(milkPercentForAchievements(25)).toBe(100);
  });

  it("refuses to invent milk from a nonsense count", () => {
    expect(milkPercentForAchievements(-3)).toBe(0);
    expect(milkPercentForAchievements(Number.NaN)).toBe(0);
  });

  it("is derived from state, never stored on it", () => {
    expect(milkPercent(stateWithAchievements(0))).toBe(0);
    expect(milkPercent(stateWithAchievements(7))).toBe(28);
  });

  it("caps the DRAWN tide at the glass while the number itself keeps climbing", () => {
    expect(milkTideFraction(stateWithAchievements(10))).toBeCloseTo(0.1, 6);
    expect(milkTideFraction(stateWithAchievements(50))).toBeCloseTo(0.5, 6);
    expect(milkTideFraction(stateWithAchievements(100))).toBe(1);
    expect(milkTideFraction(stateWithAchievements(200))).toBe(1);
    // The drawing stops; the number does not, and a kitten is still paid on the number.
    expect(milkPercent(stateWithAchievements(200))).toBe(800);
  });

  it("reports a maximum that matches the real definition count", () => {
    expect(maximumMilkPercent()).toBe(ACHIEVEMENT_DEFINITIONS.length * 4);
  });
});

describe("milk flavour bands", () => {
  it("starts at plain milk and never leaves a percentage unnamed", () => {
    expect(milkBandForPercent(0).nameEn).toBe("Plain Milk");
    expect(milkBandForPercent(-50).nameEn).toBe("Plain Milk");
    expect(milkBandForPercent(1_000_000).nameEn).toBe(MILK_BANDS[MILK_BANDS.length - 1]!.nameEn);
  });

  it("is listed low to high, with a bilingual name on every band", () => {
    for (let i = 1; i < MILK_BANDS.length; i += 1) {
      expect(MILK_BANDS[i]!.fromPercent).toBeGreaterThan(MILK_BANDS[i - 1]!.fromPercent);
    }
    for (const band of MILK_BANDS) {
      expect(band.nameEn.length).toBeGreaterThan(0);
      expect(band.nameYue.length).toBeGreaterThan(0);
    }
  });

  it("names the band the milk has REACHED, never the one it is close to", () => {
    // 19% is still plain milk; chocolate begins at 20 and not a percentage point sooner.
    expect(milkBandForPercent(19).nameEn).toBe("Plain Milk");
    expect(milkBandForPercent(20).nameEn).toBe("Chocolate Milk");
  });
});

describe("kitten multipliers", () => {
  it("is exactly 1 with no milk, whatever the kitten's strength", () => {
    expect(kittenMultiplier(1, 0)).toBe(1);
    expect(kittenMultiplier(0.3, 0)).toBe(1);
  });

  it("converts milk at the kitten's own rate", () => {
    expect(kittenMultiplier(1, 100)).toBeCloseTo(2, 10);
    expect(kittenMultiplier(0.5, 100)).toBeCloseTo(1.5, 10);
    expect(kittenMultiplier(0.1, 40)).toBeCloseTo(1.04, 10);
  });

  it("keeps paying past 100% milk — the display cap is a drawing, not a rule", () => {
    expect(kittenMultiplier(0.2, 400)).toBeCloseTo(1.8, 10);
  });
});

describe("kittens inside the derived multipliers", () => {
  function withKitten(achievementCount: number): GameState {
    const base = stateWithAchievements(achievementCount, {
      generators: [{ id: "cursor", count: 10 }],
      cookies: bnFromNumber(0),
    });
    return { ...base, upgrades: [{ id: "kitten_helpers", purchasedAtTickCount: 0 }] };
  }

  it("does nothing at all until milk exists", () => {
    const noMilk = withKitten(0);
    expect(computeMultipliers(noMilk).globalCpsMultiplier).toBeCloseTo(1, 10);
  });

  it("gets better as achievements unlock, without the player buying anything more", () => {
    const early = computeMultipliers(withKitten(5)).globalCpsMultiplier;
    const later = computeMultipliers(withKitten(25)).globalCpsMultiplier;
    expect(later).toBeGreaterThan(early);
    // strength 0.1 at 100% milk (25 badges) is exactly x1.1.
    expect(later).toBeCloseTo(1.1, 10);
  });

  it("raises real CPS, not just a reported number", () => {
    const bare = { ...withKitten(25), upgrades: [] };
    expect(totalCps(withKitten(25)).mantissa).toBeGreaterThan(totalCps(bare).mantissa);
  });

  it("composes multiplicatively with a second kitten", () => {
    const twoKittens: GameState = {
      ...withKitten(25),
      upgrades: [
        { id: "kitten_helpers", purchasedAtTickCount: 0 },
        { id: "kitten_workers", purchasedAtTickCount: 0 },
      ],
    };
    // 1.1 x 1.125 at full milk.
    expect(computeMultipliers(twoKittens).globalCpsMultiplier).toBeCloseTo(1.1 * 1.125, 10);
  });
});
