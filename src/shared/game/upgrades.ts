import { bnCompare, bnFromNumber, bnMulScalar, type BigNum } from "./big-number.js";
import { GENERATOR_DEFINITIONS } from "./generators.js";
import { prestigeMultiplierFor } from "./prestige.js";
import { isToolBonusActive, TOOL_DEFINITIONS } from "./tools.js";
import type { GameState } from "./types.js";

export type UpgradeEffect =
  | { readonly kind: "clickMultiplier"; readonly multiplier: number }
  | { readonly kind: "generatorMultiplier"; readonly generatorId: string; readonly multiplier: number }
  | { readonly kind: "globalCpsMultiplier"; readonly multiplier: number };

export type UnlockCondition =
  | { readonly kind: "generatorOwned"; readonly generatorId: string; readonly atLeast: number }
  | { readonly kind: "lifetimeCookies"; readonly atLeast: BigNum }
  | { readonly kind: "always" };

export interface UpgradeDefinition {
  readonly id: string;
  readonly nameEn: string;
  readonly nameYue: string;
  readonly cost: BigNum;
  readonly effect: UpgradeEffect;
  readonly unlockCondition: UnlockCondition;
}

/** Owned-count thresholds at which a per-generator upgrade tier unlocks, genre-standard. */
const GENERATOR_UPGRADE_THRESHOLDS: readonly number[] = [1, 5, 25, 50, 100];

/** Each tier doubles that generator's own output; five tiers stack to a 32x multiplier at 100 owned. */
const GENERATOR_UPGRADE_TIER_MULTIPLIER = 2;

function buildGeneratorUpgradeTiers(): UpgradeDefinition[] {
  const tiers: UpgradeDefinition[] = [];
  for (const gen of GENERATOR_DEFINITIONS) {
    for (const threshold of GENERATOR_UPGRADE_THRESHOLDS) {
      tiers.push({
        id: `${gen.id}_upgrade_${threshold}`,
        nameEn: `${gen.nameEn} Upgrade (x${threshold})`,
        nameYue: `${gen.nameYue}升級（擁有 ${threshold} 個）`,
        cost: bnFromNumber(gen.baseCost * threshold * 10),
        effect: { kind: "generatorMultiplier", generatorId: gen.id, multiplier: GENERATOR_UPGRADE_TIER_MULTIPLIER },
        unlockCondition: { kind: "generatorOwned", generatorId: gen.id, atLeast: threshold },
      });
    }
  }
  return tiers;
}

const GLOBAL_UPGRADE_DEFINITIONS: readonly UpgradeDefinition[] = [
  {
    id: "reinforced_finger",
    nameEn: "Reinforced Finger",
    nameYue: "加固手指",
    cost: bnFromNumber(100),
    effect: { kind: "clickMultiplier", multiplier: 2 },
    unlockCondition: { kind: "always" },
  },
  {
    id: "sturdier_ovens",
    nameEn: "Sturdier Ovens",
    nameYue: "堅固焗爐",
    cost: bnFromNumber(10000),
    effect: { kind: "globalCpsMultiplier", multiplier: 1.1 },
    unlockCondition: { kind: "lifetimeCookies", atLeast: bnFromNumber(5000) },
  },
  {
    id: "double_click_double_trouble",
    nameEn: "Double Click, Double Trouble",
    nameYue: "雙擊雙倍麻煩",
    cost: bnFromNumber(1000000),
    effect: { kind: "clickMultiplier", multiplier: 2 },
    unlockCondition: { kind: "lifetimeCookies", atLeast: bnFromNumber(500000) },
  },
  {
    id: "industrial_grade_yeast",
    nameEn: "Industrial-Grade Yeast",
    nameYue: "工業級酵母",
    cost: bnFromNumber(100000000),
    effect: { kind: "globalCpsMultiplier", multiplier: 1.25 },
    unlockCondition: { kind: "lifetimeCookies", atLeast: bnFromNumber(50000000) },
  },
  {
    id: "thousand_finger_technique",
    nameEn: "Thousand-Finger Technique",
    nameYue: "千指功",
    cost: bnFromNumber(10000000000),
    effect: { kind: "clickMultiplier", multiplier: 3 },
    unlockCondition: { kind: "lifetimeCookies", atLeast: bnFromNumber(5000000000) },
  },
];

