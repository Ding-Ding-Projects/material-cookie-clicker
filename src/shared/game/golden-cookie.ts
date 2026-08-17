import { bnFromNumber, bnMulScalar, type BigNum } from "./big-number.js";
import { totalCps } from "./cps.js";
import { goldenCookieBonuses } from "./upgrades.js";
import type { GameState, GoldenCookieEffectState, GoldenCookieState, GoldenPuzzleState, RngPort } from "./types.js";

/**
 * splitmix32 — a small, fast, deterministic PRNG. Chosen (over `Math.random()`) because the
 * golden-cookie spawn schedule must be replayable and unit-testable: given the same seed and
 * stream index, it always produces the same sequence of spawns/effects. `Math.random()` is
 * never called anywhere in this module; callers inject an `RngPort`.
 */
export function createSplitMix32Rng(seed: number, streamIndex = 0): RngPort {
  let state = (seed >>> 0) + streamIndex * 0x9e3779b9;
  let index = streamIndex;

  function nextUint32(): number {
    state = (state + 0x9e3779b9) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
    z = (z ^ (z >>> 15)) >>> 0;
    index += 1;
    return z;
  }

  return {
    next(): number {
      return nextUint32() / 0x100000000;
    },
    getStreamIndex(): number {
      return index;
    },
  };
}

export interface GoldenCookieConfig {
  readonly minDelayMs: number;
  readonly maxDelayMs: number;
  /** How long a spawned golden cookie stays clickable before it despawns unclicked. */
  readonly windowMs: number;
  readonly frenzyMultiplier: number;
  readonly frenzyDurationMs: number;
  readonly clickFrenzyMultiplier: number;
  readonly clickFrenzyDurationMs: number;
  /** Seconds of current CPS awarded instantly by a windfall. */
  readonly windfallCpsSeconds: number;
}

export const DEFAULT_GOLDEN_COOKIE_CONFIG: GoldenCookieConfig = {
  minDelayMs: 5 * 60 * 1000,
  maxDelayMs: 15 * 60 * 1000,
  windowMs: 15 * 1000,
  frenzyMultiplier: 7,
  frenzyDurationMs: 77 * 1000,
  clickFrenzyMultiplier: 3,
  clickFrenzyDurationMs: 13 * 1000,
  windfallCpsSeconds: 60 * 15,
};

const EFFECT_KINDS: readonly GoldenCookieEffectState["kind"][] = ["frenzy", "clickFrenzy", "windfall"];

/* ------------------------------------------------------------ the catch-then-puzzle numbers */

/** Tiles in the Odd Cookie Out grid. Four by four. */
export const GOLDEN_PUZZLE_TILE_COUNT = 16;
/** How many odd tiles must be found, in a row, to redeem the cookie. */
export const GOLDEN_PUZZLE_ROUNDS = 3;
/** How many visual variants the odd tile can wear (see the renderer's tile art). */
export const GOLDEN_PUZZLE_VARIANTS = 4;
/** What a wrong pick costs: two seconds burned off the golden window's remaining time. */
export const GOLDEN_PUZZLE_WRONG_PICK_PENALTY_MS = 2000;

/**
 * WHERE A GOLDEN COOKIE MAY LAND, as percentages of the game stage box.
 *
 * The stage is the same box the random-event drops fall through, and its edges are busy: the
 * pinned HUD sits above it, the console cluster below it, the depot/shop rail down the right.
 * These bounds keep the sprite inside the playable middle so it never lands under chrome that
 * would swallow the click. Its own CSS also centres the sprite on the point and keeps the 72px
 * hit area inside the stage, so a cookie at 88% is fully visible, not half off the edge.
 */
export const GOLDEN_SPAWN_BOUNDS = { minXPct: 12, maxXPct: 88, minYPct: 16, maxYPct: 78 } as const;

function rollSpawnPosition(rng: RngPort): { xPct: number; yPct: number } {
  const { minXPct, maxXPct, minYPct, maxYPct } = GOLDEN_SPAWN_BOUNDS;
  // Rounded to one decimal so the value that goes into a save (and into a CSS percentage) is a
  // short, stable number rather than seventeen digits of float.
  const xPct = Math.round((minXPct + rng.next() * (maxXPct - minXPct)) * 10) / 10;
  const yPct = Math.round((minYPct + rng.next() * (maxYPct - minYPct)) * 10) / 10;
  return { xPct, yPct };
}

