import { bnCompare, bnFromNumber, bnToNumber, type BigNum } from "./big-number.js";
import type { GameState, PrestigeState } from "./types.js";

/** +1% total production per ascension point. This is the single source of truth for the
 * prestige bonus formula — upgrades.ts#computeMultipliers imports it rather than redefining it. */
export function prestigeMultiplierFor(ascensionPoints: number): number {
  return 1 + ascensionPoints * 0.01;
}

/**
 * Ascension points earned for a given lifetime cookie total, using the genre-standard
 * cube-root-of-(lifetime/1e12) curve, floored to a whole number.
 */
export function ascensionValue(lifetimeCookies: BigNum): number {
  const divided = bnToNumber(lifetimeCookies) / 1e12;
  if (divided <= 0) return 0;
  const points = Math.pow(divided, 1 / 3);
  return Math.max(0, Math.floor(points));
}

export interface PrestigeResult {
  readonly state: GameState;
  readonly pointsEarned: number;
}

/**
 * Resets cookies, generators, and non-permanent upgrades. Preserves ascension points,
 * permanent unlocks, achievements, and stats.
 */
export function performPrestige(state: GameState): PrestigeResult {
  const pointsEarned = ascensionValue(state.lifetimeCookies);

  const nextPrestige: PrestigeState = {
    ascensionPoints: state.prestige.ascensionPoints + pointsEarned,
    totalPrestigeCount: state.prestige.totalPrestigeCount + 1,
    permanentUnlockIds: state.prestige.permanentUnlockIds,
  };

  const zero = bnFromNumber(0);

  const nextState: GameState = {
    ...state,
    cookies: zero,
    lifetimeCookies: zero,
    generators: state.generators.map((g) => ({ ...g, count: 0 })),
    upgrades: state.upgrades.filter((owned) =>
      state.prestige.permanentUnlockIds.includes(owned.id),
    ),
    prestige: nextPrestige,
    // achievements and stats are preserved untouched.
  };

  return { state: nextState, pointsEarned };
}

/** True once base cookies is nonzero, used to gate whether prestige can be triggered at all. */
export function canPrestige(state: GameState): boolean {
  return bnCompare(state.lifetimeCookies, bnFromNumber(1e12)) >= 0;
}
