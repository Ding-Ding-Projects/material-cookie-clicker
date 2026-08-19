import { bnAdd, bnClampNonNegative, bnCompare, bnFromNumber, bnMulScalar, bnSub, type BigNum } from "./big-number.js";
import { evaluateAchievements } from "./achievements.js";
import {
  catchGoldenCookie,
  collectGoldenCookie as collectGoldenCookiePure,
  despawnIfExpired,
  fleeGoldenCookie,
  maybeSpawnGoldenCookie,
  pressGoldenDial,
  isEffectActive,
  type GoldenCookieConfig,
  DEFAULT_GOLDEN_COOKIE_CONFIG,
} from "./golden-cookie.js";
import {
  buyRaidConsumable as buyRaidConsumablePure,
  buyWhackStorage as buyWhackStoragePure,
  clearLastRaid,
  clearLastResolved,
  chooseRandomEventOption,
  clickRandomEventTarget,
  createInitialRandomEventsState,
  extendComboWindow,
  stackEventMultipliers,
  EVENT_CLICK_STACK_CAP,
  randomEventClickMultiplier,
  randomEventRebateFraction,
  randomEventSubgameSpeed,
  tickRandomEvents,
  whackMice,
  type RaidConsumableId,
  type RandomEventChoiceId,
  type RandomEventConfig,
  DEFAULT_RANDOM_EVENT_CONFIG,
} from "./random-events.js";
import {
  amortizedCookiesFor,
  autoShipQuantity,
  createInitialFactoryState,
  equipmentBulkCost,
  getEquipmentDefinition,
  getFactoryUpgradeDefinition,
  isFactoryUpgradeOffered,
  ownsFactoryUpgrade,
  equipmentOwned as factoryEquipmentOwned,
  shippableLitres,
  tickFactory,
} from "./diesel-factory.js";
import {
  createInitialControlUnlocksState,
  findControlRung,
  hasControlRung,
  areMinigameEventsUnlocked,
} from "./control-unlocks.js";
import { computeDisclosure } from "./disclosure.js";
import { effectiveCps } from "./effective-cps.js";
import {
  canStartConstruction,
  createInitialHomeState,
  getFurnitureDefinition,
  getRoomDefinition,
  isBlueprintOffered,
  isRoomBuilt,
  ownsBlueprint,
  ownsFurniture,
  requiredBuildMs,
  tickHome,
} from "./home-construction.js";

/**
 * The subgame id the Overtime Crew names, and the one place the string is written down.
 *
 * It lives HERE rather than in random-events.ts because this file is the seam that knows a
 * subgame called "home" exists at all. random-events.ts carries the same string on the event's
 * definition and nothing else; if the two ever disagree the event speeds up nothing, which a test
 * pins so the disagreement cannot happen quietly.
 */
export const HOME_SUBGAME_ID = "home";
import { costOfBulk, costOfNext, getGeneratorDefinition, isGeneratorUnlocked, maxAffordable } from "./generators.js";
import { computeOfflineProgressWithTools, type OfflineProgressOptions } from "./offline-progress.js";
import { canPrestige, performPrestige } from "./prestige.js";
import { canBuyRebornNode, getRebornNodeDefinition, rebornPermanentSlots } from "./reborn.js";
import { toolPrice } from "./tool-shop.js";
import { isToolBonusActive, isToolDiscovered, totalBuyMaxDiscount } from "./tools.js";
import { computeMultipliers, getUpgradeDefinition, isUpgradeUnlocked } from "./upgrades.js";
import type { GameState, RngPort } from "./types.js";
import {
  applyGoldenTokenAward,
  createGoldenTokenAward,
  createSeededRng,
  EMPTY_GOLDEN_TOKEN_LEDGER,
  EMPTY_LUCKY_CHANCE_STATE,
  EMPTY_MINIGAME_STATE,
  reduceMinigameState,
  applyMinigameMove,
  resolveLuckyChance,
  scheduleMinigame,
  type MinigameData,
  type MinigameId,
  type MinigameMove,
  type MinigameScheduleState,
} from "./minigames.js";

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
  /**
   * True when the game window is hidden or minimised, read at dispatch time by GameProvider.
   *
   * It does NOT pause any clock — every timestamp in this game is wall-clock epoch ms and
   * offline-progress.ts already credits time the app was not running, so a second
   * visibility-aware clock would make two halves of the same save disagree. Its one job is to
   * keep a Mouse Raid from starting against a window nobody can see; see
   * random-events.ts#tickRandomEvents.
   */
  readonly windowHidden?: boolean;
}

