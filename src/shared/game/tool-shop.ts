import { bnAdd, bnCompare, bnFromNumber, bnMulScalar, bnSub, bnClampNonNegative, type BigNum } from "./big-number.js";
import { costOfNext, generatorCps, getGeneratorDefinition } from "./generators.js";
import { TOOL_DEFINITIONS, getToolDefinition, isToolBonusActive, type ToolUnlockCondition } from "./tools.js";
import { computeMultipliers } from "./upgrades.js";
import type { GameState, OwnedTool } from "./types.js";

/**
 * The tool SHOP — the purchasing/ownership economy layered on top of tools.ts's existing
 * unlock-condition tech tree. This is the change the owner asked for: a tool's gameplay bonus
 * requires spending real cookies, not merely reaching its unlock condition.
 *
 * ARCHITECTURE NOTE (read this before touching bonus math anywhere in this domain):
 * tools.ts#isToolBonusActive, upgrades.ts#computeMultipliers, tools.ts#totalBuyMaxDiscount and
 * tools.ts#totalOfflineBonuses are owned by a different lane and are NOT modified here — and by
 * design, remain exactly what they always were: condition-gated only, with zero knowledge of
 * purchase/ownership. tools.test.ts pins that behaviour down explicitly ("LOAD-BEARING" /
 * "Tool bonuses compose correctly into computeMultipliers" etc.) and none of that is touched.
 *
 * To make ownership ACTUALLY gate the click/tick bonus without editing those files, this module
 * exposes `toolOwnershipCorrection()`: the ratio between "bonus active because owned" and "bonus
 * active because condition-met" for each tool-effect kind. reducer.ts multiplies this correction
 * onto computeMultipliers()'s/cps.ts's already-computed output. Since owning a tool requires it
 * to be discovered first (see `previewToolPurchase` below — a locked tool can't be bought), the
 * owned set is always a subset of the condition-met set, so every correction ratio is <= 1: this
 * can only ever SUPPRESS a bonus relative to the old condition-only behaviour, never invent one,
 * and the ratio is exactly 1 (no change at all) once every discovered tool is also owned.
 *
 * Two paths this module deliberately does NOT correct, and why:
 *   - offline-progress.ts's cap-extension / cps-factor bonuses (via totalOfflineBonuses): the
 *     offline cap is `min(rawElapsedMs, maxOfflineMs + extensionMs)`, a clamp whose *binding*
 *     point is a step function of extensionMs, not a smooth multiplicative factor. A correct
 *     post-hoc correction would require re-deriving computeOfflineProgress's own clamp logic in
 *     this module -- i.e. duplicating it, which the brief explicitly warns against, and offline-
 *     progress.ts is outside this lane's allowed paths in any case. Offline progress therefore
 *     stays condition-gated exactly as before; flagged as a follow-up for whoever owns that file.
 *   - reducer.ts#handleBuyGeneratorBulk's buy-max discount (via totalBuyMaxDiscount): left as-is,
 *     unchanged, to keep this lane's edits minimal and because it is a purchase-adjacent
 *     mechanic in its own right rather than part of the core click/tick gameplay loop.
 *   - golden-cookie.ts's windfall bonus reads cps.ts#totalCps directly (not this module's
 *     corrected version), for the same "file is out of this lane's allowed paths" reason.
 *
 * `gatesApplicationFeature` stays exactly what tools.ts says it is: `false`. Nothing in this
 * shop -- price, ownership, status -- ever gates the real application feature. See the
 * dedicated guard test in tests/game/tool-shop.test.ts, which is deliberately broken and
 * restored once to prove it actually fails when that contract is violated.
 */

export type ToolShopStatus = "locked" | "discovered" | "purchasable" | "owned";

/** True once a tool has been bought — the ONLY thing that gates its gameplay bonus in this shop. */
export function isToolOwned(state: GameState, toolId: string): boolean {
  return ownedTools(state).some((t) => t.id === toolId);
}

/** Defensive against a state that predates this field (e.g. loaded through a save codec that
 * hasn't been taught about `ownedTools` yet — see the persistence note below). */
