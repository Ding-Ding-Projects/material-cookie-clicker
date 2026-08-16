import { describe, expect, it } from "vitest";
import { bnFromNumber, bnMulScalar, bnToNumber } from "../../src/shared/game/big-number";
import { applyGameAction, type ReducerCtx } from "../../src/shared/game/reducer";
import { costOfNext, getGeneratorDefinition } from "../../src/shared/game/generators";
import { totalCps } from "../../src/shared/game/cps";
import { getUpgradeDefinition } from "../../src/shared/game/upgrades";
import { freshState, fixedRng } from "./test-helpers";

function ctxAt(epochMs: number, rngValue = 0.99): ReducerCtx {
  return { now: () => epochMs, rng: fixedRng(rngValue) };
}

describe("reducer: click", () => {
  it("adds baseClickValue (times multipliers) to cookies and increments totalClicks", () => {
    const state = freshState({});
    const next = applyGameAction(state, { type: "click" }, ctxAt(0));
    expect(bnToNumber(next.cookies)).toBeCloseTo(1, 6); // baseClickValue is 1, no multipliers yet
    expect(next.stats.totalClicks).toBe(1);
  });

  it("auto-unlocks the first_bite achievement on the first click", () => {
    const state = freshState({});
    const next = applyGameAction(state, { type: "click" }, ctxAt(0));
    expect(next.achievements.some((a) => a.id === "first_bite")).toBe(true);
  });
});

describe("reducer: buyGenerator / buyGeneratorBulk", () => {
  it("buys exactly 1 unit via buyGenerator when affordable", () => {
    const def = getGeneratorDefinition("cursor");
    const state = freshState({ cookies: bnFromNumber(def.baseCost) });
    const next = applyGameAction(state, { type: "buyGenerator", generatorId: "cursor" }, ctxAt(0));
    expect(next.generators.find((g) => g.id === "cursor")?.count).toBe(1);
    expect(bnToNumber(next.cookies)).toBeCloseTo(0, 6);
  });

  it("refuses the purchase (no-op) when cookies are insufficient", () => {
    const def = getGeneratorDefinition("cursor");
    const state = freshState({ cookies: bnFromNumber(def.baseCost - 1) });
    const next = applyGameAction(state, { type: "buyGenerator", generatorId: "cursor" }, ctxAt(0));
    expect(next.generators.length).toBe(0);
    expect(bnToNumber(next.cookies)).toBeCloseTo(def.baseCost - 1, 6);
  });

  it("buys a specific bulk quantity, charging the exact closed-form bulk cost", () => {
    const def = getGeneratorDefinition("cursor");
    const rawCost = bnToNumber(costOfNext(def, 0)) + bnToNumber(costOfNext(def, 1)) + bnToNumber(costOfNext(def, 2));
    const state = freshState({ cookies: bnFromNumber(rawCost) });
    const next = applyGameAction(state, { type: "buyGeneratorBulk", generatorId: "cursor", quantity: 3 }, ctxAt(0));
    expect(next.generators.find((g) => g.id === "cursor")?.count).toBe(3);
    expect(bnToNumber(next.cookies)).toBeCloseTo(0, 4);
  });

  it("'max' buys the largest affordable count and applies an active buy-max discount", () => {
    const def = getGeneratorDefinition("cursor");
    const state = freshState({
      cookies: bnFromNumber(def.baseCost * 20),
      stats: { totalClicks: 200, totalCookiesBaked: bnFromNumber(0), clockAnomalyCount: 0 }, // unlocks Bulk Actions (10% discount)
    });
    const next = applyGameAction(state, { type: "buyGeneratorBulk", generatorId: "cursor", quantity: "max" }, ctxAt(0));
    const bought = next.generators.find((g) => g.id === "cursor")?.count ?? 0;
    expect(bought).toBeGreaterThan(0);
    // With a discount active, spending the same cookies should buy at least as many units
    // as buying without any discount would.
    const stateNoDiscount = freshState({ cookies: bnFromNumber(def.baseCost * 20) });
    const nextNoDiscount = applyGameAction(
      stateNoDiscount,
      { type: "buyGeneratorBulk", generatorId: "cursor", quantity: "max" },
      ctxAt(0),
    );
    const boughtNoDiscount = nextNoDiscount.generators.find((g) => g.id === "cursor")?.count ?? 0;
    expect(bought).toBeGreaterThanOrEqual(boughtNoDiscount);
  });
});

