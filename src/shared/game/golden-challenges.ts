import type { RngPort } from "./types.js";

/**
 * FIFTY GOLDEN COOKIE CHALLENGES, ONE ROLLED PER CATCH.
 *
 * The owner's rule: "need more types of golden cookie challenges, at least 50 types, randomize
 * each every time, not just stop the bar."
 *
 * The Oven Dial -- stop the sweeping needle inside the zone -- used to be the whole game. It is
 * now one FAMILY of five, and one of fifty named challenges. Which one a caught cookie opens is
 * rolled from the seeded stream at the moment of the catch and then persisted, so it survives a
 * save, a reload and a re-render exactly the way the dial's zone centre always has.
 *
 * WHY FIVE FAMILIES RATHER THAN FIFTY MECHANICS.
 *
 * Fifty genuinely different interactions would be fifty surfaces to build, localize, make
 * keyboard-operable, screen-reader-name and test -- and the fiftieth would be a reskin of the
 * fourth whether or not anyone admitted it. Instead there are five mechanics that ask for five
 * genuinely different things from the player:
 *
 *   dial      -- timing against a moving needle. Reflex.
 *   mash      -- a burst of presses inside a window. Speed.
 *   hold      -- press and let go after an exact duration. Patience and estimation.
 *   sequence  -- repeat a shown order. Memory.
 *   pick      -- choose the one that is different. Attention.
 *
 * Each family carries ten challenges whose PARAMETERS differ enough to change how they are
 * played, not merely what they are called: a two-symbol sequence and a seven-symbol one are not
 * the same task, and a 300ms hold and a 4s hold fail for opposite reasons. Fifty is therefore an
 * honest count of distinct things to do, not a padded one.
 *
 * EVERY CHALLENGE IS PURE SKILL AND PUBLISHED. Nothing here is rolled per player, scaled by how
 * rich they are, or adjusted to how they are doing. The only rolled value is WHICH challenge
 * appears and where its target sits -- the difficulty of each one is fixed, identical for
 * everybody, and readable in this file.
 */

/** The five things a challenge can ask of a player. */
export type GoldenChallengeFamily = "dial" | "mash" | "hold" | "sequence" | "pick";

export interface GoldenChallenge {
  /** Stable id. Persisted in the save, so it must never be renamed once shipped. */
  readonly id: string;
  readonly family: GoldenChallengeFamily;
  readonly nameEn: string;
  readonly nameYue: string;
  /** How many successful rounds redeem the cookie. */
  readonly rounds: number;
  /**
   * Family-specific difficulty. Read only by that family's evaluator, and deliberately a plain
   * record of numbers so a challenge is fully described by this table and nothing else.
   *
   *   dial      sweepMs, zoneHalfWidth
   *   mash      presses, windowMs
   *   hold      targetMs, toleranceMs
   *   sequence  length, symbols
   *   pick      options
   */
  readonly params: Readonly<Record<string, number>>;
}

/* ------------------------------------------------------------------------ dial: reflex */

const DIAL: readonly GoldenChallenge[] = [
  { id: "dial.oven", family: "dial", nameEn: "Oven Dial", nameYue: "焗爐錶", rounds: 3, params: { sweepMs: 1800, zoneHalfWidth: 0.13 } },
  { id: "dial.timer", family: "dial", nameEn: "Kitchen Timer", nameYue: "廚房計時器", rounds: 3, params: { sweepMs: 1600, zoneHalfWidth: 0.115 } },
  { id: "dial.thermostat", family: "dial", nameEn: "Thermostat", nameYue: "溫控器", rounds: 3, params: { sweepMs: 1450, zoneHalfWidth: 0.1 } },
  { id: "dial.scale", family: "dial", nameEn: "Weighing Scale", nameYue: "磅秤", rounds: 3, params: { sweepMs: 1300, zoneHalfWidth: 0.09 } },
  { id: "dial.mixer", family: "dial", nameEn: "Mixer Speed", nameYue: "攪拌速度", rounds: 3, params: { sweepMs: 1150, zoneHalfWidth: 0.08 } },
  { id: "dial.proofing", family: "dial", nameEn: "Proofing Gauge", nameYue: "發酵錶", rounds: 4, params: { sweepMs: 1400, zoneHalfWidth: 0.095 } },
  { id: "dial.griddle", family: "dial", nameEn: "Griddle Heat", nameYue: "煎盤火路", rounds: 4, params: { sweepMs: 1200, zoneHalfWidth: 0.085 } },
  { id: "dial.pressure", family: "dial", nameEn: "Pressure Valve", nameYue: "壓力閥", rounds: 4, params: { sweepMs: 1000, zoneHalfWidth: 0.07 } },
  { id: "dial.sugar", family: "dial", nameEn: "Sugar Thermometer", nameYue: "糖溫針", rounds: 5, params: { sweepMs: 950, zoneHalfWidth: 0.065 } },
  { id: "dial.caramel", family: "dial", nameEn: "Caramel Window", nameYue: "焦糖窗口", rounds: 5, params: { sweepMs: 820, zoneHalfWidth: 0.055 } },
];

