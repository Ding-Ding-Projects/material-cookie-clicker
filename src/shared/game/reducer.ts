import { bnAdd, bnClampNonNegative, bnCompare, bnFromNumber, bnMulScalar, bnSub, type BigNum } from "./big-number";
import { totalCps } from "./cps";
import { evaluateAchievements } from "./achievements";
import {
  collectGoldenCookie as collectGoldenCookiePure,
  despawnIfExpired,
  maybeSpawnGoldenCookie,
  isEffectActive,
  type GoldenCookieConfig,
  DEFAULT_GOLDEN_COOKIE_CONFIG,
} from "./golden-cookie";
import { costOfBulk, costOfNext, getGeneratorDefinition, maxAffordable } from "./generators";
import { computeOfflineProgressWithTools, type OfflineProgressOptions } from "./offline-progress";
import { canPrestige, performPrestige } from "./prestige";
import { totalBuyMaxDiscount } from "./tools";
import { computeMultipliers, getUpgradeDefinition, isUpgradeUnlocked } from "./upgrades";
import type { GameState, RngPort } from "./types";

export interface ReducerCtx {
  readonly now: () => number;
  readonly rng: RngPort;
  readonly goldenCookieConfig?: GoldenCookieConfig;
}

export type GameAction =
  | { readonly type: "click" }
  | { readonly type: "buyGenerator"; readonly generatorId: string }
  | { readonly type: "buyGeneratorBulk"; readonly generatorId: string; readonly quantity: number | "max" }
  | { readonly type: "buyUpgrade"; readonly upgradeId: string }
  | { readonly type: "tick"; readonly elapsedMs: number }
  | { readonly type: "collectGoldenCookie" }
  | { readonly type: "prestige" }
  | {
      readonly type: "importSave";
      readonly savedState: GameState;
      readonly nowIso: string;
      readonly offlineOptions: OfflineProgressOptions;
    };

function nowIso(ctx: ReducerCtx): string {
  return new Date(ctx.now()).toISOString();
}

function withAchievements(state: GameState, nowIsoString: string): GameState {
  const newlyUnlocked = evaluateAchievements(state);
  if (newlyUnlocked.length === 0) return state;
  return {
    ...state,
    achievements: [
      ...state.achievements,
      ...newlyUnlocked.map((id) => ({ id, unlockedAtIso: nowIsoString })),
    ],
  };
}

function addCookies(state: GameState, amount: BigNum): GameState {
  return {
    ...state,
    cookies: bnAdd(state.cookies, amount),
    lifetimeCookies: bnAdd(state.lifetimeCookies, amount),
    stats: { ...state.stats, totalCookiesBaked: bnAdd(state.stats.totalCookiesBaked, amount) },
  };
}

function handleClick(state: GameState, ctx: ReducerCtx): GameState {
  const multipliers = computeMultipliers(state);
  let clickValue = bnMulScalar(state.baseClickValue, multipliers.clickMultiplier);

  const effect = state.goldenCookie.activeEffect;
  if (effect?.kind === "clickFrenzy" && effect.multiplier !== undefined && isEffectActive(effect, ctx.now())) {
    clickValue = bnMulScalar(clickValue, effect.multiplier);
  }

  const withCookies = addCookies(state, clickValue);
  const nowIsoString = nowIso(ctx);
  return withAchievements(
    { ...withCookies, stats: { ...withCookies.stats, totalClicks: withCookies.stats.totalClicks + 1 } },
    nowIsoString,
  );
}

function handleBuyGeneratorBulk(state: GameState, ctx: ReducerCtx, generatorId: string, quantityRequested: number | "max"): GameState {
  const def = getGeneratorDefinition(generatorId);
  const owned = state.generators.find((g) => g.id === generatorId);
  const ownedCount = owned?.count ?? 0;
  const discount = totalBuyMaxDiscount(state);

  let quantity: number;
  if (quantityRequested === "max") {
    // Discount lets the player afford more: solve maxAffordable() against an inflated
    // cookie budget so it accounts for the price reduction actually being applied below.
    const effectiveBudget = discount > 0 ? bnMulScalar(state.cookies, 1 / (1 - discount)) : state.cookies;
    quantity = maxAffordable(def, ownedCount, effectiveBudget);
  } else {
    quantity = Math.max(0, Math.floor(quantityRequested));
  }

  if (quantity <= 0) return state;

  const rawCost = costOfBulk(def, ownedCount, quantity);
  const finalCost = discount > 0 ? bnMulScalar(rawCost, 1 - discount) : rawCost;

  if (bnCompare(state.cookies, finalCost) < 0) return state;

  const nextGenerators = owned
    ? state.generators.map((g) => (g.id === generatorId ? { ...g, count: g.count + quantity } : g))
    : [...state.generators, { id: generatorId, count: quantity }];

  const nextState: GameState = {
    ...state,
    cookies: bnClampNonNegative(bnSub(state.cookies, finalCost)),
    generators: nextGenerators,
  };

  return withAchievements(nextState, nowIso(ctx));
}

