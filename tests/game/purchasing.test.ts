import { describe, expect, it } from "vitest";
import { bnFromNumber, bnToNumber } from "../../src/shared/game/big-number";
import { costOfBulk, getGeneratorDefinition } from "../../src/shared/game/generators";
import { applyGameAction, type ReducerCtx } from "../../src/shared/game/reducer";
import { getUpgradeDefinition } from "../../src/shared/game/upgrades";
import {
  GENERATOR_BUY_MODES,
  GENERATOR_SELL_MODES,
  SELL_REFUND_FRACTION,
  previewBuyAllAffordableUpgrades,
  previewGeneratorPurchase,
  previewGeneratorSale,
  sellRefund,
} from "../../src/shared/game/purchasing";
import { freshState, fixedRng } from "./test-helpers";

function ctxAt(epochMs: number): ReducerCtx {
  return { now: () => epochMs, rng: fixedRng(0.99) };
}

describe("Buy modes: x1, x10, x100, max", () => {
  it("exposes exactly the four documented buy modes", () => {
    expect(GENERATOR_BUY_MODES).toEqual([1, 10, 100, "max"]);
  });

  it("x1/x10/x100 previews match the exact closed-form bulk cost", () => {
    const def = getGeneratorDefinition("cursor");
    for (const mode of [1, 10, 100] as const) {
      const cost = bnToNumber(costOfBulk(def, 0, mode));
      const state = freshState({ cookies: bnFromNumber(cost) });
      const preview = previewGeneratorPurchase(state, "cursor", mode);
      expect(preview.quantityToBuy).toBe(mode);
      expect(bnToNumber(preview.totalCost)).toBeCloseTo(cost, 4);
      expect(bnToNumber(preview.remainingCookiesAfter)).toBeCloseTo(0, 4);
    }
  });

  it("a fixed-quantity buy is all-or-nothing: one cookie short buys ZERO, not a partial amount", () => {
    const def = getGeneratorDefinition("cursor");
    const cost = bnToNumber(costOfBulk(def, 0, 10));
    const state = freshState({ cookies: bnFromNumber(cost - 1) });
    const preview = previewGeneratorPurchase(state, "cursor", 10);
    expect(preview.quantityToBuy).toBe(0);
    expect(preview.canAfford).toBe(false);

    const next = applyGameAction(state, { type: "buyGeneratorBulk", generatorId: "cursor", quantity: 10 }, ctxAt(0));
    expect(next.generators.find((g) => g.id === "cursor")?.count ?? 0).toBe(0);
  });

  it("max mode's preview matches exactly what the reducer actually buys", () => {
    const state = freshState({ cookies: bnFromNumber(getGeneratorDefinition("cursor").baseCost * 37.5) });
    const preview = previewGeneratorPurchase(state, "cursor", "max");
    const next = applyGameAction(state, { type: "buyGeneratorBulk", generatorId: "cursor", quantity: "max" }, ctxAt(0));
    expect(next.generators.find((g) => g.id === "cursor")?.count ?? 0).toBe(preview.quantityToBuy);
    expect(bnToNumber(next.cookies)).toBeCloseTo(bnToNumber(preview.remainingCookiesAfter), 4);
  });

  it("the closed-form bulk cost agrees with a naive per-unit loop sum for small n", () => {
    const def = getGeneratorDefinition("grandma");
    for (const n of [1, 3, 7, 15]) {
      let naive = 0;
      for (let i = 0; i < n; i++) {
        naive += def.baseCost * Math.pow(def.costRatio, i);
      }
      expect(bnToNumber(costOfBulk(def, 0, n))).toBeCloseTo(naive, 4);
    }
  });
});

