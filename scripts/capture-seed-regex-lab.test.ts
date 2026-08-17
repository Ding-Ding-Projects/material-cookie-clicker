import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { it } from "vitest";

import { bnFromNumber } from "../src/shared/game/big-number.js";
import { encodeSave } from "../src/shared/game/save-codec.js";
import { createInitialGameState } from "../src/shared/game/reducer.js";
import type { GameState } from "../src/shared/game/types.js";

/**
 * CAPTURE HARNESS, not a test — the same idiom as `capture-seed-save.test.ts`, and it lives
 * under `scripts/` for the same reason: `npm test` runs `vitest run tests`, so this never
 * executes as part of the suite.
 *
 * It seeds the save the regex-lab capture needs: enough cookies to buy the advanced tiers with
 * real presses, the shop rail's own three search rungs already bought (so the popover opens at
 * all), and the two shared `regex` rungs deliberately NOT bought — the whole point of the
 * capture is to photograph the coin-slot plate first and the bought builder afterwards.
 *
 * Run it on purpose:
 *   CAPTURE_REGEX_SAVE=<path> npx vitest run scripts/capture-seed-regex-lab.test.ts
 */
it("seeds a save that can afford the advanced regex tiers", () => {
  const now = new Date().toISOString();
  const state: GameState = {
    ...createInitialGameState(now),
    cookies: bnFromNumber(250_000),
    lifetimeCookies: bnFromNumber(250_000),
    generators: [
      { id: "cursor", count: 40 },
      { id: "grandma", count: 25 },
      { id: "farm", count: 12 },
    ],
    controlUnlocks: {
      purchasedRungIds: [
        "chrome.close",
        "chrome.drag",
        "settings.open",
        "search.generators",
        "search.generators.builder",
        "search.generators.tokens",
      ],
    },
  };

  const path = process.env.CAPTURE_REGEX_SAVE ?? "captures/tmp/regex-lab-save.json";
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(encodeSave(state)), "utf8");
});
