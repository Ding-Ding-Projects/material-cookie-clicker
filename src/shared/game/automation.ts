import { bnAdd, bnCompare, bnFromNumber, type BigNum } from "./big-number.js";
import { GENERATOR_DEFINITIONS, costOfNext } from "./generators.js";
import { applyGameAction, type ReducerCtx } from "./reducer.js";
import { priceOfTool, toolShopStatus } from "./tool-shop.js";
import { TOOL_DEFINITIONS } from "./tools.js";
import { UPGRADE_DEFINITIONS, isUpgradeUnlocked } from "./upgrades.js";
import type { GameState } from "./types.js";

/**
 * Automation: auto-clicker, auto-buyer, and golden-cookie auto-collect. Every action this
 * module takes flows through reducer.ts#applyGameAction -- the SAME dispatch path a human click
 * or a human purchase uses. There is no parallel "auto-click adds X cookies" math anywhere here;
 * an auto-click IS a `{ type: "click" }` action, so the two paths can never drift apart.
 *
 * Tick-driven from a wall-clock delta the caller supplies (consistent with cps.ts/reducer.ts's
 * `tick` action) -- this module never reads a clock or assumes a frame rate. Settings are a
 * plain parameter rather than persisted GameState: where the player's automation preferences
 * live (renderer state, local storage, …) is a UI/persistence concern outside this lane; this
 * module only needs to know the settings for the tick it's currently processing.
 */

export interface AutomationCategoryToggles {
  readonly generators: boolean;
  readonly upgrades: boolean;
  readonly tools: boolean;
}

export interface AutoClickerSettings {
  readonly enabled: boolean;
  readonly clicksPerSecond: number;
}

export interface AutoBuyerSettings {
  readonly enabled: boolean;
  /** Minimum wall-clock time between auto-buy sweeps -- the "bounded interval" the brief asks
   * for, so auto-buying doesn't re-evaluate every single tick. */
  readonly intervalMs: number;
  /** Auto-buying never spends cookies below this floor. */
  readonly reserveCookies: BigNum;
  readonly categories: AutomationCategoryToggles;
}

export interface AutomationSettings {
  readonly autoClicker: AutoClickerSettings;
  readonly autoBuyer: AutoBuyerSettings;
  readonly autoCollectGoldenCookies: boolean;
}

export const DEFAULT_AUTOMATION_SETTINGS: AutomationSettings = {
  autoClicker: { enabled: false, clicksPerSecond: 0 },
  autoBuyer: {
    enabled: false,
    intervalMs: 1000,
    reserveCookies: bnFromNumber(0),
    categories: { generators: true, upgrades: true, tools: true },
  },
  autoCollectGoldenCookies: false,
};

/**
 * Fractional leftover time carried between calls so a low clicks-per-second setting (or a short
 * poll interval) doesn't systematically lose clicks/buy-sweeps to repeated flooring. Entirely
 * optional to thread through: a caller that always passes ZERO_AUTOMATION_CARRY simply accepts
 * per-call flooring, which is still correct, just slightly conservative over many short ticks.
 */
export interface AutomationCarry {
  readonly clickCarryMs: number;
  readonly buyerCarryMs: number;
}

export const ZERO_AUTOMATION_CARRY: AutomationCarry = { clickCarryMs: 0, buyerCarryMs: 0 };

export interface AutomationTickResult {
  readonly state: GameState;
  readonly carry: AutomationCarry;
  readonly autoClicksFired: number;
  readonly autoBuyPurchases: number;
}

/**
 * Hard bounds on catch-up work performed by a SINGLE runAutomationTick call. These exist so an
 * absurd elapsedMs (a backgrounded tab resuming after an hour, a debugger pause, a suspended
 * laptop) can never fire an unbounded number of actions in one go -- worst case is exactly these
 * many actions, deterministically, no matter how large elapsedMs is. A caller that ticks
 * frequently (a normal UI loop, tens to low hundreds of ms per tick) will never come close to
 * hitting them in ordinary play; they only bind during a large catch-up, and drain it gradually
 * over the next several real ticks rather than trying to resolve it all at once.
 */
export const MAX_AUTO_CLICKS_PER_TICK = 500;
export const MAX_AUTO_BUYER_FIRINGS_PER_TICK = 20;
export const MAX_AUTO_BUY_ACTIONS_PER_FIRING = 20;

export function runAutomationTick(
  state: GameState,
  ctx: ReducerCtx,
  settings: AutomationSettings,
  elapsedMs: number,
  carry: AutomationCarry = ZERO_AUTOMATION_CARRY,
): AutomationTickResult {
  if (elapsedMs <= 0) {
    return { state, carry, autoClicksFired: 0, autoBuyPurchases: 0 };
  }

  let next = state;

  if (settings.autoCollectGoldenCookies && next.goldenCookie.isSpawned) {
    next = applyGameAction(next, { type: "collectGoldenCookie" }, ctx);
  }

  const clickResult = runAutoClicker(next, ctx, settings.autoClicker, elapsedMs, carry.clickCarryMs);
  next = clickResult.state;

  const buyerResult = runAutoBuyer(next, ctx, settings.autoBuyer, elapsedMs, carry.buyerCarryMs);
  next = buyerResult.state;

  return {
    state: next,
    carry: { clickCarryMs: clickResult.carryMs, buyerCarryMs: buyerResult.carryMs },
    autoClicksFired: clickResult.clicksFired,
    autoBuyPurchases: buyerResult.purchases,
  };
}