function ownedTools(state: GameState): readonly OwnedTool[] {
  return state.ownedTools ?? [];
}

/**
 * A tool is "discovered" (visible + eligible for purchase) using the exact same predicate the
 * rest of the domain already uses for "is this tool's condition met, honouring the progression
 * toggle" -- tools.ts#isToolBonusActive. Reusing it here (rather than re-deriving unlock-
 * condition logic) means the shop automatically inherits the toolProgressionEnabled escape
 * hatch: turning that toggle off makes every tool immediately purchasable (the cookie price is
 * still real and still has to be paid — the toggle waives the *condition*, never the price).
 */
function isDiscovered(state: GameState, toolId: string): boolean {
  return isToolBonusActive(state, toolId);
}

export function toolShopStatus(state: GameState, toolId: string): ToolShopStatus {
  if (isToolOwned(state, toolId)) return "owned";
  if (!isDiscovered(state, toolId)) return "locked";
  const price = priceOfTool(toolId);
  return bnCompare(state.cookies, price) >= 0 ? "purchasable" : "discovered";
}

/**
 * PRICING, derived from the generator ladder (never a hand-typed magic number per tool) so a
 * tool is always a real decision competing against buying more of a building, scaled to roughly
 * match how far into the run its unlock condition already puts the player:
 *
 *   - generatorOwned  -> ~3x the cost of the NEXT unit of that same generator at the unlock
 *                         threshold. A real "one more building, or this?" choice at exactly the
 *                         moment that building's ladder position is what unlocked the tool.
 *   - lifetimeCookies -> 35% of the lifetime-cookie threshold that unlocked it. Reachable without
 *                         a second full grind, but a genuine bite out of the bank.
 *   - totalClicks     -> scaled LINEARLY against the cheapest generator's base cost (never
 *                         exponentially against owned-count -- clicks and owned-count don't
 *                         compound the same way, and an exponential mapping here blows up to
 *                         absurd prices for the higher click milestones like 5,000 clicks).
 *   - prestigeCount   -> a multiple of a mid-ladder generator's cost per ascension required,
 *                         reachable within a normal post-prestige regrind (cookies reset to 0 on
 *                         prestige, so this deliberately does NOT reach for a late-tier generator).
 *   - achievementUnlocked / always -> a small flat multiple of the cheapest generator's base
 *                         cost; these conditions are reachable essentially immediately.
 */
function priceForCondition(condition: ToolUnlockCondition): BigNum {
  const cursor = getGeneratorDefinition("cursor");

  switch (condition.kind) {
    case "always":
      return bnFromNumber(cursor.baseCost * 2);
    case "achievementUnlocked":
      return bnFromNumber(cursor.baseCost * 3);
    case "totalClicks":
      return bnFromNumber(cursor.baseCost * Math.max(1, condition.atLeast / 5));
    case "generatorOwned": {
      const def = getGeneratorDefinition(condition.generatorId);
      return bnMulScalar(costOfNext(def, condition.atLeast), 3);
    }
    case "lifetimeCookies":
      return bnMulScalar(condition.atLeast, 0.35);
    case "prestigeCount": {
      const midTier = getGeneratorDefinition("bank");
      return bnMulScalar(costOfNext(midTier, 0), 4 * condition.atLeast);
    }
  }
}

const PRICE_CACHE = new Map<string, BigNum>();

export function priceOfTool(toolId: string): BigNum {
  const cached = PRICE_CACHE.get(toolId);
  if (cached) return cached;
  const def = getToolDefinition(toolId);
  const price = priceForCondition(def.unlockCondition);
  PRICE_CACHE.set(toolId, price);
  return price;
}

export interface ToolPurchasePreview {
  readonly toolId: string;
  readonly status: ToolShopStatus;
  readonly cost: BigNum;
  readonly canAfford: boolean;
  /** Only meaningful when `canAfford` is true. */
  readonly remainingCookiesAfterPurchase: BigNum;
}

