import { describe, expect, it } from "vitest";

import { bnFromNumber, bnToNumber } from "../../src/shared/game/big-number.js";
import { createSplitMix32Rng } from "../../src/shared/game/golden-cookie.js";
import { performPrestige, survivingUpgrades } from "../../src/shared/game/prestige.js";
import {
  canBuyRebornNode,
  rebornMultipliers,
  rebornNodeState,
  rebornPermanentSlots,
  rebornPointsSpent,
  rebornRetainFraction,
  rebornStartingCookies,
  REBORN_NODE_DEFINITIONS,
  getRebornNodeDefinition,
} from "../../src/shared/game/reborn.js";
import { applyGameAction, createInitialGameState, type ReducerCtx } from "../../src/shared/game/reducer.js";
import { computeMultipliers } from "../../src/shared/game/upgrades.js";
import type { GameState } from "../../src/shared/game/types.js";

const NOW = "2025-01-01T00:00:00.000Z";
const ctx: ReducerCtx = { now: () => Date.parse(NOW), rng: createSplitMix32Rng(7) };

function stateWith(points: number, nodes: readonly string[] = [], extra: Partial<GameState> = {}): GameState {
  const base = createInitialGameState(NOW);
  return {
    ...base,
    ...extra,
    prestige: {
      ascensionPoints: points,
      totalPrestigeCount: 0,
      permanentUnlockIds: [],
      rebornNodeIds: nodes,
      ...(extra.prestige ?? {}),
    },
  };
}

describe("the Reborn tree definitions", () => {
  it("has unique ids and a real prerequisite chain", () => {
    const ids = REBORN_NODE_DEFINITIONS.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const def of REBORN_NODE_DEFINITIONS) {
      if (def.requires === null) continue;
      expect(ids).toContain(def.requires);
      // A prerequisite always appears EARLIER in the list, so a branch reads top to bottom.
      expect(ids.indexOf(def.requires)).toBeLessThan(ids.indexOf(def.id));
    }
  });

  it("never asks for a prerequisite that costs more than the node behind it saves", () => {
    // Sanity on the shape of the tree: a deeper node is always at least as dear as its parent.
    for (const def of REBORN_NODE_DEFINITIONS) {
      if (def.requires === null) continue;
      expect(def.cost).toBeGreaterThanOrEqual(getRebornNodeDefinition(def.requires).cost);
    }
  });

  it("names every node in both languages", () => {
    for (const def of REBORN_NODE_DEFINITIONS) {
      expect(def.nameEn.length).toBeGreaterThan(0);
      expect(def.nameYue.length).toBeGreaterThan(0);
    }
  });
});

describe("Reborn node purchase rules", () => {
  it("refuses a node whose prerequisite is not owned, however many points are in hand", () => {
    expect(canBuyRebornNode("reborn_red_packet", [], 10_000)).toBe(false);
    expect(rebornNodeState(getRebornNodeDefinition("reborn_red_packet"), [], 10_000)).toBe("locked");
  });

  it("refuses a node the player cannot afford, even with the prerequisite owned", () => {
    expect(canBuyRebornNode("reborn_red_packet", ["reborn_lucky_pocket"], 1)).toBe(false);
  });

  it("allows a root node once the points are there", () => {
    expect(canBuyRebornNode("reborn_lucky_pocket", [], 0)).toBe(false);
    expect(canBuyRebornNode("reborn_lucky_pocket", [], 1)).toBe(true);
  });

  it("never allows buying the same node twice", () => {
    expect(canBuyRebornNode("reborn_lucky_pocket", ["reborn_lucky_pocket"], 500)).toBe(false);
  });

  it("spends the points through the reducer and records the node", () => {
    const before = stateWith(5);
    const after = applyGameAction(before, { type: "buyRebornNode", nodeId: "reborn_lucky_pocket" }, ctx);
    expect(after.prestige.ascensionPoints).toBe(4);
    expect(after.prestige.rebornNodeIds).toEqual(["reborn_lucky_pocket"]);
  });

  it("refuses silently rather than throwing when the purchase is not allowed", () => {
    const before = stateWith(0);
    const after = applyGameAction(before, { type: "buyRebornNode", nodeId: "reborn_lucky_pocket" }, ctx);
    expect(after).toBe(before);
  });

  it("refuses an unknown node id", () => {
    const before = stateWith(999);
    expect(applyGameAction(before, { type: "buyRebornNode", nodeId: "nope" }, ctx)).toBe(before);
  });

  it("reports what has been sunk into the tree", () => {
    expect(rebornPointsSpent([])).toBe(0);
    expect(rebornPointsSpent(["reborn_lucky_pocket", "reborn_red_packet"])).toBe(6);
  });
});

