import { describe, expect, it } from "vitest";

import { bnFromNumber, bnToNumber } from "../../src/shared/game/big-number";
import { decodeSave, encodeSave } from "../../src/shared/game/save-codec";
import {
  catchGoldenCookie,
  collectGoldenCookie,
  createSplitMix32Rng,
  despawnIfExpired,
  fleeGoldenCookie,
  goldenWindowRemainingMs,
  maybeSpawnGoldenCookie,
  pickGoldenPuzzleTile,
  resolveGoldenCookieConfig,
  DEFAULT_GOLDEN_COOKIE_CONFIG,
  FAST_GOLDEN_COOKIE_CONFIG,
  FAST_GOLDEN_COOKIE_FLAG,
  GOLDEN_PUZZLE_ROUNDS,
  GOLDEN_PUZZLE_TILE_COUNT,
  GOLDEN_PUZZLE_WRONG_PICK_PENALTY_MS,
  GOLDEN_SPAWN_BOUNDS,
} from "../../src/shared/game/golden-cookie";
import { applyGameAction, type ReducerCtx } from "../../src/shared/game/reducer";
import type { GameState, GoldenCookieState } from "../../src/shared/game/types";
import { freshState } from "./test-helpers";

/**
 * CATCH, THEN PUZZLE — the golden cookie's redemption, end to end.
 *
 * The whole mechanic is pure and seeded, which is the point of testing it here rather than
 * through the renderer: the spawn POSITION and the odd TILE both come from the injected
 * `RngPort`, never from `Math.random()`, so every assertion below is about an exact value that
 * replays identically on any machine.
 */

function ctx(epochMs: number, seed = 7): ReducerCtx {
  return { now: () => epochMs, rng: createSplitMix32Rng(seed) };
}

/** A golden cookie already on the stage, at a known moment. */
function spawned(nowMs = 0, seed = 7): GoldenCookieState {
  const idle: GoldenCookieState = { isSpawned: false, rngStreamIndex: 0, nextEligibleAtEpochMs: 0 };
  return maybeSpawnGoldenCookie(idle, nowMs, createSplitMix32Rng(seed));
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

  it("spawns with no puzzle open — the cookie has to be caught first", () => {
    expect(spawned().puzzle).toBeUndefined();
  });
});

describe("golden cookie: catching it opens the puzzle", () => {
  it("opens a first round whose odd tile is a real tile index, from the rng", () => {
    const caught = catchGoldenCookie(spawned(), createSplitMix32Rng(11));
    expect(caught.puzzle).toBeDefined();
    expect(caught.puzzle?.roundsSolved).toBe(0);
    expect(caught.puzzle?.wrongPicks).toBe(0);
    expect(caught.puzzle?.oddIndex).toBeGreaterThanOrEqual(0);
    expect(caught.puzzle?.oddIndex).toBeLessThan(GOLDEN_PUZZLE_TILE_COUNT);
  });

  it("refuses to catch nothing, and refuses to re-open a puzzle already open", () => {
    const idle: GoldenCookieState = { isSpawned: false, rngStreamIndex: 0, nextEligibleAtEpochMs: 0 };
    expect(catchGoldenCookie(idle, createSplitMix32Rng(1))).toBe(idle);
    const caught = catchGoldenCookie(spawned(), createSplitMix32Rng(11));
    expect(catchGoldenCookie(caught, createSplitMix32Rng(99))).toBe(caught);
  });
});

