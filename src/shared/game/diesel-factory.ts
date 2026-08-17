import { bnFromNumber, bnMulScalar, bnPow, type BigNum } from "./big-number.js";
import type { GameState } from "./types.js";

/**
 * THE DIESEL FACTORY — a game inside the game.
 *
 * Diesel used to appear out of nowhere: the player pressed a button, cookies vanished, and a
 * litre existed. Nothing made it. This module replaces that with a small manufacturing economy
 * that has to actually run, on the same wall-clock tick discipline the cookie side uses:
 *
 *     wells and importers pull CRUDE out of the ground
 *         -> refining units convert crude into LITRES at a throughput, at an efficiency
 *             -> storage tanks hold the litres, and are finite
 *                 -> the depot SHIPS litres out as vouchers, drawing the tanks down
 *
 * Every arrow in that chain can stall, and stalls honestly. A refinery with no crude in the
 * yard refines nothing. A refinery with a full tank in front of it refines nothing either, and
 * the crude it would have used stays in the yard. A depot with an empty tank ships nothing and
 * says so, rather than conjuring a litre the way the old depot did.
 *
 * COOKIES TOUCH THIS IN EXACTLY ONE PLACE: buying equipment and buying factory upgrades. There
 * is no cookies-to-litres exchange rate anywhere in this file, and there must never be one
 * again — the whole point is that the game manufactures diesel rather than purchasing it.
 *
 * Everything here is pure. No clock, no randomness, no file system: `tickFactory` is handed the
 * seconds that elapsed and returns what the factory did with them.
 */

// ------------------------------------------------------------------ the state subtree ----

export interface OwnedEquipment {
  readonly id: string;
  readonly count: number;
}

export interface DieselFactoryState {
  /** Equipment bought with cookies, by id. */
  readonly equipment: readonly OwnedEquipment[];
  /** Ids of factory upgrades bought with cookies. Order is purchase order. */
  readonly upgradeIds: readonly string[];
  /** Barrels of crude sitting in the yard, waiting to be refined. Capped — see crudeCapacity. */
  readonly crude: number;
  /** Litres of finished diesel in the tanks. Capped — see litreCapacity. */
  readonly litres: number;
  /** Lifetime barrels pulled out of the ground by this save. */
  readonly lifetimeCrude: number;
  /** Lifetime litres this factory has actually manufactured. Never decreases. */
  readonly lifetimeLitres: number;
  /** Lifetime cookies spent on equipment and factory upgrades. The amortization numerator. */
  readonly cookiesInvested: BigNum;
  /** Player's switch for the automation upgrades. Off until one of them is bought AND set. */
  readonly autoShipEnabled: boolean;
  /** Seconds of production that stalled because the tanks were full. Reported, not hidden. */
  readonly stalledSeconds: number;
}

export function createInitialFactoryState(): DieselFactoryState {
  return {
    equipment: [],
    upgradeIds: [],
    crude: 0,
    litres: 0,
    lifetimeCrude: 0,
    lifetimeLitres: 0,
    cookiesInvested: bnFromNumber(0),
    autoShipEnabled: false,
    stalledSeconds: 0,
  };
}

// -------------------------------------------------------------------------- equipment ----

/** What a piece of equipment does to the line. One kind per station in the chain. */
export type EquipmentRole = "intake" | "refining" | "storage" | "boost";

export interface EquipmentDefinition {
  readonly id: string;
  readonly nameEn: string;
  readonly nameYue: string;
  readonly blurbEn: string;
  readonly blurbYue: string;
  readonly role: EquipmentRole;
  /** Cost of the FIRST unit, in cookies. */
  readonly baseCost: number;
  /** Every unit owned makes the next one this much dearer — the game's 1.15 house ratio. */
  readonly costRatio: number;
  /** Barrels of crude per second, per unit. Intake only. */
  readonly crudePerSecond?: number;
  /** Litres per second of refining throughput, per unit. Refining only. */
  readonly litresPerSecond?: number;
  /** Litres of tank capacity, per unit. Storage only. */
  readonly litreCapacity?: number;
  /** Barrels of yard capacity, per unit. Storage only — a tank farm holds feedstock too. */
  readonly crudeCapacity?: number;
  /** Fractional bonus to refining throughput, per unit, added together then applied once. */
  readonly refiningBonus?: number;
}

