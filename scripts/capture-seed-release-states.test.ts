import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { it } from "vitest";

import { bnFromNumber } from "../src/shared/game/big-number.js";
import { evaluateAchievements } from "../src/shared/game/achievements.js";
import { encodeSave } from "../src/shared/game/save-codec.js";
import { createInitialGameState } from "../src/shared/game/reducer.js";
import { ALL_CONTROL_RUNG_IDS } from "../src/shared/game/control-unlocks.js";
import { UPGRADE_DEFINITIONS } from "../src/shared/game/upgrades.js";
import type { GameState } from "../src/shared/game/types.js";

/**
 * CAPTURE HARNESS, not a test — same idiom as the other `scripts/capture-seed-*.test.ts` files
 * (see capture-seed-clipping.test.ts, capture-seed-graphics-progression.test.ts). It lives under
 * `scripts/` so `npm test` (which runs `vitest run tests`) never executes it.
 *
 * Writes the saves needed for the release-capture-inventory states this lane is closing:
 *   fresh.json        — a genuinely fresh save (no purchases at all).
 *   progressed.json   — a mid-game save with generators, upgrades and achievements, used for
 *                        both the light and dark theme captures and for the narrow-window and
 *                        command-palette captures (a real, populated screen is what clipping and
 *                        the palette overlay actually need to prove).
 *   graphics-before.json / graphics-affordable.json / graphics-after.json — the same three
 *                        `look` ladder states as capture-seed-graphics-progression.test.ts,
 *                        reproduced here so this lane's evidence is self-contained and bound to
 *                        the current release tip rather than reusing an older commit's saves.
 *
 * Run it on purpose:
 *   CAPTURE_DIR=<dir> npx vitest run scripts/capture-seed-release-states.test.ts
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

function write(dir: string, name: string, state: GameState): void {
  const path = join(dir, `${name}.json`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(encodeSave(state)), "utf8");
}

const dir = process.env.CAPTURE_DIR ?? "captures/tmp/release-states";

it("seeds the fresh-start save", () => {
  const now = new Date().toISOString();
  write(dir, "fresh", createInitialGameState(now));
});

it("seeds the progressed-game save", () => {
  const now = new Date().toISOString();
  let progressed: GameState = {
    ...createInitialGameState(now),
    cookies: bnFromNumber(48_000),
    lifetimeCookies: bnFromNumber(120_000),
    generators: [
      { id: "cursor", count: 26 },
      { id: "grandma", count: 14 },
      { id: "farm", count: 8 },
      { id: "mine", count: 3 },
    ],
    upgrades: [...REVEALS]
      .filter((id) => UPGRADE_DEFINITIONS.some((d) => d.id === id))
      .map((id, i) => ({ id, purchasedAtTickCount: i })),
    stats: { totalClicks: 640, totalCookiesBaked: bnFromNumber(120_000), clockAnomalyCount: 0 },
    // The generator list, shop rail and upgrade strip only render once the `look` ladder chrome
    // is purchased (see control-unlocks.ts) — a save with cookies and generators but no rungs
    // bought still renders the bare cookie-only shell. Buy every rung so this capture shows the
    // dressed, populated screen the state is actually named for.
    controlUnlocks: { purchasedRungIds: [...ALL_CONTROL_RUNG_IDS] },
  };
  progressed = withAchievements(progressed, now);
  write(dir, "progressed", progressed);
});

it("seeds the graphics-progression saves", () => {
  const now = new Date().toISOString();
  const stateFor = (cookies: number, purchasedRungIds: readonly string[]): GameState => ({
    ...createInitialGameState(now),
    cookies: bnFromNumber(cookies),
    lifetimeCookies: bnFromNumber(cookies),
    controlUnlocks: { purchasedRungIds },
  });
  write(dir, "graphics-before", stateFor(0, []));
  write(dir, "graphics-affordable", stateFor(50, []));
  write(dir, "graphics-after", stateFor(0, ["look.palette", "look.cabinet"]));
});
