import { bnAdd, bnClampNonNegative, bnCompare, bnFromNumber, bnMulScalar, bnSub, type BigNum } from "./big-number.js";
import { totalCps } from "./cps.js";
import { evaluateAchievements } from "./achievements.js";
import {
  collectGoldenCookie as collectGoldenCookiePure,
  despawnIfExpired,
  maybeSpawnGoldenCookie,
  isEffectActive,
  type GoldenCookieConfig,
  DEFAULT_GOLDEN_COOKIE_CONFIG,
} from "./golden-cookie.js";
import {
  clearLastResolved,
  clickRandomEventTarget,
  createInitialRandomEventsState,
  randomEventClickMultiplier,
  randomEventCpsMultiplier,
  randomEventRebateFraction,
  tickRandomEvents,
  type RandomEventConfig,
  DEFAULT_RANDOM_EVENT_CONFIG,
} from "./random-events.js";
import { costOfLitres } from "./diesel-exchange.js";
import { computeDisclosure } from "./disclosure.js";
import { costOfBulk, costOfNext, getGeneratorDefinition, maxAffordable } from "./generators.js";
import { computeOfflineProgressWithTools, type OfflineProgressOptions } from "./offline-progress.js";
import { canPrestige, performPrestige } from "./prestige.js";
import { toolPrice } from "./tool-shop.js";
import { isToolBonusActive, isToolDiscovered, totalBuyMaxDiscount } from "./tools.js";
import { computeMultipliers, getUpgradeDefinition, isUpgradeUnlocked } from "./upgrades.js";
import type { GameState, RngPort } from "./types.js";

export interface ReducerCtx {
  readonly now: () => number;
  readonly rng: RngPort;
  readonly goldenCookieConfig?: GoldenCookieConfig;
  /**
   * Spawn windows and payouts for the general random-event pool (random-events.ts). Optional,
   * exactly like `goldenCookieConfig`: omit it and the shipped three-to-ten-minute schedule
   * applies. The renderer passes a shortened one only when the developer-only fast-events flag
   * is set, and tests pass their own so a scheduler assertion never has to wait ten minutes.
   */
  readonly randomEventConfig?: RandomEventConfig;
}

export type GameAction =
  | { readonly type: "click" }
  | { readonly type: "buyGenerator"; readonly generatorId: string }
  | { readonly type: "buyGeneratorBulk"; readonly generatorId: string; readonly quantity: number | "max" }
  | { readonly type: "buyUpgrade"; readonly upgradeId: string }
  | { readonly type: "buyTool"; readonly toolId: string }
  /**
   * Buys `litres` of diesel for WinForge with cookies (diesel-exchange.ts). The reducer does
   * the whole GAME half of that purchase — check the depot is revealed, check the price, deduct
   * the cookies, record the litres — and nothing else. Writing the actual voucher to the shared
   * ledger file is a side effect of this action having been dispatched, performed by
   * GameProvider through the main-process bridge, exactly as autosave is. The domain never
   * touches a file system, so a mint is as replayable and testable as a click.
   */
  | { readonly type: "mintDiesel"; readonly litres: number }
  | { readonly type: "setToolProgression"; readonly enabled: boolean }
  | { readonly type: "tick"; readonly elapsedMs: number }
  | { readonly type: "collectGoldenCookie" }
  /**
   * A click on one of the active random event's own targets -- a falling cookie during Cookie
   * Rain, the oven during an Oven Hiccup. The target id comes from the state the UI is
   * rendering, and a click on a target that is no longer really there is a no-op (see
   * random-events.ts#clickRandomEventTarget), so a stale render or a double-fired pointer
   * cannot pay twice.
   */
  | { readonly type: "randomEventClick"; readonly targetId: string }
  /** Clears the finished-event record behind the "what just happened" toast. */
  | { readonly type: "randomEventResolve" }
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

  // Sugar Rush multiplies the click on top of whatever a click frenzy is already doing. The two
  // stack rather than overriding, because they came from two independent events and taking one
  // away because the other landed would be a worse surprise than a big number.
  clickValue = bnMulScalar(clickValue, randomEventClickMultiplier(state.randomEvents, ctx.now()));

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

/**
 * Buys a tool's bonus with cookies — the ONLY transition that ever switches a tool bonus on
 * (tool-shop.ts). A no-op when the bonus is already active, when the tool has not been
 * discovered yet, or when the cookies are not there — mirrors handleBuyUpgrade's
 * refuse-silently shape rather than throwing.
 */
function handleBuyTool(state: GameState, ctx: ReducerCtx, toolId: string): GameState {
  if (isToolBonusActive(state, toolId)) return state;
  if (!isToolDiscovered(state, toolId)) return state;
  const price = toolPrice(toolId);
  if (bnCompare(state.cookies, price) < 0) return state;

  const nextState: GameState = {
    ...state,
    cookies: bnClampNonNegative(bnSub(state.cookies, price)),
    purchasedToolIds: [...state.purchasedToolIds, toolId],
  };

  return withAchievements(nextState, nowIso(ctx));
}

/**
 * Refuses silently, in the same shape as every other purchase here, when the depot has not been
 * revealed, when the quantity is not a positive whole number of litres, or when the cookies are
 * not there. A refusal returns the state unchanged, which is also what tells the provider's
 * observer that no voucher should be written.
 */
function handleMintDiesel(state: GameState, ctx: ReducerCtx, litresRequested: number): GameState {
  if (!computeDisclosure(state).dieselDepot) return state;
  const litres = Math.floor(litresRequested);
  if (!Number.isFinite(litres) || litres <= 0) return state;

  const cost = costOfLitres(state.dieselDepot.litresMinted, litres);
  if (bnCompare(state.cookies, cost) < 0) return state;

  const nextState: GameState = {
    ...state,
    cookies: bnClampNonNegative(bnSub(state.cookies, cost)),
    dieselDepot: {
      litresMinted: state.dieselDepot.litresMinted + litres,
      vouchersMinted: state.dieselDepot.vouchersMinted + 1,
      cookiesSpent: bnAdd(state.dieselDepot.cookiesSpent, cost),
    },
  };

  return withAchievements(nextState, nowIso(ctx));
}