export type GameAction =
  | { readonly type: "click" }
  | { readonly type: "buyGenerator"; readonly generatorId: string }
  | { readonly type: "buyGeneratorBulk"; readonly generatorId: string; readonly quantity: number | "max" }
  | { readonly type: "buyUpgrade"; readonly upgradeId: string }
  | { readonly type: "buyTool"; readonly toolId: string }
  /**
   * SHIPS `litres` of diesel out of the factory's tanks as a voucher for WinForge.
   *
   * The action kind is unchanged from the build where cookies bought litres outright, because
   * what it does to the ledger is unchanged — it still mints one voucher — but where the litres
   * COME FROM is completely different. They are drawn DOWN from tank stock the factory
   * manufactured (diesel-factory.ts). No cookies are deducted here: cookies were spent on the
   * equipment, and the voucher records the amortized share of that spend.
   *
   * The reducer does the whole GAME half — check the depot is revealed, check the stock is
   * really there, draw it down, record the shipment — and nothing else. Writing the voucher to
   * the shared ledger file is a side effect of this action having been dispatched, performed by
   * GameProvider through the main-process bridge, exactly as autosave is.
   */
  | { readonly type: "mintDiesel"; readonly litres: number }
  /** Buys factory equipment with cookies — the ONE place cookies enter the factory economy. */
  | { readonly type: "buyFactoryEquipment"; readonly equipmentId: string; readonly quantity: number }
  /** Buys one factory upgrade with cookies. Offered by condition, bought by press, never given. */
  | { readonly type: "buyFactoryUpgrade"; readonly upgradeId: string }
  /** Player switch for automatic shipping. Does nothing until an automation upgrade is bought. */
  | { readonly type: "setFactoryAutoShip"; readonly enabled: boolean }
  /**
   * Buys one room's BLUEPRINT with cookies (home-construction.ts). The drawing and nothing else:
   * it buys the right to start a construction, never the room. Refuses silently when the house
   * is not revealed, when the blueprint is already owned, when the room it depends on is not
   * built yet, or when the cookies are not there.
   */
  | { readonly type: "buyHomeBlueprint"; readonly roomId: string }
  /**
   * Starts construction on one room, paying the builders. The ONE-AT-A-TIME rule lives in
   * home-construction.ts#canStartConstruction and is checked here: a second start while a build
   * is up is refused outright rather than queued, because a queue nobody asked for is a queue
   * that spends cookies while the player is looking somewhere else.
   */
  | { readonly type: "startHomeConstruction"; readonly roomId: string }
  /** Buys one piece of furniture into a room that is actually BUILT. Once each, never twice. */
  | { readonly type: "buyHomeFurniture"; readonly furnitureId: string }
  | { readonly type: "setToolProgression"; readonly enabled: boolean }
  /**
   * Buys ONE rung of ONE control's ladder (control-unlocks.ts) — a settings entry, a piece of
   * window chrome, a search field, a stepper multiple, the bulk toolbar, a feature toggle.
   *
   * A purchase like every other purchase in this reducer, refusing silently in the same shape:
   * an unknown rung id, a rung already owned, a rung whose predecessor in its own ladder is not
   * owned, or a balance short of the price all return the state unchanged. Nothing in the game
   * dispatches this on the player's behalf — there is no condition that grants a control, and
   * there is no code path that unlocks one as a reward. It happens because somebody pressed the
   * plate with the price on it.
   */
  | { readonly type: "buyControlUnlock"; readonly rungId: string }
  | { readonly type: "tick"; readonly elapsedMs: number }
  /**
   * CATCHING the golden-cookie sprite where it spawned on the stage. Opens the Oven Dial; it
   * does NOT redeem anything by itself.
   *
   * `stepped` is the player's `prefers-reduced-motion` setting at the moment of the catch, read
   * by the view because the domain has no window to ask. It is the ONE thing the view is trusted
   * with here, it is frozen onto the dial state immediately, and it changes only the cadence of
   * the needle — never the zone, the rounds or the reward.
   */
  | { readonly type: "goldenCatch"; readonly stepped?: boolean }
  /**
   * One press on the open dial. The action deliberately carries NO needle position: the reducer
   * recomputes where the needle was from the round's start time and the clock, so a hand-built
   * dispatch cannot claim a hit it did not earn. Three hits in a row redeem the cookie.
   */
  | { readonly type: "goldenDialPress" }
  /** Escape from the dial card, or a deliberate walk-away: the cookie flees, normal cooldown. */
  | { readonly type: "goldenFlee" }
  /**
   * A click on one of the active random event's own targets -- a falling cookie during Cookie
   * Rain, the oven during an Oven Hiccup. The target id comes from the state the UI is
   * rendering, and a click on a target that is no longer really there is a no-op (see
   * random-events.ts#clickRandomEventTarget), so a stale render or a double-fired pointer
   * cannot pay twice.
   */
  | { readonly type: "randomEventClick"; readonly targetId: string }
  /**
   * A whack on one mouse of an active Mouse Raid. Its own action kind rather than a
   * `randomEventClick` with a differently-shaped id, because it is its own gesture with its own
   * arithmetic: a whack pays nothing by itself (what it buys is the share of the balance that
   * mouse would have carried off) and only the LAST whack pays, as the defended bonus. Keeping
   * it separate also means a stray `mouse:` id cannot reach the rain/oven path, and the
   * transcript of a session says plainly which gesture happened.
   */
  | { readonly type: "randomEventWhack"; readonly mouseIds: readonly string[] }
  /**
   * Buys one raid consumable (random-events.ts): a Whack Pass, a Bigger Whack or a Half-HP
   * Whack. An ordinary manual purchase, shaped like every other one here — it refuses silently
   * at the stock cap or short of the price, and it takes Market Day's rebate like anything else
   * bought with cookies.
   */
  | { readonly type: "buyRaidConsumable"; readonly consumableId: RaidConsumableId }
  /**
   * Buys the next rung of the Whack Storage ladder (random-events.ts): one shared stock cap
   * that applies to all three consumables at once. Its own action rather than a
   * `buyControlUnlock` rung, because control-unlocks.ts buys INTERFACE — chrome that was
   * hidden — while this changes what a raid may be fought with. It refuses silently at the top
   * of the ladder or short of the price, like every other manual purchase here.
   */
  | { readonly type: "buyWhackStorage" }
  /** Clears the finished-event record behind the "what just happened" toast. */
  /**
   * Answering a CHOICE event (the Taste Test's two buttons). Its own action rather than a
   * `randomEventClick` with a special id, because it is a decision rather than a target: the
   * domain refuses a second answer, an answer after the window closed, and an id that is not one
   * of the two, so a double-fired pointer can never both serve the tray and send it back.
   */
  | { readonly type: "randomEventChoose"; readonly choiceId: RandomEventChoiceId }
  | { readonly type: "randomEventResolve" }
  /** Clears the finished-raid record behind the aftermath toast. Separate from the above
   *  because the two toasts are separate surfaces saying different things. */
  | { readonly type: "randomEventRaidDismiss" }
  | { readonly type: "prestige" }
  /**
   * Buys one node of the Reborn tree (reborn.ts) with ascension points. Additive, and shaped
   * exactly like every other purchase in this reducer: it refuses silently when the node is
   * already owned, when its prerequisite is not, or when the points are not there.
   */
  | { readonly type: "buyRebornNode"; readonly nodeId: string }
  /**
   * Pins or unpins one owned upgrade as permanent, within the slot budget the Reborn tree's
   * memory branch has actually bought. Pinning is free — the point was already spent on the
   * slot — and reversible, because a slot is a slot rather than a commitment.
   */
  | { readonly type: "setPermanentUpgrade"; readonly upgradeId: string; readonly pinned: boolean }
  | { readonly type: "minigameStart"; readonly id: MinigameId }
  | { readonly type: "minigameMinimize" }
  | { readonly type: "minigameResume" }
  | { readonly type: "minigameRestart" }
  | { readonly type: "minigameAbandon" }
  | { readonly type: "minigameComplete"; readonly grade?: number }
  | { readonly type: "minigameUpdate"; readonly data: MinigameData }
  | { readonly type: "minigameMove"; readonly move: MinigameMove }
  | { readonly type: "minigameDailyObjective" }
  | { readonly type: "luckyChanceDraw" }
  | {
      readonly type: "importSave";
      readonly savedState: GameState;
      readonly nowIso: string;
      readonly offlineOptions: OfflineProgressOptions;
    };

function nowIso(ctx: ReducerCtx): string {
  return new Date(ctx.now()).toISOString();
}