function handleBuyUpgrade(state: GameState, ctx: ReducerCtx, upgradeId: string): GameState {
  const def = getUpgradeDefinition(upgradeId);

  if (state.upgrades.some((u) => u.id === upgradeId)) return state;
  if (!isUpgradeUnlocked(def.unlockCondition, state)) return state;
  if (bnCompare(state.cookies, def.cost) < 0) return state;

  const nextState: GameState = {
    ...state,
    cookies: bnClampNonNegative(bnSub(state.cookies, def.cost)),
    upgrades: [...state.upgrades, { id: upgradeId, purchasedAtTickCount: state.stats.totalClicks }],
  };

  return withAchievements(nextState, nowIso(ctx));
}

function handleTick(state: GameState, ctx: ReducerCtx, elapsedMs: number): GameState {
  if (elapsedMs <= 0) return state;

  const config = ctx.goldenCookieConfig ?? DEFAULT_GOLDEN_COOKIE_CONFIG;
  const nowMs = ctx.now();

  const cps = totalCps(state);
  const effect = state.goldenCookie.activeEffect;
  const cpsWithEffect =
    effect?.kind === "frenzy" && effect.multiplier !== undefined && isEffectActive(effect, nowMs)
      ? bnMulScalar(cps, effect.multiplier)
      : cps;

  const gained = bnMulScalar(cpsWithEffect, elapsedMs / 1000);
  let nextState = addCookies(state, gained);

  let goldenCookie = despawnIfExpired(nextState.goldenCookie, nowMs, ctx.rng, config);
  goldenCookie = maybeSpawnGoldenCookie(goldenCookie, nowMs, ctx.rng, config);
  nextState = { ...nextState, goldenCookie, lastTickAtIso: nowIso(ctx) };

  return withAchievements(nextState, nowIso(ctx));
}

function handleCollectGoldenCookie(state: GameState, ctx: ReducerCtx): GameState {
  const config = ctx.goldenCookieConfig ?? DEFAULT_GOLDEN_COOKIE_CONFIG;
  const nowMs = ctx.now();
  const result = collectGoldenCookiePure(state.goldenCookie, state, nowMs, ctx.rng, config);

  let nextState: GameState = { ...state, goldenCookie: result.goldenCookie };
  if (result.instantBonus.mantissa !== 0) {
    nextState = addCookies(nextState, result.instantBonus);
  }

  return withAchievements(nextState, nowIso(ctx));
}

function handlePrestige(state: GameState, ctx: ReducerCtx): GameState {
  if (!canPrestige(state)) return state;
  const { state: prestiged } = performPrestige(state);
  return withAchievements(prestiged, nowIso(ctx));
}

function handleImportSave(action: Extract<GameAction, { type: "importSave" }>): GameState {
  // Note: deliberately ignores the reducer's current live `state` -- importing a save
  // wholesale replaces it with `action.savedState`, which is the whole point of import.
  const offlineResult = computeOfflineProgressWithTools(action.savedState, action.nowIso, action.offlineOptions);

  const stats = {
    ...action.savedState.stats,
    clockAnomalyCount:
      action.savedState.stats.clockAnomalyCount + (offlineResult.wasClockAnomaly ? 1 : 0),
    totalCookiesBaked: bnAdd(action.savedState.stats.totalCookiesBaked, offlineResult.cookiesEarned),
  };

  const nextState: GameState = {
    ...action.savedState,
    cookies: bnAdd(action.savedState.cookies, offlineResult.cookiesEarned),
    lifetimeCookies: bnAdd(action.savedState.lifetimeCookies, offlineResult.cookiesEarned),
    stats,
    lastTickAtIso: action.nowIso,
  };

  return withAchievements(nextState, action.nowIso);
}

/** The ONLY mutation seam in the domain. Every state transition flows through this function. */
export function applyGameAction(state: GameState, action: GameAction, ctx: ReducerCtx): GameState {
  switch (action.type) {
    case "click":
      return handleClick(state, ctx);
    case "buyGenerator":
      return handleBuyGeneratorBulk(state, ctx, action.generatorId, 1);
    case "buyGeneratorBulk":
      return handleBuyGeneratorBulk(state, ctx, action.generatorId, action.quantity);
    case "buyUpgrade":
      return handleBuyUpgrade(state, ctx, action.upgradeId);
    case "tick":
      return handleTick(state, ctx, action.elapsedMs);
    case "collectGoldenCookie":
      return handleCollectGoldenCookie(state, ctx);
    case "prestige":
      return handlePrestige(state, ctx);
    case "importSave":
      return handleImportSave(action);
  }
}

/** Convenience helper for cost preview UIs: cost of buying the next single unit. */
export { costOfNext };

export function createInitialGameState(nowIsoString: string): GameState {
  const zero = bnFromNumber(0);
  return {
    schemaVersion: 1,
    cookies: zero,
    lifetimeCookies: zero,
    baseClickValue: bnFromNumber(1),
    generators: [],
    upgrades: [],
    achievements: [],
    prestige: { ascensionPoints: 0, totalPrestigeCount: 0, permanentUnlockIds: [] },
    goldenCookie: { isSpawned: false, rngStreamIndex: 0, nextEligibleAtEpochMs: 0 },
    stats: { totalClicks: 0, totalCookiesBaked: zero, clockAnomalyCount: 0 },
    toolProgressionEnabled: true,
    lastTickAtIso: nowIsoString,
    lastSavedAtIso: nowIsoString,
  };
}
