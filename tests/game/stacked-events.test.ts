/* ------------------------------------------------------------------------------------------
 * DOUBLE AND TRIPLE EVENTS, and the six events of the second wave.
 *
 * Its own file, for the same reason frenzy-events.test.ts is its own file: random-events.test.ts
 * already covers the scheduler, the original six and the Mouse Raid at length, and what this lane
 * added is a different subject. What is tested here:
 *
 *   - THE COMPATIBILITY MATRIX, exhaustively over every ordered pair of every event in the game,
 *     plus a seeded long run asserting no forbidden pair is ever actually rolled;
 *   - the stack multiplier caps with THREE events and a golden cookie on top;
 *   - each new event's own arithmetic, against a real production figure;
 *   - the sidecar's version-1-to-version-2 migration, in both the clean and the salvage paths;
 *   - the indicator's compression rule at one, two and three plates.
 * ---------------------------------------------------------------------------------------- */
import { describe, expect, it } from "vitest";

import { bnToNumber, bnFromNumber } from "../../src/shared/game/big-number";
import { totalCps } from "../../src/shared/game/cps";
import { effectiveCps } from "../../src/shared/game/effective-cps";
import { createSplitMix32Rng } from "../../src/shared/game/golden-cookie";
import { applyGameAction, HOME_SUBGAME_ID, type ReducerCtx } from "../../src/shared/game/reducer";
import { RANDOM_EVENT_ART } from "../../src/renderer/assets/icons";
import { stackCompression } from "../../src/renderer/screens/RandomEventStage";
import {
  ALL_RANDOM_EVENT_DEFINITIONS,
  activeStackSize,
  canJoinStack,
  canStackWith,
  clickRandomEventTarget,
  createInitialRandomEventsState,
  crumbCometPayout,
  decodeRandomEvents,
  DEFAULT_RANDOM_EVENT_CONFIG,
  DEFAULT_RANDOM_EVENT_PAYOUTS,
  DOUBLE_EVENT_CHANCE,
  drawRandomEventStack,
  eclipseCrumbPayout,
  encodeRandomEvents,
  EVENT_CLICK_STACK_CAP,
  EVENT_CPS_STACK_CAP,
  EVENT_REBATE_CAP,
  FAST_RANDOM_EVENT_CONFIG,
  getRandomEventDefinition,
  isStackable,
  MAX_STACKED_EVENTS,
  primaryActive,
  RANDOM_EVENT_DEFINITIONS,
  randomEventClickMultiplier,
  randomEventCpsMultiplier,
  randomEventGeneratorSurge,
  randomEventRebateFraction,
  randomEventSubgameSpeed,
  RANDOM_EVENTS_SIDECAR_VERSION,
  remainingMs,
  remainingMsFor,
  resolveRandomEventConfig,
  rollEventStackSize,
  STACKABLE_EVENT_DEFINITIONS,
  stackEventMultipliers,
  stackManyEventMultipliers,
  tickRandomEvents,
  TRIPLE_EVENT_CHANCE,
  type ActiveRandomEvent,
  type RandomEventConfig,
  type RandomEventId,
  type RandomEventsState,
} from "../../src/shared/game/random-events";
import type { GameState, RngPort } from "../../src/shared/game/types";
import { freshState, fixedRng } from "./test-helpers";

/* ------------------------------------------------------------------------------ helpers */

function producingState(overrides: Partial<GameState> = {}): GameState {
  return freshState({ generators: [{ id: "cursor", count: 100 }], ...overrides });
}

function activeOf(id: RandomEventId, startedAtEpochMs = 0, extra: Partial<ActiveRandomEvent> = {}): ActiveRandomEvent {
  const def = getRandomEventDefinition(id);
  return {
    id,
    startedAtEpochMs,
    endsAtEpochMs: startedAtEpochMs + def.durationMs,
    pendingTargetIds: [],
    claimedCount: 0,
    ...extra,
  };
}

function eventsWith(...ids: readonly RandomEventId[]): RandomEventsState {
  return { ...createInitialRandomEventsState(), actives: ids.map((id) => activeOf(id)) };
}

/** A schedule that never fires, so a reducer test can tick without an event landing on it. */
const QUIET_CONFIG: RandomEventConfig = {
  ...DEFAULT_RANDOM_EVENT_CONFIG,
  minDelayMs: 1_000_000_000,
  maxDelayMs: 1_000_000_000,
  cooldownMs: 1_000_000_000,
};

function ctxAt(epochMs: number, rng: RngPort = fixedRng(0.99), config: RandomEventConfig = QUIET_CONFIG): ReducerCtx {
  return { now: () => epochMs, rng, randomEventConfig: config };
}

/** The six ids the second wave added, so a "does every new event…" test cannot silently miss one. */
const WAVE_TWO_IDS: readonly RandomEventId[] = [
  "cookie_eclipse",
  "crumb_comet",
  "bakers_dozen",
  "static_cling",
  "grandma_convention",
  "overtime_crew",
];

/* -------------------------------------------------------------- THE COMPATIBILITY MATRIX */

