import { describe, expect, it } from "vitest";

import { bnFromNumber, bnToNumber } from "../../src/shared/game/big-number";
import { createSplitMix32Rng } from "../../src/shared/game/golden-cookie";
import { applyGameAction, type ReducerCtx } from "../../src/shared/game/reducer";
import {
  BIGGER_WHACK_RADIUS_PX,
  buyRaidConsumable,
  decodeRandomEvents,
  encodeRandomEvents,
  createInitialRaidConsumables,
  createInitialRandomEventsState,
  DEFAULT_RANDOM_EVENT_CONFIG,
  getRaidConsumableDefinition,
  halveHp,
  isRaidConsumableAtCap,
  miceWithinWhackRadius,
  MOUSE_RAID_DEFINITION,
  mouseRaidDefenceReward,
  raidConsumablePrice,
  RAID_CONSUMABLE_DEFINITIONS,
  rollRaidMice,
  tickRandomEvents,
  totalShare,
  whackMice,
  type RaidConsumableId,
  type RaidConsumablesState,
  type RaidMouse,
  type RandomEventConfig,
  type RandomEventsState,
} from "../../src/shared/game/random-events";
import type { GameState } from "../../src/shared/game/types";
import { freshState, fixedRng } from "./test-helpers";

/* ------------------------------------------------------------------------------ helpers */

function producing(cookies = 1e9): GameState {
  return freshState({
    generators: [{ id: "cursor", count: 100 }],
    cookies: bnFromNumber(cookies),
    lifetimeCookies: bnFromNumber(cookies * 2),
  });
}

const QUIET: RandomEventConfig = {
  ...DEFAULT_RANDOM_EVENT_CONFIG,
  minDelayMs: 1_000_000_000,
  maxDelayMs: 1_000_000_000,
  cooldownMs: 1_000_000_000,
};

function ctxAt(epochMs: number): ReducerCtx {
  return { now: () => epochMs, rng: fixedRng(0.5), randomEventConfig: QUIET };
}

function stocked(counts: Partial<Record<RaidConsumableId, number>>): RaidConsumablesState {
  const base = createInitialRaidConsumables();
  return {
    whack_pass: { ...base.whack_pass, stock: counts.whack_pass ?? 0 },
    bigger_whack: { ...base.bigger_whack, stock: counts.bigger_whack ?? 0 },
    half_hp_whack: { ...base.half_hp_whack, stock: counts.half_hp_whack ?? 0 },
  };
}

function raidState(mice: readonly RaidMouse[], overrides: Partial<RandomEventsState> = {}): RandomEventsState {
  return {
    ...createInitialRandomEventsState(),
    raidNextEligibleAtEpochMs: 10_000_000,
    active: {
      id: "mouse_raid",
      startedAtEpochMs: 0,
      endsAtEpochMs: MOUSE_RAID_DEFINITION.durationMs,
      pendingTargetIds: mice.map((mouse) => mouse.id),
      claimedCount: 0,
      mice,
      startingShare: totalShare(mice),
      armed: [],
    },
    ...overrides,
  };
}

function ordinary(count: number): readonly RaidMouse[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `mouse:${i}`,
    hp: 1,
    maxHp: 1,
    share: 1,
    fat: false,
  }));
}

/* --------------------------------------------------------------------- mice and hit points */

