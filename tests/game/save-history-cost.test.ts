import { describe, expect, it } from 'vitest';

import { bnFromNumber, bnToNumber } from '../../src/shared/game/big-number.js';
import { totalCps } from '../../src/shared/game/cps.js';
import { createInitialGameState } from '../../src/shared/game/reducer.js';
import {
  RESTORE_COST_FRACTION,
  applyRestoreCost,
  saveRestoreCost,
} from '../../src/shared/game/save-history-cost.js';
import type { GameState } from '../../src/shared/game/types.js';

/**
 * Restoring a deleted save costs half of what that save produced per second.
 *
 * The cost is charged against the ARCHIVED save rather than the player's current balance, because
 * the current run is usually a fresh one with nothing in it -- billing that would make the restore
 * either free or impossible, and neither is a price.
 */
describe('save restore cost', () => {
  const base = createInitialGameState(new Date(0).toISOString());

  /**
   * A save with real production, so the cost is not trivially zero.
   *
   * A fresh state owns NO generators at all -- `generators` starts empty -- so this adds a real
   * one rather than mapping over an empty list, which is what an earlier version of this helper
   * did and why it silently produced nothing.
   *
   * Grandmas, because their base rate is exactly 1/second: `grandmas` is then the state's whole
   * cookies-per-second, which keeps every expected value in these tests readable by hand.
   */
  function producing(grandmas: number, cookies: number): GameState {
    return {
      ...base,
      generators: [{ id: 'grandma', count: grandmas }],
      cookies: bnFromNumber(cookies),
    };
  }

  it('charges exactly half of production, floored', () => {
    const save = producing(100, 10_000);
    const cps = bnToNumber(totalCps(save));
    expect(cps).toBeGreaterThan(0);
    expect(bnToNumber(saveRestoreCost(save))).toBe(Math.floor(cps * RESTORE_COST_FRACTION));
  });

  it('costs nothing to restore a save that produced nothing', () => {
    // A save deleted before any generator was bought is handed back whole. There is nothing to
    // charge half of, and inventing a floor price would punish the smallest possible loss.
    const idle = { ...base, cookies: bnFromNumber(500) };
    expect(bnToNumber(totalCps(idle))).toBe(0);
    expect(bnToNumber(saveRestoreCost(idle))).toBe(0);
    expect(bnToNumber(applyRestoreCost(idle).cookies)).toBe(500);
  });

  it('hands back the save minus its own cost and changes nothing else', () => {
    const save = producing(100, 10_000);
    const cost = bnToNumber(saveRestoreCost(save));
    const restored = applyRestoreCost(save);
    expect(bnToNumber(restored.cookies)).toBe(10_000 - cost);
    // Everything that made the save worth restoring survives the charge.
    expect(restored.generators).toEqual(save.generators);
    expect(restored.upgrades).toEqual(save.upgrades);
    expect(restored.achievements).toEqual(save.achievements);
    expect(bnToNumber(totalCps(restored))).toBe(bnToNumber(totalCps(save)));
  });

  it('still restores a save whose production outruns its balance, arriving empty', () => {
    // The one promise the feature makes is that a deleted save can ALWAYS come back. A save with a
    // huge engine and an empty till arrives at zero rather than being refused.
    const spent = producing(100_000, 1);
    expect(bnToNumber(saveRestoreCost(spent))).toBeGreaterThan(1);
    expect(bnToNumber(applyRestoreCost(spent).cookies)).toBe(0);
  });

  it('never charges more than half, which is why the cost is floored rather than rounded', () => {
    const save = producing(3, 1_000);
    const cps = bnToNumber(totalCps(save));
    expect(bnToNumber(saveRestoreCost(save))).toBeLessThanOrEqual(cps * RESTORE_COST_FRACTION);
  });
});
