/* ------------------------------------------------------------------------------------------
 * Random events: a scheduler and a pool of six events that interrupt an ordinary session at
 * random-but-bounded intervals.
 *
 * This module is the SECOND random-event system in the game and it deliberately does not
 * replace the first. golden-cookie.ts owns the golden cookie — one overlay, three effects, its
 * own five-to-fifteen-minute window — and it keeps owning it. What lives here is the general
 * case the owner asked for: "random events happening in random times", a pool of distinct
 * events with real durations, real arithmetic, and one of them a genuine risk rather than a
 * present.
 *
 * Everything about it is borrowed from golden-cookie.ts on purpose, because that module already
 * settled the two questions that matter:
 *
 *   - RANDOMNESS IS A PORT. `Math.random()` is never called here. Every roll — when the next
 *     event is eligible, which event it is — comes from an injected `RngPort`, and the port's
 *     stream position is persisted, so a save/load cycle resumes the same schedule instead of
 *     re-rolling the player's luck. Seed it and the whole timeline replays exactly, which is
 *     what makes a scheduler unit-testable at all.
 *   - TIME IS AN ARGUMENT. No `Date.now()` anywhere in this file. Epoch milliseconds arrive as
 *     `nowEpochMs` from the reducer's clock port, the same one the tick loop already drives.
 *
 * The reducer is still the only mutation seam. Nothing here writes state; every function takes
 * a `RandomEventsState` and returns a new one, and the reducer decides what to do with it.
 * ---------------------------------------------------------------------------------------- */
import { z } from "zod";

import { bnAdd, bnFromNumber, bnMulScalar, type BigNum } from "./big-number.js";
import { totalCps } from "./cps.js";
import { computeMultipliers } from "./upgrades.js";
import type { GameState, RngPort } from "./types.js";

/* ------------------------------------------------------------------- the event pool */

export type RandomEventId =
  | "cookie_rain"
  | "grandmas_batch"
  | "oven_hiccup"
  | "sugar_rush"
  | "lucky_crumb"
  | "market_day";

/**
 * How an event behaves in time.
 *
 *   - `instant`  — pays out the moment it spawns and is over. It still gets announced and
 *                  still shows in the toast; it simply never becomes the "active" event, so it
 *                  cannot block the next roll for its whole duration (it has none).
 *   - `timed`    — occupies the active slot until `endsAtEpochMs`, applying a multiplier the
 *                  whole time. Expiry is what resolves it; the player does nothing.
 *   - `clickable`— occupies the active slot AND puts real buttons on the stage. Cookie Rain's
 *                  drops are worth cookies; Oven Hiccup's single button is worth ending the
 *                  penalty early. Both still resolve on expiry if the player ignores them.
 */
export type RandomEventShape = "instant" | "timed" | "clickable";

export interface RandomEventDefinition {
  readonly id: RandomEventId;
  readonly nameEn: string;
  readonly nameYue: string;
  readonly blurbEn: string;
  readonly blurbYue: string;
  readonly shape: RandomEventShape;
  /** Zero for `instant` events. */
  readonly durationMs: number;
  /**
   * Relative likelihood in the weighted draw. The two pure-windfall events are common and the
   * risk event is rare, because an interruption that TAKES something should be the one the
   * player remembers, not the one they resent.
   */
  readonly weight: number;
  /** How many clickable targets the event puts on the stage. Zero for everything else. */
  readonly targetCount: number;
  /** Multiplier applied to production for as long as the event is active. */
  readonly cpsMultiplier: number;
  /** Multiplier applied to click value for as long as the event is active. */
  readonly clickMultiplier: number;
  /** Fraction of a purchase handed back while the event is active (Market Day). */
  readonly rebateFraction: number;
  /** True when the event costs the player something. Drives the warning styling and copy. */
  readonly isSetback: boolean;
}

