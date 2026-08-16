import { bnAdd, bnFromNumber, bnMulScalar, type BigNum } from "./big-number";
import { generatorCps, getGeneratorDefinition } from "./generators";
import { computeMultipliers } from "./upgrades";
import type { GameState } from "./types";

/** Total cookies-per-second for the given state, derived purely from owned generators + upgrades. */
export function totalCps(state: GameState): BigNum {
  const multipliers = computeMultipliers(state);

  const perGeneratorTotal = state.generators.reduce<BigNum>((acc, owned) => {
    const def = getGeneratorDefinition(owned.id);
    const base = generatorCps(def, owned.count);
    const genMultiplier = multipliers.generatorMultipliers[owned.id] ?? 1;
    return bnAdd(acc, bnMulScalar(base, genMultiplier));
  }, bnFromNumber(0));

  return bnMulScalar(perGeneratorTotal, multipliers.globalCpsMultiplier);
}

/**
 * Cookies gained from `elapsedMs` of production at the state's current CPS.
 * `elapsedMs` is always a wall-clock delta supplied by the caller — this module
 * never reads a clock or assumes a frame rate.
 */
export function accumulate(state: GameState, elapsedMs: number): BigNum {
  if (elapsedMs <= 0) return bnFromNumber(0);
  const cps = totalCps(state);
  return bnMulScalar(cps, elapsedMs / 1000);
}
