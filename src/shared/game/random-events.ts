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
 *
 * THE MOUSE RAID sits alongside that pool rather than inside it. It is the owner's "rare event,
 * every hour": mice scurry across the stage, each one the player fails to whack carries off a
 * share of up to eighty per cent of the balance, and whacking all of them pays a small bonus
 * instead. It has its own once-an-hour clock and its own fairness rails (not in a fresh save's
 * first ten minutes, not below a thousand cookies, not against a window nobody is looking at),
 * but it takes the SAME active slot as everything else here, so "never two events at once" and
 * "never over a golden cookie" cost it nothing to obey.
 *
 * WHAT A RAID TAKES, AND WHAT IT DOES NOT. The theft comes off `cookies` — the balance — and
 * never off `lifetimeCookies` or `stats.totalCookiesBaked`. Those two are HISTORY: they record
 * what this save has ever baked, they gate achievements and the prestige projection, and a
 * mouse eating a biscuit does not un-bake it. Letting a raid rewind them would also make the
 * raid quietly retroactive — revoking achievements and ascension points hours after the fact —
 * which is a far worse punishment than the one the player agreed to. So the raid is expensive
 * and it is survivable, and nothing it does can move a number that only ever goes up.
 * ---------------------------------------------------------------------------------------- */
import { z } from "zod";

import { bnAdd, bnCompare, bnFromNumber, bnMulScalar, type BigNum } from "./big-number.js";
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
  | "market_day"
  /**
   * THE MOUSE RAID — the one event that is not in the common pool.
   *
   * Everything else in this file is drawn from one weighted bag every three to ten minutes.
   * The raid is not: it is rare by the clock rather than rare by the dice, on its own
   * fifty-to-seventy-five-minute schedule ("roughly hourly", which is what the owner asked
   * for), and it can take up to eighty per cent of the balance. An eighty-per-cent loss that
   * shares a bag with Lucky Crumb would either be so light it is not a raid or so frequent it
   * is a punishment, so it gets its own clock and the pool keeps its weights.
   *
   * It still shares the ACTIVE SLOT with the pool, which is the property that matters: two
   * events are never on screen at once, and a golden cookie still blocks it, because those
   * rules live on the slot rather than on the schedule.
   */
  | "mouse_raid";

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

/**
 * The Mouse Raid's definition, deliberately NOT a member of `RANDOM_EVENT_DEFINITIONS`.
 *
 * That array is the weighted bag `pickRandomEventId` draws from, and the raid must never be
 * drawn from it — it arrives on its own hourly clock instead (see `tickRandomEvents`). Keeping
 * it out of the array rather than giving it weight zero means the bag cannot accidentally
 * produce it if someone later changes how the walk works. Its `weight` is therefore zero and
 * means "not in the draw", not "very unlikely".
 *
 * `targetCount` is the CEILING, not the count: a raid spawns three to five mice, rolled when it
 * fires (`MOUSE_RAID_MIN_MICE`..`MOUSE_RAID_MAX_MICE`). Five is what the field records so that
 * anything reading the pool for "how many buttons can this event put on screen" gets the truth.
 */
export const MOUSE_RAID_DEFINITION: RandomEventDefinition = {
  id: "mouse_raid",
  nameEn: "Mouse Raid",
  nameYue: "老鼠打劫",
  blurbEn: "Mice are on the counter. Whack every one before they carry the jar off.",
  blurbYue: "有老鼠爬上枱。趁佢哋未搬走個曲奇罌，逐隻拍走佢。",
  shape: "clickable",
  durationMs: 20_000,
  weight: 0,
  targetCount: 5,
  cpsMultiplier: 1,
  clickMultiplier: 1,
  rebateFraction: 0,
  isSetback: true,
};

/** Fewest and most mice one raid can bring. */
export const MOUSE_RAID_MIN_MICE = 3;
export const MOUSE_RAID_MAX_MICE = 5;

/** Every event this module knows about, pool plus raid. Lookups use this; the draw does not. */
export const ALL_RANDOM_EVENT_DEFINITIONS: readonly RandomEventDefinition[] = [
  ...RANDOM_EVENT_DEFINITIONS,
  MOUSE_RAID_DEFINITION,
];

