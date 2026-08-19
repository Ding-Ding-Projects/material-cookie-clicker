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
 * CAPTURE HARNESS FOR THE HOME PANEL, not a test.
 *
 * The general harness beside this one (capture-seed-save.test.ts) hands the save every reveal
 * upgrade in the catalogue, which is right for a mid-run screenshot and wrong for photographing
 * the moment the house is BOUGHT. So this one writes two deliberately different saves, chosen
 * with `HOME_CAPTURE_STAGE`:
 *
 *   before    — a rich save with the shop open and NO Property Deed. The capture buys the deed
 *               and the Kitchen blueprint with real presses on the real buttons, which is the
 *               only way a screenshot of a purchase flow can be honest.
 *   furnished — a save two rooms in, with furniture standing in them and a build most of the way
 *               through the third, so the coziness gauge has a real reading on it.
 *
 * It lives under `scripts/` for the same reason its neighbour does: `npm test` runs
 * `vitest run tests`, so this never executes during a normal check.
 *
 * Run it on purpose:
 *   HOME_CAPTURE_STAGE=before CAPTURE_USER_DATA=<dir> npx vitest run scripts/capture-seed-home.test.ts
 */
it("seeds a save for the home capture", () => {
  const stage = process.env.HOME_CAPTURE_STAGE === "endless"
    ? "endless"
    : process.env.HOME_CAPTURE_STAGE === "furnished"
      ? "furnished"
      : "before";
  const now = new Date().toISOString();

  let state: GameState = {
    ...createInitialGameState(now),
    cookies: bnFromNumber(4e9),
    lifetimeCookies: bnFromNumber(9e9),
    generators: [
      { id: "cursor", count: 180 },
      { id: "grandma", count: 120 },
      { id: "farm", count: 90 },
      { id: "mine", count: 60 },
      { id: "factory", count: 35 },
      { id: "bank", count: 20 },
      { id: "temple", count: 10 },
    ],
    stats: { totalClicks: 3_200, totalCookiesBaked: bnFromNumber(9e9), clockAnomalyCount: 0 },
  };

  if (stage === "furnished") {
    state = {
      ...state,
      controlUnlocks: { purchasedRungIds: [...LOOK_RUNG_IDS] },
      // A Parlour six minutes into its five-minute-plus build, so the capture can hold both
      // states at once: two finished rooms with things in them, and a site still working.
      homeConstruction: {
        blueprintIds: ["kitchen", "pantry", "parlour"],
        rooms: [
          { roomId: "kitchen", furnitureIds: ["kt_stone_oven", "kt_marble_bench", "kt_copper_pots", "kt_kettle"] },
          { roomId: "pantry", furnitureIds: ["pt_flour_bins", "pt_cold_safe", "pt_jar_wall"] },
        ],
        build: { roomId: "parlour", elapsedMs: 246_000, requiredMs: 300_000 },
        cookiesInvested: bnFromNumber(1_060_000),
        extensionLevel: 0,
      },
    };
  } else if (stage === "endless") {
    state = {
      ...state,
      controlUnlocks: { purchasedRungIds: [...LOOK_RUNG_IDS] },
      homeConstruction: {
        blueprintIds: ["kitchen", "pantry", "parlour", "bedroom", "workshop", "garden"],
        rooms: ["kitchen", "pantry", "parlour", "bedroom", "workshop", "garden"].map((roomId) => ({
          roomId,
          furnitureIds: [],
        })),
        build: null,
        cookiesInvested: bnFromNumber(1e12),
        extensionLevel: 7,
      },
    };
  }

  // The reveals unlock in a chain, so they are named outright rather than filtered for. The
  // Property Deed is the exception in the "before" stage: leaving it out is the whole point of
  // that stage, because the capture is of somebody buying it.
  const owned = UPGRADE_DEFINITIONS.filter((def) => {
    if (def.id === "reveal_property_deed") return stage === "furnished" || stage === "endless";
    return def.effect.kind === "reveal" || (isUpgradeUnlocked(def.unlockCondition, state) && def.cost.exponent < 8);
  }).map((def, i) => ({ id: def.id, purchasedAtTickCount: i }));
  state = { ...state, upgrades: owned };

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
  writeFileSync(join(dir, `home-capture-${stage}.json`), JSON.stringify(encodeSave(state)));
  console.log(`seeded ${stage}: ${state.upgrades.length} upgrades, ${state.achievements.length} achievements`);
});
