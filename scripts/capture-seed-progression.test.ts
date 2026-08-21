import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { it } from "vitest";

import { bnFromNumber } from "../src/shared/game/big-number.js";
import { encodeSave } from "../src/shared/game/save-codec.js";
import { createInitialGameState } from "../src/shared/game/reducer.js";
import { ALL_CONTROL_RUNG_IDS } from "../src/shared/game/control-unlocks.js";
import { ACHIEVEMENT_DEFINITIONS } from "../src/shared/game/achievements.js";
import type { GameState } from "../src/shared/game/types.js";

/**
 * CAPTURE HARNESS for the `progression-states` capture lane, not a test — same idiom as every
 * other `scripts/capture-seed-*.test.ts` file. It lives under `scripts/` so `npm test` (which
 * runs `vitest run tests`) never executes it.
 *
 * Writes the saves this lane's seven inventory rows need, one file per state, all bound to
 * `state.id` names so the capture driver can find them by name:
 *
 *   fresh-start.json            — a genuinely new save. Nothing bought, nothing owned.
 *   graphics-cookie-only.json   — the opening composition before any `look` rung is bought.
 *     Deliberately identical in substance to fresh-start: both are the plain cookie-only
 *     opening, captured for two different rows in the inventory because they document two
 *     different things (the first-run experience, and the "before" end of the graphics ladder).
 *   office-building.json        — officeBuilding generator owned, past its 500,000,000
 *     lifetime-cookie unlock threshold (generators.ts).
 *   home-endless.json           — all six authored rooms built, extensionLevel 7, with enough
 *     cookies on hand to afford the eighth floor so "the next floor available" is literally true
 *     (home-construction.ts#homeExtensionCost: 100,000,000 * 2^7 = 12,800,000,000).
 *   diesel-depot-collapsed.json — the Fuel Contract reveal bought and a running factory, so the
 *     depot status card has real litres in it when the capture driver collapses it.
 *   home-late-rooms.json        — Bedroom finished and furnished, Workshop mid-build, Garden's
 *     blueprint bought and waiting: three different late-room states in one save, since the
 *     inventory proof asks for "build/furnishing states" (plural) rather than one snapshot.
 *   milk-focus.json             — enough unlocked achievements that the milk tide sits well up
 *     the glass (milk.ts: 4% per badge), so the capture reads as "high milk level" rather than a
 *     sliver at the bottom.
 *
 * Every populated state grants every control rung (ALL_CONTROL_RUNG_IDS) so the console, the
 * shop rail and the upgrade strip are dressed exactly as a real late save would show them — the
 * same choice `capture-seed-release-states.test.ts` makes for its own "progressed" save. Only
 * fresh-start and graphics-cookie-only deliberately buy nothing.
 *
 * Run it on purpose:
 *   CAPTURE_DIR=<dir> npx vitest run scripts/capture-seed-progression.test.ts
 */

const dir = process.env.CAPTURE_DIR ?? "captures/tmp/progression-states";

function write(name: string, state: GameState): void {
  const path = join(dir, `${name}.json`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(encodeSave(state)), "utf8");
}

it("seeds fresh-start", () => {
  const now = new Date().toISOString();
  write("fresh-start", createInitialGameState(now));
});

it("seeds graphics-cookie-only", () => {
  // Substantively the same save as fresh-start: no cookies, no rungs bought, nothing owned.
  // Written under its own name because it documents a different inventory row (the "before" end
  // of the graphics ladder rather than the first-run screen).
  const now = new Date().toISOString();
  write("graphics-cookie-only", createInitialGameState(now));
});

it("seeds office-building", () => {
  const now = new Date().toISOString();
  const state: GameState = {
    ...createInitialGameState(now),
    cookies: bnFromNumber(2_500_000_000),
    lifetimeCookies: bnFromNumber(2_500_000_000),
    generators: [
      { id: "cursor", count: 60 },
      { id: "grandma", count: 40 },
      { id: "farm", count: 30 },
      { id: "mine", count: 20 },
      { id: "factory", count: 12 },
      { id: "bank", count: 6 },
      { id: "temple", count: 3 },
      { id: "wizardTower", count: 2 },
      // Past the 500,000,000-lifetime-cookie unlock threshold (generators.ts#officeBuilding).
      { id: "officeBuilding", count: 5 },
    ],
    upgrades: ["reveal_shop_sign", "reveal_upgrade_catalogue"].map((id, i) => ({
      id,
      purchasedAtTickCount: i,
    })),
    stats: { totalClicks: 1_800, totalCookiesBaked: bnFromNumber(2_500_000_000), clockAnomalyCount: 0 },
    controlUnlocks: { purchasedRungIds: [...ALL_CONTROL_RUNG_IDS] },
  };
  write("office-building", state);
});

it("seeds home-endless", () => {
  const now = new Date().toISOString();
  const rooms = ["kitchen", "pantry", "parlour", "bedroom", "workshop", "garden"];
  const state: GameState = {
    ...createInitialGameState(now),
    cookies: bnFromNumber(50_000_000_000),
    lifetimeCookies: bnFromNumber(200_000_000_000),
    generators: [
      { id: "cursor", count: 200 },
      { id: "grandma", count: 150 },
      { id: "farm", count: 100 },
      { id: "mine", count: 70 },
      { id: "factory", count: 40 },
      { id: "bank", count: 25 },
      { id: "temple", count: 15 },
    ],
    upgrades: [
      "reveal_shop_sign",
      "reveal_upgrade_catalogue",
      "reveal_steady_hand",
      "reveal_property_deed",
    ].map((id, i) => ({ id, purchasedAtTickCount: i })),
    stats: { totalClicks: 4_000, totalCookiesBaked: bnFromNumber(200_000_000_000), clockAnomalyCount: 0 },
    controlUnlocks: { purchasedRungIds: [...ALL_CONTROL_RUNG_IDS] },
    homeConstruction: {
      blueprintIds: rooms,
      rooms: rooms.map((roomId) => ({ roomId, furnitureIds: [] })),
      build: null,
      cookiesInvested: bnFromNumber(1_500_000_000),
      // Seven finished extension floors, with the eighth's cost (12,800,000,000) comfortably
      // affordable from the seeded cookie total above.
      extensionLevel: 7,
    },
  };
  write("home-endless", state);
});