describe("double and triple events: the compatibility matrix", () => {
  it("is symmetric over every ordered pair of every event in the game", () => {
    // The predicate is written as a symmetric expression, but "written symmetrically" and "is
    // symmetric" are different claims, and only one of them is checkable. If it ever stopped
    // being symmetric there would be a draw ORDER in which a forbidden pair got through, which
    // is exactly the kind of bug a 0.8%-of-spawns feature would hide for months.
    for (const a of ALL_RANDOM_EVENT_DEFINITIONS) {
      for (const b of ALL_RANDOM_EVENT_DEFINITIONS) {
        expect(canStackWith(a, b), `${a.id} vs ${b.id}`).toBe(canStackWith(b, a));
      }
    }
  });

  it("refuses two setbacks, in either order, for every pair of setbacks that exists", () => {
    const setbacks = ALL_RANDOM_EVENT_DEFINITIONS.filter((d) => d.isSetback);
    expect(setbacks.length).toBeGreaterThan(1);
    for (const a of setbacks) {
      for (const b of setbacks) {
        expect(canStackWith(a, b), `${a.id} + ${b.id}`).toBe(false);
      }
    }
  });

  it("refuses two events that both want the stage", () => {
    const clickable = ALL_RANDOM_EVENT_DEFINITIONS.filter((d) => d.targetCount > 0);
    expect(clickable.length).toBeGreaterThan(1);
    for (const a of clickable) {
      for (const b of clickable) {
        expect(canStackWith(a, b), `${a.id} + ${b.id}`).toBe(false);
      }
    }
  });

  it("never lets a choice event stack with anything, in either direction", () => {
    const choices = ALL_RANDOM_EVENT_DEFINITIONS.filter((d) => d.shape === "choice");
    expect(choices.length).toBeGreaterThan(0);
    for (const choice of choices) {
      expect(isStackable(choice)).toBe(false);
      for (const other of ALL_RANDOM_EVENT_DEFINITIONS) {
        expect(canStackWith(choice, other), `${choice.id} + ${other.id}`).toBe(false);
        expect(canStackWith(other, choice), `${other.id} + ${choice.id}`).toBe(false);
      }
    }
  });

  it("never lets the Mouse Raid or an instant event into a stack", () => {
    const raid = getRandomEventDefinition("mouse_raid");
    expect(isStackable(raid)).toBe(false);
    for (const other of ALL_RANDOM_EVENT_DEFINITIONS) {
      expect(canStackWith(raid, other), `raid + ${other.id}`).toBe(false);
    }
    for (const def of ALL_RANDOM_EVENT_DEFINITIONS.filter((d) => d.shape === "instant")) {
      expect(isStackable(def), `${def.id} is instant and must not stack`).toBe(false);
    }
  });

  it("never lets an event stack with itself", () => {
    for (const def of ALL_RANDOM_EVENT_DEFINITIONS) {
      expect(canStackWith(def, def), def.id).toBe(false);
    }
  });

  it("keeps the stackable subset exactly the events the rules allow", () => {
    // Derived two different ways and compared, so the array the draw walks over and the
    // predicate the matrix is stated in cannot drift apart.
    expect(STACKABLE_EVENT_DEFINITIONS.map((d) => d.id)).toEqual(
      RANDOM_EVENT_DEFINITIONS.filter(isStackable).map((d) => d.id),
    );
    // It has to be a real majority of the bag, or rejection sampling would spend its budget.
    const stackableWeight = STACKABLE_EVENT_DEFINITIONS.reduce((sum, d) => sum + d.weight, 0);
    expect(stackableWeight).toBeGreaterThan(70);
  });
});

/* ------------------------------------------------------------- THE DRAW, OVER A LONG RUN */

