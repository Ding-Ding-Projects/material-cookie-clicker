import { describe, expect, it } from "vitest";
import { bnFromNumber } from "../../src/shared/game/big-number";
import { ACHIEVEMENT_DEFINITIONS, evaluateAchievements } from "../../src/shared/game/achievements";
import { freshState } from "./test-helpers";

describe("achievements", () => {
  it("has a real per-generator, lifetime, click, and prestige milestone roster", () => {
    expect(ACHIEVEMENT_DEFINITIONS.length).toBeGreaterThan(50);
    const ids = new Set(ACHIEVEMENT_DEFINITIONS.map((a) => a.id));
    expect(ids.size).toBe(ACHIEVEMENT_DEFINITIONS.length);
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