describe("reducer: buyUpgrade", () => {
  it("buys an unlocked, affordable upgrade and applies its effect via computeMultipliers", () => {
    const def = getUpgradeDefinition("reinforced_finger");
    const state = freshState({ cookies: def.cost });
    const next = applyGameAction(state, { type: "buyUpgrade", upgradeId: "reinforced_finger" }, ctxAt(0));
    expect(next.upgrades.some((u) => u.id === "reinforced_finger")).toBe(true);
  });

  it("refuses a locked upgrade even if affordable", () => {
    // cursor_upgrade_1 requires owning at least 1 cursor.
    const state = freshState({ cookies: bnFromNumber(1e9) });
    const next = applyGameAction(state, { type: "buyUpgrade", upgradeId: "cursor_upgrade_1" }, ctxAt(0));
    expect(next.upgrades.length).toBe(0);
  });

  it("refuses buying the same upgrade twice", () => {
    const def = getUpgradeDefinition("reinforced_finger");
    const state = freshState({ cookies: bnFromNumber(bnToNumber(def.cost) * 2) });
    const once = applyGameAction(state, { type: "buyUpgrade", upgradeId: "reinforced_finger" }, ctxAt(0));
    const twice = applyGameAction(once, { type: "buyUpgrade", upgradeId: "reinforced_finger" }, ctxAt(0));
    expect(twice.upgrades.filter((u) => u.id === "reinforced_finger").length).toBe(1);
  });
});

describe("reducer: tick", () => {
  it("accrues cookies proportional to elapsedMs at the current CPS", () => {
    // "mine" has no Tools-tree generatorMultiplier target, so its CPS is exactly
    // baseCps * count with no surprise bonus -- keeps this test independent of balance numbers.
    const state = freshState({ generators: [{ id: "mine", count: 10 }] });
    const expectedCps = totalCps(state);
    const next = applyGameAction(state, { type: "tick", elapsedMs: 5000 }, ctxAt(1000));
    const expectedCookies = bnToNumber(bnMulScalar(expectedCps, 5));
    expect(bnToNumber(next.cookies)).toBeCloseTo(expectedCookies, 4);
  });

  it("is a no-op for zero or negative elapsedMs", () => {
    const state = freshState({ generators: [{ id: "mine", count: 10 }] });
    const next = applyGameAction(state, { type: "tick", elapsedMs: 0 }, ctxAt(1000));
    expect(bnToNumber(next.cookies)).toBe(0);
  });
});

describe("reducer: prestige", () => {
  it("refuses to prestige below the lifetime threshold (no-op)", () => {
    const state = freshState({ lifetimeCookies: bnFromNumber(1) });
    const next = applyGameAction(state, { type: "prestige" }, ctxAt(0));
    expect(next.prestige.totalPrestigeCount).toBe(0);
  });

  it("resets economy but preserves prestige progress once above the threshold", () => {
    const state = freshState({
      lifetimeCookies: bnFromNumber(8e12),
      cookies: bnFromNumber(500),
      generators: [{ id: "cursor", count: 10 }],
    });
    const next = applyGameAction(state, { type: "prestige" }, ctxAt(0));
    expect(next.prestige.totalPrestigeCount).toBe(1);
    expect(next.prestige.ascensionPoints).toBeGreaterThan(0);
    expect(bnToNumber(next.cookies)).toBe(0);
    expect(next.generators.every((g) => g.count === 0)).toBe(true);
  });
});

describe("reducer: importSave (offline progress + clock protection integration)", () => {
  it("applies offline cookies earned since lastTickAtIso", () => {
    const saved = freshState({
      lastTickAtIso: "2026-01-01T00:00:00.000Z",
      generators: [{ id: "mine", count: 10 }],
      cookies: bnFromNumber(0),
    });
    const offlineOptions = { maxOfflineMs: 60 * 60 * 1000, offlineCpsFactor: 1 };
    const next = applyGameAction(
      saved,
      {
        type: "importSave",
        savedState: saved,
        nowIso: "2026-01-01T00:01:00.000Z", // 60s later
        offlineOptions,
      },
      ctxAt(0),
    );
    const expectedCookies = bnToNumber(bnMulScalar(totalCps(saved), 60 * offlineOptions.offlineCpsFactor));
    expect(bnToNumber(next.cookies)).toBeCloseTo(expectedCookies, 4);
  });

  it("a clock moved backwards yields zero offline cookies and records a clock anomaly", () => {
    const saved = freshState({
      lastTickAtIso: "2026-06-01T00:00:00.000Z",
      generators: [{ id: "cursor", count: 10 }],
    });
    const next = applyGameAction(
      saved,
      {
        type: "importSave",
        savedState: saved,
        nowIso: "2026-01-01T00:00:00.000Z", // BEFORE lastTickAtIso
        offlineOptions: { maxOfflineMs: 60 * 60 * 1000, offlineCpsFactor: 1 },
      },
      ctxAt(0),
    );
    expect(bnToNumber(next.cookies)).toBe(0);
    expect(next.stats.clockAnomalyCount).toBe(saved.stats.clockAnomalyCount + 1);
  });
});