/** Rolls one round of the puzzle: which tile is odd, and which variant it wears. */
function rollPuzzleRound(rng: RngPort): { oddIndex: number; variant: number } {
  const oddIndex = Math.min(Math.floor(rng.next() * GOLDEN_PUZZLE_TILE_COUNT), GOLDEN_PUZZLE_TILE_COUNT - 1);
  const variant = Math.min(Math.floor(rng.next() * GOLDEN_PUZZLE_VARIANTS), GOLDEN_PUZZLE_VARIANTS - 1);
  return { oddIndex, variant };
}

function rollDelayMs(rng: RngPort, config: GoldenCookieConfig): number {
  const span = config.maxDelayMs - config.minDelayMs;
  return config.minDelayMs + Math.floor(rng.next() * span);
}

function pickEffectKind(rng: RngPort): GoldenCookieEffectState["kind"] {
  const index = Math.floor(rng.next() * EFFECT_KINDS.length);
  return EFFECT_KINDS[Math.min(index, EFFECT_KINDS.length - 1)];
}

/**
 * If it's time (nowEpochMs >= nextEligibleAtEpochMs) and nothing is currently spawned,
 * spawns a golden cookie. Otherwise returns the state unchanged. Pure: all randomness
 * flows through `rng`.
 */
export function maybeSpawnGoldenCookie(
  state: GoldenCookieState,
  nowEpochMs: number,
  rng: RngPort,
  // Unused by this function today (spawning itself needs no config), but kept in the
  // signature — with a default — so every golden-cookie function shares the same
  // (state, now, rng, config) shape and a future spawn-window tweak has somewhere to land.
  _config: GoldenCookieConfig = DEFAULT_GOLDEN_COOKIE_CONFIG,
): GoldenCookieState {
  if (state.isSpawned) return state;
  if (nowEpochMs < state.nextEligibleAtEpochMs) return state;

  // The cookie is its own sprite now, somewhere random on the stage, rather than a wash over the
  // hero cookie — so the spawn draws a position as well as a moment. Drawn HERE, once, and
  // persisted: the renderer never picks the spot, so it is the same after a re-render or a
  // reload, and a seeded replay puts the cookie in exactly the same place twice.
  const { xPct, yPct } = rollSpawnPosition(rng);

  return {
    ...state,
    isSpawned: true,
    spawnedAtEpochMs: nowEpochMs,
    spawnXPct: xPct,
    spawnYPct: yPct,
    puzzle: undefined,
    rngStreamIndex: rng.getStreamIndex(),
  };
}

/**
 * CATCHING the sprite: opens the Odd Cookie Out puzzle on it. The first round's odd tile comes
 * from the rng here (never `Math.random()`), so a seeded test knows which tile to press.
 *
 * A catch on nothing, or on a cookie already caught, is a no-op — the domain, not the view,
 * decides whether a second click on a sprite mid-puzzle means anything.
 */
export function catchGoldenCookie(state: GoldenCookieState, rng: RngPort): GoldenCookieState {
  if (!state.isSpawned || state.puzzle) return state;
  const { oddIndex, variant } = rollPuzzleRound(rng);
  return {
    ...state,
    puzzle: { roundsSolved: 0, oddIndex, variant, wrongPicks: 0 },
    rngStreamIndex: rng.getStreamIndex(),
  };
}

export interface GoldenPuzzlePickResult {
  readonly goldenCookie: GoldenCookieState;
  /** Whether that pick was the odd tile. */
  readonly correct: boolean;
  /** Whether that pick was the THIRD correct one, i.e. the cookie is now redeemed. */
  readonly solved: boolean;
}

/**
 * One tile press in the open puzzle.
 *
 * Correct and not the last round: rolls the next round from the rng. Correct and the last round:
 * reports `solved`, leaving the state alone — the reducer runs `collectGoldenCookie` for the
 * actual effect roll, so redemption goes through exactly the same code path it always did.
 *
 * Wrong: the pick burns `GOLDEN_PUZZLE_WRONG_PICK_PENALTY_MS` off the window's REMAINING time by
 * ageing `spawnedAtEpochMs` backwards. That is the whole penalty — the round is not lost and the
 * cookie is not taken away, it just leaves less time to finish. The round is deliberately NOT
 * re-rolled on a wrong pick either: re-rolling would let a player brute-force a fresh grid, and
 * would also mean the tile they were looking at moved under them.
 */
