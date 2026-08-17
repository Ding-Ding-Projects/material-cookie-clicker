import { bnCompare, bnFromNumber, bnMulScalar, type BigNum } from "./big-number.js";
import { GENERATOR_DEFINITIONS } from "./generators.js";
import { computeHomeBonuses, createInitialHomeState } from "./home-construction.js";
import { kittenMultiplier, milkPercent } from "./milk.js";
import { prestigeMultiplierFor } from "./prestige.js";
import { rebornMultipliers } from "./reborn.js";
import { isToolBonusActive, TOOL_DEFINITIONS } from "./tools.js";
import type { GameState } from "./types.js";

export type UpgradeEffect =
  | { readonly kind: "clickMultiplier"; readonly multiplier: number }
  | { readonly kind: "generatorMultiplier"; readonly generatorId: string; readonly multiplier: number }
  | { readonly kind: "globalCpsMultiplier"; readonly multiplier: number }
  /**
   * A SYNERGY. One generator's output is lifted by how many of a *different* generator the
   * player owns, so two ladders that were bought independently start paying each other. The
   * lift is `percentPerUnit` per owned source unit, and it is read out of live state rather
   * than baked in — buying one more Bank immediately makes every Temple worth more.
   */
  | {
      readonly kind: "synergy";
      readonly targetGeneratorId: string;
      readonly sourceGeneratorId: string;
      readonly percentPerUnit: number;
    }
  /**
   * A KITTEN. Milk (milk.ts) multiplies nothing on its own; a kitten is the thing that drinks
   * it. `strength` is the conversion rate — strength 1 turns a full 100% milk into a ×2 on
   * total production. Because milk is a function of achievements, a kitten's value climbs
   * every time a badge is struck, without the player buying anything else.
   */
  | { readonly kind: "kitten"; readonly strength: number }
  /**
   * A GOLDEN COOKIE improvement. These do not multiply production directly; they change what
   * catching a golden cookie is worth (`rewardMultiplier`) and how often one is willing to
   * appear (`frequencyMultiplier`, <1 meaning "sooner"). Read by goldenCookieBonuses below.
   */
  | {
      readonly kind: "goldenCookie";
      readonly rewardMultiplier?: number;
      readonly frequencyMultiplier?: number;
    }
  /**
   * A *reveal* upgrade. It multiplies nothing at all — buying it turns on a piece of the game's
   * own surface (the shop rail, the upgrade strip, the hold-to-click behaviour). See
   * disclosure.ts, which is the single place that reads these. Deliberately an ordinary
   * UpgradeDefinition bought through the ordinary `buyUpgrade` action rather than a parallel
   * mechanism, so progressive disclosure has no seam of its own.
   *
   * A reveal NEVER gates an application feature — it gates game UI panels and one game input
   * behaviour only. See tools.ts#ToolDefinition.gatesApplicationFeature for the contract this
   * is deliberately NOT shaped like.
   */
  | { readonly kind: "reveal"; readonly surface: RevealSurface };

/** The game-surface pieces a reveal upgrade can turn on. Mirrored in disclosure.ts. */
export type RevealSurface = "shop" | "upgradeStrip" | "holdToClick" | "dieselDepot" | "homeConstruction";

export type UnlockCondition =
  | { readonly kind: "generatorOwned"; readonly generatorId: string; readonly atLeast: number }
  | { readonly kind: "lifetimeCookies"; readonly atLeast: BigNum }
  /** Chains one upgrade behind another, which is how the three reveals form a ladder. */
  | { readonly kind: "upgradeOwned"; readonly upgradeId: string }
  /** Gates the kitten line behind the milk that makes a kitten worth anything at all. */
  | { readonly kind: "achievementsUnlocked"; readonly atLeast: number }
  /** Gates the click lines behind clicking, rather than behind owning machinery. */
  | { readonly kind: "totalClicks"; readonly atLeast: number }
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

