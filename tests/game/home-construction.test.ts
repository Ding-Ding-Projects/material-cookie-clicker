import { describe, expect, it } from "vitest";

import { bnFromNumber, bnToNumber } from "../../src/shared/game/big-number";
import { computeDisclosure } from "../../src/shared/game/disclosure";
import {
  buildProgressFraction,
  buildSpeedFraction,
  BUILD_SPEED_CAP,
  canStartConstruction,
  computeHomeBonuses,
  cozinessCpsMultiplier,
  COZINESS_COEFFICIENT,
  COZINESS_SCALE,
  createInitialHomeState,
  FURNITURE_DEFINITIONS,
  furnitureForRoom,
  getFurnitureDefinition,
  getRoomDefinition,
  isBlueprintOffered,
  isRoomBuilt,
  MAX_COZINESS,
  remainingBuildMs,
  requiredBuildMs,
  roomCoziness,
  ROOM_DEFINITIONS,
  tickHome,
  totalCoziness,
  type HomeConstructionState,
} from "../../src/shared/game/home-construction";
import { applyGameAction, type ReducerCtx } from "../../src/shared/game/reducer";
import { decodeSave, encodeSave } from "../../src/shared/game/save-codec";
import { computeMultipliers } from "../../src/shared/game/upgrades";
import type { GameState } from "../../src/shared/game/types";
import { fixedRng, freshState } from "./test-helpers";

function ctxAt(epochMs = 0): ReducerCtx {
  return { now: () => epochMs, rng: fixedRng(0.5) };
}

/** A game state with the Property Deed bought (which reveals the house) and cookies to spend. */
function deedState(cookies: number, overrides: Partial<GameState> = {}): GameState {
  return freshState({
    cookies: bnFromNumber(cookies),
    upgrades: [
      { id: "reveal_shop_sign", purchasedAtTickCount: 0 },
      { id: "reveal_property_deed", purchasedAtTickCount: 0 },
    ],
    ...overrides,
  });
}

/** A house with the stated rooms already built and furnished, and nothing under construction. */
function house(rooms: Record<string, string[]>, overrides: Partial<HomeConstructionState> = {}): HomeConstructionState {
  return {
    ...createInitialHomeState(),
    blueprintIds: Object.keys(rooms),
    rooms: Object.entries(rooms).map(([roomId, furnitureIds]) => ({ roomId, furnitureIds })),
    ...overrides,
  };
}

/** Runs `seconds` of game time through the reducer in `sliceSeconds` slices, like the app does. */
function runTicks(state: GameState, seconds: number, sliceSeconds = 0.2): GameState {
  let current = state;
  const slices = Math.round(seconds / sliceSeconds);
  for (let i = 0; i < slices; i += 1) {
    current = applyGameAction(current, { type: "tick", elapsedMs: sliceSeconds * 1000 }, ctxAt(i));
  }
  return current;
}

/* ================================================================== the catalogue itself ==== */

describe("home construction: the catalogue", () => {
  it("has six rooms, of which exactly one — the Kitchen — starts the house", () => {
    expect(ROOM_DEFINITIONS).toHaveLength(6);
    const roots = ROOM_DEFINITIONS.filter((r) => r.requiresRoomId === null);
    expect(roots.map((r) => r.id)).toEqual(["kitchen"]);
    // Every other room hangs off the Kitchen and off nothing else, which is what makes the
    // remaining five a free choice rather than a chain.
    for (const def of ROOM_DEFINITIONS.filter((r) => r.requiresRoomId !== null)) {
      expect(def.requiresRoomId).toBe("kitchen");
    }
  });

  it("has at least twenty-four pieces of furniture, every one of them in a real room", () => {
    expect(FURNITURE_DEFINITIONS.length).toBeGreaterThanOrEqual(24);
    for (const item of FURNITURE_DEFINITIONS) {
      expect(() => getRoomDefinition(item.roomId)).not.toThrow();
      expect(item.coziness).toBeGreaterThan(0);
      expect(item.cost).toBeGreaterThan(0);
    }
  });

  it("names everything in both languages, with no id used twice", () => {
    const ids = new Set<string>();
    for (const def of [...ROOM_DEFINITIONS, ...FURNITURE_DEFINITIONS]) {
      expect(def.nameEn.length).toBeGreaterThan(0);
      expect(def.nameYue.length).toBeGreaterThan(0);
      expect(def.blurbEn.length).toBeGreaterThan(0);
      expect(def.blurbYue.length).toBeGreaterThan(0);
      expect(ids.has(def.id)).toBe(false);
      ids.add(def.id);
    }
  });

  it("gives every room at least four pieces of furniture to put in it", () => {
    for (const room of ROOM_DEFINITIONS) {
      expect(furnitureForRoom(room.id).length).toBeGreaterThanOrEqual(4);
    }
  });

  it("throws rather than guessing for an unknown id", () => {
    expect(() => getRoomDefinition("conservatory")).toThrow(RangeError);
    expect(() => getFurnitureDefinition("chandelier")).toThrow(RangeError);
  });
});