function withAchievements(state: GameState, nowIsoString: string, awardGoldenTokens = true): GameState {
  const newlyUnlocked = evaluateAchievements(state);
  if (newlyUnlocked.length === 0) return state;
  let goldenTokens = state.goldenTokens ?? EMPTY_GOLDEN_TOKEN_LEDGER;
  if (awardGoldenTokens) newlyUnlocked.forEach((id) => {
    goldenTokens = applyGoldenTokenAward(goldenTokens, createGoldenTokenAward("achievement_milestone", id, 1));
  });
  return {
    ...state,
    achievements: [
      ...state.achievements,
      ...newlyUnlocked.map((id) => ({ id, unlockedAtIso: nowIsoString })),
    ],
    goldenTokens: awardGoldenTokens ? goldenTokens : state.goldenTokens,
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

  const nowMs = ctx.now();
  const effect = state.goldenCookie.activeEffect;
  const goldenClick =
    effect?.kind === "clickFrenzy" && effect.multiplier !== undefined && isEffectActive(effect, nowMs)
      ? effect.multiplier
      : 1;

  // THE CLICK STACK. A golden cookie's click frenzy and whatever the pool is doing to clicks
  // (Sugar Rush, Click Frenzy, the Combo Window, or Night Shift's quarter-value penalty) both
  // apply, multiplicatively, under one stated ceiling. The rules and the reason for the ceiling
  // live on `stackEventMultipliers` in random-events.ts; this line is the only place clicks
  // consult them.
  clickValue = bnMulScalar(
    clickValue,
    stackEventMultipliers(goldenClick, randomEventClickMultiplier(state.randomEvents, nowMs), EVENT_CLICK_STACK_CAP),
  );

  const withCookies = addCookies(state, clickValue);
  const nowIsoString = nowIso(ctx);
  // A Combo Window is the one event a click changes rather than merely benefits from: every
  // click during it buys a little more window, up to a hard ceiling the domain enforces. This is
  // a no-op returning the same object on every click that is not during one.
  const randomEvents = extendComboWindow(withCookies.randomEvents, nowMs);
  return withAchievements(
    {
      ...withCookies,
      randomEvents,
      stats: { ...withCookies.stats, totalClicks: withCookies.stats.totalClicks + 1 },
    },
    nowIsoString,
  );
}

function handleBuyGeneratorBulk(state: GameState, ctx: ReducerCtx, generatorId: string, quantityRequested: number | "max"): GameState {
  const def = getGeneratorDefinition(generatorId);
  const owned = state.generators.find((g) => g.id === generatorId);
  const ownedCount = owned?.count ?? 0;
  // The first purchase of a milestone-gated tier must cross its explicit all-time threshold.
  // Existing ownership remains valid for imported saves; spending cookies can never relock a tier.
  if (ownedCount === 0 && !isGeneratorUnlocked(def, state.stats.totalCookiesBaked)) return state;
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
 * SHIPPING, which is a withdrawal and not a purchase.
 *
 * Refuses silently, in the same shape as every other transition here, when the factory has not
 * been revealed, when the quantity is not a positive whole number of litres, or — the honest
 * one — when the tanks do not actually hold that many litres. There is no cookie check, because
 * shipping costs no cookies: the equipment did. A refusal returns the state unchanged, which is
 * also what tells the provider's observer that no voucher should be written.
 */
function shipFromTanks(state: GameState, ctx: ReducerCtx, litresRequested: number): GameState {
  if (!computeDisclosure(state).dieselDepot) return state;
  const litres = Math.floor(litresRequested);
  if (!Number.isFinite(litres) || litres <= 0) return state;
  if (shippableLitres(state.dieselFactory) < litres) return state;

  const attributed = amortizedCookiesFor(state.dieselFactory, litres);

  const nextState: GameState = {
    ...state,
    dieselFactory: { ...state.dieselFactory, litres: state.dieselFactory.litres - litres },
    dieselDepot: {
      litresMinted: state.dieselDepot.litresMinted + litres,
      vouchersMinted: state.dieselDepot.vouchersMinted + 1,
      cookiesSpent: bnAdd(state.dieselDepot.cookiesSpent, attributed),
    },
  };

  return withAchievements(nextState, nowIso(ctx));
}

/**
 * Buys factory equipment. This and `handleBuyFactoryUpgrade` are the ONLY two transitions in
 * the whole game where cookies enter the diesel economy — the owner's rule, enforced by there
 * being nowhere else that touches both `cookies` and `dieselFactory`.
 */
function handleBuyFactoryEquipment(
  state: GameState,
  ctx: ReducerCtx,
  equipmentId: string,
  quantityRequested: number,
): GameState {
  if (!computeDisclosure(state).dieselFactory) return state;
  const quantity = Math.floor(quantityRequested);
  if (!Number.isFinite(quantity) || quantity <= 0) return state;

  const def = getEquipmentDefinition(equipmentId);
  const owned = factoryEquipmentOwned(state.dieselFactory, equipmentId);
  const cost = equipmentBulkCost(def, owned, quantity);
  if (bnCompare(state.cookies, cost) < 0) return state;

  const equipment = state.dieselFactory.equipment.some((e) => e.id === equipmentId)
    ? state.dieselFactory.equipment.map((e) => (e.id === equipmentId ? { ...e, count: e.count + quantity } : e))
    : [...state.dieselFactory.equipment, { id: equipmentId, count: quantity }];

  const nextState: GameState = {
    ...state,
    cookies: bnClampNonNegative(bnSub(state.cookies, cost)),
    dieselFactory: {
      ...state.dieselFactory,
      equipment,
      cookiesInvested: bnAdd(state.dieselFactory.cookiesInvested, cost),
    },
  };

  return withAchievements(nextState, nowIso(ctx));
}

function handleBuyFactoryUpgrade(state: GameState, ctx: ReducerCtx, upgradeId: string): GameState {
  if (!computeDisclosure(state).dieselFactory) return state;
  const def = getFactoryUpgradeDefinition(upgradeId);
  if (ownsFactoryUpgrade(state.dieselFactory, upgradeId)) return state;
  if (!isFactoryUpgradeOffered(state.dieselFactory, def.unlockCondition)) return state;
  if (bnCompare(state.cookies, def.cost) < 0) return state;

  const nextState: GameState = {
    ...state,
    cookies: bnClampNonNegative(bnSub(state.cookies, def.cost)),
    dieselFactory: {
      ...state.dieselFactory,
      upgradeIds: [...state.dieselFactory.upgradeIds, upgradeId],
      cookiesInvested: bnAdd(state.dieselFactory.cookiesInvested, def.cost),
    },
  };

  return withAchievements(nextState, nowIso(ctx));
}

function handleSetFactoryAutoShip(state: GameState, enabled: boolean): GameState {
  if (state.dieselFactory.autoShipEnabled === enabled) return state;
  return { ...state, dieselFactory: { ...state.dieselFactory, autoShipEnabled: enabled } };
}

/**
 * Buys one control rung. The domain (control-unlocks.ts) owns the table, the price and the
 * ladder order; this handler owns nothing but the four refusals and moving the cookies, which
 * is the same division `handleBuyTool` and `handleBuyRaidConsumable` already use.
 *
 * The ladder-order check is the one worth naming: rung N is refused unless rung N-1 is owned, so
 * a hand-built dispatch cannot skip straight to Max without paying for ×10 and ×100 on the way.
 */
function handleBuyControlUnlock(state: GameState, ctx: ReducerCtx, rungId: string): GameState {
  const found = findControlRung(rungId);
  if (!found) return state;
  if (hasControlRung(state, rungId)) return state;
  if (found.index > 0 && !hasControlRung(state, found.control.rungs[found.index - 1].id)) return state;

  const price = bnFromNumber(found.rung.price);
  if (bnCompare(state.cookies, price) < 0) return state;

  const current = state.controlUnlocks ?? createInitialControlUnlocksState();
  const nextState: GameState = {
    ...state,
    cookies: bnClampNonNegative(bnSub(state.cookies, price)),
    controlUnlocks: { purchasedRungIds: [...current.purchasedRungIds, rungId] },
  };

  return withAchievements(nextState, nowIso(ctx));
}

/* ------------------------------------------------------------------ home construction ----
 *
 * Three handlers, one per way cookies can enter the house, and they are the only three. Each
 * refuses silently in the same shape every other purchase in this reducer does — a refusal
 * returns the state unchanged, which is also what tells the store not to notify anybody.
 */

function handleBuyHomeBlueprint(state: GameState, ctx: ReducerCtx, roomId: string): GameState {
  if (!computeDisclosure(state).homeConstruction) return state;
  const def = getRoomDefinition(roomId);
  if (!isBlueprintOffered(state.homeConstruction, roomId)) return state;

  const cost = bnFromNumber(def.blueprintCost);
  if (bnCompare(state.cookies, cost) < 0) return state;

  const nextState: GameState = {
    ...state,
    cookies: bnClampNonNegative(bnSub(state.cookies, cost)),
    homeConstruction: {
      ...state.homeConstruction,
      blueprintIds: [...state.homeConstruction.blueprintIds, roomId],
      cookiesInvested: bnAdd(state.homeConstruction.cookiesInvested, cost),
    },
  };

  return withAchievements(nextState, nowIso(ctx));
}

function handleStartHomeConstruction(state: GameState, ctx: ReducerCtx, roomId: string): GameState {
  if (!computeDisclosure(state).homeConstruction) return state;
  if (!canStartConstruction(state.homeConstruction, roomId)) return state;

  const def = getRoomDefinition(roomId);
  const cost = bnFromNumber(def.buildCost);
  if (bnCompare(state.cookies, cost) < 0) return state;

  // The required time is frozen HERE, with the build-speed bonus the house owns at this instant
  // already applied, so the countdown the panel prints can only ever go one direction.
  const requiredMs = requiredBuildMs(state.homeConstruction, roomId);

  const nextState: GameState = {
    ...state,
    cookies: bnClampNonNegative(bnSub(state.cookies, cost)),
    homeConstruction: {
      ...state.homeConstruction,
      build: { roomId, elapsedMs: 0, requiredMs },
      cookiesInvested: bnAdd(state.homeConstruction.cookiesInvested, cost),
    },
  };

  return withAchievements(nextState, nowIso(ctx));
}

function handleBuyHomeFurniture(state: GameState, ctx: ReducerCtx, furnitureId: string): GameState {
  if (!computeDisclosure(state).homeConstruction) return state;
  const def = getFurnitureDefinition(furnitureId);
  // Furniture goes in a room that EXISTS. Not a room whose blueprint you own, and not a room
  // currently being put up around it.
  if (!isRoomBuilt(state.homeConstruction, def.roomId)) return state;
  if (ownsFurniture(state.homeConstruction, furnitureId)) return state;

  const cost = bnFromNumber(def.cost);
  if (bnCompare(state.cookies, cost) < 0) return state;

  const nextState: GameState = {
    ...state,
    cookies: bnClampNonNegative(bnSub(state.cookies, cost)),
    homeConstruction: {
      ...state.homeConstruction,
      rooms: state.homeConstruction.rooms.map((room) =>
        room.roomId === def.roomId ? { ...room, furnitureIds: [...room.furnitureIds, furnitureId] } : room,
      ),
      cookiesInvested: bnAdd(state.homeConstruction.cookiesInvested, cost),
    },
  };

  return withAchievements(nextState, nowIso(ctx));
}

function handleSetToolProgression(state: GameState, enabled: boolean): GameState {
  if (state.toolProgressionEnabled === enabled) return state;
  return { ...state, toolProgressionEnabled: enabled };
}

const MINIGAME_IDS: readonly MinigameId[] = [
  "klondike",
  "memory_match",
  "cookie_2048",
  "minesweeper",
  "breakout",
];

function shuffle<T>(items: readonly T[], rng: RngPort): T[] {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng.next() * (index + 1));
    [next[index], next[swap]] = [next[swap], next[index]];
  }
  return next;
}