/**
 * The three reveal upgrades, in ladder order. A fresh save shows the cookie and the cookie
 * counter and nothing else; each of these buys back one piece of the surface. They are cheap
 * on purpose — they are the first minutes of the game, not a wall.
 *
 * Before the shop rail and the upgrade strip themselves exist there is nowhere to buy them
 * from, so the renderer surfaces the next un-owned one as a single "discovery ticket" beside
 * the cookie (see DiscoveryTicket.tsx). That ticket dispatches the same `buyUpgrade` action
 * the strip does — there is exactly one purchase seam.
 */
export const REVEAL_UPGRADE_DEFINITIONS: readonly UpgradeDefinition[] = [
  {
    id: "reveal_shop_sign",
    nameEn: "Shop Sign",
    nameYue: "商店招牌",
    cost: bnFromNumber(10),
    effect: { kind: "reveal", surface: "shop" },
    unlockCondition: { kind: "always" },
  },
  {
    id: "reveal_upgrade_catalogue",
    nameEn: "Upgrade Catalogue",
    nameYue: "升級目錄",
    cost: bnFromNumber(50),
    effect: { kind: "reveal", surface: "upgradeStrip" },
    unlockCondition: { kind: "upgradeOwned", upgradeId: "reveal_shop_sign" },
  },
  {
    id: "reveal_steady_hand",
    nameEn: "Steady Hand",
    nameYue: "穩陣手勢",
    cost: bnFromNumber(100),
    effect: { kind: "reveal", surface: "holdToClick" },
    unlockCondition: { kind: "upgradeOwned", upgradeId: "reveal_upgrade_catalogue" },
  },
  /**
   * The fourth reveal, and the odd one out: it turns on the Diesel Depot in the shop rail's
   * footer, where cookies buy litres of diesel for WinForge's emergency generators (see
   * diesel-exchange.ts). It hangs off the Shop Sign because the depot lives inside the shop
   * rail — with no rail on screen there would be no footer to put it in — and it is dearer than
   * the first three because it opens a spending surface rather than a viewing one.
   */
  {
    id: "reveal_fuel_contract",
    nameEn: "Fuel Contract",
    nameYue: "燃油合約",
    cost: bnFromNumber(500),
    effect: { kind: "reveal", surface: "dieselDepot" },
    unlockCondition: { kind: "upgradeOwned", upgradeId: "reveal_shop_sign" },
  },
  /**
   * The fifth reveal: the deed to the building the bakery is in, which turns on the whole home
   * construction subgame (home-construction.ts) and its console emblem.
   *
   * It hangs off the Shop Sign for the same reason the Fuel Contract does — a player who has not
   * yet found the shop has no business buying property — and it is dearer than any of them
   * because what it opens is not a view or a shelf but a second game with its own clock.
   *
   * Buying the deed gives you a building and NOTHING inside it. Every room after that is a
   * blueprint you buy, a construction you pay for, and a wait you actually serve.
   */
  {
    id: "reveal_property_deed",
    nameEn: "Property Deed",
    nameYue: "物業契",
    cost: bnFromNumber(2_000),
    effect: { kind: "reveal", surface: "homeConstruction" },
    unlockCondition: { kind: "upgradeOwned", upgradeId: "reveal_shop_sign" },
  },
];

/* ==========================================================================================
 * SYNERGIES — every neighbouring pair on the ladder, in both directions.
 *
 * A synergy is bought once and then keeps paying by itself: the Temple line is worth more
 * every time a Bank is bought, and the Bank line is worth more every time a Temple is. The
 * effect reads owned counts out of live state, so the two ladders the player was already
 * climbing quietly start climbing each other.
 *
 * Both directions are deliberately NOT symmetric in rate. The lower tier lifts the higher one
 * generously (there are always many more of the lower tier), and the higher tier lifts the
 * lower one steeply (there are always very few of the higher).
 * ======================================================================================== */

/** Per owned unit of the lower-tier neighbour, applied to the higher tier. */
const SYNERGY_UP_PERCENT_PER_UNIT = 0.001;
/** Per owned unit of the higher-tier neighbour, applied to the lower tier. */
const SYNERGY_DOWN_PERCENT_PER_UNIT = 0.01;

