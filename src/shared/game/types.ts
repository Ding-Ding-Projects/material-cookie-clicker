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

/**
 * A tool bought from the Tool Shop (see tool-shop.ts). This is intentionally NOT yet threaded
 * through save-schema.ts/save-codec.ts/migrations.ts -- those files sit outside this lane's
 * allowed paths, so a state round-tripped through decodeSave()/encodeSave() today loses
 * `ownedTools` (schema strips unknown/missing fields; `saveDataToGameState`'s cast means it
 * simply comes back `undefined`). Every reader of `GameState.ownedTools` in this domain treats
 * `undefined` the same as `[]` defensively for exactly this reason. Persisting this field for
 * real requires a coordinated SAVE_SCHEMA_VERSION bump + migration entry, tracked as a known,
 * flagged follow-up rather than silently patched around here.
 */
export interface OwnedTool {
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

  /**
   * Tools bought from the Tool Shop -- see tool-shop.ts and OwnedTool's own doc comment above
   * for the persistence caveat. Optional at the type level (rather than always-present-but-
   * possibly-empty) precisely because a state decoded from an existing save predates this field
   * and will genuinely be missing it at runtime; every reader treats `undefined` as `[]`.
   */
  readonly ownedTools?: readonly OwnedTool[];

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

  /**
   * Ids of tools bought early with cookies through the Tools shop (see tool-shop.ts), skipping
   * their natural unlock condition. A purchased tool's gameplay bonus is active immediately and
   * stays active — see tools.ts#isToolBonusActive, which ORs this against the unlock condition.
   * Buying a tool is exactly like its condition being met early; it is still never a gate on the
   * real application feature, which tools.ts#ToolDefinition.gatesApplicationFeature keeps false.
   */
  readonly purchasedToolIds: readonly string[];

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
