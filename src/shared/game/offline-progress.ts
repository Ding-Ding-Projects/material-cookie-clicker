import { bnFromNumber, bnMulScalar, type BigNum } from "./big-number";
import { totalCps } from "./cps";
import { totalOfflineBonuses } from "./tools";
import type { GameState } from "./types";

export interface OfflineProgressOptions {
  /** Hard cap on how much elapsed wall-clock time counts toward offline production, in ms. */
  readonly maxOfflineMs: number;
  /** Fraction of normal CPS earned while offline, e.g. 0.5 for 50%. */
  readonly offlineCpsFactor: number;
}

export interface OfflineProgressResult {
  readonly cookiesEarned: BigNum;
  readonly effectiveElapsedMs: number;
  readonly wasClockAnomaly: boolean;
}

/**
 * Computes cookies earned while the game was closed, from `state.lastTickAtIso` to `nowIso`.
 *
 * Clock protection (exact contract):
 *   - Negative elapsed time (clock moved backwards, or a hand-edited future
 *     `lastTickAtIso`) is treated as ZERO elapsed time and reported as a clock
 *     anomaly. We never `Math.abs` a negative delta — that would *reward*
 *     clock tampering by turning "I set my clock back" into free cookies.
 *   - This function never throws on a malformed/anomalous timestamp pair; a
 *     thrown error here would brick the save/load path. Anomalies are always
 *     reported via the result, never via an exception.
 *   - Absurdly large forward jumps are clamped to `maxOfflineMs`, not treated
 *     as anomalies (a real device can plausibly be off for a long time).
 */
export function computeOfflineProgress(
  state: GameState,
  nowIso: string,
  options: OfflineProgressOptions,
): OfflineProgressResult {
  const lastTickMs = Date.parse(state.lastTickAtIso);
  const nowMs = Date.parse(nowIso);

  if (!Number.isFinite(lastTickMs) || !Number.isFinite(nowMs)) {
    // Malformed timestamps: never throw, treat as zero elapsed and flag it.
    return { cookiesEarned: bnFromNumber(0), effectiveElapsedMs: 0, wasClockAnomaly: true };
  }

  const rawElapsedMs = nowMs - lastTickMs;

  if (rawElapsedMs < 0) {
    return { cookiesEarned: bnFromNumber(0), effectiveElapsedMs: 0, wasClockAnomaly: true };
  }

  const effectiveElapsedMs = Math.min(rawElapsedMs, options.maxOfflineMs);
  const cps = totalCps(state);
  const cookiesEarned = bnMulScalar(cps, (effectiveElapsedMs / 1000) * options.offlineCpsFactor);

  return { cookiesEarned, effectiveElapsedMs, wasClockAnomaly: false };
}

/**
 * Same contract as computeOfflineProgress, but first widens `options` with any active
 * Local History / Offline Docs / Scheduled Settings tool bonuses (offline cap extension and
 * offline CPS factor bonus respectively) before computing. Kept as a separate wrapper so
 * computeOfflineProgress itself stays a pure function of exactly its own three arguments,
 * with no implicit dependency on the Tools tech tree.
 */
export function computeOfflineProgressWithTools(
  state: GameState,
  nowIso: string,
  baseOptions: OfflineProgressOptions,
): OfflineProgressResult {
  const bonuses = totalOfflineBonuses(state);
  const effectiveOptions: OfflineProgressOptions = {
    maxOfflineMs: baseOptions.maxOfflineMs + bonuses.extensionMs,
    offlineCpsFactor: Math.min(1, baseOptions.offlineCpsFactor + bonuses.cpsFactorBonus),
  };
  return computeOfflineProgress(state, nowIso, effectiveOptions);
}