describe("raid mice: hit points and the fat one", () => {
  it("gives a small raid nothing but one-hit mice", () => {
    for (const count of [3]) {
      const mice = rollRaidMice(count, createSplitMix32Rng(1), false);
      expect(mice).toHaveLength(count);
      expect(mice.every((mouse) => mouse.hp === 1 && mouse.maxHp === 1 && !mouse.fat)).toBe(true);
      expect(totalShare(mice)).toBe(count);
    }
  });

  it("puts exactly one fat mouse in the larger raids, worth two shares and two or three hits", () => {
    for (const count of [4, 5]) {
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        const mice = rollRaidMice(count, createSplitMix32Rng(seed), false);
        const fat = mice.filter((mouse) => mouse.fat);
        expect(fat).toHaveLength(1);
        expect(fat[0].share).toBe(2);
        expect(fat[0].maxHp).toBeGreaterThanOrEqual(2);
        expect(fat[0].maxHp).toBeLessThanOrEqual(3);
        expect(fat[0].hp).toBe(fat[0].maxHp);
        expect(totalShare(mice)).toBe(count + 1);
      }
    }
  });

  it("halves hit points rounding up, so nothing ever needs zero hits", () => {
    expect(halveHp(1)).toBe(1);
    expect(halveHp(2)).toBe(1);
    expect(halveHp(3)).toBe(2);
    expect(halveHp(4)).toBe(2);
    expect(halveHp(5)).toBe(3);
  });

  it("applies the halving to a whole raid without touching what it started with", () => {
    const full = rollRaidMice(5, createSplitMix32Rng(9), false);
    const halved = rollRaidMice(5, createSplitMix32Rng(9), true);
    expect(halved.map((mouse) => mouse.maxHp)).toEqual(full.map((mouse) => mouse.maxHp));
    expect(halved.map((mouse) => mouse.hp)).toEqual(full.map((mouse) => halveHp(mouse.maxHp)));
    expect(totalShare(halved)).toBe(totalShare(full));
  });

  it("takes several whacks to see a fat mouse off, and one for everything else", () => {
    const mice: readonly RaidMouse[] = [
      { id: "mouse:0", hp: 1, maxHp: 1, share: 1, fat: false },
      { id: "mouse:1", hp: 3, maxHp: 3, share: 2, fat: true },
    ];
    let state = raidState(mice);
    const game = producing();

    state = whackMice(state, game, ["mouse:1"], 1_000, fixedRng(0.5)).randomEvents;
    expect(state.active?.mice?.find((mouse) => mouse.id === "mouse:1")?.hp).toBe(2);
    expect(state.active?.claimedCount).toBe(0);

    state = whackMice(state, game, ["mouse:1"], 1_100, fixedRng(0.5)).randomEvents;
    state = whackMice(state, game, ["mouse:1"], 1_200, fixedRng(0.5)).randomEvents;
    expect(state.active?.pendingTargetIds).toEqual(["mouse:0"]);
    expect(state.active?.claimedCount).toBe(1);
  });

  it("splits the theft by share, so the fat mouse getting away costs double", () => {
    const mice: readonly RaidMouse[] = [
      { id: "mouse:0", hp: 1, maxHp: 1, share: 1, fat: false },
      { id: "mouse:1", hp: 1, maxHp: 1, share: 1, fat: false },
      { id: "mouse:2", hp: 1, maxHp: 1, share: 2, fat: true },
    ];
    const game = producing(1_000_000);

    // Only the fat one escapes: two of four shares, so half the ceiling.
    let state = raidState(mice);
    state = whackMice(state, game, ["mouse:0"], 1_000, fixedRng(0.5)).randomEvents;
    state = whackMice(state, game, ["mouse:1"], 1_100, fixedRng(0.5)).randomEvents;
    const fatEscapes = tickRandomEvents(state, game, MOUSE_RAID_DEFINITION.durationMs, createSplitMix32Rng(1), {
      blocked: false,
      config: DEFAULT_RANDOM_EVENT_CONFIG,
    });
    expect(bnToNumber(fatEscapes.raidTheft!.stolen)).toBeCloseTo(1_000_000 * 0.8 * 0.5, 2);

    // Only the two ordinary ones escape: two of four shares as well — the same, and that is the
    // point of weighing shares rather than heads.
    let other = raidState(mice);
    other = whackMice(other, game, ["mouse:2"], 1_000, fixedRng(0.5)).randomEvents;
    const fatWhacked = tickRandomEvents(other, game, MOUSE_RAID_DEFINITION.durationMs, createSplitMix32Rng(1), {
      blocked: false,
      config: DEFAULT_RANDOM_EVENT_CONFIG,
    });
    expect(bnToNumber(fatWhacked.raidTheft!.stolen)).toBeCloseTo(1_000_000 * 0.8 * 0.5, 2);
  });
});

