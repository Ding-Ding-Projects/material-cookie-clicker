import { describe, expect, it } from "vitest";

import { bnFromNumber, bnToNumber } from "../../src/shared/game/big-number";
import {
  amortizedCookiesFor,
  autoShipQuantity,
  BASE_BARRELS_PER_LITRE,
  BASE_CRUDE_CAPACITY,
  BASE_LITRE_CAPACITY,
  computeRatings,
  createInitialFactoryState,
  equipmentBulkCost,
  equipmentCost,
  EQUIPMENT_COST_RATIO,
  EQUIPMENT_DEFINITIONS,
  FACTORY_UPGRADE_DEFINITIONS,
  getEquipmentDefinition,
  hasAutomation,
  shippableLitres,
  tickFactory,
  type DieselFactoryState,
} from "../../src/shared/game/diesel-factory";
import { computeDisclosure } from "../../src/shared/game/disclosure";
import { applyGameAction, type ReducerCtx } from "../../src/shared/game/reducer";
import { decodeSave, encodeSave } from "../../src/shared/game/save-codec";
import type { GameState } from "../../src/shared/game/types";
import { fixedRng, freshState } from "./test-helpers";

function ctxAt(epochMs = 0): ReducerCtx {
  return { now: () => epochMs, rng: fixedRng(0.5) };
}

/** A floor with a stated set of equipment on it, and nothing else. */
function floor(equipment: Record<string, number>, overrides: Partial<DieselFactoryState> = {}): DieselFactoryState {
  return {
    ...createInitialFactoryState(),
    equipment: Object.entries(equipment).map(([id, count]) => ({ id, count })),
    ...overrides,
  };
}

/** A game state with the Fuel Contract bought (which reveals the factory) and cookies to spend. */
function factoryState(cookies: number, overrides: Partial<GameState> = {}): GameState {
  return freshState({
    cookies: bnFromNumber(cookies),
    upgrades: [
      { id: "reveal_shop_sign", purchasedAtTickCount: 0 },
      { id: "reveal_fuel_contract", purchasedAtTickCount: 0 },
    ],
    ...overrides,
  });
}

describe("diesel factory: a bare floor manufactures nothing", () => {
  it("has no intake, no refining, and only the starting drum and hardstanding", () => {
    const ratings = computeRatings(createInitialFactoryState());
    expect(ratings.crudePerSecond).toBe(0);
    expect(ratings.refiningLitresPerSecond).toBe(0);
    expect(ratings.litreCapacity).toBe(BASE_LITRE_CAPACITY);
    expect(ratings.crudeCapacity).toBe(BASE_CRUDE_CAPACITY);
  });

  it("returns the very same state object from a tick, so nothing re-renders for it", () => {
    const bare = createInitialFactoryState();
    const result = tickFactory(bare, 60);
    expect(result.state).toBe(bare);
    expect(result.litresProduced).toBe(0);
  });

  it("ignores a zero or negative slice of time", () => {
    const built = floor({ crude_well: 1, refinery_still: 1 });
    expect(tickFactory(built, 0).state).toBe(built);
    expect(tickFactory(built, -5).state).toBe(built);
  });
});

