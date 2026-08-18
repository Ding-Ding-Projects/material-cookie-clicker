import { bnAdd, bnFromNumber, bnMulScalar, type BigNum } from "./big-number.js";
import { totalCps } from "./cps.js";
import { generatorCps, getGeneratorDefinition } from "./generators.js";
import { isEffectActive } from "./golden-cookie.js";
import {
  EVENT_CPS_STACK_CAP,
  randomEventCpsMultiplier,
  randomEventGeneratorSurge,
  stackEventMultipliers,
} from "./random-events.js";
import { computeMultipliers } from "./upgrades.js";
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
/**
 * THE EXTRA PRODUCTION A GENERATOR SURGE IS WORTH, before any global multiplier.
 *
 * The Grandma Convention names `["grandma", "farm"]` as ID STRINGS on its definition and never
 * imports generators.ts. This is where those strings are cashed: for each surged id, the standing
 * output of that generator times (multiplier − 1), which is the EXTRA on top of the output
 * `totalCps` already counted. Adding the extra rather than recomputing the whole total is what
 * keeps this a small addition to one expression instead of a second copy of `totalCps` that could
 * drift from the first.
 *
 * An id nothing owns contributes zero. An id no generator has contributes zero, and does not
 * throw: `getGeneratorDefinition` is only ever called for ids that came off the player's own
 * generator list, so a surge naming a generator that was renamed or removed simply surges nothing.
 * That is the honest failure — the event still happens, still announces itself, and is worth what
 * the player actually owns.
 */
function generatorSurgeBonus(state: GameState, nowMs: number): BigNum {
  const surge = randomEventGeneratorSurge(state.randomEvents, nowMs);
  const surgedIds = Object.keys(surge);
  if (surgedIds.length === 0) return bnFromNumber(0);

  const multipliers = computeMultipliers(state);
  const extra = state.generators.reduce<BigNum>((acc, owned) => {
    const factor = surge[owned.id];
    if (factor === undefined || factor === 1) return acc;
    const def = getGeneratorDefinition(owned.id);
    const base = generatorCps(def, owned.count);
    const withUpgrades = bnMulScalar(base, multipliers.generatorMultipliers[owned.id] ?? 1);
    return bnAdd(acc, bnMulScalar(withUpgrades, factor - 1));
  }, bnFromNumber(0));

  return bnMulScalar(extra, multipliers.globalCpsMultiplier);
}

export function effectiveCps(state: GameState, nowMs: number): BigNum {
  const effect = state.goldenCookie.activeEffect;
  const goldenCps =
    effect?.kind === "frenzy" && effect.multiplier !== undefined && isEffectActive(effect, nowMs)
      ? effect.multiplier
      : 1;

  // The surge is added to the standing rate BEFORE the timed multipliers, not after, because a
  // Grandma Convention makes the grandmas produce more and a frenzy then multiplies everything
  // the bakery is producing — including that. Applying it afterwards would mean a Convention
  // inside a frenzy was worth exactly as much as one on a quiet save, which is not what either
  // event's copy says.
  const standing = bnAdd(totalCps(state), generatorSurgeBonus(state, nowMs));

  return bnMulScalar(
    standing,
    stackEventMultipliers(goldenCps, randomEventCpsMultiplier(state.randomEvents, nowMs), EVENT_CPS_STACK_CAP),
  );
}
