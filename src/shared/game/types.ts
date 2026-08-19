import type { BigNum } from "./big-number.js";
import type { RandomEventsState } from "./random-events.js";
import type { ControlUnlocksState } from "./control-unlocks.js";
import type { DieselFactoryState } from "./diesel-factory.js";
import type { HomeConstructionState } from "./home-construction.js";
import type {
  GoldenTokenLedger,
  LuckyChanceState,
  MinigameScheduleState,
  MinigameState,
} from "./minigames.js";

/** Small discrete counters use plain `number` — see big-number.ts header comment for why. */

export interface OwnedGenerator {
  readonly id: string;
  readonly count: number;
}

export interface OwnedUpgrade {
  readonly id: string;
  readonly purchasedAtTickCount: number;
}

export interface UnlockedAchievement {
  readonly id: string;
  readonly unlockedAtIso: string;
}

export interface GoldenCookieEffectState {
  readonly kind: "frenzy" | "clickFrenzy" | "windfall";
  /** Epoch ms the effect expires; absent for instantaneous effects like windfall. */
  readonly expiresAtEpochMs?: number;
  readonly multiplier?: number;
}

/**
 * THE OVEN DIAL — the minigame a CAUGHT golden cookie opens.
 *
 * A needle sweeps back and forth across a dial. Press to stop it inside the golden zone. Three
 * rounds redeem the cookie, and the zone narrows and the needle speeds up each round on a FIXED
 * curve (golden-cookie.ts#GOLDEN_DIAL_ROUNDS) that is identical for every player and every save.
 *
 * IT IS A MINIGAME, NOT A CHANCE GAME, by owner decree: "golden cookie puzzle must be a
 * minigame, not a chance game." Nothing about the outcome is rolled. The needle's position is an
 * exact, pure function of how long the round has been running, so a press either was or was not
 * inside the zone, and the same press at the same moment always lands the same way. The one
 * seeded value here is where on the dial the zone SITS — and that cannot decide a round, because
 * the zone is drawn on screen before the player presses. Moving a visible target is scenery, not
 * luck.
 *
 * This replaced Odd Cookie Out, a 4x4 "spot the different tile" grid whose fields (`oddIndex`,
 * `variant`) are deleted. That game failed the decree: with the odd tile seeded and the grid
 * scanned rather than timed, a lucky first press won a round outright.
 *
 * The older standing decree — "the user must press it 10 times to redeem, not auto redeem" — is
 * still honoured in spirit: one press to catch the sprite plus at least three timed presses, and
 * a miss costs seconds and another press, so redemption is never one click and never automatic.
 */
export interface GoldenDialState {
  /** Rounds won so far: 0, 1 or 2 while the dial is open; 3 redeems and closes it. */
  readonly roundsWon: number;
  /** Where the golden zone's centre sits on the track, 0..1. The one seeded value, and visible. */
  readonly zoneCentre: number;
  /** When the current round's sweep started. The needle's position is derived from this alone. */
  readonly roundStartedAtEpochMs: number;
  /** Misses in the CURRENT dial, across all its rounds. Each one burned window seconds. */
  readonly misses: number;
  /**
   * Whether this dial runs in STEPPED mode: the needle advances in discrete ticks at a slower
   * cadence rather than sweeping continuously. Set once, at the catch, from the player's
   * `prefers-reduced-motion` setting, and persisted — so the position the reducer evaluates is
   * always exactly the position the player was shown. Still pure skill: it is the same dial, the
   * same zone and the same three rounds, played to a rhythm instead of to a glide.
   */
  readonly stepped: boolean;
}

export interface GoldenCookieState {
  /** Whether a golden cookie is currently spawned and waiting to be clicked. */
  readonly isSpawned: boolean;
  /**
   * Where the spawned sprite sits on the game stage, as percentages of the stage box. Drawn from
   * the seeded rng at spawn and persisted, so the cookie does not teleport across a re-render or
   * a save/load. Absent while nothing is spawned.
   */
  readonly spawnXPct?: number;
  readonly spawnYPct?: number;
  /** The open Oven Dial, if the sprite has been caught. Absent while it is still on the loose. */
  readonly dial?: GoldenDialState;
  readonly spawnedAtEpochMs?: number;
  /** PRNG stream position, so the seeded schedule survives save/load without re-seeding. */
  readonly rngStreamIndex: number;
  readonly activeEffect?: GoldenCookieEffectState;
  readonly nextEligibleAtEpochMs: number;
}

export interface PrestigeState {
  readonly ascensionPoints: number;
  readonly totalPrestigeCount: number;
  /**
   * Upgrade ids the player has PINNED as permanent, so a reset cannot take them. The number of
   * pins allowed is itself bought in the Reborn tree (reborn.ts#rebornPermanentSlots); an empty
   * list is the honest default, and always was.
   */
  readonly permanentUnlockIds: readonly string[];
  /**
   * Reborn tree nodes bought with ascension points (reborn.ts). Outside the run entirely: never
   * reset, never refunded. Optional on the type because a save written before the tree existed
   * simply has none, and every reader defaults it to an empty list rather than inventing one.
   */
  readonly rebornNodeIds?: readonly string[];
}

export interface GameStats {
  readonly totalClicks: number;
  readonly totalCookiesBaked: BigNum;
  /** Times a negative or otherwise nonsensical wall-clock delta was observed and rejected. */
  readonly clockAnomalyCount: number;
}

