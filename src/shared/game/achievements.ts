import { bnCompare, bnFromNumber, type BigNum } from "./big-number.js";
import { GENERATOR_DEFINITIONS } from "./generators.js";
import type { GameState } from "./types.js";

export type AchievementCondition =
  | { readonly kind: "lifetimeCookies"; readonly atLeast: BigNum }
  | { readonly kind: "totalClicks"; readonly atLeast: number }
  | { readonly kind: "generatorOwned"; readonly generatorId: string; readonly atLeast: number }
  | { readonly kind: "prestigeCount"; readonly atLeast: number }
  /** Every machine on every rung, added together. Rewards breadth rather than one deep tier. */
  | { readonly kind: "totalGeneratorsOwned"; readonly atLeast: number }
  /** How many DISTINCT rungs of the ladder have at least one unit on them. */
  | { readonly kind: "generatorTypesOwned"; readonly atLeast: number }
  | { readonly kind: "upgradesOwned"; readonly atLeast: number }
  /** Achievements about achievements — which is also what pours the milk (milk.ts). */
  | { readonly kind: "achievementsUnlocked"; readonly atLeast: number }
  /** Nodes bought in the Reborn tree (reborn.ts). */
  | { readonly kind: "rebornNodesOwned"; readonly atLeast: number }
  /** Litres minted at the Diesel Depot (diesel-exchange.ts). */
  | { readonly kind: "dieselLitresMinted"; readonly atLeast: number }
  /**
   * Vouchers printed at the Diesel Depot. Kept separate from litres on purpose: a hundred
   * one-litre mints and one hundred-litre mint are not the same story about a player.
   */
  | { readonly kind: "dieselVouchersMinted"; readonly atLeast: number };

export interface AchievementDefinition {
  readonly id: string;
  readonly nameEn: string;
  readonly nameYue: string;
  readonly condition: AchievementCondition;
}

