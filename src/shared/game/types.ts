import type { BigNum } from "./big-number.js";
import type { RandomEventsState } from "./random-events.js";
import type { ControlUnlocksState } from "./control-unlocks.js";
import type { DieselFactoryState } from "./diesel-factory.js";

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

export interface GoldenCookieState {
  /** Whether a golden cookie is currently spawned and waiting to be clicked. */
  readonly isSpawned: boolean;
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
   * six events that interrupt play around it. The two share the reducer's RngPort and clock,
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
