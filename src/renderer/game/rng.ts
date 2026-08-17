import { createSplitMix32Rng } from "../../shared/game/golden-cookie.js";
import type { RngPort } from "../../shared/game/types.js";

/**
 * SESSION RANDOMNESS, AND WHY IT IS NOT A CONSTANT ANY MORE.
 *
 * This file used to hold one hard-coded seed. That was defensible while the only things the
 * stream fed were windfalls: the golden cookie's contract needs determinism GIVEN a seed, not a
 * seed nobody can guess, and a fixed seed plus a persisted stream index replayed a save exactly.
 *
 * The Mouse Raid changed the stakes. A raid TAKES up to eighty per cent of the balance, and a
 * constant seed means every installation of the game shares one timeline: the same seed and the
 * same stream index produce the same mouse counts and the same gaps, so a schedule worked out
 * once — by anyone, on any machine — would be a schedule for everybody. "The mice must not be
 * predictable" is not satisfiable with a constant.
 *
 * So production seeds from real entropy, once per session, and the seam tests use stays exactly
 * where it was: `createSessionRng` still takes an explicit seed, so a test injects one and
 * replays a timeline precisely, while the app calls it without one and gets `createEntropySeed`.
 *
 * WHAT THIS DOES NOT OPEN UP. The next raid's INSTANT is persisted in the save as a wall-clock
 * timestamp (random-events.ts, `raidNextEligibleAtEpochMs`), and reloading does not move it. A
 * player who reloads gets a different stream for everything drawn AFTER that point — the mouse
 * count, the following gap — but the raid that was already due is still due at the same moment.
 * Reloading therefore cannot dodge a raid; it can only change dice that had not been thrown.
 */
export function createEntropySeed(): number {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
    return cryptoApi.getRandomValues(new Uint32Array(1))[0] >>> 0;
  }
  // Only reachable in an environment with no Web Crypto at all. Still varies per session, and
  // the fallback is stated rather than silently pretending to be entropy.
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

/**
 * Builds one long-lived RngPort for a play session, resuming from a save's stream index.
 *
 * `seed` is optional ON PURPOSE: omitting it is the production path and draws real entropy,
 * passing one is the test path and replays exactly.
 */
export function createSessionRng(resumeFromStreamIndex: number, seed: number = createEntropySeed()): RngPort {
  return createSplitMix32Rng(seed, resumeFromStreamIndex);
}