/**
 * THE HOUSE RATIO. Every equipment line grows 1.15 a unit, exactly like a generator tier
 * (generators.ts) and exactly like the old litre curve did. The factory is a second economy but
 * it is not a second set of rules: a player who has learned what "each one costs 15% more"
 * feels like on the cookie side reads this shop without being taught anything new.
 */
export const EQUIPMENT_COST_RATIO = 1.15;

/**
 * The rate curve, stated once so it can be checked against the documentation.
 *
 * One Crude Well pulls 0.05 barrels a second. One Refinery Still consumes up to 0.02 litres a
 * second of throughput, and at the base efficiency of 2.5 barrels a litre that is exactly 0.05
 * barrels a second of demand. **One well feeds exactly one still.** That deliberate 1:1 is the
 * whole tutorial: buy one of each and the line balances; buy wells alone and the yard backs up
 * to its cap; buy stills alone and they idle for want of crude.
 *
 * The heavy tiers keep the same ratio. One Crude Importer (0.5 barrels/s) feeds exactly one
 * Catalytic Cracker (0.2 litres/s x 2.5 barrels = 0.5 barrels/s).
 */
export const EQUIPMENT_DEFINITIONS: readonly EquipmentDefinition[] = [
  {
    id: "crude_well",
    nameEn: "Crude Well",
    nameYue: "原油井",
    blurbEn: "A nodding donkey out the back. Pulls crude out of the ground, slowly and forever.",
    blurbYue: "後面嗰部磕頭機。慢慢咁、無了期咁抽原油上嚟。",
    role: "intake",
    baseCost: 2_000,
    costRatio: EQUIPMENT_COST_RATIO,
    crudePerSecond: 0.05,
  },
  {
    id: "crude_importer",
    nameEn: "Crude Importer",
    nameYue: "原油入口商",
    blurbEn: "A standing order and a jetty. Ten wells' worth of crude arrives by ship instead.",
    blurbYue: "一張長期訂單同一個碼頭。夠十口井嘅原油改由船運到。",
    role: "intake",
    baseCost: 24_000,
    costRatio: EQUIPMENT_COST_RATIO,
    crudePerSecond: 0.5,
  },
  {
    id: "refinery_still",
    nameEn: "Refinery Still",
    nameYue: "煉油塔",
    blurbEn: "One fractionating column. Takes crude off the yard and turns it into diesel.",
    blurbYue: "一支分餾塔。由油場攞原油，煉成柴油。",
    role: "refining",
    baseCost: 8_000,
    costRatio: EQUIPMENT_COST_RATIO,
    litresPerSecond: 0.02,
  },
  {
    id: "catalytic_cracker",
    nameEn: "Catalytic Cracker",
    nameYue: "催化裂化爐",
    blurbEn: "Heat, pressure and a catalyst bed. Ten stills' worth of throughput in one unit.",
    blurbYue: "高溫、高壓同催化劑床。一部就抵得住十支煉油塔嘅產能。",
    role: "refining",
    baseCost: 120_000,
    costRatio: EQUIPMENT_COST_RATIO,
    litresPerSecond: 0.2,
  },
  {
    id: "storage_tank",
    nameEn: "Storage Tank",
    nameYue: "儲油缸",
    blurbEn: "A bunded bay holding finished diesel and the crude waiting behind it.",
    blurbYue: "一個有圍堤嘅油缸區，裝住成品柴油同埋排住隊嘅原油。",
    role: "storage",
    baseCost: 5_000,
    costRatio: EQUIPMENT_COST_RATIO,
    litreCapacity: 25,
    crudeCapacity: 50,
  },
  {
    id: "transfer_pump",
    nameEn: "Transfer Pump",
    nameYue: "輸油泵",
    blurbEn: "Moves feedstock faster than gravity does. Every refining unit runs 8% harder.",
    blurbYue: "比地心吸力快咁送料。每部煉油設備行快 8%。",
    role: "boost",
    baseCost: 40_000,
    costRatio: EQUIPMENT_COST_RATIO,
    refiningBonus: 0.08,
  },
];

export function getEquipmentDefinition(id: string): EquipmentDefinition {
  const def = EQUIPMENT_DEFINITIONS.find((e) => e.id === id);
  if (!def) throw new RangeError(`Unknown factory equipment id: ${id}`);
  return def;
}

