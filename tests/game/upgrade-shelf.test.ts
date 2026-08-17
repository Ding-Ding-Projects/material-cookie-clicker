import { describe, expect, it } from "vitest";

import { bnFromNumber } from "../../src/shared/game/big-number.js";
import type { UpgradeDefinition } from "../../src/shared/game/upgrades.js";
import {
  buyableTickets,
  nearestLocked,
  ownedStamps,
  sortByNextAffordable,
  type ShelfCard,
  type ShelfCardState,
} from "../../src/renderer/game/upgrade-shelf.js";

function def(id: string, cost: number): UpgradeDefinition {
  return {
    id,
    nameEn: id,
    nameYue: id,
    cost: bnFromNumber(cost),
    effect: { kind: "globalCpsMultiplier", multiplier: 2 },
    unlockCondition: { kind: "always" },
  };
}

function card(id: string, cost: number, state: ShelfCardState, progressFraction: number | null = null): ShelfCard {
  return { def: def(id, cost), state, progressFraction };
}

describe("shelf arrangement: next-affordable-first", () => {
  it("puts the cheapest buyable ticket first", () => {
    const sorted = sortByNextAffordable([
      card("c", 1000, "buyable"),
      card("a", 10, "buyable"),
      card("b", 100, "buyable"),
    ]);
    expect(sorted.map((c) => c.def.id)).toEqual(["a", "b", "c"]);
  });

  it("sorts across magnitudes a plain number would lose", () => {
    const sorted = sortByNextAffordable([
      card("huge", 9e30, "buyable"),
      card("small", 5, "buyable"),
      card("mid", 4.4e19, "buyable"),
    ]);
    expect(sorted.map((c) => c.def.id)).toEqual(["small", "mid", "huge"]);
  });

  it("breaks ties on id, so the order never depends on authoring order", () => {
    const one = sortByNextAffordable([card("zeta", 50, "buyable"), card("alpha", 50, "buyable")]);
    const two = sortByNextAffordable([card("alpha", 50, "buyable"), card("zeta", 50, "buyable")]);
    expect(one.map((c) => c.def.id)).toEqual(["alpha", "zeta"]);
    expect(two.map((c) => c.def.id)).toEqual(one.map((c) => c.def.id));
  });

  it("does not mutate the array it was handed", () => {
    const input = [card("b", 20, "buyable"), card("a", 10, "buyable")];
    sortByNextAffordable(input);
    expect(input.map((c) => c.def.id)).toEqual(["b", "a"]);
  });
});

describe("shelf arrangement: which cards go where", () => {
  const cards = [
    card("owned-1", 10, "owned"),
    card("buy-2", 200, "buyable"),
    card("buy-1", 20, "buyable"),
    card("owned-2", 30, "owned"),
    card("locked-far", 40, "locked", 0.05),
    card("locked-near", 50, "locked", 0.9),
    card("locked-mid", 60, "locked", 0.5),
    card("locked-nocondition", 70, "locked", null),
  ];

  it("keeps owned cards in catalogue order and takes only owned ones", () => {
    expect(ownedStamps(cards).map((c) => c.def.id)).toEqual(["owned-1", "owned-2"]);
  });

  it("takes only buyable cards, arranged cheapest first", () => {
    expect(buyableTickets(cards).map((c) => c.def.id)).toEqual(["buy-1", "buy-2"]);
  });

  it("names the locked cards CLOSEST to unlocking, and only those", () => {
    expect(nearestLocked(cards, 2).map((c) => c.def.id)).toEqual(["locked-near", "locked-mid"]);
  });

  it("drops a locked card with no requirement to show, rather than drawing an empty track", () => {
    expect(nearestLocked(cards, 10).map((c) => c.def.id)).not.toContain("locked-nocondition");
  });

  it("honours the cap, including a cap of zero", () => {
    expect(nearestLocked(cards, 1)).toHaveLength(1);
    expect(nearestLocked(cards, 0)).toHaveLength(0);
    expect(nearestLocked(cards, -5)).toHaveLength(0);
  });

  it("sorts the three groups from the SAME list without any card appearing twice", () => {
    const all = [...ownedStamps(cards), ...buyableTickets(cards), ...nearestLocked(cards, 10)];
    expect(new Set(all.map((c) => c.def.id)).size).toBe(all.length);
  });
});
