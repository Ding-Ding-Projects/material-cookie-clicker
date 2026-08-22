import { bnAdd, bnClampNonNegative, bnCompare, bnFromNumber, bnMulScalar, bnSub, type BigNum } from "./big-number.js";
import { costOfBulk, getGeneratorDefinition, maxAffordable, type GeneratorDefinition } from "./generators.js";
import { totalBuyMaxDiscount } from "./tools.js";
import { UPGRADE_DEFINITIONS, isUpgradeUnlocked, type UpgradeDefinition } from "./upgrades.js";
import type { GameState } from "./types.js";

/**
 * Purchasing UX layer: buy/sell modes, previews, and the buy-all-affordable-upgrades bulk
 * action. Every preview here mirrors reducer.ts's actual purchase math EXACTLY (same
 * generators.ts closed-form cost functions, same tools.ts#totalBuyMaxDiscount) rather than
 * re-deriving it, so a preview can never promise something the real purchase doesn't deliver.
 */

export type GeneratorBuyMode = 1 | 10 | 100 | "max";
export const GENERATOR_BUY_MODES: readonly GeneratorBuyMode[] = [1, 10, 100, "max"];

export type GeneratorSellMode = 1 | 10 | 100 | "all";
export const GENERATOR_SELL_MODES: readonly GeneratorSellMode[] = [1, 10, 100, "all"];

/**
 * Fraction of the ORIGINAL purchase cost refunded on sale (genre-standard ballpark). Kept well
 * under 1 so a buy-then-sell round trip can never be profitable regardless of the cost curve's
 * shape -- see sellRefund()'s doc comment for exactly why, and
 * tests/game/purchasing.test.ts#"buy then sell never profits" for the proof.
 */
export const SELL_REFUND_FRACTION = 0.25;

export interface GeneratorPurchasePreview {
  readonly generatorId: string;
  readonly requestedQuantity: GeneratorBuyMode;
  /** The REAL number that will be bought if this preview is executed right now. For x1/x10/x100
   * the reducer is all-or-nothing (buys the full requested amount or none at all -- it never
   * partially fills a fixed-quantity request), so this is always either 0 or the requested
   * quantity. For "max" it's whatever's actually affordable, which is the entire point of max. */
  readonly quantityToBuy: number;
  readonly totalCost: BigNum;
  readonly canAfford: boolean;
  readonly remainingCookiesAfter: BigNum;
  readonly ownedCountAfter: number;
}

/** Exactly mirrors reducer.ts#handleBuyGeneratorBulk's quantity/cost/discount computation. */
export function previewGeneratorPurchase(
  state: GameState,
  generatorId: string,
  requestedQuantity: GeneratorBuyMode,
): GeneratorPurchasePreview {
  const def = getGeneratorDefinition(generatorId);
  const ownedCount = state.generators.find((g) => g.id === generatorId)?.count ?? 0;
  const discount = totalBuyMaxDiscount(state);

  let quantity: number;
  if (requestedQuantity === "max") {
    const effectiveBudget = discount > 0 ? bnMulScalar(state.cookies, 1 / (1 - discount)) : state.cookies;
    quantity = maxAffordable(def, ownedCount, effectiveBudget);
  } else {
    quantity = requestedQuantity;
  }

  if (quantity <= 0) {
    return {
      generatorId,
      requestedQuantity,
      quantityToBuy: 0,
      totalCost: bnFromNumber(0),
      canAfford: false,
      remainingCookiesAfter: state.cookies,
      ownedCountAfter: ownedCount,
    };
  }

  const rawCost = costOfBulk(def, ownedCount, quantity);
  const finalCost = discount > 0 ? bnMulScalar(rawCost, 1 - discount) : rawCost;
  const canAfford = bnCompare(state.cookies, finalCost) >= 0;

  // Fixed quantities (x1/x10/x100) are all-or-nothing in the reducer -- if we can't afford the
  // full requested amount, zero get bought. "max" already only ever asked for what's affordable.
  const quantityToBuy = requestedQuantity === "max" ? quantity : canAfford ? quantity : 0;
  const actualCost = quantityToBuy > 0 ? finalCost : bnFromNumber(0);

  return {
    generatorId,
    requestedQuantity,
    quantityToBuy,
    totalCost: actualCost,
    canAfford: quantityToBuy > 0,
    remainingCookiesAfter: quantityToBuy > 0 ? bnClampNonNegative(bnSub(state.cookies, actualCost)) : state.cookies,
    ownedCountAfter: ownedCount + quantityToBuy,
  };
}

