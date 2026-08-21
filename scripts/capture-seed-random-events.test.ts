import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { it } from "vitest";

import { bnFromNumber } from "../src/shared/game/big-number.js";
import { encodeSave } from "../src/shared/game/save-codec.js";
import { createInitialGameState } from "../src/shared/game/reducer.js";
import { ALL_CONTROL_RUNG_IDS } from "../src/shared/game/control-unlocks.js";
import { createSeededRng } from "../src/shared/game/minigames.js";
import { tickRandomEvents } from "../src/shared/game/random-events.js";
import type { GameState } from "../src/shared/game/types.js";

/**
 * CAPTURE HARNESS, not a test — under `scripts/` so `npm test` (which runs `vitest run tests`)
 * never executes it.
 *
 * Writes saves carrying a LIVE random event, for the two release-capture states that need one:
 * `event-pool-remaining` and `raid-reduced-motion`.
 *
 * These two were unreachable until today, and not because the harness was missing. `handleTick`
 * computed `blocked: goldenCookie.isSpawned || minigames.active !== null`, and `EMPTY_MINIGAME_STATE`
 * has no `active` key at all — so `undefined !== null` was `true` and the random-event scheduler was
 * blocked on every tick of every save, forever. No event could ever spawn to be photographed.
 * With that fixed, this harness reaches the states the ordinary way: it drives the REAL
 * `tickRandomEvents` until an event actually spawns, rather than hand-assembling one and hoping the
 * decoder accepts it.
 *
 * Run it on purpose:
 *   CAPTURE_DIR=<dir> npx vitest run scripts/capture-seed-random-events.test.ts
 */

const dir = process.env.CAPTURE_DIR ?? "captures/tmp/random-events";

function write(name: string, state: GameState): void {
  const target = resolve(dir, name);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(encodeSave(state)), "utf8");
}

/** Lifetime production past the Mouse Raid threshold, so the whole pool is eligible. */
function raidCapableState(): GameState {
  const base = createInitialGameState(new Date(0).toISOString());
  // The raid gate reads stats.totalCookiesBaked, NOT lifetimeCookies — setting only the latter
  // leaves areMouseRaidsUnlocked false and the raid simply never becomes eligible, which is a
  // silent "nothing happened" rather than an error.
  return {
    ...base,
    cookies: bnFromNumber(5_000_000),
    lifetimeCookies: bnFromNumber(5_000_000),
    stats: { ...base.stats, totalCookiesBaked: bnFromNumber(5_000_000) },
    // Without the control rungs the window renders the bare cookie-only shell whatever the save
    // holds, so a raid would be live in state and invisible on screen — a capture of the opening
    // composition wearing a raid's label. Buy every rung so the raid stage is actually rendered.
    controlUnlocks: { purchasedRungIds: [...ALL_CONTROL_RUNG_IDS] },
  };
}

/**
 * Advance the real scheduler until it spawns something, or give up honestly.
 *
 * `blocked: false` here is the whole point: it is what `handleTick` now passes on an empty suite,
 * and what it wrongly passed as `true` before. Nothing else is faked — the event that appears is
 * the one the real pool and the real seeded stream chose.
 */
function driveUntil(state: GameState, want: (ids: readonly string[]) => boolean, label: string, attempts = 200_000): GameState {
  const rng = createSeededRng(20260821, 0);
  let events = state.randomEvents;
  let nowMs = 0;
  for (let step = 0; step < attempts; step += 1) {
    nowMs += 1_000;
    const result = tickRandomEvents(events, { ...state, randomEvents: events }, nowMs, rng, {
      blocked: false,
      hidden: false,
    } as never);
    events = result.randomEvents;
    if (want(events.actives.map((active) => active.id))) return { ...state, randomEvents: events };
  }
  throw new Error(
    `${label} did not occur in ${attempts} simulated seconds. If NOTHING at all spawned, that is the ` +
      `shape of the defect this harness sits downstream of — check whether handleTick is passing ` +
      `blocked:true again.`,
  );
}

it("writes a save carrying any live random event", () => {
  write("event-live.json", driveUntil(raidCapableState(), (ids) => ids.length > 0, "A random event"));
});

/**
 * Move a spawned event's timestamps onto the real wall clock.
 *
 * The drive loop above runs on a simulated clock starting at zero, so a raid it finds ends somewhere
 * in 1970. Every timestamp in this game is wall-clock epoch milliseconds, so such a save loads into
 * an app that immediately expires the raid — and the capture shows the aftermath toast rather than a
 * raid in progress, which is a different screen wearing the same label.
 */
function makeLive(state: GameState): GameState {
  const active = state.randomEvents.actives[0];
  if (!active) throw new Error("makeLive was handed a save with no active event");
  const shift = Date.now() + 60_000 - active.endsAtEpochMs;
  return {
    ...state,
    randomEvents: {
      ...state.randomEvents,
      actives: state.randomEvents.actives.map((event) => ({
        ...event,
        startedAtEpochMs: event.startedAtEpochMs + shift,
        endsAtEpochMs: event.endsAtEpochMs + shift,
      })),
    },
  };
}

it("writes a save carrying a live Mouse Raid", () => {
  // A raid is drawn on its own cadence rather than from the ordinary pool, so this needs a much
  // longer run than "any event at all". It is still the REAL scheduler choosing it.
  write("raid-live.json", makeLive(driveUntil(raidCapableState(), (ids) => ids.includes("mouse_raid"), "A Mouse Raid")));
});
