import { describe, expect, it } from "vitest";
import * as ToolsModule from "../../src/shared/game/tools";
import { bnFromNumber } from "../../src/shared/game/big-number";
import { computeMultipliers } from "../../src/shared/game/upgrades";
import { ACHIEVEMENT_DEFINITIONS } from "../../src/shared/game/achievements";
import { freshState } from "./test-helpers";

const { TOOL_DEFINITIONS, isToolBonusActive, isToolDiscovered, totalBuyMaxDiscount, totalOfflineBonuses } = ToolsModule;

/** A state in which `ids` have been BOUGHT — the only way a tool bonus ever switches on. */
function bought(base: ReturnType<typeof freshState>, ...ids: string[]) {
  return { ...base, purchasedToolIds: [...base.purchasedToolIds, ...ids] };
}

describe("Tools tech tree — 20-tool roster", () => {
  it("models at least the 20 required application features as tools", () => {
    expect(TOOL_DEFINITIONS.length).toBeGreaterThanOrEqual(20);
    const ids = new Set(TOOL_DEFINITIONS.map((t) => t.id));
    expect(ids.size).toBe(TOOL_DEFINITIONS.length); // no duplicate ids
  });

  it("every tool has a bilingual name and flavour line", () => {
    for (const def of TOOL_DEFINITIONS) {
      expect(def.nameEn.length).toBeGreaterThan(0);
      expect(def.nameYue.length).toBeGreaterThan(0);
      expect(def.flavourEn.length).toBeGreaterThan(0);
      expect(def.flavourYue.length).toBeGreaterThan(0);
    }
  });
});

describe("LOAD-BEARING: no tool definition can express a feature gate", () => {
  it("every tool's gatesApplicationFeature is structurally false", () => {
    for (const def of TOOL_DEFINITIONS) {
      expect(def.gatesApplicationFeature).toBe(false);
    }
  });

  it("the module exposes no isFeatureAvailable-shaped predicate for tools", () => {
    const anyModule = ToolsModule as unknown as Record<string, unknown>;
    expect(anyModule.isFeatureAvailable).toBeUndefined();
    expect(anyModule.isToolFeatureAvailable).toBeUndefined();
    expect(anyModule.isApplicationFeatureGated).toBeUndefined();
  });
});

describe("Every tool's unlock condition is reachable from a real play sequence", () => {
  it("a plausible late-game state satisfies every single tool's unlock condition", () => {
    // A state representing substantial, but not absurd, real play: several generator tiers
    // owned well past their thresholds, many clicks, multiple prestiges, and the "first_bite"
    // achievement unlocked (which any nonzero lifetime cookies triggers).
    const lateGameState = freshState({
      lifetimeCookies: bnFromNumber(2e9),
      stats: { totalClicks: 10000, totalCookiesBaked: bnFromNumber(2e9), clockAnomalyCount: 0 },
      generators: [
        { id: "cursor", count: 20 },
        { id: "grandma", count: 20 },
        { id: "bank", count: 20 },
        { id: "temple", count: 20 },
        { id: "factory", count: 20 },
        { id: "portal", count: 20 },
      ],
      prestige: { ascensionPoints: 5, totalPrestigeCount: 2, permanentUnlockIds: [] },
      achievements: [{ id: "first_bite", unlockedAtIso: "2026-01-01T00:00:00.000Z" }],
      toolProgressionEnabled: true,
    });

    for (const def of TOOL_DEFINITIONS) {
      expect(
        isToolDiscovered(lateGameState, def.id),
        `expected tool '${def.id}' to be reachable in a late-game state`,
      ).toBe(true);
      // Reachable, and still inert: discovery puts the tool on the shelf with a price on it.
      expect(
        isToolBonusActive(lateGameState, def.id),
        `tool '${def.id}' must not activate itself just because its condition is met`,
      ).toBe(false);
    }
  });

  it("no tool references an achievement id that does not actually exist", () => {
    const achievementIds = new Set(ACHIEVEMENT_DEFINITIONS.map((a) => a.id));
    for (const def of TOOL_DEFINITIONS) {
      if (def.unlockCondition.kind === "achievementUnlocked") {
        expect(achievementIds.has(def.unlockCondition.achievementId)).toBe(true);
      }
    }
  });

  it("no tool references a generator id that does not actually exist", () => {
    const validIds = new Set(["cursor", "grandma", "farm", "mine", "factory", "bank", "temple", "wizardTower", "shipment", "alchemyLab", "portal", "timeMachine", "antimatterCondenser", "prism"]);
    for (const def of TOOL_DEFINITIONS) {
      if (def.unlockCondition.kind === "generatorOwned") {
        expect(validIds.has(def.unlockCondition.generatorId)).toBe(true);
      }
      if (def.effect.kind === "generatorMultiplier") {
        expect(validIds.has(def.effect.generatorId)).toBe(true);
      }
    }
  });
});