function handleSetToolProgression(state: GameState, enabled: boolean): GameState {
  if (state.toolProgressionEnabled === enabled) return state;
  return { ...state, toolProgressionEnabled: enabled };
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

  // An Oven Hiccup is the one thing in the game that makes this number go DOWN, and it applies
  // here, over the same elapsed slice everything else uses.
  const cpsWithEvents = bnMulScalar(cpsWithEffect, randomEventCpsMultiplier(state.randomEvents, nowMs));

  const gained = bnMulScalar(cpsWithEvents, elapsedMs / 1000);
  let nextState = addCookies(state, gained);

  let goldenCookie = despawnIfExpired(nextState.goldenCookie, nowMs, ctx.rng, config);
  goldenCookie = maybeSpawnGoldenCookie(goldenCookie, nowMs, ctx.rng, config);
  nextState = { ...nextState, goldenCookie, lastTickAtIso: nowIso(ctx) };

  // The random-event scheduler advances on the SAME tick, off the same clock and the same
  // RngPort, and is told whether a golden cookie is currently holding the stage.
  const eventResult = tickRandomEvents(nextState.randomEvents, nextState, nowMs, ctx.rng, {
    blocked: goldenCookie.isSpawned,
    config: ctx.randomEventConfig ?? DEFAULT_RANDOM_EVENT_CONFIG,
  });
  nextState = { ...nextState, randomEvents: eventResult.randomEvents };
  if (eventResult.instantBonus.mantissa !== 0) {
    nextState = addCookies(nextState, eventResult.instantBonus);
  }

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

function handleRandomEventClick(state: GameState, ctx: ReducerCtx, targetId: string): GameState {
  const config = ctx.randomEventConfig ?? DEFAULT_RANDOM_EVENT_CONFIG;
  const result = clickRandomEventTarget(state.randomEvents, state, targetId, ctx.now(), ctx.rng, config);
  if (!result.claimed) return state;

  let nextState: GameState = { ...state, randomEvents: result.randomEvents };
  if (result.bonus.mantissa !== 0) nextState = addCookies(nextState, result.bonus);

  return withAchievements(nextState, nowIso(ctx));
}

function handleRandomEventResolve(state: GameState): GameState {
  const randomEvents = clearLastResolved(state.randomEvents);
  if (randomEvents === state.randomEvents) return state;
  return { ...state, randomEvents };
}

/**
 * MARKET DAY'S REBATE.
 *
 * Applied here, around the purchase handlers, rather than inside them. Every price in the game
 * is computed in exactly one place per item, and the Tools tech tree already applies a discount
 * at that seam; a second, timed discount threaded through the same arithmetic would make the
 * price on the card disagree with the price at the till for a minute at a time. So the player
 * pays the printed price and this function hands part of it back -- a rebate, which is what the
 * copy says it is. It reads what the purchase ACTUALLY cost (cookies before minus cookies
 * after), so a purchase the reducer refused cost nothing and is refunded nothing.
 */
function withMarketDayRebate(previous: GameState, next: GameState, ctx: ReducerCtx): GameState {
  if (next === previous) return next;
  const fraction = randomEventRebateFraction(previous.randomEvents, ctx.now());
  if (fraction <= 0) return next;

  const spent = bnSub(previous.cookies, next.cookies);
  if (spent.mantissa <= 0) return next;

  const rebate = bnMulScalar(spent, fraction);
  return { ...next, cookies: bnAdd(next.cookies, rebate) };
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
      return withMarketDayRebate(state, handleBuyGeneratorBulk(state, ctx, action.generatorId, 1), ctx);
    case "buyGeneratorBulk":
      return withMarketDayRebate(state, handleBuyGeneratorBulk(state, ctx, action.generatorId, action.quantity), ctx);
    case "buyUpgrade":
      return withMarketDayRebate(state, handleBuyUpgrade(state, ctx, action.upgradeId), ctx);
    case "buyTool":
      return withMarketDayRebate(state, handleBuyTool(state, ctx, action.toolId), ctx);
    case "mintDiesel":
      return handleMintDiesel(state, ctx, action.litres);
    case "setToolProgression":
      return handleSetToolProgression(state, action.enabled);
    case "tick":
      return handleTick(state, ctx, action.elapsedMs);
    case "collectGoldenCookie":
      return handleCollectGoldenCookie(state, ctx);
    case "randomEventClick":
      return handleRandomEventClick(state, ctx, action.targetId);
    case "randomEventResolve":
      return handleRandomEventResolve(state);
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
    schemaVersion: 4,
    cookies: zero,
    lifetimeCookies: zero,
    baseClickValue: bnFromNumber(1),
    generators: [],
    upgrades: [],
    achievements: [],
    prestige: { ascensionPoints: 0, totalPrestigeCount: 0, permanentUnlockIds: [] },
    goldenCookie: { isSpawned: false, rngStreamIndex: 0, nextEligibleAtEpochMs: 0 },
    randomEvents: createInitialRandomEventsState(),
    stats: { totalClicks: 0, totalCookiesBaked: zero, clockAnomalyCount: 0 },
    dieselDepot: { litresMinted: 0, vouchersMinted: 0, cookiesSpent: zero },
    toolProgressionEnabled: true,
    purchasedToolIds: [],
    lastTickAtIso: nowIsoString,
    lastSavedAtIso: nowIsoString,
  };
}