describe("diesel factory: the tick arithmetic", () => {
  it("pulls exactly the rated crude out of the ground", () => {
    // One well is 0.05 barrels a second, so ten seconds is half a barrel.
    const result = tickFactory(floor({ crude_well: 1 }), 10);
    expect(result.crudeProduced).toBeCloseTo(0.5, 9);
    expect(result.state.crude).toBeCloseTo(0.5, 9);
    expect(result.state.lifetimeCrude).toBeCloseTo(0.5, 9);
  });

  it("converts crude into litres at the stated barrels-per-litre rate", () => {
    // One still is rated 0.02 L/s. Over 100 seconds that is 2 litres, needing 2 x 2.5 = 5
    // barrels — which is exactly what one well produces in the same 100 seconds.
    const result = tickFactory(floor({ crude_well: 1, refinery_still: 1 }), 100);
    expect(result.litresProduced).toBeCloseTo(2, 6);
    expect(result.crudeRefined).toBeCloseTo(2 * BASE_BARRELS_PER_LITRE, 6);
    expect(result.state.crude).toBeCloseTo(0, 6);
  });

  it("one well feeds exactly one still — the line balances at 1:1", () => {
    const ratings = computeRatings(floor({ crude_well: 1, refinery_still: 1 }));
    expect(ratings.crudeDemandPerSecond).toBeCloseTo(ratings.crudePerSecond, 9);
  });

  it("refines only what the yard actually holds when the wells cannot keep up", () => {
    // Ten stills want 0.5 barrels a second; one well supplies 0.05. Over 10 seconds the yard
    // receives 0.5 barrels, which is 0.2 litres — nowhere near the 2 litres of throughput.
    const result = tickFactory(floor({ crude_well: 1, refinery_still: 10 }), 10);
    expect(result.litresProduced).toBeCloseTo(0.5 / BASE_BARRELS_PER_LITRE, 9);
    expect(result.state.crude).toBeCloseTo(0, 9);
  });

  it("stops refining honestly when the tanks are full, and leaves the crude in the yard", () => {
    // No tanks bought, so the ceiling is the 10-litre starting drum. A hundred barrels already
    // in the yard could make forty litres and the columns are rated to do it, but the drum
    // stops at ten — and the twenty-five barrels those ten litres cost are the only ones spent.
    const result = tickFactory(floor({ crude_well: 40, refinery_still: 40 }, { crude: 100 }), 1_000);
    expect(result.state.litres).toBeCloseTo(BASE_LITRE_CAPACITY, 9);
    expect(result.litresProduced).toBeCloseTo(BASE_LITRE_CAPACITY, 9);
    expect(result.refiningStalled).toBe(true);
    expect(result.state.crude).toBeCloseTo(100 - BASE_LITRE_CAPACITY * BASE_BARRELS_PER_LITRE, 6);
    expect(result.state.stalledSeconds).toBe(1_000);
  });

  it("makes the yard, not the drum, the first thing a fresh floor runs out of", () => {
    // Starting from empty the yard cap (20 barrels) bites before the drum (10 litres) does:
    // twenty barrels is eight litres. That is the honest answer, and it is why the first
    // Storage Tank raises both numbers at once.
    const result = tickFactory(floor({ crude_well: 40, refinery_still: 40 }), 1_000);
    expect(result.state.litres).toBeCloseTo(BASE_CRUDE_CAPACITY / BASE_BARRELS_PER_LITRE, 6);
    expect(result.intakeStalled).toBe(true);
  });

  it("stops intake honestly when the yard is full too", () => {
    // Wells and no refining at all: the yard fills to its cap and then the wells stall.
    const result = tickFactory(floor({ crude_well: 100 }), 10_000);
    expect(result.state.crude).toBeCloseTo(BASE_CRUDE_CAPACITY, 9);
    expect(result.intakeStalled).toBe(true);
    expect(result.litresProduced).toBe(0);
  });

  it("never manufactures a litre it did not have the crude for", () => {
    // Refining units and no intake whatsoever.
    const result = tickFactory(floor({ refinery_still: 50 }), 500);
    expect(result.litresProduced).toBe(0);
    expect(result.state.litres).toBe(0);
  });

  it("splits one long slice the same way as many short ones, within floating-point reach", () => {
    const built = floor({ crude_well: 4, refinery_still: 2, storage_tank: 4 });
    const oneGo = tickFactory(built, 200).state;
    let stepped = built;
    for (let i = 0; i < 1_000; i += 1) stepped = tickFactory(stepped, 0.2).state;
    expect(stepped.litres).toBeCloseTo(oneGo.litres, 6);
  });
});