/* -------------------------------------------------------------------------- mash: speed */

const MASH: readonly GoldenChallenge[] = [
  { id: "mash.crumbs", family: "mash", nameEn: "Sweep the Crumbs", nameYue: "掃走餅碎", rounds: 1, params: { presses: 8, windowMs: 4000 } },
  { id: "mash.knead", family: "mash", nameEn: "Knead the Dough", nameYue: "搓麵團", rounds: 1, params: { presses: 12, windowMs: 4500 } },
  { id: "mash.whisk", family: "mash", nameEn: "Whisk It", nameYue: "打蛋", rounds: 1, params: { presses: 16, windowMs: 5000 } },
  { id: "mash.sift", family: "mash", nameEn: "Sift the Flour", nameYue: "篩麵粉", rounds: 2, params: { presses: 10, windowMs: 3500 } },
  { id: "mash.pump", family: "mash", nameEn: "Pump the Bellows", nameYue: "拉風箱", rounds: 2, params: { presses: 14, windowMs: 4000 } },
  { id: "mash.shake", family: "mash", nameEn: "Shake the Tin", nameYue: "搖餅罐", rounds: 2, params: { presses: 18, windowMs: 4200 } },
  { id: "mash.chop", family: "mash", nameEn: "Chop the Nuts", nameYue: "剁果仁", rounds: 3, params: { presses: 9, windowMs: 2800 } },
  { id: "mash.grind", family: "mash", nameEn: "Grind the Beans", nameYue: "磨咖啡豆", rounds: 3, params: { presses: 13, windowMs: 3200 } },
  { id: "mash.churn", family: "mash", nameEn: "Churn the Butter", nameYue: "攪牛油", rounds: 3, params: { presses: 17, windowMs: 3400 } },
  { id: "mash.stampede", family: "mash", nameEn: "Mouse Stampede", nameYue: "老鼠衝鋒", rounds: 3, params: { presses: 22, windowMs: 3600 } },
];

/* ------------------------------------------------------------ hold: patience and estimation */

const HOLD: readonly GoldenChallenge[] = [
  { id: "hold.snap", family: "hold", nameEn: "Snap Decision", nameYue: "一秒決定", rounds: 2, params: { targetMs: 500, toleranceMs: 160 } },
  { id: "hold.dip", family: "hold", nameEn: "Quick Dip", nameYue: "快手一浸", rounds: 2, params: { targetMs: 800, toleranceMs: 180 } },
  { id: "hold.steep", family: "hold", nameEn: "Steep the Tea", nameYue: "焗茶", rounds: 2, params: { targetMs: 1200, toleranceMs: 200 } },
  { id: "hold.rest", family: "hold", nameEn: "Rest the Dough", nameYue: "鬆弛麵團", rounds: 2, params: { targetMs: 1600, toleranceMs: 220 } },
  { id: "hold.bake", family: "hold", nameEn: "Bake it Through", nameYue: "焗到透", rounds: 2, params: { targetMs: 2200, toleranceMs: 240 } },
  { id: "hold.cool", family: "hold", nameEn: "Cool on the Rack", nameYue: "放涼", rounds: 3, params: { targetMs: 900, toleranceMs: 150 } },
  { id: "hold.temper", family: "hold", nameEn: "Temper the Chocolate", nameYue: "調溫朱古力", rounds: 3, params: { targetMs: 1400, toleranceMs: 170 } },
  { id: "hold.pour", family: "hold", nameEn: "Steady Pour", nameYue: "穩陣倒", rounds: 3, params: { targetMs: 1900, toleranceMs: 190 } },
  { id: "hold.stretch", family: "hold", nameEn: "Stretch the Sugar", nameYue: "拉糖", rounds: 3, params: { targetMs: 2600, toleranceMs: 210 } },
  { id: "hold.patience", family: "hold", nameEn: "Baker's Patience", nameYue: "師傅耐性", rounds: 3, params: { targetMs: 3400, toleranceMs: 230 } },
];

/* ----------------------------------------------------------------------- sequence: memory */