export const RANDOM_EVENT_DEFINITIONS: readonly RandomEventDefinition[] = [
  {
    id: "cookie_rain",
    nameEn: "Cookie Rain",
    nameYue: "曲奇雨",
    blurbEn: "Cookies are falling. Catch them before they hit the counter.",
    blurbYue: "有曲奇跌緊落嚟，落到枱面之前接住佢。",
    shape: "clickable",
    durationMs: 20_000,
    weight: 3,
    targetCount: 12,
    cpsMultiplier: 1,
    clickMultiplier: 1,
    rebateFraction: 0,
    isSetback: false,
  },
  {
    id: "grandmas_batch",
    nameEn: "Grandma's Surprise Batch",
    nameYue: "嫲嫲嘅驚喜一爐",
    blurbEn: "A whole tray arrives unannounced.",
    blurbYue: "無啦啦送咗成盤過嚟。",
    shape: "instant",
    durationMs: 0,
    weight: 3,
    targetCount: 0,
    cpsMultiplier: 1,
    clickMultiplier: 1,
    rebateFraction: 0,
    isSetback: false,
  },
  {
    id: "oven_hiccup",
    nameEn: "Oven Hiccup",
    nameYue: "焗爐打思噎",
    blurbEn: "The oven is sulking and output is down. Thump it to fix it.",
    blurbYue: "焗爐鬧脾氣，產量跌咗。拍佢一下就得。",
    shape: "clickable",
    durationMs: 30_000,
    weight: 2,
    targetCount: 1,
    cpsMultiplier: 0.4,
    clickMultiplier: 1,
    rebateFraction: 0,
    isSetback: true,
  },
  {
    id: "sugar_rush",
    nameEn: "Sugar Rush",
    nameYue: "糖分上頭",
    blurbEn: "Every click lands seven times as hard.",
    blurbYue: "每一下撳都重七倍。",
    shape: "timed",
    durationMs: 15_000,
    weight: 3,
    targetCount: 0,
    cpsMultiplier: 1,
    clickMultiplier: 7,
    rebateFraction: 0,
    isSetback: false,
  },
  {
    id: "lucky_crumb",
    nameEn: "Lucky Crumb",
    nameYue: "好彩餅碎",
    blurbEn: "Something small was found under the counter.",
    blurbYue: "喺枱底執到少少嘢。",
    shape: "instant",
    durationMs: 0,
    weight: 4,
    targetCount: 0,
    cpsMultiplier: 1,
    clickMultiplier: 1,
    rebateFraction: 0,
    isSetback: false,
  },
  {
    id: "market_day",
    nameEn: "Market Day",
    nameYue: "趁墟日",
    blurbEn: "The supplier is in a good mood. Purchases come back part-refunded.",
    blurbYue: "供應商今日心情好，買嘢有錢回。",
    shape: "timed",
    durationMs: 60_000,
    weight: 3,
    targetCount: 0,
    cpsMultiplier: 1,
    clickMultiplier: 1,
    rebateFraction: 0.15,
    isSetback: false,
  },
];

const DEFINITIONS_BY_ID = new Map(RANDOM_EVENT_DEFINITIONS.map((d) => [d.id, d]));

export function getRandomEventDefinition(id: RandomEventId): RandomEventDefinition {
  const def = DEFINITIONS_BY_ID.get(id);
  if (!def) throw new Error(`Unknown random event id: ${id}`);
  return def;
}

/* -------------------------------------------------------------------- payout tuning */

export interface RandomEventPayoutConfig {
  /** Seconds of current production each caught rain drop is worth. */
  readonly rainDropCpsSeconds: number;
  /** Clicks' worth of value each caught rain drop is ALSO worth, so rain pays on a fresh save. */
  readonly rainDropClicks: number;
  /** Seconds of current production Grandma's batch pays instantly. */
  readonly grandmasBatchCpsSeconds: number;
  /** Seconds of current production a Lucky Crumb pays instantly. */
  readonly luckyCrumbCpsSeconds: number;
  /** Flat cookies a Lucky Crumb pays on top, so it is never worth exactly nothing. */
  readonly luckyCrumbFlatCookies: number;
}

export const DEFAULT_RANDOM_EVENT_PAYOUTS: RandomEventPayoutConfig = {
  rainDropCpsSeconds: 20,
  rainDropClicks: 15,
  grandmasBatchCpsSeconds: 600,
  luckyCrumbCpsSeconds: 90,
  luckyCrumbFlatCookies: 25,
};

/* ---------------------------------------------------------------- scheduler config */

export interface RandomEventConfig {
  /** Lower bound of the gap between one event resolving and the next becoming eligible. */
  readonly minDelayMs: number;
  readonly maxDelayMs: number;
  /**
   * A flat quiet period added on top of the rolled delay. The rolled delay alone already has a
   * lower bound, but the cooldown is a separate, explicit promise: whatever the dice say, there
   * is always at least this much ordinary play between two events.
   */
  readonly cooldownMs: number;
  readonly payouts: RandomEventPayoutConfig;
}

