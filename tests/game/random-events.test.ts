import { describe, expect, it } from "vitest";

import { bnFromNumber, bnToNumber } from "../../src/shared/game/big-number";
import { totalCps } from "../../src/shared/game/cps";
import { createSplitMix32Rng } from "../../src/shared/game/golden-cookie";
import { applyGameAction, type ReducerCtx } from "../../src/shared/game/reducer";
import {
  clickRandomEventTarget,
  createInitialRandomEventsState,
  decodeRandomEvents,
  DEFAULT_RANDOM_EVENT_CONFIG,
  DEFAULT_RANDOM_EVENT_PAYOUTS,
  encodeRandomEvents,
  FAST_RANDOM_EVENT_CONFIG,
  getRandomEventDefinition,
  instantPayout,
  rainDropPayout,
  RANDOM_EVENT_DEFINITIONS,
  randomEventClickMultiplier,
  randomEventCpsMultiplier,
  randomEventRebateFraction,
  remainingFraction,
  resolveRandomEventConfig,
  tickRandomEvents,
  type ActiveRandomEvent,
  type RandomEventConfig,
  type RandomEventId,
  type RandomEventsState,
} from "../../src/shared/game/random-events";
import type { GameState, RngPort } from "../../src/shared/game/types";
import { freshState, fixedRng } from "./test-helpers";

/* ------------------------------------------------------------------------------ helpers */

/** A save with real production, so CPS-scaled payouts have something to scale against. */
function producingState(overrides: Partial<GameState> = {}): GameState {
  return freshState({ generators: [{ id: "cursor", count: 100 }], ...overrides });
}

function activeEvent(id: RandomEventId, startedAtEpochMs = 0): ActiveRandomEvent {
  const def = getRandomEventDefinition(id);
  const pendingTargetIds =
    id === "cookie_rain"
      ? Array.from({ length: def.targetCount }, (_, i) => `rain:${i}`)
      : id === "oven_hiccup"
        ? ["oven:fix"]
        : [];
  return {
    id,
    startedAtEpochMs,
    endsAtEpochMs: startedAtEpochMs + def.durationMs,
    pendingTargetIds,
    claimedCount: 0,
  };
}

