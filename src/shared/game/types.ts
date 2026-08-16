import type { BigNum } from "./big-number.js";

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
  readonly permanentUnlockIds: readonly string[];
}

export interface GameStats {
  readonly totalClicks: number;
  readonly totalCookiesBaked: BigNum;
  /** Times a negative or otherwise nonsensical wall-clock delta was observed and rejected. */
  readonly clockAnomalyCount: number;
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
  readonly stats: GameStats;

  /**
   * Player-facing switch for the Tools tech tree's progression gate (see tools.ts). When
   * true (the default), a tool's gameplay bonus is active only once its unlock condition is
   * met. When false, every tool's bonus is treated as active regardless of condition. This
   * NEVER affects whether the underlying application feature is reachable — see
   * tools.ts#ToolDefinition.gatesApplicationFeature.
   */
  readonly toolProgressionEnabled: boolean;

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