function runAutoClicker(
  state: GameState,
  ctx: ReducerCtx,
  settings: AutoClickerSettings,
  elapsedMs: number,
  carryMs: number,
): { state: GameState; carryMs: number; clicksFired: number } {
  if (!settings.enabled || settings.clicksPerSecond <= 0) {
    return { state, carryMs, clicksFired: 0 };
  }

  const clickIntervalMs = 1000 / settings.clicksPerSecond;
  const pendingMs = carryMs + elapsedMs;
  const owedClicks = Math.floor(pendingMs / clickIntervalMs);
  const clicksFired = Math.min(MAX_AUTO_CLICKS_PER_TICK, Math.max(0, owedClicks));

  let next = state;
  for (let i = 0; i < clicksFired; i++) {
    next = applyGameAction(next, { type: "click" }, ctx);
  }

  return { state: next, carryMs: pendingMs - clicksFired * clickIntervalMs, clicksFired };
}

function runAutoBuyer(
  state: GameState,
  ctx: ReducerCtx,
  settings: AutoBuyerSettings,
  elapsedMs: number,
  carryMs: number,
): { state: GameState; carryMs: number; purchases: number } {
  if (!settings.enabled || settings.intervalMs <= 0) {
    return { state, carryMs, purchases: 0 };
  }

  let next = state;
  let pendingMs = carryMs + elapsedMs;
  let purchases = 0;
  let firings = 0;

  while (pendingMs >= settings.intervalMs && firings < MAX_AUTO_BUYER_FIRINGS_PER_TICK) {
    const firing = runAutoBuyerFiring(next, ctx, settings);
    next = firing.state;
    purchases += firing.purchases;
    pendingMs -= settings.intervalMs;
    firings += 1;
  }

  return { state: next, carryMs: pendingMs, purchases };
}

interface AutoBuyCandidate {
  readonly kind: "generator" | "upgrade" | "tool";
  readonly id: string;
  readonly cost: BigNum;
}

function collectCandidates(state: GameState, settings: AutoBuyerSettings): AutoBuyCandidate[] {
  const candidates: AutoBuyCandidate[] = [];

  if (settings.categories.generators) {
    for (const def of GENERATOR_DEFINITIONS) {
      const owned = state.generators.find((g) => g.id === def.id)?.count ?? 0;
      candidates.push({ kind: "generator", id: def.id, cost: costOfNext(def, owned) });
    }
  }

  if (settings.categories.upgrades) {
    const ownedIds = new Set(state.upgrades.map((u) => u.id));
    for (const def of UPGRADE_DEFINITIONS) {
      if (ownedIds.has(def.id)) continue;
      if (!isUpgradeUnlocked(def.unlockCondition, state)) continue;
      candidates.push({ kind: "upgrade", id: def.id, cost: def.cost });
    }
  }

  if (settings.categories.tools) {
    for (const def of TOOL_DEFINITIONS) {
      const status = toolShopStatus(state, def.id);
      if (status !== "purchasable" && status !== "discovered") continue;
      candidates.push({ kind: "tool", id: def.id, cost: priceOfTool(def.id) });
    }
  }

  return candidates;
}

/** Cheapest candidate across every enabled category that's still affordable once the reserve is
 * kept untouched -- i.e. cookies >= cost + reserveCookies. */
function cheapestAffordableCandidate(state: GameState, settings: AutoBuyerSettings): AutoBuyCandidate | undefined {
  const candidates = collectCandidates(state, settings).sort((a, b) => bnCompare(a.cost, b.cost));
  for (const candidate of candidates) {
    if (bnCompare(state.cookies, bnAdd(candidate.cost, settings.reserveCookies)) >= 0) {
      return candidate;
    }
  }
  return undefined;
}

function runAutoBuyerFiring(
  state: GameState,
  ctx: ReducerCtx,
  settings: AutoBuyerSettings,
): { state: GameState; purchases: number } {
  let next = state;
  let purchases = 0;

  for (let i = 0; i < MAX_AUTO_BUY_ACTIONS_PER_FIRING; i++) {
    const candidate = cheapestAffordableCandidate(next, settings);
    if (!candidate) break;

    switch (candidate.kind) {
      case "generator":
        next = applyGameAction(next, { type: "buyGenerator", generatorId: candidate.id }, ctx);
        break;
      case "upgrade":
        next = applyGameAction(next, { type: "buyUpgrade", upgradeId: candidate.id }, ctx);
        break;
      case "tool":
        next = applyGameAction(next, { type: "buyTool", toolId: candidate.id }, ctx);
        break;
    }
    purchases += 1;
  }

  return { state: next, purchases };
}
