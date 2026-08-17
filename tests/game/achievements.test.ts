import { describe, expect, it } from "vitest";
import { bnFromNumber } from "../../src/shared/game/big-number";
import { ACHIEVEMENT_DEFINITIONS, evaluateAchievements } from "../../src/shared/game/achievements";
import { GENERATOR_DEFINITIONS } from "../../src/shared/game/generators";
import { freshState } from "./test-helpers";

describe("achievements", () => {
  it("has a real per-generator, lifetime, click, and prestige milestone roster", () => {
    expect(ACHIEVEMENT_DEFINITIONS.length).toBeGreaterThanOrEqual(200);
    const ids = new Set(ACHIEVEMENT_DEFINITIONS.map((a) => a.id));
    expect(ids.size).toBe(ACHIEVEMENT_DEFINITIONS.length);
  });

  it("names every badge in both languages", () => {
    for (const def of ACHIEVEMENT_DEFINITIONS) {
      expect(def.nameEn.length, def.id).toBeGreaterThan(0);
      expect(def.nameYue.length, def.id).toBeGreaterThan(0);
    }
  });

  it("covers every rung of the generator ladder, including the six new ones", () => {
    for (const gen of GENERATOR_DEFINITIONS) {
      const line = ACHIEVEMENT_DEFINITIONS.filter(
        (a) => a.condition.kind === "generatorOwned" && a.condition.generatorId === gen.id,
      );
      expect(line, gen.id).toHaveLength(6);
    }
  });

  it("counts breadth as well as depth", () => {
    const state = freshState({
      generators: [
        { id: "cursor", count: 6 },
        { id: "grandma", count: 5 },
      ],
    });
    const newly = evaluateAchievements(state);
    expect(newly).toContain("total_generators_10");
    expect(newly).toContain("generator_types_2");
  });

  it("counts bought upgrades", () => {
    const state = freshState({
      upgrades: [
        { id: "reveal_shop_sign", purchasedAtTickCount: 0 },
        { id: "reinforced_finger", purchasedAtTickCount: 0 },
        { id: "sturdier_ovens", purchasedAtTickCount: 0 },
        { id: "callused_knuckle", purchasedAtTickCount: 0 },
        { id: "wrist_of_iron", purchasedAtTickCount: 0 },
      ],
    });
    const newly = evaluateAchievements(state);
    expect(newly).toContain("upgrades_owned_5");
    expect(newly).not.toContain("upgrades_owned_10");
  });

  it("counts the Diesel Depot's own counters, and nothing beyond them", () => {
    const state = freshState({
      dieselDepot: { litresMinted: 12, vouchersMinted: 1, cookiesSpent: bnFromNumber(0) },
    });
    const newly = evaluateAchievements(state);
    expect(newly).toContain("diesel_litres_10");
    expect(newly).toContain("diesel_vouchers_1");
    expect(newly).not.toContain("diesel_litres_50");
  });

  it("resolves badges-about-badges in ONE evaluation, not one per tick", () => {
    // Crossing ten thousand lifetime cookies with ten cursors strikes well over five badges at
    // once; the milk ladder's own "5 achievements" badge has to be among them, in the same pass.
    const state = freshState({
      lifetimeCookies: bnFromNumber(10000),
      generators: [{ id: "cursor", count: 10 }],
    });
    const newly = evaluateAchievements(state);
    expect(newly.length).toBeGreaterThan(5);
    expect(newly).toContain("achievements_5");
  });

  it("evaluateAchievements returns only newly satisfied ids, never already-unlocked ones", () => {
    const state = freshState({
      lifetimeCookies: bnFromNumber(100),
      achievements: [{ id: "first_bite", unlockedAtIso: "2026-01-01T00:00:00.000Z" }],
    });
    const newly = evaluateAchievements(state);
    expect(newly).not.toContain("first_bite");
    expect(newly).toContain("lifetime_100");
  });

  it("returns an empty list when nothing new is satisfied", () => {
    const state = freshState({ lifetimeCookies: bnFromNumber(0) });
    expect(evaluateAchievements(state)).toEqual([]);
  });

  it("generator ownership milestones fire once the threshold is reached", () => {
    const state = freshState({ generators: [{ id: "cursor", count: 10 }] });
    expect(evaluateAchievements(state)).toContain("cursor_owned_10");
  });
});