export function pickGoldenPuzzleTile(
  state: GoldenCookieState,
  tileIndex: number,
  rng: RngPort,
): GoldenPuzzlePickResult {
  const puzzle = state.puzzle;
  if (!state.isSpawned || !puzzle) return { goldenCookie: state, correct: false, solved: false };
  if (!Number.isInteger(tileIndex) || tileIndex < 0 || tileIndex >= GOLDEN_PUZZLE_TILE_COUNT) {
    return { goldenCookie: state, correct: false, solved: false };
  }

  if (tileIndex !== puzzle.oddIndex) {
    const spawnedAtEpochMs =
      state.spawnedAtEpochMs === undefined
        ? undefined
        : state.spawnedAtEpochMs - GOLDEN_PUZZLE_WRONG_PICK_PENALTY_MS;
    return {
      goldenCookie: {
        ...state,
        spawnedAtEpochMs,
        puzzle: { ...puzzle, wrongPicks: puzzle.wrongPicks + 1 },
      },
      correct: false,
      solved: false,
    };
  }

  const roundsSolved = puzzle.roundsSolved + 1;
  if (roundsSolved >= GOLDEN_PUZZLE_ROUNDS) {
    return {
      goldenCookie: { ...state, puzzle: { ...puzzle, roundsSolved } },
      correct: true,
      solved: true,
    };
  }

  const next = rollPuzzleRound(rng);
  return {
    goldenCookie: {
      ...state,
      puzzle: { ...puzzle, roundsSolved, oddIndex: next.oddIndex, variant: next.variant },
      rngStreamIndex: rng.getStreamIndex(),
    },
    correct: true,
    solved: false,
  };
}

/**
 * THE COOKIE FLEES: Escape from the puzzle card, or the window running out. Despawns and
 * schedules the next spawn on the ORDINARY cooldown — fleeing is not a punishment, it just
 * costs the cookie that was on offer. Deliberately the same arithmetic as an uncaught expiry
 * (and, like it, without the golden upgrade line's frequency bonus, which rewards catching).
 */
export function fleeGoldenCookie(
  state: GoldenCookieState,
  nowEpochMs: number,
  rng: RngPort,
  config: GoldenCookieConfig = DEFAULT_GOLDEN_COOKIE_CONFIG,
): GoldenCookieState {
  if (!state.isSpawned) return state;
  return {
    isSpawned: false,
    activeEffect: state.activeEffect,
    rngStreamIndex: rng.getStreamIndex(),
    nextEligibleAtEpochMs: nowEpochMs + rollDelayMs(rng, config),
  };
}

/**
 * A spawned-but-unclicked golden cookie past its window despawns silently. Takes `rng`
 * directly (rather than recreating one from a stored seed) so callers stay in full control
 * of the PRNG stream — the same `RngPort` instance flows through every golden-cookie
 * function in a single reducer invocation, and its resulting `getStreamIndex()` is what
 * gets persisted back onto `GoldenCookieState.rngStreamIndex`.
 */
export function despawnIfExpired(
  state: GoldenCookieState,
  nowEpochMs: number,
  rng: RngPort,
  config: GoldenCookieConfig = DEFAULT_GOLDEN_COOKIE_CONFIG,
): GoldenCookieState {
  if (!state.isSpawned || state.spawnedAtEpochMs === undefined) return state;
  if (nowEpochMs - state.spawnedAtEpochMs < config.windowMs) return state;

  const nextEligibleAtEpochMs = nowEpochMs + rollDelayMs(rng, config);

  return {
    isSpawned: false,
    // An effect already running is CARRIED, not cancelled: a frenzy bought a minute ago has
    // nothing to do with a later cookie nobody caught. (The spawn position and any half-finished
    // puzzle are dropped, because both belonged to the cookie that just left.)
    activeEffect: state.activeEffect,
    rngStreamIndex: rng.getStreamIndex(),
    nextEligibleAtEpochMs,
  };
}

export interface GoldenCookieCollectResult {
  readonly goldenCookie: GoldenCookieState;
  /** Immediate cookie bonus (windfall effect); zero for timed effects. */
  readonly instantBonus: BigNum;
}