export const DEFAULT_RANDOM_EVENT_CONFIG: RandomEventConfig = {
  minDelayMs: 3 * 60 * 1000,
  maxDelayMs: 10 * 60 * 1000,
  cooldownMs: 60 * 1000,
  payouts: DEFAULT_RANDOM_EVENT_PAYOUTS,
};

/**
 * The developer-only fast schedule.
 *
 * Photographing an event that fires once every three to ten minutes is not a thing a capture
 * run can wait for, so the spawn window is overridable. It is deliberately NOT a settings row
 * and NOT a button in the game: shipping a "spawn an event now" control would turn a random
 * event into a vending machine. Instead the renderer reads one localStorage key at startup —
 * `material-cookie-clicker:events:fast` — and passes the resulting config into the reducer
 * context. A player who never sets that key can never reach this schedule.
 */
export const FAST_RANDOM_EVENT_CONFIG: RandomEventConfig = {
  minDelayMs: 2_000,
  maxDelayMs: 6_000,
  cooldownMs: 1_000,
  payouts: DEFAULT_RANDOM_EVENT_PAYOUTS,
};

/** The localStorage key (and env var name) that selects the fast schedule. */
export const FAST_RANDOM_EVENTS_FLAG = "material-cookie-clicker:events:fast";

/**
 * Pure resolver for that flag, so the decision is tested rather than trusted. Any value other
 * than the exact string "1" or "true" leaves the shipped schedule in place.
 */
export function resolveRandomEventConfig(flagValue: string | null | undefined): RandomEventConfig {
  if (flagValue === "1" || flagValue === "true") return FAST_RANDOM_EVENT_CONFIG;
  return DEFAULT_RANDOM_EVENT_CONFIG;
}

/* ------------------------------------------------------------------------- the state */

export interface ActiveRandomEvent {
  readonly id: RandomEventId;
  readonly startedAtEpochMs: number;
  readonly endsAtEpochMs: number;
  /** Clickable targets not yet taken, by id (`rain:0`… / `oven:fix`). Empty for timed events. */
  readonly pendingTargetIds: readonly string[];
  /** How many targets the player has taken so far. */
  readonly claimedCount: number;
}

export interface ResolvedRandomEvent {
  readonly id: RandomEventId;
  readonly resolvedAtEpochMs: number;
  readonly claimedCount: number;
  /** True when the player ended it themselves rather than letting the clock run out. */
  readonly endedEarly: boolean;
}

export interface RandomEventsState {
  readonly active: ActiveRandomEvent | null;
  /** Wall-clock instant the scheduler may next roll a spawn. */
  readonly nextEligibleAtEpochMs: number;
  /** PRNG stream position, persisted so the schedule survives save/load unchanged. */
  readonly rngStreamIndex: number;
  /** The most recently finished event, kept only so the UI can name it in a toast. */
  readonly lastResolved: ResolvedRandomEvent | null;
  /** Lifetime count of events that have spawned. A statistic, and nothing depends on it. */
  readonly spawnCount: number;
}

export function createInitialRandomEventsState(): RandomEventsState {
  return {
    active: null,
    nextEligibleAtEpochMs: 0,
    rngStreamIndex: 0,
    lastResolved: null,
    spawnCount: 0,
  };
}

/* ------------------------------------------------------------------ persistence seam */

/**
 * This module carries its OWN save schema rather than adding a field to save-schema.ts.
 *
 * That is not squeamishness about touching a shared file: it is what keeps the format
 * backward-compatible without a version bump. Random-event state is entirely derivable from
 * "nothing has happened yet" — an older save simply had no events, and
 * `createInitialRandomEventsState()` is the honest reading of it. So the field is optional on
 * disk, defaulted on read, and a save written by this build still loads in a build without it
 * (the unknown key is ignored). save-codec.ts calls the two functions below and nothing else
 * knows this state is stored at all.
 */
const ActiveRandomEventSchema = z.object({
  id: z.enum(["cookie_rain", "grandmas_batch", "oven_hiccup", "sugar_rush", "lucky_crumb", "market_day"]),
  startedAtEpochMs: z.number(),
  endsAtEpochMs: z.number(),
  pendingTargetIds: z.array(z.string()),
  claimedCount: z.number().int().nonnegative(),
});

export const RandomEventsStateSchema = z.object({
  active: ActiveRandomEventSchema.nullable(),
  nextEligibleAtEpochMs: z.number(),
  rngStreamIndex: z.number().int().nonnegative(),
  lastResolved: z
    .object({
      id: ActiveRandomEventSchema.shape.id,
      resolvedAtEpochMs: z.number(),
      claimedCount: z.number().int().nonnegative(),
      endedEarly: z.boolean(),
    })
    .nullable(),
  spawnCount: z.number().int().nonnegative(),
});