describe("double and triple events: what the dice actually produce", () => {
  /** Every stack a seeded run of the real scheduler put on screen. */
  function stacksOver(seed: number, ticks: number): readonly (readonly RandomEventId[])[] {
    const rng = createSplitMix32Rng(seed);
    const gameState = producingState();
    const config: RandomEventConfig = { ...FAST_RANDOM_EVENT_CONFIG, cooldownMs: 0, minDelayMs: 0, maxDelayMs: 0 };
    const stacks: (readonly RandomEventId[])[] = [];
    let state = createInitialRandomEventsState();
    let now = 0;
    for (let step = 0; step < ticks; step += 1) {
      const before = state;
      state = tickRandomEvents(state, gameState, now, rng, { blocked: false, config }).randomEvents;
      if (before.actives.length === 0 && state.actives.length > 0) {
        stacks.push(state.actives.map((active) => active.id));
      }
      now += 250;
    }
    return stacks;
  }

  it("never rolls a forbidden pair, over a long seeded run of the real scheduler", () => {
    // THE POINT OF THIS TEST. The matrix above proves the predicate says the right thing; this
    // proves the SCHEDULER asks it. Three seeds, a couple of thousand spawns between them, and
    // every ordered pair inside every stack checked against the same predicate.
    let stacked = 0;
    for (const seed of [20_260_818, 7, 999_331]) {
      for (const stack of stacksOver(seed, 40_000)) {
        expect(stack.length).toBeLessThanOrEqual(MAX_STACKED_EVENTS);
        expect(new Set(stack).size, `duplicate in ${stack.join("+")}`).toBe(stack.length);
        if (stack.length > 1) stacked += 1;
        for (const a of stack) {
          for (const b of stack) {
            if (a === b) continue;
            expect(
              canStackWith(getRandomEventDefinition(a), getRandomEventDefinition(b)),
              `${a} + ${b} rolled together`,
            ).toBe(true);
          }
        }
      }
    }
    // And the run actually produced stacks, so the assertions above were not vacuous.
    expect(stacked).toBeGreaterThan(20);
  });

  it("lands doubles and triples at roughly their advertised rates", () => {
    // The rates are a promise the pacing note makes in writing, so they are measured rather than
    // asserted from the constants. Six seeded runs are used rather than one because a 0.8% event
    // needs a few thousand spawns before a rate is a measurement rather than a coin flip: at
    // ~5,000 spawns a triple lands about forty times, and the bands below are wide enough to
    // pass on any seed while still catching a rate that has silently doubled or halved.
    const stacks = [20_260_818, 31_337, 4_242, 909, 55_555, 7_010_203].flatMap((seed) =>
      stacksOver(seed, 120_000),
    );
    expect(stacks.length).toBeGreaterThan(4_000);
    const doubles = stacks.filter((s) => s.length === 2).length / stacks.length;
    const triples = stacks.filter((s) => s.length === 3).length / stacks.length;
    expect(doubles).toBeGreaterThan(DOUBLE_EVENT_CHANCE * 0.65);
    expect(doubles).toBeLessThan(DOUBLE_EVENT_CHANCE * 1.35);
    expect(triples).toBeGreaterThan(TRIPLE_EVENT_CHANCE * 0.4);
    expect(triples).toBeLessThan(TRIPLE_EVENT_CHANCE * 1.9);
    // A triple must be visibly rarer than a double, or the two announcements mean the same thing.
    expect(triples).toBeLessThan(doubles);
  });

  it("rolls the stack size off one draw, against the two stated thresholds", () => {
    expect(rollEventStackSize(fixedRng(0))).toBe(3);
    expect(rollEventStackSize(fixedRng(TRIPLE_EVENT_CHANCE / 2))).toBe(3);
    expect(rollEventStackSize(fixedRng(TRIPLE_EVENT_CHANCE + DOUBLE_EVENT_CHANCE / 2))).toBe(2);
    expect(rollEventStackSize(fixedRng(0.5))).toBe(1);
    expect(rollEventStackSize(fixedRng(0.999))).toBe(1);
    // The two bands do not overlap, which is what makes the pacing arithmetic true.
    expect(TRIPLE_EVENT_CHANCE + DOUBLE_EVENT_CHANCE).toBeLessThan(0.1);
  });

  it("never draws more than the stated maximum, whatever the dice say", () => {
    // A port that always returns zero asks for a triple on every spawn and picks the first
    // stackable event every time, which is the worst case for both the size cap and the
    // rejection budget: every candidate after the first is a duplicate and is refused.
    for (const value of [0, 0.999999]) {
      const stack = drawRandomEventStack(fixedRng(value), DEFAULT_RANDOM_EVENT_CONFIG);
      expect(stack.length).toBeLessThanOrEqual(MAX_STACKED_EVENTS);
      expect(new Set(stack).size).toBe(stack.length);
    }
  });

  it("photographs a forced event alone rather than a forced event plus whatever the dice added", () => {
    // The capture flag exists so a 1%-weight event can be photographed honestly. A forced run
    // that sometimes came out as a double would be a capture process that sometimes lied.
    const forced: RandomEventConfig = { ...DEFAULT_RANDOM_EVENT_CONFIG, forcedPoolEventId: "burnt_batch_frenzy" };
    for (let seed = 0; seed < 200; seed += 1) {
      const stack = drawRandomEventStack(createSplitMix32Rng(seed), forced);
      expect(stack[0]).toBe("burnt_batch_frenzy");
    }
  });

  it("forces a stack size for a capture without relaxing any rule the player is subject to", () => {
    expect(resolveRandomEventConfig("stack:2").forcedStackSize).toBe(2);
    expect(resolveRandomEventConfig("stack:3").forcedStackSize).toBe(3);
    // Outside 1..3, or not a number at all, is the shipped schedule rather than a broken one.
    expect(resolveRandomEventConfig("stack:4").forcedStackSize).toBeUndefined();
    expect(resolveRandomEventConfig("stack:0").forcedStackSize).toBeUndefined();
    expect(resolveRandomEventConfig("stack:lots").forcedStackSize).toBeUndefined();
    expect(resolveRandomEventConfig("stack:2").minDelayMs).toBe(FAST_RANDOM_EVENT_CONFIG.minDelayMs);
    // No shipped config carries one.
    expect(DEFAULT_RANDOM_EVENT_CONFIG.forcedStackSize).toBeUndefined();
    expect(FAST_RANDOM_EVENT_CONFIG.forcedStackSize).toBeUndefined();

    // A forced double is still subject to the whole matrix: every pair inside it is legal, and
    // no member is repeated. Only how many slots the draw TRIES to fill is decided by the flag.
    const forced: RandomEventConfig = { ...DEFAULT_RANDOM_EVENT_CONFIG, forcedStackSize: 2 };
    let doubles = 0;
    for (let seed = 0; seed < 300; seed += 1) {
      const stack = drawRandomEventStack(createSplitMix32Rng(seed), forced);
      expect(stack.length).toBeLessThanOrEqual(2);
      if (stack.length === 2) doubles += 1;
      for (const a of stack) {
        for (const b of stack) {
          if (a !== b) expect(canStackWith(getRandomEventDefinition(a), getRandomEventDefinition(b))).toBe(true);
        }
      }
    }
    // And it really does produce doubles, or the capture flag would be photographing nothing.
    expect(doubles).toBeGreaterThan(280);
  });

  it("puts the whole stack up in one tick, and never adds to one already running", () => {
    const config: RandomEventConfig = { ...FAST_RANDOM_EVENT_CONFIG, cooldownMs: 0, minDelayMs: 0, maxDelayMs: 0 };
    const rng = createSplitMix32Rng(20_260_818);
    const gameState = producingState();
    let state = createInitialRandomEventsState();
    for (let now = 0; now < 3_000_000; now += 250) {
      const before = state;
      state = tickRandomEvents(state, gameState, now, rng, { blocked: false, config }).randomEvents;
      if (before.actives.length > 0) {
        // Members may leave. Nothing may arrive.
        for (const event of state.actives) expect(before.actives).toContain(event);
      }
      // A raid, if it is running, is running alone.
      if (state.actives.some((a) => a.id === "mouse_raid")) expect(state.actives).toHaveLength(1);
    }
  });
});

