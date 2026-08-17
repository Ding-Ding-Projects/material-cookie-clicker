import { bnMulScalar, type BigNum } from "./big-number.js";
import { totalCps } from "./cps.js";
import { isEffectActive } from "./golden-cookie.js";
import { EVENT_CPS_STACK_CAP, randomEventCpsMultiplier, stackEventMultipliers } from "./random-events.js";
import type { GameState } from "./types.js";

/**
 * THE RATE THE GAME IS ACTUALLY PAYING RIGHT NOW.
 *
 * `cps.ts#totalCps` is the STANDING rate: generators, and the upgrades that multiply them. It is
 * the right number for anything asking "what has this player built". It is the WRONG number to
 * print on a readout labelled PER SECOND, because two timed things sit on top of it and neither
 * is in it:
 *
 *   • a golden cookie's Frenzy, which multiplies production for its duration;
 *   • the random-event pool's multiplier (random-events.ts) — Sugar Rush multiplies it up, and
 *     an Oven Hiccup is the one thing in this game that multiplies it DOWN.
 *
 * The HUD's per-second plate read `totalCps` alone, so during a Frenzy it under-reported by the
 * whole frenzy multiplier, and during an Oven Hiccup it cheerfully advertised a rate the player
 * was demonstrably not being paid. This function is the ONE place both are applied, and
 * `reducer.ts#handleTick` accrues through it, so the plate and the accrual cannot disagree —
 * they are the same arithmetic rather than two copies of it that drift.
 *
 * WHY IT IS ITS OWN MODULE rather than a second export of cps.ts: both golden-cookie.ts and
 * random-events.ts import `totalCps`, so putting this beside it would close an import cycle.
 * A leaf module that depends on all three and is depended on by none of them has no cycle to
 * close, and keeps the composed rate directly unit-testable without loading the reducer.
 *
 * `nowMs` is a parameter rather than a clock read, like every other time-sensitive function in
 * this domain: an expired effect must stop counting at exactly the moment it expires, and that
 * moment belongs to the caller.
 *
 * HOW THE TWO COMBINE IS NOT DECIDED HERE. `random-events.ts#stackEventMultipliers` owns the
 * stacking rule — the product, the ×1000 ceiling on the upside, penalties left uncapped, a
 * non-finite or negative product collapsing to zero — and this function calls it rather than
 * writing the multiplication out again. That matters because the click path in the reducer
 * calls the very same function with the click ceiling: there is one stacking rule in the game,
 * stated once and tested once, and both the production line and the readout read it.
 */
export function effectiveCps(state: GameState, nowMs: number): BigNum {
  const effect = state.goldenCookie.activeEffect;
  const goldenCps =
    effect?.kind === "frenzy" && effect.multiplier !== undefined && isEffectActive(effect, nowMs)
      ? effect.multiplier
      : 1;

  return bnMulScalar(
    totalCps(state),
    stackEventMultipliers(goldenCps, randomEventCpsMultiplier(state.randomEvents, nowMs), EVENT_CPS_STACK_CAP),
  );
}