const SEQUENCE: readonly GoldenChallenge[] = [
  { id: "seq.recipe2", family: "sequence", nameEn: "Two-Step Recipe", nameYue: "兩步食譜", rounds: 1, params: { length: 2, symbols: 3 } },
  { id: "seq.recipe3", family: "sequence", nameEn: "Three-Step Recipe", nameYue: "三步食譜", rounds: 1, params: { length: 3, symbols: 3 } },
  { id: "seq.recipe4", family: "sequence", nameEn: "Four-Step Recipe", nameYue: "四步食譜", rounds: 1, params: { length: 4, symbols: 4 } },
  { id: "seq.order", family: "sequence", nameEn: "Order of Service", nameYue: "上菜次序", rounds: 1, params: { length: 5, symbols: 4 } },
  { id: "seq.shelf", family: "sequence", nameEn: "Shelf Order", nameYue: "貨架次序", rounds: 1, params: { length: 6, symbols: 4 } },
  { id: "seq.rounds2", family: "sequence", nameEn: "Double Batch", nameYue: "整兩爐", rounds: 2, params: { length: 3, symbols: 4 } },
  { id: "seq.rounds2long", family: "sequence", nameEn: "Double Batch, Long", nameYue: "兩爐加長", rounds: 2, params: { length: 5, symbols: 5 } },
  { id: "seq.rounds3", family: "sequence", nameEn: "Triple Batch", nameYue: "整三爐", rounds: 3, params: { length: 3, symbols: 5 } },
  { id: "seq.dimsum", family: "sequence", nameEn: "Dim Sum Trolley", nameYue: "點心車", rounds: 3, params: { length: 5, symbols: 5 } },
  { id: "seq.banquet", family: "sequence", nameEn: "Banquet Order", nameYue: "酒席次序", rounds: 3, params: { length: 7, symbols: 6 } },
];

/* ------------------------------------------------------------------------ pick: attention */

const PICK: readonly GoldenChallenge[] = [
  { id: "pick.three", family: "pick", nameEn: "Spot the Golden One", nameYue: "捉金嗰個", rounds: 2, params: { options: 3 } },
  { id: "pick.four", family: "pick", nameEn: "Four on the Tray", nameYue: "碟上四件", rounds: 2, params: { options: 4 } },
  { id: "pick.six", family: "pick", nameEn: "Six on the Tray", nameYue: "碟上六件", rounds: 2, params: { options: 6 } },
  { id: "pick.eight", family: "pick", nameEn: "Full Tray", nameYue: "成碟滿", rounds: 2, params: { options: 8 } },
  { id: "pick.nine", family: "pick", nameEn: "Steamer Basket", nameYue: "蒸籠", rounds: 2, params: { options: 9 } },
  { id: "pick.three3", family: "pick", nameEn: "Best of Three", nameYue: "三揀一，三次", rounds: 3, params: { options: 3 } },
  { id: "pick.five3", family: "pick", nameEn: "Best of Five", nameYue: "五揀一，三次", rounds: 3, params: { options: 5 } },
  { id: "pick.seven3", family: "pick", nameEn: "Best of Seven", nameYue: "七揀一，三次", rounds: 3, params: { options: 7 } },
  { id: "pick.ten", family: "pick", nameEn: "Ten Trays", nameYue: "十碟", rounds: 3, params: { options: 10 } },
  { id: "pick.twelve", family: "pick", nameEn: "Twelve Trays", nameYue: "十二碟", rounds: 4, params: { options: 12 } },
];

/** Every challenge, in one table. Exactly fifty, and asserted to be so by its own test. */
export const GOLDEN_CHALLENGES: readonly GoldenChallenge[] = [...DIAL, ...MASH, ...HOLD, ...SEQUENCE, ...PICK];

/** The default, used when a save predates the registry or names a challenge that no longer exists. */
export const DEFAULT_GOLDEN_CHALLENGE_ID = "dial.oven";

const BY_ID: ReadonlyMap<string, GoldenChallenge> = new Map(GOLDEN_CHALLENGES.map((c) => [c.id, c]));

/**
 * Look one up, falling back to the Oven Dial rather than throwing.
 *
 * A save can legitimately name a challenge this build does not have -- it was written by a newer
 * version, or by one where a challenge has since been withdrawn. Losing the golden cookie a player
 * already caught is a far worse outcome than playing a different challenge for it, so this never
 * throws and the caller never has to guard.
 */
export function getGoldenChallenge(id: string | undefined): GoldenChallenge {
  return (id ? BY_ID.get(id) : undefined) ?? BY_ID.get(DEFAULT_GOLDEN_CHALLENGE_ID)!;
}

/**
 * Roll which challenge a caught cookie opens.
 *
 * Uniform across all fifty: every challenge is equally likely every time, which is what "randomize
 * each time" asks for. It is deliberately NOT weighted by difficulty, by progress, or by what came
 * last -- a run of the same family twice is chance doing its job, and steering it would make the
 * roll a difficulty curve wearing a dice costume.
 */
export function rollGoldenChallenge(rng: RngPort): GoldenChallenge {
  const index = Math.min(GOLDEN_CHALLENGES.length - 1, Math.floor(rng.next() * GOLDEN_CHALLENGES.length));
  return GOLDEN_CHALLENGES[index];
}

