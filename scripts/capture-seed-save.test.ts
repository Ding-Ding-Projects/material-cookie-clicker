import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { it } from "vitest";

import { bnFromNumber } from "../src/shared/game/big-number.js";
import { evaluateAchievements } from "../src/shared/game/achievements.js";
import { encodeSave } from "../src/shared/game/save-codec.js";
import { createInitialGameState } from "../src/shared/game/reducer.js";
import { UPGRADE_DEFINITIONS, isUpgradeUnlocked } from "../src/shared/game/upgrades.js";
import { LOOK_RUNG_IDS } from "../src/shared/game/look-tiers.js";
import type { GameState } from "../src/shared/game/types.js";

/**
 * CAPTURE HARNESS, not a test.
 *
 * Builds a progressed save and writes it out, so the built application can be launched against
 * a real mid-to-late-game state for screenshots instead of a fresh one. It lives under
 * `scripts/` rather than `tests/` deliberately: `npm test` runs `vitest run tests`, so this
 * never executes as part of the suite and never writes a file during a normal check.
 *
 * Run it on purpose:
 *   CAPTURE_USER_DATA=<dir> npx vitest run scripts/capture-seed-save.test.ts
 *
 * Then push the file it wrote into the running app with
 * `scripts/capture-seed-localstorage.mjs`, because the renderer persists to localStorage today
 * (see src/renderer/game/persistence.ts) rather than to the file the main process owns.
 */
it("seeds a progressed save", () => {
  const now = new Date().toISOString();
  let state: GameState = {
    ...createInitialGameState(now),
    cookies: bnFromNumber(4e19),
    lifetimeCookies: bnFromNumber(9e19),
    generators: [
      { id: "cursor", count: 220 },
      { id: "grandma", count: 160 },
      { id: "farm", count: 120 },
      { id: "mine", count: 90 },
      { id: "factory", count: 60 },
      { id: "bank", count: 40 },
      { id: "temple", count: 28 },
      { id: "wizardTower", count: 18 },
      { id: "shipment", count: 12 },
      { id: "alchemyLab", count: 8 },
      { id: "portal", count: 5 },
      { id: "timeMachine", count: 3 },
      { id: "antimatterCondenser", count: 2 },
      { id: "prism", count: 1 },
    ],
    stats: { totalClicks: 12_400, totalCookiesBaked: bnFromNumber(9e19), clockAnomalyCount: 0 },
    dieselDepot: { litresMinted: 14, vouchersMinted: 3, cookiesSpent: bnFromNumber(5e4) },
    // A floor with real equipment on it, so a capture of the factory panel shows a running line
    // and a stocked equipment shelf rather than an empty yard.
    dieselFactory: {
      equipment: [
        { id: "crude_well", count: 50 },
        { id: "refinery_still", count: 50 },
        { id: "storage_tank", count: 3 },
      ],
      upgradeIds: ["fx_wider_bore", "fx_deep_drilling"],
      crude: 120,
      litres: 41,
      lifetimeCrude: 9_400,
      lifetimeLitres: 3_100,
      cookiesInvested: bnFromNumber(8e8),
      autoShipEnabled: false,
      stalledSeconds: 0,
    },
    // THE LOOK, PRE-BOUGHT — and stated plainly rather than left for a reader to discover.
    //
    // The whole v2 cabinet is a purchase now (look-tiers.ts), so a seeded save that owns nothing
    // renders in the plain start look. That is the correct picture for the plain-start captures
    // and the wrong one for a mid-game surface, where a player at ninety quintillion lifetime
    // cookies would obviously have bought the seven rungs long ago. Seeding them here keeps the
    // surface captures honest about what a progressed run looks like; the ladder being CLIMBED is
    // photographed separately, with real presses, in `plain-start.png` / `plain-upgrading.png`.
    controlUnlocks: { purchasedRungIds: [...LOOK_RUNG_IDS] },
    prestige: {
      ascensionPoints: 42,
      totalPrestigeCount: 3,
      permanentUnlockIds: [],
      rebornNodeIds: ["reborn_lucky_pocket", "reborn_second_wind", "reborn_dog_eared_catalogue"],
    },
  };

  // Own a realistic slice of the catalogue: everything unlocked and cheap enough that a player
  // at this stage would obviously have bought it.
  // The reveals unlock in a chain (each one's condition names the one before it), so a single
  // pass over the catalogue would only ever catch the first. They are all bought at this stage
  // of a real run, so they are named outright rather than filtered for.
  const owned = UPGRADE_DEFINITIONS.filter(
    (def) =>
      def.effect.kind === "reveal" ||
      (isUpgradeUnlocked(def.unlockCondition, state) && def.cost.exponent < 13),
  ).map((def, i) => ({ id: def.id, purchasedAtTickCount: i }));
  state = { ...state, upgrades: owned };

  // Run achievements to a fixed point, twice, so the milk level is what this save really earned.
  for (let pass = 0; pass < 3; pass += 1) {
    const newly = evaluateAchievements(state);
    if (newly.length === 0) break;
    state = {
      ...state,
      achievements: [...state.achievements, ...newly.map((id) => ({ id, unlockedAtIso: now }))],
    };
  }

  const dir = process.env.CAPTURE_USER_DATA ?? join(process.env.APPDATA ?? "", "Material Cookie Clicker");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "material-cookie-clicker-save.json"), JSON.stringify(encodeSave(state)));
  console.log(`seeded ${state.upgrades.length} upgrades, ${state.achievements.length} achievements`);
});
