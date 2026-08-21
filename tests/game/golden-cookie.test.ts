import { describe, expect, it } from "vitest";

import { bnFromNumber, bnToNumber } from "../../src/shared/game/big-number";
import { decodeSave, encodeSave } from "../../src/shared/game/save-codec";
import {
  catchGoldenCookie,
  collectGoldenCookie,
  createSplitMix32Rng,
  despawnIfExpired,
  fleeGoldenCookie,
  goldenDialNeedlePosition,
  goldenDialRound,
  goldenDialSweepMs,
  goldenWindowRemainingMs,
  isInsideGoldenDialZone,
  maybeSpawnGoldenCookie,
  pressGoldenDial,
  resolveGoldenCookieConfig,
  DEFAULT_GOLDEN_COOKIE_CONFIG,
  FAST_GOLDEN_COOKIE_CONFIG,
  FAST_GOLDEN_COOKIE_FLAG,
  GOLDEN_DIAL_MISS_PENALTY_MS,
  GOLDEN_DIAL_ROUND_CURVE,
  GOLDEN_DIAL_ROUNDS,
  GOLDEN_DIAL_STEPPED_SLOWDOWN,
  GOLDEN_DIAL_STEPS,
  GOLDEN_SPAWN_BOUNDS,
} from "../../src/shared/game/golden-cookie";
import { applyGameAction, type ReducerCtx } from "../../src/shared/game/reducer";
import type { GameState, GoldenCookieState, RngPort } from "../../src/shared/game/types";
import { freshState } from "./test-helpers";

/**
 * CATCH, THEN THE OVEN DIAL — the golden cookie's redemption, end to end.
 *
 * The decree these tests exist to hold the line on: "golden cookie puzzle must be a minigame, not
 * a chance game." So the assertions below are not only that the thing works — they are that the
 * OUTCOME carries no luck. The needle is an exact function of elapsed milliseconds, the
 * difficulty curve is a fixed table identical for everyone, and the one seeded value (where the
 * band sits) is checked to be visible-and-irrelevant rather than decisive.
 */

function ctx(epochMs: number, seed = 7): ReducerCtx {
  return { now: () => epochMs, rng: createSplitMix32Rng(seed) };
}

/** A golden cookie already on the stage, at a known moment. */
function spawned(nowMs = 0, seed = 7): GoldenCookieState {
  const idle: GoldenCookieState = { isSpawned: false, rngStreamIndex: 0, nextEligibleAtEpochMs: 0 };
  return maybeSpawnGoldenCookie(idle, nowMs, createSplitMix32Rng(seed));
}

/**
 * Catch a cookie and PIN it to the Oven Dial.
 *
 * A catch now rolls one of the fifty challenges (golden-challenges.ts), so a suite about dial
 * geometry that simply caught a cookie would sometimes be handed a Mouse Stampede and fail for a
 * reason that has nothing to do with what it is testing. Pinning keeps every assertion below about
 * the dial itself; that the roll is genuinely random and reaches all fifty is asserted separately
 * in tests/game/golden-challenges.test.ts, which is where that belongs.
 */
function caughtDial(state: GoldenCookieState, rng: RngPort, nowMs = 0, stepped = false): GoldenCookieState {
  const caught = catchGoldenCookie(state, rng, nowMs, stepped);
  if (!caught.dial) return caught;
  return { ...caught, dial: { ...caught.dial, challengeId: "dial.oven", progress: 0, target: [] } };
}

/** The exact elapsed time at which the needle sits on `target`, on the outward half of a sweep. */
function elapsedForPosition(target: number, roundIndex: number, stepped = false): number {
  return (target / 2) * goldenDialSweepMs(roundIndex, stepped);
}

