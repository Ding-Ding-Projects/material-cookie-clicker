import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { it } from "vitest";

import { bnFromNumber } from "../src/shared/game/big-number.js";
import { encodeSave } from "../src/shared/game/save-codec.js";
import { createInitialGameState } from "../src/shared/game/reducer.js";
import type { GameState } from "../src/shared/game/types.js";

/**
 * CAPTURE HARNESS, not a test — same idiom as `capture-seed-regex-lab.test.ts`, and it lives
 * under `scripts/` for the same reason: `npm test` runs `vitest run tests`, so this never
 * executes as part of the suite.
 *
 * It seeds the save the "half-assembled look" capture needs: enough cookies to buy the first two
 * rungs of the `look` ladder (50 + 250) with real presses, and NOTHING of the look already
 * bought — the whole point of the capture is to photograph the plain application first and the
 * partly-assembled one afterwards.
 *
 * Two details that are deliberate rather than incidental:
 *
 *   • `lifetimeCookies` is 400, which is UNDER the 1,000-cookie grandfather threshold
 *     (control-unlocks.ts#MIGRATION_GRANT_LIFETIME_THRESHOLD). A seeded save must not be handed
 *     the look for free, or the capture would be photographing the grant rather than the ladder.
 *   • No control rungs at all are pre-bought. The window is as unbought as a fresh save's, so
 *     the coin-slot plates in the title bar are in shot exactly as a new player meets them.
 *
 * Run it on purpose:
 *   CAPTURE_PLAIN_SAVE=<path> npx vitest run scripts/capture-seed-plain-look.test.ts
 */
it("seeds a save that can afford the first two rungs of the look ladder", () => {
  const now = new Date().toISOString();
  const state: GameState = {
    ...createInitialGameState(now),
    cookies: bnFromNumber(400),
    lifetimeCookies: bnFromNumber(400),
  };

  const path = process.env.CAPTURE_PLAIN_SAVE ?? "captures/tmp/plain-look-save.json";
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(encodeSave(state)), "utf8");
});