describe("golden cookie: the puzzle rounds", () => {
  it("takes three correct picks to redeem, and reports solved only on the third", () => {
    let state = catchGoldenCookie(spawned(), createSplitMix32Rng(11));
    const rng = createSplitMix32Rng(23);
    for (let round = 1; round <= GOLDEN_PUZZLE_ROUNDS; round += 1) {
      const result = pickGoldenPuzzleTile(state, state.puzzle!.oddIndex, rng);
      expect(result.correct).toBe(true);
      expect(result.solved).toBe(round === GOLDEN_PUZZLE_ROUNDS);
      expect(result.goldenCookie.puzzle?.roundsSolved).toBe(round);
      state = result.goldenCookie;
    }
  });

  it("rolls a FRESH odd tile for each new round, from the rng", () => {
    // A new round is a new grid, not the same one with the answer already known: the second
    // round's odd tile follows the rng it was handed, so two different streams disagree about
    // where it is while agreeing that a round was completed.
    const state = catchGoldenCookie(spawned(), createSplitMix32Rng(11));
    const seen = new Set<number>();
    for (let seed = 0; seed < 30; seed += 1) {
      const result = pickGoldenPuzzleTile(state, state.puzzle!.oddIndex, createSplitMix32Rng(seed));
      expect(result.goldenCookie.puzzle?.roundsSolved).toBe(1);
      seen.add(result.goldenCookie.puzzle!.oddIndex);
    }
    expect(seen.size).toBeGreaterThan(4);

    // And it is the RNG doing it, not a clock: the same seed gives the same next round twice.
    const a = pickGoldenPuzzleTile(state, state.puzzle!.oddIndex, createSplitMix32Rng(5));
    const b = pickGoldenPuzzleTile(state, state.puzzle!.oddIndex, createSplitMix32Rng(5));
    expect(a.goldenCookie.puzzle).toEqual(b.goldenCookie.puzzle);
  });

  it("burns two seconds of the window on a wrong pick, and keeps the round", () => {
    const caught = catchGoldenCookie(spawned(0), createSplitMix32Rng(11));
    const wrong = (caught.puzzle!.oddIndex + 1) % GOLDEN_PUZZLE_TILE_COUNT;
    const before = goldenWindowRemainingMs(caught, 0);
    const result = pickGoldenPuzzleTile(caught, wrong, createSplitMix32Rng(23));

    expect(result.correct).toBe(false);
    expect(result.solved).toBe(false);
    expect(result.goldenCookie.puzzle?.wrongPicks).toBe(1);
    // The round is NOT lost and the odd tile does NOT move — only the clock pays.
    expect(result.goldenCookie.puzzle?.roundsSolved).toBe(0);
    expect(result.goldenCookie.puzzle?.oddIndex).toBe(caught.puzzle!.oddIndex);
    expect(goldenWindowRemainingMs(result.goldenCookie, 0)).toBe(before - GOLDEN_PUZZLE_WRONG_PICK_PENALTY_MS);
  });

  it("refuses a tile index that is not a tile, and a pick with no puzzle open", () => {
    const caught = catchGoldenCookie(spawned(), createSplitMix32Rng(11));
    for (const bad of [-1, GOLDEN_PUZZLE_TILE_COUNT, 1.5]) {
      const result = pickGoldenPuzzleTile(caught, bad, createSplitMix32Rng(1));
      expect(result.goldenCookie).toBe(caught);
      expect(result.correct).toBe(false);
    }
    const loose = spawned();
    expect(pickGoldenPuzzleTile(loose, 0, createSplitMix32Rng(1)).goldenCookie).toBe(loose);
  });
});

describe("golden cookie: the ways it gets away", () => {
  it("flees on demand: despawned, no effect won, ordinary cooldown scheduled", () => {
    const caught = catchGoldenCookie(spawned(0), createSplitMix32Rng(11));
    const fled = fleeGoldenCookie(caught, 60_000, createSplitMix32Rng(5));
    expect(fled.isSpawned).toBe(false);
    expect(fled.puzzle).toBeUndefined();
    expect(fled.spawnXPct).toBeUndefined();
    expect(fled.activeEffect).toBeUndefined();
    expect(fled.nextEligibleAtEpochMs).toBeGreaterThanOrEqual(60_000 + DEFAULT_GOLDEN_COOKIE_CONFIG.minDelayMs);
    expect(fled.nextEligibleAtEpochMs).toBeLessThanOrEqual(60_000 + DEFAULT_GOLDEN_COOKIE_CONFIG.maxDelayMs);
  });

  it("flees on a timeout too, mid-puzzle, through the ordinary expiry path", () => {
    const caught = catchGoldenCookie(spawned(0), createSplitMix32Rng(11));
    const stillThere = despawnIfExpired(caught, DEFAULT_GOLDEN_COOKIE_CONFIG.windowMs - 1, createSplitMix32Rng(5));
    expect(stillThere.isSpawned).toBe(true);
    const gone = despawnIfExpired(caught, DEFAULT_GOLDEN_COOKIE_CONFIG.windowMs, createSplitMix32Rng(5));
    expect(gone.isSpawned).toBe(false);
    expect(gone.puzzle).toBeUndefined();
  });

  it("times out sooner after wrong picks, because the picks burned real seconds", () => {
    const caught = catchGoldenCookie(spawned(0), createSplitMix32Rng(11));
    const wrong = (caught.puzzle!.oddIndex + 1) % GOLDEN_PUZZLE_TILE_COUNT;
    const once = pickGoldenPuzzleTile(caught, wrong, createSplitMix32Rng(23)).goldenCookie;
    const twice = pickGoldenPuzzleTile(once, wrong, createSplitMix32Rng(23)).goldenCookie;
    const at = DEFAULT_GOLDEN_COOKIE_CONFIG.windowMs - 3000;
    expect(despawnIfExpired(caught, at, createSplitMix32Rng(5)).isSpawned).toBe(true);
    expect(despawnIfExpired(twice, at, createSplitMix32Rng(5)).isSpawned).toBe(false);
    expect(twice.puzzle?.wrongPicks).toBe(2);
  });
});