describe("diesel factory: equipment costs", () => {
  it("charges the stated base cost for the very first unit of every line", () => {
    for (const def of EQUIPMENT_DEFINITIONS) {
      expect(bnToNumber(equipmentCost(def, 0))).toBeCloseTo(def.baseCost, 6);
    }
  });

  it("raises the price 15% a unit, the same house ratio a generator tier uses", () => {
    const well = getEquipmentDefinition("crude_well");
    expect(bnToNumber(equipmentCost(well, 1))).toBeCloseTo(well.baseCost * EQUIPMENT_COST_RATIO, 4);
    expect(bnToNumber(equipmentCost(well, 5))).toBeCloseTo(well.baseCost * Math.pow(EQUIPMENT_COST_RATIO, 5), 3);
  });

  it("costs the same whether units are bought together or one at a time", () => {
    const tank = getEquipmentDefinition("storage_tank");
    let separately = 0;
    for (let i = 0; i < 7; i += 1) separately += bnToNumber(equipmentCost(tank, 3 + i));
    expect(bnToNumber(equipmentBulkCost(tank, 3, 7))).toBeCloseTo(separately, 2);
  });

  it("charges nothing for a non-positive quantity", () => {
    const tank = getEquipmentDefinition("storage_tank");
    expect(bnToNumber(equipmentBulkCost(tank, 0, 0))).toBe(0);
    expect(bnToNumber(equipmentBulkCost(tank, 0, -4))).toBe(0);
  });

  it("deducts exactly that cost through the reducer and puts the units on the floor", () => {
    const before = factoryState(10_000);
    const after = applyGameAction(before, { type: "buyFactoryEquipment", equipmentId: "crude_well", quantity: 3 }, ctxAt());
    const expected = bnToNumber(equipmentBulkCost(getEquipmentDefinition("crude_well"), 0, 3));

    expect(after.dieselFactory.equipment).toEqual([{ id: "crude_well", count: 3 }]);
    expect(bnToNumber(after.cookies)).toBeCloseTo(10_000 - expected, 3);
    // Everything spent on the plant is remembered, because it is the amortization numerator.
    expect(bnToNumber(after.dieselFactory.cookiesInvested)).toBeCloseTo(expected, 3);
  });

  it("refuses a purchase the player cannot afford, changing nothing at all", () => {
    const before = factoryState(100);
    expect(applyGameAction(before, { type: "buyFactoryEquipment", equipmentId: "crude_well", quantity: 1 }, ctxAt())).toBe(before);
  });
});