describe("toolProgressionEnabled toggle", () => {
  it("when false, every tool bonus reads as active regardless of its unlock condition", () => {
    const nothingUnlockedYet = freshState({ toolProgressionEnabled: false });
    for (const def of TOOL_DEFINITIONS) {
      expect(isToolBonusActive(nothingUnlockedYet, def.id)).toBe(true);
    }
  });

  it("when true (default) and nothing has been played yet, most tools are locked", () => {
    const brandNew = freshState({ toolProgressionEnabled: true });
    const activeCount = TOOL_DEFINITIONS.filter((d) => isToolBonusActive(brandNew, d.id)).length;
    expect(activeCount).toBeLessThan(TOOL_DEFINITIONS.length);
  });

  it("turning it back on returns every unbought tool to inactive — it granted nothing", () => {
    const previewing = freshState({
      toolProgressionEnabled: false,
      stats: { totalClicks: 10000, totalCookiesBaked: bnFromNumber(0), clockAnomalyCount: 0 },
    });
    const backOn = { ...previewing, toolProgressionEnabled: true };
    expect(backOn.purchasedToolIds).toEqual([]);
    for (const def of TOOL_DEFINITIONS) {
      expect(isToolBonusActive(backOn, def.id)).toBe(false);
    }
  });

  it("does not affect feature availability in any way -- there is nothing in this module to check, by design", () => {
    // This test exists to document the contract: flipping the toggle only ever changes what
    // isToolBonusActive returns. There is no other exported predicate this toggle feeds into.
    const anyModule = ToolsModule as unknown as Record<string, unknown>;
    expect(anyModule.isFeatureAvailable).toBeUndefined();
  });
});

describe("DISCOVERY IS NOT A PURCHASE", () => {
  it("meeting the condition discovers the tool and applies nothing", () => {
    // narrator's condition is totalClicks >= 1000.
    const met = freshState({ stats: { totalClicks: 1000, totalCookiesBaked: bnFromNumber(0), clockAnomalyCount: 0 } });
    expect(isToolDiscovered(met, "narrator")).toBe(true);
    expect(isToolBonusActive(met, "narrator")).toBe(false);
    expect(computeMultipliers(met).clickMultiplier).toBeCloseTo(
      computeMultipliers(freshState()).clickMultiplier,
      6,
    );
  });

  it("buying it is what makes the bonus apply", () => {
    const met = freshState({ stats: { totalClicks: 1000, totalCookiesBaked: bnFromNumber(0), clockAnomalyCount: 0 } });
    const owned = bought(met, "narrator");
    expect(isToolBonusActive(owned, "narrator")).toBe(true);
    expect(computeMultipliers(owned).clickMultiplier / computeMultipliers(met).clickMultiplier).toBeCloseTo(1.1, 6);
  });

  it("discovered-but-unbought and bought are distinct states", () => {
    const met = freshState({ generators: [{ id: "cursor", count: 10 }] });
    expect([isToolDiscovered(met, "regexBuilder"), isToolBonusActive(met, "regexBuilder")]).toEqual([true, false]);
    const owned = bought(met, "regexBuilder");
    expect([isToolDiscovered(owned, "regexBuilder"), isToolBonusActive(owned, "regexBuilder")]).toEqual([true, true]);
  });
});

