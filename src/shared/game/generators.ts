import {
  bnAdd,
  bnCompare,
  bnDiv,
  bnFromNumber,
  bnIsZero,
  bnMul,
  bnMulScalar,
  bnPow,
  bnSub,
  type BigNum,
} from "./big-number.js";

export interface GeneratorDefinition {
  readonly id: string;
  readonly nameEn: string;
  readonly nameYue: string;
  readonly baseCost: number;
  readonly baseCps: number;
  /** Per-unit cost growth ratio; ~1.15 is the genre-standard curve, held constant across every tier. */
  readonly costRatio: number;
}

/**
 * The full 20-tier generator ladder. Each tier's baseCost and baseCps are roughly 10x the
 * previous tier's, so the "next tier is worth it" moment recurs at a predictable cadence
 * throughout the run — from a single flicking finger up to something that bends physics.
 * Bilingual names lean into Hong Kong in-jokes rather than literal translation (a Bank earns
 * its loan-shark nickname, a Temple earns Wong Tai Sin's "everything granted, nothing free").
 */
export const GENERATOR_DEFINITIONS: readonly GeneratorDefinition[] = [
  { id: "cursor", nameEn: "Cursor", nameYue: "掂手指", baseCost: 15, baseCps: 0.1, costRatio: 1.15 },
  { id: "grandma", nameEn: "Grandma", nameYue: "包租婆", baseCost: 100, baseCps: 1, costRatio: 1.15 },
  { id: "farm", nameEn: "Cookie Farm", nameYue: "曲奇農場", baseCost: 1100, baseCps: 8, costRatio: 1.15 },
  { id: "mine", nameEn: "Cookie Mine", nameYue: "曲奇礦場", baseCost: 12000, baseCps: 47, costRatio: 1.15 },
  { id: "factory", nameEn: "Factory", nameYue: "餅乾工廠", baseCost: 130000, baseCps: 260, costRatio: 1.15 },
  { id: "bank", nameEn: "Bank", nameYue: "大耳窿銀行", baseCost: 1400000, baseCps: 1400, costRatio: 1.15 },
  { id: "temple", nameEn: "Temple", nameYue: "黃大仙廟", baseCost: 20000000, baseCps: 7800, costRatio: 1.15 },
  {
    id: "wizardTower",
    nameEn: "Wizard Tower",
    nameYue: "巫師塔",
    baseCost: 330000000,
    baseCps: 44000,
    costRatio: 1.15,
  },
  {
    id: "shipment",
    nameEn: "Shipment",
    nameYue: "貨櫃碼頭",
    baseCost: 5100000000,
    baseCps: 260000,
    costRatio: 1.15,
  },
  {
    id: "alchemyLab",
    nameEn: "Alchemy Lab",
    nameYue: "煉金實驗室",
    baseCost: 75000000000,
    baseCps: 1600000,
    costRatio: 1.15,
  },
  {
    id: "portal",
    nameEn: "Portal",
    nameYue: "傳送門",
    baseCost: 1000000000000,
    baseCps: 10000000,
    costRatio: 1.15,
  },
  {
    id: "timeMachine",
    nameEn: "Time Machine",
    nameYue: "時光機",
    baseCost: 14000000000000,
    baseCps: 65000000,
    costRatio: 1.15,
  },
  {
    id: "antimatterCondenser",
    nameEn: "Antimatter Condenser",
    nameYue: "反物質凝聚器",
    baseCost: 170000000000000,
    baseCps: 430000000,
    costRatio: 1.15,
  },
  {
    id: "prism",
    nameEn: "Prism",
    nameYue: "稜鏡",
    baseCost: 2100000000000000,
    baseCps: 2900000000,
    costRatio: 1.15,
  },
  {
    id: "chanceMaker",
    nameEn: "Chancemaker",
    nameYue: "賭檔",
    baseCost: 2.6e16,
    baseCps: 2.6e10,
    costRatio: 1.15,
  },
  {
    id: "fractalEngine",
    nameEn: "Fractal Engine",
    nameYue: "分形引擎",
    baseCost: 3.1e17,
    baseCps: 2.4e11,
    costRatio: 1.15,
  },
  {
    id: "scriptConsole",
    nameEn: "Script Console",
    nameYue: "程式主控台",
    baseCost: 3.7e18,
    baseCps: 2.2e12,
    costRatio: 1.15,
  },
  {
    id: "idleverse",
    nameEn: "Idleverse",
    nameYue: "掛機宇宙",
    baseCost: 4.4e19,
    baseCps: 2.0e13,
    costRatio: 1.15,
  },
  {
    id: "cortexBaker",
    nameEn: "Cortex Baker",
    nameYue: "腦皮層焗爐",
    baseCost: 4.6e20,
    baseCps: 1.8e14,
    costRatio: 1.15,
  },
  {
    id: "wokOfTheGods",
    nameEn: "Wok of the Gods",
    nameYue: "神級鑊氣",
    baseCost: 4.2e21,
    baseCps: 1.6e15,
    costRatio: 1.15,
  },
];