function initialMinigameData(id: MinigameId, rng: RngPort): MinigameData {
  if (id === "klondike") {
    const suits = ["C", "D", "H", "S"] as const;
    const deck = shuffle(
      suits.flatMap((suit) => Array.from({ length: 13 }, (_, rank) => `${suit}${rank + 1}`)),
      rng,
    );
    const tableau: string[][] = [];
    const faceUp: boolean[][] = [];
    let cursor = 0;
    for (let column = 0; column < 7; column += 1) {
      const cards = deck.slice(cursor, cursor + column + 1);
      cursor += column + 1;
      tableau.push(cards);
      faceUp.push(cards.map((_, index) => index === cards.length - 1));
    }
    return {
      kind: "klondike",
      stock: deck.slice(cursor),
      waste: [],
      foundations: { C: [], D: [], H: [], S: [] },
      tableau,
      faceUp,
      drawCount: 3,
    };
  }

  if (id === "memory_match") {
    const cards = shuffle(
      Array.from({ length: 8 }, (_, index) => [`cookie-${index}`, `cookie-${index}`]).flat(),
      rng,
    );
    return { kind: "memory_match", cards, revealed: [], matched: [], attempts: 0 };
  }

  if (id === "cookie_2048") {
    const board = Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => 0));
    board[0][0] = 2;
    board[3][3] = 2;
    return { kind: "cookie_2048", board, score: 0, bestTile: 2, moves: 0, won: false };
  }

  if (id === "minesweeper") {
    const cells = shuffle(Array.from({ length: 64 }, (_, index) => index), rng);
    return {
      kind: "minesweeper",
      width: 8,
      height: 8,
      mineCount: 10,
      mines: cells.slice(0, 10),
      revealed: [],
      flagged: [],
      started: false,
    };
  }

  return {
    kind: "breakout",
    paddleX: 0.5,
    ball: { x: 0.5, y: 0.8, vx: 0.012, vy: -0.014 },
    bricks: Array.from({ length: 40 }, () => true),
    score: 0,
    lives: 3,
    paused: false,
  };
}

function minigameUnlocked(state: GameState): boolean {
  return areMinigameEventsUnlocked(state);
}

function scheduleForNextMinigame(state: GameState, nowMs: number, rng: RngPort): MinigameScheduleState {
  const existing = state.minigameSchedule;
  if (existing && existing.next.startsAtEpochMs > nowMs) return existing;
  if (existing) {
    const next = scheduleMinigame(nowMs, createSeededRng(existing.rngSeed, existing.occurrence + 1));
    return { ...existing, next, occurrence: existing.occurrence + 1 };
  }
  const seed = Math.floor(rng.next() * 0x1_0000_0000) >>> 0;
  return { rngSeed: seed, occurrence: 0, next: scheduleMinigame(nowMs, createSeededRng(seed)) };
}

function startScheduledMinigame(state: GameState, ctx: ReducerCtx, nowMs: number): GameState {
  if (!minigameUnlocked(state)) return state;
  if (state.goldenCookie.isSpawned || state.randomEvents.actives.length > 0) return state;
  if (state.minigames.active && (state.minigames.active.status === "active" || state.minigames.active.status === "minimized")) return state;
  const schedule = state.minigameSchedule;
  if (!schedule || nowMs < schedule.next.startsAtEpochMs) return state;
  const rng = createSeededRng(schedule.rngSeed, schedule.occurrence);
  const id = MINIGAME_IDS[Math.floor(rng.next() * MINIGAME_IDS.length)] ?? MINIGAME_IDS[0];
  const games = reduceMinigameState(state.minigames, {
    type: "start",
    id,
    data: initialMinigameData(id, rng),
    nowEpochMs: nowMs,
  });
  return {
    ...state,
    minigames: games,
    minigameSchedule: scheduleForNextMinigame(state, nowMs, ctx.rng),
  };
}

function handleMinigameStart(state: GameState, ctx: ReducerCtx, id: MinigameId): GameState {
  if (!minigameUnlocked(state) || (state.minigames.active && ["active", "minimized"].includes(state.minigames.active.status))) return state;
  const nowMs = ctx.now();
  const rng = createSeededRng(Math.floor(ctx.rng.next() * 0x1_0000_0000) >>> 0);
  return {
    ...state,
    minigames: reduceMinigameState(state.minigames, {
      type: "start",
      id,
      data: initialMinigameData(id, rng),
      nowEpochMs: nowMs,
    }),
    minigameSchedule: scheduleForNextMinigame(state, nowMs, ctx.rng),
  };
}