/* ==================================================================== blueprint gating ==== */

describe("home construction: blueprints are bought, never given", () => {
  it("offers only the Kitchen on an empty plot", () => {
    const home = createInitialHomeState();
    const offered = ROOM_DEFINITIONS.filter((r) => isBlueprintOffered(home, r.id)).map((r) => r.id);
    expect(offered).toEqual(["kitchen"]);
  });

  it("opens the other five the moment the Kitchen is BUILT — not when it is bought", () => {
    const planned = { ...createInitialHomeState(), blueprintIds: ["kitchen"] };
    expect(ROOM_DEFINITIONS.filter((r) => isBlueprintOffered(planned, r.id)).map((r) => r.id)).toEqual([]);

    const built = house({ kitchen: [] });
    const offered = ROOM_DEFINITIONS.filter((r) => isBlueprintOffered(built, r.id)).map((r) => r.id);
    expect(offered).toEqual(["pantry", "parlour", "bedroom", "workshop", "garden"]);
  });

  it("refuses to sell a blueprint before the Property Deed is owned", () => {
    const noDeed = freshState({ cookies: bnFromNumber(1e9) });
    const after = applyGameAction(noDeed, { type: "buyHomeBlueprint", roomId: "kitchen" }, ctxAt());
    expect(after).toBe(noDeed);
    expect(computeDisclosure(noDeed).homeConstruction).toBe(false);
  });

  it("sells the Kitchen blueprint for its printed price and records the spend", () => {
    const before = deedState(10_000);
    const after = applyGameAction(before, { type: "buyHomeBlueprint", roomId: "kitchen" }, ctxAt());

    expect(after.homeConstruction.blueprintIds).toEqual(["kitchen"]);
    expect(bnToNumber(after.cookies)).toBeCloseTo(10_000 - 5_000, 6);
    expect(bnToNumber(after.homeConstruction.cookiesInvested)).toBeCloseTo(5_000, 6);
  });

  it("refuses the Pantry blueprint until the Kitchen really exists", () => {
    const before = deedState(1e9);
    const refused = applyGameAction(before, { type: "buyHomeBlueprint", roomId: "pantry" }, ctxAt());
    expect(refused).toBe(before);

    const withKitchen = deedState(1e9, { homeConstruction: house({ kitchen: [] }) });
    const allowed = applyGameAction(withKitchen, { type: "buyHomeBlueprint", roomId: "pantry" }, ctxAt());
    expect(allowed.homeConstruction.blueprintIds).toContain("pantry");
  });

  it("refuses a second copy of a blueprint, and refuses one it cannot afford", () => {
    const owned = deedState(1e9, { homeConstruction: { ...createInitialHomeState(), blueprintIds: ["kitchen"] } });
    expect(applyGameAction(owned, { type: "buyHomeBlueprint", roomId: "kitchen" }, ctxAt())).toBe(owned);

    const broke = deedState(4_999);
    expect(applyGameAction(broke, { type: "buyHomeBlueprint", roomId: "kitchen" }, ctxAt())).toBe(broke);
  });

  it("nothing auto-unlocks: a fresh save owns no blueprint and builds nothing", () => {
    const fresh = freshState();
    expect(fresh.homeConstruction).toEqual(createInitialHomeState());
    const ticked = runTicks(fresh, 600);
    expect(ticked.homeConstruction.blueprintIds).toEqual([]);
    expect(ticked.homeConstruction.rooms).toEqual([]);
    expect(ticked.homeConstruction.build).toBeNull();
  });
});

/* ================================================================ construction arithmetic ==== */

