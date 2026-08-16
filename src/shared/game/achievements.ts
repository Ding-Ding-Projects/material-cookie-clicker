import { bnCompare, bnFromNumber, type BigNum } from "./big-number.js";
import { GENERATOR_DEFINITIONS } from "./generators.js";
import type { GameState } from "./types.js";

export type AchievementCondition =
  | { readonly kind: "lifetimeCookies"; readonly atLeast: BigNum }
  | { readonly kind: "totalClicks"; readonly atLeast: number }
  | { readonly kind: "generatorOwned"; readonly generatorId: string; readonly atLeast: number }
  | { readonly kind: "prestigeCount"; readonly atLeast: number };

export interface AchievementDefinition {
  readonly id: string;
  readonly nameEn: string;
  readonly nameYue: string;
  readonly condition: AchievementCondition;
}

const OWNED_COUNT_MILESTONES: readonly number[] = [1, 10, 25, 50, 100, 200];
const LIFETIME_COOKIE_MILESTONES: readonly number[] = [1, 100, 10000, 1000000, 1000000000, 1000000000000, 1e15];
const CLICK_MILESTONES: readonly number[] = [100, 1000, 10000, 100000];
const PRESTIGE_MILESTONES: readonly number[] = [1, 5, 10, 25];

function buildGeneratorOwnershipAchievements(): AchievementDefinition[] {
  const defs: AchievementDefinition[] = [];
  for (const gen of GENERATOR_DEFINITIONS) {
    for (const threshold of OWNED_COUNT_MILESTONES) {
      defs.push({
        id: `${gen.id}_owned_${threshold}`,
        nameEn: `${threshold} ${gen.nameEn}${threshold === 1 ? "" : "s"}`,
        nameYue: `${threshold} 個${gen.nameYue}`,
        condition: { kind: "generatorOwned", generatorId: gen.id, atLeast: threshold },
      });
    }
  }
  return defs;
}

function buildLifetimeCookieAchievements(): AchievementDefinition[] {
  return LIFETIME_COOKIE_MILESTONES.map((threshold) => ({
    id: `lifetime_${threshold}`,
    nameEn: `${threshold.toLocaleString("en-US")} Lifetime Cookies`,
    nameYue: `一生累積 ${threshold.toLocaleString("en-US")} 舊曲奇`,
    condition: { kind: "lifetimeCookies", atLeast: bnFromNumber(threshold) },
  }));
}

function buildClickAchievements(): AchievementDefinition[] {
  return CLICK_MILESTONES.map((threshold) => ({
    id: `clicks_${threshold}`,
    nameEn: `${threshold.toLocaleString("en-US")} Clicks`,
    nameYue: `撳咗 ${threshold.toLocaleString("en-US")} 下`,
    condition: { kind: "totalClicks", atLeast: threshold },
  }));
}

function buildPrestigeAchievements(): AchievementDefinition[] {
  return PRESTIGE_MILESTONES.map((threshold) => ({
    id: `prestige_${threshold}`,
    nameEn: `${threshold} Ascension${threshold === 1 ? "" : "s"}`,
    nameYue: `飛升 ${threshold} 次`,
    condition: { kind: "prestigeCount", atLeast: threshold },
  }));
}

export const ACHIEVEMENT_DEFINITIONS: readonly AchievementDefinition[] = [
  {
    id: "first_bite",
    nameEn: "First Bite",
    nameYue: "第一啖",
    condition: { kind: "lifetimeCookies", atLeast: bnFromNumber(1) },
  },
  ...buildGeneratorOwnershipAchievements(),
  ...buildLifetimeCookieAchievements(),
  ...buildClickAchievements(),
  ...buildPrestigeAchievements(),
];

function isConditionMet(condition: AchievementCondition, state: GameState): boolean {
  switch (condition.kind) {
    case "lifetimeCookies":
      return bnCompare(state.lifetimeCookies, condition.atLeast) >= 0;
    case "totalClicks":
      return state.stats.totalClicks >= condition.atLeast;
    case "generatorOwned": {
      const owned = state.generators.find((g) => g.id === condition.generatorId);
      return (owned?.count ?? 0) >= condition.atLeast;
    }
    case "prestigeCount":
      return state.prestige.totalPrestigeCount >= condition.atLeast;
  }
}

export function getAchievementDefinition(id: string): AchievementDefinition {
  const def = ACHIEVEMENT_DEFINITIONS.find((a) => a.id === id);
  if (!def) throw new RangeError(`Unknown achievement id: ${id}`);
  return def;
}

/** Returns the ids of achievements that are newly satisfied but not yet in state.achievements. */
export function evaluateAchievements(state: GameState): readonly string[] {
  const alreadyUnlocked = new Set(state.achievements.map((a) => a.id));
  const newlyUnlocked: string[] = [];

  for (const def of ACHIEVEMENT_DEFINITIONS) {
    if (alreadyUnlocked.has(def.id)) continue;
    if (isConditionMet(def.condition, state)) {
      newlyUnlocked.push(def.id);
    }
  }

  return newlyUnlocked;
}
