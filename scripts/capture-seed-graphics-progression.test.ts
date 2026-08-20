import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { it } from "vitest";

import { bnFromNumber } from "../src/shared/game/big-number.js";
import { encodeSave } from "../src/shared/game/save-codec.js";
import { createInitialGameState } from "../src/shared/game/reducer.js";
import type { GameState } from "../src/shared/game/types.js";

/**
 * CAPTURE HARNESS, not a test — same idiom as `capture-seed-plain-look.test.ts`. It lives under
 * `scripts/` so `npm test` (which runs `vitest run tests`) never executes it.
 *
 * Writes the three saves the `look` ladder receipt needs, one per completeness-inventory state:
 *
 *   • before      — 0 cookies, nothing owned. The first rung is not even affordable.
 *   • affordable  — 50 cookies (exactly `look.palette`'s price), nothing owned yet.
 *   • after       — 0 cookies, `look.palette` and `look.cabinet` already owned, so the shell has
 *                   moved past the one-button `cookie-only` stage (see look-tiers.ts#lookStage).
 *
 * Run it on purpose:
 *   CAPTURE_DIR=<dir> npx vitest run scripts/capture-seed-graphics-progression.test.ts
 */
function stateFor(cookies: number, purchasedRungIds: readonly string[]): GameState {
  const now = new Date().toISOString();
  return {
    ...createInitialGameState(now),
    cookies: bnFromNumber(cookies),
    lifetimeCookies: bnFromNumber(cookies),
    controlUnlocks: { purchasedRungIds },
  };
}

const dir = process.env.CAPTURE_DIR ?? "captures/tmp/graphics-progression";
mkdirSync(dir, { recursive: true });

const cases: Array<[string, GameState]> = [
  ["before", stateFor(0, [])],
  ["affordable", stateFor(50, [])],
  ["after", stateFor(0, ["look.palette", "look.cabinet"])],
];

for (const [name, state] of cases) {
  it(`seeds the ${name} graphics-progression save`, () => {
    writeFileSync(`${dir}/${name}.json`, JSON.stringify(encodeSave(state)), "utf8");
  });
}