/* -------------------------------------------------------- THREE EVENTS AND A GOLDEN COOKIE */

describe("double and triple events: the stack multiplier caps", () => {
  it("applies one cap once, at the end, rather than pairwise as it folds", () => {
    // The property that makes the many-argument form correct and a naive fold wrong: capping a
    // pair early and then multiplying by a penalty would clip a product that was never over the
    // ceiling in the first place.
    expect(stackManyEventMultipliers([2_000, 0.5], EVENT_CPS_STACK_CAP)).toBe(1_000);
    expect(stackManyEventMultipliers([7, 3], EVENT_CPS_STACK_CAP)).toBe(21);
    // Order cannot matter, because there is one product and one comparison.
    expect(stackManyEventMultipliers([0.5, 7, 3], EVENT_CPS_STACK_CAP)).toBe(
      stackManyEventMultipliers([3, 0.5, 7], EVENT_CPS_STACK_CAP),
    );
    // The two-argument form is the same function, so there is still ONE stacking rule.
    expect(stackEventMultipliers(7, 666, EVENT_CPS_STACK_CAP)).toBe(
      stackManyEventMultipliers([7, 666], EVENT_CPS_STACK_CAP),
    );
    expect(stackManyEventMultipliers([], EVENT_CPS_STACK_CAP)).toBe(1);
    expect(stackManyEventMultipliers([Number.POSITIVE_INFINITY, 2], EVENT_CPS_STACK_CAP)).toBe(0);
    expect(stackManyEventMultipliers([-3, 2], EVENT_CPS_STACK_CAP)).toBe(0);
  });

  it("holds the SAME production ceiling with three events and a golden cookie", () => {
    // The biggest legal production stack the matrix allows: the Burnt Batch Frenzy is the only
    // large factor and neither companion multiplies global production at all, which is why the
    // ceiling written for "golden × one event" still describes "golden × three".
    const stack = eventsWith("burnt_batch_frenzy", "grandma_convention", "bakers_dozen");
    expect(activeStackSize(stack)).toBe(3);
    const events = randomEventCpsMultiplier(stack, 1_000);
    expect(events).toBe(666);
    expect(stackEventMultipliers(7, events, EVENT_CPS_STACK_CAP)).toBe(EVENT_CPS_STACK_CAP);
    // Uncapped, it would be 4,662 — so the cap is genuinely biting rather than being decorative.
    expect(7 * events).toBeGreaterThan(EVENT_CPS_STACK_CAP);
  });

  it("holds the SAME click ceiling with three events and a golden click frenzy", () => {
    const stack = eventsWith("click_frenzy", "market_day", "night_shift");
    const events = randomEventClickMultiplier(stack, 1_000);
    // 777 × 1 × 0.25. The Night Shift's click penalty applies inside the stack exactly as it
    // does alone: a stack is not a licence to ignore the half of a tradeoff that hurts.
    expect(events).toBeCloseTo(777 * 0.25, 6);
    expect(stackEventMultipliers(3, events, EVENT_CLICK_STACK_CAP)).toBeCloseTo(3 * 777 * 0.25, 6);
    expect(stackEventMultipliers(3, events, EVENT_CLICK_STACK_CAP)).toBeLessThan(EVENT_CLICK_STACK_CAP);
  });

  it("multiplies a stack's production effects together, penalties included", () => {
    // A setback plus a boon is allowed (only two SETBACKS are forbidden), and the arithmetic is
    // the plain product — the penalty is not softened for having landed next to a present.
    const stack = eventsWith("clot", "grandma_convention");
    expect(randomEventCpsMultiplier(stack, 1_000)).toBe(0.5);
    const both = eventsWith("production_frenzy", "night_shift");
    expect(randomEventCpsMultiplier(both, 1_000)).toBe(21);
  });

  it("stops counting each member the instant its own window closes", () => {
    // Members of a stack end at different moments and the list is only pruned on a tick, so the
    // multiplier lookup has to read the clock rather than the list. Sugar Rush runs 15s and
    // Market Day 60s; at 20s only one of them is worth anything.
    const stack = eventsWith("sugar_rush", "market_day");
    expect(randomEventClickMultiplier(stack, 10_000)).toBe(7);
    expect(randomEventClickMultiplier(stack, 20_000)).toBe(1);
    expect(randomEventRebateFraction(stack, 20_000)).toBeCloseTo(0.15, 6);
    expect(randomEventRebateFraction(stack, 70_000)).toBe(0);
  });

  it("adds rebates rather than multiplying them, and caps the total once", () => {
    const both = eventsWith("market_day", "bakers_dozen");
    expect(randomEventRebateFraction(both, 1_000)).toBeCloseTo(0.15 + 1 / 13, 6);
    // The cap is far above anything two events reach, so it never eats a real rebate...
    expect(randomEventRebateFraction(both, 1_000)).toBeLessThan(EVENT_REBATE_CAP);
    // ...and it is a real ceiling, which is what stops a purchase ever becoming free.
    expect(EVENT_REBATE_CAP).toBeLessThan(1);
  });

  it("reports the longest member's clock as the time until the stage is clear", () => {
    const stack = eventsWith("sugar_rush", "market_day");
    expect(remainingMs(stack, 0)).toBe(60_000);
    expect(remainingMsFor(stack.actives[0], 0)).toBe(15_000);
    expect(remainingMsFor(stack.actives[1], 0)).toBe(60_000);
    expect(remainingMs(createInitialRandomEventsState(), 0)).toBe(0);
    expect(primaryActive(stack)?.id).toBe("sugar_rush");
  });
});