describe("Sell modes: x1, x10, x100, all", () => {
  it("exposes exactly the four documented sell modes", () => {
    expect(GENERATOR_SELL_MODES).toEqual([1, 10, 100, "all"]);
  });

  it("refund fraction is documented and less than 1", () => {
    expect(SELL_REFUND_FRACTION).toBeGreaterThan(0);
    expect(SELL_REFUND_FRACTION).toBeLessThan(1);
  });

  it("sells exactly the requested quantity when enough are owned", () => {
    const state = freshState({ generators: [{ id: "cursor", count: 20 }] });
    const preview = previewGeneratorSale(state, "cursor", 10);
    expect(preview.quantityToSell).toBe(10);
    expect(preview.ownedCountAfter).toBe(10);

    const next = applyGameAction(state, { type: "sellGeneratorBulk", generatorId: "cursor", quantity: 10 }, ctxAt(0));
    expect(next.generators.find((g) => g.id === "cursor")?.count).toBe(10);
    expect(bnToNumber(next.cookies)).toBeCloseTo(bnToNumber(preview.refund), 4);
  });

  it("clamps to what's owned rather than refusing the whole sale (unlike buying)", () => {
    const state = freshState({ generators: [{ id: "cursor", count: 3 }] });
    const preview = previewGeneratorSale(state, "cursor", 100);
    expect(preview.quantityToSell).toBe(3);
    expect(preview.ownedCountAfter).toBe(0);

    const next = applyGameAction(state, { type: "sellGeneratorBulk", generatorId: "cursor", quantity: 100 }, ctxAt(0));
    expect(next.generators.find((g) => g.id === "cursor")?.count).toBe(0);
  });

  it("'all' sells every owned unit and reports the real number sold", () => {
    const state = freshState({ generators: [{ id: "cursor", count: 42 }] });
    const preview = previewGeneratorSale(state, "cursor", "all");
    expect(preview.quantityToSell).toBe(42);

    const next = applyGameAction(state, { type: "sellGeneratorBulk", generatorId: "cursor", quantity: "all" }, ctxAt(0));
    expect(next.generators.find((g) => g.id === "cursor")?.count).toBe(0);
  });

  it("selling does not touch lifetimeCookies or totalCookiesBaked (a refund is not new production)", () => {
    const state = freshState({ generators: [{ id: "cursor", count: 10 }], lifetimeCookies: bnFromNumber(500) });
    const next = applyGameAction(state, { type: "sellGeneratorBulk", generatorId: "cursor", quantity: 10 }, ctxAt(0));
    expect(bnToNumber(next.lifetimeCookies)).toBeCloseTo(500, 4);
    expect(bnToNumber(next.stats.totalCookiesBaked)).toBeCloseTo(0, 4);
  });

  it("selling zero (nothing owned) is a no-op", () => {
    const state = freshState({});
    const next = applyGameAction(state, { type: "sellGeneratorBulk", generatorId: "cursor", quantity: 10 }, ctxAt(0));
    expect(bnToNumber(next.cookies)).toBe(0);
  });
});

describe("LOAD-BEARING: buying N then selling N can never be profitable", () => {
  it("refund never exceeds the original spend, for a wide range of N and starting counts", () => {
    const def = getGeneratorDefinition("cursor");
    for (const startingOwned of [0, 1, 5, 20, 50]) {
      for (const n of [1, 3, 10, 25]) {
        const boughtCost = bnToNumber(costOfBulk(def, startingOwned, n));
        const refund = bnToNumber(sellRefund(def, startingOwned + n, n));
        expect(refund, `sell(${n}) after buy(${n}) from ${startingOwned} owned must never exceed cost`).toBeLessThanOrEqual(
          boughtCost + 1e-6,
        );
        // Strictly less than (never equal), since the refund fraction is < 1 and cost > 0.
        expect(refund).toBeLessThan(boughtCost);
      }
    }
  });

  it("a real buy-then-sell round trip through the reducer never yields a net cookie gain", () => {
    const def = getGeneratorDefinition("cursor");
    const cost = costOfBulk(def, 0, 10);
    const startCookies = bnToNumber(cost) + 1000; // enough to buy, plus a cushion to observe the loss
    const state = freshState({ cookies: bnFromNumber(startCookies) });

    const afterBuy = applyGameAction(state, { type: "buyGeneratorBulk", generatorId: "cursor", quantity: 10 }, ctxAt(0));
    const afterSell = applyGameAction(afterBuy, { type: "sellGeneratorBulk", generatorId: "cursor", quantity: 10 }, ctxAt(0));

    expect(bnToNumber(afterSell.cookies)).toBeLessThan(startCookies);
    expect(afterSell.generators.find((g) => g.id === "cursor")?.count ?? 0).toBe(0);
  });

  it("selling immediately after buying refunds exactly SELL_REFUND_FRACTION of the price paid", () => {
    const def = getGeneratorDefinition("cursor");
    const cost = bnToNumber(costOfBulk(def, 0, 5));
    const state = freshState({ cookies: bnFromNumber(cost) });
    const afterBuy = applyGameAction(state, { type: "buyGeneratorBulk", generatorId: "cursor", quantity: 5 }, ctxAt(0));
    const afterSell = applyGameAction(afterBuy, { type: "sellGeneratorBulk", generatorId: "cursor", quantity: 5 }, ctxAt(0));
    expect(bnToNumber(afterSell.cookies)).toBeCloseTo(cost * SELL_REFUND_FRACTION, 4);
  });
});

