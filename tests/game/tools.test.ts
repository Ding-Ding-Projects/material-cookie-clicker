import { describe, expect, it } from "vitest";
import * as ToolsModule from "../../src/shared/game/tools";
import { bnFromNumber } from "../../src/shared/game/big-number";
import { applyGameAction, type ReducerCtx } from "../../src/shared/game/reducer";
import { toolPrice } from "../../src/shared/game/tool-shop";
import { computeMultipliers } from "../../src/shared/game/upgrades";
import { ACHIEVEMENT_DEFINITIONS } from "../../src/shared/game/achievements";
import { freshState, fixedRng } from "./test-helpers";

const { TOOL_DEFINITIONS, isFeatureAvailable, isToolBonusActive, totalBuyMaxDiscount, totalOfflineBonuses } =
  ToolsModule;

function ctxAt(epochMs: number, rngValue = 0.99): ReducerCtx {
  return { now: () => epochMs, rng: fixedRng(rngValue) };
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

describe("LOAD-BEARING: every tool definition gates its application feature", () => {
  it("every tool's gatesApplicationFeature is structurally true", () => {
    for (const def of TOOL_DEFINITIONS) {
      expect(def.gatesApplicationFeature).toBe(true);
    }
  });

  it("the module exposes isFeatureAvailable as the one availability predicate", () => {
    expect(typeof isFeatureAvailable).toBe("function");
  });

  it("a feature whose tool's condition is unmet is unavailable on a fresh game", () => {
    // commandPalette unlocks at totalClicks >= 50 (see tools.ts) — a fresh game has none.
    const brandNew = freshState({ toolProgressionEnabled: true });
    expect(isFeatureAvailable(brandNew, "commandPalette")).toBe(false);
  });

  it("buying the tool through the reducer makes its feature available", () => {
    const price = toolPrice("commandPalette");
    const state = freshState({ toolProgressionEnabled: true, cookies: price });
    expect(isFeatureAvailable(state, "commandPalette")).toBe(false);

    const next = applyGameAction(state, { type: "buyTool", toolId: "commandPalette" }, ctxAt(0));

    expect(next.purchasedToolIds).toContain("commandPalette");
    expect(isFeatureAvailable(next, "commandPalette")).toBe(true);
  });

  it("meeting the unlock condition naturally makes its feature available", () => {
    const played = freshState({
      toolProgressionEnabled: true,
      stats: { totalClicks: 50, totalCookiesBaked: bnFromNumber(0), clockAnomalyCount: 0 },
    });
    expect(played.purchasedToolIds).not.toContain("commandPalette");
    expect(isFeatureAvailable(played, "commandPalette")).toBe(true);
  });

  it("feature availability is exactly the tool bonus predicate, for every tool", () => {
    const partiallyPlayed = freshState({
      toolProgressionEnabled: true,
      stats: { totalClicks: 1000, totalCookiesBaked: bnFromNumber(0), clockAnomalyCount: 0 },
      lifetimeCookies: bnFromNumber(10000),
    });
    for (const def of TOOL_DEFINITIONS) {
      expect(isFeatureAvailable(partiallyPlayed, def.id)).toBe(isToolBonusActive(partiallyPlayed, def.id));
    }
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
        isToolBonusActive(lateGameState, def.id),
        `expected tool '${def.id}' to be reachable in a late-game state`,
      ).toBe(true);
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

  it("when false, every application feature is available too", () => {
    // Under the new contract isFeatureAvailable is isToolBonusActive, so a player who opts out
    // of the grind opts every feature on as well. Intended -- no special-casing anywhere.
    const nothingUnlockedYet = freshState({ toolProgressionEnabled: false });
    for (const def of TOOL_DEFINITIONS) {
      expect(isFeatureAvailable(nothingUnlockedYet, def.id)).toBe(true);
    }
  });
});

describe("Tool bonuses compose correctly into computeMultipliers", () => {
  it("an active clickMultiplier tool multiplies computeMultipliers().clickMultiplier", () => {
    // narrator unlocks at totalClicks >= 1000 and grants clickMultiplier x1.1
    const before = freshState({ stats: { totalClicks: 999, totalCookiesBaked: bnFromNumber(0), clockAnomalyCount: 0 } });
    const after = freshState({ stats: { totalClicks: 1000, totalCookiesBaked: bnFromNumber(0), clockAnomalyCount: 0 } });

    const beforeMultiplier = computeMultipliers(before).clickMultiplier;
    const afterMultiplier = computeMultipliers(after).clickMultiplier;

    expect(afterMultiplier / beforeMultiplier).toBeCloseTo(1.1, 6);
  });

  it("an active generatorMultiplier tool multiplies the correct generator's entry only", () => {
    // regexBuilder unlocks at cursor >= 10 and grants x1.1 to cursor specifically.
    const withoutCursors = freshState({ generators: [] });
    const withCursors = freshState({ generators: [{ id: "cursor", count: 10 }] });

    const before = computeMultipliers(withoutCursors).generatorMultipliers.cursor ?? 1;
    const after = computeMultipliers(withCursors).generatorMultipliers.cursor ?? 1;
    expect(after / before).toBeCloseTo(1.1, 6);

    // Unrelated generator's multiplier is untouched.
    expect(computeMultipliers(withCursors).generatorMultipliers.grandma).toBeUndefined();
  });

  it("multiple active globalCpsMultiplier tools stack multiplicatively", () => {
    const state = freshState({
      lifetimeCookies: bnFromNumber(2e9), // unlocks appearanceEditor, notificationCentre, localModelManager (each globalCpsMultiplier)
    });
    const multipliers = computeMultipliers(state);
    // 1.03 (appearanceEditor) * 1.03 (notificationCentre) * 1.1 (localModelManager) > any single one alone
    expect(multipliers.globalCpsMultiplier).toBeGreaterThan(1.1);
  });
});

describe("totalBuyMaxDiscount and totalOfflineBonuses", () => {
  it("returns 0 discount when no discount tool is active", () => {
    expect(totalBuyMaxDiscount(freshState({}))).toBe(0);
  });

  it("returns a nonzero discount once Bulk Actions (totalClicks >= 200) is active", () => {
    const state = freshState({ stats: { totalClicks: 200, totalCookiesBaked: bnFromNumber(0), clockAnomalyCount: 0 } });
    expect(totalBuyMaxDiscount(state)).toBeCloseTo(0.1, 6);
  });

  it("returns 0 offline bonuses when no offline tool is active", () => {
    const bonuses = totalOfflineBonuses(freshState({}));
    expect(bonuses.extensionMs).toBe(0);
    expect(bonuses.cpsFactorBonus).toBe(0);
  });

  it("accumulates offline bonuses from every active offline tool", () => {
    const state = freshState({ lifetimeCookies: bnFromNumber(2e9) }); // localHistory + offlineDocs + scheduledSettings
    const bonuses = totalOfflineBonuses(state);
    expect(bonuses.extensionMs).toBeGreaterThan(0);
    expect(bonuses.cpsFactorBonus).toBeGreaterThan(0);
  });
});
