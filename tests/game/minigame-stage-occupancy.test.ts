import { describe, expect, it } from 'vitest';

import { EMPTY_MINIGAME_STATE, minigameOccupiesStage } from '../../src/shared/game/minigames.js';

/**
 * `EMPTY_MINIGAME_STATE` has no `active` key at all, so on a fresh save `state.minigames.active` is
 * `undefined` and never `null`. Three callers asked whether a minigame was holding the stage, two
 * with a truthiness check and one with `active !== null` — and `undefined !== null` is `true`.
 *
 * That one caller sat in `handleTick`, computing `blocked` for the random-event scheduler. It read
 * `true` on the very first tick of a brand-new save and on every tick after it, so random events
 * and Mouse Raids could never spawn at all. Not rarely — never, for the whole life of the feature.
 *
 * The undefined case is therefore the assertion that matters here. A test that only covered `null`
 * and a real board would have passed against the broken code.
 */
describe('minigame stage occupancy', () => {
  const board = (status: string) => ({
    id: 'klondike',
    status,
    startedAtEpochMs: 0,
    lastUpdatedAtEpochMs: 0,
    data: { kind: 'klondike' },
  }) as never;

  it('reports an empty suite as not occupying the stage', () => {
    // The exact shape a fresh save carries. This is the case the old comparison got wrong.
    expect(EMPTY_MINIGAME_STATE).not.toHaveProperty('active');
    expect(minigameOccupiesStage(EMPTY_MINIGAME_STATE.active)).toBe(false);
    expect(minigameOccupiesStage(undefined)).toBe(false);
    expect(minigameOccupiesStage(null as never)).toBe(false);
  });

  it('reports a board being played or minimised as occupying the stage', () => {
    expect(minigameOccupiesStage(board('active'))).toBe(true);
    expect(minigameOccupiesStage(board('minimized'))).toBe(true);
  });

  it('reports a finished board as no longer occupying the stage', () => {
    // A completed or abandoned board must not keep blocking random events forever.
    expect(minigameOccupiesStage(board('completed'))).toBe(false);
    expect(minigameOccupiesStage(board('abandoned'))).toBe(false);
  });

  it('is the single answer every caller uses', async () => {
    // Three callers each answering this question their own way is how one of them came to disagree
    // with the other two for the life of the feature. Assert the reducer routes all three here, and
    // anchor to a line so a commented-out call cannot satisfy it.
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const source = readFileSync(resolve('src/shared/game/reducer.ts'), 'utf8').replaceAll('\r\n', '\n');
    const calls = source.split('\n').filter((line) => /^\s*(?:if \(|.*blocked:).*minigameOccupiesStage\(/.test(line));
    expect(calls.length).toBeGreaterThanOrEqual(3);
    // The comparison that caused this must not come back in any form.
    expect(source).not.toMatch(/^\s*.*minigames\.active !== null/m);
  });
});