describe("golden cookie: the random spawn position", () => {
  it("draws a position inside the stage bounds, every time, for many seeds", () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const state = spawned(1000, seed);
      expect(state.isSpawned).toBe(true);
      expect(state.spawnXPct).toBeGreaterThanOrEqual(GOLDEN_SPAWN_BOUNDS.minXPct);
      expect(state.spawnXPct).toBeLessThanOrEqual(GOLDEN_SPAWN_BOUNDS.maxXPct);
      expect(state.spawnYPct).toBeGreaterThanOrEqual(GOLDEN_SPAWN_BOUNDS.minYPct);
      expect(state.spawnYPct).toBeLessThanOrEqual(GOLDEN_SPAWN_BOUNDS.maxYPct);
    }
  });

  it("is deterministic: the same seed puts the cookie in exactly the same place", () => {
    expect(spawned(1000, 42)).toEqual(spawned(1000, 42));
  });

  it("actually moves the cookie around: different seeds land in different places", () => {
    const places = new Set(
      Array.from({ length: 40 }, (_, seed) => `${spawned(1000, seed).spawnXPct},${spawned(1000, seed).spawnYPct}`),
    );
    expect(places.size).toBeGreaterThan(30);
  });

  it("spawns with no dial open — the cookie has to be caught first", () => {
    expect(spawned().dial).toBeUndefined();
  });
});

