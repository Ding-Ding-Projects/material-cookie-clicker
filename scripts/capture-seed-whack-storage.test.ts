import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { it } from "vitest";

import { bnFromNumber } from "../src/shared/game/big-number.js";
import { encodeSave } from "../src/shared/game/save-codec.js";
import { createInitialGameState } from "../src/shared/game/reducer.js";
import type { GameState } from "../src/shared/game/types.js";

/**
 * CAPTURE HARNESS, not a test — same idiom as `capture-seed-plain-look.test.ts`, and it lives
 * under `scripts/` for the same reason: `npm test` runs `vitest run tests`, so this never
 * executes as part of the suite.
 *
 * It seeds the save the raid-supplies capture needs: a balance that can afford a Whack Pass
 * (1,000,000) AND the first Whack Storage rung (5,000,000) with real presses, and nothing at
 * all pre-bought on the shelf — the point of the capture is to photograph the two purchases
 * happening, so the stock must start at 0 / 3 and the storage chip at rung zero.
 *
 * The lifetime total is above the grandfather threshold so the window wears the assembled look
 * rather than the plain one; the shelf, not the chrome, is what is being photographed.
 *
 * Run it on purpose:
 *   CAPTURE_WHACK_SAVE=<path> npx vitest run scripts/capture-seed-whack-storage.test.ts
 */
it("seeds a save that can afford a pass and the first storage rung", () => {
  const now = new Date().toISOString();
  const state: GameState = {
    ...createInitialGameState(now),
    cookies: bnFromNumber(50_000_000),
    lifetimeCookies: bnFromNumber(50_000_000),
  };

  const path = process.env.CAPTURE_WHACK_SAVE ?? "captures/tmp/whack-storage-save.json";
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(encodeSave(state)), "utf8");
});
