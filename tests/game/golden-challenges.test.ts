import { describe, expect, it } from 'vitest';

import { createSplitMix32Rng } from '../../src/shared/game/golden-cookie.js';
import {
  DEFAULT_GOLDEN_CHALLENGE_ID,
  GOLDEN_CHALLENGES,
  evaluateGoldenChallengePress,
  getGoldenChallenge,
  rollGoldenChallenge,
  rollGoldenChallengeTarget,
  type GoldenChallengeFamily,
} from '../../src/shared/game/golden-challenges.js';

/**
 * The owner asked for "at least 50 types" of golden cookie challenge, "randomize each every time,
 * not just stop the bar".
 *
 * The count is the easy half and the cheap thing to fake, so these tests go after the part that
 * matters: that the fifty are genuinely DISTINCT, that all five families are really reachable, and
 * that each family's rule actually rejects a wrong answer. A registry of fifty reskins of the dial
 * would pass a count assertion and fail every one of the behavioural ones below.
 */
describe('golden cookie challenges', () => {
  it('ships at least fifty challenges', () => {
    expect(GOLDEN_CHALLENGES.length).toBeGreaterThanOrEqual(50);
  });

  it('gives every challenge a unique id, and never reuses one', () => {
    // Ids are persisted in saves, so a duplicate would make two challenges indistinguishable on
    // reload and silently hand the player the wrong one.
    const ids = GOLDEN_CHALLENGES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers all five families, with real depth in each', () => {
    const counts = new Map<GoldenChallengeFamily, number>();
    for (const c of GOLDEN_CHALLENGES) counts.set(c.family, (counts.get(c.family) ?? 0) + 1);
    expect([...counts.keys()].sort()).toEqual(['dial', 'hold', 'mash', 'pick', 'sequence']);
    // "Not just stop the bar": no single family may dominate the table.
    for (const [family, count] of counts) {
      expect(count, `${family} needs real depth`).toBeGreaterThanOrEqual(5);
      expect(count / GOLDEN_CHALLENGES.length, `${family} must not dominate`).toBeLessThan(0.5);
    }
  });

  it('makes every challenge genuinely distinct, not a renamed twin', () => {
    // The assertion that actually resists padding: no two challenges may share a family AND every
    // difficulty parameter AND their round count. Fifty entries that differ only by name would
    // fail here, which is exactly the point.
    const shapes = GOLDEN_CHALLENGES.map(
      (c) => `${c.family}|${c.rounds}|${Object.entries(c.params).sort().map(([k, v]) => `${k}=${v}`).join(',')}`,
    );
    expect(new Set(shapes).size).toBe(shapes.length);
  });

  it('names every challenge in both languages', () => {
    for (const c of GOLDEN_CHALLENGES) {
      expect(c.nameEn.trim().length, c.id).toBeGreaterThan(0);
      expect(c.nameYue.trim().length, c.id).toBeGreaterThan(0);
      // A Cantonese name that is just the English one is not a translation.
      expect(c.nameYue, c.id).not.toBe(c.nameEn);
    }
  });

  it('gives every challenge the parameters its own family reads', () => {
    const required: Record<GoldenChallengeFamily, readonly string[]> = {
      dial: ['sweepMs', 'zoneHalfWidth'],
      mash: ['presses', 'windowMs'],
      hold: ['targetMs', 'toleranceMs'],
      sequence: ['length', 'symbols'],
      pick: ['options'],
    };
    for (const c of GOLDEN_CHALLENGES) {
      for (const key of required[c.family]) {
        expect(c.params[key], `${c.id} is missing ${key}`).toBeGreaterThan(0);
      }
      expect(c.rounds, c.id).toBeGreaterThanOrEqual(1);
    }
  });

  describe('rolling', () => {
    it('reaches every single challenge over enough draws', () => {
      // "Randomize each every time" is worth nothing if a subset is unreachable — an off-by-one in
      // the index arithmetic would silently strand the last entry forever.
      const seen = new Set<string>();
      const rng = createSplitMix32Rng(20260821, 0);
      for (let i = 0; i < 20_000; i += 1) seen.add(rollGoldenChallenge(rng).id);
      expect(seen.size).toBe(GOLDEN_CHALLENGES.length);
    });

    it('is deterministic for a given seed, so a save reloads the same challenge', () => {
      const a = Array.from({ length: 12 }, (_, i) => rollGoldenChallenge(createSplitMix32Rng(7, i)).id);
      const b = Array.from({ length: 12 }, (_, i) => rollGoldenChallenge(createSplitMix32Rng(7, i)).id);
      expect(a).toEqual(b);
    });

    it('does not hand out the same challenge every time', () => {
      const rng = createSplitMix32Rng(99, 0);
      const drawn = new Set(Array.from({ length: 40 }, () => rollGoldenChallenge(rng).id));
      expect(drawn.size).toBeGreaterThan(5);
    });
  });

  describe('targets', () => {
    it('rolls a sequence of the declared length, using only declared symbols', () => {
      const rng = createSplitMix32Rng(11, 0);
      for (const c of GOLDEN_CHALLENGES.filter((x) => x.family === 'sequence')) {
        const target = rollGoldenChallengeTarget(c, rng);
        expect(target.length, c.id).toBe(c.params.length);
        for (const symbol of target) {
          expect(symbol, c.id).toBeGreaterThanOrEqual(0);
          expect(symbol, c.id).toBeLessThan(c.params.symbols);
        }
      }
    });

    it('rolls a pick answer that is always a real option', () => {
      const rng = createSplitMix32Rng(12, 0);
      for (const c of GOLDEN_CHALLENGES.filter((x) => x.family === 'pick')) {
        for (let i = 0; i < 50; i += 1) {
          const [answer] = rollGoldenChallengeTarget(c, rng);
          expect(answer, c.id).toBeGreaterThanOrEqual(0);
          expect(answer, c.id).toBeLessThan(c.params.options);
        }
      }
    });
  });

  describe('evaluation', () => {
    const find = (id: string) => getGoldenChallenge(id);

    it('dial: hits inside the zone and misses outside it, on a linear track', () => {
      const c = find('dial.oven');
      const half = c.params.zoneHalfWidth;
      const at = (needlePosition: number, zoneCentre: number) =>
        evaluateGoldenChallengePress(c, { elapsedMs: 0, progress: 0, target: [], needlePosition, zoneCentre });
      expect(at(0.5, 0.5).hit).toBe(true);
      expect(at(0.5 + half / 2, 0.5).hit).toBe(true);
      expect(at(0.5 + half * 2, 0.5).hit).toBe(false);
      /**
       * The track does NOT wrap, and an earlier version of this test asserted that it did.
       *
       * The dial is a there-and-back sweep along a line, and `rollZoneCentre` clamps the zone so it
       * never touches either end — so treating the ends as adjacent would quietly widen every zone
       * near them, making the hardest placements the most forgiving. A needle at 0.99 is as far as
       * possible from a zone at 0.01, and must miss.
       */
      expect(at(0.99, 0.01).hit).toBe(false);
    });

    it('mash: counts presses and finishes at the target, but not after the window closes', () => {
      const c = find('mash.crumbs');
      let progress = 0;
      for (let i = 1; i < c.params.presses; i += 1) {
        const out = evaluateGoldenChallengePress(c, { elapsedMs: 100, progress, target: [] });
        expect(out.hit).toBe(true);
        expect(out.roundComplete).toBe(false);
        progress = out.progress;
      }
      const last = evaluateGoldenChallengePress(c, { elapsedMs: 200, progress, target: [] });
      expect(last.roundComplete).toBe(true);
      // A press after the window is not a hit, and must not advance progress.
      const late = evaluateGoldenChallengePress(c, { elapsedMs: c.params.windowMs + 1, progress: 3, target: [] });
      expect(late.hit).toBe(false);
      expect(late.progress).toBe(3);
    });

    it('hold: fails BOTH too short and too long, which is the whole point of the family', () => {
      const c = find('hold.steep');
      const { targetMs, toleranceMs } = c.params;
      const held = (heldMs: number) =>
        evaluateGoldenChallengePress(c, { elapsedMs: heldMs, progress: 0, target: [], input: { heldMs } }).hit;
      expect(held(targetMs)).toBe(true);
      expect(held(targetMs - toleranceMs + 1)).toBe(true);
      expect(held(targetMs + toleranceMs - 1)).toBe(true);
      expect(held(targetMs - toleranceMs - 50)).toBe(false);
      expect(held(targetMs + toleranceMs + 50)).toBe(false);
    });

    it('sequence: advances on the right symbol and resets on the wrong one', () => {
      const c = find('seq.recipe3');
      const target = [1, 2, 0];
      const press = (progress: number, value: number) =>
        evaluateGoldenChallengePress(c, { elapsedMs: 0, progress, target, input: { value } });
      expect(press(0, 1)).toMatchObject({ hit: true, progress: 1, roundComplete: false });
      expect(press(1, 2)).toMatchObject({ hit: true, progress: 2, roundComplete: false });
      expect(press(2, 0)).toMatchObject({ hit: true, progress: 3, roundComplete: true });
      // A wrong symbol resets, so the round cannot be brute-forced by pressing everything.
      expect(press(1, 0)).toMatchObject({ hit: false, progress: 0 });
    });

    it('pick: accepts only the rolled option', () => {
      const c = find('pick.four');
      const target = [2];
      const pick = (value: number) =>
        evaluateGoldenChallengePress(c, { elapsedMs: 0, progress: 0, target, input: { value } }).hit;
      expect(pick(2)).toBe(true);
      for (const wrong of [0, 1, 3]) expect(pick(wrong)).toBe(false);
    });
  });

  describe('lookup', () => {
    it('falls back to the Oven Dial rather than throwing on an unknown id', () => {
      // A save can legitimately name a challenge this build does not have. Losing a golden cookie
      // the player already caught is far worse than playing a different challenge for it.
      expect(getGoldenChallenge('nonsense.that.never.shipped').id).toBe(DEFAULT_GOLDEN_CHALLENGE_ID);
      expect(getGoldenChallenge(undefined).id).toBe(DEFAULT_GOLDEN_CHALLENGE_ID);
    });

    it('returns the exact challenge for every id it ships', () => {
      for (const c of GOLDEN_CHALLENGES) expect(getGoldenChallenge(c.id)).toBe(c);
    });
  });
});