export function equipmentOwned(state: DieselFactoryState, id: string): number {
  return state.equipment.find((e) => e.id === id)?.count ?? 0;
}

/** Cost of the next single unit when `owned` are already on the floor. */
export function equipmentCost(def: EquipmentDefinition, owned: number): BigNum {
  return bnMulScalar(bnPow(bnFromNumber(def.costRatio), owned), def.baseCost);
}

/**
 * Cost of `quantity` units bought in one press, summed as the geometric series rather than one
 * unit at a time, so a bulk purchase costs exactly what the same units would cost separately.
 */
export function equipmentBulkCost(def: EquipmentDefinition, owned: number, quantity: number): BigNum {
  if (quantity <= 0) return bnFromNumber(0);
  const r = def.costRatio;
  const head = Math.pow(r, owned) * def.baseCost;
  const series = (Math.pow(r, quantity) - 1) / (r - 1);
  return bnMulScalar(bnFromNumber(head), series);
}

// --------------------------------------------------------------------------- upgrades ----

export type FactoryUpgradeBranch = "throughput" | "efficiency" | "capacity" | "automation";

export type FactoryUpgradeEffect =
  /** Multiplies the crude/second of one equipment id (or every intake unit when omitted). */
  | { readonly kind: "intakeMultiplier"; readonly equipmentId?: string; readonly multiplier: number }
  /** Flat barrels/second that needs no equipment at all — a spur off somebody else's pipeline. */
  | { readonly kind: "flatCrude"; readonly barrelsPerSecond: number }
  /** Multiplies total refining throughput. */
  | { readonly kind: "refiningMultiplier"; readonly multiplier: number }
  /** Multiplies the barrels-per-litre figure. Below 1 means LESS crude per litre. */
  | { readonly kind: "efficiencyMultiplier"; readonly multiplier: number }
  /** Multiplies both tank and yard capacity. */
  | { readonly kind: "capacityMultiplier"; readonly multiplier: number }
  /** Turns on automatic shipping, at this fraction of a full tank. 1 means "only when full". */
  | { readonly kind: "autoShip"; readonly atFillFraction: number };

/** What has to be true before an upgrade is offered. Nothing here ever buys itself. */
export type FactoryUnlockCondition =
  | { readonly kind: "equipmentOwned"; readonly equipmentId: string; readonly atLeast: number }
  | { readonly kind: "upgradeOwned"; readonly upgradeId: string }
  | { readonly kind: "litresManufactured"; readonly atLeast: number };

export interface FactoryUpgradeDefinition {
  readonly id: string;
  readonly nameEn: string;
  readonly nameYue: string;
  readonly blurbEn: string;
  readonly blurbYue: string;
  readonly branch: FactoryUpgradeBranch;
  readonly cost: BigNum;
  readonly effect: FactoryUpgradeEffect;
  readonly unlockCondition: FactoryUnlockCondition;
}

function upgrade(
  id: string,
  nameEn: string,
  nameYue: string,
  blurbEn: string,
  blurbYue: string,
  branch: FactoryUpgradeBranch,
  cost: number,
  effect: FactoryUpgradeEffect,
  unlockCondition: FactoryUnlockCondition,
): FactoryUpgradeDefinition {
  return { id, nameEn, nameYue, blurbEn, blurbYue, branch, cost: bnFromNumber(cost), effect, unlockCondition };
}

/**
 * THE FACTORY UPGRADE TREE — fourteen of them, in four branches.
 *
 * THROUGHPUT makes the line move more per second. EFFICIENCY makes each litre cost less crude,
 * which is the only branch that makes an EXISTING line cheaper to run rather than bigger.
 * CAPACITY raises the ceiling the line stalls against. AUTOMATION hands the shipping press over
 * to a threshold, and is the only branch the player can switch off again.
 *
 * Nothing here unlocks itself. Each entry states a condition that only says whether the card is
 * OFFERED; buying it is still a cookie purchase through the one reducer seam, every time.
 */