/**
 * Clicking a currently-spawned golden cookie: resolves an effect deterministically from
 * `rng`, schedules the next eligible spawn time, and returns any instant cookie bonus.
 * `state` (the domain GameState) is passed only to compute a windfall's CPS-based bonus.
 */
export function collectGoldenCookie(
  goldenCookie: GoldenCookieState,
  gameState: GameState,
  nowEpochMs: number,
  rng: RngPort,
  config: GoldenCookieConfig = DEFAULT_GOLDEN_COOKIE_CONFIG,
): GoldenCookieCollectResult {
  if (!goldenCookie.isSpawned) {
    return { goldenCookie, instantBonus: bnFromNumber(0) };
  }

  // The golden-cookie upgrade line (upgrades.ts#goldenCookieBonuses) lands here and only here:
  // it makes a CAUGHT cookie pay more, and it shortens the wait that a catch schedules. A
  // cookie that despawns unclicked is deliberately not accelerated — the line rewards catching,
  // not waiting.
  const bonuses = goldenCookieBonuses(gameState);
  const effectKind = pickEffectKind(rng);
  const nextEligibleAtEpochMs = nowEpochMs + rollDelayMs(rng, config) * bonuses.frequencyMultiplier;

  let activeEffect: GoldenCookieEffectState;
  let instantBonus: BigNum = bnFromNumber(0);

  switch (effectKind) {
    case "frenzy":
      activeEffect = {
        kind: "frenzy",
        expiresAtEpochMs: nowEpochMs + config.frenzyDurationMs,
        multiplier: config.frenzyMultiplier,
      };
      break;
    case "clickFrenzy":
      activeEffect = {
        kind: "clickFrenzy",
        expiresAtEpochMs: nowEpochMs + config.clickFrenzyDurationMs,
        multiplier: config.clickFrenzyMultiplier,
      };
      break;
    case "windfall": {
      const cps = totalCps(gameState);
      instantBonus = bnMulScalar(cps, config.windfallCpsSeconds * bonuses.rewardMultiplier);
      activeEffect = { kind: "windfall" };
      break;
    }
  }

  return {
    goldenCookie: {
      isSpawned: false,
      rngStreamIndex: rng.getStreamIndex(),
      activeEffect,
      nextEligibleAtEpochMs,
    },
    instantBonus,
  };
}

/** Milliseconds left on a spawned cookie's window, after any wrong-pick penalties. Never below 0. */
export function goldenWindowRemainingMs(
  state: GoldenCookieState,
  nowEpochMs: number,
  config: GoldenCookieConfig = DEFAULT_GOLDEN_COOKIE_CONFIG,
): number {
  if (!state.isSpawned || state.spawnedAtEpochMs === undefined) return 0;
  return Math.max(0, state.spawnedAtEpochMs + config.windowMs - nowEpochMs);
}

/**
 * THE DEVELOPER-ONLY FAST GOLDEN SCHEDULE, resolved from one localStorage key — the same shape
 * random-events.ts uses, and for the same reason: a five-to-fifteen-minute wait is right for
 * playing and impossible for photographing or smoke-testing. There is no button and no settings
 * row; a player who never sets the key can never reach it.
 */
export const FAST_GOLDEN_COOKIE_FLAG = "material-cookie-clicker:golden:fast";

export const FAST_GOLDEN_COOKIE_CONFIG: GoldenCookieConfig = {
  ...DEFAULT_GOLDEN_COOKIE_CONFIG,
  minDelayMs: 2000,
  maxDelayMs: 6000,
  // A generous window, because the point of the fast schedule is to have time to LOOK at the
  // puzzle (and to photograph it) rather than to race it.
  windowMs: 120 * 1000,
};

/** Pure resolver for that flag, so the decision is tested rather than trusted. */
export function resolveGoldenCookieConfig(flagValue: string | null | undefined): GoldenCookieConfig {
  if (flagValue === "1" || flagValue === "true") return FAST_GOLDEN_COOKIE_CONFIG;
  return DEFAULT_GOLDEN_COOKIE_CONFIG;
}

/** Whether a timed golden-cookie effect (frenzy/clickFrenzy) is currently active. */
export function isEffectActive(effect: GoldenCookieEffectState | undefined, nowEpochMs: number): boolean {
  if (!effect || effect.expiresAtEpochMs === undefined) return false;
  return nowEpochMs < effect.expiresAtEpochMs;
}