function buildSynergyUpgrades(): UpgradeDefinition[] {
  const defs: UpgradeDefinition[] = [];
  for (let i = 0; i + 1 < GENERATOR_DEFINITIONS.length; i += 1) {
    const lower = GENERATOR_DEFINITIONS[i]!;
    const higher = GENERATOR_DEFINITIONS[i + 1]!;
    defs.push({
      id: `synergy_${lower.id}_${higher.id}`,
      nameEn: `${lower.nameEn} × ${higher.nameEn}`,
      nameYue: `${lower.nameYue}襯${higher.nameYue}`,
      cost: bnFromNumber(higher.baseCost * 15),
      effect: {
        kind: "synergy",
        targetGeneratorId: higher.id,
        sourceGeneratorId: lower.id,
        percentPerUnit: SYNERGY_UP_PERCENT_PER_UNIT,
      },
      unlockCondition: { kind: "generatorOwned", generatorId: higher.id, atLeast: 5 },
    });
    defs.push({
      id: `synergy_${higher.id}_${lower.id}`,
      nameEn: `${higher.nameEn} × ${lower.nameEn}`,
      nameYue: `${higher.nameYue}襯${lower.nameYue}`,
      cost: bnFromNumber(higher.baseCost * 30),
      effect: {
        kind: "synergy",
        targetGeneratorId: lower.id,
        sourceGeneratorId: higher.id,
        percentPerUnit: SYNERGY_DOWN_PERCENT_PER_UNIT,
      },
      unlockCondition: { kind: "generatorOwned", generatorId: higher.id, atLeast: 10 },
    });
  }
  return defs;
}

/* ==========================================================================================
 * THE KITTEN LINE — the only thing in the game that reads milk.
 *
 * Each kitten is a hire, not a machine: it converts the cabinet's milk level (milk.ts, a pure
 * function of unlocked achievements) into a multiplier on total production. Its value is not
 * fixed at purchase — strike one more achievement and every kitten you already own gets better
 * that same second, which is the entire point of the mechanic.
 *
 * Each kitten's unlock is an achievement count rather than a cookie count, because a kitten
 * bought with no milk in the cabinet would be an expensive ×1.
 * ======================================================================================== */
