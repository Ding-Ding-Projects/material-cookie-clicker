import { createSplitMix32Rng } from "../../shared/game/golden-cookie.js";
import type { RngPort } from "../../shared/game/types.js";

/**
 * A fixed seed for the session's golden-cookie PRNG. The seed itself does not need to be
 * secret or unique per player — golden_cookie.ts's `RngPort` contract only requires that,
 * given the SAME seed and the persisted `rngStreamIndex`, replay is deterministic across
 * save/load. Picking one constant seed and always resuming from the saved stream index (see
 * `createSessionRng` below) satisfies that contract exactly.
 */
const SESSION_RNG_SEED = 0x6d43434b; // 'mCCK' in hex, arbitrary but stable.

/** Builds one long-lived RngPort for a play session, resuming from a save's stream index. */
export function createSessionRng(resumeFromStreamIndex: number): RngPort {
  return createSplitMix32Rng(SESSION_RNG_SEED, resumeFromStreamIndex);
}