function handleMinigameLifecycle(state: GameState, ctx: ReducerCtx, action: GameAction): GameState {
  if (!minigameUnlocked(state)) return state;
  const nowMs = ctx.now();
  const current = state.minigames.active;
  if (action.type === "minigameMove") {
    if (!current || current.status !== "active") return state;
    const data = applyMinigameMove(current.data, action.move, ctx.rng);
    if (data === current.data) return state;
    return { ...state, minigames: reduceMinigameState(state.minigames, { type: "update", data, nowEpochMs: nowMs }) };
  }
  if (action.type === "minigameUpdate") {
    if (!current || current.id !== action.data.kind) return state;
    return { ...state, minigames: reduceMinigameState(state.minigames, { type: "update", data: action.data, nowEpochMs: nowMs }) };
  }
  if (action.type === "minigameMinimize" || action.type === "minigameResume" || action.type === "minigameAbandon") {
    const type = action.type === "minigameMinimize" ? "minimize" : action.type === "minigameResume" ? "resume" : "abandon";
    return {
      ...state,
      minigames: reduceMinigameState(state.minigames, { type, nowEpochMs: nowMs } as never),
      ...(action.type === "minigameAbandon" ? { minigameSchedule: scheduleForNextMinigame(state, nowMs, ctx.rng) } : {}),
    };
  }
  if (action.type === "minigameRestart") {
    if (!current) return state;
    const rng = createSeededRng(current.startedAtEpochMs >>> 0, current.lastUpdatedAtEpochMs >>> 0);
    return { ...state, minigames: reduceMinigameState(state.minigames, { type: "restart", data: initialMinigameData(current.id, rng), nowEpochMs: nowMs }) };
  }
  if (action.type === "minigameComplete") {
    if (!current) return state;
    const games = reduceMinigameState(state.minigames, { type: "complete", nowEpochMs: nowMs });
    const grade = Math.max(1, Math.min(5, Math.floor(action.grade ?? 1)));
    let goldenTokens = applyGoldenTokenAward(state.goldenTokens, createGoldenTokenAward("minigame_grade", `${current.id}:${nowMs}`, grade));
    if (games.completed.length > 0 && games.completed.length % 3 === 0) {
      goldenTokens = applyGoldenTokenAward(goldenTokens, createGoldenTokenAward("rare_chain", `three:${games.completed.length}`, 2));
    }
    return { ...state, minigames: games, goldenTokens, minigameSchedule: scheduleForNextMinigame(state, nowMs, ctx.rng) };
  }
  return state;
}

function handleDailyObjective(state: GameState): GameState {
  if (!minigameUnlocked(state)) return state;
  const day = new Date().toISOString().slice(0, 10);
  const goldenTokens = applyGoldenTokenAward(state.goldenTokens, createGoldenTokenAward("daily_objective", day, 2));
  return goldenTokens === state.goldenTokens ? state : { ...state, goldenTokens };
}

function handleLuckyChanceDraw(state: GameState, ctx: ReducerCtx): GameState {
  const rewards = ["cookie_bundle_small", "cookie_bundle_large", "timed_boost", "raid_supplies", "rare_cosmetic"];
  const resolution = resolveLuckyChance(
    { ...state.luckyChance, tokens: state.goldenTokens.balance },
    Math.floor(ctx.rng.next() * 0x1_0000_0000) >>> 0,
    rewards,
    ctx.now(),
  );
  if (resolution.result.kind === "insufficient_tokens" || resolution.result.kind === "empty_pool") return state;
  let nextState: GameState = {
    ...state,
    luckyChance: { ...resolution.state, lastResult: resolution.result },
    goldenTokens: { ...state.goldenTokens, balance: resolution.state.tokens },
  };
  if (resolution.result.kind === "win" && resolution.result.rewardId) {
    const rewardId = resolution.result.rewardId;
    nextState = { ...nextState, luckyRewards: [...state.luckyRewards, rewardId] };
    if (rewardId === "cookie_bundle_small") nextState = addCookies(nextState, bnFromNumber(10_000));
    if (rewardId === "cookie_bundle_large") nextState = addCookies(nextState, bnFromNumber(100_000));
    if (rewardId === "timed_boost") {
      nextState = {
        ...nextState,
        goldenCookie: { ...nextState.goldenCookie, activeEffect: { kind: "frenzy", multiplier: 2, expiresAtEpochMs: ctx.now() + 15 * 60 * 1000 } },
      };
    }
    if (rewardId === "raid_supplies") {
      nextState = {
        ...nextState,
        randomEvents: {
          ...nextState.randomEvents,
          consumables: {
            ...nextState.randomEvents.consumables,
            whack_pass: { ...nextState.randomEvents.consumables.whack_pass, stock: nextState.randomEvents.consumables.whack_pass.stock + 1 },
          },
        },
      };
    }
  }
  return nextState;
}

/**
 * ONE TICK, FOUR ECONOMIES, AND A STATED ORDER.
 *
 * Three lanes each added a timed system to this function, so the order they run in is now a
 * decision rather than an accident, and it is written down here:
 *
 *   1. cookie accrual, at the composed effective rate;
 *   2. the golden cookie's own spawn and expiry;
 *   3. the random-event scheduler, and the instant bonus a resolved event pays;
 *   4. a Mouse Raid's theft, applied where the event result that produced it is read;
 *   5. the diesel factory's production slice, and automatic shipping if it was bought;
 *   6. the home construction timer;
 *   7. achievements, evaluated once at the end against the state all six produced.
 *
 * All of it runs off the SAME `elapsedMs` and the same `nowMs`, so a paused game pauses every
 * economy together and none of them can drift apart from the others.
 *
 * THE ORDER OF 3 TO 6 IS FORCED BY DATA, and reordering them would silently change payouts.
 * Every event payout in random-events.ts is derived from `totalCps`, which folds in the home's
 * coziness through `computeMultipliers` — so on the tick a room finishes, running step 6 before
 * step 3 would pay that tick's event at the new room's rate. Step 4 is the same story from the
 * other end: the theft is a fraction of the balance, so moving anything that touches cookies
 * across it changes what the mice take. The order below is the one the payouts were tuned
 * against: cookies, then events, then the theft they produced, then the two builds.
 * Achievements are genuinely last, because they must see the finished tick and not a room that
 * is about to be built.
 */