const DEFINITIONS_BY_ID = new Map(ALL_RANDOM_EVENT_DEFINITIONS.map((d) => [d.id, d]));

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
  /**
   * Seconds of current production paid for chasing off EVERY mouse in a raid.
   *
   * A defended raid pays, and it is deliberately modest: the real reward for whacking all five
   * mice is the eighty per cent of the balance that did not leave. This is the tip on top, so
   * that a perfect defence is visibly better than a raid that never happened rather than merely
   * identical to it.
   */
  readonly raidDefendedCpsSeconds: number;
  /** Flat cookies a fully-defended raid pays on top, so early saves get something real. */
  readonly raidDefendedFlatCookies: number;
}

export const DEFAULT_RANDOM_EVENT_PAYOUTS: RandomEventPayoutConfig = {
  rainDropCpsSeconds: 20,
  rainDropClicks: 15,
  grandmasBatchCpsSeconds: 600,
  luckyCrumbCpsSeconds: 90,
  luckyCrumbFlatCookies: 25,
  raidDefendedCpsSeconds: 120,
  raidDefendedFlatCookies: 250,
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
  /* ---------------------------------------------------------------- the raid's own clock */
  /**
   * The Mouse Raid's window, measured from the last raid (or from the first tick of a save) to
   * the next: THIRTY TO SIXTY MINUTES, drawn uniformly across the whole band.
   *
   * The band is what makes the raid unpredictable, and it is doing real work. A raid drawn
   * uniformly over a thirty-minute span means that at any moment during that span the player
   * has no better guess than "some time in the next half hour"; there is no interval a mental
   * clock can count down, and knowing exactly when the last raid ended tells you nothing
   * useful about the next one beyond the band itself. Nothing narrower is ever exposed.
   */
  readonly raidMinDelayMs: number;
  readonly raidMaxDelayMs: number;
  /**
   * A small second draw applied on top of the band draw and clamped back inside the band.
   *
   * Being honest about what this is and is not: it does NOT widen the distribution and it is
   * not where the unpredictability comes from — the band and the per-session entropy seed are.
   * What it does is stop a delay from being one single PRNG value, so a schedule can never be
   * pinned down from one observed gap plus a known seed, and it breaks any alignment between
   * the rolled delay and the fixed quantities around it (the raid's own duration, the pool's
   * cooldown, the tick period).
   */
  readonly raidJitterMs: number;
  /**
   * A floor under the FIRST raid of a save. A fresh save's opening minutes are the tutorial by
   * another name, and a raid there teaches the wrong lesson. The rolled window is already far
   * longer than this under the shipped config; the floor is what makes the promise true under
   * any config, including the developer-only fast one.
   */
  readonly raidFreshGraceMs: number;
  /**
   * Below this balance a raid does not fire at all. Eighty per cent of four hundred cookies is
   * not a robbery, it is noise — and it is noise aimed at exactly the player least able to read
   * a new mechanic. The raid waits (it does not re-roll) until the counter is worth raiding.
   */
  readonly raidMinCookies: number;
  /** The most a raid can ever take, as a fraction of the CURRENT balance. Reached only when
   *  every mouse escapes. */
  readonly raidStealCeiling: number;
  readonly payouts: RandomEventPayoutConfig;
}

export const DEFAULT_RANDOM_EVENT_CONFIG: RandomEventConfig = {
  minDelayMs: 3 * 60 * 1000,
  maxDelayMs: 10 * 60 * 1000,
  cooldownMs: 60 * 1000,
  raidMinDelayMs: 30 * 60 * 1000,
  raidMaxDelayMs: 60 * 60 * 1000,
  raidJitterMs: 90 * 1000,
  raidFreshGraceMs: 10 * 60 * 1000,
  raidMinCookies: 1_000,
  raidStealCeiling: 0.8,
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
  // The raid keeps its hour under the fast flag. "Fast" is about the pool; a capture that wants
  // the raid asks for the raid explicitly, below.
  raidMinDelayMs: DEFAULT_RANDOM_EVENT_CONFIG.raidMinDelayMs,
  raidMaxDelayMs: DEFAULT_RANDOM_EVENT_CONFIG.raidMaxDelayMs,
  raidJitterMs: DEFAULT_RANDOM_EVENT_CONFIG.raidJitterMs,
  raidFreshGraceMs: DEFAULT_RANDOM_EVENT_CONFIG.raidFreshGraceMs,
  raidMinCookies: DEFAULT_RANDOM_EVENT_CONFIG.raidMinCookies,
  raidStealCeiling: DEFAULT_RANDOM_EVENT_CONFIG.raidStealCeiling,
  payouts: DEFAULT_RANDOM_EVENT_PAYOUTS,
};