/** JSON-safe form of the state. Structurally identical; typed separately so it can diverge. */
export type RandomEventsSaveData = z.infer<typeof RandomEventsStateSchema>;

export function encodeRandomEvents(state: RandomEventsState): RandomEventsSaveData {
  return {
    active: state.active
      ? { ...state.active, pendingTargetIds: [...state.active.pendingTargetIds] }
      : null,
    nextEligibleAtEpochMs: state.nextEligibleAtEpochMs,
    rngStreamIndex: state.rngStreamIndex,
    lastResolved: state.lastResolved ? { ...state.lastResolved } : null,
    spawnCount: state.spawnCount,
  };
}

/**
 * Reads the field back off raw save data. Anything unreadable — absent, wrong shape, written by
 * a build that stored something else here — becomes a fresh scheduler rather than an error,
 * because a save is never worth refusing over an event that was going to expire anyway.
 */
export function decodeRandomEvents(raw: unknown): RandomEventsState {
  if (raw === undefined || raw === null) return createInitialRandomEventsState();
  const parsed = RandomEventsStateSchema.safeParse(raw);
  if (!parsed.success) return createInitialRandomEventsState();
  return parsed.data;
}

/* --------------------------------------------------------------------- the scheduler */

function rollDelayMs(rng: RngPort, config: RandomEventConfig): number {
  const span = Math.max(0, config.maxDelayMs - config.minDelayMs);
  return config.minDelayMs + Math.floor(rng.next() * span);
}

/** Weighted draw over the pool. Weights are small integers; the walk is exact, not float-fuzzy. */
export function pickRandomEventId(rng: RngPort): RandomEventId {
  const totalWeight = RANDOM_EVENT_DEFINITIONS.reduce((sum, d) => sum + d.weight, 0);
  let roll = rng.next() * totalWeight;
  for (const def of RANDOM_EVENT_DEFINITIONS) {
    roll -= def.weight;
    if (roll < 0) return def.id;
  }
  return RANDOM_EVENT_DEFINITIONS[RANDOM_EVENT_DEFINITIONS.length - 1].id;
}

function targetIdsFor(def: RandomEventDefinition): readonly string[] {
  if (def.id === "cookie_rain") {
    return Array.from({ length: def.targetCount }, (_, index) => `rain:${index}`);
  }
  if (def.id === "oven_hiccup") return ["oven:fix"];
  return [];
}

/** Schedules the next eligible instant: the flat cooldown plus a rolled delay on top. */
function scheduleNext(nowEpochMs: number, rng: RngPort, config: RandomEventConfig): number {
  return nowEpochMs + config.cooldownMs + rollDelayMs(rng, config);
}

export interface RandomEventTickResult {
  readonly randomEvents: RandomEventsState;
  /** Cookies an instant event paid out during this tick. Zero when nothing spawned. */
  readonly instantBonus: BigNum;
}

/**
 * ONE tick of the scheduler. Called from the reducer's tick handler with the same clock and the
 * same RngPort instance the golden cookie uses, so both systems advance one shared stream.
 *
 * The rules, in the order they are applied:
 *
 *   1. An active event past its end time resolves. Nothing else can happen on the same tick as
 *      a resolution — the cooldown starts at that instant, so the earliest the next event can
 *      appear is `cooldownMs + minDelayMs` later.
 *   2. While an event is active, no roll happens at all. Two events are never on screen
 *      together, ever; this is the property the tests pin down.
 *   3. While a golden cookie is on screen (`blocked`), no roll happens either. The two random
 *      systems are separate, but the STAGE is not, and a golden cookie plus a cookie rain is
 *      two overlays fighting for the same click.
 *   4. Otherwise, if the clock has reached `nextEligibleAtEpochMs`, one event is drawn.
 *      An instant event pays out and immediately re-schedules; a timed or clickable one takes
 *      the active slot.
 */