const KITTEN_UPGRADE_DEFINITIONS: readonly UpgradeDefinition[] = [
  {
    id: "kitten_helpers",
    nameEn: "Kitten Helpers",
    nameYue: "貓仔幫手",
    cost: bnFromNumber(9000000),
    effect: { kind: "kitten", strength: 0.1 },
    unlockCondition: { kind: "achievementsUnlocked", atLeast: 3 },
  },
  {
    id: "kitten_workers",
    nameEn: "Kitten Workers",
    nameYue: "貓仔散工",
    cost: bnFromNumber(9000000000),
    effect: { kind: "kitten", strength: 0.125 },
    unlockCondition: { kind: "achievementsUnlocked", atLeast: 6 },
  },
  {
    id: "kitten_engineers",
    nameEn: "Kitten Engineers",
    nameYue: "貓仔師傅",
    cost: bnFromNumber(90000000000000),
    effect: { kind: "kitten", strength: 0.15 },
    unlockCondition: { kind: "achievementsUnlocked", atLeast: 12 },
  },
  {
    id: "kitten_overseers",
    nameEn: "Kitten Overseers",
    nameYue: "貓仔工頭",
    cost: bnFromNumber(9e17),
    effect: { kind: "kitten", strength: 0.175 },
    unlockCondition: { kind: "achievementsUnlocked", atLeast: 20 },
  },
  {
    id: "kitten_managers",
    nameEn: "Kitten Managers",
    nameYue: "貓仔經理",
    cost: bnFromNumber(9e21),
    effect: { kind: "kitten", strength: 0.2 },
    unlockCondition: { kind: "achievementsUnlocked", atLeast: 30 },
  },
  {
    id: "kitten_accountants",
    nameEn: "Kitten Accountants",
    nameYue: "貓仔會計",
    cost: bnFromNumber(9e25),
    effect: { kind: "kitten", strength: 0.2 },
    unlockCondition: { kind: "achievementsUnlocked", atLeast: 45 },
  },
  {
    id: "kitten_specialists",
    nameEn: "Kitten Specialists",
    nameYue: "貓仔專家",
    cost: bnFromNumber(9e29),
    effect: { kind: "kitten", strength: 0.225 },
    unlockCondition: { kind: "achievementsUnlocked", atLeast: 65 },
  },
  {
    id: "kitten_experts",
    nameEn: "Kitten Experts",
    nameYue: "貓仔阿爺",
    cost: bnFromNumber(9e33),
    effect: { kind: "kitten", strength: 0.25 },
    unlockCondition: { kind: "achievementsUnlocked", atLeast: 90 },
  },
  {
    id: "kitten_consultants",
    nameEn: "Kitten Consultants",
    nameYue: "貓仔顧問",
    cost: bnFromNumber(9e37),
    effect: { kind: "kitten", strength: 0.275 },
    unlockCondition: { kind: "achievementsUnlocked", atLeast: 120 },
  },
  {
    id: "kitten_dim_sum_chefs",
    nameEn: "Kitten Dim Sum Chefs",
    nameYue: "貓仔點心師傅",
    cost: bnFromNumber(9e41),
    effect: { kind: "kitten", strength: 0.3 },
    unlockCondition: { kind: "achievementsUnlocked", atLeast: 150 },
  },
];

/* ==========================================================================================
 * THE GOLDEN COOKIE LINE — better catches, and more of them.
 *
 * These never touch CPS. They change what a caught golden cookie pays (reward) and how long
 * the game is willing to make you wait for the next one (frequency, where a number below 1
 * means sooner). goldenCookieBonuses folds the whole line into two numbers.
 * ======================================================================================== */
const GOLDEN_UPGRADE_DEFINITIONS: readonly UpgradeDefinition[] = [
  {
    id: "golden_lucky_day",
    nameEn: "Lucky Day",
    nameYue: "好日子",
    cost: bnFromNumber(777777),
    effect: { kind: "goldenCookie", frequencyMultiplier: 0.8 },
    unlockCondition: { kind: "lifetimeCookies", atLeast: bnFromNumber(300000) },
  },
  {
    id: "golden_serendipity",
    nameEn: "Serendipity",
    nameYue: "撞彩",
    cost: bnFromNumber(77777777),
    effect: { kind: "goldenCookie", frequencyMultiplier: 0.8 },
    unlockCondition: { kind: "upgradeOwned", upgradeId: "golden_lucky_day" },
  },
  {
    id: "golden_gilded_crumbs",
    nameEn: "Gilded Crumbs",
    nameYue: "鍍金餅碎",
    cost: bnFromNumber(7777777777),
    effect: { kind: "goldenCookie", rewardMultiplier: 1.5 },
    unlockCondition: { kind: "upgradeOwned", upgradeId: "golden_lucky_day" },
  },
  {
    id: "golden_get_lucky",
    nameEn: "Get Lucky",
    nameYue: "撈到嘢",
    cost: bnFromNumber(777777777777),
    effect: { kind: "goldenCookie", rewardMultiplier: 2 },
    unlockCondition: { kind: "upgradeOwned", upgradeId: "golden_gilded_crumbs" },
  },
  {
    id: "golden_lucky_number",
    nameEn: "Lucky Number",
    nameYue: "幸運號碼",
    cost: bnFromNumber(7.7e15),
    effect: { kind: "goldenCookie", rewardMultiplier: 1.5, frequencyMultiplier: 0.9 },
    unlockCondition: { kind: "upgradeOwned", upgradeId: "golden_get_lucky" },
  },
  {
    id: "golden_fortune_teller",
    nameEn: "Fortune Teller",
    nameYue: "睇相佬",
    cost: bnFromNumber(7.7e19),
    effect: { kind: "goldenCookie", rewardMultiplier: 2, frequencyMultiplier: 0.85 },
    unlockCondition: { kind: "upgradeOwned", upgradeId: "golden_lucky_number" },
  },
  {
    id: "golden_wong_tai_sin_lot",
    nameEn: "Wong Tai Sin Lot",
    nameYue: "黃大仙求籤",
    cost: bnFromNumber(7.7e24),
    effect: { kind: "goldenCookie", rewardMultiplier: 3, frequencyMultiplier: 0.8 },
    unlockCondition: { kind: "upgradeOwned", upgradeId: "golden_fortune_teller" },
  },
];

