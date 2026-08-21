import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { it } from "vitest";

import { bnFromNumber } from "../src/shared/game/big-number.js";
import { encodeSave } from "../src/shared/game/save-codec.js";
import { createInitialGameState } from "../src/shared/game/reducer.js";
import { ALL_CONTROL_RUNG_IDS } from "../src/shared/game/control-unlocks.js";
import { MINIGAME_UNLOCK_LIFETIME_COOKIES } from "../src/shared/game/minigames.js";
import type { GameState } from "../src/shared/game/types.js";

/**
 * CAPTURE HARNESS, not a test — same idiom as `capture-seed-release-states.test.ts`. It lives
 * under `scripts/` so `npm test` (which runs `vitest run tests`) never executes it.
 *
 * Writes ONE save: past the minigame-panel unlock threshold
 * (`minigames.ts#MINIGAME_UNLOCK_LIFETIME_COOKIES`, 100,000 lifetime baked cookies), every
 * control rung already bought so the cabinet console (and its `console-minigames` button) is
 * dressed exactly as a real save that got here would be, three golden tokens banked so both the
 * Lucky Chance draw and the daily objective have something to press, and NO minigame started —
 * the whole point of this seed is to photograph the picker with all five board choices before
 * any one of them is opened.
 *
 * Run it on purpose:
 *   CAPTURE_MINIGAMES_SAVE=<path> npx vitest run scripts/capture-seed-minigames.test.ts
 */
it("seeds a save past the minigame unlock with tokens banked and no board started", () => {
  const now = new Date().toISOString();
  const cookies = bnFromNumber(500_000);
  const state: GameState = {
    ...createInitialGameState(now),
    cookies,
    lifetimeCookies: cookies,
    stats: { totalClicks: 900, totalCookiesBaked: bnFromNumber(MINIGAME_UNLOCK_LIFETIME_COOKIES + 400_000), clockAnomalyCount: 0 },
    controlUnlocks: { purchasedRungIds: [...ALL_CONTROL_RUNG_IDS] },
    goldenTokens: { balance: 3, awardedKeys: [] },
  };

  const path = process.env.CAPTURE_MINIGAMES_SAVE ?? join("captures", "tmp", "release-minigames", "minigames.json");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(encodeSave(state)), "utf8");
});