const OWNED_COUNT_MILESTONES: readonly number[] = [1, 10, 25, 50, 100, 200];
const LIFETIME_COOKIE_MILESTONES: readonly number[] = [
  1, 100, 10000, 1000000, 1000000000, 1000000000000, 1e15, 1e18, 1e21, 1e24, 1e27, 1e30, 1e33, 1e36,
];
const CLICK_MILESTONES: readonly number[] = [
  100, 1000, 10000, 100000, 250000, 500000, 1000000, 5000000, 10000000,
];
const PRESTIGE_MILESTONES: readonly number[] = [1, 5, 10, 25, 50, 100, 250];
/** Every machine on every rung, added together — the "wide bakery" ladder. */
const TOTAL_GENERATOR_MILESTONES: readonly number[] = [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
/** Distinct rungs occupied. The top entry is the whole ladder, so it can only be all of it. */
const GENERATOR_TYPE_MILESTONES: readonly number[] = [2, 5, 10, 14, 17, 21];
const UPGRADES_OWNED_MILESTONES: readonly number[] = [1, 5, 10, 25, 50, 75, 100, 125, 150];
/** Achievements about achievements — the milk ladder, one badge per flavour band. */
const ACHIEVEMENT_COUNT_MILESTONES: readonly number[] = [5, 10, 15, 20, 30, 45, 65, 90, 120, 150];
const REBORN_NODE_MILESTONES: readonly number[] = [1, 3, 5, 10, 15];
const DIESEL_LITRE_MILESTONES: readonly number[] = [1, 10, 50, 200, 1000, 5000];
const DIESEL_VOUCHER_MILESTONES: readonly number[] = [1, 10, 50, 200, 1000];

/** Bilingual titles for the badges that count badges — the milk ladder, in flavour order. */
const ACHIEVEMENT_COUNT_TITLES: Readonly<Record<number, { en: string; yue: string }>> = {
  5: { en: "A Splash of Milk", yue: "一啖奶" },
  10: { en: "Half a Glass", yue: "半杯奶" },
  15: { en: "Chocolate Poured", yue: "倒咗朱古力奶" },
  20: { en: "Milk Tea Brewed", yue: "沖起絲襪奶茶" },
  30: { en: "Yuenyeung Ordered", yue: "叫咗鴛鴦" },
  45: { en: "Malted and Warm", yue: "熱好立克" },
  65: { en: "Condensed and Sweet", yue: "甜到漏嘅煉奶" },
  90: { en: "Double-Skinned", yue: "雙皮奶到手" },
  120: { en: "Blessed at the Temple", yue: "廟裡求到奶" },
  150: { en: "Milk That Should Not Exist", yue: "唔應該存在嘅奶" },
};

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

function buildTotalGeneratorAchievements(): AchievementDefinition[] {
  return TOTAL_GENERATOR_MILESTONES.map((threshold) => ({
    id: `total_generators_${threshold}`,
    nameEn: `${threshold.toLocaleString("en-US")} Machines Under One Roof`,
    nameYue: `一間舖 ${threshold.toLocaleString("en-US")} 部機`,
    condition: { kind: "totalGeneratorsOwned", atLeast: threshold },
  }));
}

function buildGeneratorTypeAchievements(): AchievementDefinition[] {
  return GENERATOR_TYPE_MILESTONES.map((threshold) => ({
    id: `generator_types_${threshold}`,
    nameEn: `${threshold} Rungs of the Ladder`,
    nameYue: `爬到第 ${threshold} 級`,
    condition: { kind: "generatorTypesOwned", atLeast: threshold },
  }));
}

function buildUpgradesOwnedAchievements(): AchievementDefinition[] {
  return UPGRADES_OWNED_MILESTONES.map((threshold) => ({
    id: `upgrades_owned_${threshold}`,
    nameEn: `${threshold} Upgrade${threshold === 1 ? "" : "s"} Bought`,
    nameYue: `買咗 ${threshold} 個升級`,
    condition: { kind: "upgradesOwned", atLeast: threshold },
  }));
}

/**
 * The milk ladder. Each of these unlocks on a COUNT of other achievements, which means each one
 * also pours another 4% of milk itself (milk.ts) — a badge for having badges is exactly as
 * circular as it sounds, and that is the joke.
 */
function buildAchievementCountAchievements(): AchievementDefinition[] {
  return ACHIEVEMENT_COUNT_MILESTONES.map((threshold) => {
    const title = ACHIEVEMENT_COUNT_TITLES[threshold]!;
    return {
      id: `achievements_${threshold}`,
      nameEn: title.en,
      nameYue: title.yue,
      condition: { kind: "achievementsUnlocked", atLeast: threshold },
    };
  });
}

function buildRebornAchievements(): AchievementDefinition[] {
  return REBORN_NODE_MILESTONES.map((threshold) => ({
    id: `reborn_nodes_${threshold}`,
    nameEn: `${threshold} Reborn Node${threshold === 1 ? "" : "s"}`,
    nameYue: `轉生樹 ${threshold} 個節點`,
    condition: { kind: "rebornNodesOwned", atLeast: threshold },
  }));
}

/**
 * The Diesel Depot's badges, keyed to the depot's own counters only. They deliberately name no
 * module outside this domain: the vouchers live in a ledger file this application does not own,
 * and an achievement must never claim to know what happened to them after they were printed.
 */
function buildDieselAchievements(): AchievementDefinition[] {
  return [
    ...DIESEL_LITRE_MILESTONES.map((threshold) => ({
      id: `diesel_litres_${threshold}`,
      nameEn: `${threshold.toLocaleString("en-US")} Litre${threshold === 1 ? "" : "s"} Minted`,
      nameYue: `鑄咗 ${threshold.toLocaleString("en-US")} 公升`,
      condition: { kind: "dieselLitresMinted" as const, atLeast: threshold },
    })),
    ...DIESEL_VOUCHER_MILESTONES.map((threshold) => ({
      id: `diesel_vouchers_${threshold}`,
      nameEn: `${threshold.toLocaleString("en-US")} Voucher${threshold === 1 ? "" : "s"} Printed`,
      nameYue: `印咗 ${threshold.toLocaleString("en-US")} 張換油券`,
      condition: { kind: "dieselVouchersMinted" as const, atLeast: threshold },
    })),
  ];
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
  ...buildTotalGeneratorAchievements(),
  ...buildGeneratorTypeAchievements(),
  ...buildUpgradesOwnedAchievements(),
  ...buildAchievementCountAchievements(),
  ...buildRebornAchievements(),
  ...buildDieselAchievements(),
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
    case "totalGeneratorsOwned":
      return state.generators.reduce((sum, g) => sum + g.count, 0) >= condition.atLeast;
    case "generatorTypesOwned":
      return state.generators.filter((g) => g.count > 0).length >= condition.atLeast;
    case "upgradesOwned":
      return state.upgrades.length >= condition.atLeast;
    case "achievementsUnlocked":
      return state.achievements.length >= condition.atLeast;
    case "rebornNodesOwned":
      return (state.prestige.rebornNodeIds ?? []).length >= condition.atLeast;
    case "dieselLitresMinted":
      return state.dieselDepot.litresMinted >= condition.atLeast;
    case "dieselVouchersMinted":
      return state.dieselDepot.vouchersMinted >= condition.atLeast;
  }
}

export function getAchievementDefinition(id: string): AchievementDefinition {
  const def = ACHIEVEMENT_DEFINITIONS.find((a) => a.id === id);
  if (!def) throw new RangeError(`Unknown achievement id: ${id}`);
  return def;
}

/**
 * Returns the ids of achievements that are newly satisfied but not yet in state.achievements.
 *
 * Run to a FIXED POINT rather than in a single pass, because the milk ladder made achievements
 * self-referential: unlocking the twentieth badge is itself what satisfies "20 achievements".
 * A single pass would leave that badge sitting one tick behind the truth, and a player watching
 * the milk rise would see it stall for a second for no reason they could name. The loop is
 * bounded by the number of definitions, so it always terminates.
 */
export function evaluateAchievements(state: GameState): readonly string[] {
  const alreadyUnlocked = new Set(state.achievements.map((a) => a.id));
  const newlyUnlocked: string[] = [];
  let working = state;

  for (let pass = 0; pass < ACHIEVEMENT_DEFINITIONS.length; pass += 1) {
    const foundThisPass: string[] = [];
    for (const def of ACHIEVEMENT_DEFINITIONS) {
      if (alreadyUnlocked.has(def.id)) continue;
      if (isConditionMet(def.condition, working)) {
        alreadyUnlocked.add(def.id);
        foundThisPass.push(def.id);
      }
    }
    if (foundThisPass.length === 0) break;
    newlyUnlocked.push(...foundThisPass);
    // The next pass must see the badges this pass struck, or a count-of-badges condition can
    // never observe itself being satisfied.
    working = {
      ...working,
      achievements: [
        ...working.achievements,
        ...foundThisPass.map((id) => ({ id, unlockedAtIso: working.lastTickAtIso })),
      ],
    };
  }

  return newlyUnlocked;
}