describe("home construction: the timing is real elapsed milliseconds", () => {
  it("starts a Kitchen at zero elapsed against its full printed sixty seconds", () => {
    const before = deedState(1e6, { homeConstruction: { ...createInitialHomeState(), blueprintIds: ["kitchen"] } });
    const after = applyGameAction(before, { type: "startHomeConstruction", roomId: "kitchen" }, ctxAt());

    expect(after.homeConstruction.build).toEqual({ roomId: "kitchen", elapsedMs: 0, requiredMs: 60_000 });
    expect(bnToNumber(after.cookies)).toBeCloseTo(1e6 - 10_000, 6);
    expect(buildProgressFraction(after.homeConstruction)).toBe(0);
    expect(remainingBuildMs(after.homeConstruction)).toBe(60_000);
  });

  it("advances by exactly the seconds it is handed, and finishes not one tick early", () => {
    const started = applyGameAction(
      deedState(1e6, { homeConstruction: { ...createInitialHomeState(), blueprintIds: ["kitchen"] } }),
      { type: "startHomeConstruction", roomId: "kitchen" },
      ctxAt(),
    );

    // 59.8 seconds of a 60-second build: still a building site, and the remaining time is the
    // literal difference rather than a rounded guess.
    const nearlyThere = runTicks(started, 59.8);
    expect(nearlyThere.homeConstruction.build).not.toBeNull();
    expect(remainingBuildMs(nearlyThere.homeConstruction)).toBeCloseTo(200, 6);
    expect(buildProgressFraction(nearlyThere.homeConstruction)!).toBeCloseTo(59_800 / 60_000, 9);
    expect(isRoomBuilt(nearlyThere.homeConstruction, "kitchen")).toBe(false);

    // The tick that crosses the line finishes it, and the room arrives empty.
    const finished = runTicks(nearlyThere, 0.2);
    expect(finished.homeConstruction.build).toBeNull();
    expect(finished.homeConstruction.rooms).toEqual([{ roomId: "kitchen", furnitureIds: [] }]);
  });

  it("clamps a slice longer than the whole build and does NOT bank the surplus", () => {
    const state: HomeConstructionState = {
      ...createInitialHomeState(),
      blueprintIds: ["kitchen", "pantry"],
      build: { roomId: "kitchen", elapsedMs: 0, requiredMs: 60_000 },
    };
    // An hour of offline progress against a one-minute build finishes the Kitchen and stops.
    const result = tickHome(state, 3_600);
    expect(result.completedRoomId).toBe("kitchen");
    expect(result.state.build).toBeNull();
    expect(result.state.rooms).toEqual([{ roomId: "kitchen", furnitureIds: [] }]);
    // The 59 spare minutes are gone, not credited against the Pantry that was never started.
    expect(tickHome(result.state, 0).state).toBe(result.state);
  });

  it("returns the same object for a quiet site, so nothing re-renders for nothing", () => {
    const quiet = house({ kitchen: [] });
    expect(tickHome(quiet, 10).state).toBe(quiet);
    expect(tickHome(quiet, 10).completedRoomId).toBeNull();

    // And a nonsensical slice is refused rather than run backwards.
    const active: HomeConstructionState = {
      ...quiet,
      build: { roomId: "pantry", elapsedMs: 5_000, requiredMs: 120_000 },
    };
    expect(tickHome(active, 0).state).toBe(active);
    expect(tickHome(active, -5).state).toBe(active);
    expect(tickHome(active, Number.NaN).state).toBe(active);
  });
});

/* ================================================================== the one-at-a-time queue ==== */