describe("oven dial: the needle is a pure function of time, not of luck", () => {
  it("sweeps there and back: 0 at the start, 1 at the halfway point, 0 again at the end", () => {
    const sweep = goldenDialSweepMs(0, false);
    expect(goldenDialNeedlePosition(0, 0, false)).toBeCloseTo(0, 10);
    expect(goldenDialNeedlePosition(sweep / 4, 0, false)).toBeCloseTo(0.5, 10);
    expect(goldenDialNeedlePosition(sweep / 2, 0, false)).toBeCloseTo(1, 10);
    expect(goldenDialNeedlePosition((sweep * 3) / 4, 0, false)).toBeCloseTo(0.5, 10);
    expect(goldenDialNeedlePosition(sweep, 0, false)).toBeCloseTo(0, 10);
  });

  it("never leaves the track, at any elapsed time, in any round, in either mode", () => {
    for (const stepped of [false, true]) {
      for (let roundIndex = 0; roundIndex < GOLDEN_DIAL_ROUNDS; roundIndex += 1) {
        for (let ms = 0; ms < 6000; ms += 7) {
          const position = goldenDialNeedlePosition(ms, roundIndex, stepped);
          expect(position).toBeGreaterThanOrEqual(0);
          expect(position).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("is exactly repeatable: the same millisecond always gives the same position", () => {
    for (let ms = 0; ms < 3000; ms += 13) {
      expect(goldenDialNeedlePosition(ms, 1, false)).toBe(goldenDialNeedlePosition(ms, 1, false));
    }
  });

  it("is periodic, so a dial reloaded hours later is still on the track", () => {
    const sweep = goldenDialSweepMs(2, false);
    expect(goldenDialNeedlePosition(400, 2, false)).toBeCloseTo(goldenDialNeedlePosition(400 + sweep * 900, 2, false), 9);
  });

  it("treats a negative elapsed time (a clock that went backwards) as the start of the sweep", () => {
    expect(goldenDialNeedlePosition(-5000, 0, false)).toBe(0);
  });

  it("takes no rng at all — it is not in the signature and cannot be", () => {
    // A compile-time fact made a runtime one: the function's arity is (elapsed, round, stepped).
    expect(goldenDialNeedlePosition.length).toBe(3);
  });
});

describe("oven dial: the difficulty curve is fixed and the same for everyone", () => {
  it("has exactly one entry per round, narrowing and speeding up each time", () => {
    expect(GOLDEN_DIAL_ROUND_CURVE).toHaveLength(GOLDEN_DIAL_ROUNDS);
    for (let i = 1; i < GOLDEN_DIAL_ROUND_CURVE.length; i += 1) {
      expect(GOLDEN_DIAL_ROUND_CURVE[i].sweepMs).toBeLessThan(GOLDEN_DIAL_ROUND_CURVE[i - 1].sweepMs);
      expect(GOLDEN_DIAL_ROUND_CURVE[i].zoneHalfWidth).toBeLessThan(GOLDEN_DIAL_ROUND_CURVE[i - 1].zoneHalfWidth);
    }
  });

  it("is the published curve, to the number — a change here is a change to every player's game", () => {
    expect(GOLDEN_DIAL_ROUND_CURVE.map((r) => [r.sweepMs, r.zoneHalfWidth])).toEqual([
      [1800, 0.13],
      [1400, 0.095],
      [1050, 0.065],
    ]);
  });

  it("clamps an out-of-range round index rather than handing back undefined", () => {
    expect(goldenDialRound(-3)).toEqual(GOLDEN_DIAL_ROUND_CURVE[0]);
    expect(goldenDialRound(99)).toEqual(GOLDEN_DIAL_ROUND_CURVE[GOLDEN_DIAL_ROUNDS - 1]);
  });

  it("slows the sweep in stepped mode without touching the zone width", () => {
    for (let roundIndex = 0; roundIndex < GOLDEN_DIAL_ROUNDS; roundIndex += 1) {
      expect(goldenDialSweepMs(roundIndex, true)).toBe(
        Math.round(GOLDEN_DIAL_ROUND_CURVE[roundIndex].sweepMs * GOLDEN_DIAL_STEPPED_SLOWDOWN),
      );
      // Reduced motion changes the CADENCE and nothing else. The target is the same size.
      expect(goldenDialRound(roundIndex).zoneHalfWidth).toBe(GOLDEN_DIAL_ROUND_CURVE[roundIndex].zoneHalfWidth);
    }
  });
});

describe("oven dial: stepped mode lands on notches and nowhere else", () => {
  it("only ever produces positions on the step grid", () => {
    const allowed = new Set(Array.from({ length: GOLDEN_DIAL_STEPS + 1 }, (_, i) => Math.round((i / GOLDEN_DIAL_STEPS) * 2 * 1e6) / 1e6));
    for (let ms = 0; ms < 5000; ms += 3) {
      const position = goldenDialNeedlePosition(ms, 0, true);
      const rounded = Math.round(position * 1e6) / 1e6;
      expect([...allowed].some((value) => Math.abs(value - rounded) < 1e-6)).toBe(true);
    }
  });

  it("holds each notch for a real, countable stretch of time rather than flickering", () => {
    const sweep = goldenDialSweepMs(0, true);
    const holdMs = sweep / GOLDEN_DIAL_STEPS;
    expect(holdMs).toBeGreaterThan(90);
    const first = goldenDialNeedlePosition(0, 0, true);
    expect(goldenDialNeedlePosition(Math.floor(holdMs) - 1, 0, true)).toBe(first);
    expect(goldenDialNeedlePosition(Math.ceil(holdMs) + 1, 0, true)).not.toBe(first);
  });
});

describe("oven dial: catching the cookie opens it", () => {
  it("opens round one with a band that sits wholly on the track", () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const caught = caughtDial(spawned(), createSplitMix32Rng(seed), 5000);
      const { zoneHalfWidth } = goldenDialRound(0);
      expect(caught.dial?.roundsWon).toBe(0);
      expect(caught.dial?.misses).toBe(0);
      expect(caught.dial?.roundStartedAtEpochMs).toBe(5000);
      expect(caught.dial!.zoneCentre - zoneHalfWidth).toBeGreaterThanOrEqual(0);
      expect(caught.dial!.zoneCentre + zoneHalfWidth).toBeLessThanOrEqual(1);
    }
  });

  it("freezes the reduced-motion choice onto the state at the catch", () => {
    expect(caughtDial(spawned(), createSplitMix32Rng(1), 0, true).dial?.stepped).toBe(true);
    expect(caughtDial(spawned(), createSplitMix32Rng(1), 0, false).dial?.stepped).toBe(false);
  });

  it("refuses to catch nothing, and refuses to re-open a dial already open", () => {
    const idle: GoldenCookieState = { isSpawned: false, rngStreamIndex: 0, nextEligibleAtEpochMs: 0 };
    expect(catchGoldenCookie(idle, createSplitMix32Rng(1), 0)).toBe(idle);
    const caught = caughtDial(spawned(), createSplitMix32Rng(11), 0);
    expect(catchGoldenCookie(caught, createSplitMix32Rng(99), 500)).toBe(caught);
  });
});

describe("oven dial: pressing it is skill and only skill", () => {
  it("counts a press with the needle in the band as a hit, at the exact moment it is in the band", () => {
    const caught = caughtDial(spawned(0), createSplitMix32Rng(11), 0);
    const at = elapsedForPosition(caught.dial!.zoneCentre, 0);
    const result = pressGoldenDial(caught, at, createSplitMix32Rng(3));
    expect(result.hit).toBe(true);
    expect(result.needlePosition).toBeCloseTo(caught.dial!.zoneCentre, 6);
    expect(result.goldenCookie.dial?.roundsWon).toBe(1);
  });

  it("counts a press just outside the band as a miss, and just inside as a hit", () => {
    const caught = caughtDial(spawned(0), createSplitMix32Rng(11), 0);
    const { zoneCentre } = caught.dial!;
    const { zoneHalfWidth } = goldenDialRound(0);
    const justInside = elapsedForPosition(zoneCentre + zoneHalfWidth * 0.95, 0);
    const justOutside = elapsedForPosition(Math.min(1, zoneCentre + zoneHalfWidth * 1.4), 0);
    expect(pressGoldenDial(caught, justInside, createSplitMix32Rng(3)).hit).toBe(true);
    expect(pressGoldenDial(caught, justOutside, createSplitMix32Rng(3)).hit).toBe(false);
  });

  it("gives the same verdict for the same press however many times it is replayed, on any seed", () => {
    const caught = caughtDial(spawned(0), createSplitMix32Rng(11), 0);
    const at = elapsedForPosition(caught.dial!.zoneCentre, 0);
    const verdicts = new Set(
      Array.from({ length: 50 }, (_, seed) => pressGoldenDial(caught, at, createSplitMix32Rng(seed)).hit),
    );
    // ONE distinct verdict across fifty different PRNG streams: the rng cannot reach the outcome.
    expect(verdicts.size).toBe(1);
    expect([...verdicts][0]).toBe(true);
  });

  it("takes three hits to redeem, and reports won only on the third", () => {
    let state = caughtDial(spawned(0), createSplitMix32Rng(11), 0);
    let now = 0;
    for (let round = 1; round <= GOLDEN_DIAL_ROUNDS; round += 1) {
      const dial = state.dial!;
      now = dial.roundStartedAtEpochMs + elapsedForPosition(dial.zoneCentre, dial.roundsWon);
      const result = pressGoldenDial(state, now, createSplitMix32Rng(23));
      expect(result.hit).toBe(true);
      expect(result.won).toBe(round === GOLDEN_DIAL_ROUNDS);
      expect(result.goldenCookie.dial?.roundsWon).toBe(round);
      state = result.goldenCookie;
    }
  });

  it("restarts the sweep and moves the band on a won round, so round two is a new problem", () => {
    const caught = caughtDial(spawned(0), createSplitMix32Rng(11), 0);
    const at = elapsedForPosition(caught.dial!.zoneCentre, 0);
    const next = pressGoldenDial(caught, at, createSplitMix32Rng(23)).goldenCookie;
    expect(next.dial?.roundStartedAtEpochMs).toBe(at);
    const { zoneHalfWidth } = goldenDialRound(1);
    expect(next.dial!.zoneCentre - zoneHalfWidth).toBeGreaterThanOrEqual(0);
    expect(next.dial!.zoneCentre + zoneHalfWidth).toBeLessThanOrEqual(1);
  });

  it("burns two seconds on a miss, keeps the round, and does NOT move the band or restart the sweep", () => {
    const caught = caughtDial(spawned(0), createSplitMix32Rng(11), 0);
    const { zoneCentre } = caught.dial!;
    const missAt = elapsedForPosition(Math.max(0, zoneCentre - goldenDialRound(0).zoneHalfWidth * 3), 0);
    const before = goldenWindowRemainingMs(caught, 0);
    const result = pressGoldenDial(caught, missAt, createSplitMix32Rng(23));

    expect(result.hit).toBe(false);
    expect(result.won).toBe(false);
    expect(result.goldenCookie.dial?.misses).toBe(1);
    expect(result.goldenCookie.dial?.roundsWon).toBe(0);
    // A miss must not hand the player a fresh, predictable phase or an easier band.
    expect(result.goldenCookie.dial?.zoneCentre).toBe(zoneCentre);
    expect(result.goldenCookie.dial?.roundStartedAtEpochMs).toBe(caught.dial!.roundStartedAtEpochMs);
    expect(goldenWindowRemainingMs(result.goldenCookie, 0)).toBe(before - GOLDEN_DIAL_MISS_PENALTY_MS);
  });

  it("refuses a press with no dial open", () => {
    const loose = spawned();
    const result = pressGoldenDial(loose, 500, createSplitMix32Rng(1));
    expect(result.goldenCookie).toBe(loose);
    expect(result.hit).toBe(false);
  });

  it("judges a stepped dial on the notch the needle is actually sitting on", () => {
    const caught = caughtDial(spawned(0), createSplitMix32Rng(11), 0, true);
    const at = 700;
    const shown = goldenDialNeedlePosition(at, 0, true);
    const result = pressGoldenDial(caught, at, createSplitMix32Rng(3));
    // What was drawn is exactly what was judged — the whole reason `stepped` lives in the domain.
    expect(result.needlePosition).toBe(shown);
    expect(result.hit).toBe(isInsideGoldenDialZone(shown, caught.dial!.zoneCentre, 0));
  });
});

describe("golden cookie: the ways it gets away", () => {
  it("flees on demand: despawned, no effect won, ordinary cooldown scheduled", () => {
    const caught = caughtDial(spawned(0), createSplitMix32Rng(11), 0);
    const fled = fleeGoldenCookie(caught, 60_000, createSplitMix32Rng(5));
    expect(fled.isSpawned).toBe(false);
    expect(fled.dial).toBeUndefined();
    expect(fled.spawnXPct).toBeUndefined();
    expect(fled.activeEffect).toBeUndefined();
    expect(fled.nextEligibleAtEpochMs).toBeGreaterThanOrEqual(60_000 + DEFAULT_GOLDEN_COOKIE_CONFIG.minDelayMs);
    expect(fled.nextEligibleAtEpochMs).toBeLessThanOrEqual(60_000 + DEFAULT_GOLDEN_COOKIE_CONFIG.maxDelayMs);
  });

  it("flees on a timeout too, mid-dial, through the ordinary expiry path", () => {
    const caught = caughtDial(spawned(0), createSplitMix32Rng(11), 0);
    const stillThere = despawnIfExpired(caught, DEFAULT_GOLDEN_COOKIE_CONFIG.windowMs - 1, createSplitMix32Rng(5));
    expect(stillThere.isSpawned).toBe(true);
    const gone = despawnIfExpired(caught, DEFAULT_GOLDEN_COOKIE_CONFIG.windowMs, createSplitMix32Rng(5));
    expect(gone.isSpawned).toBe(false);
    expect(gone.dial).toBeUndefined();
  });

  it("times out sooner after misses, because the misses burned real seconds", () => {
    const caught = caughtDial(spawned(0), createSplitMix32Rng(11), 0);
    const missAt = elapsedForPosition(
      Math.max(0, caught.dial!.zoneCentre - goldenDialRound(0).zoneHalfWidth * 3),
      0,
    );
    const once = pressGoldenDial(caught, missAt, createSplitMix32Rng(23)).goldenCookie;
    const twice = pressGoldenDial(once, missAt, createSplitMix32Rng(23)).goldenCookie;
    const at = DEFAULT_GOLDEN_COOKIE_CONFIG.windowMs - 3000;
    expect(despawnIfExpired(caught, at, createSplitMix32Rng(5)).isSpawned).toBe(true);
    expect(despawnIfExpired(twice, at, createSplitMix32Rng(5)).isSpawned).toBe(false);
    expect(twice.dial?.misses).toBe(2);
  });
});

describe("golden cookie: redemption parity with the old collect", () => {
  /**
   * The point of this block, unchanged across three redemption mechanics: the minigame decides
   * HOW a golden cookie is redeemed and nothing at all about WHAT it pays. Winning three rounds
   * runs the very same `collectGoldenCookie` the ten-press countdown once ran on its tenth press
   * and the tile grid ran on its third correct pick, so the effect roll for a given seed is
   * byte-for-byte what it always was.
   */
  it("winning three rounds pays exactly what collectGoldenCookie pays for the same rng", () => {
    const base: GameState = freshState({ cookies: bnFromNumber(0) });
    const golden = spawned(0, 3);

    const direct = collectGoldenCookie(golden, base, 1000, createSplitMix32Rng(77));

    let state: GameState = { ...base, goldenCookie: golden };
    state = applyGameAction(state, { type: "goldenCatch" }, ctx(1000, 4));
    // Pin the rolled challenge to the Oven Dial, for the same reason caughtDial above does: this
    // test is about redemption parity across three DIAL rounds, and a catch now rolls one of
    // fifty. Without this it occasionally opens a two-round pick and the parity it asserts is not
    // the parity it means.
    state = {
      ...state,
      goldenCookie: {
        ...state.goldenCookie,
        dial: { ...state.goldenCookie.dial!, challengeId: "dial.oven", progress: 0, target: [] },
      },
    };
    for (let round = 0; round < GOLDEN_DIAL_ROUNDS; round += 1) {
      // Every press is made at the moment the needle is dead centre of the band, and the clock is
      // held at 1000 so the last press — the one that redeems — reaches the same collect the
      // direct call made, on an identically seeded stream.
      const seedForRound = round === GOLDEN_DIAL_ROUNDS - 1 ? 77 : 4;
      const dial = state.goldenCookie.dial!;
      const pressAt = dial.roundStartedAtEpochMs + elapsedForPosition(dial.zoneCentre, dial.roundsWon);
      state = applyGameAction(state, { type: "goldenDialPress" }, { now: () => pressAt, rng: createSplitMix32Rng(seedForRound) });
      if (round < GOLDEN_DIAL_ROUNDS - 1) expect(state.goldenCookie.dial?.roundsWon).toBe(round + 1);
    }

    expect(state.goldenCookie.isSpawned).toBe(false);
    expect(state.goldenCookie.dial).toBeUndefined();
    expect(state.goldenCookie.activeEffect).toEqual(direct.goldenCookie.activeEffect);
    expect(bnToNumber(state.cookies)).toBeCloseTo(bnToNumber(direct.instantBonus), 6);
  });

  it("pays nothing at all for the catch or for the first two rounds", () => {
    const base: GameState = freshState({ cookies: bnFromNumber(0), goldenCookie: spawned(0, 3) });
    let state = applyGameAction(base, { type: "goldenCatch" }, ctx(0));
    expect(bnToNumber(state.cookies)).toBe(0);
    for (let round = 0; round < GOLDEN_DIAL_ROUNDS - 1; round += 1) {
      const dial = state.goldenCookie.dial!;
      const pressAt = dial.roundStartedAtEpochMs + elapsedForPosition(dial.zoneCentre, dial.roundsWon);
      state = applyGameAction(state, { type: "goldenDialPress" }, ctx(pressAt));
      expect(bnToNumber(state.cookies)).toBe(0);
      expect(state.goldenCookie.isSpawned).toBe(true);
    }
  });

  it("a missed press through the reducer pays nothing and leaves the cookie on the stage", () => {
    const base: GameState = freshState({ cookies: bnFromNumber(0), goldenCookie: spawned(0, 3) });
    const caught = applyGameAction(base, { type: "goldenCatch" }, ctx(0));
    const dial = caught.goldenCookie.dial!;
    const missAt = elapsedForPosition(Math.max(0, dial.zoneCentre - goldenDialRound(0).zoneHalfWidth * 3), 0);
    const missed = applyGameAction(caught, { type: "goldenDialPress" }, ctx(missAt));
    expect(bnToNumber(missed.cookies)).toBe(0);
    expect(missed.goldenCookie.isSpawned).toBe(true);
    expect(missed.goldenCookie.dial?.misses).toBe(1);
  });

  it("goldenFlee through the reducer takes the cookie off the stage and pays nothing", () => {
    const base: GameState = freshState({ cookies: bnFromNumber(0), goldenCookie: spawned(0, 3) });
    const caught = applyGameAction(base, { type: "goldenCatch" }, ctx(1000));
    const fled = applyGameAction(caught, { type: "goldenFlee" }, ctx(2000));
    expect(fled.goldenCookie.isSpawned).toBe(false);
    expect(fled.goldenCookie.activeEffect).toBeUndefined();
    expect(bnToNumber(fled.cookies)).toBe(0);
  });

  it("refuses every golden action when no cookie is on the stage", () => {
    const base: GameState = freshState({});
    for (const action of [
      { type: "goldenCatch" } as const,
      { type: "goldenDialPress" } as const,
      { type: "goldenFlee" } as const,
    ]) {
      expect(applyGameAction(base, action, ctx(1000))).toBe(base);
    }
  });

  it("cannot be won by a dispatch that simply presses over and over at one instant", () => {
    // The clock is frozen, so every press lands on the same needle position. If that position is
    // outside the band the cookie is never redeemed no matter how many presses arrive — which is
    // the plainest statement that this is timing and not attrition.
    const base: GameState = freshState({ cookies: bnFromNumber(0), goldenCookie: spawned(0, 3) });
    let state = applyGameAction(base, { type: "goldenCatch" }, ctx(0));
    const dial = state.goldenCookie.dial!;
    const frozenAt = elapsedForPosition(Math.max(0, dial.zoneCentre - goldenDialRound(0).zoneHalfWidth * 3), 0);
    for (let i = 0; i < 40; i += 1) {
      state = applyGameAction(state, { type: "goldenDialPress" }, ctx(frozenAt));
    }
    expect(state.goldenCookie.dial?.roundsWon).toBe(0);
    expect(state.goldenCookie.dial?.misses).toBe(40);
    expect(bnToNumber(state.cookies)).toBe(0);
  });
});

describe("golden cookie: the developer-only fast schedule", () => {
  it("resolves only for the exact opt-in strings", () => {
    expect(resolveGoldenCookieConfig("1")).toBe(FAST_GOLDEN_COOKIE_CONFIG);
    expect(resolveGoldenCookieConfig("true")).toBe(FAST_GOLDEN_COOKIE_CONFIG);
    for (const value of [null, undefined, "", "0", "yes", "fast", FAST_GOLDEN_COOKIE_FLAG]) {
      expect(resolveGoldenCookieConfig(value)).toBe(DEFAULT_GOLDEN_COOKIE_CONFIG);
    }
  });
});

describe("golden cookie: the save", () => {
  it("round-trips a caught cookie's position and open dial unchanged", () => {
    const caught = caughtDial(spawned(5000, 3), createSplitMix32Rng(11), 5000, true);
    const state: GameState = freshState({ goldenCookie: caught });
    const decoded = decodeSave(JSON.parse(JSON.stringify(encodeSave(state))));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.state.goldenCookie).toEqual(caught);
  });

  it("drops an open minigame from ANY earlier version and simply gives it a fresh spawn", () => {
    // The two schemes this slot has already had: a ten-press countdown, and the Odd Cookie Out
    // tile grid. Neither field exists in the schema now; zod drops both, and what is left is a
    // spawn with no position, which the renderer treats as nothing on the stage.
    const state: GameState = freshState({
      goldenCookie: { isSpawned: true, spawnedAtEpochMs: 0, rngStreamIndex: 2, nextEligibleAtEpochMs: 0 },
    });
    const legacy = JSON.parse(JSON.stringify(encodeSave(state))) as Record<string, unknown>;
    const golden = legacy.goldenCookie as Record<string, unknown>;
    golden.redeemClicks = 7;
    golden.puzzle = { roundsSolved: 2, oddIndex: 9, variant: 1, wrongPicks: 1 };

    const decoded = decodeSave(legacy);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.state.goldenCookie).not.toHaveProperty("redeemClicks");
    expect(decoded.state.goldenCookie).not.toHaveProperty("puzzle");
    expect(decoded.state.goldenCookie.dial).toBeUndefined();
    expect(decoded.state.goldenCookie.spawnXPct).toBeUndefined();

    // And the next tick that finds it eligible hands out a real, positioned cookie.
    const respawned = maybeSpawnGoldenCookie(
      { ...decoded.state.goldenCookie, isSpawned: false },
      10_000,
      createSplitMix32Rng(3),
    );
    expect(respawned.spawnXPct).toBeDefined();
  });
});