/* ------------------------------------------------------------- LIVING AND DYING IN A STACK */

describe("double and triple events: members live and die on their own clocks", () => {
  it("expires one member without touching the others or starting the next window", () => {
    // The Burnt Batch Frenzy runs 6s, the Baker's Dozen 90s. At 10s the frenzy is gone, the
    // rebate is still running, and the pool's next-eligible instant has NOT been set — because
    // the stage is not clear and a stack is supposed to be one interruption.
    const state = eventsWith("burnt_batch_frenzy", "bakers_dozen");
    const after = tickRandomEvents(state, producingState(), 10_000, fixedRng(0.5), {
      blocked: false,
      config: DEFAULT_RANDOM_EVENT_CONFIG,
    }).randomEvents;
    expect(after.actives.map((a) => a.id)).toEqual(["bakers_dozen"]);
    expect(after.nextEligibleAtEpochMs).toBe(state.nextEligibleAtEpochMs);
    expect(after.lastResolved?.id).toBe("burnt_batch_frenzy");

    // And when the last one goes, the window opens.
    const cleared = tickRandomEvents(after, producingState(), 95_000, fixedRng(0.5), {
      blocked: false,
      config: DEFAULT_RANDOM_EVENT_CONFIG,
    }).randomEvents;
    expect(cleared.actives).toHaveLength(0);
    expect(cleared.nextEligibleAtEpochMs).toBeGreaterThan(95_000);
  });

  it("clearing a clickable event early leaves its companion running", () => {
    const state: RandomEventsState = {
      ...createInitialRandomEventsState(),
      actives: [
        activeOf("crumb_comet", 0, { pendingTargetIds: ["comet:0"] }),
        activeOf("bakers_dozen", 0),
      ],
    };
    const result = clickRandomEventTarget(state, producingState(), "comet:0", 1_000, fixedRng(0.5));
    expect(result.claimed).toBe(true);
    expect(result.randomEvents.actives.map((a) => a.id)).toEqual(["bakers_dozen"]);
    // Clearing the comet must not buy the player an earlier next spawn.
    expect(result.randomEvents.nextEligibleAtEpochMs).toBe(state.nextEligibleAtEpochMs);
  });

  it("routes a click to the event that actually owns the target", () => {
    const state: RandomEventsState = {
      ...createInitialRandomEventsState(),
      actives: [activeOf("bakers_dozen", 0), activeOf("cookie_eclipse", 0, { pendingTargetIds: ["crumb:0", "crumb:1"] })],
    };
    const hit = clickRandomEventTarget(state, producingState(), "crumb:1", 1_000, fixedRng(0.5));
    expect(hit.claimed).toBe(true);
    expect(hit.randomEvents.actives[1]?.pendingTargetIds).toEqual(["crumb:0"]);
    expect(hit.randomEvents.actives[0]?.id).toBe("bakers_dozen");
    // A target nobody owns is refused, exactly as a stale one always was.
    const miss = clickRandomEventTarget(state, producingState(), "rain:4", 1_000, fixedRng(0.5));
    expect(miss.claimed).toBe(false);
    expect(miss.randomEvents).toBe(state);
  });

  it("pays every expiring member's expiry payout on the tick it goes", () => {
    // The Flour Shortage is the only event with an expiry payout, so a stack containing it pays
    // exactly what it would have paid alone — summing over the expiring set is the same number
    // whenever it is the only payer, and the right one if a second ever exists.
    const game = producingState();
    const state = eventsWith("flour_shortage", "bakers_dozen");
    const result = tickRandomEvents(state, game, 31_000, fixedRng(0.5), {
      blocked: false,
      config: DEFAULT_RANDOM_EVENT_CONFIG,
    });
    expect(bnToNumber(result.instantBonus)).toBeCloseTo(
      bnToNumber(totalCps(game)) * DEFAULT_RANDOM_EVENT_PAYOUTS.flourShortageReboundCpsSeconds,
      6,
    );
    expect(result.randomEvents.actives.map((a) => a.id)).toEqual(["bakers_dozen"]);
  });
});

/* ----------------------------------------------------------------- THE SECOND WAVE'S EVENTS */