describe("home construction: one site, one crew", () => {
  it("refuses to start a second room while one is going up", () => {
    const started = applyGameAction(
      deedState(1e9, {
        homeConstruction: { ...createInitialHomeState(), blueprintIds: ["kitchen"] },
      }),
      { type: "startHomeConstruction", roomId: "kitchen" },
      ctxAt(),
    );
    const withPantryPlan: GameState = {
      ...started,
      homeConstruction: { ...started.homeConstruction, blueprintIds: ["kitchen", "pantry"] },
    };

    expect(canStartConstruction(withPantryPlan.homeConstruction, "pantry")).toBe(false);
    const refused = applyGameAction(withPantryPlan, { type: "startHomeConstruction", roomId: "pantry" }, ctxAt());
    // Refused outright: not queued behind the Kitchen, and — the part that matters — not paid for.
    expect(refused).toBe(withPantryPlan);
    expect(refused.homeConstruction.build!.roomId).toBe("kitchen");
  });

  it("frees the site the instant the room is finished, and not before", () => {
    const started = applyGameAction(
      deedState(1e9, { homeConstruction: { ...createInitialHomeState(), blueprintIds: ["kitchen", "pantry"] } }),
      { type: "startHomeConstruction", roomId: "kitchen" },
      ctxAt(),
    );
    expect(canStartConstruction(started.homeConstruction, "pantry")).toBe(false);

    const finished = runTicks(started, 60);
    expect(finished.homeConstruction.build).toBeNull();
    expect(canStartConstruction(finished.homeConstruction, "pantry")).toBe(true);

    const second = applyGameAction(finished, { type: "startHomeConstruction", roomId: "pantry" }, ctxAt());
    expect(second.homeConstruction.build!.roomId).toBe("pantry");
    expect(second.homeConstruction.rooms.map((r) => r.roomId)).toEqual(["kitchen"]);
  });

  it("refuses to start a room whose blueprint was never bought, or that already stands", () => {
    const noPlan = deedState(1e9);
    expect(applyGameAction(noPlan, { type: "startHomeConstruction", roomId: "kitchen" }, ctxAt())).toBe(noPlan);

    const alreadyBuilt = deedState(1e9, { homeConstruction: house({ kitchen: [] }) });
    expect(applyGameAction(alreadyBuilt, { type: "startHomeConstruction", roomId: "kitchen" }, ctxAt())).toBe(
      alreadyBuilt,
    );
  });

  it("refuses to start a build it cannot pay the builders for", () => {
    const broke = deedState(9_999, { homeConstruction: { ...createInitialHomeState(), blueprintIds: ["kitchen"] } });
    expect(applyGameAction(broke, { type: "startHomeConstruction", roomId: "kitchen" }, ctxAt())).toBe(broke);
  });

  it("lets the five free rooms be built in any order the player likes", () => {
    let state = deedState(1e12, { homeConstruction: house({ kitchen: [] }) });
    // Garden before Bedroom, which no rule anywhere forbids.
    for (const roomId of ["garden", "bedroom"]) {
      state = applyGameAction(state, { type: "buyHomeBlueprint", roomId }, ctxAt());
      state = applyGameAction(state, { type: "startHomeConstruction", roomId }, ctxAt());
      state = runTicks(state, getRoomDefinition(roomId).buildMs / 1000, 5);
    }
    expect(state.homeConstruction.rooms.map((r) => r.roomId)).toEqual(["kitchen", "garden", "bedroom"]);
  });
});

/* ============================================================ furniture, bonuses and coziness ==== */

describe("home construction: furniture", () => {
  it("goes only into a room that is actually built, and only once", () => {
    const noRoom = deedState(1e9);
    expect(applyGameAction(noRoom, { type: "buyHomeFurniture", furnitureId: "kt_stone_oven" }, ctxAt())).toBe(noRoom);

    const withKitchen = deedState(1e9, { homeConstruction: house({ kitchen: [] }) });
    const bought = applyGameAction(withKitchen, { type: "buyHomeFurniture", furnitureId: "kt_stone_oven" }, ctxAt());
    expect(bought.homeConstruction.rooms[0]!.furnitureIds).toEqual(["kt_stone_oven"]);
    expect(bnToNumber(bought.cookies)).toBeCloseTo(1e9 - 25_000, 6);

    // Twice is refused, and so is a piece for a room that does not exist yet.
    expect(applyGameAction(bought, { type: "buyHomeFurniture", furnitureId: "kt_stone_oven" }, ctxAt())).toBe(bought);
    expect(applyGameAction(bought, { type: "buyHomeFurniture", furnitureId: "gd_lemon_tree" }, ctxAt())).toBe(bought);
  });

  it("refuses a piece it cannot afford", () => {
    const broke = deedState(24_999, { homeConstruction: house({ kitchen: [] }) });
    expect(applyGameAction(broke, { type: "buyHomeFurniture", furnitureId: "kt_stone_oven" }, ctxAt())).toBe(broke);
  });

  it("multiplies its production and click bonuses together, and nothing else", () => {
    // Stone Oven +2% production, Copper Pots +1.5% production, Marble Bench +3% per click.
    const home = house({ kitchen: ["kt_stone_oven", "kt_copper_pots", "kt_marble_bench"] });
    const bonuses = computeHomeBonuses(home);

    const cozinessOnly = cozinessCpsMultiplier(totalCoziness(home));
    expect(bonuses.globalCpsMultiplier).toBeCloseTo(cozinessOnly * 1.02 * 1.015, 12);
    expect(bonuses.clickMultiplier).toBeCloseTo(1.03, 12);
    expect(bonuses.buildSpeedFraction).toBe(0);
  });

  it("adds build-speed bonuses and applies them when a build STARTS, not while it runs", () => {
    // Step Ladder 5% + Mantel Clock 8% = 13% off the printed build time.
    const home = house({ kitchen: [], pantry: ["pt_step_ladder"], parlour: ["pl_mantel_clock"] });
    expect(buildSpeedFraction(home)).toBeCloseTo(0.13, 12);
    // Bedroom prints ten minutes; with 13% off it is 522 seconds.
    expect(requiredBuildMs(home, "bedroom")).toBe(522_000);

    let state = deedState(1e12, { homeConstruction: { ...home, blueprintIds: [...home.blueprintIds, "bedroom"] } });
    state = applyGameAction(state, { type: "startHomeConstruction", roomId: "bedroom" }, ctxAt());
    expect(state.homeConstruction.build!.requiredMs).toBe(522_000);

    // Buying the Joiner's Bench mid-build does NOT shorten the build already under way: the
    // countdown the player is watching can only go one direction.
    const withWorkshop: GameState = {
      ...state,
      homeConstruction: {
        ...state.homeConstruction,
        rooms: [...state.homeConstruction.rooms, { roomId: "workshop", furnitureIds: ["ws_joiners_bench"] }],
      },
    };
    expect(withWorkshop.homeConstruction.build!.requiredMs).toBe(522_000);
    // But the NEXT build gets it.
    expect(requiredBuildMs(withWorkshop.homeConstruction, "bedroom")).toBe(600_000 * (1 - 0.25));
  });

  it("caps the build-speed bonus, and today's catalogue does not reach the cap", () => {
    const everything = house(
      Object.fromEntries(ROOM_DEFINITIONS.map((r) => [r.id, furnitureForRoom(r.id).map((f) => f.id)])),
    );
    expect(buildSpeedFraction(everything)).toBeCloseTo(0.4, 12);
    expect(buildSpeedFraction(everything)).toBeLessThan(BUILD_SPEED_CAP);
    // A build can therefore never take zero time.
    for (const room of ROOM_DEFINITIONS) {
      expect(requiredBuildMs(everything, room.id)).toBeGreaterThan(0);
    }
  });
});

