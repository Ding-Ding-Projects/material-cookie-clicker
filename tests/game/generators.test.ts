import { describe, expect, it } from "vitest";
import { bnCompare, bnFromNumber, bnToNumber, type BigNum } from "../../src/shared/game/big-number";
import {
  costOfBulk,
  costOfNext,
  GENERATOR_DEFINITIONS,
  getGeneratorDefinition,
  maxAffordable,
} from "../../src/shared/game/generators";

/** Naive loop-based reference sum, used ONLY here to verify the closed-form formula. */
function naiveCostOfBulk(def: (typeof GENERATOR_DEFINITIONS)[number], ownedCount: number, quantity: number): BigNum {
  let total = bnFromNumber(0);
  for (let k = 0; k < quantity; k++) {
    const unitCost = costOfNext(def, ownedCount + k);
    total = addBn(total, unitCost);
  }
  return total;
}

function addBn(a: BigNum, b: BigNum): BigNum {
  // Local minimal add via number conversion is unsafe for huge magnitudes, but this helper
  // is only ever exercised for small n where numbers stay well within double precision.
  return bnFromNumber(bnToNumber(a) + bnToNumber(b));
}

describe("generator ladder", () => {
  it("has 21 tiers with a real theme progression", () => {
    expect(GENERATOR_DEFINITIONS).toHaveLength(21);
    const ids = GENERATOR_DEFINITIONS.map((g) => g.id);
    expect(new Set(ids).size).toBe(21); // no duplicate ids
    expect(ids[0]).toBe("cursor");
    expect(ids[ids.length - 1]).toBe("wokOfTheGods");
  });

  it("keeps Office Building ownership explicitly uncapped", () => {
    const office = getGeneratorDefinition("officeBuilding");
    expect(office.ownershipCap).toBeNull();
    expect(costOfNext(office, 1_000_000).exponent).toBeGreaterThan(10_000);
  });

  it("every tier costs several times more than the previous tier", () => {
    for (let i = 1; i < GENERATOR_DEFINITIONS.length; i++) {
      const ratio = GENERATOR_DEFINITIONS[i].baseCost / GENERATOR_DEFINITIONS[i - 1].baseCost;
      expect(ratio).toBeGreaterThan(3);
      expect(ratio).toBeLessThan(30);
    }
  });

  it("cost strictly increases tier over tier (monotonic ladder)", () => {
    for (let i = 1; i < GENERATOR_DEFINITIONS.length; i++) {
      expect(GENERATOR_DEFINITIONS[i].baseCost).toBeGreaterThan(GENERATOR_DEFINITIONS[i - 1].baseCost);
      expect(GENERATOR_DEFINITIONS[i].baseCps).toBeGreaterThan(GENERATOR_DEFINITIONS[i - 1].baseCps);
    }
  });

  it("every generator has a bilingual name", () => {
    for (const def of GENERATOR_DEFINITIONS) {
      expect(def.nameEn.length).toBeGreaterThan(0);
      expect(def.nameYue.length).toBeGreaterThan(0);
    }
  });
});

describe("costOfNext", () => {
  it("matches baseCost at zero owned", () => {
    const def = getGeneratorDefinition("cursor");
    expect(bnToNumber(costOfNext(def, 0))).toBeCloseTo(def.baseCost, 6);
  });

  it("grows by exactly costRatio per unit owned", () => {
    const def = getGeneratorDefinition("cursor");
    const c0 = bnToNumber(costOfNext(def, 0));
    const c1 = bnToNumber(costOfNext(def, 1));
    expect(c1 / c0).toBeCloseTo(def.costRatio, 6);
  });
});

describe("costOfBulk closed-form vs naive loop", () => {
  const cases: Array<{ generatorId: string; ownedCount: number; quantity: number }> = [
    { generatorId: "cursor", ownedCount: 0, quantity: 1 },
    { generatorId: "cursor", ownedCount: 0, quantity: 10 },
    { generatorId: "cursor", ownedCount: 5, quantity: 10 },
    { generatorId: "grandma", ownedCount: 3, quantity: 25 },
    { generatorId: "farm", ownedCount: 12, quantity: 7 },
  ];

  for (const { generatorId, ownedCount, quantity } of cases) {
    it(`agrees with naive loop for ${generatorId} at ${ownedCount} owned, buying ${quantity}`, () => {
      const def = getGeneratorDefinition(generatorId);
      const closedForm = costOfBulk(def, ownedCount, quantity);
      const naive = naiveCostOfBulk(def, ownedCount, quantity);
      const ratio = bnToNumber(closedForm) / bnToNumber(naive);
      expect(ratio).toBeCloseTo(1, 4);
    });
  }

  it("returns zero cost for zero or negative quantity", () => {
    const def = getGeneratorDefinition("cursor");
    expect(bnToNumber(costOfBulk(def, 0, 0))).toBe(0);
    expect(bnToNumber(costOfBulk(def, 0, -5))).toBe(0);
  });

  it("is O(1): buying 100,000 does not throw or hang and produces a finite huge result", () => {
    const def = getGeneratorDefinition("cursor");
    const result = costOfBulk(def, 0, 100000);
    expect(Number.isFinite(result.mantissa)).toBe(true);
    expect(Number.isFinite(result.exponent)).toBe(true);
  });
});

describe("generator ladder affordability pacing", () => {
  it("owning just 10 of a tier affords the next tier's first unit within a sane idle time (< 30 days)", () => {
    for (let i = 1; i < GENERATOR_DEFINITIONS.length; i++) {
      const prev = GENERATOR_DEFINITIONS[i - 1];
      const next = GENERATOR_DEFINITIONS[i];
      const cpsFromTenOwned = prev.baseCps * 10;
      const nextCost = bnToNumber(costOfNext(next, 0));
      const secondsNeeded = nextCost / cpsFromTenOwned;
      expect(secondsNeeded, `${prev.id} -> ${next.id}`).toBeLessThan(60 * 60 * 24 * 30);
    }
  });
});

describe("maxAffordable exactness at boundaries", () => {
  it("returns 0 when cookies are zero", () => {
    const def = getGeneratorDefinition("cursor");
    expect(maxAffordable(def, 0, bnFromNumber(0))).toBe(0);
  });

  it("returns 0 when cookies are just under the first unit's cost", () => {
    const def = getGeneratorDefinition("cursor");
    const justUnder = bnFromNumber(def.baseCost - 1);
    expect(maxAffordable(def, 0, justUnder)).toBe(0);
  });

  it("returns 1 when cookies exactly equal the first unit's cost", () => {
    const def = getGeneratorDefinition("cursor");
    expect(maxAffordable(def, 0, bnFromNumber(def.baseCost))).toBe(1);
  });

  it("never returns a count whose bulk cost exceeds available cookies, and n+1 always would exceed it", () => {
    const def = getGeneratorDefinition("grandma");
    const cookies = bnFromNumber(500000);
    const n = maxAffordable(def, 2, cookies);
    expect(bnCompare(costOfBulk(def, 2, n), cookies)).toBeLessThanOrEqual(0);
    expect(bnCompare(costOfBulk(def, 2, n + 1), cookies)).toBeGreaterThan(0);
  });

  it("handles a huge cookie balance without iterating (returns quickly, large n)", () => {
    const def = getGeneratorDefinition("cursor");
    const n = maxAffordable(def, 0, bnFromNumber(1e50));
    expect(n).toBeGreaterThan(100);
    expect(bnCompare(costOfBulk(def, 0, n), bnFromNumber(1e50))).toBeLessThanOrEqual(0);
  });
});