export const FACTORY_UPGRADE_DEFINITIONS: readonly FactoryUpgradeDefinition[] = [
  // ---- throughput
  upgrade(
    "fx_wider_bore",
    "Wider Bore",
    "擴孔鑽井",
    "Re-drill every well half a hand wider. Each one lifts 50% more crude.",
    "每口井重新鑽闊半個手掌。每口都多抽 50% 原油。",
    "throughput",
    15_000,
    { kind: "intakeMultiplier", equipmentId: "crude_well", multiplier: 1.5 },
    { kind: "equipmentOwned", equipmentId: "crude_well", atLeast: 5 },
  ),
  upgrade(
    "fx_deep_drilling",
    "Deep Drilling",
    "深層鑽探",
    "Go down past the shallow pay zone. Wells double again.",
    "鑽穿淺層油區落去。啲井再翻一倍。",
    "throughput",
    250_000,
    { kind: "intakeMultiplier", equipmentId: "crude_well", multiplier: 2 },
    { kind: "equipmentOwned", equipmentId: "crude_well", atLeast: 25 },
  ),
  upgrade(
    "fx_pipeline_spur",
    "Pipeline Spur",
    "支線油管",
    "A tap into somebody else's trunk line. A tenth of a barrel a second, with no well behind it.",
    "喺人哋主幹油管開個掣。每秒零點一桶，後面唔使有井。",
    "throughput",
    150_000,
    { kind: "flatCrude", barrelsPerSecond: 0.1 },
    { kind: "equipmentOwned", equipmentId: "crude_importer", atLeast: 1 },
  ),
  upgrade(
    "fx_hot_feed",
    "Hot Feed",
    "熱進料",
    "Preheat the feedstock so the column never has to. Refining runs 50% faster.",
    "入料前先加熱，塔就唔使自己加。煉油快 50%。",
    "throughput",
    30_000,
    { kind: "refiningMultiplier", multiplier: 1.5 },
    { kind: "equipmentOwned", equipmentId: "refinery_still", atLeast: 5 },
  ),
  upgrade(
    "fx_continuous_run",
    "Continuous Run",
    "連續運轉",
    "Stop shutting down for turnaround. Refining doubles.",
    "唔再停爐大修。煉油產能翻一倍。",
    "throughput",
    500_000,
    { kind: "refiningMultiplier", multiplier: 2 },
    { kind: "equipmentOwned", equipmentId: "refinery_still", atLeast: 25 },
  ),
  // ---- efficiency
  upgrade(
    "fx_trayed_column",
    "Trayed Column",
    "板式塔",
    "Forty bubble-cap trays instead of a bare pipe. 15% less crude per litre.",
    "四十層泡罩塔板，唔再係一條光管。每公升慳 15% 原油。",
    "efficiency",
    60_000,
    { kind: "efficiencyMultiplier", multiplier: 0.85 },
    { kind: "equipmentOwned", equipmentId: "refinery_still", atLeast: 3 },
  ),
  upgrade(
    "fx_vacuum_distillation",
    "Vacuum Distillation",
    "真空蒸餾",
    "Drop the pressure and the heavy ends come over too. Another 20% off the crude bill.",
    "抽低氣壓，連重餾份都出到。原油單再減 20%。",
    "efficiency",
    900_000,
    { kind: "efficiencyMultiplier", multiplier: 0.8 },
    { kind: "equipmentOwned", equipmentId: "refinery_still", atLeast: 10 },
  ),
  upgrade(
    "fx_hydrocracking",
    "Hydrocracking",
    "加氫裂化",
    "Break the long chains with hydrogen. A quarter of the remaining crude bill disappears.",
    "用氫氣打斷長鏈。剩低嘅原油單再少四分之一。",
    "efficiency",
    20_000_000,
    { kind: "efficiencyMultiplier", multiplier: 0.75 },
    { kind: "equipmentOwned", equipmentId: "catalytic_cracker", atLeast: 5 },
  ),
  // ---- capacity
  upgrade(
    "fx_bunded_bay",
    "Bunded Bay",
    "圍堤油區",
    "Concrete kerbs and a drain. Every tank holds half again as much.",
    "石屎圍堤加去水位。每個油缸多裝一半。",
    "capacity",
    25_000,
    { kind: "capacityMultiplier", multiplier: 1.5 },
    { kind: "equipmentOwned", equipmentId: "storage_tank", atLeast: 2 },
  ),
  upgrade(
    "fx_floating_roof",
    "Floating Roof",
    "浮頂油缸",
    "The roof sits on the diesel, so there is no vapour space to lose. Capacity doubles.",
    "頂蓋浮喺柴油面，冇氣相空間可以走。容量翻一倍。",
    "capacity",
    400_000,
    { kind: "capacityMultiplier", multiplier: 2 },
    { kind: "equipmentOwned", equipmentId: "storage_tank", atLeast: 10 },
  ),
  upgrade(
    "fx_tank_farm",
    "Tank Farm",
    "油庫群",
    "Not a yard with tanks in it any more — a tank farm. Everything holds three times as much.",
    "唔再係油場擺幾個缸，而係成個油庫群。所有容量乘三。",
    "capacity",
    5_000_000,
    { kind: "capacityMultiplier", multiplier: 3 },
    { kind: "equipmentOwned", equipmentId: "storage_tank", atLeast: 25 },
  ),
  // ---- automation
  upgrade(
    "fx_depot_telemetry",
    "Depot Telemetry",
    "油庫遙測",
    "A level float wired to the depot. Ships automatically, but only once a tank is completely full.",
    "液位浮子接落油庫。可以自動出貨，不過要成缸裝滿先會出。",
    "automation",
    100_000,
    { kind: "autoShip", atFillFraction: 1 },
    { kind: "litresManufactured", atLeast: 25 },
  ),
  upgrade(
    "fx_dispatch_desk",
    "Dispatch Desk",
    "調度枱",
    "Somebody watching the gauge full time. Ships at half a tank instead of waiting for the top.",
    "有人成日睇住錶。裝到半缸就出貨，唔使等滿。",
    "automation",
    1_000_000,
    { kind: "autoShip", atFillFraction: 0.5 },
    { kind: "upgradeOwned", upgradeId: "fx_depot_telemetry" },
  ),
  upgrade(
    "fx_night_shift",
    "Night Shift",
    "夜更",
    "The desk is staffed around the clock. A quarter tank is enough to send a lorry.",
    "調度枱二十四小時有人。夠四分之一缸就開車。",
    "automation",
    20_000_000,
    { kind: "autoShip", atFillFraction: 0.25 },
    { kind: "upgradeOwned", upgradeId: "fx_dispatch_desk" },
  ),
];