function handleTick(state: GameState, ctx: ReducerCtx, elapsedMs: number): GameState {
  if (elapsedMs <= 0) return state;

  const config = ctx.goldenCookieConfig ?? DEFAULT_GOLDEN_COOKIE_CONFIG;
  const nowMs = ctx.now();

  // THE PRODUCTION STACK, in one line and by one rule — but the rule and the line both live
  // elsewhere now. `effectiveCps` composes the standing rate with the golden cookie's Frenzy and
  // whatever the pool is currently doing to production, and it composes them through
  // `stackEventMultipliers` under the stated ×1000 ceiling: a Production Frenzy inside a golden
  // frenzy, a Clot or an Oven Hiccup dragging one down, a Burnt Batch Frenzy hitting the cap,
  // and the ordinary case where both are 1. Only one pool event can ever be live, so that really
  // is the entire stack.
  //
  // This line accrues through that function rather than repeating it because the HUD's PER
  // SECOND plate prints the same call: the readout and the accrual are the same arithmetic, not
  // two copies of it that drift.
  const gained = bnMulScalar(effectiveCps(state, nowMs), elapsedMs / 1000);
  let nextState = addCookies(state, gained);

  let goldenCookie = despawnIfExpired(nextState.goldenCookie, nowMs, ctx.rng, config);
  goldenCookie = maybeSpawnGoldenCookie(goldenCookie, nowMs, ctx.rng, config);
  nextState = { ...nextState, goldenCookie, lastTickAtIso: nowIso(ctx) };

  // The random-event scheduler advances on the SAME tick, off the same clock and the same
  // RngPort, and is told whether a golden cookie is currently holding the stage.
  const eventResult = tickRandomEvents(nextState.randomEvents, nextState, nowMs, ctx.rng, {
    blocked: goldenCookie.isSpawned || nextState.minigames.active !== null,
    hidden: ctx.windowHidden ?? false,
    config: ctx.randomEventConfig ?? DEFAULT_RANDOM_EVENT_CONFIG,
  });
  nextState = { ...nextState, randomEvents: eventResult.randomEvents };
  if (eventResult.instantBonus.mantissa !== 0) {
    nextState = addCookies(nextState, eventResult.instantBonus);
  }

  // A MOUSE RAID THAT WAS NOT FULLY DEFENDED.
  //
  // The theft is applied here and deliberately NOT through `addCookies` with a negative amount:
  // that helper also advances `lifetimeCookies` and `stats.totalCookiesBaked`, and those two are
  // history rather than balance. The mice take cookies out of the jar; they do not un-bake them,
  // they do not revoke the achievements that lifetime total already unlocked, and they do not
  // claw back ascension points hours after the fact. So exactly one number moves, and it is
  // clamped at zero so a raid can empty the jar but never overdraw it.
  if (eventResult.raidTheft && eventResult.raidTheft.stolen.mantissa !== 0) {
    nextState = {
      ...nextState,
      cookies: bnClampNonNegative(bnSub(nextState.cookies, eventResult.raidTheft.stolen)),
    };
  }

  // THE FACTORY RUNS ON THE SAME CLOCK. One slice of the production line per game tick, from
  // the same elapsed milliseconds the cookie accrual used — so the two economies can never
  // drift apart, and a paused game pauses the refinery too.
  nextState = { ...nextState, dieselFactory: tickFactory(nextState.dieselFactory, elapsedMs / 1000).state };

  // Automation, if it was bought AND switched on, is a shipment like any other: it goes through
  // the same withdrawal that the ship button does, so it can never ship a litre that is not in
  // the tank, and the provider's observer writes its voucher exactly as it writes a manual one.
  const automatic = autoShipQuantity(nextState.dieselFactory);
  if (automatic > 0) nextState = shipFromTanks(nextState, ctx, automatic);

  // THE BUILDING SITE RUNS ON THE SAME CLOCK TOO. Same elapsed milliseconds, same slice, same
  // rule that a quiet site returns the same object and costs nothing. A room finishes here and
  // only here — there is no completion path that does not go through a tick.
  // ...and the Overtime Crew is the one thing that can make that slice longer than the clock.
  // `randomEventSubgameSpeed` is asked for the subgame by ID STRING — random-events.ts has never
  // heard of home-construction.ts and does not need to — and returns 1 whenever no such event is
  // running, which is every tick of an ordinary session. The crew serves MORE CONSTRUCTION per
  // second; it does not skip ahead, does not finish a room the tick it lands, and cannot carry
  // surplus past a completion, because all of that is still `tickHome`'s to decide.
  const buildSpeed = randomEventSubgameSpeed(nextState.randomEvents, nowMs, HOME_SUBGAME_ID);
  nextState = {
    ...nextState,
    homeConstruction: tickHome(nextState.homeConstruction, (elapsedMs / 1000) * buildSpeed).state,
  };

  // The minigame suite gets its own seeded schedule. It never shares the random-event active
  // slot, so opening a side panel leaves the clicker and its existing events running normally.
  if (minigameUnlocked(nextState)) {
    const minigameSchedule = nextState.minigameSchedule ?? scheduleForNextMinigame(nextState, nowMs, ctx.rng);
    nextState = { ...nextState, minigameSchedule };
    nextState = startScheduledMinigame(nextState, ctx, nowMs);
  }

  return withAchievements(nextState, nowIso(ctx));
}

/**
 * CATCH, THEN THE OVEN DIAL — how a golden cookie is redeemed.
 *
 * The history, because two owner decrees are stacked here and both still apply:
 *
 *   1. "the user must press it 10 times to redeem, not auto redeem". First built literally, as a
 *      ten-press countdown on the hero cookie (`GOLDEN_COOKIE_REDEEM_CLICKS` and
 *      `GoldenCookieState.redeemClicks`, both long deleted).
 *   2. "golden cookie puzzle must be a minigame, not a chance game". The countdown was replaced
 *      by Odd Cookie Out, a seeded spot-the-difference grid — and that failed this decree, since
 *      a lucky first press won a round outright. Its fields are deleted too.
 *
 * What stands now satisfies both. The Oven Dial is pure timing: the needle's position is an
 * exact function of elapsed milliseconds (golden-cookie.ts#goldenDialNeedlePosition) on a fixed
 * published difficulty curve that is the same for everyone, so a press either was or was not
 * inside a zone the player could see. And redemption still costs a catch plus at least three
 * deliberate timed presses, with every miss costing seconds and another press — never one click,
 * never automatic.
 *
 * A save written mid-dial under either older scheme simply loses it and gets a fresh spawn (see
 * save-schema.ts).
 */
function handleGoldenCatch(state: GameState, ctx: ReducerCtx, stepped: boolean): GameState {
  const goldenCookie = catchGoldenCookie(state.goldenCookie, ctx.rng, ctx.now(), stepped);
  if (goldenCookie === state.goldenCookie) return state;
  return { ...state, goldenCookie };
}

function handleGoldenDialPress(state: GameState, ctx: ReducerCtx): GameState {
  const nowMs = ctx.now();
  const result = pressGoldenDial(state.goldenCookie, nowMs, ctx.rng);
  if (!result.won) {
    if (result.goldenCookie === state.goldenCookie) return state;
    return { ...state, goldenCookie: result.goldenCookie };
  }

  // Won all three rounds: the real redemption, through the same pure collect the game has always
  // used, so the effect roll and the golden-upgrade bonuses are unchanged.
  const config = ctx.goldenCookieConfig ?? DEFAULT_GOLDEN_COOKIE_CONFIG;
  const collected = collectGoldenCookiePure(result.goldenCookie, state, nowMs, ctx.rng, config);

  let nextState: GameState = {
    ...state,
    goldenCookie: collected.goldenCookie,
    goldenTokens: applyGoldenTokenAward(
      state.goldenTokens,
      createGoldenTokenAward("oven_dial", `oven:${state.goldenCookie.spawnedAtEpochMs ?? nowMs}`, 1),
    ),
  };
  if (collected.instantBonus.mantissa !== 0) {
    nextState = addCookies(nextState, collected.instantBonus);
  }

  return withAchievements(nextState, nowIso(ctx));
}

function handleGoldenFlee(state: GameState, ctx: ReducerCtx): GameState {
  const config = ctx.goldenCookieConfig ?? DEFAULT_GOLDEN_COOKIE_CONFIG;
  const goldenCookie = fleeGoldenCookie(state.goldenCookie, ctx.now(), ctx.rng, config);
  if (goldenCookie === state.goldenCookie) return state;
  return { ...state, goldenCookie };
}

