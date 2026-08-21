import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { it } from "vitest";

import { bnFromNumber } from "../src/shared/game/big-number.js";
import { evaluateAchievements } from "../src/shared/game/achievements.js";
import { encodeSave } from "../src/shared/game/save-codec.js";
import { createInitialGameState } from "../src/shared/game/reducer.js";
import { ALL_CONTROL_RUNG_IDS } from "../src/shared/game/control-unlocks.js";
import type { GameState } from "../src/shared/game/types.js";

/**
 * CAPTURE HARNESS, not a test — same idiom as capture-seed-release-states.test.ts. Lives under
 * `scripts/` so `npm test` (which runs `vitest run tests`) never executes it.
 *
 * Writes ONE save — `chrome.json` — reused for all six chrome-and-motion states this lane owns
 * (appearance-editor, event-pool-remaining, golden-dial-miss, prestige-keyed,
 * factory-reduced-motion, raid-reduced-motion). What distinguishes each capture is navigation and
 * localStorage developer flags at drive time, not the save content, so one generous save covers
 * every one of them:
 *
 *   - lifetimeCookies / cookies far past the 1e12 canPrestige threshold, so the prestige console
 *     emblem, the prestige gate and its projected points are all real numbers.
 *   - stats.totalCookiesBaked far past both the 100,000 minigame-events threshold and the
 *     1,000,000 mouse-raid threshold (control-unlocks.ts), so the event pool and the raid are
 *     both reachable.
 *   - Every reveal upgrade owned directly (not migration-granted), so the factory panel
 *     (reveal_fuel_contract) and the shop/upgrade chrome are on screen rather than the bare shell.
 *   - Every control rung bought, so the settings/tools gate that the Appearance Editor sits
 *     behind is open.
 *   - Achievements evaluated for real off this state, so `lifetime_1000000000` — the exact
 *     achievement disclosure.ts keys the prestige console emblem off — is actually unlocked
 *     rather than assumed.
 *
 * Run it on purpose:
 *   CAPTURE_DIR=<dir> npx vitest run scripts/capture-seed-chrome-states.test.ts
 */

const REVEALS = [
  "reveal_shop_sign",
  "reveal_upgrade_catalogue",
  "reveal_steady_hand",
  "reveal_fuel_contract",
  "reveal_property_deed",
];

function withAchievements(state: GameState, now: string): GameState {
  let out = state;
  for (let pass = 0; pass < 4; pass += 1) {
    const newly = evaluateAchievements(out);
    if (newly.length === 0) break;
    out = {
      ...out,
      achievements: [...out.achievements, ...newly.map((id) => ({ id, unlockedAtIso: now }))],
    };
  }
  return out;
}

const dir = process.env.CAPTURE_DIR ?? "captures/tmp/chrome-states";

it("seeds the shared chrome save", () => {
  const now = new Date().toISOString();
  let state: GameState = {
    ...createInitialGameState(now),
    cookies: bnFromNumber(5_000_000_000_000),
    lifetimeCookies: bnFromNumber(5_000_000_000_000),
    generators: [
      { id: "cursor", count: 40 },
      { id: "grandma", count: 30 },
      { id: "farm", count: 20 },
      { id: "mine", count: 10 },
    ],
    upgrades: REVEALS.map((id, i) => ({ id, purchasedAtTickCount: i })),
    // Real equipment on the line, not an idle factory: the reduced-motion capture has to show a
    // pipe and a derrick that would normally be animating, or "reduced motion" and "nothing is
    // moving anyway" are indistinguishable in the picture.
    dieselFactory: {
      ...createInitialGameState(now).dieselFactory,
      equipment: [
        { id: "crude_well", count: 4 },
        { id: "refinery_still", count: 4 },
        { id: "storage_tank", count: 3 },
      ],
      crude: 20,
      litres: 5,
    },
    stats: {
      totalClicks: 12_000,
      totalCookiesBaked: bnFromNumber(5_000_000_000_000),
      clockAnomalyCount: 0,
    },
    controlUnlocks: { purchasedRungIds: [...ALL_CONTROL_RUNG_IDS] },
  };
  state = withAchievements(state, now);

  const path = `${dir}/chrome.json`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(encodeSave(state)), "utf8");
});