export function getFactoryUpgradeDefinition(id: string): FactoryUpgradeDefinition {
  const def = FACTORY_UPGRADE_DEFINITIONS.find((u) => u.id === id);
  if (!def) throw new RangeError(`Unknown factory upgrade id: ${id}`);
  return def;
}

export function ownsFactoryUpgrade(state: DieselFactoryState, id: string): boolean {
  return state.upgradeIds.includes(id);
}

export function isFactoryUpgradeOffered(state: DieselFactoryState, condition: FactoryUnlockCondition): boolean {
  switch (condition.kind) {
    case "equipmentOwned":
      return equipmentOwned(state, condition.equipmentId) >= condition.atLeast;
    case "upgradeOwned":
      return ownsFactoryUpgrade(state, condition.upgradeId);
    case "litresManufactured":
      return state.lifetimeLitres >= condition.atLeast;
  }
}

// ------------------------------------------------------------------------- the ratings ----

/** Barrels of crude one litre of diesel costs before any efficiency upgrade. */
export const BASE_BARRELS_PER_LITRE = 2.5;
/** The drum the depot starts with, before a single tank is bought. */
export const BASE_LITRE_CAPACITY = 10;
/** The bare hardstanding the yard starts with. */
export const BASE_CRUDE_CAPACITY = 20;

/** Everything the floor is currently rated to do, derived from equipment plus upgrades. */
export interface FactoryRatings {
  /** Barrels a second the intake side pulls in. */
  readonly crudePerSecond: number;
  /** Litres a second the refining side could finish, given unlimited crude and empty tanks. */
  readonly refiningLitresPerSecond: number;
  /** Barrels of crude one litre currently costs. */
  readonly barrelsPerLitre: number;
  readonly litreCapacity: number;
  readonly crudeCapacity: number;
  /** Barrels a second the refining side WANTS, at the current efficiency. */
  readonly crudeDemandPerSecond: number;
  /** Fill fraction at which shipping happens by itself, or null when no automation is owned. */
  readonly autoShipAtFraction: number | null;
}

