/* ------------------------------------------------------------------------------------------
 * The frenzy class and the events designed alongside it.
 *
 * Kept in its own file rather than appended to random-events.test.ts, which already covers the
 * scheduler, the original six and the Mouse Raid at length. What is tested here is everything
 * this lane added:
 *
 *   - every new event's own arithmetic, against a real production figure rather than a stub;
 *   - THE STACKING MATRIX — every combination of a golden-cookie effect and a pool event,
 *     including the ones that hit the stated ceiling and the ones that go the other way;
 *   - the weights: that they sum to the advertised total, that the rare things really are rare
 *     over a long seeded run, and that the setbacks stay a minority;
 *   - both branches of the choice event, and the third case where nobody presses anything;
 *   - the save round-trip for every new id, including a choice mid-answer.
 * ---------------------------------------------------------------------------------------- */
import { describe, expect, it } from "vitest";

import { bnFromNumber, bnToNumber } from "../../src/shared/game/big-number";
import { totalCps } from "../../src/shared/game/cps";
import { createSplitMix32Rng } from "../../src/shared/game/golden-cookie";
import { applyGameAction, type ReducerCtx } from "../../src/shared/game/reducer";
import {
  chooseRandomEventOption,
  clickRandomEventTarget,
  COMBO_EXTEND_MS,
  COMBO_MAX_DURATION_MS,
  createInitialRandomEventsState,
  decodeRandomEvents,
  DEFAULT_RANDOM_EVENT_CONFIG,
  DEFAULT_RANDOM_EVENT_PAYOUTS,
  deliveryParcelPayout,
  encodeRandomEvents,
  EVENT_CLICK_STACK_CAP,
  EVENT_CPS_STACK_CAP,
  expiryPayout,
  extendComboWindow,
  FAST_RANDOM_EVENT_CONFIG,
  getRandomEventDefinition,
  POOL_WEIGHT_TOTAL,
  RANDOM_EVENT_DEFINITIONS,
  randomEventClickMultiplier,
  randomEventCpsMultiplier,
  resolveRandomEventConfig,
  sprinklePayout,
  stackEventMultipliers,
  tasteTestServePayout,
  TASTE_TEST_BUFF_MS,
  TASTE_TEST_BUFF_MULTIPLIER,
  tickRandomEvents,
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
  const pendingTargetIds =
    id === "sprinkle_storm"
      ? Array.from({ length: def.targetCount }, (_, i) => `sprinkle:${i}`)
      : id === "delivery_rush"
        ? Array.from({ length: def.targetCount }, (_, i) => `parcel:${i}`)
        : [];
  return {
    id,
    startedAtEpochMs,
    endsAtEpochMs: startedAtEpochMs + def.durationMs,
    pendingTargetIds,
    claimedCount: 0,
    ...extra,
  };
}

function eventsWith(active: ActiveRandomEvent): RandomEventsState {
  return { ...createInitialRandomEventsState(), actives: [active] };
}