/* ==========================================================================================
 * THE CLICK LINE — everything that makes one press of the cookie worth more.
 * ======================================================================================== */
const CLICK_UPGRADE_DEFINITIONS: readonly UpgradeDefinition[] = [
  {
    id: "reinforced_finger",
    nameEn: "Reinforced Finger",
    nameYue: "加固手指",
    cost: bnFromNumber(100),
    effect: { kind: "clickMultiplier", multiplier: 2 },
    unlockCondition: { kind: "always" },
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
    id: "thousand_finger_technique",
    nameEn: "Thousand-Finger Technique",
    nameYue: "千指功",
    cost: bnFromNumber(10000000000),
    effect: { kind: "clickMultiplier", multiplier: 3 },
    unlockCondition: { kind: "lifetimeCookies", atLeast: bnFromNumber(5000000000) },
  },
  {
    id: "callused_knuckle",
    nameEn: "Callused Knuckle",
    nameYue: "起繭指骨",
    cost: bnFromNumber(5000),
    effect: { kind: "clickMultiplier", multiplier: 2 },
    unlockCondition: { kind: "totalClicks", atLeast: 100 },
  },
  {
    id: "wrist_of_iron",
    nameEn: "Wrist of Iron",
    nameYue: "鐵手腕",
    cost: bnFromNumber(500000),
    effect: { kind: "clickMultiplier", multiplier: 2 },
    unlockCondition: { kind: "totalClicks", atLeast: 1000 },
  },
  {
    id: "mahjong_shuffle",
    nameEn: "Mahjong Shuffle",
    nameYue: "洗牌手勢",
    cost: bnFromNumber(80000000),
    effect: { kind: "clickMultiplier", multiplier: 2 },
    unlockCondition: { kind: "totalClicks", atLeast: 10000 },
  },
  {
    id: "minibus_bell_reflex",
    nameEn: "Minibus Bell Reflex",
    nameYue: "小巴落車鐘反射",
    cost: bnFromNumber(4e12),
    effect: { kind: "clickMultiplier", multiplier: 3 },
    unlockCondition: { kind: "totalClicks", atLeast: 50000 },
  },
  {
    id: "octopus_tap",
    nameEn: "Octopus Tap",
    nameYue: "八達通嘟一嘟",
    cost: bnFromNumber(2e16),
    effect: { kind: "clickMultiplier", multiplier: 3 },
    unlockCondition: { kind: "totalClicks", atLeast: 100000 },
  },
  {
    id: "typhoon_signal_ten",
    nameEn: "Typhoon Signal Ten",
    nameYue: "十號風球",
    cost: bnFromNumber(9e20),
    effect: { kind: "clickMultiplier", multiplier: 4 },
    unlockCondition: { kind: "totalClicks", atLeast: 250000 },
  },
  {
    id: "finger_of_the_ancestor",
    nameEn: "Finger of the Ancestor",
    nameYue: "祖先之指",
    cost: bnFromNumber(3e26),
    effect: { kind: "clickMultiplier", multiplier: 5 },
    unlockCondition: { kind: "totalClicks", atLeast: 500000 },
  },
];