export function tickRandomEvents(
  state: RandomEventsState,
  gameState: GameState,
  nowEpochMs: number,
  rng: RngPort,
  options: { readonly blocked: boolean; readonly config?: RandomEventConfig },
): RandomEventTickResult {
  const config = options.config ?? DEFAULT_RANDOM_EVENT_CONFIG;
  const zero = bnFromNumber(0);

  // 1 — expiry.
  if (state.active !== null && nowEpochMs >= state.active.endsAtEpochMs) {
    return {
      randomEvents: {
        active: null,
        nextEligibleAtEpochMs: scheduleNext(nowEpochMs, rng, config),
        rngStreamIndex: rng.getStreamIndex(),
        lastResolved: {
          id: state.active.id,
          resolvedAtEpochMs: nowEpochMs,
          claimedCount: state.active.claimedCount,
          endedEarly: false,
        },
        spawnCount: state.spawnCount,
      },
      instantBonus: zero,
    };
  }

  // 2 and 3 — no overlap, and not over a golden cookie.
  if (state.active !== null) return { randomEvents: state, instantBonus: zero };
  if (options.blocked) return { randomEvents: state, instantBonus: zero };

  // 4 — the window.
  if (nowEpochMs < state.nextEligibleAtEpochMs) return { randomEvents: state, instantBonus: zero };

  const id = pickRandomEventId(rng);
  const def = getRandomEventDefinition(id);

  if (def.shape === "instant") {
    return {
      randomEvents: {
        active: null,
        nextEligibleAtEpochMs: scheduleNext(nowEpochMs, rng, config),
        rngStreamIndex: rng.getStreamIndex(),
        lastResolved: { id, resolvedAtEpochMs: nowEpochMs, claimedCount: 0, endedEarly: false },
        spawnCount: state.spawnCount + 1,
      },
      instantBonus: instantPayout(id, gameState, config.payouts),
    };
  }

  return {
    randomEvents: {
      active: {
        id,
        startedAtEpochMs: nowEpochMs,
        endsAtEpochMs: nowEpochMs + def.durationMs,
        pendingTargetIds: targetIdsFor(def),
        claimedCount: 0,
      },
      nextEligibleAtEpochMs: state.nextEligibleAtEpochMs,
      rngStreamIndex: rng.getStreamIndex(),
      lastResolved: state.lastResolved,
      spawnCount: state.spawnCount + 1,
    },
    instantBonus: zero,
  };
}

/* ------------------------------------------------------------------------ arithmetic */

/** What a single click of the cookie is worth right now, before any event multiplier. */
function baseClickValue(gameState: GameState): BigNum {
  return bnMulScalar(gameState.baseClickValue, computeMultipliers(gameState).clickMultiplier);
}

/** The payout of an instant event, in cookies. Zero for anything that is not instant. */
export function instantPayout(
  id: RandomEventId,
  gameState: GameState,
  payouts: RandomEventPayoutConfig = DEFAULT_RANDOM_EVENT_PAYOUTS,
): BigNum {
  const cps = totalCps(gameState);
  switch (id) {
    case "grandmas_batch":
      return bnMulScalar(cps, payouts.grandmasBatchCpsSeconds);
    case "lucky_crumb":
      return bnAdd(bnMulScalar(cps, payouts.luckyCrumbCpsSeconds), bnFromNumber(payouts.luckyCrumbFlatCookies));
    default:
      return bnFromNumber(0);
  }
}

/**
 * What one caught rain drop is worth: a fixed slice of production PLUS a fixed number of
 * clicks. The click half is what makes the event mean something on a save with no generators
 * yet, where a share of production would be a share of zero.
 */
export function rainDropPayout(
  gameState: GameState,
  payouts: RandomEventPayoutConfig = DEFAULT_RANDOM_EVENT_PAYOUTS,
): BigNum {
  return bnAdd(
    bnMulScalar(totalCps(gameState), payouts.rainDropCpsSeconds),
    bnMulScalar(baseClickValue(gameState), payouts.rainDropClicks),
  );
}

/* ------------------------------------------------------- live modifiers (read by the reducer) */

function activeDefinition(state: RandomEventsState, nowEpochMs: number): RandomEventDefinition | null {
  if (!state.active) return null;
  if (nowEpochMs >= state.active.endsAtEpochMs) return null;
  return getRandomEventDefinition(state.active.id);
}

/** Production multiplier from the active event: 1 when nothing is running. */
export function randomEventCpsMultiplier(state: RandomEventsState, nowEpochMs: number): number {
  return activeDefinition(state, nowEpochMs)?.cpsMultiplier ?? 1;
}

/** Click-value multiplier from the active event: 1 when nothing is running. */
export function randomEventClickMultiplier(state: RandomEventsState, nowEpochMs: number): number {
  return activeDefinition(state, nowEpochMs)?.clickMultiplier ?? 1;
}

