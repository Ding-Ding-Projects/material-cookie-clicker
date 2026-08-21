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
 *   • after       — `look.palette` and `look.cabinet` already owned, so the shell has moved past
 *                   the one-button `cookie-only` stage (see look-tiers.ts#lookStage).
 *
 *                   It carries a LEFTOVER BALANCE on purpose. This seed used to sit at exactly 0,
 *                   which was incidental -- it had spent everything on the two rungs. Once a zero
 *                   balance began collapsing the shell back to a bare cookie whatever is owned,
 *                   a 0-cookie seed rendered the cookie-only stage and the capture stopped showing
 *                   the thing it exists to show. The state this depicts is "the graphics are
 *                   bought", and a player who just bought them is not required to be broke.
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
  ["after", stateFor(120, ["look.palette", "look.cabinet"])],
];

for (const [name, state] of cases) {
  it(`seeds the ${name} graphics-progression save`, () => {
    writeFileSync(`${dir}/${name}.json`, JSON.stringify(encodeSave(state)), "utf8");
  });
}