function handleRandomEventClick(state: GameState, ctx: ReducerCtx, targetId: string): GameState {
  const config = ctx.randomEventConfig ?? DEFAULT_RANDOM_EVENT_CONFIG;
  const result = clickRandomEventTarget(state.randomEvents, state, targetId, ctx.now(), ctx.rng, config);
  if (!result.claimed) return state;

  let nextState: GameState = { ...state, randomEvents: result.randomEvents };
  if (result.bonus.mantissa !== 0) nextState = addCookies(nextState, result.bonus);

  return withAchievements(nextState, nowIso(ctx));
}

/**
 * One swing, at one or more mice.
 *
 * More than one id is only legal when the raid armed a Bigger Whack, and the DOMAIN decides
 * that (random-events.ts#whackMice) rather than this handler trusting the action: a hand-built
 * dispatch cannot clear a stage it was not entitled to clear. The ids are gated on shape here
 * too, so this action can only ever reach mice.
 */
function handleRandomEventWhack(state: GameState, ctx: ReducerCtx, mouseIds: readonly string[]): GameState {
  if (mouseIds.length === 0) return state;
  if (!mouseIds.every((id) => id.startsWith("mouse:"))) return state;

  const config = ctx.randomEventConfig ?? DEFAULT_RANDOM_EVENT_CONFIG;
  const result = whackMice(state.randomEvents, state, mouseIds, ctx.now(), ctx.rng, config);
  if (!result.claimed) return state;

  let nextState: GameState = { ...state, randomEvents: result.randomEvents };
  if (result.bonus.mantissa !== 0) nextState = addCookies(nextState, result.bonus);
  return withAchievements(nextState, nowIso(ctx));
}

/**
 * Buys one raid consumable. The domain owns the price, the cap and the refusal; this handler
 * owns nothing but moving the cookies, which is the same division every purchase here uses.
 */
function handleBuyRaidConsumable(state: GameState, id: RaidConsumableId): GameState {
  const result = buyRaidConsumablePure(
    state.randomEvents.consumables,
    id,
    state.cookies,
    state.randomEvents.whackStorageLevel,
  );
  if (!result.bought) return state;
  return {
    ...state,
    cookies: bnClampNonNegative(bnSub(state.cookies, result.price)),
    randomEvents: { ...state.randomEvents, consumables: result.consumables },
  };
}

/** Buys one rung of the shared stock-cap ladder. Same division of labour as the handler above. */
function handleBuyWhackStorage(state: GameState): GameState {
  const result = buyWhackStoragePure(state.randomEvents.whackStorageLevel, state.cookies);
  if (!result.bought || result.price === null) return state;
  return {
    ...state,
    cookies: bnClampNonNegative(bnSub(state.cookies, result.price)),
    randomEvents: { ...state.randomEvents, whackStorageLevel: result.level },
  };
}

function handleRandomEventChoose(state: GameState, ctx: ReducerCtx, choiceId: RandomEventChoiceId): GameState {
  const config = ctx.randomEventConfig ?? DEFAULT_RANDOM_EVENT_CONFIG;
  const result = chooseRandomEventOption(state.randomEvents, state, choiceId, ctx.now(), ctx.rng, config);
  if (!result.claimed) return state;

  let nextState: GameState = { ...state, randomEvents: result.randomEvents };
  if (result.bonus.mantissa !== 0) nextState = addCookies(nextState, result.bonus);
  return withAchievements(nextState, nowIso(ctx));
}