/**
 * The Diesel Depot's running totals (diesel-exchange.ts). These are the GAME's memory of what
 * the player bought — the vouchers themselves live in a file outside this application, written
 * by the main process, and are never mirrored into save state. `vouchersMinted` therefore
 * counts what this save asked for; it deliberately does NOT claim anything about what WinForge
 * has since consumed, which only the ledger file itself can answer.
 */
export interface DieselDepotState {
  /**
   * Lifetime litres shipped out as vouchers. Cookies no longer buy these: the litres are
   * MANUFACTURED by the diesel factory (diesel-factory.ts) and this counter records how many of
   * them left for WinForge.
   */
  readonly litresMinted: number;
  readonly vouchersMinted: number;
  /**
   * Lifetime cookies attributed to shipped diesel — the amortized share of what was spent on
   * factory equipment and factory upgrades (diesel-factory.ts#amortizedCookiesFor). It is no
   * longer a purchase price, because there is no longer a purchase.
   */
  readonly cookiesSpent: BigNum;
}

export interface GameState {
  readonly schemaVersion: number;

  readonly cookies: BigNum;
  readonly lifetimeCookies: BigNum;

  /** Base click value before multipliers are applied; derived multipliers live in computeMultipliers. */
  readonly baseClickValue: BigNum;

  readonly generators: readonly OwnedGenerator[];
  readonly upgrades: readonly OwnedUpgrade[];
  readonly achievements: readonly UnlockedAchievement[];

  readonly prestige: PrestigeState;
  readonly goldenCookie: GoldenCookieState;

  /**
   * The general random-event scheduler and whatever it currently has on screen — see
   * random-events.ts. Separate from `goldenCookie` on purpose: the golden cookie is one
   * specific overlay with its own window and its own three effects, and this is the pool of
   * sixteen events (plus the separately-clocked Mouse Raid, which is deliberately not in the
   * draw) that interrupt play around it. The two share the reducer's RngPort and clock,
   * and the scheduler declines to roll while a golden cookie is up, so the stage never has two
   * random things on it at once.
   */
  readonly randomEvents: RandomEventsState;

  readonly stats: GameStats;
  readonly dieselDepot: DieselDepotState;
  /**
   * The diesel factory: the nested production economy that actually makes the litres the depot
   * ships (diesel-factory.ts). Ticks on the same wall clock as the cookie side, through the
   * same one reducer seam.
   */
  readonly dieselFactory: DieselFactoryState;

  /**
   * The bakery-home: blueprints bought, rooms built, the one construction under way, and the
   * furniture in each finished room (home-construction.ts). The second nested subgame, and the
   * one that runs on elapsed construction time rather than on a production rate. Its coziness
   * total is a gentle multiplier on the whole cookie economy, folded in at the single
   * `computeMultipliers` seam like every other multiplier in the game.
   */
  readonly homeConstruction: HomeConstructionState;

  /** The permanently unlocked minigame suite and its seeded, persisted incoming schedule. */
  readonly minigames: MinigameState;
  readonly minigameSchedule: MinigameScheduleState | null;
  readonly goldenTokens: GoldenTokenLedger;
  readonly luckyChance: LuckyChanceState;
  /** Reward ids already granted by the Lucky Chance drawer (cosmetics, boosts, supplies). */
  readonly luckyRewards: readonly string[];

  /**
   * Player-facing switch for the Tools tech tree's progression gate (see tools.ts). When
   * true (the default), a tool's gameplay bonus is active only once its unlock condition is
   * met. When false, every tool's bonus is treated as active regardless of condition. This
   * NEVER affects whether the underlying application feature is reachable — see
   * tools.ts#ToolDefinition.gatesApplicationFeature.
   */
  readonly toolProgressionEnabled: boolean;

  /**
   * Ids of tools bought early with cookies through the Tools shop (see tool-shop.ts), skipping
   * their natural unlock condition. A purchased tool's gameplay bonus is active immediately and
   * stays active — see tools.ts#isToolBonusActive, which ORs this against the unlock condition.
   * Buying a tool is exactly like its condition being met early; it is still never a gate on the
   * real application feature, which tools.ts#ToolDefinition.gatesApplicationFeature keeps false.
   */
  readonly purchasedToolIds: readonly string[];

  /**
   * THE CONTROL ECONOMY (control-unlocks.ts): which of the application's own controls — the
   * settings entries, the window chrome, the search fields, the stepper rungs, the bulk toolbar,
   * the two feature toggles — have actually been bought with cookies.
   *
   * Optional on the type for exactly one reason: a state object built by a test helper or an
   * older code path may not carry it, and every reader in the codebase goes through
   * control-unlocks.ts, which defaults a missing subtree to "nothing bought". A save on disk
   * always has it — save-schema.ts v6 requires it.
   */
  readonly controlUnlocks?: ControlUnlocksState;

  /** ISO-8601 timestamp of the last tick that was actually applied. */
  readonly lastTickAtIso: string;
  /** ISO-8601 timestamp of the last successful save. */
  readonly lastSavedAtIso: string;
}

/** Ports: the reducer and offline-progress functions never call these directly, only via ctx. */
export interface RngPort {
  /** Returns a float in [0, 1). Must be a pure function of the port's own internal state. */
  next(): number;
  /** Opaque stream position, persisted so replay is deterministic across save/load. */
  getStreamIndex(): number;
}

export interface ClockPort {
  /** Epoch milliseconds. */
  now(): number;
}
