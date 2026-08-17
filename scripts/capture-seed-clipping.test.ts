import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { it } from "vitest";

import { bnFromNumber } from "../src/shared/game/big-number.js";
import { evaluateAchievements } from "../src/shared/game/achievements.js";
import { encodeSave } from "../src/shared/game/save-codec.js";
import { createInitialGameState } from "../src/shared/game/reducer.js";
import { ALL_CONTROL_RUNG_IDS } from "../src/shared/game/control-unlocks.js";
import { UPGRADE_DEFINITIONS, isUpgradeUnlocked } from "../src/shared/game/upgrades.js";
import type { GameState } from "../src/shared/game/types.js";

/**
 * CAPTURE HARNESS, not a test — same idiom as the other `scripts/capture-seed-*.test.ts` files,
 * and it lives under `scripts/` for the same reason: `npm test` runs `vitest run tests`, so this
 * never executes as part of the suite.
 *
 * It writes the THREE save states the clipping audit walks, because a clipping audit that only
 * ever looks at one save is an audit of one layout. Long labels, long numbers and long lists are
 * exactly what clips, and each of those arrives at a different point in a run:
 *
 *   plain.json  — a genuinely fresh save. Nothing revealed, nothing bought, the plain look.
 *   mid.json    — the owner's screenshot: every look rung bought, shop rail + upgrade strip +
 *                 depot + factory + home revealed, raid supplies in stock, a dozen upgrades.
 *   late.json   — 1e13+ cookies and a deep generator list, so every readout is carrying its
 *                 widest possible figure.
 *
 * Run it on purpose:
 *   CLIP_SAVE_DIR=<dir> npx vitest run scripts/capture-seed-clipping.test.ts
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

function write(name: string, state: GameState): void {
  const dir = process.env.CLIP_SAVE_DIR ?? "captures/tmp/clipping";
  const path = join(dir, `${name}.json`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(encodeSave(state)), "utf8");
  console.log(`${name}: ${state.upgrades.length} upgrades, ${state.achievements.length} achievements`);
}

it("seeds the three clipping-audit saves", () => {
  const now = new Date().toISOString();
  const initial = createInitialGameState(now);

  /* ---------------------------------------------------------------- plain: a fresh save */
  write("plain", initial);

  /* ------------------------------------------------------------------------- mid-game */
  // Deliberately a DOZEN upgrades, not the whole catalogue: the owner's screenshot shows a
  // low upgrade count against the full 180, and the ticket strip's "ready to buy" shelf is only
  // interesting to a clipping audit while it still has unbought rows in it.
  const midUpgradeIds = [
    ...REVEALS,
    "reinforced_index_finger",
    "carpal_tunnel_prevention_cream",
    "forwards_from_grandma",
    "steel_plated_rolling_pins",
    "cheap_hoes",
    "sugar_gas",
    "iron_ore_extraction",
  ].filter((id) => UPGRADE_DEFINITIONS.some((d) => d.id === id));

  let mid: GameState = {
    ...initial,
    cookies: bnFromNumber(48_000),
    lifetimeCookies: bnFromNumber(120_000),
    generators: [
      { id: "cursor", count: 26 },
      { id: "grandma", count: 14 },
      { id: "farm", count: 8 },
      { id: "mine", count: 3 },
    ],
    upgrades: midUpgradeIds.map((id, i) => ({ id, purchasedAtTickCount: i })),
    stats: { totalClicks: 640, totalCookiesBaked: bnFromNumber(120_000), clockAnomalyCount: 0 },
    // Every look rung bought, so the audit runs against the FULL dressed cabinet rather than
    // the plain fallback — the dressed look is where the letter-spaced display type lives, and
    // letter-spaced display type in a fixed-width cap is what clips.
    controlUnlocks: { purchasedRungIds: [...ALL_CONTROL_RUNG_IDS] },
    randomEvents: {
      ...initial.randomEvents,
      consumables: {
        whack_pass: { stock: 2, purchased: 2 },
        bigger_whack: { stock: 1, purchased: 1 },
        half_hp_whack: { stock: 1, purchased: 1 },
      },
    },
  };
  mid = withAchievements(mid, now);
  write("mid", mid);

  /* ----------------------------------------------------------------------------- late */
  let late: GameState = {
    ...initial,
    cookies: bnFromNumber(4.2e19),
    lifetimeCookies: bnFromNumber(9.7e19),
    generators: [
      { id: "cursor", count: 812 },
      { id: "grandma", count: 640 },
      { id: "farm", count: 512 },
      { id: "mine", count: 430 },
      { id: "factory", count: 388 },
      { id: "bank", count: 301 },
      { id: "temple", count: 245 },
      { id: "wizardTower", count: 198 },
      { id: "shipment", count: 156 },
      { id: "alchemyLab", count: 120 },
      { id: "portal", count: 94 },
      { id: "timeMachine", count: 71 },
      { id: "antimatterCondenser", count: 55 },
      { id: "prism", count: 33 },
    ],
    stats: { totalClicks: 128_400, totalCookiesBaked: bnFromNumber(9.7e19), clockAnomalyCount: 2 },
    dieselDepot: { litresMinted: 1_284, vouchersMinted: 96, cookiesSpent: bnFromNumber(7.5e12) },
    dieselFactory: {
      equipment: [
        { id: "crude_well", count: 250 },
        { id: "refinery_still", count: 250 },
        { id: "storage_tank", count: 40 },
      ],
      upgradeIds: ["fx_wider_bore", "fx_deep_drilling"],
      crude: 98_400,
      litres: 12_800,
      lifetimeCrude: 4_900_000,
      lifetimeLitres: 1_240_000,
      cookiesInvested: bnFromNumber(6.2e13),
      autoShipEnabled: true,
      stalledSeconds: 0,
    },
    prestige: {
      ascensionPoints: 4_820,
      totalPrestigeCount: 12,
      permanentUnlockIds: [],
      rebornNodeIds: ["reborn_lucky_pocket", "reborn_second_wind", "reborn_dog_eared_catalogue"],
    },
    controlUnlocks: { purchasedRungIds: [...ALL_CONTROL_RUNG_IDS] },
    randomEvents: {
      ...initial.randomEvents,
      consumables: {
        whack_pass: { stock: 9, purchased: 40 },
        bigger_whack: { stock: 3, purchased: 18 },
        half_hp_whack: { stock: 3, purchased: 21 },
      },
    },
  };
  const lateOwned = UPGRADE_DEFINITIONS.filter(
    (def) =>
      def.effect.kind === "reveal" ||
      (isUpgradeUnlocked(def.unlockCondition, late) && def.cost.exponent < 13),
  ).map((def, i) => ({ id: def.id, purchasedAtTickCount: i }));
  late = withAchievements({ ...late, upgrades: lateOwned }, now);
  write("late", late);
});