/* ------------------------------------------------------------------ the bigger whack's reach */

describe("bigger whack: what one swing catches", () => {
  const points = [
    { id: "mouse:0", x: 100, y: 100 },
    { id: "mouse:1", x: 150, y: 130 },
    { id: "mouse:2", x: 100, y: 100 },
    { id: "mouse:3", x: 900, y: 700 },
  ];

  it("catches the mouse it hit, everything inside the radius, and overlapping mice with it", () => {
    const caught = miceWithinWhackRadius(points, "mouse:0", BIGGER_WHACK_RADIUS_PX);
    expect(caught).toContain("mouse:0");
    expect(caught).toContain("mouse:1");
    expect(caught).toContain("mouse:2");
    expect(caught).not.toContain("mouse:3");
  });

  it("catches only the mouse it hit at a radius of nothing, which is an ordinary whack", () => {
    expect(miceWithinWhackRadius(points, "mouse:0", 0)).toEqual(["mouse:0", "mouse:2"]);
    expect(miceWithinWhackRadius([points[0], points[1]], "mouse:0", 0)).toEqual(["mouse:0"]);
  });

  it("catches nothing at all when the origin is not on the stage", () => {
    expect(miceWithinWhackRadius(points, "mouse:99", 500)).toEqual([]);
  });

  it("refuses a wide swing that no Bigger Whack paid for", () => {
    const state = raidState(ordinary(4));
    const result = whackMice(state, producing(), ["mouse:0", "mouse:1"], 1_000, fixedRng(0.5));
    expect(result.claimed).toBe(false);
    expect(result.randomEvents).toBe(state);
  });

  it("lets an armed raid take several mice with one swing", () => {
    const state = raidState(ordinary(4), {});
    const armed: RandomEventsState = { ...state, active: { ...state.active!, armed: ["bigger_whack"] } };
    const result = whackMice(armed, producing(), ["mouse:0", "mouse:1", "mouse:2"], 1_000, fixedRng(0.5));
    expect(result.claimed).toBe(true);
    expect(result.randomEvents.active?.pendingTargetIds).toEqual(["mouse:3"]);
    expect(result.randomEvents.active?.claimedCount).toBe(3);
  });

  it("still only takes one hit point per mouse per swing", () => {
    const mice: readonly RaidMouse[] = [
      { id: "mouse:0", hp: 1, maxHp: 1, share: 1, fat: false },
      { id: "mouse:1", hp: 3, maxHp: 3, share: 2, fat: true },
    ];
    const state = raidState(mice);
    const armed: RandomEventsState = { ...state, active: { ...state.active!, armed: ["bigger_whack"] } };
    const result = whackMice(armed, producing(), ["mouse:0", "mouse:1", "mouse:1"], 1_000, fixedRng(0.5));
    expect(result.randomEvents.active?.mice?.find((mouse) => mouse.id === "mouse:1")?.hp).toBe(2);
  });
});

/* ----------------------------------------------------------------------- buying and stock */