/**
 * The developer-only RAID schedule, and the honest reason it exists.
 *
 * A Mouse Raid fires about once an hour and lasts twenty seconds. Photographing one on the real
 * schedule means sitting on a running capture desktop for an hour hoping the shutter and the
 * mice coincide. So the same single localStorage key that already shortens the pool's window
 * accepts one more value — `raid` — which shortens the RAID's window instead and quiets the
 * pool, so a capture run sees mice and nothing else.
 *
 * It is the same deal as the fast flag and it comes with the same limits: no button, no
 * settings row, no in-game way to reach it. A raid the player can summon is not a raid, and a
 * pool event landing on top of the capture would only produce a misleading picture.
 *
 * The MIN-COOKIES and never-two-at-once rules are NOT relaxed here. A capture that had to
 * disable the game's fairness rails to get a picture would be a picture of something the player
 * cannot see.
 */
export const RAID_CAPTURE_EVENT_CONFIG: RandomEventConfig = {
  // Effectively never: the pool is quiet so the raid is what lands.
  minDelayMs: 1_000_000_000,
  maxDelayMs: 1_000_000_000,
  cooldownMs: 1_000,
  raidMinDelayMs: 3_000,
  raidMaxDelayMs: 6_000,
  raidJitterMs: 500,
  raidFreshGraceMs: 0,
  raidMinCookies: DEFAULT_RANDOM_EVENT_CONFIG.raidMinCookies,
  raidStealCeiling: DEFAULT_RANDOM_EVENT_CONFIG.raidStealCeiling,
  payouts: DEFAULT_RANDOM_EVENT_PAYOUTS,
};

/** The localStorage key (and env var name) that selects a developer schedule. */
export const FAST_RANDOM_EVENTS_FLAG = "material-cookie-clicker:events:fast";

/**
 * Pure resolver for that flag, so the decision is tested rather than trusted. Any value other
 * than the exact strings "1", "true" (fast pool) or "raid" (fast raid, quiet pool) leaves the
 * shipped schedule in place.
 */
