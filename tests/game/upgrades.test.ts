import { describe, expect, it } from "vitest";

import { bnCompare, bnFromNumber, bnToNumber } from "../../src/shared/game/big-number.js";
import { GENERATOR_DEFINITIONS } from "../../src/shared/game/generators.js";
import { createInitialGameState } from "../../src/shared/game/reducer.js";
import {
  computeMultipliers,
  goldenCookieBonuses,
  isUpgradeUnlocked,
  REVEAL_UPGRADE_DEFINITIONS,
  UPGRADE_DEFINITIONS,
} from "../../src/shared/game/upgrades.js";
import type { GameState } from "../../src/shared/game/types.js";

const NOW = "2025-01-01T00:00:00.000Z";

function state(extra: Partial<GameState> = {}): GameState {
  return { ...createInitialGameState(NOW), ...extra };
}

describe("the upgrade catalogue", () => {
  it("is large enough to be a catalogue rather than a shortlist", () => {
    expect(UPGRADE_DEFINITIONS.length).toBeGreaterThanOrEqual(150);
  });

  it("has unique ids", () => {
    const ids = UPGRADE_DEFINITIONS.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("names every upgrade in both languages and prices every one above zero", () => {
    for (const def of UPGRADE_DEFINITIONS) {
      expect(def.nameEn.length, def.id).toBeGreaterThan(0);
      expect(def.nameYue.length, def.id).toBeGreaterThan(0);
      expect(bnToNumber(def.cost), def.id).toBeGreaterThan(0);
    }
  });

  it("points every generator-facing effect and condition at a generator that exists", () => {
    const ids = new Set(GENERATOR_DEFINITIONS.map((g) => g.id));
    for (const def of UPGRADE_DEFINITIONS) {
      if (def.effect.kind === "generatorMultiplier") expect(ids, def.id).toContain(def.effect.generatorId);
      if (def.effect.kind === "synergy") {
        expect(ids, def.id).toContain(def.effect.targetGeneratorId);
        expect(ids, def.id).toContain(def.effect.sourceGeneratorId);
        // A synergy between a generator and itself would just be a hidden flat multiplier.
        expect(def.effect.targetGeneratorId).not.toBe(def.effect.sourceGeneratorId);
      }
      if (def.unlockCondition.kind === "generatorOwned") {
        expect(ids, def.id).toContain(def.unlockCondition.generatorId);
      }
      if (def.unlockCondition.kind === "upgradeOwned") {
        expect(UPGRADE_DEFINITIONS.map((u) => u.id), def.id).toContain(def.unlockCondition.upgradeId);
      }
    }
  });

  it("gives every generator the same five-rung upgrade line", () => {
    for (const gen of GENERATOR_DEFINITIONS) {
      const line = UPGRADE_DEFINITIONS.filter(
        (u) => u.effect.kind === "generatorMultiplier" && u.effect.generatorId === gen.id,
      );
      expect(line, gen.id).toHaveLength(5);
      // Costs climb monotonically along the line, so a deeper rung is never cheaper.
      for (let i = 1; i < line.length; i += 1) {
        expect(bnCompare(line[i]!.cost, line[i - 1]!.cost), `${gen.id} rung ${i}`).toBe(1);
      }
    }
  });

  it("only the four reveals are reveals, and nothing else buys a surface", () => {
    const reveals = UPGRADE_DEFINITIONS.filter((u) => u.effect.kind === "reveal");
    expect(reveals).toHaveLength(REVEAL_UPGRADE_DEFINITIONS.length);
    expect(reveals).toHaveLength(4);
  });

  it("locks nothing behind an unreachable condition", () => {
    // Every kitten's achievement threshold has to be reachable from the real badge count.
    for (const def of UPGRADE_DEFINITIONS) {
      if (def.unlockCondition.kind !== "achievementsUnlocked") continue;
      expect(def.unlockCondition.atLeast, def.id).toBeGreaterThan(0);
      expect(def.unlockCondition.atLeast, def.id).toBeLessThanOrEqual(201);
    }
  });
});

describe("unlock conditions", () => {
  it("reads the achievement count for the kitten line", () => {
    const none = state();
    const some = state({
      achievements: Array.from({ length: 4 }, (_, i) => ({ id: `x${i}`, unlockedAtIso: NOW })),
    });
    const kitten = UPGRADE_DEFINITIONS.find((u) => u.id === "kitten_helpers")!;
    expect(isUpgradeUnlocked(kitten.unlockCondition, none)).toBe(false);
    expect(isUpgradeUnlocked(kitten.unlockCondition, some)).toBe(true);
  });

  it("reads the click count for the click line", () => {
    const callused = UPGRADE_DEFINITIONS.find((u) => u.id === "callused_knuckle")!;
    expect(isUpgradeUnlocked(callused.unlockCondition, state())).toBe(false);
    expect(
      isUpgradeUnlocked(callused.unlockCondition, state({ stats: { totalClicks: 100, totalCookiesBaked: bnFromNumber(0), clockAnomalyCount: 0 } })),
    ).toBe(true);
  });
});

describe("synergy upgrades", () => {
  const synergy = UPGRADE_DEFINITIONS.find((u) => u.id === "synergy_cursor_grandma")!;

  it("is worth nothing while the source generator is unowned", () => {
    const s = state({ upgrades: [{ id: synergy.id, purchasedAtTickCount: 0 }] });
    expect(computeMultipliers(s).generatorMultipliers.grandma ?? 1).toBeCloseTo(1, 10);
  });

  it("scales with how many of the source generator are owned, live", () => {
    const withTen = state({
      upgrades: [{ id: synergy.id, purchasedAtTickCount: 0 }],
      generators: [{ id: "cursor", count: 10 }],
    });
    const withHundred = state({
      upgrades: [{ id: synergy.id, purchasedAtTickCount: 0 }],
      generators: [{ id: "cursor", count: 100 }],
    });
    expect(computeMultipliers(withTen).generatorMultipliers.grandma).toBeCloseTo(1.01, 10);
    expect(computeMultipliers(withHundred).generatorMultipliers.grandma).toBeCloseTo(1.1, 10);
  });

  it("exists in both directions for every neighbouring pair", () => {
    for (let i = 0; i + 1 < GENERATOR_DEFINITIONS.length; i += 1) {
      const lower = GENERATOR_DEFINITIONS[i]!.id;
      const higher = GENERATOR_DEFINITIONS[i + 1]!.id;
      expect(UPGRADE_DEFINITIONS.map((u) => u.id)).toContain(`synergy_${lower}_${higher}`);
      expect(UPGRADE_DEFINITIONS.map((u) => u.id)).toContain(`synergy_${higher}_${lower}`);
    }
  });
});

describe("the golden cookie line", () => {
  it("is a no-op on production, always", () => {
    const s = state({ upgrades: [{ id: "golden_lucky_day", purchasedAtTickCount: 0 }] });
    expect(computeMultipliers(s).globalCpsMultiplier).toBeCloseTo(1, 10);
    expect(computeMultipliers(s).clickMultiplier).toBeCloseTo(1, 10);
  });

  it("folds to 1 and 1 when nothing in the line is owned", () => {
    expect(goldenCookieBonuses(state())).toEqual({ rewardMultiplier: 1, frequencyMultiplier: 1 });
  });

  it("composes rewards and waits multiplicatively", () => {
    const s = state({
      upgrades: [
        { id: "golden_lucky_day", purchasedAtTickCount: 0 },
        { id: "golden_gilded_crumbs", purchasedAtTickCount: 0 },
        { id: "golden_get_lucky", purchasedAtTickCount: 0 },
      ],
    });
    const bonuses = goldenCookieBonuses(s);
    expect(bonuses.frequencyMultiplier).toBeCloseTo(0.8, 10);
    expect(bonuses.rewardMultiplier).toBeCloseTo(3, 10);
  });
});