function withActive(state: GameState, id: RandomEventId, startedAtEpochMs = 0): GameState {
  return { ...state, randomEvents: eventsWith(activeOf(id, startedAtEpochMs)) };
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

/** The ids this lane added, so a "does every new event…" test cannot silently miss one. */
const NEW_EVENT_IDS: readonly RandomEventId[] = [
  "production_frenzy",
  "click_frenzy",
  "burnt_batch_frenzy",
  "clot",
  "combo_window",
  "delivery_rush",
  "taste_test",
  "flour_shortage",
  "night_shift",
  "sprinkle_storm",
];

/* -------------------------------------------------------------------- the new definitions */

describe("the frenzy class: definitions", () => {
  it("puts all ten new events in the pool, each with a class and a real effect", () => {
    for (const id of NEW_EVENT_IDS) {
      const def = RANDOM_EVENT_DEFINITIONS.find((d) => d.id === id);
      expect(def, `${id} is not in the pool`).toBeDefined();
      expect(def!.weight).toBeGreaterThan(0);
      expect(def!.nameEn.length).toBeGreaterThan(0);
      expect(def!.nameYue.length).toBeGreaterThan(0);
      expect(def!.blurbYue.length).toBeGreaterThan(0);
      expect(def!.eventClass).toBeTruthy();
    }
  });

  it("carries the classic frenzy numbers exactly", () => {
    expect(getRandomEventDefinition("production_frenzy").cpsMultiplier).toBe(7);
    expect(getRandomEventDefinition("production_frenzy").durationMs).toBe(77_000);
    expect(getRandomEventDefinition("click_frenzy").clickMultiplier).toBe(777);
    expect(getRandomEventDefinition("click_frenzy").durationMs).toBe(13_000);
    expect(getRandomEventDefinition("burnt_batch_frenzy").cpsMultiplier).toBe(666);
    expect(getRandomEventDefinition("burnt_batch_frenzy").durationMs).toBe(6_000);
    expect(getRandomEventDefinition("clot").cpsMultiplier).toBe(0.5);
    expect(getRandomEventDefinition("clot").durationMs).toBe(66_000);
  });

  it("keeps every frenzy-class event out of the setback role and the Clot firmly in it", () => {
    for (const id of ["production_frenzy", "click_frenzy", "burnt_batch_frenzy", "combo_window"] as const) {
      expect(getRandomEventDefinition(id).isSetback, `${id} should not warn`).toBe(false);
      expect(getRandomEventDefinition(id).eventClass).toBe("frenzy");
    }
    expect(getRandomEventDefinition("clot").isSetback).toBe(true);
    expect(getRandomEventDefinition("clot").eventClass).toBe("clot");
  });

  it("gives the Night Shift a real penalty rather than a token one", () => {
    const def = getRandomEventDefinition("night_shift");
    expect(def.cpsMultiplier).toBeGreaterThan(1);
    // A tradeoff nobody can feel is a boon with extra words. A quarter is felt.
    expect(def.clickMultiplier).toBeLessThanOrEqual(0.25);
  });
});

/* ------------------------------------------------------------------------ weights, pacing */

describe("the frenzy class: weights and rarity", () => {
  it("sums the pool's weights to the advertised total", () => {
    const total = RANDOM_EVENT_DEFINITIONS.reduce((sum, d) => sum + d.weight, 0);
    expect(total).toBe(POOL_WEIGHT_TOTAL);
    // Integers, so the weighted walk stays exact rather than float-fuzzy.
    for (const def of RANDOM_EVENT_DEFINITIONS) expect(Number.isInteger(def.weight)).toBe(true);
  });

  it("keeps the events that cost something a clear minority of the bag", () => {
    const setbackWeight = RANDOM_EVENT_DEFINITIONS.filter((d) => d.isSetback).reduce((s, d) => s + d.weight, 0);
    expect(setbackWeight).toBe(15);
    expect(setbackWeight / POOL_WEIGHT_TOTAL).toBeLessThan(0.2);
  });

  it("keeps the big frenzies rare and the Burnt Batch rarest of all", () => {
    const weightOf = (id: RandomEventId) => getRandomEventDefinition(id).weight;
    expect(weightOf("burnt_batch_frenzy")).toBe(1);
    expect(weightOf("burnt_batch_frenzy")).toBeLessThan(weightOf("click_frenzy"));
    expect(weightOf("click_frenzy")).toBeLessThan(weightOf("production_frenzy"));
    // Nothing in the frenzy class may be more likely than the plain windfall that anchors the
    // pool, or the pool stops feeling like ordinary weather with occasional luck in it.
    expect(weightOf("production_frenzy")).toBeLessThan(weightOf("lucky_crumb"));
  });

  it("draws each event at roughly its weight over a long seeded run", () => {
    // Twenty thousand draws off one seeded stream: enough that a 1% event lands ~200 times and
    // a ±25% band is a real assertion rather than a coin flip.
    const rng = createSplitMix32Rng(20_260_816);
    const counts = new Map<RandomEventId, number>();
    const draws = 20_000;
    let state: RandomEventsState = createInitialRandomEventsState();
    const gameState = producingState();
    // Drive the real scheduler rather than the picker directly, so what is measured is what a
    // player would actually meet — spawns, not raw draws.
    const config: RandomEventConfig = { ...FAST_RANDOM_EVENT_CONFIG, cooldownMs: 0, minDelayMs: 0, maxDelayMs: 0 };
    let now = 0;
    let seen = 0;
    while (seen < draws && now < 5_000_000_000) {
      const before = state;
      state = tickRandomEvents(state, gameState, now, rng, { blocked: false, config }).randomEvents;
      if (state.spawnCount > before.spawnCount) {
        const id = state.actives[0]?.id ?? state.lastResolved!.id;
        if (id !== "mouse_raid") {
          counts.set(id, (counts.get(id) ?? 0) + 1);
          seen += 1;
        }
      }
      // Step by a full minute so timed events expire promptly and the loop stays quick.
      now += 60_000;
    }

    expect(seen).toBe(draws);
    for (const def of RANDOM_EVENT_DEFINITIONS) {
      const observed = (counts.get(def.id) ?? 0) / seen;
      const expected = def.weight / POOL_WEIGHT_TOTAL;
      expect(Math.abs(observed - expected), `${def.id}: expected ~${expected}, saw ${observed}`).toBeLessThan(
        expected * 0.25,
      );
    }
  });

  it("still never runs two pool events at once now the pool is sixteen", () => {
    const rng = createSplitMix32Rng(4242);
    const gameState = producingState();
    let state: RandomEventsState = createInitialRandomEventsState();
    let active = 0;
    for (let now = 0; now <= 4 * 60 * 60 * 1000; now += 200) {
      const before = state;
      state = tickRandomEvents(state, gameState, now, rng, {
        blocked: false,
        config: FAST_RANDOM_EVENT_CONFIG,
      }).randomEvents;
      if (state.actives.length > 0 && before.actives.length === 0) active += 1;
      if (state.actives.length === 0 && before.actives.length > 0) active -= 1;
      expect(active).toBeLessThanOrEqual(1);
    }
  });
});

/* ------------------------------------------------------------------------ the stacking matrix */

describe("the frenzy class: stacking rules", () => {
  it("multiplies rather than taking the larger of the two", () => {
    expect(stackEventMultipliers(7, 7, EVENT_CPS_STACK_CAP)).toBe(49);
    expect(stackEventMultipliers(1, 1, EVENT_CPS_STACK_CAP)).toBe(1);
  });

  it("lets a penalty drag a frenzy down instead of being ignored", () => {
    // A Clot during a golden frenzy: ×7 × 0.5. Still a good minute, visibly a worse one.
    expect(stackEventMultipliers(7, 0.5, EVENT_CPS_STACK_CAP)).toBeCloseTo(3.5, 10);
    // An Oven Hiccup with nothing else running is exactly its own number, uncapped downward.
    expect(stackEventMultipliers(1, 0.4, EVENT_CPS_STACK_CAP)).toBeCloseTo(0.4, 10);
  });

  it("caps the combined upside at the stated ceilings and nowhere below them", () => {
    // Burnt Batch (×666) inside a golden frenzy (×7) would be ×4662.
    expect(stackEventMultipliers(666, 7, EVENT_CPS_STACK_CAP)).toBe(EVENT_CPS_STACK_CAP);
    // The same event on its own is nowhere near the cap, so an ordinary rare moment is untouched.
    expect(stackEventMultipliers(666, 1, EVENT_CPS_STACK_CAP)).toBe(666);
    expect(stackEventMultipliers(7, 7, EVENT_CPS_STACK_CAP)).toBeLessThan(EVENT_CPS_STACK_CAP);
    // Clicks: Click Frenzy (×777) inside a golden click frenzy (×3) is under the click ceiling.
    expect(stackEventMultipliers(777, 3, EVENT_CLICK_STACK_CAP)).toBe(2_331);
    expect(stackEventMultipliers(777, 20, EVENT_CLICK_STACK_CAP)).toBe(EVENT_CLICK_STACK_CAP);
  });

  it("never returns a negative or non-finite multiplier", () => {
    expect(stackEventMultipliers(-1, 5, EVENT_CPS_STACK_CAP)).toBe(0);
    expect(stackEventMultipliers(Number.NaN, 5, EVENT_CPS_STACK_CAP)).toBe(0);
  });

  it("applies the whole production matrix through the reducer", () => {
    const base = producingState({ cookies: bnFromNumber(0) });
    const cps = bnToNumber(totalCps(base));
    const cases: readonly [RandomEventId | null, number][] = [
      [null, 1],
      ["production_frenzy", 7],
      ["burnt_batch_frenzy", 666],
      ["clot", 0.5],
      ["flour_shortage", 0.5],
      ["night_shift", 3],
      ["click_frenzy", 1],
    ];
    for (const [id, expected] of cases) {
      const state = id === null ? base : withActive(base, id, 0);
      const next = applyGameAction(state, { type: "tick", elapsedMs: 1_000 }, ctxAt(1_000));
      expect(bnToNumber(next.cookies), `${id ?? "nothing"} running`).toBeCloseTo(cps * expected, 4);
    }
  });

  it("applies the whole click matrix through the reducer", () => {
    const base = producingState({ cookies: bnFromNumber(0) });
    const plain = bnToNumber(applyGameAction(base, { type: "click" }, ctxAt(1_000)).cookies);
    const cases: readonly [RandomEventId, number][] = [
      ["click_frenzy", 777],
      ["combo_window", 5],
      ["night_shift", 0.25],
      ["production_frenzy", 1],
      ["clot", 1],
    ];
    for (const [id, expected] of cases) {
      const next = applyGameAction(withActive(base, id, 0), { type: "click" }, ctxAt(1_000));
      expect(bnToNumber(next.cookies), `${id} running`).toBeCloseTo(plain * expected, 4);
    }
  });

  it("stacks a pool frenzy on top of a golden-cookie frenzy, under the cap", () => {
    const base = producingState({ cookies: bnFromNumber(0) });
    const cps = bnToNumber(totalCps(base));
    const golden = {
      ...base.goldenCookie,
      activeEffect: { kind: "frenzy", expiresAtEpochMs: 10_000, multiplier: 7 } as const,
    };

    const both = applyGameAction(
      { ...withActive(base, "production_frenzy", 0), goldenCookie: golden },
      { type: "tick", elapsedMs: 1_000 },
      ctxAt(1_000),
    );
    expect(bnToNumber(both.cookies)).toBeCloseTo(cps * 49, 3);

    // And the case the cap exists for.
    const capped = applyGameAction(
      { ...withActive(base, "burnt_batch_frenzy", 0), goldenCookie: golden },
      { type: "tick", elapsedMs: 1_000 },
      ctxAt(1_000),
    );
    expect(bnToNumber(capped.cookies)).toBeCloseTo(cps * EVENT_CPS_STACK_CAP, 2);

    // And a Clot dragging the golden frenzy down rather than being ignored by it.
    const dragged = applyGameAction(
      { ...withActive(base, "clot", 0), goldenCookie: golden },
      { type: "tick", elapsedMs: 1_000 },
      ctxAt(1_000),
    );
    expect(bnToNumber(dragged.cookies)).toBeCloseTo(cps * 3.5, 4);
  });

  it("stacks a pool click event on top of a golden click frenzy", () => {
    const base = producingState({ cookies: bnFromNumber(0) });
    const plain = bnToNumber(applyGameAction(base, { type: "click" }, ctxAt(1_000)).cookies);
    const golden = {
      ...base.goldenCookie,
      activeEffect: { kind: "clickFrenzy", expiresAtEpochMs: 10_000, multiplier: 3 } as const,
    };
    const next = applyGameAction(
      { ...withActive(base, "sugar_rush", 0), goldenCookie: golden },
      { type: "click" },
      ctxAt(1_000),
    );
    expect(bnToNumber(next.cookies)).toBeCloseTo(plain * 21, 4);
  });

  it("stops multiplying the moment an event's window closes", () => {
    const state = eventsWith(activeOf("production_frenzy", 0));
    expect(randomEventCpsMultiplier(state, 10_000)).toBe(7);
    expect(randomEventCpsMultiplier(state, 77_000)).toBe(1);
    const clicky = eventsWith(activeOf("click_frenzy", 0));
    expect(randomEventClickMultiplier(clicky, 1_000)).toBe(777);
    expect(randomEventClickMultiplier(clicky, 13_001)).toBe(1);
  });
});

/* ---------------------------------------------------------------------- the combo window */

describe("Combo Window", () => {
  it("extends by one step per click and never past its ceiling", () => {
    let state = eventsWith(activeOf("combo_window", 0));
    const originalEnd = state.actives[0]!.endsAtEpochMs;

    state = extendComboWindow(state, 1_000);
    expect(state.actives[0]!.endsAtEpochMs).toBe(originalEnd + COMBO_EXTEND_MS);
    expect(state.actives[0]!.claimedCount).toBe(1);

    // Hammer it far past the ceiling; the window stops exactly at the ceiling.
    for (let i = 0; i < 500; i += 1) state = extendComboWindow(state, 2_000);
    expect(state.actives[0]!.endsAtEpochMs).toBe(COMBO_MAX_DURATION_MS);
  });

  it("is a no-op — the same object — when no combo is running or the window has closed", () => {
    const idle = createInitialRandomEventsState();
    expect(extendComboWindow(idle, 1_000)).toBe(idle);

    const other = eventsWith(activeOf("production_frenzy", 0));
    expect(extendComboWindow(other, 1_000)).toBe(other);

    const expired = eventsWith(activeOf("combo_window", 0));
    expect(extendComboWindow(expired, 999_999)).toBe(expired);
  });

  it("is extended by a real click through the reducer, and not by a click without one", () => {
    const base = producingState();
    const combo = withActive(base, "combo_window", 0);
    const after = applyGameAction(combo, { type: "click" }, ctxAt(1_000));
    expect(after.randomEvents.actives[0]!.endsAtEpochMs).toBe(combo.randomEvents.actives[0]!.endsAtEpochMs + COMBO_EXTEND_MS);

    const frenzy = withActive(base, "production_frenzy", 0);
    const unchanged = applyGameAction(frenzy, { type: "click" }, ctxAt(1_000));
    expect(unchanged.randomEvents.actives[0]!.endsAtEpochMs).toBe(frenzy.randomEvents.actives[0]!.endsAtEpochMs);
  });
});

/* --------------------------------------------------------------------- the delivery rush */

describe("Delivery Rush", () => {
  it("pays a parcel only when it is the next one in the chain", () => {
    const gameState = producingState();
    const state = eventsWith(activeOf("delivery_rush", 0));

    // Out of order: refused, nothing paid, nothing removed.
    const wrong = clickRandomEventTarget(state, gameState, "parcel:2", 1_000, fixedRng());
    expect(wrong.claimed).toBe(false);
    expect(wrong.randomEvents).toBe(state);

    const right = clickRandomEventTarget(state, gameState, "parcel:0", 1_000, fixedRng());
    expect(right.claimed).toBe(true);
    expect(right.randomEvents.actives[0]!.pendingTargetIds).toEqual(["parcel:1", "parcel:2"]);
    expect(bnToNumber(right.bonus)).toBeCloseTo(bnToNumber(deliveryParcelPayout(gameState, false)), 6);
  });

  it("pays the completion bonus on the last parcel and ends the event early", () => {
    const gameState = producingState();
    let state = eventsWith(activeOf("delivery_rush", 0));
    let total = 0;
    for (const id of ["parcel:0", "parcel:1", "parcel:2"]) {
      const result = clickRandomEventTarget(state, gameState, id, 1_000, fixedRng());
      expect(result.claimed).toBe(true);
      total += bnToNumber(result.bonus);
      state = result.randomEvents;
    }
    expect(state.actives).toHaveLength(0);
    expect(state.lastResolved).toEqual({
      id: "delivery_rush",
      resolvedAtEpochMs: 1_000,
      claimedCount: 3,
      endedEarly: true,
    });

    const cps = bnToNumber(totalCps(gameState));
    const p = DEFAULT_RANDOM_EVENT_PAYOUTS;
    expect(total).toBeCloseTo(cps * (3 * p.deliveryParcelCpsSeconds + p.deliveryCompletionCpsSeconds), 4);
    // Finishing is worth more than the parcels alone, or the chain would not be a chain.
    expect(p.deliveryCompletionCpsSeconds).toBeGreaterThan(p.deliveryParcelCpsSeconds);
  });

  it("keeps an abandoned chain worth exactly what was actually delivered", () => {
    const gameState = producingState();
    const state = eventsWith(activeOf("delivery_rush", 0));
    const one = clickRandomEventTarget(state, gameState, "parcel:0", 1_000, fixedRng());
    expect(bnToNumber(one.bonus)).toBeCloseTo(
      bnToNumber(totalCps(gameState)) * DEFAULT_RANDOM_EVENT_PAYOUTS.deliveryParcelCpsSeconds,
      4,
    );
    // Expiry with parcels still out pays nothing extra and takes nothing.
    const expired = tickRandomEvents(one.randomEvents, gameState, 999_999, fixedRng(), {
      blocked: false,
      config: DEFAULT_RANDOM_EVENT_CONFIG,
    });
    expect(bnToNumber(expired.instantBonus)).toBe(0);
    expect(expired.raidTheft).toBeNull();
  });
});

/* -------------------------------------------------------------------- the sprinkle storm */

describe("Sprinkle Storm", () => {
  it("makes each sprinkle worth more than the last, by the stated escalation", () => {
    const gameState = producingState();
    const first = bnToNumber(sprinklePayout(gameState, 0));
    const fifth = bnToNumber(sprinklePayout(gameState, 4));
    const tenth = bnToNumber(sprinklePayout(gameState, 9));
    const step = DEFAULT_RANDOM_EVENT_PAYOUTS.sprinkleEscalation;
    expect(fifth).toBeCloseTo(first * (1 + step * 4), 6);
    expect(tenth).toBeCloseTo(first * (1 + step * 9), 6);
    expect(tenth).toBeGreaterThan(first);
  });

  it("escalates through real clicks, and clearing the stage ends the storm early", () => {
    const gameState = producingState();
    let state = eventsWith(activeOf("sprinkle_storm", 0));
    const paid: number[] = [];
    for (let i = 0; i < 10; i += 1) {
      const result = clickRandomEventTarget(state, gameState, `sprinkle:${i}`, 1_000, fixedRng());
      expect(result.claimed, `sprinkle ${i}`).toBe(true);
      paid.push(bnToNumber(result.bonus));
      state = result.randomEvents;
    }
    for (let i = 1; i < paid.length; i += 1) expect(paid[i]).toBeGreaterThan(paid[i - 1]);
    expect(state.actives).toHaveLength(0);
    expect(state.lastResolved!.endedEarly).toBe(true);

    // The whole storm is worth 23.5 sprinkles at the shipped 0.3, not ten.
    const totalPaid = paid.reduce((a, b) => a + b, 0);
    expect(totalPaid / paid[0]).toBeCloseTo(23.5, 4);
  });

  it("refuses a sprinkle that was already caught", () => {
    const gameState = producingState();
    const state = eventsWith(activeOf("sprinkle_storm", 0));
    const first = clickRandomEventTarget(state, gameState, "sprinkle:3", 1_000, fixedRng());
    const again = clickRandomEventTarget(first.randomEvents, gameState, "sprinkle:3", 1_000, fixedRng());
    expect(again.claimed).toBe(false);
    expect(bnToNumber(again.bonus)).toBe(0);
  });
});

/* ------------------------------------------------------------------------- the taste test */

describe("Taste Test: both branches", () => {
  it("pays a lump sum and closes the slot when the tray is served", () => {
    const gameState = producingState();
    const state = eventsWith(activeOf("taste_test", 0));
    const result = chooseRandomEventOption(state, gameState, "serve", 1_000, fixedRng());

    expect(result.claimed).toBe(true);
    expect(bnToNumber(result.bonus)).toBeCloseTo(bnToNumber(tasteTestServePayout(gameState)), 6);
    expect(result.randomEvents.actives).toHaveLength(0);
    expect(result.randomEvents.lastResolved).toEqual({
      id: "taste_test",
      resolvedAtEpochMs: 1_000,
      claimedCount: 1,
      endedEarly: true,
    });
    // Answering early buys no faster next event: the ordinary cooldown-plus-delay applies.
    expect(result.randomEvents.nextEligibleAtEpochMs).toBeGreaterThanOrEqual(
      1_000 + DEFAULT_RANDOM_EVENT_CONFIG.cooldownMs + DEFAULT_RANDOM_EVENT_CONFIG.minDelayMs,
    );
  });

  it("pays nothing and turns the slot into a production buff when the tray is sent back", () => {
    const gameState = producingState();
    const state = eventsWith(activeOf("taste_test", 0));
    const result = chooseRandomEventOption(state, gameState, "send_back", 1_000, fixedRng());

    expect(result.claimed).toBe(true);
    expect(bnToNumber(result.bonus)).toBe(0);
    expect(result.randomEvents.actives[0]!.choiceTaken).toBe("send_back");
    // The minute starts at the press, not at the spawn.
    expect(result.randomEvents.actives[0]!.endsAtEpochMs).toBe(1_000 + TASTE_TEST_BUFF_MS);
    expect(randomEventCpsMultiplier(result.randomEvents, 2_000)).toBe(TASTE_TEST_BUFF_MULTIPLIER);
    expect(randomEventCpsMultiplier(result.randomEvents, 1_000 + TASTE_TEST_BUFF_MS)).toBe(1);
  });

  it("multiplies nothing while the question is still on screen", () => {
    const state = eventsWith(activeOf("taste_test", 0));
    expect(randomEventCpsMultiplier(state, 1_000)).toBe(1);
    expect(randomEventClickMultiplier(state, 1_000)).toBe(1);
  });

  it("makes the two answers worth exactly the same, so neither is the secret right button", () => {
    const gameState = producingState();
    const lump = bnToNumber(tasteTestServePayout(gameState));
    const cps = bnToNumber(totalCps(gameState));
    // The buff is worth (multiplier - 1) × its duration of EXTRA production: the baseline minute
    // would have been produced anyway, so counting it would flatter the buff by a whole minute.
    const buff = cps * ((TASTE_TEST_BUFF_MULTIPLIER - 1) * (TASTE_TEST_BUFF_MS / 1000));
    expect(buff).toBeCloseTo(lump, 4);
  });

  it("refuses a second answer, a late answer, and an answer to something that did not ask", () => {
    const gameState = producingState();
    const state = eventsWith(activeOf("taste_test", 0));

    const first = chooseRandomEventOption(state, gameState, "send_back", 1_000, fixedRng());
    const second = chooseRandomEventOption(first.randomEvents, gameState, "serve", 1_100, fixedRng());
    expect(second.claimed).toBe(false);
    expect(second.randomEvents).toBe(first.randomEvents);

    const late = chooseRandomEventOption(state, gameState, "serve", 99_999, fixedRng());
    expect(late.claimed).toBe(false);

    const notAChoice = eventsWith(activeOf("production_frenzy", 0));
    expect(chooseRandomEventOption(notAChoice, gameState, "serve", 1_000, fixedRng()).claimed).toBe(false);

    expect(chooseRandomEventOption(createInitialRandomEventsState(), gameState, "serve", 1_000, fixedRng()).claimed).toBe(
      false,
    );
  });

  it("pays nothing at all when the window runs out unanswered", () => {
    const gameState = producingState();
    const state = eventsWith(activeOf("taste_test", 0));
    const result = tickRandomEvents(state, gameState, 999_999, fixedRng(), {
      blocked: false,
      config: DEFAULT_RANDOM_EVENT_CONFIG,
    });
    expect(bnToNumber(result.instantBonus)).toBe(0);
    expect(result.randomEvents.actives).toHaveLength(0);
  });

  it("moves real cookies through the reducer for both answers", () => {
    const base = withActive(producingState({ cookies: bnFromNumber(0) }), "taste_test", 0);
    const served = applyGameAction(base, { type: "randomEventChoose", choiceId: "serve" }, ctxAt(1_000));
    expect(bnToNumber(served.cookies)).toBeCloseTo(bnToNumber(tasteTestServePayout(base)), 4);

    const sentBack = applyGameAction(base, { type: "randomEventChoose", choiceId: "send_back" }, ctxAt(1_000));
    expect(bnToNumber(sentBack.cookies)).toBe(0);
    const ticked = applyGameAction(sentBack, { type: "tick", elapsedMs: 1_000 }, ctxAt(2_000));
    expect(bnToNumber(ticked.cookies)).toBeCloseTo(bnToNumber(totalCps(base)) * TASTE_TEST_BUFF_MULTIPLIER, 4);
  });
});

/* ---------------------------------------------------------------------- the flour shortage */

describe("Flour Shortage", () => {
  it("pays its rebound on expiry, and only it does", () => {
    const gameState = producingState();
    const cps = bnToNumber(totalCps(gameState));
    expect(bnToNumber(expiryPayout("flour_shortage", gameState))).toBeCloseTo(
      cps * DEFAULT_RANDOM_EVENT_PAYOUTS.flourShortageReboundCpsSeconds,
      4,
    );
    for (const id of ["clot", "production_frenzy", "cookie_rain", "night_shift"] as const) {
      expect(bnToNumber(expiryPayout(id, gameState)), `${id} should pay nothing on expiry`).toBe(0);
    }
  });

  it("leaves the player ahead of where the dip left them", () => {
    const def = getRandomEventDefinition("flour_shortage");
    const lost = (def.durationMs / 1000) * (1 - def.cpsMultiplier);
    expect(DEFAULT_RANDOM_EVENT_PAYOUTS.flourShortageReboundCpsSeconds).toBeGreaterThan(lost);
  });

  it("keeps that promise under a golden frenzy, where the dip costs frenzy-scaled seconds", () => {
    const gameState = producingState();
    const cps = bnToNumber(totalCps(gameState));
    const def = getRandomEventDefinition("flour_shortage");
    const frenzy = 7;

    // What the dip actually costs when it is applied on top of a ×7 frenzy: thirty seconds at
    // half of a rate that was seven times standing, against what those thirty seconds would
    // otherwise have paid.
    const lost = (def.durationMs / 1000) * frenzy * (1 - def.cpsMultiplier) * cps;
    const rebound = bnToNumber(expiryPayout("flour_shortage", gameState, DEFAULT_RANDOM_EVENT_PAYOUTS, frenzy));

    expect(rebound).toBeGreaterThan(lost);
    // And on a quiet save nothing changes: the peak is 1 and the rebound is the plain 45 seconds.
    expect(bnToNumber(expiryPayout("flour_shortage", gameState, DEFAULT_RANDOM_EVENT_PAYOUTS, 1))).toBeCloseTo(
      cps * DEFAULT_RANDOM_EVENT_PAYOUTS.flourShortageReboundCpsSeconds,
      4,
    );
  });

  it("remembers the frenzy it lived through and pays the rebound at that rate", () => {
    const frenzy = 7;
    const base = producingState({ cookies: bnFromNumber(0) });
    const cps = bnToNumber(totalCps(base));
    const withFrenzy: GameState = {
      ...withActive(base, "flour_shortage", 0),
      goldenCookie: {
        ...base.goldenCookie,
        activeEffect: { kind: "frenzy", multiplier: frenzy, expiresAtEpochMs: 20_000 },
      },
    };

    // A tick inside the window records the frenzy; by the time the lorry arrives the frenzy is
    // long over, and the rebound still has to be measured at the rate the dip was suffered at.
    const during = applyGameAction(withFrenzy, { type: "tick", elapsedMs: 1_000 }, ctxAt(10_000));
    expect(during.randomEvents.actives[0]?.peakLiveCpsMultiplier).toBe(frenzy);

    const after = applyGameAction(during, { type: "tick", elapsedMs: 1_000 }, ctxAt(60_000));
    expect(after.randomEvents.actives).toHaveLength(0);
    const rebound = bnToNumber(after.cookies) - bnToNumber(during.cookies) - cps;
    expect(rebound).toBeCloseTo(cps * DEFAULT_RANDOM_EVENT_PAYOUTS.flourShortageReboundCpsSeconds * frenzy, 2);
  });

  it("hands the rebound to the balance through a real reducer tick", () => {
    const gameState = producingState({ cookies: bnFromNumber(0) });
    const active = withActive(gameState, "flour_shortage", 0);
    const cps = bnToNumber(totalCps(gameState));
    // One tick after the window has closed: the event resolves and the lorry arrives.
    const next = applyGameAction(active, { type: "tick", elapsedMs: 1_000 }, ctxAt(60_000));
    expect(next.randomEvents.actives).toHaveLength(0);
    // A resolved event no longer multiplies, so the tick's own second is at full rate.
    expect(bnToNumber(next.cookies)).toBeCloseTo(
      cps + cps * DEFAULT_RANDOM_EVENT_PAYOUTS.flourShortageReboundCpsSeconds,
      3,
    );
  });
});

/* -------------------------------------------------------------------- persistence, flags */

describe("the frenzy class: persistence and the capture flag", () => {
  it("round-trips every new event id through the save seam", () => {
    for (const id of NEW_EVENT_IDS) {
      const state: RandomEventsState = {
        ...createInitialRandomEventsState(),
        actives: [activeOf(id, 4_000)],
        nextEligibleAtEpochMs: 900_000,
        rngStreamIndex: 17,
        spawnCount: 5,
      };
      const back = decodeRandomEvents(JSON.parse(JSON.stringify(encodeRandomEvents(state))));
      expect(back, `${id} did not survive the round trip`).toEqual(state);
    }
  });

  it("round-trips a Taste Test that has already been answered", () => {
    const state: RandomEventsState = {
      ...createInitialRandomEventsState(),
      actives: [activeOf("taste_test", 4_000, { choiceTaken: "send_back", claimedCount: 1 })],
      spawnCount: 1,
    };
    const back = decodeRandomEvents(JSON.parse(JSON.stringify(encodeRandomEvents(state))));
    expect(back).toEqual(state);
    // And the buff is still a buff after a reload, rather than quietly evaporating.
    expect(randomEventCpsMultiplier(back, 5_000)).toBe(TASTE_TEST_BUFF_MULTIPLIER);
  });

  it("round-trips a half-cleared chain and a half-caught storm", () => {
    for (const id of ["delivery_rush", "sprinkle_storm"] as const) {
      const full = activeOf(id, 0);
      const state: RandomEventsState = {
        ...createInitialRandomEventsState(),
        actives: [{ ...full, pendingTargetIds: full.pendingTargetIds.slice(1), claimedCount: 1 }],
      };
      const back = decodeRandomEvents(JSON.parse(JSON.stringify(encodeRandomEvents(state))));
      expect(back).toEqual(state);
    }
  });

  it("reads a save from before these events existed as a save where none had happened", () => {
    expect(decodeRandomEvents(undefined)).toEqual(createInitialRandomEventsState());
    expect(decodeRandomEvents({ active: { id: "not_a_real_event" } })).toEqual(createInitialRandomEventsState());
  });

  it("only forces an event for a flag naming a real pool event", () => {
    const forced = resolveRandomEventConfig("event:burnt_batch_frenzy");
    expect(forced.forcedPoolEventId).toBe("burnt_batch_frenzy");
    expect(forced.minDelayMs).toBe(FAST_RANDOM_EVENT_CONFIG.minDelayMs);

    // The raid is not in the pool, so it cannot be forced through this door.
    expect(resolveRandomEventConfig("event:mouse_raid")).toBe(DEFAULT_RANDOM_EVENT_CONFIG);
    expect(resolveRandomEventConfig("event:nonsense")).toBe(DEFAULT_RANDOM_EVENT_CONFIG);
    expect(resolveRandomEventConfig("event:")).toBe(DEFAULT_RANDOM_EVENT_CONFIG);
    // And the shipped resolutions are untouched by the new branch.
    expect(resolveRandomEventConfig(null)).toBe(DEFAULT_RANDOM_EVENT_CONFIG);
    expect(resolveRandomEventConfig("1")).toBe(FAST_RANDOM_EVENT_CONFIG);
  });

  it("spawns exactly the forced event, with its real duration and arithmetic", () => {
    const config = resolveRandomEventConfig("event:production_frenzy");
    const rng = createSplitMix32Rng(7);
    const gameState = producingState();
    let state = createInitialRandomEventsState();
    for (let now = 0; now <= 60_000 && state.actives.length === 0; now += 200) {
      state = tickRandomEvents(state, gameState, now, rng, { blocked: false, config }).randomEvents;
      // The raid clock seeds on the first tick; skip past that without spawning anything.
      if (state.actives[0]?.id === "mouse_raid") throw new Error("the raid should not be forced");
    }
    expect(state.actives[0]!.id).toBe("production_frenzy");
    expect(state.actives[0]!.endsAtEpochMs - state.actives[0]!.startedAtEpochMs).toBe(77_000);
  });
});