const GLOBAL_UPGRADE_DEFINITIONS: readonly UpgradeDefinition[] = [
  {
    id: "sturdier_ovens",
    nameEn: "Sturdier Ovens",
    nameYue: "堅固焗爐",
    cost: bnFromNumber(10000),
    effect: { kind: "globalCpsMultiplier", multiplier: 1.1 },
    unlockCondition: { kind: "lifetimeCookies", atLeast: bnFromNumber(5000) },
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
    id: "night_shift_roster",
    nameEn: "Night Shift Roster",
    nameYue: "通宵更表",
    cost: bnFromNumber(2000000),
    effect: { kind: "globalCpsMultiplier", multiplier: 1.15 },
    unlockCondition: { kind: "lifetimeCookies", atLeast: bnFromNumber(1000000) },
  },
  {
    id: "wet_market_supply_line",
    nameEn: "Wet Market Supply Line",
    nameYue: "街市供應線",
    cost: bnFromNumber(5e10),
    effect: { kind: "globalCpsMultiplier", multiplier: 1.25 },
    unlockCondition: { kind: "lifetimeCookies", atLeast: bnFromNumber(2e10) },
  },
  {
    id: "container_port_priority",
    nameEn: "Container Port Priority",
    nameYue: "貨櫃碼頭優先權",
    cost: bnFromNumber(5e13),
    effect: { kind: "globalCpsMultiplier", multiplier: 1.3 },
    unlockCondition: { kind: "lifetimeCookies", atLeast: bnFromNumber(2e13) },
  },
  {
    id: "lucky_cat_at_the_till",
    nameEn: "Lucky Cat at the Till",
    nameYue: "收銀處招財貓",
    cost: bnFromNumber(5e16),
    effect: { kind: "globalCpsMultiplier", multiplier: 1.35 },
    unlockCondition: { kind: "lifetimeCookies", atLeast: bnFromNumber(2e16) },
  },
  {
    id: "ancestral_recipe_book",
    nameEn: "Ancestral Recipe Book",
    nameYue: "祖傳食譜",
    cost: bnFromNumber(5e19),
    effect: { kind: "globalCpsMultiplier", multiplier: 1.4 },
    unlockCondition: { kind: "lifetimeCookies", atLeast: bnFromNumber(2e19) },
  },
  {
    id: "mtr_freight_after_midnight",
    nameEn: "MTR Freight After Midnight",
    nameYue: "港鐵深宵貨運",
    cost: bnFromNumber(5e22),
    effect: { kind: "globalCpsMultiplier", multiplier: 1.5 },
    unlockCondition: { kind: "lifetimeCookies", atLeast: bnFromNumber(2e22) },
  },
  {
    id: "victoria_harbour_convection",
    nameEn: "Victoria Harbour Convection",
    nameYue: "維港對流",
    cost: bnFromNumber(5e26),
    effect: { kind: "globalCpsMultiplier", multiplier: 1.6 },
    unlockCondition: { kind: "lifetimeCookies", atLeast: bnFromNumber(2e26) },
  },
  {
    id: "the_recipe_that_bends_physics",
    nameEn: "The Recipe That Bends Physics",
    nameYue: "扭曲物理嘅食譜",
    cost: bnFromNumber(5e30),
    effect: { kind: "globalCpsMultiplier", multiplier: 2 },
    unlockCondition: { kind: "lifetimeCookies", atLeast: bnFromNumber(2e30) },
  },
];


export const UPGRADE_DEFINITIONS: readonly UpgradeDefinition[] = [
  ...REVEAL_UPGRADE_DEFINITIONS,
  ...CLICK_UPGRADE_DEFINITIONS,
  ...GLOBAL_UPGRADE_DEFINITIONS,
  ...GOLDEN_UPGRADE_DEFINITIONS,
  ...KITTEN_UPGRADE_DEFINITIONS,
  ...buildGeneratorUpgradeTiers(),
  ...buildSynergyUpgrades(),
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
    case "upgradeOwned":
      return state.upgrades.some((u) => u.id === condition.upgradeId);
    case "achievementsUnlocked":
      return state.achievements.length >= condition.atLeast;
    case "totalClicks":
      return state.stats.totalClicks >= condition.atLeast;
    case "lifetimeCookies":
      return bnCompare(state.lifetimeCookies, condition.atLeast) >= 0;
  }
}