export function previewToolPurchase(state: GameState, toolId: string): ToolPurchasePreview {
  const status = toolShopStatus(state, toolId);
  const cost = priceOfTool(toolId);
  const canAfford = status === "purchasable" || status === "owned" ? bnCompare(state.cookies, cost) >= 0 : false;
  return {
    toolId,
    status,
    cost,
    canAfford,
    remainingCookiesAfterPurchase: canAfford ? bnClampNonNegative(bnSub(state.cookies, cost)) : state.cookies,
  };
}

export interface ToolShopBulkPreview {
  /** Tool ids that WILL be bought, in the exact order they'll be bought (cheapest first). */
  readonly toolIds: readonly string[];
  readonly totalCost: BigNum;
  readonly countBought: number;
}

function affordableToolCandidates(state: GameState): string[] {
  return TOOL_DEFINITIONS.filter((def) => toolShopStatus(state, def.id) === "purchasable")
    .map((def) => def.id)
    .sort((a, b) => bnCompare(priceOfTool(a), priceOfTool(b)));
}

/**
 * Honest preview for "buy every affordable tool": simulates spending sequentially in cheapest-
 * first order (never a static filter of "price <= current cookies"), because buying tool A can
 * make tool B -- which looked affordable in isolation -- no longer affordable.
 */
export function previewBuyAllAffordableTools(state: GameState): ToolShopBulkPreview {
  const candidates = affordableToolCandidates(state);
  const bought: string[] = [];
  let remaining = state.cookies;
  let totalCost: BigNum = bnFromNumber(0);

  for (const toolId of candidates) {
    const cost = priceOfTool(toolId);
    if (bnCompare(remaining, cost) < 0) continue;
    bought.push(toolId);
    remaining = bnSub(remaining, cost);
    totalCost = bnAdd(totalCost, cost);
  }

  return { toolIds: bought, totalCost, countBought: bought.length };
}

export interface OwnedToolBonusTotals {
  readonly ownedCount: number;
  readonly totalToolCount: number;
  readonly clickMultiplierProduct: number;
  readonly globalCpsMultiplierProduct: number;
  readonly generatorMultipliers: Readonly<Record<string, number>>;
}

/** Running total of bonuses actually owned, for shop UI display. Mirrors upgrades.ts's tool
 * composition loop exactly, gated by ownership instead of the condition-only predicate. */
export function ownedToolBonusTotals(state: GameState): OwnedToolBonusTotals {
  const composed = composedToolMultipliers(state, true);
  return {
    ownedCount: ownedTools(state).length,
    totalToolCount: TOOL_DEFINITIONS.length,
    clickMultiplierProduct: composed.clickMultiplier,
    globalCpsMultiplierProduct: composed.globalCpsMultiplier,
    generatorMultipliers: composed.generatorMultipliers,
  };
}

interface ComposedToolMultipliers {
  readonly clickMultiplier: number;
  readonly generatorMultipliers: Readonly<Record<string, number>>;
  readonly globalCpsMultiplier: number;
}

/** Same effect-composition loop as upgrades.ts#computeMultipliers's tool section, parameterised
 * by which activation predicate to use -- condition-only (matches the existing pipeline exactly)
 * or ownership (the new gate this shop introduces). */
function composedToolMultipliers(state: GameState, useOwnership: boolean): ComposedToolMultipliers {
  let clickMultiplier = 1;
  const generatorMultipliers: Record<string, number> = {};
  let globalCpsMultiplier = 1;

  for (const def of TOOL_DEFINITIONS) {
    const active = useOwnership ? isToolOwned(state, def.id) : isToolBonusActive(state, def.id);
    if (!active) continue;

    switch (def.effect.kind) {
      case "clickMultiplier":
        clickMultiplier *= def.effect.multiplier;
        break;
      case "generatorMultiplier": {
        const key = def.effect.generatorId;
        generatorMultipliers[key] = (generatorMultipliers[key] ?? 1) * def.effect.multiplier;
        break;
      }
      case "globalCpsMultiplier":
        globalCpsMultiplier *= def.effect.multiplier;
        break;
      default:
        break;
    }
  }

  return { clickMultiplier, generatorMultipliers, globalCpsMultiplier };
}

export interface ToolOwnershipCorrection {
  readonly clickMultiplier: number;
  readonly generatorMultipliers: Readonly<Record<string, number>>;
  readonly globalCpsMultiplier: number;
}