export function computeRatings(state: DieselFactoryState): FactoryRatings {
  const owned = FACTORY_UPGRADE_DEFINITIONS.filter((def) => ownsFactoryUpgrade(state, def.id));

  let crudePerSecond = 0;
  let refining = 0;
  let litreCapacity = BASE_LITRE_CAPACITY;
  let crudeCapacity = BASE_CRUDE_CAPACITY;
  let refiningBonus = 0;
  const intakeMultipliers = new Map<string, number>();
  let refiningMultiplier = 1;
  let efficiency = 1;
  let capacityMultiplier = 1;
  let autoShipAtFraction: number | null = null;

  for (const def of owned) {
    const effect = def.effect;
    switch (effect.kind) {
      case "intakeMultiplier": {
        const key = effect.equipmentId ?? "*";
        intakeMultipliers.set(key, (intakeMultipliers.get(key) ?? 1) * effect.multiplier);
        break;
      }
      case "flatCrude":
        crudePerSecond += effect.barrelsPerSecond;
        break;
      case "refiningMultiplier":
        refiningMultiplier *= effect.multiplier;
        break;
      case "efficiencyMultiplier":
        efficiency *= effect.multiplier;
        break;
      case "capacityMultiplier":
        capacityMultiplier *= effect.multiplier;
        break;
      case "autoShip":
        // The most generous automation owned wins: a Night Shift makes a Dispatch Desk's
        // half-tank rule irrelevant rather than fighting it.
        autoShipAtFraction =
          autoShipAtFraction === null ? effect.atFillFraction : Math.min(autoShipAtFraction, effect.atFillFraction);
        break;
    }
  }

  for (const entry of state.equipment) {
    if (entry.count <= 0) continue;
    const def = getEquipmentDefinition(entry.id);
    if (def.crudePerSecond) {
      const perUnit = def.crudePerSecond * (intakeMultipliers.get(def.id) ?? 1) * (intakeMultipliers.get("*") ?? 1);
      crudePerSecond += perUnit * entry.count;
    }
    if (def.litresPerSecond) refining += def.litresPerSecond * entry.count;
    if (def.litreCapacity) litreCapacity += def.litreCapacity * entry.count;
    if (def.crudeCapacity) crudeCapacity += def.crudeCapacity * entry.count;
    if (def.refiningBonus) refiningBonus += def.refiningBonus * entry.count;
  }

  const refiningLitresPerSecond = refining * refiningMultiplier * (1 + refiningBonus);
  const barrelsPerLitre = BASE_BARRELS_PER_LITRE * efficiency;

  return {
    crudePerSecond,
    refiningLitresPerSecond,
    barrelsPerLitre,
    litreCapacity: litreCapacity * capacityMultiplier,
    crudeCapacity: crudeCapacity * capacityMultiplier,
    crudeDemandPerSecond: refiningLitresPerSecond * barrelsPerLitre,
    autoShipAtFraction: state.autoShipEnabled ? autoShipAtFraction : null,
  };
}

/** Whether any automation upgrade has been bought at all — the toggle's own reveal. */
export function hasAutomation(state: DieselFactoryState): boolean {
  return FACTORY_UPGRADE_DEFINITIONS.some(
    (def) => def.effect.kind === "autoShip" && ownsFactoryUpgrade(state, def.id),
  );
}

// ------------------------------------------------------------------------------ the tick ----

/** What one slice of wall-clock actually did to the floor. Reported so the UI can show it. */
export interface FactoryTickResult {
  readonly state: DieselFactoryState;
  readonly crudeProduced: number;
  readonly crudeRefined: number;
  readonly litresProduced: number;
  /** True when the yard was full and intake had to be thrown away rather than stored. */
  readonly intakeStalled: boolean;
  /** True when the tanks were full and refining had to stop with crude still in the yard. */
  readonly refiningStalled: boolean;
}

/**
 * ONE SLICE OF THE PRODUCTION LINE, in order, with every stage limited by the one in front.
 *
 * The order matters and is deliberate: intake first (so crude bought this instant can be
 * refined this instant, which is how a real continuous line behaves), then refining, then the
 * caps. A stage that cannot run does not run — it does not borrow capacity from the next tick
 * and it does not quietly drop the constraint. That is the whole difference between this and
 * the depot it replaces.
 */
