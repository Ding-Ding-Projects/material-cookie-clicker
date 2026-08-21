import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { it } from "vitest";

import { bnFromNumber } from "../src/shared/game/big-number.js";
import { ALL_CONTROL_RUNG_IDS } from "../src/shared/game/control-unlocks.js";
import { GOLDEN_CHALLENGES, rollGoldenChallengeTarget } from "../src/shared/game/golden-challenges.js";
import { createSplitMix32Rng } from "../src/shared/game/golden-cookie.js";
import { createInitialGameState } from "../src/shared/game/reducer.js";
import { encodeSave } from "../src/shared/game/save-codec.js";
import type { GameState } from "../src/shared/game/types.js";

/**
 * CAPTURE HARNESS, not a test -- it lives under `scripts/` so `npm test` never runs it.
 *
 * Writes one save per golden-challenge FAMILY, each already caught and sitting on that family's
 * card, so the four new controls can be photographed from the built artifact.
 *
 * It seeds the caught state directly rather than waiting for a spawn. Waiting is what an earlier
 * attempt did, and a capture run that sits in a polling loop hoping a random scheduler fires is
 * both slow and non-deterministic -- the state below is exactly the state the domain produces at a
 * catch, written out in one step.
 *
 *   CAPTURE_DIR=<dir> npx vitest run scripts/capture-seed-golden-challenges.test.ts
 */

const dir = process.env.CAPTURE_DIR ?? "captures/tmp/golden-challenges";

/** A save whose golden cookie is caught and open on `challengeId`. */
function caughtOn(challengeId: string, nowMs: number): GameState {
  const challenge = GOLDEN_CHALLENGES.find((c) => c.id === challengeId);
  if (!challenge) throw new Error(`No such challenge: ${challengeId}`);
  const rng = createSplitMix32Rng(20260821, 0);
  const base = createInitialGameState(new Date(nowMs).toISOString());
  return {
    ...base,
    cookies: bnFromNumber(50_000),
    lifetimeCookies: bnFromNumber(50_000),
    stats: { ...base.stats, totalCookiesBaked: bnFromNumber(50_000) },
    // Without the control rungs the window renders the bare cookie-only shell whatever the save
    // holds, so the card would be live in state and invisible on screen.
    controlUnlocks: { purchasedRungIds: [...ALL_CONTROL_RUNG_IDS] },
    goldenCookie: {
      isSpawned: true,
      spawnXPct: 50,
      spawnYPct: 45,
      spawnedAtEpochMs: nowMs,
      rngStreamIndex: 0,
      nextEligibleAtEpochMs: nowMs + 600_000,
      dial: {
        roundsWon: 0,
        zoneCentre: 0.5,
        roundStartedAtEpochMs: nowMs,
        misses: 0,
        stepped: false,
        challengeId,
        progress: 0,
        target: rollGoldenChallengeTarget(challenge, rng),
      },
    },
  };
}

/** One per family, so every new control is photographed rather than only the ones that are easy. */
const CASES: readonly (readonly [string, string])[] = [
  ["golden-mash", "mash.knead"],
  ["golden-hold", "hold.steep"],
  ["golden-sequence", "seq.recipe4"],
  ["golden-pick", "pick.six"],
  ["golden-dial", "dial.oven"],
];

for (const [name, challengeId] of CASES) {
  it(`seeds the ${name} save`, () => {
    // The timestamps are LIVE: every one of these cards derives its countdown from the wall clock,
    // so a save stamped in 1970 loads straight into an expired cookie and photographs the aftermath
    // rather than the challenge.
    const state = caughtOn(challengeId, Date.now());
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, `${name}.json`), JSON.stringify(encodeSave(state)), "utf8");
  });
}