export interface GoldenCookieBonuses {
  /** Multiplier on a caught golden cookie's instant reward. */
  readonly rewardMultiplier: number;
  /** Multiplier on the wait before the next one is eligible; below 1 means sooner. */
  readonly frequencyMultiplier: number;
}

/**
 * The golden-cookie line, folded into two numbers. Kept here rather than in golden-cookie.ts so
 * that every upgrade effect is composed in exactly one file; golden-cookie.ts reads the result.
 */
export function goldenCookieBonuses(state: GameState): GoldenCookieBonuses {
  let rewardMultiplier = 1;
  let frequencyMultiplier = 1;
  for (const owned of state.upgrades) {
    const def = UPGRADE_DEFINITIONS.find((u) => u.id === owned.id);
    if (!def || def.effect.kind !== "goldenCookie") continue;
    rewardMultiplier *= def.effect.rewardMultiplier ?? 1;
    frequencyMultiplier *= def.effect.frequencyMultiplier ?? 1;
  }
  return { rewardMultiplier, frequencyMultiplier };
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

  // Milk is read exactly once per derivation, not once per kitten: it is the same number for
  // every kitten in the cabinet, and re-deriving it per upgrade would be pure waste.
  const milk = milkPercent(state);
  const ownedGeneratorCounts = new Map(state.generators.map((g) => [g.id, g.count] as const));

  for (const owned of state.upgrades) {
    const def = getUpgradeDefinition(owned.id);
    switch (def.effect.kind) {
      case "synergy": {
        const sourceCount = ownedGeneratorCounts.get(def.effect.sourceGeneratorId) ?? 0;
        if (sourceCount <= 0) break;
        const key = def.effect.targetGeneratorId;
        const lift = 1 + def.effect.percentPerUnit * sourceCount;
        generatorMultipliers[key] = (generatorMultipliers[key] ?? 1) * lift;
        break;
      }
      case "kitten":
        globalCpsMultiplier *= kittenMultiplier(def.effect.strength, milk);
        break;
      case "goldenCookie":
        // Changes what a golden cookie is worth, never what the ovens produce. Folded in here
        // as an explicit no-op so this switch stays exhaustive; see goldenCookieBonuses.
        break;
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
      case "reveal":
        // A reveal changes what the player can SEE, never what they produce. Folding it in
        // here as an explicit no-op keeps this switch exhaustive rather than silently
        // defaulted, so a future effect kind cannot slip through unhandled.
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

  // The Reborn tree (reborn.ts) is the last layer, and deliberately so: it is bought with a
  // currency that survives every reset, so it multiplies the whole of what a run has built
  // rather than being one more term inside it.
  const reborn = rebornMultipliers(state.prestige.rebornNodeIds ?? []);
  clickMultiplier *= reborn.clickMultiplier;
  globalCpsMultiplier *= reborn.globalCpsMultiplier;

  // THE HOUSE (home-construction.ts). Folded in here, at the one derivation seam, rather than
  // anywhere near the CPS pipeline itself — so the coziness curve is applied exactly once, to
  // clicks and production alike, and offline progress gets it for free because offline progress
  // already goes through this function. A save with no house multiplies by exactly 1.
  const home = computeHomeBonuses(state.homeConstruction ?? createInitialHomeState());
  clickMultiplier *= home.clickMultiplier;
  globalCpsMultiplier *= home.globalCpsMultiplier;

  return { clickMultiplier, generatorMultipliers, globalCpsMultiplier };
}

/** Re-exported for callers that need to scale an arbitrary BigNum by a derived multiplier. */
export function bnScaleBy(value: BigNum, multiplier: number): BigNum {
  return bnMulScalar(value, multiplier);
}