describe("raid consumables: buying them", () => {
  it("prices the first of each kind at its base and escalates with every one ever bought", () => {
    for (const def of RAID_CONSUMABLE_DEFINITIONS) {
      let consumables = createInitialRaidConsumables();
      expect(bnToNumber(raidConsumablePrice(def.id, consumables))).toBeCloseTo(def.baseCost, 2);
      consumables = { ...consumables, [def.id]: { stock: 0, purchased: 2 } };
      expect(bnToNumber(raidConsumablePrice(def.id, consumables)) / def.baseCost).toBeCloseTo(
        def.costRatio ** 2,
        6,
      );
    }
  });

  it("escalates on lifetime purchases, so spending stock does not reset the price", () => {
    const spentThree: RaidConsumablesState = {
      ...createInitialRaidConsumables(),
      whack_pass: { stock: 0, purchased: 3 },
    };
    const holdingThree: RaidConsumablesState = {
      ...createInitialRaidConsumables(),
      whack_pass: { stock: 3, purchased: 3 },
    };
    expect(bnToNumber(raidConsumablePrice("whack_pass", spentThree))).toBeCloseTo(
      bnToNumber(raidConsumablePrice("whack_pass", holdingThree)),
      2,
    );
  });

  it("buys one when the cookies are there, and refuses when they are not", () => {
    const base = createInitialRaidConsumables();
    const rich = buyRaidConsumable(base, "whack_pass", bnFromNumber(1e12));
    expect(rich.bought).toBe(true);
    expect(rich.consumables.whack_pass).toEqual({ stock: 1, purchased: 1 });

    const broke = buyRaidConsumable(base, "whack_pass", bnFromNumber(1));
    expect(broke.bought).toBe(false);
    expect(broke.consumables).toBe(base);
  });

  it("refuses to stock more than the cap, however rich the player is", () => {
    let consumables = createInitialRaidConsumables();
    const cap = getRaidConsumableDefinition("whack_pass").stockCap;
    for (let i = 0; i < cap + 5; i += 1) {
      consumables = buyRaidConsumable(consumables, "whack_pass", bnFromNumber(1e30)).consumables;
    }
    expect(consumables.whack_pass.stock).toBe(cap);
    expect(consumables.whack_pass.purchased).toBe(cap);
    expect(isRaidConsumableAtCap("whack_pass", consumables)).toBe(true);
  });

  it("caps every kind, so no consumable is immunity", () => {
    for (const def of RAID_CONSUMABLE_DEFINITIONS) {
      expect(def.stockCap).toBeGreaterThan(0);
      expect(def.stockCap).toBeLessThanOrEqual(3);
    }
  });

  it("goes through the reducer as an ordinary purchase, and refuses there too", () => {
    const state = producing(1e12);
    const bought = applyGameAction(state, { type: "buyRaidConsumable", consumableId: "whack_pass" }, ctxAt(1));
    expect(bought.randomEvents.consumables.whack_pass.stock).toBe(1);
    expect(bnToNumber(bought.cookies)).toBeCloseTo(1e12 - 1_000_000, 0);
    // Nothing about a purchase touches history.
    expect(bnToNumber(bought.lifetimeCookies)).toBe(bnToNumber(state.lifetimeCookies));

    const poor = producing(10);
    expect(applyGameAction(poor, { type: "buyRaidConsumable", consumableId: "whack_pass" }, ctxAt(1))).toBe(poor);
  });

  it("stays pure: buying does not mutate the state handed in", () => {
    const before = producing(1e12);
    const snapshot = JSON.parse(JSON.stringify(before));
    applyGameAction(before, { type: "buyRaidConsumable", consumableId: "bigger_whack" }, ctxAt(1));
    expect(JSON.parse(JSON.stringify(before))).toEqual(snapshot);
  });
});

/* ------------------------------------------------------------------------ spending them */

