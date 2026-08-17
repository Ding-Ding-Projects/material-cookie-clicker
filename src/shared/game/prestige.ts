import { bnCompare, bnFromNumber, bnToNumber, type BigNum } from "./big-number.js";
import { rebornRetainFraction, rebornStartingCookies } from "./reborn.js";
import type { GameState, OwnedUpgrade, PrestigeState } from "./types.js";

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
 * Which upgrades survive a reset.
 *
 * Two independent things keep an upgrade: it is PINNED (an explicit permanent slot bought in
 * the Reborn tree, which the player spent a point on and chose by hand), or it falls inside the
 * RETAINED slice that the memory branch bought. The retained slice is taken most-recent-first,
 * because the last upgrades a run bought are the deepest progress it made, and it is a whole
 * number of upgrades floored from the fraction — a 10% retention on nine upgrades keeps none,
 * and says so, rather than rounding a player up into a bonus they did not buy.
 */
export function survivingUpgrades(state: GameState): readonly OwnedUpgrade[] {
  const pinned = new Set(state.prestige.permanentUnlockIds);
  const fraction = rebornRetainFraction(state.prestige.rebornNodeIds ?? []);

  const unpinned = state.upgrades.filter((u) => !pinned.has(u.id));
  const keepCount = Math.floor(unpinned.length * fraction);
  const retained = new Set(
    [...unpinned]
      .sort((a, b) => b.purchasedAtTickCount - a.purchasedAtTickCount)
      .slice(0, keepCount)
      .map((u) => u.id),
  );

  return state.upgrades.filter((owned) => pinned.has(owned.id) || retained.has(owned.id));
}

/**
 * Resets cookies, generators, and non-surviving upgrades. Preserves ascension points, the
 * Reborn tree, pinned permanents, achievements, and stats. A new run may start with cookies
 * already in the jar if the inheritance branch was bought — those cookies count toward lifetime
 * as well, because they are real cookies the player will really spend.
 */
export function performPrestige(state: GameState): PrestigeResult {
  const pointsEarned = ascensionValue(state.lifetimeCookies);
  const rebornNodeIds = state.prestige.rebornNodeIds ?? [];

  const nextPrestige: PrestigeState = {
    ascensionPoints: state.prestige.ascensionPoints + pointsEarned,
    totalPrestigeCount: state.prestige.totalPrestigeCount + 1,
    permanentUnlockIds: state.prestige.permanentUnlockIds,
    rebornNodeIds,
  };

  const starting = rebornStartingCookies(rebornNodeIds);

  const nextState: GameState = {
    ...state,
    cookies: starting,
    lifetimeCookies: starting,
    generators: state.generators.map((g) => ({ ...g, count: 0 })),
    upgrades: survivingUpgrades(state),
    prestige: nextPrestige,
    // achievements and stats are preserved untouched.
  };

  return { state: nextState, pointsEarned };
}

/** True once base cookies is nonzero, used to gate whether prestige can be triggered at all. */
export function canPrestige(state: GameState): boolean {
  return bnCompare(state.lifetimeCookies, bnFromNumber(1e12)) >= 0;
}