describe("home construction: the coziness curve", () => {
  it("is exactly 1 for a house with nothing in it", () => {
    expect(cozinessCpsMultiplier(0)).toBe(1);
    expect(totalCoziness(createInitialHomeState())).toBe(0);
    expect(computeHomeBonuses(createInitialHomeState()).globalCpsMultiplier).toBe(1);
  });

  it("counts a room's shell plus everything standing in it, and nothing else", () => {
    const home = house({ kitchen: ["kt_stone_oven", "kt_kettle"] });
    const expected = getRoomDefinition("kitchen").baseCoziness + 8 + 4;
    expect(roomCoziness(home, "kitchen")).toBe(expected);
    expect(totalCoziness(home)).toBe(expected);
    // A room that is not built contributes nothing, not even its shell.
    expect(roomCoziness(home, "garden")).toBe(0);
  });

  it("follows the documented logarithmic formula at its documented sample points", () => {
    const at = (c: number) => 1 + COZINESS_COEFFICIENT * Math.log1p(c / COZINESS_SCALE);
    expect(cozinessCpsMultiplier(36)).toBeCloseTo(at(36), 12);
    expect(cozinessCpsMultiplier(36)).toBeCloseTo(1.0385, 4);
    expect(cozinessCpsMultiplier(100)).toBeCloseTo(1.0752, 4);
    expect(cozinessCpsMultiplier(MAX_COZINESS)).toBeCloseTo(1.1187, 4);
  });

  it("tops out at 249 coziness, worth under 12% on the curve alone", () => {
    const everything = house(
      Object.fromEntries(ROOM_DEFINITIONS.map((r) => [r.id, furnitureForRoom(r.id).map((f) => f.id)])),
    );
    expect(totalCoziness(everything)).toBe(MAX_COZINESS);
    expect(MAX_COZINESS).toBe(249);
    expect(cozinessCpsMultiplier(MAX_COZINESS)).toBeLessThan(1.12);
  });

  // The figure the panel actually prints is the curve AND the furniture's production bonuses
  // multiplied together, and the module documents that ceiling explicitly. Asserted here so a
  // new piece of furniture cannot quietly turn the house into the main economy.
  it("pays x1.51 on a completely finished house, curve and furniture together", () => {
    const everything = house(
      Object.fromEntries(ROOM_DEFINITIONS.map((r) => [r.id, furnitureForRoom(r.id).map((f) => f.id)])),
    );
    const bonuses = computeHomeBonuses(everything);
    expect(bonuses.globalCpsMultiplier).toBeCloseTo(1.5108, 3);
    expect(bonuses.globalCpsMultiplier).toBeLessThan(1.6);
    // And the click side is smaller still: four pieces, 3% to 6% each.
    expect(bonuses.clickMultiplier).toBeCloseTo(1.03 * 1.04 * 1.05 * 1.06, 12);
    expect(bonuses.clickMultiplier).toBeLessThan(1.2);
  });

  it("has diminishing returns: the second half of the house is worth less than the first", () => {
    const firstHalf = cozinessCpsMultiplier(125) - cozinessCpsMultiplier(0);
    const secondHalf = cozinessCpsMultiplier(250) - cozinessCpsMultiplier(125);
    expect(secondHalf).toBeLessThan(firstHalf);
  });

  it("reaches the cookie economy through the one computeMultipliers seam, exactly once", () => {
    const bare = deedState(0);
    expect(computeMultipliers(bare).globalCpsMultiplier).toBeCloseTo(1, 12);

    const cozy = deedState(0, { homeConstruction: house({ kitchen: ["kt_stone_oven", "kt_marble_bench"] }) });
    const bonuses = computeHomeBonuses(cozy.homeConstruction);
    const multipliers = computeMultipliers(cozy);
    expect(multipliers.globalCpsMultiplier).toBeCloseTo(bonuses.globalCpsMultiplier, 12);
    expect(multipliers.clickMultiplier).toBeCloseTo(bonuses.clickMultiplier, 12);
  });
});