describe("the second wave: each event's own arithmetic", () => {
  it("pays a Cookie Eclipse crumb a flat slice of production plus a fixed number of clicks", () => {
    const game = producingState();
    const cps = bnToNumber(totalCps(game));
    const click = bnToNumber(game.baseClickValue);
    const expected =
      cps * DEFAULT_RANDOM_EVENT_PAYOUTS.eclipseCrumbCpsSeconds +
      click * DEFAULT_RANDOM_EVENT_PAYOUTS.eclipseCrumbClicks;
    expect(bnToNumber(eclipseCrumbPayout(game))).toBeCloseTo(expected, 6);

    // FLAT, not escalating: the fifth crumb is worth exactly what the first was. That is the
    // difference between this event and the Sprinkle Storm, and it is the whole design note.
    const state: RandomEventsState = {
      ...createInitialRandomEventsState(),
      actives: [activeOf("cookie_eclipse", 0, { pendingTargetIds: ["crumb:0", "crumb:1"], claimedCount: 3 })],
    };
    const late = clickRandomEventTarget(state, game, "crumb:0", 1_000, fixedRng(0.5));
    expect(bnToNumber(late.bonus)).toBeCloseTo(expected, 6);
  });

  it("pays the Crumb Comet once, for one press, and nothing at all on a miss", () => {
    const game = producingState();
    const expected =
      bnToNumber(totalCps(game)) * DEFAULT_RANDOM_EVENT_PAYOUTS.cometCpsSeconds +
      bnToNumber(game.baseClickValue) * DEFAULT_RANDOM_EVENT_PAYOUTS.cometClicks;
    expect(bnToNumber(crumbCometPayout(game))).toBeCloseTo(expected, 6);

    const caught = clickRandomEventTarget(
      { ...createInitialRandomEventsState(), actives: [activeOf("crumb_comet", 0, { pendingTargetIds: ["comet:0"] })] },
      game,
      "comet:0",
      1_000,
      fixedRng(0.5),
    );
    expect(bnToNumber(caught.bonus)).toBeCloseTo(expected, 6);

    // Letting it cross pays nothing — the only clickable event in the pool with that property.
    const missed = tickRandomEvents(
      { ...createInitialRandomEventsState(), actives: [activeOf("crumb_comet", 0, { pendingTargetIds: ["comet:0"] })] },
      game,
      20_000,
      fixedRng(0.5),
      { blocked: false, config: DEFAULT_RANDOM_EVENT_CONFIG },
    );
    expect(bnToNumber(missed.instantBonus)).toBe(0);
  });

  it("hands back one cookie in thirteen during a Baker's Dozen, and never touches a price", () => {
    const def = getRandomEventDefinition("bakers_dozen");
    expect(def.rebateFraction).toBeCloseTo(1 / 13, 12);
    const state = eventsWith("bakers_dozen");
    expect(randomEventRebateFraction(state, 1_000)).toBeCloseTo(1 / 13, 12);
    // Thirteen purchases' worth of spending comes back as exactly one purchase's worth, which
    // is the thing the name promises.
    expect(randomEventRebateFraction(state, 1_000) * 13).toBeCloseTo(1, 12);
    // Weaker and longer than Market Day, so the two are not one event with two names.
    const market = getRandomEventDefinition("market_day");
    expect(def.rebateFraction).toBeLessThan(market.rebateFraction);
    expect(def.durationMs).toBeGreaterThan(market.durationMs);
  });

  it("costs Static Cling's clicks and leaves production completely alone", () => {
    const state = eventsWith("static_cling");
    expect(randomEventClickMultiplier(state, 1_000)).toBeCloseTo(0.35, 6);
    expect(randomEventCpsMultiplier(state, 1_000)).toBe(1);
    expect(randomEventRebateFraction(state, 1_000)).toBe(0);
    // Through the reducer: a click during it really is worth about a third.
    const base = producingState({ cookies: bnFromNumber(0) });
    const plain = applyGameAction(base, { type: "click" }, ctxAt(1_000));
    const clung = applyGameAction(
      { ...base, randomEvents: state },
      { type: "click" },
      ctxAt(1_000),
    );
    expect(bnToNumber(clung.cookies)).toBeCloseTo(bnToNumber(plain.cookies) * 0.35, 6);
  });

  it("surges only the generators the Grandma Convention names, by the factor it names", () => {
    const surge = randomEventGeneratorSurge(eventsWith("grandma_convention"), 1_000);
    expect(surge).toEqual({ grandma: 4, farm: 4 });
    // Nothing else in the pool surges anything, so the hook cannot fire by accident.
    expect(randomEventGeneratorSurge(eventsWith("production_frenzy"), 1_000)).toEqual({});
    expect(randomEventGeneratorSurge(createInitialRandomEventsState(), 1_000)).toEqual({});

    // The arithmetic, through the composed rate: only the named generators move.
    const game = freshState({
      generators: [
        { id: "cursor", count: 100 },
        { id: "grandma", count: 10 },
      ],
    });
    const standing = bnToNumber(effectiveCps(game, 1_000));
    const surged = bnToNumber(effectiveCps({ ...game, randomEvents: eventsWith("grandma_convention") }, 1_000));
    const grandmaShare = bnToNumber(totalCps(freshState({ generators: [{ id: "grandma", count: 10 }] })));
    expect(surged - standing).toBeCloseTo(grandmaShare * 3, 4);

    // A save with none of the named generators gets exactly nothing, and that is honest rather
    // than a bug: the event is worth what you own of the thing it is about.
    const noGrandmas = freshState({ generators: [{ id: "cursor", count: 100 }] });
    expect(bnToNumber(effectiveCps({ ...noGrandmas, randomEvents: eventsWith("grandma_convention") }, 1_000))).toBeCloseTo(
      bnToNumber(effectiveCps(noGrandmas, 1_000)),
      6,
    );
  });

  it("speeds up the named subgame's clock during an Overtime Crew, and nothing else's", () => {
    const state = eventsWith("overtime_crew");
    expect(randomEventSubgameSpeed(state, 1_000, HOME_SUBGAME_ID)).toBe(3);
    // A subgame id nothing recognises is worth 1, which is the honest answer.
    expect(randomEventSubgameSpeed(state, 1_000, "factory")).toBe(1);
    expect(randomEventSubgameSpeed(state, 1_000, "not-a-subgame")).toBe(1);
    expect(randomEventSubgameSpeed(eventsWith("night_shift"), 1_000, HOME_SUBGAME_ID)).toBe(1);
    // And it stops the instant its own window closes, like every other member of a stack.
    expect(randomEventSubgameSpeed(state, 999_000, HOME_SUBGAME_ID)).toBe(1);
    // The definition's id and the reducer's constant are the same string, so the hook connects.
    expect(getRandomEventDefinition("overtime_crew").subgameSpeedId).toBe(HOME_SUBGAME_ID);
  });

  it("advances a real home build three times as fast under an Overtime Crew", () => {
    const withBuild = (randomEvents: RandomEventsState): GameState => ({
      ...producingState(),
      randomEvents,
      homeConstruction: {
        blueprintIds: ["kitchen"],
        rooms: [],
        build: { roomId: "kitchen", elapsedMs: 0, requiredMs: 600_000 },
        cookiesInvested: bnFromNumber(0),
      },
    });
    const ordinary = applyGameAction(
      withBuild(createInitialRandomEventsState()),
      { type: "tick", elapsedMs: 10_000 },
      ctxAt(10_000),
    );
    const overtime = applyGameAction(withBuild(eventsWith("overtime_crew")), { type: "tick", elapsedMs: 10_000 }, ctxAt(10_000));
    expect(ordinary.homeConstruction.build?.elapsedMs).toBe(10_000);
    expect(overtime.homeConstruction.build?.elapsedMs).toBe(30_000);
    // It still cannot finish a room the tick it lands, or bank surplus past a completion —
    // all of that is still tickHome's to decide, and this event only lengthens the slice.
    expect(overtime.homeConstruction.build?.elapsedMs).toBeLessThan(600_000);
  });

  it("gives every second-wave event a name, a blurb and a real duration in both languages", () => {
    for (const id of WAVE_TWO_IDS) {
      const def = getRandomEventDefinition(id);
      expect(def.nameEn.length, id).toBeGreaterThan(0);
      expect(def.nameYue.length, id).toBeGreaterThan(0);
      expect(def.blurbEn.length, id).toBeGreaterThan(0);
      expect(def.blurbYue.length, id).toBeGreaterThan(0);
      expect(def.durationMs, id).toBeGreaterThan(0);
      expect(def.weight, id).toBeGreaterThan(0);
    }
    // At least one negative, at least one interactive, at least one reaching into a subgame.
    expect(WAVE_TWO_IDS.some((id) => getRandomEventDefinition(id).isSetback)).toBe(true);
    expect(WAVE_TWO_IDS.some((id) => getRandomEventDefinition(id).targetCount > 0)).toBe(true);
    expect(WAVE_TWO_IDS.some((id) => getRandomEventDefinition(id).subgameSpeedId !== undefined)).toBe(true);
  });
});