describe("raid consumables: when they are spent", () => {
  it("arms the two whack consumables at spawn and takes them out of stock", () => {
    const game: GameState = {
      ...producing(1e9),
      randomEvents: {
        ...createInitialRandomEventsState(),
        raidNextEligibleAtEpochMs: 1_000,
        consumables: stocked({ bigger_whack: 2, half_hp_whack: 1, whack_pass: 1 }),
      },
    };
    const result = tickRandomEvents(game.randomEvents, game, 1_000, createSplitMix32Rng(7), {
      blocked: false,
      config: DEFAULT_RANDOM_EVENT_CONFIG,
    });

    expect(result.randomEvents.active?.armed).toEqual(["bigger_whack", "half_hp_whack"]);
    expect(result.randomEvents.consumables.bigger_whack.stock).toBe(1);
    expect(result.randomEvents.consumables.half_hp_whack.stock).toBe(0);
    // The pass is NOT armed: it is spent later, and only if cookies would actually leave.
    expect(result.randomEvents.consumables.whack_pass.stock).toBe(1);
  });

  it("arms only what is in stock, and arms nothing at all with an empty drawer", () => {
    const game: GameState = {
      ...producing(1e9),
      randomEvents: {
        ...createInitialRandomEventsState(),
        raidNextEligibleAtEpochMs: 1_000,
      },
    };
    const result = tickRandomEvents(game.randomEvents, game, 1_000, createSplitMix32Rng(7), {
      blocked: false,
      config: DEFAULT_RANDOM_EVENT_CONFIG,
    });
    expect(result.randomEvents.active?.armed).toEqual([]);
  });

  it("halves the mice of the raid it armed a Half-HP Whack for", () => {
    const withStock: GameState = {
      ...producing(1e9),
      randomEvents: {
        ...createInitialRandomEventsState(),
        raidNextEligibleAtEpochMs: 1_000,
        consumables: stocked({ half_hp_whack: 1 }),
      },
    };
    const without: GameState = {
      ...withStock,
      randomEvents: { ...withStock.randomEvents, consumables: createInitialRaidConsumables() },
    };

    const armed = tickRandomEvents(withStock.randomEvents, withStock, 1_000, createSplitMix32Rng(4), {
      blocked: false,
      config: DEFAULT_RANDOM_EVENT_CONFIG,
    }).randomEvents;
    const bare = tickRandomEvents(without.randomEvents, without, 1_000, createSplitMix32Rng(4), {
      blocked: false,
      config: DEFAULT_RANDOM_EVENT_CONFIG,
    }).randomEvents;

    expect(armed.active?.mice?.map((mouse) => mouse.maxHp)).toEqual(bare.active?.mice?.map((mouse) => mouse.maxHp));
    expect(armed.active?.mice?.map((mouse) => mouse.hp)).toEqual(
      bare.active!.mice!.map((mouse) => halveHp(mouse.maxHp)),
    );
  });

  it("spends one Whack Pass when a raid would take cookies, and takes nothing", () => {
    const game = producing(1_000_000);
    const state = raidState(ordinary(4), { consumables: stocked({ whack_pass: 2 }) });
    const result = tickRandomEvents(state, game, MOUSE_RAID_DEFINITION.durationMs, createSplitMix32Rng(2), {
      blocked: false,
      config: DEFAULT_RANDOM_EVENT_CONFIG,
    });

    expect(bnToNumber(result.raidTheft!.stolen)).toBe(0);
    expect(result.raidTheft!.passSpent).toBe(true);
    // A pass is not a defence, and the record does not pretend otherwise.
    expect(result.raidTheft!.defended).toBe(false);
    expect(result.raidTheft!.miceEscaped).toBe(4);
    expect(result.randomEvents.consumables.whack_pass.stock).toBe(1);
    expect(result.raidTheft!.consumablesSpent).toEqual(["whack_pass"]);
  });

  it("spends exactly one pass per raid, however many mice got away", () => {
    const game = producing(1_000_000);
    const state = raidState(ordinary(5), { consumables: stocked({ whack_pass: 3 }) });
    const result = tickRandomEvents(state, game, MOUSE_RAID_DEFINITION.durationMs, createSplitMix32Rng(2), {
      blocked: false,
      config: DEFAULT_RANDOM_EVENT_CONFIG,
    });
    expect(result.randomEvents.consumables.whack_pass.stock).toBe(2);
  });

  it("takes the cookies when the drawer is empty", () => {
    const game = producing(1_000_000);
    const state = raidState(ordinary(4));
    const result = tickRandomEvents(state, game, MOUSE_RAID_DEFINITION.durationMs, createSplitMix32Rng(2), {
      blocked: false,
      config: DEFAULT_RANDOM_EVENT_CONFIG,
    });
    expect(bnToNumber(result.raidTheft!.stolen)).toBeCloseTo(800_000, 2);
    expect(result.raidTheft!.passSpent).toBe(false);
  });

  it("does NOT spend a pass on a raid the player whacked clean", () => {
    const game = producing(1_000_000);
    let state = raidState(ordinary(3), { consumables: stocked({ whack_pass: 2 }) });
    for (const id of ["mouse:0", "mouse:1", "mouse:2"]) {
      state = whackMice(state, game, [id], 1_000, fixedRng(0.5)).randomEvents;
    }
    expect(state.consumables.whack_pass.stock).toBe(2);
    expect(state.lastRaid).toMatchObject({ defended: true, passSpent: false });
    expect(bnToNumber(state.lastRaid!.reward)).toBeCloseTo(bnToNumber(mouseRaidDefenceReward(game)), 2);
  });

  it("still reports the armed consumables a defended raid spent", () => {
    const game = producing(1_000_000);
    const base = raidState(ordinary(2));
    let state: RandomEventsState = {
      ...base,
      active: { ...base.active!, armed: ["bigger_whack", "half_hp_whack"] },
      consumables: stocked({ whack_pass: 1 }),
    };
    state = whackMice(state, game, ["mouse:0", "mouse:1"], 1_000, fixedRng(0.5)).randomEvents;
    expect(state.lastRaid?.consumablesSpent).toEqual(["bigger_whack", "half_hp_whack"]);
    expect(state.consumables.whack_pass.stock).toBe(1);
  });

  it("survives a save round trip with mice, arming and stock intact", () => {
    const state = raidState(rollRaidMice(5, createSplitMix32Rng(3), true), {
      consumables: stocked({ whack_pass: 2, bigger_whack: 1 }),
    });
    const armed: RandomEventsState = { ...state, active: { ...state.active!, armed: ["half_hp_whack"] } };
    expect(decodeRandomEvents(encodeRandomEvents(armed))).toEqual(armed);
  });

  it("reads a raid saved before mice had hit points as a raid of ordinary mice", () => {
    const old = {
      active: {
        id: "mouse_raid",
        startedAtEpochMs: 0,
        endsAtEpochMs: 20_000,
        pendingTargetIds: ["mouse:0", "mouse:1"],
        claimedCount: 1,
      },
      nextEligibleAtEpochMs: 0,
      rngStreamIndex: 3,
      lastResolved: null,
      spawnCount: 1,
    };
    const decoded = decodeRandomEvents(old) as RandomEventsState;
    expect(decoded.active?.mice).toBeUndefined();
    expect(decoded.consumables).toEqual(createInitialRaidConsumables());

    // And such a raid still resolves, on heads, exactly as it used to.
    const result = tickRandomEvents(decoded, producing(1_000_000), 20_000, createSplitMix32Rng(1), {
      blocked: false,
      config: DEFAULT_RANDOM_EVENT_CONFIG,
    });
    expect(bnToNumber(result.raidTheft!.stolen)).toBeCloseTo(1_000_000 * 0.8 * (2 / 3), 2);
  });

  it("whacks through the reducer, with the wide swing gated on the arming", () => {
    const base = raidState(ordinary(4));
    const game: GameState = {
      ...producing(1_000_000),
      randomEvents: { ...base, active: { ...base.active!, armed: ["bigger_whack"] } },
    };
    const after = applyGameAction(
      game,
      { type: "randomEventWhack", mouseIds: ["mouse:0", "mouse:1"] },
      ctxAt(1_000),
    );
    expect(after.randomEvents.active?.claimedCount).toBe(2);
    expect(after.randomEvents.active?.pendingTargetIds).toEqual(["mouse:2", "mouse:3"]);
  });
});