export const UPGRADE_DEFINITIONS: readonly UpgradeDefinition[] = [
  ...GLOBAL_UPGRADE_DEFINITIONS,
  ...buildGeneratorUpgradeTiers(),
];

export function getUpgradeDefinition(id: string): UpgradeDefinition {
  const def = UPGRADE_DEFINITIONS.find((u) => u.id === id);
  if (!def) throw new RangeError(`Unknown upgrade id: ${id}`);
  return def;
}

export function isUpgradeUnlocked(condition: UnlockCondition, state: GameState): boolean {
  switch (condition.kind) {
    case "always":
      return true;
    case "generatorOwned": {
      const owned = state.generators.find((g) => g.id === condition.generatorId);
      return (owned?.count ?? 0) >= condition.atLeast;
    }
    case "lifetimeCookies":
      return bnCompare(state.lifetimeCookies, condition.atLeast) >= 0;
  }
}

export interface DerivedMultipliers {
  /** Multiplier applied to the base click value. */
  readonly clickMultiplier: number;
  /** Multiplier applied to each generator's own base CPS, keyed by generator id. */
  readonly generatorMultipliers: Readonly<Record<string, number>>;
  /** Multiplier applied to total CPS after per-generator multipliers. */
  readonly globalCpsMultiplier: number;
}

/**
 * The ONE pure reducer over owned upgrades, active tool bonuses, and the prestige bonus.
 * Click value and CPS are always *derived* from this — never separately mutated anywhere
 * else in the domain. Tool bonuses fold in here exactly like upgrade effects do: same three
 * effect kinds, same multiplicative composition, gated only by `isToolBonusActive` (which is
 * itself gated only by unlock condition / the progression toggle — never by feature
 * availability, see tools.ts).
 */
export function computeMultipliers(state: GameState): DerivedMultipliers {
  let clickMultiplier = 1;
  const generatorMultipliers: Record<string, number> = {};
  let globalCpsMultiplier = 1;

  for (const owned of state.upgrades) {
    const def = getUpgradeDefinition(owned.id);
    switch (def.effect.kind) {
      case "clickMultiplier":
        clickMultiplier *= def.effect.multiplier;
        break;
      case "generatorMultiplier": {
        const key = def.effect.generatorId;
        generatorMultipliers[key] = (generatorMultipliers[key] ?? 1) * def.effect.multiplier;
        break;
      }
      case "globalCpsMultiplier":
        globalCpsMultiplier *= def.effect.multiplier;
        break;
    }
  }

  for (const toolDef of TOOL_DEFINITIONS) {
    if (!isToolBonusActive(state, toolDef.id)) continue;
    switch (toolDef.effect.kind) {
      case "clickMultiplier":
        clickMultiplier *= toolDef.effect.multiplier;
        break;
      case "generatorMultiplier": {
        const key = toolDef.effect.generatorId;
        generatorMultipliers[key] = (generatorMultipliers[key] ?? 1) * toolDef.effect.multiplier;
        break;
      }
      case "globalCpsMultiplier":
        globalCpsMultiplier *= toolDef.effect.multiplier;
        break;
      // buyMaxDiscountPercent / offlineCapExtensionMs / offlineCpsFactorBonus are not
      // multipliers on click/CPS — they're applied by reducer.ts and offline-progress.ts
      // respectively, via tools.ts#totalBuyMaxDiscount / tools.ts#totalOfflineBonuses.
      default:
        break;
    }
  }

  const prestigeBonus = prestigeMultiplierFor(state.prestige.ascensionPoints);
  clickMultiplier *= prestigeBonus;
  globalCpsMultiplier *= prestigeBonus;

  return { clickMultiplier, generatorMultipliers, globalCpsMultiplier };
}

/** Re-exported for callers that need to scale an arbitrary BigNum by a derived multiplier. */
export function bnScaleBy(value: BigNum, multiplier: number): BigNum {
  return bnMulScalar(value, multiplier);
}