/* ======================================================================== the save round-trip ==== */

describe("home construction: save round-trip", () => {
  it("carries blueprints, rooms, furniture, the live build and the spend through unchanged", () => {
    const state = deedState(1_234, {
      homeConstruction: {
        blueprintIds: ["kitchen", "pantry", "parlour"],
        rooms: [
          { roomId: "kitchen", furnitureIds: ["kt_stone_oven", "kt_kettle"] },
          { roomId: "pantry", furnitureIds: ["pt_jar_wall"] },
        ],
        build: { roomId: "parlour", elapsedMs: 41_500, requiredMs: 300_000 },
        cookiesInvested: bnFromNumber(987_654),
      },
    });

    const decoded = decodeSave(JSON.parse(JSON.stringify(encodeSave(state))));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.state.homeConstruction).toEqual(state.homeConstruction);
    // And the build resumes from where it really was, rather than restarting.
    expect(remainingBuildMs(decoded.state.homeConstruction)).toBe(258_500);
  });

  it("gives a save written before the house existed an empty plot, and no deed", () => {
    const withoutHouse = encodeSave(freshState()) as Record<string, unknown>;
    delete withoutHouse.homeConstruction;

    const decoded = decodeSave(JSON.parse(JSON.stringify(withoutHouse)));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.state.homeConstruction).toEqual(createInitialHomeState());
    // The default hands out no surface either: the Property Deed is still bought like everything else.
    expect(computeDisclosure(decoded.state).homeConstruction).toBe(false);
  });
});

/* ============================================================================ the disclosure ==== */

describe("home construction: the Property Deed", () => {
  it("is chained behind the Shop Sign and costs 2,000", () => {
    const noSign = freshState({ cookies: bnFromNumber(1e6) });
    const refused = applyGameAction(noSign, { type: "buyUpgrade", upgradeId: "reveal_property_deed" }, ctxAt());
    expect(refused).toBe(noSign);

    const withSign = freshState({
      cookies: bnFromNumber(2_000),
      upgrades: [{ id: "reveal_shop_sign", purchasedAtTickCount: 0 }],
    });
    const bought = applyGameAction(withSign, { type: "buyUpgrade", upgradeId: "reveal_property_deed" }, ctxAt());
    expect(bnToNumber(bought.cookies)).toBeCloseTo(0, 6);
    expect(computeDisclosure(bought).homeConstruction).toBe(true);
    expect(computeDisclosure(bought).consoles.home).toBe(true);
  });

  it("reveals the house and NOTHING else — not the factory, not the depot", () => {
    const deed = deedState(0);
    const disclosure = computeDisclosure(deed);
    expect(disclosure.homeConstruction).toBe(true);
    expect(disclosure.dieselFactory).toBe(false);
    expect(disclosure.dieselDepot).toBe(false);
    expect(disclosure.consoles.factory).toBe(false);
  });
});