/* ---------------------------------------------------------------------- SIDECAR MIGRATION */

describe("the sidecar: version one becomes version two", () => {
  it("stamps version two on the way out", () => {
    expect(RANDOM_EVENTS_SIDECAR_VERSION).toBe(2);
    const encoded = encodeRandomEvents(eventsWith("bakers_dozen")) as unknown as Record<string, unknown>;
    expect(encoded.sidecarVersion).toBe(2);
    expect(encoded.actives).toHaveLength(1);
    expect(encoded.active).toBeUndefined();
  });

  it("reads a version-one sidecar's single slot as a list of one, losing nothing else", () => {
    const v1 = {
      sidecarVersion: 1,
      active: {
        id: "cookie_rain",
        startedAtEpochMs: 4_000,
        endsAtEpochMs: 24_000,
        pendingTargetIds: ["rain:0", "rain:1"],
        claimedCount: 10,
      },
      nextEligibleAtEpochMs: 900_000,
      rngStreamIndex: 17,
      lastResolved: { id: "sugar_rush", resolvedAtEpochMs: 3_000, claimedCount: 0, endedEarly: false },
      spawnCount: 4,
      raidNextEligibleAtEpochMs: 3_600_000,
      raidCount: 2,
    };
    const decoded = decodeRandomEvents(v1);
    expect(decoded.actives).toHaveLength(1);
    expect(decoded.actives[0]?.id).toBe("cookie_rain");
    expect(decoded.actives[0]?.claimedCount).toBe(10);
    // EVERYTHING ELSE SURVIVES. The whole point of a migration rather than a salvage is that a
    // player's schedule, counters and history are not collateral damage of a shape change.
    expect(decoded.nextEligibleAtEpochMs).toBe(900_000);
    expect(decoded.rngStreamIndex).toBe(17);
    expect(decoded.lastResolved?.id).toBe("sugar_rush");
    expect(decoded.spawnCount).toBe(4);
    expect(decoded.raidNextEligibleAtEpochMs).toBe(3_600_000);
    expect(decoded.raidCount).toBe(2);
    // And it round-trips as version two from then on.
    expect(decodeRandomEvents(encodeRandomEvents(decoded))).toEqual(decoded);
  });

  it("reads a version-one sidecar with an empty slot as an empty list", () => {
    const decoded = decodeRandomEvents({
      active: null,
      nextEligibleAtEpochMs: 500_000,
      rngStreamIndex: 9,
      lastResolved: null,
      spawnCount: 2,
    });
    expect(decoded.actives).toEqual([]);
    expect(decoded.nextEligibleAtEpochMs).toBe(500_000);
    expect(decoded.spawnCount).toBe(2);
  });

  it("drops only the members it cannot name when a later build's stack arrives", () => {
    // The salvage layer that matters most for this shape: a future build's double event, half of
    // which this build has a definition for, reloads as the half it knows rather than as nothing.
    const fromTheFuture = {
      sidecarVersion: 3,
      actives: [
        { id: "sugar_rush", startedAtEpochMs: 0, endsAtEpochMs: 15_000, pendingTargetIds: [], claimedCount: 0 },
        { id: "biscuit_tsunami", startedAtEpochMs: 0, endsAtEpochMs: 30_000, pendingTargetIds: [], claimedCount: 0 },
      ],
      nextEligibleAtEpochMs: 700_000,
      rngStreamIndex: 5,
      lastResolved: null,
      spawnCount: 9,
      consumables: createInitialRandomEventsState().consumables,
    };
    const decoded = decodeRandomEvents(fromTheFuture);
    expect(decoded.actives.map((a) => a.id)).toEqual(["sugar_rush"]);
    expect(decoded.nextEligibleAtEpochMs).toBe(700_000);
    expect(decoded.spawnCount).toBe(9);
  });

  it("refuses to honour a sidecar claiming more simultaneous events than the rules allow", () => {
    const tooMany = {
      actives: Array.from({ length: 5 }, (_, index) => ({
        id: "sugar_rush",
        startedAtEpochMs: index,
        endsAtEpochMs: 15_000,
        pendingTargetIds: [],
        claimedCount: 0,
      })),
      nextEligibleAtEpochMs: 0,
      rngStreamIndex: 0,
      lastResolved: null,
      spawnCount: 1,
    };
    // Rejected outright rather than truncated to something the matrix says is impossible: a
    // five-event stack is not a save this build can honour, and the schedule regenerates.
    expect(decodeRandomEvents(tooMany).actives).toHaveLength(0);
  });

  it("round-trips a real double event through the save seam", () => {
    const state: RandomEventsState = {
      ...createInitialRandomEventsState(),
      actives: [activeOf("cookie_eclipse", 0, { pendingTargetIds: ["crumb:0", "crumb:2"], claimedCount: 3 }), activeOf("bakers_dozen", 0)],
      spawnCount: 2,
    };
    expect(decodeRandomEvents(JSON.parse(JSON.stringify(encodeRandomEvents(state))))).toEqual(state);
  });
});