function handleRandomEventRaidDismiss(state: GameState): GameState {
  const randomEvents = clearLastRaid(state.randomEvents);
  if (randomEvents === state.randomEvents) return state;
  return { ...state, randomEvents };
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

function handleBuyRebornNode(state: GameState, ctx: ReducerCtx, nodeId: string): GameState {
  const owned = state.prestige.rebornNodeIds ?? [];
  if (!canBuyRebornNode(nodeId, owned, state.prestige.ascensionPoints)) return state;
  const def = getRebornNodeDefinition(nodeId);

  const nextState: GameState = {
    ...state,
    prestige: {
      ...state.prestige,
      ascensionPoints: state.prestige.ascensionPoints - def.cost,
      rebornNodeIds: [...owned, nodeId],
    },
  };

  return withAchievements(nextState, nowIso(ctx));
}

function handleSetPermanentUpgrade(state: GameState, upgradeId: string, pinned: boolean): GameState {
  const already = state.prestige.permanentUnlockIds.includes(upgradeId);
  if (pinned === already) return state;

  if (!pinned) {
    return {
      ...state,
      prestige: {
        ...state.prestige,
        permanentUnlockIds: state.prestige.permanentUnlockIds.filter((id) => id !== upgradeId),
      },
    };
  }

  // Only an upgrade you actually own can be pinned, and only into a slot you actually bought.
  if (!state.upgrades.some((u) => u.id === upgradeId)) return state;
  const slots = rebornPermanentSlots(state.prestige.rebornNodeIds ?? []);
  if (state.prestige.permanentUnlockIds.length >= slots) return state;

  return {
    ...state,
    prestige: {
      ...state.prestige,
      permanentUnlockIds: [...state.prestige.permanentUnlockIds, upgradeId],
    },
  };
}

/**
 * AN EVENT THAT RAN OUT WHILE THE APP WAS SHUT, SETTLED BEFORE THE OFFLINE CHEQUE IS WRITTEN.
 *
 * This is the load path — `GameProvider` dispatches `importSave` at startup, not just when
 * somebody picks a file — so "a save with a Mouse Raid still on screen" is simply what quitting
 * mid-raid produces. Left alone, that raid expired on the FIRST ORDINARY TICK after load, and a
 * raid's theft is a fraction of the balance AT THE MOMENT IT RESOLVES: a player who saved five
 * seconds into a raid and came back after a night away lost up to eighty per cent of a balance
 * grown by the entire night, for twenty seconds they were never given a chance to play.
 *
 * So the raid is resolved HERE, against the pre-offline balance — the jar as it stood when the
 * window closed, which is the only balance the mice were ever in the room with. The two honest
 * options were this and voiding the raid outright; voiding was rejected because it makes
 * quitting the app a free escape from a raid in progress, and a rule that rewards force-quitting
 * is worse than one that charges an honest price. The mice take what they could have taken; the
 * night's earnings were never on the counter and cannot be stolen.
 *
 * It runs through `tickRandomEvents` rather than reimplementing expiry, with `blocked: true` so
 * this settling tick can only CLOSE things and never spawn a new event against a player who has
 * not seen the screen yet. A stocked Whack Pass still spends itself here, exactly as it would
 * have online: the pass exists to stop cookies leaving, and this is cookies leaving.
 */
function settleExpiredEventsOnLoad(
  saved: GameState,
  ctx: ReducerCtx,
  nowMs: number,
): { readonly state: GameState; readonly bonus: BigNum; readonly stolen: BigNum } {
  const zero = bnFromNumber(0);
  const result = tickRandomEvents(saved.randomEvents, saved, nowMs, ctx.rng, {
    blocked: true,
    config: ctx.randomEventConfig ?? DEFAULT_RANDOM_EVENT_CONFIG,
  });
  if (result.randomEvents === saved.randomEvents) return { state: saved, bonus: zero, stolen: zero };

  const stolen = result.raidTheft?.stolen ?? zero;
  // Clamped against the PRE-offline balance for the same reason the tick clamps: a raid can
  // empty the jar, never overdraw it.
  const takeable = bnCompare(stolen, saved.cookies) > 0 ? saved.cookies : stolen;
  return {
    state: { ...saved, randomEvents: result.randomEvents },
    bonus: result.instantBonus,
    stolen: takeable,
  };
}

function handleImportSave(action: Extract<GameAction, { type: "importSave" }>, ctx: ReducerCtx): GameState {
  // Note: deliberately ignores the reducer's current live `state` -- importing a save
  // wholesale replaces it with `action.savedState`, which is the whole point of import.
  const settled = settleExpiredEventsOnLoad(action.savedState, ctx, Date.parse(action.nowIso) || ctx.now());
  const savedState = settled.state;

  const offlineResult = computeOfflineProgressWithTools(savedState, action.nowIso, action.offlineOptions);
  // What the settling tick paid out (a Flour Shortage's rebound, say) is earned cookies like any
  // other and joins the offline cheque; what the mice took is not, and is handled below.
  const earned = bnAdd(offlineResult.cookiesEarned, settled.bonus);

  const stats = {
    ...savedState.stats,
    clockAnomalyCount: savedState.stats.clockAnomalyCount + (offlineResult.wasClockAnomaly ? 1 : 0),
    totalCookiesBaked: bnAdd(savedState.stats.totalCookiesBaked, earned),
  };

  // Balance order: settle the raid against the old jar, then pay the earnings into it.
  // Lifetime and the baked total move only with the earnings — the mice take cookies out of the
  // jar, they do not un-bake them, exactly as in `handleTick`.
  const nextState: GameState = {
    ...savedState,
    cookies: bnAdd(bnClampNonNegative(bnSub(savedState.cookies, settled.stolen)), earned),
    lifetimeCookies: bnAdd(savedState.lifetimeCookies, earned),
    stats,
    lastTickAtIso: action.nowIso,
  };

  return withAchievements(nextState, action.nowIso, false);
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
      return shipFromTanks(state, ctx, action.litres);
    // Factory equipment and factory upgrades are bought with cookies, at a printed price, from
    // a shelf — they are purchases in every sense the rebate cares about, so they go through
    // the same wrapper. It reads the cookie delta the handler actually produced, so a refused
    // purchase is refunded nothing and no price is discounted twice.
    case "buyFactoryEquipment":
      return withMarketDayRebate(
        state,
        handleBuyFactoryEquipment(state, ctx, action.equipmentId, action.quantity),
        ctx,
      );
    case "buyFactoryUpgrade":
      return withMarketDayRebate(state, handleBuyFactoryUpgrade(state, ctx, action.upgradeId), ctx);
    // All three house purchases are ordinary cookie purchases at a printed price, so all three
    // take Market Day's rebate exactly as the factory shelf does.
    case "buyHomeBlueprint":
      return withMarketDayRebate(state, handleBuyHomeBlueprint(state, ctx, action.roomId), ctx);
    case "startHomeConstruction":
      return withMarketDayRebate(state, handleStartHomeConstruction(state, ctx, action.roomId), ctx);
    case "buyHomeFurniture":
      return withMarketDayRebate(state, handleBuyHomeFurniture(state, ctx, action.furnitureId), ctx);
    case "setFactoryAutoShip":
      return handleSetFactoryAutoShip(state, action.enabled);
    case "setToolProgression":
      return handleSetToolProgression(state, action.enabled);
    // A control is bought with cookies at a printed price from a shelf, so Market Day's rebate
    // applies to it exactly as it applies to a generator. It reads the cookie delta the handler
    // actually produced, so a refused purchase is refunded nothing.
    case "buyControlUnlock":
      return withMarketDayRebate(state, handleBuyControlUnlock(state, ctx, action.rungId), ctx);
    case "tick":
      return handleTick(state, ctx, action.elapsedMs);
    case "goldenCatch":
      return handleGoldenCatch(state, ctx, action.stepped ?? false);
    case "goldenDialPress":
      return handleGoldenDialPress(state, ctx);
    case "goldenFlee":
      return handleGoldenFlee(state, ctx);
    case "randomEventClick":
      return handleRandomEventClick(state, ctx, action.targetId);
    case "randomEventWhack":
      return handleRandomEventWhack(state, ctx, action.mouseIds);
    case "buyRaidConsumable":
      return withMarketDayRebate(state, handleBuyRaidConsumable(state, action.consumableId), ctx);
    case "buyWhackStorage":
      return withMarketDayRebate(state, handleBuyWhackStorage(state), ctx);
    case "randomEventChoose":
      return handleRandomEventChoose(state, ctx, action.choiceId);
    case "randomEventResolve":
      return handleRandomEventResolve(state);
    case "randomEventRaidDismiss":
      return handleRandomEventRaidDismiss(state);
    case "prestige":
      return handlePrestige(state, ctx);
    case "buyRebornNode":
      return handleBuyRebornNode(state, ctx, action.nodeId);
    case "setPermanentUpgrade":
      return handleSetPermanentUpgrade(state, action.upgradeId, action.pinned);
    case "minigameStart":
      return handleMinigameStart(state, ctx, action.id);
    case "minigameMinimize":
    case "minigameResume":
    case "minigameRestart":
    case "minigameAbandon":
    case "minigameComplete":
    case "minigameUpdate":
    case "minigameMove":
      return handleMinigameLifecycle(state, ctx, action);
    case "minigameDailyObjective":
      return handleDailyObjective(state);
    case "luckyChanceDraw":
      return handleLuckyChanceDraw(state, ctx);
    case "importSave":
      return handleImportSave(action, ctx);
  }
}

/** Convenience helper for cost preview UIs: cost of buying the next single unit. */
export { costOfNext };

export function createInitialGameState(nowIsoString: string): GameState {
  const zero = bnFromNumber(0);
  return {
    schemaVersion: 9,
    cookies: zero,
    lifetimeCookies: zero,
    baseClickValue: bnFromNumber(1),
    generators: [],
    upgrades: [],
    achievements: [],
    prestige: { ascensionPoints: 0, totalPrestigeCount: 0, permanentUnlockIds: [], rebornNodeIds: [] },
    goldenCookie: { isSpawned: false, rngStreamIndex: 0, nextEligibleAtEpochMs: 0 },
    randomEvents: createInitialRandomEventsState(),
    stats: { totalClicks: 0, totalCookiesBaked: zero, clockAnomalyCount: 0 },
    dieselDepot: { litresMinted: 0, vouchersMinted: 0, cookiesSpent: zero },
    dieselFactory: createInitialFactoryState(),
    homeConstruction: createInitialHomeState(),
    minigames: EMPTY_MINIGAME_STATE,
    minigameSchedule: null,
    goldenTokens: EMPTY_GOLDEN_TOKEN_LEDGER,
    luckyChance: EMPTY_LUCKY_CHANCE_STATE,
    luckyRewards: [],
    toolProgressionEnabled: true,
    purchasedToolIds: [],
    // A fresh save owns NO control. The window will not move, the sliders will not slide and
    // the stepper offers ×1 alone, until each is bought (control-unlocks.ts).
    controlUnlocks: createInitialControlUnlocksState(),
    lastTickAtIso: nowIsoString,
    lastSavedAtIso: nowIsoString,
  };
}
