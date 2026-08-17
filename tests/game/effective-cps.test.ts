import { describe, expect, it } from "vitest";

import { bnToNumber } from "../../src/shared/game/big-number";
import { totalCps } from "../../src/shared/game/cps";
import { effectiveCps } from "../../src/shared/game/effective-cps";
import { applyGameAction } from "../../src/shared/game/reducer";
import { GameStore } from "../../src/renderer/game/store";
import type { GameState } from "../../src/shared/game/types";
import { fixedRng, freshState } from "./test-helpers";

/**
 * THE HUD'S PER SECOND PLATE, AND THE BUG IT HAD.
 *
 * The plate read `totalCps` — the standing rate from generators and upgrades — while the tick
 * accrued at that rate TIMES a golden cookie's Frenzy TIMES the random-event pool's multiplier.
 * So during a Frenzy the plate under-reported by the whole frenzy multiplier, and during an Oven
 * Hiccup it advertised a rate the player was demonstrably not being paid.
 *
 * The fix is one shared function (effective-cps.ts) that both the plate and the accrual call, so
 * the interesting assertion in this file is not "the number is bigger" but "the two agree".
 */

const NOW = Date.parse("2026-06-01T00:00:00.000Z");
const ctx = { now: () => NOW, rng: fixedRng() };

/** A save with real production: ten cursors, so the standing rate is a positive number. */
function producing(overrides: Partial<GameState> = {}): GameState {
  return freshState({ generators: [{ id: "cursor", count: 10 }], ...overrides });
}

function withFrenzy(state: GameState, multiplier: number, expiresAtEpochMs: number): GameState {
  return {
    ...state,
    goldenCookie: { ...state.goldenCookie, activeEffect: { kind: "frenzy", multiplier, expiresAtEpochMs } },
  };
}

describe("effectiveCps", () => {
  it("is the standing rate when nothing timed is running", () => {
    const state = producing();
    expect(bnToNumber(effectiveCps(state, NOW))).toBeCloseTo(bnToNumber(totalCps(state)), 9);
  });

  it("folds in an active golden-cookie Frenzy", () => {
    const state = withFrenzy(producing(), 7, NOW + 60_000);
    expect(bnToNumber(effectiveCps(state, NOW))).toBeCloseTo(bnToNumber(totalCps(state)) * 7, 9);
  });

  it("drops the Frenzy the moment it expires, rather than a tick later", () => {
    const state = withFrenzy(producing(), 7, NOW);
    expect(bnToNumber(effectiveCps(state, NOW))).toBeCloseTo(bnToNumber(totalCps(state)), 9);
  });

  it("stays zero for a save that has built nothing", () => {
    expect(bnToNumber(effectiveCps(withFrenzy(freshState(), 7, NOW + 60_000), NOW))).toBe(0);
  });

  it("reports exactly what the reducer's own tick accrues", () => {
    // The load-bearing property. One second of tick must deposit one second of the rate the HUD
    // is printing — during a Frenzy as much as outside one.
    for (const state of [producing(), withFrenzy(producing(), 7, NOW + 60_000)]) {
      const rate = bnToNumber(effectiveCps(state, NOW));
      const after = applyGameAction(state, { type: "tick", elapsedMs: 1_000 }, ctx);
      const gained = bnToNumber(after.cookies) - bnToNumber(state.cookies);
      expect(gained).toBeCloseTo(rate, 6);
    }
  });

  it("is what the renderer's fast snapshot actually publishes", () => {
    // The plate reads this snapshot and nothing else, so this is the assertion that ties the
    // domain fix to the thing on screen.
    const frenzied = withFrenzy(producing(), 7, Date.now() + 60_000);
    const store = new GameStore(frenzied);
    expect(bnToNumber(store.getFastSnapshot().cps)).toBeCloseTo(bnToNumber(totalCps(frenzied)) * 7, 6);
    expect(bnToNumber(store.getFastSnapshot().cps)).toBeGreaterThan(bnToNumber(totalCps(frenzied)));
  });
});