it("seeds diesel-depot-collapsed", () => {
  const now = new Date().toISOString();
  const state: GameState = {
    ...createInitialGameState(now),
    cookies: bnFromNumber(800_000),
    lifetimeCookies: bnFromNumber(3_000_000),
    generators: [
      { id: "cursor", count: 20 },
      { id: "grandma", count: 12 },
      { id: "farm", count: 6 },
    ],
    upgrades: ["reveal_shop_sign", "reveal_fuel_contract"].map((id, i) => ({
      id,
      purchasedAtTickCount: i,
    })),
    stats: { totalClicks: 600, totalCookiesBaked: bnFromNumber(3_000_000), clockAnomalyCount: 0 },
    controlUnlocks: { purchasedRungIds: [...ALL_CONTROL_RUNG_IDS] },
    dieselDepot: {
      litresMinted: 640,
      vouchersMinted: 12,
      cookiesSpent: bnFromNumber(120_000),
    },
    dieselFactory: {
      equipment: [
        { id: "crude_well", count: 5 },
        { id: "refinery_still", count: 5 },
        { id: "storage_tank", count: 4 },
      ],
      upgradeIds: [],
      crude: 30,
      // Storage tanks push capacity to 10 + 4*25 = 110; sit well into the tank so the card's
      // fill bar reads as something rather than a sliver.
      litres: 82,
      lifetimeCrude: 4_200,
      lifetimeLitres: 1_950,
      cookiesInvested: bnFromNumber(120_000),
      autoShipEnabled: false,
      stalledSeconds: 0,
    },
  };
  write("diesel-depot-collapsed", state);
});

it("seeds home-late-rooms", () => {
  const now = new Date().toISOString();
  const state: GameState = {
    ...createInitialGameState(now),
    cookies: bnFromNumber(20_000_000),
    lifetimeCookies: bnFromNumber(60_000_000),
    generators: [
      { id: "cursor", count: 80 },
      { id: "grandma", count: 50 },
      { id: "farm", count: 25 },
      { id: "mine", count: 10 },
    ],
    upgrades: ["reveal_shop_sign", "reveal_upgrade_catalogue", "reveal_property_deed"].map((id, i) => ({
      id,
      purchasedAtTickCount: i,
    })),
    stats: { totalClicks: 2_400, totalCookiesBaked: bnFromNumber(60_000_000), clockAnomalyCount: 0 },
    controlUnlocks: { purchasedRungIds: [...ALL_CONTROL_RUNG_IDS] },
    homeConstruction: {
      // Kitchen is the mandatory prerequisite; Bedroom, Workshop and Garden are the three "late
      // room" states this capture is actually about.
      blueprintIds: ["kitchen", "bedroom", "workshop", "garden"],
      rooms: [
        { roomId: "kitchen", furnitureIds: ["kt_stone_oven", "kt_marble_bench"] },
        // Built AND furnished.
        { roomId: "bedroom", furnitureIds: ["bd_four_poster", "bd_quilt", "bd_reading_lamp"] },
      ],
      // Workshop mid-build: partway through its 1,200,000ms requirement.
      build: { roomId: "workshop", elapsedMs: 900_000, requiredMs: 1_200_000 },
      // Garden's blueprint is bought and waiting; construction has not started on it.
      cookiesInvested: bnFromNumber(9_500_000),
      extensionLevel: 0,
    },
  };
  write("home-late-rooms", state);
});

it("seeds milk-focus", () => {
  const now = new Date().toISOString();
  // Enough unlocked badges to push the tide well up the glass (milk.ts: 4% per achievement).
  // Sliced from the real definition list rather than hard-coding a count, so this stays valid as
  // the roster grows; capped so it can never exceed what actually exists.
  const unlockedCount = Math.min(80, ACHIEVEMENT_DEFINITIONS.length);
  const achievements = ACHIEVEMENT_DEFINITIONS.slice(0, unlockedCount).map((def, i) => ({
    id: def.id,
    unlockedAtIso: now,
  }));
  const state: GameState = {
    ...createInitialGameState(now),
    cookies: bnFromNumber(9_000_000_000),
    lifetimeCookies: bnFromNumber(40_000_000_000),
    generators: [
      { id: "cursor", count: 150 },
      { id: "grandma", count: 100 },
      { id: "farm", count: 70 },
      { id: "mine", count: 45 },
      { id: "factory", count: 25 },
      { id: "bank", count: 14 },
    ],
    upgrades: ["reveal_shop_sign", "reveal_upgrade_catalogue"].map((id, i) => ({
      id,
      purchasedAtTickCount: i,
    })),
    stats: { totalClicks: 5_500, totalCookiesBaked: bnFromNumber(40_000_000_000), clockAnomalyCount: 0 },
    controlUnlocks: { purchasedRungIds: [...ALL_CONTROL_RUNG_IDS] },
    achievements,
  };
  write("milk-focus", state);
});