describe("Reborn effects", () => {
  it("multiplies nothing when no node is owned", () => {
    expect(rebornMultipliers([])).toEqual({ clickMultiplier: 1, globalCpsMultiplier: 1 });
  });

  it("composes its multipliers multiplicatively", () => {
    const owned = ["reborn_second_wind", "reborn_heavenly_dough", "reborn_borrowed_hands"];
    expect(rebornMultipliers(owned).globalCpsMultiplier).toBeCloseTo(1.25 * 1.5, 10);
    expect(rebornMultipliers(owned).clickMultiplier).toBeCloseTo(2, 10);
  });

  it("reaches the derived multipliers the whole game reads", () => {
    const state = stateWith(0, ["reborn_second_wind"]);
    expect(computeMultipliers(state).globalCpsMultiplier).toBeCloseTo(1.25, 10);
  });

  it("takes the deepest inheritance node rather than adding them up", () => {
    expect(bnToNumber(rebornStartingCookies([]))).toBe(0);
    expect(bnToNumber(rebornStartingCookies(["reborn_lucky_pocket"]))).toBeCloseTo(10_000, 0);
    expect(
      bnToNumber(rebornStartingCookies(["reborn_lucky_pocket", "reborn_red_packet"])),
    ).toBeCloseTo(1_000_000, 0);
  });

  it("adds retention fractions and clamps the total at one whole run", () => {
    expect(rebornRetainFraction([])).toBe(0);
    expect(rebornRetainFraction(["reborn_dog_eared_catalogue"])).toBeCloseTo(0.1, 10);
    expect(
      rebornRetainFraction([
        "reborn_dog_eared_catalogue",
        "reborn_annotated_catalogue",
        "reborn_memorised_catalogue",
      ]),
    ).toBeCloseTo(0.5, 10);
  });

  it("adds permanent slots", () => {
    expect(rebornPermanentSlots([])).toBe(0);
    expect(rebornPermanentSlots(["reborn_pinned_recipe", "reborn_pinned_shelf"])).toBe(3);
  });
});

describe("pinning upgrades into permanent slots", () => {
  const owning = (ids: readonly string[]): Partial<GameState> => ({
    upgrades: ids.map((id) => ({ id, purchasedAtTickCount: 0 })),
  });

  it("refuses a pin when no slot has been bought", () => {
    const before = stateWith(0, [], owning(["reinforced_finger"]));
    const after = applyGameAction(
      before,
      { type: "setPermanentUpgrade", upgradeId: "reinforced_finger", pinned: true },
      ctx,
    );
    expect(after.prestige.permanentUnlockIds).toEqual([]);
  });

  it("refuses to pin an upgrade the player does not own", () => {
    const before = stateWith(0, ["reborn_dog_eared_catalogue", "reborn_pinned_recipe"]);
    const after = applyGameAction(
      before,
      { type: "setPermanentUpgrade", upgradeId: "reinforced_finger", pinned: true },
      ctx,
    );
    expect(after.prestige.permanentUnlockIds).toEqual([]);
  });

  it("pins within the slot budget and refuses past it", () => {
    const nodes = ["reborn_dog_eared_catalogue", "reborn_pinned_recipe"]; // exactly one slot
    let state = stateWith(0, nodes, owning(["reinforced_finger", "sturdier_ovens"]));
    state = applyGameAction(state, { type: "setPermanentUpgrade", upgradeId: "reinforced_finger", pinned: true }, ctx);
    expect(state.prestige.permanentUnlockIds).toEqual(["reinforced_finger"]);
    state = applyGameAction(state, { type: "setPermanentUpgrade", upgradeId: "sturdier_ovens", pinned: true }, ctx);
    expect(state.prestige.permanentUnlockIds).toEqual(["reinforced_finger"]);
  });

  it("unpins, freeing the slot again", () => {
    const nodes = ["reborn_dog_eared_catalogue", "reborn_pinned_recipe"];
    let state = stateWith(0, nodes, owning(["reinforced_finger", "sturdier_ovens"]));
    state = applyGameAction(state, { type: "setPermanentUpgrade", upgradeId: "reinforced_finger", pinned: true }, ctx);
    state = applyGameAction(state, { type: "setPermanentUpgrade", upgradeId: "reinforced_finger", pinned: false }, ctx);
    expect(state.prestige.permanentUnlockIds).toEqual([]);
    state = applyGameAction(state, { type: "setPermanentUpgrade", upgradeId: "sturdier_ovens", pinned: true }, ctx);
    expect(state.prestige.permanentUnlockIds).toEqual(["sturdier_ovens"]);
  });
});

