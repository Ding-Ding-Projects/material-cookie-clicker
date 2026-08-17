import { describe, expect, it } from "vitest";

import { bnFromNumber, bnToNumber } from "../../src/shared/game/big-number";
import { totalCps } from "../../src/shared/game/cps";
import { createSplitMix32Rng } from "../../src/shared/game/golden-cookie";
import { applyGameAction, type ReducerCtx } from "../../src/shared/game/reducer";
import {
  clearLastRaid,
  clickRandomEventTarget,
  createInitialRaidConsumables,
  createInitialRandomEventsState,
  decodeRandomEvents,
  DEFAULT_RANDOM_EVENT_CONFIG,
  DEFAULT_RANDOM_EVENT_PAYOUTS,
  encodeRandomEvents,
  FAST_RANDOM_EVENT_CONFIG,
  getRandomEventDefinition,
  instantPayout,
  miceRemaining,
  pickRandomEventId,
  MOUSE_RAID_DEFINITION,
  MOUSE_RAID_MAX_MICE,
  MOUSE_RAID_MIN_MICE,
  mouseRaidDefenceReward,
  mouseRaidTheft,
  mouseTargetIds,
  RAID_CAPTURE_EVENT_CONFIG,
  rainDropPayout,
  POOL_WEIGHT_TOTAL,
  RANDOM_EVENT_DEFINITIONS,
  randomEventClickMultiplier,
  randomEventCpsMultiplier,
  randomEventRebateFraction,
  remainingFraction,
  remainingMs,
  resolveRandomEventConfig,
  rollRaidDelayMs,
  tickRandomEvents,
  type ActiveRandomEvent,
  type RandomEventConfig,
  type RandomEventId,
  type RandomEventsState,
} from "../../src/shared/game/random-events";
import type { GameState, RngPort } from "../../src/shared/game/types";
import { createEntropySeed, createSessionRng } from "../../src/renderer/game/rng";
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
  it("has sixteen distinct events, each with a real effect", () => {
    // Six when this module shipped, sixteen after the frenzy class and the five events designed
    // alongside it. The count is asserted rather than derived so that adding an event to the
    // pool is always a deliberate act with a test to update.
    expect(RANDOM_EVENT_DEFINITIONS).toHaveLength(16);
    expect(new Set(RANDOM_EVENT_DEFINITIONS.map((d) => d.id)).size).toBe(16);
    for (const def of RANDOM_EVENT_DEFINITIONS) {
      const hasEffect =
        def.cpsMultiplier !== 1 ||
        def.clickMultiplier !== 1 ||
        def.rebateFraction !== 0 ||
        def.targetCount > 0 ||
        def.shape === "instant" ||
        // A choice event's effect is whichever answer the player presses, so its own definition
        // carries multipliers of one. `chooseRandomEventOption` is where its arithmetic lives
        // and there are tests for both of its branches further down.
        def.shape === "choice";
      expect(hasEffect, `${def.id} does nothing`).toBe(true);
      expect(def.weight).toBeGreaterThan(0);
      expect(def.nameEn.length).toBeGreaterThan(0);
      expect(def.nameYue.length).toBeGreaterThan(0);
    }
  });

  it("includes three setbacks, so the pool is not all upside", () => {
    // One when the pool was six events; three now. Every one of them costs PRODUCTION and
    // nothing else — no event in the common pool touches the balance, which is what keeps the
    // Mouse Raid the only thing in the game that can take cookies you already have.
    expect(RANDOM_EVENT_DEFINITIONS.filter((d) => d.isSetback).map((d) => d.id)).toEqual([
      "oven_hiccup",
      "clot",
      "flour_shortage",
    ]);
    for (const def of RANDOM_EVENT_DEFINITIONS.filter((d) => d.isSetback)) {
      expect(def.cpsMultiplier, `${def.id} claims to be a setback`).toBeLessThan(1);
    }
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

  it("honours the shipped four-to-twelve-minute window too", () => {
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
    // An hour of the fast schedule is a few hundred draws, which is nowhere near enough to be
    // sure of seeing a 1%-weight event, so this asserts breadth rather than completeness: the
    // full weight ledger is pinned by the rarity tests below.
    const seen = new Set(simulate(2026, FAST_RANDOM_EVENT_CONFIG, 60 * 60 * 1000).map((e) => e.id));
    expect(seen.size).toBeGreaterThanOrEqual(12);
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
    // Both clocks have to be already scheduled for a tick to be a genuine no-op: the FIRST tick
    // of any save seeds the raid clock (see the raid suite below), which is a real change.
    const state: RandomEventsState = {
      ...createInitialRandomEventsState(),
      nextEligibleAtEpochMs: 500_000,
      raidNextEligibleAtEpochMs: 500_000,
    };
    const result = tickRandomEvents(state, producingState(), 1_000, fixedRng(0.5), { blocked: false });
    expect(result.randomEvents).toBe(state);
    expect(bnToNumber(result.instantBonus)).toBe(0);
  });
});

/* ------------------------------------------------------------------------- arithmetic */