describe("golden cookie: redemption parity with the old collect", () => {
  /**
   * The point of this block: the puzzle changed HOW a golden cookie is redeemed and nothing at
   * all about WHAT it pays. Solving three rounds runs the very same `collectGoldenCookie` the
   * ten-press countdown used to run on its tenth press, so the effect roll for a given seed is
   * byte-for-byte what it always was.
   */
  it("solving three rounds pays exactly what collectGoldenCookie pays for the same rng", () => {
    const base: GameState = freshState({ cookies: bnFromNumber(0) });
    const golden = spawned(0, 3);

    const direct = collectGoldenCookie(golden, base, 1000, createSplitMix32Rng(77));

    let state: GameState = { ...base, goldenCookie: golden };
    state = applyGameAction(state, { type: "goldenCatch" }, ctx(1000, 4));
    for (let round = 0; round < GOLDEN_PUZZLE_ROUNDS; round += 1) {
      // The last pick is the one that redeems, and it must use the same rng stream the direct
      // call did — so the reducer ctx for it is seeded identically.
      const seedForRound = round === GOLDEN_PUZZLE_ROUNDS - 1 ? 77 : 4;
      const tile = state.goldenCookie.puzzle!.oddIndex;
      state = applyGameAction(state, { type: "goldenPuzzlePick", tileIndex: tile }, ctx(1000, seedForRound));
    }

    expect(state.goldenCookie.isSpawned).toBe(false);
    expect(state.goldenCookie.puzzle).toBeUndefined();
    expect(state.goldenCookie.activeEffect).toEqual(direct.goldenCookie.activeEffect);
    expect(state.goldenCookie.nextEligibleAtEpochMs).toBe(direct.goldenCookie.nextEligibleAtEpochMs);
    expect(bnToNumber(state.cookies)).toBeCloseTo(bnToNumber(direct.instantBonus), 6);
  });

  it("pays nothing at all for the catch or for the first two rounds", () => {
    const base: GameState = freshState({ cookies: bnFromNumber(0), goldenCookie: spawned(0, 3) });
    let state = applyGameAction(base, { type: "goldenCatch" }, ctx(1000));
    expect(bnToNumber(state.cookies)).toBe(0);
    for (let round = 0; round < GOLDEN_PUZZLE_ROUNDS - 1; round += 1) {
      state = applyGameAction(
        state,
        { type: "goldenPuzzlePick", tileIndex: state.goldenCookie.puzzle!.oddIndex },
        ctx(1000),
      );
      expect(bnToNumber(state.cookies)).toBe(0);
      expect(state.goldenCookie.isSpawned).toBe(true);
    }
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
      { type: "goldenPuzzlePick", tileIndex: 0 } as const,
      { type: "goldenFlee" } as const,
    ]) {
      expect(applyGameAction(base, action, ctx(1000))).toBe(base);
    }
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
  it("round-trips a caught cookie's position and open puzzle unchanged", () => {
    const caught = catchGoldenCookie(spawned(5000, 3), createSplitMix32Rng(11));
    const state: GameState = freshState({ goldenCookie: caught });
    const decoded = decodeSave(JSON.parse(JSON.stringify(encodeSave(state))));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.state.goldenCookie).toEqual(caught);
  });

  it("takes a pre-redesign save — press count and all — and simply gives it a fresh spawn", () => {
    // The old scheme's field. It is not in the schema any more; zod drops it, and what is left
    // is a spawn with no position, which the renderer treats as nothing on the stage.
    const state: GameState = freshState({
      goldenCookie: { isSpawned: true, spawnedAtEpochMs: 0, rngStreamIndex: 2, nextEligibleAtEpochMs: 0 },
    });
    const legacy = JSON.parse(JSON.stringify(encodeSave(state))) as Record<string, unknown>;
    (legacy.goldenCookie as Record<string, unknown>).redeemClicks = 7;

    const decoded = decodeSave(legacy);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.state.goldenCookie).not.toHaveProperty("redeemClicks");
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