describe("what a reborn reset keeps", () => {
  const fiveUpgrades = [
    { id: "reveal_shop_sign", purchasedAtTickCount: 1 },
    { id: "reveal_upgrade_catalogue", purchasedAtTickCount: 2 },
    { id: "reinforced_finger", purchasedAtTickCount: 3 },
    { id: "sturdier_ovens", purchasedAtTickCount: 4 },
    { id: "callused_knuckle", purchasedAtTickCount: 5 },
  ];

  it("keeps nothing at all with no memory branch and no pins", () => {
    const state = stateWith(0, [], { upgrades: fiveUpgrades });
    expect(survivingUpgrades(state)).toEqual([]);
  });

  it("keeps the newest slice the memory branch bought, floored", () => {
    // 0.25 of five unpinned upgrades is one, and one is what it keeps — never rounded up.
    const state = stateWith(0, ["reborn_dog_eared_catalogue", "reborn_annotated_catalogue"], {
      upgrades: fiveUpgrades,
    });
    expect(rebornRetainFraction(state.prestige.rebornNodeIds ?? [])).toBeCloseTo(0.25, 10);
    expect(survivingUpgrades(state).map((u) => u.id)).toEqual(["callused_knuckle"]);
  });

  it("keeps a pinned upgrade regardless of the retention fraction", () => {
    const state = stateWith(0, ["reborn_dog_eared_catalogue", "reborn_pinned_recipe"], {
      upgrades: fiveUpgrades,
      prestige: {
        ascensionPoints: 0,
        totalPrestigeCount: 0,
        permanentUnlockIds: ["reveal_shop_sign"],
        rebornNodeIds: ["reborn_dog_eared_catalogue", "reborn_pinned_recipe"],
      },
    });
    expect(survivingUpgrades(state).map((u) => u.id)).toContain("reveal_shop_sign");
  });

  it("carries the tree, the pins, the points and the achievements through a prestige", () => {
    const state = stateWith(4, ["reborn_lucky_pocket", "reborn_second_wind"], {
      lifetimeCookies: bnFromNumber(8e12),
      cookies: bnFromNumber(8e12),
      generators: [{ id: "cursor", count: 30 }],
      upgrades: fiveUpgrades,
      achievements: [{ id: "first_bite", unlockedAtIso: NOW }],
    });
    const { state: after, pointsEarned } = performPrestige(state);

    expect(pointsEarned).toBe(2);
    expect(after.prestige.ascensionPoints).toBe(6);
    expect(after.prestige.rebornNodeIds).toEqual(["reborn_lucky_pocket", "reborn_second_wind"]);
    expect(after.achievements).toHaveLength(1);
    expect(after.generators.every((g) => g.count === 0)).toBe(true);
    // Lucky Pocket puts ten thousand cookies in the new run's jar, and says so in lifetime too.
    expect(bnToNumber(after.cookies)).toBeCloseTo(10_000, 0);
    expect(bnToNumber(after.lifetimeCookies)).toBeCloseTo(10_000, 0);
  });

  it("still starts a new run empty when no inheritance node is owned", () => {
    const state = stateWith(0, [], { lifetimeCookies: bnFromNumber(8e12), cookies: bnFromNumber(8e12) });
    const { state: after } = performPrestige(state);
    expect(bnToNumber(after.cookies)).toBe(0);
    expect(bnToNumber(after.lifetimeCookies)).toBe(0);
  });
});