export interface GeneratorSellPreview {
  readonly generatorId: string;
  readonly requestedQuantity: GeneratorSellMode;
  readonly quantityToSell: number;
  readonly refund: BigNum;
  readonly cookiesAfter: BigNum;
  readonly ownedCountAfter: number;
}

/**
 * Refund for selling `quantity` units back, given `ownedCount` currently owned. Uses the SAME
 * closed-form geometric cost curve run in REVERSE: `costOfBulk(def, ownedCount - quantity,
 * quantity)` is exactly what those `quantity` units originally cost to buy (whether they were
 * bought in one purchase or built up over many), so the refund is always a fixed fraction of
 * real, actually-paid cost -- never a fabricated "quantity * current unit price" figure that
 * could pay out more than was ever spent. Since SELL_REFUND_FRACTION < 1, refund < original
 * cost for any quantity > 0, which is what makes a buy-then-sell round trip provably unprofitable
 * regardless of ownedCount, quantity, or the ratio -- see purchasing.test.ts.
 */
export function sellRefund(def: GeneratorDefinition, ownedCount: number, quantity: number): BigNum {
  if (quantity <= 0) return bnFromNumber(0);
  const clampedQuantity = Math.min(quantity, ownedCount);
  if (clampedQuantity <= 0) return bnFromNumber(0);
  const originalCost = costOfBulk(def, ownedCount - clampedQuantity, clampedQuantity);
  return bnMulScalar(originalCost, SELL_REFUND_FRACTION);
}

export function previewGeneratorSale(
  state: GameState,
  generatorId: string,
  requestedQuantity: GeneratorSellMode,
): GeneratorSellPreview {
  const def = getGeneratorDefinition(generatorId);
  const ownedCount = state.generators.find((g) => g.id === generatorId)?.count ?? 0;

  const requested = requestedQuantity === "all" ? ownedCount : requestedQuantity;
  // Selling clamps to what's actually owned (never all-or-nothing like buying): asking to sell
  // 100 while owning 3 honestly sells 3, and reports exactly that -- never silently sells 0 and
  // never pretends to sell more than exist.
  const quantityToSell = Math.max(0, Math.min(ownedCount, Math.floor(requested)));
  const refund = sellRefund(def, ownedCount, quantityToSell);

  return {
    generatorId,
    requestedQuantity,
    quantityToSell,
    refund,
    cookiesAfter: bnAdd(state.cookies, refund),
    ownedCountAfter: ownedCount - quantityToSell,
  };
}

export interface UpgradeBulkPreview {
  /** Upgrade ids that WILL be bought, in the exact order they'll be bought (cheapest first). */
  readonly upgradeIds: readonly string[];
  readonly totalCost: BigNum;
  readonly countBought: number;
}

function affordableUnlockedUpgrades(state: GameState): UpgradeDefinition[] {
  const ownedIds = new Set(state.upgrades.map((u) => u.id));
  return UPGRADE_DEFINITIONS.filter(
    (def) => !ownedIds.has(def.id) && isUpgradeUnlocked(def.unlockCondition, state),
  ).sort((a, b) => bnCompare(a.cost, b.cost));
}

/**
 * Honest preview for "buy every affordable upgrade": simulates spending sequentially in
 * cheapest-first order (never a static filter of "cost <= current cookies"), because buying one
 * upgrade can make a costlier one -- that looked affordable in isolation -- no longer affordable.
 * reducer.ts's buyAllAffordableUpgrades action buys EXACTLY this list, in this order, so the
 * preview and the real purchase can never disagree about how many get bought.
 */
export function previewBuyAllAffordableUpgrades(state: GameState): UpgradeBulkPreview {
  const candidates = affordableUnlockedUpgrades(state);
  const bought: string[] = [];
  let remaining = state.cookies;
  let totalCost: BigNum = bnFromNumber(0);

  for (const def of candidates) {
    if (bnCompare(remaining, def.cost) < 0) continue;
    bought.push(def.id);
    remaining = bnSub(remaining, def.cost);
    totalCost = bnAdd(totalCost, def.cost);
  }

  return { upgradeIds: bought, totalCost, countBought: bought.length };
}