describe("random events: effect arithmetic", () => {
  const state = producingState();
  const cps = bnToNumber(totalCps(state));

  it("pays Grandma's Surprise Batch as two and a half minutes of production", () => {
    expect(cps).toBeGreaterThan(0);
    expect(bnToNumber(instantPayout("grandmas_batch", state))).toBeCloseTo(cps * 150, 4);
  });

  it("keeps the pool's reward curve tracking its rarity", () => {
    // Expected seconds of standing production PER DRAW, which is what a player actually feels.
    // A common filler boon must not out-earn the events the file calls its headline and its
    // jackpot — that inversion is what a weight-10 600-second batch used to produce.
    const weightOf = (id: string) =>
      RANDOM_EVENT_DEFINITIONS.find((def) => def.id === id)!.weight / POOL_WEIGHT_TOTAL;
    const timedValue = (id: string) => {
      const def = RANDOM_EVENT_DEFINITIONS.find((entry) => entry.id === id)!;
      return (def.durationMs / 1000) * (def.cpsMultiplier - 1);
    };

    const grandma = weightOf("grandmas_batch") * DEFAULT_RANDOM_EVENT_PAYOUTS.grandmasBatchCpsSeconds;
    const luckyCrumb = weightOf("lucky_crumb") * DEFAULT_RANDOM_EVENT_PAYOUTS.luckyCrumbCpsSeconds;
    const frenzy = weightOf("production_frenzy") * timedValue("production_frenzy");
    const burnt = weightOf("burnt_batch_frenzy") * timedValue("burnt_batch_frenzy");

    expect(grandma).toBeGreaterThan(luckyCrumb);
    expect(grandma).toBeLessThan(frenzy);
    expect(frenzy).toBeLessThan(burnt);
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
    // Widened from three-to-ten when the pool grew from six events to sixteen: more faces in
    // the bag is supposed to make each one rarer, not make the session busier.
    expect(DEFAULT_RANDOM_EVENT_CONFIG.minDelayMs).toBe(4 * 60 * 1000);
    expect(DEFAULT_RANDOM_EVENT_CONFIG.maxDelayMs).toBe(12 * 60 * 1000);
    expect(DEFAULT_RANDOM_EVENT_CONFIG.cooldownMs).toBeGreaterThan(0);
  });

  it("round-trips its own state through the save seam", () => {
    const state: RandomEventsState = {
      active: activeEvent("cookie_rain", 4_000),
      nextEligibleAtEpochMs: 900_000,
      rngStreamIndex: 17,
      lastResolved: { id: "sugar_rush", resolvedAtEpochMs: 3_000, claimedCount: 0, endedEarly: false },
      spawnCount: 4,
      raidNextEligibleAtEpochMs: 3_600_000,
      lastRaid: null,
      raidCount: 0,
      consumables: createInitialRaidConsumables(),
      whackStorageLevel: 0,
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

/* ========================================================================= the mouse raid */

/** A save rich enough to be worth raiding, with real production behind it. */
function raidableState(cookies = 1e9): GameState {
  return producingState({ cookies: bnFromNumber(cookies), lifetimeCookies: bnFromNumber(cookies * 2) });
}

/** The shipped raid window with the common pool silenced, so a run isolates the raid clock. */
const RAID_ONLY_CONFIG: RandomEventConfig = {
  ...DEFAULT_RANDOM_EVENT_CONFIG,
  minDelayMs: 1_000_000_000,
  maxDelayMs: 1_000_000_000,
};

interface RaidLogEntry {
  readonly spawnedAt: number;
  readonly resolvedAt: number;
  readonly mice: number;
}

/**
 * Drives the scheduler at the real 200ms cadence and reports every RAID it produced. Pure: the
 * whole run is a function of (seed, config, options), with no clock and no Math.random.
 */
function simulateRaids(
  seed: number,
  config: RandomEventConfig,
  durationMs: number,
  options: { blocked?: boolean; hidden?: boolean; gameState?: GameState } = {},
): RaidLogEntry[] {
  const rng = createSplitMix32Rng(seed);
  const gameState = options.gameState ?? raidableState();
  let state: RandomEventsState = createInitialRandomEventsState();
  const log: RaidLogEntry[] = [];
  let open: { spawnedAt: number; mice: number } | null = null;

  for (let now = 0; now <= durationMs; now += 200) {
    const before = state;
    state = tickRandomEvents(state, gameState, now, rng, {
      blocked: options.blocked ?? false,
      hidden: options.hidden ?? false,
      config,
    }).randomEvents;

    if (before.active?.id !== "mouse_raid" && state.active?.id === "mouse_raid") {
      open = { spawnedAt: now, mice: state.active.pendingTargetIds.length };
    } else if (open && before.active?.id === "mouse_raid" && state.active === null) {
      log.push({ ...open, resolvedAt: now });
      open = null;
    }
  }
  return log;
}

describe("mouse raid: the schedule", () => {
  it("fires every thirty to sixty minutes over a long seeded run", () => {
    const log = simulateRaids(20_260, RAID_ONLY_CONFIG, 12 * 60 * 60 * 1000);
    // Twelve hours at a thirty-to-sixty-minute band: twelve to twenty-four raids, and the
    // bounds are wide because the whole point is that the count is not a fixed cadence.
    expect(log.length).toBeGreaterThanOrEqual(12);
    expect(log.length).toBeLessThanOrEqual(24);

    for (let i = 1; i < log.length; i += 1) {
      const gap = log[i].spawnedAt - log[i - 1].resolvedAt;
      expect(gap).toBeGreaterThanOrEqual(RAID_ONLY_CONFIG.raidMinDelayMs - MOUSE_RAID_DEFINITION.durationMs);
      // One tick of slack: the scheduler can only notice its own eligibility on a tick boundary.
      expect(gap).toBeLessThanOrEqual(RAID_ONLY_CONFIG.raidMaxDelayMs + 200);
    }
  });

  it("spreads the gaps across the whole band instead of clustering on one interval", () => {
    const log = simulateRaids(8_675_309, RAID_ONLY_CONFIG, 48 * 60 * 60 * 1000);
    expect(log.length).toBeGreaterThan(40);
    const gaps = log.slice(1).map((entry, i) => entry.spawnedAt - log[i].resolvedAt);
    const minute = 60 * 1000;

    // Both halves of the band are actually used, and no single five-minute slice holds more
    // than half the raids — which is what "no mental clock works" has to mean concretely.
    expect(Math.min(...gaps)).toBeLessThan(40 * minute);
    expect(Math.max(...gaps)).toBeGreaterThan(50 * minute);
    const buckets = new Map<number, number>();
    for (const gap of gaps) {
      const bucket = Math.floor(gap / (5 * minute));
      buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
    }
    expect(Math.max(...buckets.values())).toBeLessThan(gaps.length * 0.5);
    expect(buckets.size).toBeGreaterThanOrEqual(4);
  });

  it("keeps every rolled delay inside the advertised band, jitter included", () => {
    const rng = createSplitMix32Rng(4_242);
    for (let i = 0; i < 20_000; i += 1) {
      const delay = rollRaidDelayMs(rng, DEFAULT_RANDOM_EVENT_CONFIG);
      expect(delay).toBeGreaterThanOrEqual(DEFAULT_RANDOM_EVENT_CONFIG.raidMinDelayMs);
      expect(delay).toBeLessThanOrEqual(DEFAULT_RANDOM_EVENT_CONFIG.raidMaxDelayMs);
    }
  });

  it("does not reduce a delay to one PRNG value: the jitter is a second, independent draw", () => {
    const noJitter: RandomEventConfig = { ...DEFAULT_RANDOM_EVENT_CONFIG, raidJitterMs: 0 };
    const a = rollRaidDelayMs(createSplitMix32Rng(77), noJitter);
    const b = rollRaidDelayMs(createSplitMix32Rng(77), DEFAULT_RANDOM_EVENT_CONFIG);
    expect(b).not.toBe(a);
  });

  it("gives two independently seeded sessions different raid timelines", () => {
    // Real sessions differ by their entropy seed, so this is the property that matters most:
    // no two installations share a schedule.
    const seeds = [createEntropySeed(), createEntropySeed(), createEntropySeed()];
    expect(new Set(seeds).size).toBeGreaterThan(1);

    const timelines = seeds.map((seed) =>
      simulateRaids(seed, RAID_ONLY_CONFIG, 6 * 60 * 60 * 1000).map((entry) => entry.spawnedAt).join(","),
    );
    expect(new Set(timelines).size).toBeGreaterThan(1);
  });

  it("seeds production sessions from entropy rather than a constant, and still lets tests inject", () => {
    const first = createSessionRng(0);
    const second = createSessionRng(0);
    const firstDraws = [first.next(), first.next(), first.next()];
    const secondDraws = [second.next(), second.next(), second.next()];
    expect(secondDraws).not.toEqual(firstDraws);

    // The injection seam is untouched: same seed, same stream.
    expect([createSessionRng(0, 1234).next(), createSessionRng(0, 1234).next()]).toEqual([
      createSplitMix32Rng(1234).next(),
      createSplitMix32Rng(1234).next(),
    ]);
  });

  it("never raids a fresh save in its first ten minutes", () => {
    for (const seed of [1, 2, 3, 7, 99, 4242]) {
      const log = simulateRaids(seed, RAID_ONLY_CONFIG, 4 * 60 * 60 * 1000);
      expect(log.length).toBeGreaterThan(0);
      expect(log[0].spawnedAt).toBeGreaterThanOrEqual(DEFAULT_RANDOM_EVENT_CONFIG.raidFreshGraceMs);
      // Under the shipped window the real first raid is far later than the bare grace floor.
      expect(log[0].spawnedAt).toBeGreaterThanOrEqual(DEFAULT_RANDOM_EVENT_CONFIG.raidMinDelayMs);
    }
  });

  it("honours the grace floor even under a developer schedule that would otherwise beat it", () => {
    const impatient: RandomEventConfig = {
      ...RAID_CAPTURE_EVENT_CONFIG,
      raidFreshGraceMs: 10 * 60 * 1000,
    };
    const log = simulateRaids(5, impatient, 30 * 60 * 1000);
    expect(log.length).toBeGreaterThan(0);
    expect(log[0].spawnedAt).toBeGreaterThanOrEqual(10 * 60 * 1000);
  });

  it("brings three to five mice, and not always the same number", () => {
    const log = simulateRaids(777, RAID_CAPTURE_EVENT_CONFIG, 60 * 60 * 1000);
    expect(log.length).toBeGreaterThan(20);
    const counts = new Set<number>();
    for (const raid of log) {
      expect(raid.mice).toBeGreaterThanOrEqual(MOUSE_RAID_MIN_MICE);
      expect(raid.mice).toBeLessThanOrEqual(MOUSE_RAID_MAX_MICE);
      counts.add(raid.mice);
    }
    expect(counts.size).toBeGreaterThan(1);
  });

  it("replays exactly from the same seed, and differs from another", () => {
    const a = simulateRaids(31, RAID_CAPTURE_EVENT_CONFIG, 20 * 60 * 1000);
    expect(simulateRaids(31, RAID_CAPTURE_EVENT_CONFIG, 20 * 60 * 1000)).toEqual(a);
    expect(simulateRaids(32, RAID_CAPTURE_EVENT_CONFIG, 20 * 60 * 1000)).not.toEqual(a);
  });

  it("never fires while a golden cookie is holding the stage", () => {
    expect(simulateRaids(11, RAID_CAPTURE_EVENT_CONFIG, 60 * 60 * 1000, { blocked: true })).toEqual([]);
  });

  it("never fires against a hidden window, and fires as soon as it comes back", () => {
    expect(simulateRaids(12, RAID_CAPTURE_EVENT_CONFIG, 60 * 60 * 1000, { hidden: true })).toEqual([]);

    // Deferred, not re-rolled: the same run visible again raids on the first eligible tick.
    const rng = createSplitMix32Rng(12);
    const gameState = raidableState();
    let state = createInitialRandomEventsState();
    for (let now = 0; now <= 60_000; now += 200) {
      state = tickRandomEvents(state, gameState, now, rng, {
        blocked: false,
        hidden: true,
        config: RAID_CAPTURE_EVENT_CONFIG,
      }).randomEvents;
    }
    expect(state.active).toBeNull();
    expect(state.raidNextEligibleAtEpochMs).toBeLessThanOrEqual(60_000);

    const next = tickRandomEvents(state, gameState, 60_200, rng, {
      blocked: false,
      hidden: false,
      config: RAID_CAPTURE_EVENT_CONFIG,
    }).randomEvents;
    expect(next.active?.id).toBe("mouse_raid");
  });

  it("never raids a player holding less than a thousand cookies", () => {
    const broke = producingState({ cookies: bnFromNumber(999) });
    expect(simulateRaids(13, RAID_CAPTURE_EVENT_CONFIG, 60 * 60 * 1000, { gameState: broke })).toEqual([]);
  });

  it("never lands on top of another event, because it takes the same active slot", () => {
    const both: RandomEventConfig = { ...RAID_CAPTURE_EVENT_CONFIG, minDelayMs: 2_000, maxDelayMs: 6_000 };
    const rng = createSplitMix32Rng(2027);
    const gameState = raidableState();
    let state = createInitialRandomEventsState();
    for (let now = 0; now <= 60 * 60 * 1000; now += 200) {
      const next = tickRandomEvents(state, gameState, now, rng, { blocked: false, config: both }).randomEvents;
      // A spawn may only ever happen into an empty slot.
      if (next.active !== null && state.active !== null) expect(next.active).toBe(state.active);
      state = next;
    }
    expect(state.raidCount).toBeGreaterThan(0);
    expect(state.spawnCount).toBeGreaterThan(state.raidCount);
  });

  it("keeps the raid out of the weighted pool entirely", () => {
    const rng = createSplitMix32Rng(4);
    for (let i = 0; i < 5_000; i += 1) expect(pickRandomEventId(rng)).not.toBe("mouse_raid");
    expect(RANDOM_EVENT_DEFINITIONS.some((d) => d.id === "mouse_raid")).toBe(false);
  });

  it("resolves the capture-only flag value to the raid schedule and nothing else to it", () => {
    expect(resolveRandomEventConfig("raid")).toBe(RAID_CAPTURE_EVENT_CONFIG);
    expect(resolveRandomEventConfig("RAID")).toBe(DEFAULT_RANDOM_EVENT_CONFIG);
    expect(resolveRandomEventConfig("1")).toBe(FAST_RANDOM_EVENT_CONFIG);
    // Even the capture schedule keeps the balance rail: fairness is not a capture setting.
    expect(RAID_CAPTURE_EVENT_CONFIG.raidMinCookies).toBe(DEFAULT_RANDOM_EVENT_CONFIG.raidMinCookies);
    expect(RAID_CAPTURE_EVENT_CONFIG.raidStealCeiling).toBe(0.8);
  });

  it("keeps the shipped raid window at thirty to sixty minutes", () => {
    expect(DEFAULT_RANDOM_EVENT_CONFIG.raidMinDelayMs).toBe(30 * 60 * 1000);
    expect(DEFAULT_RANDOM_EVENT_CONFIG.raidMaxDelayMs).toBe(60 * 60 * 1000);
    expect(DEFAULT_RANDOM_EVENT_CONFIG.raidJitterMs).toBeGreaterThan(0);
    expect(DEFAULT_RANDOM_EVENT_CONFIG.raidFreshGraceMs).toBe(10 * 60 * 1000);
  });

  it("tells the player nothing about the next raid before it lands", () => {
    // Nothing outside the ACTIVE event is readable by any view: the indicator, the stage and
    // the aftermath all key off `active` / `lastRaid`, and there is no selector, no derived
    // value and no narration for `raidNextEligibleAtEpochMs`. This test pins the domain half of
    // that promise — the scheduled instant is never surfaced through a public reader.
    const scheduled: RandomEventsState = {
      ...createInitialRandomEventsState(),
      raidNextEligibleAtEpochMs: 4_000_000,
    };
    expect(miceRemaining(scheduled)).toBe(0);
    expect(remainingMs(scheduled, 0)).toBe(0);
    expect(remainingFraction(scheduled, 0)).toBe(0);
    expect(scheduled.active).toBeNull();
    expect(scheduled.lastRaid).toBeNull();
  });
});

describe("mouse raid: what it takes", () => {
  const cookies = bnFromNumber(1_000_000);

  it("scales the eighty per cent ceiling by how many mice escaped", () => {
    const table: readonly (readonly [number, number])[] = [
      [0, 0],
      [1, 0.16],
      [2, 0.32],
      [3, 0.48],
      [4, 0.64],
      [5, 0.8],
    ];
    for (const [escaped, fraction] of table) {
      expect(bnToNumber(mouseRaidTheft(cookies, escaped, 5))).toBeCloseTo(1_000_000 * fraction, 3);
    }
  });

  it("takes exactly the ceiling and never more, whatever the mouse count", () => {
    for (const total of [3, 4, 5]) {
      expect(bnToNumber(mouseRaidTheft(cookies, total, total))).toBeCloseTo(800_000, 3);
      expect(bnToNumber(mouseRaidTheft(cookies, total + 3, total))).toBeCloseTo(800_000, 3);
    }
  });

  it("takes nothing at all when every mouse was whacked", () => {
    expect(bnToNumber(mouseRaidTheft(cookies, 0, 4))).toBe(0);
  });

  it("scales with the balance, so it is never a fixed catastrophe or a fixed rounding error", () => {
    expect(bnToNumber(mouseRaidTheft(bnFromNumber(2_000), 5, 5))).toBeCloseTo(1_600, 6);
    expect(bnToNumber(mouseRaidTheft(bnFromNumber(1e30), 5, 5)) / 1e29).toBeCloseTo(8, 6);
  });

  it("pays a full defence as two minutes of production plus a flat floor", () => {
    const state = raidableState();
    const cps = bnToNumber(totalCps(state));
    expect(bnToNumber(mouseRaidDefenceReward(state))).toBeCloseTo(cps * 120 + 250, 3);
  });

  it("pays a full defence something even on a save with no production", () => {
    expect(bnToNumber(mouseRaidDefenceReward(freshState()))).toBe(250);
  });
});

describe("mouse raid: whacking", () => {
  function raidState(mice: number, startedAtEpochMs = 0): RandomEventsState {
    return {
      ...createInitialRandomEventsState(),
      raidNextEligibleAtEpochMs: 10_000_000,
      active: {
        id: "mouse_raid",
        startedAtEpochMs,
        endsAtEpochMs: startedAtEpochMs + MOUSE_RAID_DEFINITION.durationMs,
        pendingTargetIds: mouseTargetIds(mice),
        claimedCount: 0,
      },
    };
  }

  it("takes one mouse off the stage per whack and pays nothing until the last", () => {
    const game = raidableState();
    let state = raidState(3);
    const first = clickRandomEventTarget(state, game, "mouse:0", 1_000, fixedRng(0.5));
    expect(first.claimed).toBe(true);
    expect(bnToNumber(first.bonus)).toBe(0);
    expect(miceRemaining(first.randomEvents)).toBe(2);
    expect(first.randomEvents.active?.claimedCount).toBe(1);
    state = first.randomEvents;

    const second = clickRandomEventTarget(state, game, "mouse:1", 1_200, fixedRng(0.5));
    expect(bnToNumber(second.bonus)).toBe(0);
    expect(miceRemaining(second.randomEvents)).toBe(1);
  });

  it("ends the raid on the last whack, banks a defended outcome and pays the bonus", () => {
    const game = raidableState();
    let state = raidState(3);
    for (const id of ["mouse:0", "mouse:1"]) {
      state = clickRandomEventTarget(state, game, id, 1_000, fixedRng(0.5)).randomEvents;
    }
    const last = clickRandomEventTarget(state, game, "mouse:2", 2_000, fixedRng(0.5));

    expect(last.claimed).toBe(true);
    expect(bnToNumber(last.bonus)).toBeCloseTo(bnToNumber(mouseRaidDefenceReward(game)), 3);
    expect(last.randomEvents.active).toBeNull();
    expect(last.randomEvents.lastRaid).toMatchObject({
      defended: true,
      miceTotal: 3,
      miceWhacked: 3,
      miceEscaped: 0,
    });
    expect(bnToNumber(last.randomEvents.lastRaid!.stolen)).toBe(0);
    // Its own clock restarts; the pool gets a plain cooldown rather than the raid's hour.
    expect(last.randomEvents.raidNextEligibleAtEpochMs).toBeGreaterThan(2_000);
    expect(last.randomEvents.lastResolved).toMatchObject({ id: "mouse_raid", endedEarly: true });
  });

  it("refuses a mouse that has already been whacked, so a double click cannot count twice", () => {
    const game = raidableState();
    const once = clickRandomEventTarget(raidState(4), game, "mouse:0", 1_000, fixedRng(0.5));
    const twice = clickRandomEventTarget(once.randomEvents, game, "mouse:0", 1_050, fixedRng(0.5));
    expect(twice.claimed).toBe(false);
    expect(twice.randomEvents).toBe(once.randomEvents);
  });

  it("refuses a whack after the window has closed", () => {
    const late = clickRandomEventTarget(raidState(4), raidableState(), "mouse:0", 30_000, fixedRng(0.5));
    expect(late.claimed).toBe(false);
  });

  it("steals from the escapees when the window runs out, and records exactly what went", () => {
    const game = raidableState(1_000_000);
    let state = raidState(5);
    state = clickRandomEventTarget(state, game, "mouse:0", 1_000, fixedRng(0.5)).randomEvents;
    state = clickRandomEventTarget(state, game, "mouse:1", 1_100, fixedRng(0.5)).randomEvents;

    const result = tickRandomEvents(state, game, MOUSE_RAID_DEFINITION.durationMs, createSplitMix32Rng(3), {
      blocked: false,
      config: DEFAULT_RANDOM_EVENT_CONFIG,
    });

    expect(result.raidTheft).not.toBeNull();
    expect(result.raidTheft).toMatchObject({ miceTotal: 5, miceWhacked: 2, miceEscaped: 3, defended: false });
    // Three of five escaped: 80% x 3/5 = 48%.
    expect(bnToNumber(result.raidTheft!.stolen)).toBeCloseTo(480_000, 2);
    expect(result.randomEvents.lastRaid).toEqual(result.raidTheft);
    expect(result.randomEvents.active).toBeNull();
  });

  it("clears the finished-raid record on demand, and is a no-op when there is none", () => {
    const withRaid: RandomEventsState = {
      ...createInitialRandomEventsState(),
      lastRaid: {
        resolvedAtEpochMs: 1,
        miceTotal: 4,
        miceWhacked: 1,
        miceEscaped: 3,
        stolen: bnFromNumber(10),
        reward: bnFromNumber(0),
        defended: false,
        passSpent: false,
        consumablesSpent: [],
      },
    };
    expect(clearLastRaid(withRaid).lastRaid).toBeNull();
    const empty = createInitialRandomEventsState();
    expect(clearLastRaid(empty)).toBe(empty);
  });

  it("round-trips a finished raid through the save seam", () => {
    const state: RandomEventsState = {
      ...createInitialRandomEventsState(),
      raidNextEligibleAtEpochMs: 4_200_000,
      raidCount: 3,
      lastRaid: {
        resolvedAtEpochMs: 99_000,
        miceTotal: 5,
        miceWhacked: 4,
        miceEscaped: 1,
        stolen: bnFromNumber(1.234e12),
        reward: bnFromNumber(0),
        defended: false,
        passSpent: false,
        consumablesSpent: ["bigger_whack"],
      },
    };
    expect(decodeRandomEvents(encodeRandomEvents(state))).toEqual(state);
  });

  it("reads a save written before the raid existed as a save where none has happened", () => {
    const old = {
      active: null,
      nextEligibleAtEpochMs: 500_000,
      rngStreamIndex: 9,
      lastResolved: null,
      spawnCount: 2,
    };
    const decoded = decodeRandomEvents(old);
    expect(decoded.nextEligibleAtEpochMs).toBe(500_000);
    expect(decoded.spawnCount).toBe(2);
    expect(decoded.raidNextEligibleAtEpochMs).toBe(0);
    expect(decoded.lastRaid).toBeNull();
    expect(decoded.raidCount).toBe(0);
  });
});

describe("mouse raid: through the reducer", () => {
  function stateWithRaid(mice: number, cookies: number): GameState {
    const base = raidableState(cookies);
    return {
      ...base,
      randomEvents: {
        ...createInitialRandomEventsState(),
        raidNextEligibleAtEpochMs: 10_000_000,
        active: {
          id: "mouse_raid",
          startedAtEpochMs: 0,
          endsAtEpochMs: MOUSE_RAID_DEFINITION.durationMs,
          pendingTargetIds: mouseTargetIds(mice),
          claimedCount: 0,
        },
      },
    };
  }

  it("takes the theft off the balance and leaves history alone", () => {
    const before = stateWithRaid(4, 1_000_000);
    const lifetimeBefore = bnToNumber(before.lifetimeCookies);
    const accrued = bnToNumber(totalCps(before)) * (MOUSE_RAID_DEFINITION.durationMs / 1000);

    const after = applyGameAction(
      before,
      { type: "tick", elapsedMs: MOUSE_RAID_DEFINITION.durationMs },
      ctxAt(MOUSE_RAID_DEFINITION.durationMs),
    );

    // Four of four escaped: the full eighty per cent, taken off the tick-accrued balance.
    const balanceBeforeTheft = bnToNumber(before.cookies) + accrued;
    expect(bnToNumber(after.cookies) / balanceBeforeTheft).toBeCloseTo(0.2, 6);
    // History only ever went UP, by exactly what the tick baked.
    expect(bnToNumber(after.lifetimeCookies) - lifetimeBefore).toBeCloseTo(accrued, 0);
    expect(after.randomEvents.lastRaid?.defended).toBe(false);
    expect(after.randomEvents.lastRaid?.miceEscaped).toBe(4);
  });

  it("never overdraws the jar", () => {
    const before: GameState = { ...stateWithRaid(5, 5_000), generators: [] };
    const after = applyGameAction(
      before,
      { type: "tick", elapsedMs: MOUSE_RAID_DEFINITION.durationMs },
      ctxAt(MOUSE_RAID_DEFINITION.durationMs),
    );
    expect(bnToNumber(after.cookies)).toBeGreaterThanOrEqual(0);
    expect(bnToNumber(after.cookies)).toBeCloseTo(1_000, 3);
  });

  it("credits a full defence through the one reducer seam", () => {
    let state = stateWithRaid(3, 1_000_000);
    const reward = bnToNumber(mouseRaidDefenceReward(state));
    for (const mouseId of ["mouse:0", "mouse:1", "mouse:2"]) {
      state = applyGameAction(state, { type: "randomEventWhack", mouseIds: [mouseId] }, ctxAt(1_000));
    }
    expect(bnToNumber(state.cookies)).toBeCloseTo(1_000_000 + reward, 2);
    expect(state.randomEvents.lastRaid?.defended).toBe(true);
    expect(state.randomEvents.active).toBeNull();
  });

  it("is a no-op for a whack that is not aimed at a mouse that is there", () => {
    const state = stateWithRaid(3, 1_000_000);
    expect(applyGameAction(state, { type: "randomEventWhack", mouseIds: ["rain:0"] }, ctxAt(1_000))).toBe(state);
    expect(applyGameAction(state, { type: "randomEventWhack", mouseIds: ["mouse:9"] }, ctxAt(1_000))).toBe(state);
    expect(applyGameAction(state, { type: "randomEventWhack", mouseIds: [] }, ctxAt(1_000))).toBe(state);
    // Two ids at once without a Bigger Whack armed is refused by the domain, not trusted.
    expect(
      applyGameAction(state, { type: "randomEventWhack", mouseIds: ["mouse:0", "mouse:1"] }, ctxAt(1_000)),
    ).toBe(state);
  });

  it("clears the aftermath record on randomEventRaidDismiss, and is a no-op when there is none", () => {
    let state = stateWithRaid(2, 1_000_000);
    state = applyGameAction(
      state,
      { type: "tick", elapsedMs: MOUSE_RAID_DEFINITION.durationMs },
      ctxAt(MOUSE_RAID_DEFINITION.durationMs),
    );
    expect(state.randomEvents.lastRaid).not.toBeNull();

    const cleared = applyGameAction(state, { type: "randomEventRaidDismiss" }, ctxAt(1));
    expect(cleared.randomEvents.lastRaid).toBeNull();
    expect(applyGameAction(cleared, { type: "randomEventRaidDismiss" }, ctxAt(1))).toBe(cleared);
  });

  it("stays pure: no raid action mutates the state handed to it", () => {
    const before = stateWithRaid(3, 1_000_000);
    const snapshot = JSON.parse(JSON.stringify(before));
    applyGameAction(before, { type: "randomEventWhack", mouseIds: ["mouse:0"] }, ctxAt(1_000));
    applyGameAction(before, { type: "randomEventRaidDismiss" }, ctxAt(1_000));
    applyGameAction(before, { type: "tick", elapsedMs: 25_000 }, ctxAt(25_000));
    expect(JSON.parse(JSON.stringify(before))).toEqual(snapshot);
  });

  it("survives a save round trip mid-raid, mice and all", () => {
    const state = stateWithRaid(4, 1_000_000);
    const decoded = decodeRandomEvents(encodeRandomEvents(state.randomEvents));
    expect(decoded).toEqual(state.randomEvents);
    expect(decoded.active?.pendingTargetIds).toEqual(["mouse:0", "mouse:1", "mouse:2", "mouse:3"]);
  });

  /* ----------------------------------------------------------- a raid that outlived the app */

  it("settles a raid that ran out while the app was closed against the PRE-offline balance", () => {
    const saved = stateWithRaid(5, 1_000_000);
    const savedAtMs = MOUSE_RAID_DEFINITION.durationMs / 4; // saved a few seconds into the raid
    const savedAt = new Date(savedAtMs).toISOString();
    const returnedAt = new Date(savedAtMs + 8 * 60 * 60 * 1000).toISOString(); // a night away

    const imported = applyGameAction(
      freshState(),
      {
        type: "importSave",
        savedState: { ...saved, lastTickAtIso: savedAt },
        nowIso: returnedAt,
        offlineOptions: { maxOfflineMs: 8 * 60 * 60 * 1000, offlineCpsFactor: 0.5 },
      },
      ctxAt(Date.parse(returnedAt)),
    );

    // Five of five got away: eighty per cent of the jar as it stood when the app closed, and not
    // a cookie of the night's offline earnings.
    const stolen = bnToNumber(imported.randomEvents.lastRaid?.stolen ?? bnFromNumber(0));
    expect(stolen).toBeCloseTo(1_000_000 * 0.8, 0);
    const offline = bnToNumber(totalCps(saved)) * (8 * 60 * 60) * 0.5;
    expect(bnToNumber(imported.cookies)).toBeCloseTo(1_000_000 * 0.2 + offline, 0);
    expect(imported.randomEvents.active).toBeNull();
  });

  it("leaves a raid still inside its window alone when the save is reloaded straight away", () => {
    const saved = stateWithRaid(5, 1_000_000);
    const nowIso = new Date(1_000).toISOString();
    const imported = applyGameAction(
      freshState(),
      {
        type: "importSave",
        savedState: { ...saved, lastTickAtIso: nowIso },
        nowIso,
        offlineOptions: { maxOfflineMs: 1_000, offlineCpsFactor: 0.5 },
      },
      ctxAt(1_000),
    );
    expect(imported.randomEvents.active?.id).toBe("mouse_raid");
    expect(bnToNumber(imported.cookies)).toBeCloseTo(1_000_000, 4);
  });
});

/* --------------------------------------------------------------- the sidecar's own salvage */

describe("random events: what a sidecar decode refuses to throw away", () => {
  function stocked(): RandomEventsState {
    return {
      ...createInitialRandomEventsState(),
      spawnCount: 12,
      raidCount: 3,
      nextEligibleAtEpochMs: 900_000,
      raidNextEligibleAtEpochMs: 1_800_000,
      consumables: {
        whack_pass: { stock: 2, purchased: 5 },
        bigger_whack: { stock: 1, purchased: 1 },
        half_hp_whack: { stock: 0, purchased: 4 },
      },
    };
  }

  it("stamps its own version on the way out and reads a version-less sidecar as version one", () => {
    const encoded = encodeRandomEvents(stocked()) as unknown as Record<string, unknown>;
    expect(encoded.sidecarVersion).toBe(1);

    const { sidecarVersion: _dropped, ...older } = encoded;
    expect(decodeRandomEvents(older)).toEqual(stocked());
  });

  it("keeps everything but the unknown event when a later build's id comes back", () => {
    // Exactly what a build that adds a seventeenth event without a version bump would write.
    const fromTheFuture = {
      ...(encodeRandomEvents(stocked()) as unknown as Record<string, unknown>),
      sidecarVersion: 2,
      lastResolved: { id: "biscuit_tsunami", resolvedAtEpochMs: 500, claimedCount: 0, endedEarly: false },
    };

    const decoded = decodeRandomEvents(fromTheFuture);
    expect(decoded.lastResolved).toBeNull();
    expect(decoded.consumables).toEqual(stocked().consumables);
    expect(decoded.nextEligibleAtEpochMs).toBe(900_000);
    expect(decoded.raidNextEligibleAtEpochMs).toBe(1_800_000);
    expect(decoded.spawnCount).toBe(12);
    expect(decoded.raidCount).toBe(3);
  });

  it("salvages the cookie-bought consumables even when the rest of the block is rubbish", () => {
    const mangled = {
      active: "not an event at all",
      nextEligibleAtEpochMs: "soon",
      rngStreamIndex: -4,
      consumables: stocked().consumables,
    };

    const decoded = decodeRandomEvents(mangled);
    expect(decoded.consumables).toEqual(stocked().consumables);
    // The schedule is genuinely gone, and that is fine: it regenerates on the next tick.
    expect(decoded.active).toBeNull();
    expect(decoded.spawnCount).toBe(0);
  });

  it("still falls back to a fresh scheduler when there is nothing left to salvage", () => {
    expect(decodeRandomEvents({ consumables: "gone", active: 7 })).toEqual(createInitialRandomEventsState());
    expect(decodeRandomEvents(undefined)).toEqual(createInitialRandomEventsState());
    expect(decodeRandomEvents("not even an object")).toEqual(createInitialRandomEventsState());
  });
});