/**
 * The multiplicative correction reducer.ts applies on top of upgrades.ts#computeMultipliers()'s
 * (condition-gated) output to turn it into the ownership-gated equivalent, WITHOUT editing
 * upgrades.ts or tools.ts. For each tool-effect component:
 *
 *   correction = (product of OWNED tools' effect) / (product of CONDITION-MET tools' effect)
 *
 * Since owned tools are always a subset of condition-met tools (purchase requires discovery
 * first), every ratio is in (0, 1] and the denominator is a product of the exact same positive
 * per-tool multipliers already used to compute the numerator's superset, so it is never zero.
 * When `state.toolProgressionEnabled` is false, this returns the identity (no correction): that
 * toggle already means "every tool bonus is active regardless of condition" project-wide, and
 * this shop's ownership gate is layered ONLY on top of the condition gate, not the toggle itself.
 */
export function toolOwnershipCorrection(state: GameState): ToolOwnershipCorrection {
  if (!state.toolProgressionEnabled) {
    return { clickMultiplier: 1, generatorMultipliers: {}, globalCpsMultiplier: 1 };
  }

  const conditionGated = composedToolMultipliers(state, false);
  const owned = composedToolMultipliers(state, true);

  const generatorIds = new Set<string>([
    ...Object.keys(conditionGated.generatorMultipliers),
    ...Object.keys(owned.generatorMultipliers),
  ]);
  const generatorMultipliers: Record<string, number> = {};
  for (const id of generatorIds) {
    const before = conditionGated.generatorMultipliers[id] ?? 1;
    const after = owned.generatorMultipliers[id] ?? 1;
    generatorMultipliers[id] = after / before;
  }

  return {
    clickMultiplier: owned.clickMultiplier / conditionGated.clickMultiplier,
    generatorMultipliers,
    globalCpsMultiplier: owned.globalCpsMultiplier / conditionGated.globalCpsMultiplier,
  };
}

/**
 * cps.ts#totalCps, extended with `toolOwnershipCorrection`. Deliberately mirrors that function's
 * aggregation shape (reusing generators.ts#generatorCps/getGeneratorDefinition and
 * upgrades.ts#computeMultipliers -- never re-deriving the CPS formula itself) because cps.ts
 * cannot be edited from this lane to accept a correction parameter directly. Keep this in sync
 * with cps.ts#totalCps's aggregation shape if that function's structure ever changes.
 */
export function correctedTotalCps(state: GameState): BigNum {
  const multipliers = computeMultipliers(state);
  const correction = toolOwnershipCorrection(state);

  const perGeneratorTotal = state.generators.reduce<BigNum>((acc, owned) => {
    const def = getGeneratorDefinition(owned.id);
    const base = generatorCps(def, owned.count);
    const rawGenMultiplier = multipliers.generatorMultipliers[owned.id] ?? 1;
    const correctedGenMultiplier = rawGenMultiplier * (correction.generatorMultipliers[owned.id] ?? 1);
    return bnAdd(acc, bnMulScalar(base, correctedGenMultiplier));
  }, bnFromNumber(0));

  return bnMulScalar(perGeneratorTotal, multipliers.globalCpsMultiplier * correction.globalCpsMultiplier);
}

export interface BuyToolResult {
  readonly ok: boolean;
  readonly nextOwnedTools: readonly OwnedTool[];
  readonly nextCookies: BigNum;
}

/** Pure purchase step for a single tool, used by reducer.ts's buyTool/buyAllAffordableTools
 * handlers so the "can this tool be bought right now" rule lives in exactly one place. */
export function purchaseTool(state: GameState, toolId: string, purchasedAtTickCount: number): BuyToolResult {
  const status = toolShopStatus(state, toolId);
  if (status !== "purchasable") {
    return { ok: false, nextOwnedTools: ownedTools(state), nextCookies: state.cookies };
  }
  const price = priceOfTool(toolId);
  return {
    ok: true,
    nextOwnedTools: [...ownedTools(state), { id: toolId, purchasedAtTickCount }],
    nextCookies: bnClampNonNegative(bnSub(state.cookies, price)),
  };
}