describe("diesel factory: the upgrade tree", () => {
  it("offers at least twelve upgrades across all four branches", () => {
    expect(FACTORY_UPGRADE_DEFINITIONS.length).toBeGreaterThanOrEqual(12);
    for (const branch of ["throughput", "efficiency", "capacity", "automation"] as const) {
      expect(FACTORY_UPGRADE_DEFINITIONS.some((u) => u.branch === branch)).toBe(true);
    }
  });

  it("gives every upgrade a unique id", () => {
    const ids = FACTORY_UPGRADE_DEFINITIONS.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("refuses an upgrade whose condition is not met, however many cookies are on the table", () => {
    const before = factoryState(1e12);
    // Wider Bore asks for five wells; this floor has none.
    expect(applyGameAction(before, { type: "buyFactoryUpgrade", upgradeId: "fx_wider_bore" }, ctxAt())).toBe(before);
  });

  it("buys the upgrade once its condition is met, and never twice", () => {
    let state = factoryState(1e12, {});
    state = { ...state, dieselFactory: floor({ crude_well: 5 }) };
    const bought = applyGameAction(state, { type: "buyFactoryUpgrade", upgradeId: "fx_wider_bore" }, ctxAt());
    expect(bought.dieselFactory.upgradeIds).toEqual(["fx_wider_bore"]);
    expect(applyGameAction(bought, { type: "buyFactoryUpgrade", upgradeId: "fx_wider_bore" }, ctxAt())).toBe(bought);
  });

  it("throughput upgrades multiply the intake they name and nothing else", () => {
    const plain = computeRatings(floor({ crude_well: 10, crude_importer: 1 }));
    const bored = computeRatings(floor({ crude_well: 10, crude_importer: 1 }, { upgradeIds: ["fx_wider_bore"] }));
    // Ten wells go from 0.5 to 0.75; the importer's 0.5 is untouched.
    expect(plain.crudePerSecond).toBeCloseTo(1.0, 9);
    expect(bored.crudePerSecond).toBeCloseTo(1.25, 9);
  });

  it("efficiency upgrades reduce the crude each litre costs", () => {
    const plain = computeRatings(floor({ refinery_still: 1 }));
    const trayed = computeRatings(floor({ refinery_still: 1 }, { upgradeIds: ["fx_trayed_column"] }));
    expect(plain.barrelsPerLitre).toBeCloseTo(BASE_BARRELS_PER_LITRE, 9);
    expect(trayed.barrelsPerLitre).toBeCloseTo(BASE_BARRELS_PER_LITRE * 0.85, 9);
    expect(trayed.crudeDemandPerSecond).toBeLessThan(plain.crudeDemandPerSecond);
  });

  it("capacity upgrades raise the ceiling the line stalls against", () => {
    const plain = computeRatings(floor({ storage_tank: 4 }));
    const bunded = computeRatings(floor({ storage_tank: 4 }, { upgradeIds: ["fx_bunded_bay"] }));
    expect(plain.litreCapacity).toBeCloseTo(BASE_LITRE_CAPACITY + 4 * 25, 9);
    expect(bunded.litreCapacity).toBeCloseTo((BASE_LITRE_CAPACITY + 4 * 25) * 1.5, 9);
  });

  it("pumps boost every refining unit together", () => {
    const plain = computeRatings(floor({ refinery_still: 10 }));
    const pumped = computeRatings(floor({ refinery_still: 10, transfer_pump: 2 }));
    expect(pumped.refiningLitresPerSecond).toBeCloseTo(plain.refiningLitresPerSecond * 1.16, 9);
  });
});

describe("diesel factory: automation", () => {
  it("is off, and unavailable, until an automation upgrade is bought", () => {
    const bare = floor({ storage_tank: 1 }, { litres: 35 });
    expect(hasAutomation(bare)).toBe(false);
    expect(autoShipQuantity(bare)).toBe(0);
  });

  it("still ships nothing while the player's own switch is off", () => {
    const owned = floor({ storage_tank: 1 }, { litres: 35, upgradeIds: ["fx_depot_telemetry"] });
    expect(hasAutomation(owned)).toBe(true);
    expect(autoShipQuantity(owned)).toBe(0);
  });

  it("ships only at the threshold the best automation owned actually allows", () => {
    // One tank: capacity 35 litres. Telemetry waits for a completely full tank.
    const telemetry = floor({ storage_tank: 1 }, {
      litres: 20,
      upgradeIds: ["fx_depot_telemetry"],
      autoShipEnabled: true,
    });
    expect(autoShipQuantity(telemetry)).toBe(0);
    expect(autoShipQuantity({ ...telemetry, litres: 35 })).toBe(35);

    // A Dispatch Desk sends at half a tank, so the same 20 litres go now.
    const desk = { ...telemetry, upgradeIds: ["fx_depot_telemetry", "fx_dispatch_desk"] };
    expect(autoShipQuantity(desk)).toBe(20);
  });

  it("ships through a plain tick, and can never send more than the tank holds", () => {
    const state = factoryState(0, {});
    const running: GameState = {
      ...state,
      dieselFactory: floor({ storage_tank: 1 }, {
        litres: 35,
        lifetimeLitres: 35,
        upgradeIds: ["fx_depot_telemetry"],
        autoShipEnabled: true,
      }),
    };
    const ticked = applyGameAction(running, { type: "tick", elapsedMs: 200 }, ctxAt());
    expect(ticked.dieselDepot.litresMinted).toBe(35);
    expect(ticked.dieselDepot.vouchersMinted).toBe(1);
    expect(ticked.dieselFactory.litres).toBeCloseTo(0, 9);
  });
});

describe("diesel factory: shipping draws down real stock", () => {
  it("ships only whole litres, keeping the remainder in the tank", () => {
    expect(shippableLitres(floor({}, { litres: 3.8 }))).toBe(3);
    expect(shippableLitres(floor({}, { litres: 0.9 }))).toBe(0);
  });

  it("attributes zero cookies when the factory has manufactured nothing", () => {
    const never = floor({}, { cookiesInvested: bnFromNumber(50_000) });
    expect(bnToNumber(amortizedCookiesFor(never, 5))).toBe(0);
  });

  it("attributes the shipment's exact share of what the plant cost", () => {
    const made = floor({}, { litres: 10, lifetimeLitres: 40, cookiesInvested: bnFromNumber(80_000) });
    expect(bnToNumber(amortizedCookiesFor(made, 10))).toBeCloseTo(20_000, 3);
  });
});

describe("diesel factory: reveal gating", () => {
  it("is hidden, and unbuyable, before the Fuel Contract is bought", () => {
    const before = freshState({ cookies: bnFromNumber(1e12) });
    expect(computeDisclosure(before).dieselFactory).toBe(false);
    expect(computeDisclosure(before).consoles.factory).toBe(false);
    expect(applyGameAction(before, { type: "buyFactoryEquipment", equipmentId: "crude_well", quantity: 1 }, ctxAt())).toBe(before);
  });

  it("appears the moment the Fuel Contract is bought, and grants no equipment with it", () => {
    const before = freshState({
      cookies: bnFromNumber(500),
      upgrades: [{ id: "reveal_shop_sign", purchasedAtTickCount: 0 }],
    });
    const after = applyGameAction(before, { type: "buyUpgrade", upgradeId: "reveal_fuel_contract" }, ctxAt());
    expect(computeDisclosure(after).dieselFactory).toBe(true);
    expect(computeDisclosure(after).consoles.factory).toBe(true);
    // A reveal buys a surface, never a number. The floor is still bare.
    expect(after.dieselFactory).toEqual(before.dieselFactory);
  });

  it("keeps the factory ticking only where it was revealed — a bare floor is a no-op anyway", () => {
    const revealed = factoryState(0);
    const ticked = applyGameAction(revealed, { type: "tick", elapsedMs: 5_000 }, ctxAt());
    expect(ticked.dieselFactory).toBe(revealed.dieselFactory);
  });
});

describe("diesel factory: the save round trip", () => {
  it("carries the whole subtree across encode and decode", () => {
    const built: GameState = {
      ...factoryState(1_000),
      dieselFactory: floor({ crude_well: 6, refinery_still: 2, storage_tank: 3 }, {
        upgradeIds: ["fx_wider_bore", "fx_bunded_bay"],
        crude: 12.5,
        litres: 7.25,
        lifetimeCrude: 900.5,
        lifetimeLitres: 360.25,
        cookiesInvested: bnFromNumber(123_456),
        autoShipEnabled: true,
        stalledSeconds: 42,
      }),
    };

    const decoded = decodeSave(encodeSave(built));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.state.dieselFactory).toEqual(built.dieselFactory);
    // And it still computes the same ratings on the other side, which is the point of storing it.
    expect(computeRatings(decoded.state.dieselFactory)).toEqual(computeRatings(built.dieselFactory));
  });

  it("gives a save from before the factory an empty floor rather than a free one", () => {
    const fresh = freshState();
    expect(fresh.dieselFactory).toEqual(createInitialFactoryState());
    const decoded = decodeSave(encodeSave(fresh));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.state.dieselFactory.equipment).toEqual([]);
    expect(decoded.state.dieselFactory.litres).toBe(0);
  });
});