/* ------------------------------------------------------------------- THE INDICATOR PLATES */

describe("the HUD indicator: three plates in the space of one", () => {
  it("compresses by stack size, and drops nothing that carries information", () => {
    expect(stackCompression(0)).toBe("full");
    expect(stackCompression(1)).toBe("full");
    expect(stackCompression(2)).toBe("tight");
    expect(stackCompression(3)).toBe("tightest");
    // There is no fourth step, because there is no fourth plate.
    expect(stackCompression(MAX_STACKED_EVENTS)).toBe("tightest");
    expect(stackCompression(9)).toBe("tightest");
  });

  it("gives every event in the game an emblem for its plate", () => {
    // A plate with no emblem is a plate with a hole in it, and a stack of three makes that much
    // more visible than a single ever did.
    for (const def of ALL_RANDOM_EVENT_DEFINITIONS) {
      expect(typeof RANDOM_EVENT_ART[def.id], `${def.id} has no emblem`).toBe("function");
    }
  });

  it("agrees with the domain about what may share a stack", () => {
    // `canJoinStack` is what the draw actually calls, so it has to give the same answers the
    // pairwise matrix does — including for the first member of an empty stack, where "can this
    // event stack at all" is the only question there is.
    for (const def of ALL_RANDOM_EVENT_DEFINITIONS) {
      expect(canJoinStack([], def.id), def.id).toBe(isStackable(def));
    }
    expect(canJoinStack(["cookie_rain"], "sprinkle_storm")).toBe(false);
    expect(canJoinStack(["clot"], "oven_hiccup")).toBe(false);
    expect(canJoinStack(["clot"], "bakers_dozen")).toBe(true);
    expect(canJoinStack(["clot", "bakers_dozen"], "static_cling")).toBe(false);
    expect(canJoinStack(["clot", "bakers_dozen"], "cookie_eclipse")).toBe(true);
  });
});