export function getGeneratorDefinition(id: string): GeneratorDefinition {
  const def = GENERATOR_DEFINITIONS.find((g) => g.id === id);
  if (!def) throw new RangeError(`Unknown generator id: ${id}`);
  return def;
}

/** Cost of the (ownedCount + 1)-th unit of this generator. */
export function costOfNext(def: GeneratorDefinition, ownedCount: number): BigNum {
  return bnMul(bnFromNumber(def.baseCost), bnPow(bnFromNumber(def.costRatio), ownedCount));
}

/**
 * Total cost to buy `quantity` more units starting from `ownedCount`, computed via the
 * closed-form geometric series sum:
 *
 *   sum_{k=0}^{quantity-1} baseCost * ratio^(ownedCount+k)
 *     = costOfNext(ownedCount) * (ratio^quantity - 1) / (ratio - 1)
 *
 * This is O(1) regardless of `quantity` — buying 1 or buying 100,000 costs the same.
 * A naive loop-based sum is used only in tests to verify this formula for small n.
 */
export function costOfBulk(def: GeneratorDefinition, ownedCount: number, quantity: number): BigNum {
  if (quantity <= 0) return bnFromNumber(0);
  const { costRatio } = def;
  const ratioPow = bnPow(bnFromNumber(costRatio), quantity);
  const numerator = bnSub(ratioPow, bnFromNumber(1));
  const factor = bnMulScalar(numerator, 1 / (costRatio - 1));
  return bnMul(costOfNext(def, ownedCount), factor);
}

/**
 * Maximum whole units of this generator affordable with `cookies`, starting from
 * `ownedCount` already owned. Computed via the closed-form inverse of the geometric
 * series (logarithmic, not iterative), then corrected by a bounded (O(1)) number of
 * boundary comparisons to guarantee exactness against floating-point log error.
 */
export function maxAffordable(def: GeneratorDefinition, ownedCount: number, cookies: BigNum): number {
  if (bnIsZero(cookies)) return 0;

  const nextCost = costOfNext(def, ownedCount);
  if (bnCompare(cookies, nextCost) < 0) return 0;

  const { costRatio } = def;
  // cookies * (ratio - 1) / nextCost
  const scaled = bnDiv(bnMulScalar(cookies, costRatio - 1), nextCost);
  const sum = bnAdd(scaled, bnFromNumber(1));
  const log10Sum = bnLog10(sum);
  const approx = Math.floor(log10Sum / Math.log10(costRatio) + 1e-9);
  let n = Math.max(0, approx);

  // Bounded correction against float/log imprecision — never proportional to n.
  while (bnCompare(costOfBulk(def, ownedCount, n + 1), cookies) <= 0) {
    n += 1;
  }
  while (n > 0 && bnCompare(costOfBulk(def, ownedCount, n), cookies) > 0) {
    n -= 1;
  }
  return n;
}

function bnLog10(value: BigNum): number {
  if (bnIsZero(value)) return -Infinity;
  return value.exponent + Math.log10(Math.abs(value.mantissa));
}

export function generatorCps(def: GeneratorDefinition, ownedCount: number): BigNum {
  return bnMulScalar(bnFromNumber(def.baseCps), ownedCount);
}

export function totalBaseCps(generators: readonly { id: string; count: number }[]): BigNum {
  return generators.reduce<BigNum>((acc, g) => {
    const def = getGeneratorDefinition(g.id);
    return bnAdd(acc, generatorCps(def, g.count));
  }, bnFromNumber(0));
}