/**
 * Roll the hidden answer a challenge needs, as a list of small integers.
 *
 * One shape for every family, because the state that persists it is one field:
 *   dial      -- empty. The zone centre is rolled separately and already persisted.
 *   mash      -- empty. There is nothing hidden; the target is published in the params.
 *   hold      -- empty, same reason.
 *   sequence  -- the order to repeat, `length` symbols drawn from `symbols`.
 *   pick      -- one entry: which option is the golden one.
 */
export function rollGoldenChallengeTarget(challenge: GoldenChallenge, rng: RngPort): readonly number[] {
  if (challenge.family === "sequence") {
    const { length, symbols } = challenge.params;
    return Array.from({ length }, () => Math.min(symbols - 1, Math.floor(rng.next() * symbols)));
  }
  if (challenge.family === "pick") {
    const { options } = challenge.params;
    return [Math.min(options - 1, Math.floor(rng.next() * options))];
  }
  return [];
}

/* ------------------------------------------------------------------- evaluating one press */

/**
 * What the player did. One shape for every family, because the reducer seam is one action.
 *
 *   dial      -- nothing; the answer is the clock, and the needle position is derived from it.
 *   mash      -- nothing; each press is one press.
 *   hold      -- `heldMs`, how long the button was down.
 *   sequence  -- `value`, the symbol pressed.
 *   pick      -- `value`, the option chosen.
 */
export interface GoldenChallengeInput {
  readonly heldMs?: number;
  readonly value?: number;
}

/** Where one attempt got to, before the caller decides what it costs. */
export interface GoldenChallengeOutcome {
  /** Did this press satisfy the challenge's rule? */
  readonly hit: boolean;
  /** Is the CURRENT round finished? A sequence round needs several correct presses to finish. */
  readonly roundComplete: boolean;
  /**
   * Progress within the current round after this press: how many symbols of a sequence are in,
   * or how many presses of a mash are counted. Always 0 for families whose round is one press.
   */
  readonly progress: number;
}

/**
 * Evaluate one press against a challenge.
 *
 * PURE, and deliberately given everything it needs rather than reading a clock or a store: the
 * same inputs always produce the same outcome, which is what makes a skill challenge checkable
 * rather than merely assertable.
 *
 * `elapsedMs` is time since the current ROUND started, and `progress` is what the round has
 * accumulated so far. A caller that gets either wrong will see it in the outcome rather than in a
 * silently generous evaluation.
 */
export function evaluateGoldenChallengePress(
  challenge: GoldenChallenge,
  args: {
    readonly elapsedMs: number;
    readonly progress: number;
    readonly target: readonly number[];
    readonly input?: GoldenChallengeInput;
    /** Only the dial needs this: where the needle actually was, and where the zone sits. */
    readonly needlePosition?: number;
    readonly zoneCentre?: number;
  },
): GoldenChallengeOutcome {
  const { params } = challenge;
  const input = args.input ?? {};

  switch (challenge.family) {
    case "dial": {
      // The needle's position is computed by golden-cookie.ts, which owns the sweep. This only
      // decides whether it landed, so the two cannot disagree about the geometry.
      // The track is a there-and-back SWEEP along a line, not a circle, and the zone is rolled
      // clamped so it never touches either end. Distance is therefore plain and unwrapped: an
      // earlier version of this wrapped it, which quietly widened every zone near the ends.
      const distance = Math.abs((args.needlePosition ?? 0) - (args.zoneCentre ?? 0));
      const hit = distance <= params.zoneHalfWidth;
      return { hit, roundComplete: hit, progress: 0 };
    }

    case "mash": {
      // Every press counts; the only way to fail is to run out of window, which the caller checks
      // because it owns the clock. A press after the window has closed is not a hit.
      if (args.elapsedMs > params.windowMs) return { hit: false, roundComplete: false, progress: args.progress };
      const progress = args.progress + 1;
      return { hit: true, roundComplete: progress >= params.presses, progress };
    }

    case "hold": {
      // Estimation, not reflex: the hold has to land inside a window around the target, and both
      // too short and too long fail. That symmetry is the whole point of the family.
      const held = input.heldMs ?? 0;
      const hit = Math.abs(held - params.targetMs) <= params.toleranceMs;
      return { hit, roundComplete: hit, progress: 0 };
    }

    case "sequence": {
      // One press per symbol. A wrong symbol fails the round immediately and resets its progress,
      // rather than letting the player grind through by pressing everything.
      const expected = args.target[args.progress];
      if (input.value !== expected) return { hit: false, roundComplete: false, progress: 0 };
      const progress = args.progress + 1;
      return { hit: true, roundComplete: progress >= args.target.length, progress };
    }

    case "pick": {
      const hit = input.value === args.target[0];
      return { hit, roundComplete: hit, progress: 0 };
    }
  }
}