function withActive(state: GameState, id: RandomEventId, startedAtEpochMs = 0): GameState {
  return {
    ...state,
    randomEvents: { ...createInitialRandomEventsState(), active: activeEvent(id, startedAtEpochMs) },
  };
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

interface SpawnLogEntry {
  readonly id: RandomEventId;
  readonly spawnedAt: number;
  readonly resolvedAt: number;
}

/**
 * Drives the scheduler over `durationMs` of simulated time at a fixed 200ms tick — the same
 * cadence GameProvider's real loop uses — and reports every event it produced. Nothing here
 * reads a clock or calls Math.random; the whole run is a pure function of (seed, config).
 */
function simulate(
  seed: number,
  config: RandomEventConfig,
  durationMs: number,
  options: { blockedUntilMs?: number } = {},
): SpawnLogEntry[] {
  const rng = createSplitMix32Rng(seed);
  const gameState = producingState();
  let state: RandomEventsState = createInitialRandomEventsState();
  const log: SpawnLogEntry[] = [];
  let openIndex = -1;

  for (let now = 0; now <= durationMs; now += 200) {
    const before = state;
    const blocked = now < (options.blockedUntilMs ?? 0);
    state = tickRandomEvents(state, gameState, now, rng, { blocked, config }).randomEvents;

    if (state.spawnCount > before.spawnCount) {
      const id = state.active?.id ?? state.lastResolved!.id;
      // An instant event spawns and resolves in the same tick.
      log.push({ id, spawnedAt: now, resolvedAt: state.active ? Number.NaN : now });
      openIndex = state.active ? log.length - 1 : -1;
    } else if (before.active !== null && state.active === null && openIndex >= 0) {
      log[openIndex] = { ...log[openIndex], resolvedAt: now };
      openIndex = -1;
    }
  }
  return log.filter((entry) => Number.isFinite(entry.resolvedAt));
}

/* --------------------------------------------------------------------------- the pool */

describe("random events: the pool", () => {
  it("has six distinct events, each with a real effect", () => {
    expect(RANDOM_EVENT_DEFINITIONS).toHaveLength(6);
    expect(new Set(RANDOM_EVENT_DEFINITIONS.map((d) => d.id)).size).toBe(6);
    for (const def of RANDOM_EVENT_DEFINITIONS) {
      const hasEffect =
        def.cpsMultiplier !== 1 ||
        def.clickMultiplier !== 1 ||
        def.rebateFraction !== 0 ||
        def.targetCount > 0 ||
        def.shape === "instant";
      expect(hasEffect, `${def.id} does nothing`).toBe(true);
      expect(def.weight).toBeGreaterThan(0);
      expect(def.nameEn.length).toBeGreaterThan(0);
      expect(def.nameYue.length).toBeGreaterThan(0);
    }
  });

  it("includes exactly one setback, so the pool is not all upside", () => {
    expect(RANDOM_EVENT_DEFINITIONS.filter((d) => d.isSetback).map((d) => d.id)).toEqual(["oven_hiccup"]);
    expect(getRandomEventDefinition("oven_hiccup").cpsMultiplier).toBeLessThan(1);
  });

  it("gives every timed and clickable event a positive duration, and instants none", () => {
    for (const def of RANDOM_EVENT_DEFINITIONS) {
      if (def.shape === "instant") expect(def.durationMs).toBe(0);
      else expect(def.durationMs).toBeGreaterThan(0);
    }
  });
});

/* ----------------------------------------------------------------------- the scheduler */

describe("random events: scheduler determinism", () => {
  it("replays exactly from the same seed", () => {
    const a = simulate(1234, FAST_RANDOM_EVENT_CONFIG, 10 * 60 * 1000);
    const b = simulate(1234, FAST_RANDOM_EVENT_CONFIG, 10 * 60 * 1000);
    expect(a.length).toBeGreaterThan(20);
    expect(b).toEqual(a);
  });

  it("produces a different timeline from a different seed", () => {
    const a = simulate(1, FAST_RANDOM_EVENT_CONFIG, 5 * 60 * 1000);
    const b = simulate(2, FAST_RANDOM_EVENT_CONFIG, 5 * 60 * 1000);
    expect(b).not.toEqual(a);
  });

  it("never has two events running at once", () => {
    const log = simulate(99, FAST_RANDOM_EVENT_CONFIG, 30 * 60 * 1000);
    expect(log.length).toBeGreaterThan(50);
    for (let i = 1; i < log.length; i += 1) {
      expect(log[i].spawnedAt).toBeGreaterThanOrEqual(log[i - 1].resolvedAt);
    }
  });

  it("honours the cooldown and the spawn window between one event and the next", () => {
    const config = FAST_RANDOM_EVENT_CONFIG;
    const log = simulate(7, config, 30 * 60 * 1000);
    const tick = 200;
    for (let i = 1; i < log.length; i += 1) {
      const gap = log[i].spawnedAt - log[i - 1].resolvedAt;
      expect(gap).toBeGreaterThanOrEqual(config.cooldownMs + config.minDelayMs);
      // The upper bound carries one tick of slack: the scheduler can only act on a tick
      // boundary, so it may notice its own eligibility up to one tick late.
      expect(gap).toBeLessThanOrEqual(config.cooldownMs + config.maxDelayMs + tick);
    }
  });

  it("honours the shipped three-to-ten-minute window too", () => {
    const config = DEFAULT_RANDOM_EVENT_CONFIG;
    const log = simulate(42, config, 6 * 60 * 60 * 1000);
    expect(log.length).toBeGreaterThan(20);
    for (let i = 1; i < log.length; i += 1) {
      const gap = log[i].spawnedAt - log[i - 1].resolvedAt;
      expect(gap).toBeGreaterThanOrEqual(config.cooldownMs + config.minDelayMs);
      expect(gap).toBeLessThanOrEqual(config.cooldownMs + config.maxDelayMs + 200);
    }
  });

  it("draws from the whole pool rather than one event over and over", () => {
    const seen = new Set(simulate(2026, FAST_RANDOM_EVENT_CONFIG, 60 * 60 * 1000).map((e) => e.id));
    expect(seen.size).toBe(6);
  });

  it("does not spawn while a golden cookie is holding the stage", () => {
    const rng = createSplitMix32Rng(5);
    const gameState = producingState();
    let state = createInitialRandomEventsState();
    for (let now = 0; now <= 60_000; now += 200) {
      state = tickRandomEvents(state, gameState, now, rng, { blocked: true, config: FAST_RANDOM_EVENT_CONFIG }).randomEvents;
    }
    expect(state.spawnCount).toBe(0);
    expect(state.active).toBeNull();
  });

  it("returns the identical state object when a tick changes nothing", () => {
    const state: RandomEventsState = { ...createInitialRandomEventsState(), nextEligibleAtEpochMs: 500_000 };
    const result = tickRandomEvents(state, producingState(), 1_000, fixedRng(0.5), { blocked: false });
    expect(result.randomEvents).toBe(state);
    expect(bnToNumber(result.instantBonus)).toBe(0);
  });
});

/* ------------------------------------------------------------------------- arithmetic */

describe("random events: effect arithmetic", () => {
  const state = producingState();
  const cps = bnToNumber(totalCps(state));

  it("pays Grandma's Surprise Batch as ten minutes of production", () => {
    expect(cps).toBeGreaterThan(0);
    expect(bnToNumber(instantPayout("grandmas_batch", state))).toBeCloseTo(cps * 600, 4);
  });

  it("pays a Lucky Crumb as ninety seconds of production plus a flat floor", () => {
    expect(bnToNumber(instantPayout("lucky_crumb", state))).toBeCloseTo(cps * 90 + 25, 4);
  });

  it("pays a Lucky Crumb something even on a save with no production at all", () => {
    expect(bnToNumber(instantPayout("lucky_crumb", freshState({})))).toBeCloseTo(25, 6);
  });

  it("pays nothing instantly for the timed and clickable events", () => {
    for (const id of ["cookie_rain", "oven_hiccup", "sugar_rush", "market_day"] as const) {
      expect(bnToNumber(instantPayout(id, state))).toBe(0);
    }
  });

  it("pays a rain drop as production time plus clicks", () => {
    const expected = cps * DEFAULT_RANDOM_EVENT_PAYOUTS.rainDropCpsSeconds + 1 * DEFAULT_RANDOM_EVENT_PAYOUTS.rainDropClicks;
    expect(bnToNumber(rainDropPayout(state))).toBeCloseTo(expected, 4);
  });

  it("pays a rain drop on a fresh save, where a share of production would be a share of zero", () => {
    expect(bnToNumber(rainDropPayout(freshState({})))).toBeCloseTo(15, 6);
  });

  it("reports the live multipliers only while the event is actually running", () => {
    const oven = withActive(state, "oven_hiccup").randomEvents;
    expect(randomEventCpsMultiplier(oven, 0)).toBeCloseTo(0.4, 6);
    expect(randomEventCpsMultiplier(oven, 29_999)).toBeCloseTo(0.4, 6);
    expect(randomEventCpsMultiplier(oven, 30_000)).toBe(1);

    const rush = withActive(state, "sugar_rush").randomEvents;
    expect(randomEventClickMultiplier(rush, 0)).toBe(7);
    expect(randomEventClickMultiplier(rush, 15_000)).toBe(1);
    expect(randomEventCpsMultiplier(rush, 0)).toBe(1);

    const market = withActive(state, "market_day").randomEvents;
    expect(randomEventRebateFraction(market, 0)).toBeCloseTo(0.15, 6);
    expect(randomEventRebateFraction(market, 60_000)).toBe(0);
    expect(randomEventRebateFraction(createInitialRandomEventsState(), 0)).toBe(0);
  });

  it("drains the remaining-time fraction linearly and clamps at both ends", () => {
    const rain = withActive(state, "cookie_rain").randomEvents;
    expect(remainingFraction(rain, 0)).toBeCloseTo(1, 6);
    expect(remainingFraction(rain, 10_000)).toBeCloseTo(0.5, 6);
    expect(remainingFraction(rain, 999_999)).toBe(0);
    expect(remainingFraction(createInitialRandomEventsState(), 0)).toBe(0);
  });
});

/* ---------------------------------------------------------------------------- clicking */

describe("random events: clicking targets", () => {
  it("pays one drop per click and takes it out of the sky", () => {
    const game = withActive(producingState(), "cookie_rain");
    const result = clickRandomEventTarget(game.randomEvents, game, "rain:3", 1_000, fixedRng(0.5));
    expect(result.claimed).toBe(true);
    expect(bnToNumber(result.bonus)).toBeCloseTo(bnToNumber(rainDropPayout(game)), 4);
    expect(result.randomEvents.active?.pendingTargetIds).not.toContain("rain:3");
    expect(result.randomEvents.active?.pendingTargetIds).toHaveLength(11);
    expect(result.randomEvents.active?.claimedCount).toBe(1);
  });

  it("refuses a drop that has already been caught, so a double click cannot pay twice", () => {
    const game = withActive(producingState(), "cookie_rain");
    const once = clickRandomEventTarget(game.randomEvents, game, "rain:3", 1_000, fixedRng(0.5));
    const twice = clickRandomEventTarget(once.randomEvents, game, "rain:3", 1_100, fixedRng(0.5));
    expect(twice.claimed).toBe(false);
    expect(twice.randomEvents).toBe(once.randomEvents);
    expect(bnToNumber(twice.bonus)).toBe(0);
  });

  it("refuses a click after the window has closed", () => {
    const game = withActive(producingState(), "cookie_rain");
    const result = clickRandomEventTarget(game.randomEvents, game, "rain:0", 20_000, fixedRng(0.5));
    expect(result.claimed).toBe(false);
    expect(result.randomEvents).toBe(game.randomEvents);
  });

  it("ends the rain early once the last drop is caught, and starts the cooldown", () => {
    let events = withActive(producingState(), "cookie_rain").randomEvents;
    const game = producingState();
    for (let i = 0; i < 12; i += 1) {
      events = clickRandomEventTarget(events, game, `rain:${i}`, 1_000, fixedRng(0.5)).randomEvents;
    }
    expect(events.active).toBeNull();
    expect(events.lastResolved).toEqual({
      id: "cookie_rain",
      resolvedAtEpochMs: 1_000,
      claimedCount: 12,
      endedEarly: true,
    });
    expect(events.nextEligibleAtEpochMs).toBeGreaterThanOrEqual(1_000 + DEFAULT_RANDOM_EVENT_CONFIG.cooldownMs);
  });

  it("lets one thump end an Oven Hiccup, for no cookies — getting the penalty off IS the reward", () => {
    const game = withActive(producingState(), "oven_hiccup");
    const result = clickRandomEventTarget(game.randomEvents, game, "oven:fix", 5_000, fixedRng(0.5));
    expect(result.claimed).toBe(true);
    expect(bnToNumber(result.bonus)).toBe(0);
    expect(result.randomEvents.active).toBeNull();
    expect(result.randomEvents.lastResolved?.endedEarly).toBe(true);
    expect(randomEventCpsMultiplier(result.randomEvents, 5_000)).toBe(1);
  });
});

/* --------------------------------------------------------------------- config and save */

describe("random events: configuration and persistence", () => {
  it("only selects the fast developer schedule for an explicit flag value", () => {
    expect(resolveRandomEventConfig("1")).toBe(FAST_RANDOM_EVENT_CONFIG);
    expect(resolveRandomEventConfig("true")).toBe(FAST_RANDOM_EVENT_CONFIG);
    for (const value of [null, undefined, "", "0", "false", "yes", "TRUE"]) {
      expect(resolveRandomEventConfig(value)).toBe(DEFAULT_RANDOM_EVENT_CONFIG);
    }
  });

  it("keeps the shipped window measured in minutes, not seconds", () => {
    expect(DEFAULT_RANDOM_EVENT_CONFIG.minDelayMs).toBe(3 * 60 * 1000);
    expect(DEFAULT_RANDOM_EVENT_CONFIG.maxDelayMs).toBe(10 * 60 * 1000);
    expect(DEFAULT_RANDOM_EVENT_CONFIG.cooldownMs).toBeGreaterThan(0);
  });

  it("round-trips its own state through the save seam", () => {
    const state: RandomEventsState = {
      active: activeEvent("cookie_rain", 4_000),
      nextEligibleAtEpochMs: 900_000,
      rngStreamIndex: 17,
      lastResolved: { id: "sugar_rush", resolvedAtEpochMs: 3_000, claimedCount: 0, endedEarly: false },
      spawnCount: 4,
    };
    expect(decodeRandomEvents(encodeRandomEvents(state))).toEqual(state);
  });

  it("defaults to a fresh scheduler for an older save that has no such field", () => {
    expect(decodeRandomEvents(undefined)).toEqual(createInitialRandomEventsState());
    expect(decodeRandomEvents(null)).toEqual(createInitialRandomEventsState());
  });

  it("defaults rather than throwing when the stored field is nonsense", () => {
    expect(decodeRandomEvents({ active: "yes please" })).toEqual(createInitialRandomEventsState());
    expect(decodeRandomEvents(42)).toEqual(createInitialRandomEventsState());
  });
});

/* -------------------------------------------------------------------- through the reducer */

describe("random events: through the reducer", () => {
  it("halves nothing on an ordinary tick, and cuts production during an Oven Hiccup", () => {
    const base = producingState({ cookies: bnFromNumber(0) });
    const plain = applyGameAction(base, { type: "tick", elapsedMs: 1_000 }, ctxAt(1_000));
    const hiccup = applyGameAction(withActive(base, "oven_hiccup"), { type: "tick", elapsedMs: 1_000 }, ctxAt(1_000));
    expect(bnToNumber(hiccup.cookies)).toBeCloseTo(bnToNumber(plain.cookies) * 0.4, 4);
  });

  it("multiplies a click by seven during a Sugar Rush", () => {
    const base = producingState({ cookies: bnFromNumber(0) });
    const plain = applyGameAction(base, { type: "click" }, ctxAt(1_000));
    const rushed = applyGameAction(withActive(base, "sugar_rush"), { type: "click" }, ctxAt(1_000));
    expect(bnToNumber(rushed.cookies)).toBeCloseTo(bnToNumber(plain.cookies) * 7, 6);
  });

  it("hands back fifteen per cent of a purchase during Market Day, and nothing otherwise", () => {
    const budget = bnFromNumber(1_000);
    const plain = applyGameAction(freshState({ cookies: budget }), { type: "buyGenerator", generatorId: "cursor" }, ctxAt(1_000));
    const market = applyGameAction(
      withActive(freshState({ cookies: budget }), "market_day"),
      { type: "buyGenerator", generatorId: "cursor" },
      ctxAt(1_000),
    );
    const paid = 1_000 - bnToNumber(plain.cookies);
    expect(paid).toBeGreaterThan(0);
    expect(bnToNumber(market.cookies)).toBeCloseTo(bnToNumber(plain.cookies) + paid * 0.15, 4);
    // The purchase itself is identical: the rebate is money back, not a cheaper generator.
    expect(market.generators).toEqual(plain.generators);
  });

  it("rebates nothing for a purchase the reducer refused", () => {
    const broke = withActive(freshState({ cookies: bnFromNumber(0) }), "market_day");
    const next = applyGameAction(broke, { type: "buyGenerator", generatorId: "cursor" }, ctxAt(1_000));
    expect(next).toBe(broke);
  });

  it("credits a caught rain drop through the one reducer seam", () => {
    const game = withActive(producingState({ cookies: bnFromNumber(0) }), "cookie_rain");
    const next = applyGameAction(game, { type: "randomEventClick", targetId: "rain:0" }, ctxAt(1_000));
    expect(bnToNumber(next.cookies)).toBeCloseTo(bnToNumber(rainDropPayout(game)), 4);
    expect(next.randomEvents.active?.pendingTargetIds).toHaveLength(11);
  });

  it("is a no-op for a click on a target that is not there", () => {
    const game = withActive(producingState(), "cookie_rain");
    expect(applyGameAction(game, { type: "randomEventClick", targetId: "rain:99" }, ctxAt(1_000))).toBe(game);
    const quiet = producingState();
    expect(applyGameAction(quiet, { type: "randomEventClick", targetId: "oven:fix" }, ctxAt(1_000))).toBe(quiet);
  });

  it("clears the finished-event record on randomEventResolve, and is a no-op when there is none", () => {
    const resolved: GameState = {
      ...producingState(),
      randomEvents: {
        ...createInitialRandomEventsState(),
        lastResolved: { id: "lucky_crumb", resolvedAtEpochMs: 1, claimedCount: 0, endedEarly: false },
      },
    };
    expect(applyGameAction(resolved, { type: "randomEventResolve" }, ctxAt(2)).randomEvents.lastResolved).toBeNull();
    const empty = producingState();
    expect(applyGameAction(empty, { type: "randomEventResolve" }, ctxAt(2))).toBe(empty);
  });

  it("stays pure: no action mutates the state handed to it", () => {
    const game = withActive(producingState({ cookies: bnFromNumber(5_000) }), "cookie_rain");
    const snapshot = JSON.parse(JSON.stringify(game));
    applyGameAction(game, { type: "randomEventClick", targetId: "rain:1" }, ctxAt(1_000));
    applyGameAction(game, { type: "tick", elapsedMs: 1_000 }, ctxAt(1_000));
    applyGameAction(game, { type: "click" }, ctxAt(1_000));
    applyGameAction(game, { type: "buyGenerator", generatorId: "cursor" }, ctxAt(1_000));
    expect(JSON.parse(JSON.stringify(game))).toEqual(snapshot);
  });

  it("gives a fresh game an empty scheduler that has never fired", () => {
    expect(freshState({}).randomEvents).toEqual(createInitialRandomEventsState());
  });

  it("spawns through a real tick when the fast schedule is in play, and pays an instant event", () => {
    const rng = createSplitMix32Rng(3);
    let state = producingState({ cookies: bnFromNumber(0) });
    let sawSpawn = false;
    for (let now = 0; now <= 30_000 && !sawSpawn; now += 200) {
      state = applyGameAction(state, { type: "tick", elapsedMs: 200 }, ctxAt(now, rng, FAST_RANDOM_EVENT_CONFIG));
      sawSpawn = state.randomEvents.spawnCount > 0;
    }
    expect(sawSpawn).toBe(true);
    expect(state.randomEvents.active !== null || state.randomEvents.lastResolved !== null).toBe(true);
  });
});