describe("Tool bonuses compose correctly into computeMultipliers", () => {
  it("a bought clickMultiplier tool multiplies computeMultipliers().clickMultiplier", () => {
    // narrator unlocks at totalClicks >= 1000 and grants clickMultiplier x1.1 once bought.
    const before = freshState({ stats: { totalClicks: 1000, totalCookiesBaked: bnFromNumber(0), clockAnomalyCount: 0 } });
    const after = bought(before, "narrator");

    const beforeMultiplier = computeMultipliers(before).clickMultiplier;
    const afterMultiplier = computeMultipliers(after).clickMultiplier;

    expect(afterMultiplier / beforeMultiplier).toBeCloseTo(1.1, 6);
  });

  it("a bought generatorMultiplier tool multiplies the correct generator's entry only", () => {
    // regexBuilder unlocks at cursor >= 10 and grants x1.1 to cursor specifically, once bought.
    const withoutCursors = freshState({ generators: [{ id: "cursor", count: 10 }] });
    const withCursors = bought(withoutCursors, "regexBuilder");

    const before = computeMultipliers(withoutCursors).generatorMultipliers.cursor ?? 1;
    const after = computeMultipliers(withCursors).generatorMultipliers.cursor ?? 1;
    expect(after / before).toBeCloseTo(1.1, 6);

    // Unrelated generator's multiplier is untouched.
    expect(computeMultipliers(withCursors).generatorMultipliers.grandma).toBeUndefined();
  });

  it("multiple bought globalCpsMultiplier tools stack multiplicatively", () => {
    const discovered = freshState({
      lifetimeCookies: bnFromNumber(2e9), // discovers appearanceEditor, notificationCentre, localModelManager
    });
    expect(computeMultipliers(discovered).globalCpsMultiplier).toBeCloseTo(1, 6);
    const state = bought(discovered, "appearanceEditor", "notificationCentre", "localModelManager");
    const multipliers = computeMultipliers(state);
    // 1.03 (appearanceEditor) * 1.03 (notificationCentre) * 1.1 (localModelManager) > any single one alone
    expect(multipliers.globalCpsMultiplier).toBeGreaterThan(1.1);
  });
});

describe("totalBuyMaxDiscount and totalOfflineBonuses", () => {
  it("returns 0 discount when no discount tool is active", () => {
    expect(totalBuyMaxDiscount(freshState({}))).toBe(0);
  });

  it("gives no discount for merely discovering Bulk Actions, and 0.1 once it is bought", () => {
    const discovered = freshState({ stats: { totalClicks: 200, totalCookiesBaked: bnFromNumber(0), clockAnomalyCount: 0 } });
    expect(totalBuyMaxDiscount(discovered)).toBe(0);
    expect(totalBuyMaxDiscount(bought(discovered, "bulkActions"))).toBeCloseTo(0.1, 6);
  });

  it("returns 0 offline bonuses when no offline tool is active", () => {
    const bonuses = totalOfflineBonuses(freshState({}));
    expect(bonuses.extensionMs).toBe(0);
    expect(bonuses.cpsFactorBonus).toBe(0);
  });

  it("accumulates offline bonuses from every BOUGHT offline tool, and none from unbought ones", () => {
    const discovered = freshState({ lifetimeCookies: bnFromNumber(2e9) }); // localHistory + offlineDocs + scheduledSettings
    expect(totalOfflineBonuses(discovered)).toEqual({ extensionMs: 0, cpsFactorBonus: 0 });
    const state = bought(discovered, "localHistory", "offlineDocs", "scheduledSettings");
    const bonuses = totalOfflineBonuses(state);
    expect(bonuses.extensionMs).toBeGreaterThan(0);
    expect(bonuses.cpsFactorBonus).toBeGreaterThan(0);
  });
});