export function resolveRandomEventConfig(flagValue: string | null | undefined): RandomEventConfig {
  if (flagValue === "raid") return RAID_CAPTURE_EVENT_CONFIG;
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

/**
 * What one finished Mouse Raid did, kept so the aftermath toast can state it exactly.
 *
 * `stolen` is the cookies that actually left the balance, computed at the instant the raid
 * ended, so the toast prints the real figure rather than re-deriving a percentage of a number
 * that has since moved.
 */
export interface MouseRaidOutcome {
  readonly resolvedAtEpochMs: number;
  readonly miceTotal: number;
  readonly miceWhacked: number;
  readonly miceEscaped: number;
  readonly stolen: BigNum;
  /** The defended bonus, paid only when `defended` is true. Zero otherwise. */
  readonly reward: BigNum;
  /** True when every mouse was whacked: nothing was taken and the bonus was paid. */
  readonly defended: boolean;
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
  /**
   * The Mouse Raid's own next-eligible instant, separate from the pool's because the raid is on
   * its own hourly clock. Zero means "never scheduled" — the first tick of a save seeds it, and
   * that seeding is what enforces the fresh-save grace period.
   */
  readonly raidNextEligibleAtEpochMs: number;
  /** The most recent raid's result, kept only so the aftermath toast can state what happened. */
  readonly lastRaid: MouseRaidOutcome | null;
  /** Lifetime count of raids that have fired. A statistic; nothing depends on it. */
  readonly raidCount: number;
}

export function createInitialRandomEventsState(): RandomEventsState {
  return {
    active: null,
    nextEligibleAtEpochMs: 0,
    rngStreamIndex: 0,
    lastResolved: null,
    spawnCount: 0,
    raidNextEligibleAtEpochMs: 0,
    lastRaid: null,
    raidCount: 0,
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
const RandomEventIdSchema = z.enum([
  "cookie_rain",
  "grandmas_batch",
  "oven_hiccup",
  "sugar_rush",
  "lucky_crumb",
  "market_day",
  "mouse_raid",
]);

const RaidBigNumSchema = z.object({ mantissa: z.number(), exponent: z.number() });

const ActiveRandomEventSchema = z.object({
  id: RandomEventIdSchema,
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
  /* The three raid fields are OPTIONAL with defaults, for the same reason this whole block is
     optional in the save: a save written before the raid existed is not corrupt, it is a save
     from a game where no raid had ever happened, and that reads exactly as "unscheduled, none
     yet, zero". Making them required would throw away a perfectly good pool schedule on the
     first load after an update. */
  raidNextEligibleAtEpochMs: z.number().default(0),
  lastRaid: z
    .object({
      resolvedAtEpochMs: z.number(),
      miceTotal: z.number().int().nonnegative(),
      miceWhacked: z.number().int().nonnegative(),
      miceEscaped: z.number().int().nonnegative(),
      stolen: RaidBigNumSchema,
      reward: RaidBigNumSchema,
      defended: z.boolean(),
    })
    .nullable()
    .default(null),
  raidCount: z.number().int().nonnegative().default(0),
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
    raidNextEligibleAtEpochMs: state.raidNextEligibleAtEpochMs,
    lastRaid: state.lastRaid
      ? { ...state.lastRaid, stolen: { ...state.lastRaid.stolen }, reward: { ...state.lastRaid.reward } }
      : null,
    raidCount: state.raidCount,
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

/**
 * The delay to the next raid: a uniform draw across the whole thirty-to-sixty-minute band, plus
 * a small independent jitter, clamped back inside the band so the advertised bounds are the
 * real bounds. Exported because a distribution nobody can test is a claim rather than a
 * property.
 */
export function rollRaidDelayMs(rng: RngPort, config: RandomEventConfig): number {
  const span = Math.max(0, config.raidMaxDelayMs - config.raidMinDelayMs);
  const base = config.raidMinDelayMs + rng.next() * span;
  const jitter = (rng.next() * 2 - 1) * config.raidJitterMs;
  const clamped = Math.min(config.raidMaxDelayMs, Math.max(config.raidMinDelayMs, base + jitter));
  return Math.round(clamped);
}

/**
 * When the NEXT raid becomes eligible: one rolled delay, floored by the fresh-save grace. The
 * floor is why the first raid of a save can never land in the opening ten minutes, whatever the
 * window is set to.
 */
function scheduleNextRaid(nowEpochMs: number, rng: RngPort, config: RandomEventConfig): number {
  return nowEpochMs + Math.max(config.raidFreshGraceMs, rollRaidDelayMs(rng, config));
}

/** How many mice this raid brings: three to five, rolled when it fires. */
export function rollMouseCount(rng: RngPort): number {
  const span = MOUSE_RAID_MAX_MICE - MOUSE_RAID_MIN_MICE + 1;
  return MOUSE_RAID_MIN_MICE + Math.min(span - 1, Math.floor(rng.next() * span));
}

/** The mice of one raid, as target ids. */
export function mouseTargetIds(count: number): readonly string[] {
  return Array.from({ length: count }, (_, index) => `mouse:${index}`);
}

/**
 * WHAT A RAID TAKES.
 *
 *   stolen = cookies × ceiling × escaped / total
 *
 * so one mouse of five getting away costs sixteen per cent and all five cost the full eighty.
 * It is scaled by escapes rather than being all-or-nothing on purpose: a raid you nearly
 * stopped should cost nearly nothing, and a player who whacked four of five has visibly bought
 * themselves four fifths of their balance back.
 *
 * The multiplier is on the CURRENT balance, which is what the owner asked for ("80% of
 * cookies") and is also the only reading that stays fair as a save grows — a flat number would
 * be a catastrophe early and a rounding error late.
 */
export function mouseRaidTheft(
  cookies: BigNum,
  escaped: number,
  total: number,
  ceiling: number = DEFAULT_RANDOM_EVENT_CONFIG.raidStealCeiling,
): BigNum {
  if (total <= 0 || escaped <= 0) return bnFromNumber(0);
  const fraction = ceiling * (Math.min(escaped, total) / total);
  return bnMulScalar(cookies, fraction);
}

/** What chasing off every mouse pays. */
export function mouseRaidDefenceReward(
  gameState: GameState,
  payouts: RandomEventPayoutConfig = DEFAULT_RANDOM_EVENT_PAYOUTS,
): BigNum {
  return bnAdd(
    bnMulScalar(totalCps(gameState), payouts.raidDefendedCpsSeconds),
    bnFromNumber(payouts.raidDefendedFlatCookies),
  );
}

export interface RandomEventTickResult {
  readonly randomEvents: RandomEventsState;
  /** Cookies an instant event paid out during this tick. Zero when nothing spawned. */
  readonly instantBonus: BigNum;
  /**
   * Set on the tick a Mouse Raid expires with mice still loose. The reducer takes
   * `raidTheft.stolen` off the BALANCE and nothing else — see the note on `handleTick`.
   */
  readonly raidTheft: MouseRaidOutcome | null;
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
  options: {
    readonly blocked: boolean;
    readonly config?: RandomEventConfig;
    /**
     * True when the game window is hidden or minimised.
     *
     * THE CLOCK IS NOT PAUSED BY THIS, and that is deliberate. Every timestamp in this game is
     * wall-clock epoch milliseconds, and offline-progress.ts credits a player for time the app
     * was not even running; inventing a second, visibility-aware clock just for the raid would
     * make two parts of the same save disagree about what "an hour" is. So an active raid keeps
     * running out on the ordinary clock.
     *
     * What this flag DOES do is stop a raid from STARTING against a window nobody is looking
     * at. Eligibility is deferred, not re-rolled: the raid fires on the first tick after the
     * window comes back, so the twenty seconds the player gets to whack are twenty seconds they
     * could actually see. That is a spawn rule, not a clock rule.
     */
    readonly hidden?: boolean;
  },
): RandomEventTickResult {
  const config = options.config ?? DEFAULT_RANDOM_EVENT_CONFIG;
  const zero = bnFromNumber(0);
  const quiet = { randomEvents: state, instantBonus: zero, raidTheft: null } as const;

  // 1 — expiry.
  if (state.active !== null && nowEpochMs >= state.active.endsAtEpochMs) {
    const expired = state.active;
    const resolved = {
      id: expired.id,
      resolvedAtEpochMs: nowEpochMs,
      claimedCount: expired.claimedCount,
      endedEarly: false,
    };

    // A raid that runs out with mice still loose is the only expiry in the game that COSTS
    // something. Its own clock restarts; the pool gets a plain cooldown so the player is not
    // robbed and then immediately interrupted again.
    if (expired.id === "mouse_raid") {
      const miceEscaped = expired.pendingTargetIds.length;
      const miceTotal = miceEscaped + expired.claimedCount;
      const outcome: MouseRaidOutcome = {
        resolvedAtEpochMs: nowEpochMs,
        miceTotal,
        miceWhacked: expired.claimedCount,
        miceEscaped,
        stolen: mouseRaidTheft(gameState.cookies, miceEscaped, miceTotal, config.raidStealCeiling),
        reward: zero,
        defended: false,
      };
      return {
        randomEvents: {
          ...state,
          active: null,
          nextEligibleAtEpochMs: Math.max(state.nextEligibleAtEpochMs, nowEpochMs + config.cooldownMs),
          rngStreamIndex: rng.getStreamIndex(),
          lastResolved: resolved,
          raidNextEligibleAtEpochMs: scheduleNextRaid(nowEpochMs, rng, config),
          lastRaid: outcome,
        },
        instantBonus: zero,
        raidTheft: outcome,
      };
    }

    return {
      randomEvents: {
        ...state,
        active: null,
        nextEligibleAtEpochMs: scheduleNext(nowEpochMs, rng, config),
        rngStreamIndex: rng.getStreamIndex(),
        lastResolved: resolved,
      },
      instantBonus: zero,
      raidTheft: null,
    };
  }

  // 2 and 3 — no overlap, and not over a golden cookie. Both rules live on the ACTIVE SLOT, so
  // the raid inherits them for free by taking that same slot.
  if (state.active !== null) return quiet;
  if (options.blocked) return quiet;

  // 4 — the raid's own clock, checked before the pool's so that on the rare tick where both are
  // due, the once-an-hour event wins over the once-every-few-minutes one.
  if (state.raidNextEligibleAtEpochMs === 0) {
    // First sight of this save: seed the raid clock and spawn nothing. The seed carries the
    // fresh-save grace, which is why a brand new save cannot be raided in its opening minutes.
    return {
      randomEvents: {
        ...state,
        raidNextEligibleAtEpochMs: scheduleNextRaid(nowEpochMs, rng, config),
        rngStreamIndex: rng.getStreamIndex(),
      },
      instantBonus: zero,
      raidTheft: null,
    };
  }

  if (nowEpochMs >= state.raidNextEligibleAtEpochMs) {
    const richEnough = bnCompare(gameState.cookies, bnFromNumber(config.raidMinCookies)) >= 0;
    // Both guards DEFER rather than re-roll: the raid stays due and lands on the first tick
    // where the window is visible and the counter is worth raiding.
    if (!options.hidden && richEnough) {
      const count = rollMouseCount(rng);
      return {
        randomEvents: {
          ...state,
          active: {
            id: "mouse_raid",
            startedAtEpochMs: nowEpochMs,
            endsAtEpochMs: nowEpochMs + MOUSE_RAID_DEFINITION.durationMs,
            pendingTargetIds: mouseTargetIds(count),
            claimedCount: 0,
          },
          rngStreamIndex: rng.getStreamIndex(),
          spawnCount: state.spawnCount + 1,
          raidCount: state.raidCount + 1,
        },
        instantBonus: zero,
        raidTheft: null,
      };
    }
  }

  // 5 — the pool's window.
  if (nowEpochMs < state.nextEligibleAtEpochMs) return quiet;

  const id = pickRandomEventId(rng);
  const def = getRandomEventDefinition(id);

  if (def.shape === "instant") {
    return {
      randomEvents: {
        ...state,
        active: null,
        nextEligibleAtEpochMs: scheduleNext(nowEpochMs, rng, config),
        rngStreamIndex: rng.getStreamIndex(),
        lastResolved: { id, resolvedAtEpochMs: nowEpochMs, claimedCount: 0, endedEarly: false },
        spawnCount: state.spawnCount + 1,
      },
      instantBonus: instantPayout(id, gameState, config.payouts),
      raidTheft: null,
    };
  }

  return {
    randomEvents: {
      ...state,
      active: {
        id,
        startedAtEpochMs: nowEpochMs,
        endsAtEpochMs: nowEpochMs + def.durationMs,
        pendingTargetIds: targetIdsFor(def),
        claimedCount: 0,
      },
      rngStreamIndex: rng.getStreamIndex(),
      spawnCount: state.spawnCount + 1,
    },
    instantBonus: zero,
    raidTheft: null,
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

  // A MOUSE. Whacking one pays nothing on its own — what it buys is the share of the balance
  // that mouse was going to carry off, which is a number the player never sees leave. Whacking
  // the LAST one ends the raid early, banks a defended outcome for the aftermath toast, and
  // pays the defence bonus.
  if (active.id === "mouse_raid") {
    const miceTotal = active.pendingTargetIds.length + active.claimedCount;
    if (pendingTargetIds.length > 0) {
      return {
        randomEvents: { ...state, active: { ...active, pendingTargetIds, claimedCount } },
        bonus: zero,
        claimed: true,
      };
    }
    const reward = mouseRaidDefenceReward(gameState, config.payouts);
    return {
      randomEvents: {
        ...state,
        active: null,
        nextEligibleAtEpochMs: Math.max(state.nextEligibleAtEpochMs, nowEpochMs + config.cooldownMs),
        rngStreamIndex: rng.getStreamIndex(),
        lastResolved: { id: active.id, resolvedAtEpochMs: nowEpochMs, claimedCount, endedEarly: true },
        raidNextEligibleAtEpochMs: scheduleNextRaid(nowEpochMs, rng, config),
        lastRaid: {
          resolvedAtEpochMs: nowEpochMs,
          miceTotal,
          miceWhacked: claimedCount,
          miceEscaped: 0,
          stolen: zero,
          reward,
          defended: true,
        },
      },
      bonus: reward,
      claimed: true,
    };
  }

  // Oven Hiccup's one button ENDS the event: that is the whole point of it being a risk the
  // player can answer rather than a penalty they sit through. It pays nothing — getting the
  // production penalty off early is the reward.
  if (active.id === "oven_hiccup") {
    return {
      randomEvents: {
        ...state,
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
        ...state,
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

/**
 * Clears the finished-raid record, so the aftermath toast can be dismissed.
 *
 * Separate from `clearLastResolved` because the two toasts are separate: the marquee names an
 * event as it lands, and the aftermath states what a raid cost or saved. Dismissing one should
 * not silently swallow the other.
 */
export function clearLastRaid(state: RandomEventsState): RandomEventsState {
  if (state.lastRaid === null) return state;
  return { ...state, lastRaid: null };
}

/** Mice still loose in the active raid, for the HUD's remaining count. Zero when none is on. */
export function miceRemaining(state: RandomEventsState): number {
  if (!state.active || state.active.id !== "mouse_raid") return 0;
  return state.active.pendingTargetIds.length;
}

/** Clears the finished-event record, so the toast naming it can be dismissed. */
export function clearLastResolved(state: RandomEventsState): RandomEventsState {
  if (state.lastResolved === null) return state;
  return { ...state, lastResolved: null };
}
