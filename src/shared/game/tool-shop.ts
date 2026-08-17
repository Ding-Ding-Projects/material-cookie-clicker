import { bnCompare, bnFromNumber, type BigNum } from "./big-number.js";
import { isToolBonusActive, TOOL_DEFINITIONS } from "./tools.js";
import type { GameState } from "./types.js";

/**
 * The Tools shop: a purchase path laid ALONGSIDE each tool's natural unlock condition
 * (tools.ts). A tool's bonus activates automatically the moment its condition is met; buying
 * it here just lets a player with enough cookies claim that same bonus early, at a cookie
 * price rather than a play-time cost — either route reaches the identical end state.
 *
 * Since the owner's 2026-08-16 decision (see `gatesApplicationFeature` in tools.ts), that end
 * state is worth more than a multiplier: activating a tool also switches on the REAL
 * application feature named after it. So a purchase here is not merely skipping the grind for
 * a bonus, it is the cookie-priced way to turn a feature on, and it is exactly equivalent to
 * unlocking that feature by play. `isFeatureAvailable(state, toolId)` in tools.ts is the one
 * authority for whether that feature is reachable, and it reads the same activation state this
 * module writes. This is a "sibling lane" (`tool-shop.ts` / `purchasing.ts` / `automation.ts`)
 * that never landed on `main` as of this lane's work — see HANDOFF.md — so this file defines the
 * shape this lane needs against the tools contract directly, rather than importing one that
 * does not exist yet. A later merge of the real sibling lane should reconcile against this.
 *
 * Pricing is a smooth exponential curve keyed only to a tool's position in the fixed roster
 * (TOOL_DEFINITIONS is declared in a deliberate order, earliest/cheapest first), independent of
 * its unlock condition's own kind or magnitude — simple, deterministic, and easy to reason
 * about, rather than trying to convert five incompatible condition kinds into one "equivalent"
 * cookie value.
 */
const BASE_PRICE = 250;
const PRICE_GROWTH = 2.35;

/** The cookie price to buy a tool's bonus early, regardless of whether it is already active. */
export function toolPrice(toolId: string): BigNum {
  const index = TOOL_DEFINITIONS.findIndex((t) => t.id === toolId);
  if (index < 0) throw new RangeError(`Unknown tool id: ${toolId}`);
  return bnFromNumber(BASE_PRICE * Math.pow(PRICE_GROWTH, index));
}

/** Whether `toolId` was bought early through the shop (independent of its unlock condition). */
export function isToolPurchased(state: GameState, toolId: string): boolean {
  return (state.purchasedToolIds ?? []).includes(toolId);
}

/**
 * Whether the tool can still be bought right now: there is nothing to buy once its bonus is
 * already active (purchased or naturally unlocked), and otherwise the player needs enough
 * cookies for the price.
 */
export function canBuyTool(state: GameState, toolId: string): boolean {
  if (isToolBonusActive(state, toolId)) return false;
  return bnCompare(state.cookies, toolPrice(toolId)) >= 0;
}

export interface ToolShopEntry {
  readonly id: string;
  readonly price: BigNum;
  readonly purchased: boolean;
  /** The bonus is active AND it was not bought early — i.e. play alone unlocked it. */
  readonly unlockedByPlay: boolean;
  readonly active: boolean;
  readonly affordable: boolean;
}

/** One shop row per tool, in roster order, for the Tools screen to render directly. */
export function toolShopEntries(state: GameState): readonly ToolShopEntry[] {
  return TOOL_DEFINITIONS.map((def) => {
    const purchased = isToolPurchased(state, def.id);
    const active = isToolBonusActive(state, def.id);
    const price = toolPrice(def.id);
    return {
      id: def.id,
      price,
      purchased,
      unlockedByPlay: active && !purchased,
      active,
      affordable: !active && bnCompare(state.cookies, price) >= 0,
    };
  });
}