describe("Purchase preview honesty", () => {
  it("a bulk buy preview never claims a quantity the reducer wouldn't actually deliver", () => {
    const def = getGeneratorDefinition("mine");
    const cost10 = bnToNumber(costOfBulk(def, 2, 10));
    const state = freshState({ generators: [{ id: "mine", count: 2 }], cookies: bnFromNumber(cost10) });
    const preview = previewGeneratorPurchase(state, "mine", 10);
    const next = applyGameAction(state, { type: "buyGeneratorBulk", generatorId: "mine", quantity: 10 }, ctxAt(0));
    expect(next.generators.find((g) => g.id === "mine")?.count).toBe(2 + preview.quantityToBuy);
  });

  it("a sell preview never claims a quantity the reducer wouldn't actually deliver", () => {
    const state = freshState({ generators: [{ id: "mine", count: 7 }] });
    const preview = previewGeneratorSale(state, "mine", 100);
    const next = applyGameAction(state, { type: "sellGeneratorBulk", generatorId: "mine", quantity: 100 }, ctxAt(0));
    expect(next.generators.find((g) => g.id === "mine")?.count).toBe(7 - preview.quantityToSell);
  });
});

describe("Buy-all-affordable upgrades", () => {
  it("buys nothing when nothing is unlocked or affordable", () => {
    const state = freshState({ cookies: bnFromNumber(0) });
    const preview = previewBuyAllAffordableUpgrades(state);
    expect(preview.countBought).toBe(0);
  });

  it("simulates sequential spending in cheapest-first order rather than a static filter", () => {
    const cheap = getUpgradeDefinition("reinforced_finger"); // always unlocked, cost 100
    const state = freshState({ cookies: bnFromNumber(bnToNumber(cheap.cost)) });
    const preview = previewBuyAllAffordableUpgrades(state);
    expect(preview.upgradeIds).toContain("reinforced_finger");
    expect(bnToNumber(preview.totalCost)).toBeLessThanOrEqual(bnToNumber(cheap.cost) + 1e-6);
  });

  it("the reducer action buys EXACTLY the preview's list, in the same order, honestly reporting the real count", () => {
    const state = freshState({ cookies: bnFromNumber(2_000_000) }); // enough for several early global upgrades
    const preview = previewBuyAllAffordableUpgrades(state);
    expect(preview.countBought).toBeGreaterThan(0);

    const next = applyGameAction(state, { type: "buyAllAffordableUpgrades" }, ctxAt(0));
    for (const id of preview.upgradeIds) {
      expect(next.upgrades.some((u) => u.id === id), `expected ${id} to have been bought`).toBe(true);
    }
    expect(next.upgrades.length).toBe(preview.countBought);
  });

  it("never buys the same upgrade twice and never buys more than it can afford", () => {
    const state = freshState({ cookies: bnFromNumber(50) }); // less than the cheapest upgrade (100)
    const next = applyGameAction(state, { type: "buyAllAffordableUpgrades" }, ctxAt(0));
    expect(next.upgrades.length).toBe(0);
    expect(bnToNumber(next.cookies)).toBeCloseTo(50, 4);
  });
});
