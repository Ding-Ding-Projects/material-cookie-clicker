import { ACHIEVEMENT_DEFINITIONS } from "./achievements.js";
import type { GameState } from "./types.js";

/**
 * MILK.
 *
 * Milk is not a currency, not a resource and not a thing the player spends. It is a pure
 * function of one number — how many achievements are unlocked — and it exists so that the
 * achievement list stops being a trophy cabinet and starts being a production stat.
 *
 * Every unlocked achievement pours 4% more milk into the cabinet. That number is the single
 * source of truth for the tide's height, for its flavour band, and for how much every kitten
 * upgrade in upgrades.ts is worth. Nothing here is stored in a save: recomputing it from
 * `state.achievements.length` is cheaper than persisting it, and it can never drift.
 *
 * Milk on its own multiplies nothing. It is inert until a kitten upgrade is bought, and each
 * kitten converts milk into CPS at its own rate (see KITTEN_UPGRADE_DEFINITIONS). A player who
 * buys no kittens has a very full, very decorative cabinet.
 */

/** Milk poured per unlocked achievement, as a percentage. */
export const MILK_PERCENT_PER_ACHIEVEMENT = 4;

/**
 * How high the tide is allowed to draw. Milk itself is uncapped — a kitten keeps paying well
 * past this — but the cabinet only has so much glass, so the DRAWING stops here.
 *
 * 400% rather than 100%: with 201 badges in the roster a modest run is already past 100%, and a
 * tide that reaches the top of the glass in the first hour tells the player nothing for the rest
 * of the game. A full glass at 400% keeps the level readable across a whole run.
 */
export const MILK_DISPLAY_CAP_PERCENT = 400;

/** Raw milk percentage for a count of unlocked achievements. Uncapped, by design. */
export function milkPercentForAchievements(unlockedCount: number): number {
  if (!Number.isFinite(unlockedCount) || unlockedCount <= 0) return 0;
  return unlockedCount * MILK_PERCENT_PER_ACHIEVEMENT;
}

/** Milk percentage for a game state. The one call site every surface should use. */
export function milkPercent(state: GameState): number {
  return milkPercentForAchievements(state.achievements.length);
}

/** Height of the drawn tide, 0..1, clamped to the cabinet glass. */
export function milkTideFraction(state: GameState): number {
  return Math.min(1, milkPercent(state) / MILK_DISPLAY_CAP_PERCENT);
}

/** The milk percentage a fully-100%-completed achievement list would produce. */
export function maximumMilkPercent(): number {
  return milkPercentForAchievements(ACHIEVEMENT_DEFINITIONS.length);
}

export interface MilkBand {
  /** Lowest milk percentage that pours this flavour. Bands are listed low to high. */
  readonly fromPercent: number;
  readonly nameEn: string;
  readonly nameYue: string;
  /** The liquid's own colour, as a CSS colour literal; the gradient is built around it. */
  readonly tint: string;
}

/**
 * The flavour ladder. Plain milk first, then the tea-restaurant shelf: this is a Hong Kong
 * bakery, so the milks it pours are the ones a cha chaan teng actually keeps behind the
 * counter, and the last two are the jokes the counter would make about them.
 */
export const MILK_BANDS: readonly MilkBand[] = [
  { fromPercent: 0, nameEn: "Plain Milk", nameYue: "淨牛奶", tint: "#f6f1e4" },
  { fromPercent: 20, nameEn: "Chocolate Milk", nameYue: "朱古力奶", tint: "#8b5a33" },
  { fromPercent: 40, nameEn: "Milk Tea", nameYue: "絲襪奶茶", tint: "#a9703c" },
  { fromPercent: 60, nameEn: "Yuenyeung", nameYue: "鴛鴦", tint: "#7a4a24" },
  { fromPercent: 80, nameEn: "Malted Milk", nameYue: "好立克", tint: "#c08a4a" },
  { fromPercent: 120, nameEn: "Condensed Milk", nameYue: "煉奶", tint: "#efd9a4" },
  { fromPercent: 180, nameEn: "Double-Skin Milk", nameYue: "雙皮奶", tint: "#fbf3d8" },
  { fromPercent: 260, nameEn: "Wong Tai Sin Milk", nameYue: "黃大仙奶", tint: "#ffd98a" },
  { fromPercent: 360, nameEn: "Milk That Should Not Exist", nameYue: "唔應該存在嘅奶", tint: "#c8a2ff" },
];

/** The band pouring at a given milk percentage. Never null — 0% is Plain Milk. */
export function milkBandForPercent(percent: number): MilkBand {
  let band = MILK_BANDS[0]!;
  for (const candidate of MILK_BANDS) {
    if (percent >= candidate.fromPercent) band = candidate;
  }
  return band;
}

export function milkBandFor(state: GameState): MilkBand {
  return milkBandForPercent(milkPercent(state));
}

/**
 * What one kitten is worth. `strength` is the kitten's own rate: a strength of 1 turns 100%
 * milk into a ×2 on total production, a strength of 0.5 into ×1.5. Kittens compose
 * multiplicatively with each other in computeMultipliers, exactly like every other upgrade.
 */
export function kittenMultiplier(strength: number, percent: number): number {
  if (percent <= 0) return 1;
  return 1 + (percent / 100) * strength;
}