/**
 * Market Day's rebate, as a fraction of what a purchase actually cost.
 *
 * A REBATE, not a discount, and the distinction is deliberate. Every price the shop prints
 * comes from one place (generators.ts / upgrades.ts / tool-shop.ts) and the Tools tech tree
 * already applies a discount at that seam. Threading a second, timed discount through the same
 * arithmetic would mean the price on the card and the price at the till disagree for sixty
 * seconds. So Market Day does not touch pricing at all: the player pays the printed price, and
 * the reducer hands a slice of it straight back afterwards. The shop stays honest and the
 * effect stays real.
 */
export function randomEventRebateFraction(state: RandomEventsState, nowEpochMs: number): number {
  return activeDefinition(state, nowEpochMs)?.rebateFraction ?? 0;
}

/** Milliseconds left on the active event, floored at zero. Drives the HUD's remaining-time bar. */
export function remainingMs(state: RandomEventsState, nowEpochMs: number): number {
  if (!state.active) return 0;
  return Math.max(0, state.active.endsAtEpochMs - nowEpochMs);
}

/** Fraction of the active event's duration still to run, in [0, 1]. */
export function remainingFraction(state: RandomEventsState, nowEpochMs: number): number {
  if (!state.active) return 0;
  const total = state.active.endsAtEpochMs - state.active.startedAtEpochMs;
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, remainingMs(state, nowEpochMs) / total));
}

/* ------------------------------------------------------------------------- clicking */

export interface RandomEventClickResult {
  readonly randomEvents: RandomEventsState;
  readonly bonus: BigNum;
  /** False when the click hit nothing real (stale target, expired event, wrong id). */
  readonly claimed: boolean;
}

/**
 * A click on one of the event's own targets.
 *
 * Refuses silently, in the same shape as every purchase in the reducer, when the target is not
 * actually there — a rain drop already taken, an event already over, an id from a stale render.
 * A refused click returns the state unchanged and `claimed: false`, and the reducer turns that
 * into a no-op, so a double-fired pointer event cannot pay twice.
 */
export function clickRandomEventTarget(
  state: RandomEventsState,
  gameState: GameState,
  targetId: string,
  nowEpochMs: number,
  rng: RngPort,
  config: RandomEventConfig = DEFAULT_RANDOM_EVENT_CONFIG,
): RandomEventClickResult {
  const zero = bnFromNumber(0);
  const active = state.active;
  if (!active) return { randomEvents: state, bonus: zero, claimed: false };
  if (nowEpochMs >= active.endsAtEpochMs) return { randomEvents: state, bonus: zero, claimed: false };
  if (!active.pendingTargetIds.includes(targetId)) return { randomEvents: state, bonus: zero, claimed: false };

  const pendingTargetIds = active.pendingTargetIds.filter((id) => id !== targetId);
  const claimedCount = active.claimedCount + 1;

  // Oven Hiccup's one button ENDS the event: that is the whole point of it being a risk the
  // player can answer rather than a penalty they sit through. It pays nothing — getting the
  // production penalty off early is the reward.
  if (active.id === "oven_hiccup") {
    return {
      randomEvents: {
        active: null,
        nextEligibleAtEpochMs: scheduleNext(nowEpochMs, rng, config),
        rngStreamIndex: rng.getStreamIndex(),
        lastResolved: { id: active.id, resolvedAtEpochMs: nowEpochMs, claimedCount, endedEarly: true },
        spawnCount: state.spawnCount,
      },
      bonus: zero,
      claimed: true,
    };
  }

  const bonus = rainDropPayout(gameState, config.payouts);

  // Catching the last drop finishes the rain early rather than leaving an empty sky up for the
  // rest of the window.
  if (pendingTargetIds.length === 0) {
    return {
      randomEvents: {
        active: null,
        nextEligibleAtEpochMs: scheduleNext(nowEpochMs, rng, config),
        rngStreamIndex: rng.getStreamIndex(),
        lastResolved: { id: active.id, resolvedAtEpochMs: nowEpochMs, claimedCount, endedEarly: true },
        spawnCount: state.spawnCount,
      },
      bonus,
      claimed: true,
    };
  }

  return {
    randomEvents: {
      ...state,
      active: { ...active, pendingTargetIds, claimedCount },
    },
    bonus,
    claimed: true,
  };
}

/** Clears the finished-event record, so the toast naming it can be dismissed. */
export function clearLastResolved(state: RandomEventsState): RandomEventsState {
  if (state.lastResolved === null) return state;
  return { ...state, lastResolved: null };
}