export function tickFactory(state: DieselFactoryState, seconds: number): FactoryTickResult {
  const idle: FactoryTickResult = {
    state,
    crudeProduced: 0,
    crudeRefined: 0,
    litresProduced: 0,
    intakeStalled: false,
    refiningStalled: false,
  };
  if (!Number.isFinite(seconds) || seconds <= 0) return idle;

  const ratings = computeRatings(state);

  // 1. INTAKE. The yard is finite, so a well pumping into a full yard is a well that stalls.
  const wanted = ratings.crudePerSecond * seconds;
  const yardRoom = Math.max(0, ratings.crudeCapacity - state.crude);
  const crudeProduced = Math.min(wanted, yardRoom);
  const intakeStalled = wanted > crudeProduced + 1e-12;
  let crude = state.crude + crudeProduced;

  // 2. REFINING. Limited three ways at once, and by whichever bites first: the throughput the
  //    units are rated for, the crude actually in the yard, and the room left in the tanks.
  const byThroughput = ratings.refiningLitresPerSecond * seconds;
  const byCrude = ratings.barrelsPerLitre > 0 ? crude / ratings.barrelsPerLitre : 0;
  const tankRoom = Math.max(0, ratings.litreCapacity - state.litres);
  const litresProduced = Math.max(0, Math.min(byThroughput, byCrude, tankRoom));
  // Stalled means the TANKS stopped it — not that there was no crude, which is a different
  // problem with a different fix and is reported separately by the readouts.
  const refiningStalled = Math.min(byThroughput, byCrude) > tankRoom + 1e-12;

  const crudeRefined = litresProduced * ratings.barrelsPerLitre;
  crude = Math.max(0, crude - crudeRefined);

  // A bare floor does nothing, and says so by returning the SAME object. That referential
  // stability is load-bearing: the factory panel subscribes to this subtree, and a factory with
  // no equipment in it must not re-render five times a second to show the same zeroes.
  if (crudeProduced === 0 && litresProduced === 0 && !refiningStalled) return idle;

  const next: DieselFactoryState = {
    ...state,
    crude,
    litres: Math.min(ratings.litreCapacity, state.litres + litresProduced),
    lifetimeCrude: state.lifetimeCrude + crudeProduced,
    lifetimeLitres: state.lifetimeLitres + litresProduced,
    stalledSeconds: refiningStalled ? state.stalledSeconds + seconds : state.stalledSeconds,
  };

  return { state: next, crudeProduced, crudeRefined, litresProduced, intakeStalled, refiningStalled };
}

// ----------------------------------------------------------------------------- shipping ----

/** How many WHOLE litres the depot could ship right now. A voucher's litres must be an integer. */
export function shippableLitres(state: DieselFactoryState): number {
  return Math.floor(state.litres + 1e-9);
}

/**
 * THE AMORTIZED RECEIPT.
 *
 * A voucher's `cookiesSpent` field used to be trivially true: the player pressed a button and
 * that many cookies left the account. Nothing buys a litre any more, so the honest question is
 * "what did these litres cost to make", and the honest answer is the share of everything spent
 * on the factory that this shipment represents:
 *
 *     cookiesInvested * (litres shipped / litres this factory has ever manufactured)
 *
 * That is a real figure with a real derivation, it stays a decimal string, and it stays a
 * receipt nobody has to do arithmetic on — so the ledger's version-1 schema is untouched. It is
 * an attribution, not a transaction, and the exchange document says exactly that.
 *
 * Zero when the factory has manufactured nothing, which cannot ship anything anyway.
 */
export function amortizedCookiesFor(state: DieselFactoryState, litres: number): BigNum {
  if (litres <= 0 || state.lifetimeLitres <= 0) return bnFromNumber(0);
  return bnMulScalar(state.cookiesInvested, litres / state.lifetimeLitres);
}

/** Litres automation would send right now, or 0 when it would not (or is not owned/enabled). */
export function autoShipQuantity(state: DieselFactoryState): number {
  const ratings = computeRatings(state);
  if (ratings.autoShipAtFraction === null) return 0;
  if (ratings.litreCapacity <= 0) return 0;
  if (state.litres / ratings.litreCapacity < ratings.autoShipAtFraction - 1e-9) return 0;
  return shippableLitres(state);
}

/** Convenience for the UI and for tests: the factory subtree of a whole game state. */
export function factoryOf(state: GameState): DieselFactoryState {
  return state.dieselFactory;
}
