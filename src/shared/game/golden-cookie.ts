import { bnFromNumber, bnMulScalar, type BigNum } from "./big-number.js";
import { totalCps } from "./cps.js";
import { goldenCookieBonuses } from "./upgrades.js";
import type { GameState, GoldenCookieEffectState, GoldenCookieState, GoldenDialState, RngPort } from "./types.js";

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

/* ------------------------------------------------------------- the Oven Dial: the whole game */

/** How many rounds must be won, in a row, to redeem the cookie. */
export const GOLDEN_DIAL_ROUNDS = 3;
/** What a miss costs: two seconds burned off the golden window's remaining time. */
export const GOLDEN_DIAL_MISS_PENALTY_MS = 2000;
/** Ticks per sweep in stepped mode. The needle lands on 1/24ths of the track and nowhere else. */
export const GOLDEN_DIAL_STEPS = 24;
/** How much longer a stepped sweep takes, so a rhythm is followable rather than a scramble. */
export const GOLDEN_DIAL_STEPPED_SLOWDOWN = 1.6;

export interface GoldenDialRound {
  /** Milliseconds for one full there-and-back sweep of the track. Smaller is faster. */
  readonly sweepMs: number;
  /** Half the golden zone's width, as a fraction of the track. Smaller is a tighter target. */
  readonly zoneHalfWidth: number;
}

/**
 * THE DIFFICULTY CURVE. Fixed, published, and identical for every player, every save and every
 * seed — which is the whole reason this is a minigame and not a chance game. Nothing here is
 * rolled, scaled by progress, or adjusted to how the player is doing.
 *
 * Round one is deliberately generous: a 26%-wide zone under a needle taking 1.8s to cross and
 * come back is a target you can hit while still working out what the dial is. Round three is
 * 13% under a needle at 1.05s — demanding, but it is the same 13% for everyone, and a player who
 * misses gets to press again for the cost of two seconds off the window.
 */
export const GOLDEN_DIAL_ROUND_CURVE: readonly GoldenDialRound[] = [
  { sweepMs: 1800, zoneHalfWidth: 0.13 },
  { sweepMs: 1400, zoneHalfWidth: 0.095 },
  { sweepMs: 1050, zoneHalfWidth: 0.065 },
];

/** The curve entry for a round index, clamped so an out-of-range index cannot crash a press. */
export function goldenDialRound(roundIndex: number): GoldenDialRound {
  const index = Math.min(Math.max(Math.floor(roundIndex), 0), GOLDEN_DIAL_ROUND_CURVE.length - 1);
  return GOLDEN_DIAL_ROUND_CURVE[index];
}

/** The sweep time actually used, which is longer in stepped mode. */
export function goldenDialSweepMs(roundIndex: number, stepped: boolean): number {
  const base = goldenDialRound(roundIndex).sweepMs;
  return stepped ? Math.round(base * GOLDEN_DIAL_STEPPED_SLOWDOWN) : base;
}

/**
 * WHERE THE NEEDLE IS, as a pure function of how long the round has been running.
 *
 * A triangle wave over 0..1: the needle runs from the left end of the track to the right end in
 * half a sweep, then back again. No easing — a needle that slowed at the ends would make the
 * ends of the track worth more than the middle, and the dial is supposed to reward timing rather
 * than geography.
 *
 * In STEPPED mode the elapsed time is quantised to `GOLDEN_DIAL_STEPS` ticks per sweep before
 * the wave is evaluated, so the needle only ever occupies one of a fixed set of positions. The
 * renderer draws the value this function returns and the reducer judges the value this function
 * returns, so what was on screen is exactly what was judged.
 *
 * Exactly testable, and the reason the outcome carries no luck at all: the same press at the
 * same millisecond of a round always lands in the same place, on every machine and every seed.
 */
export function goldenDialNeedlePosition(elapsedMs: number, roundIndex: number, stepped: boolean): number {
  const sweepMs = goldenDialSweepMs(roundIndex, stepped);
  const safeElapsed = Math.max(0, elapsedMs);
  let progress = (safeElapsed % sweepMs) / sweepMs;
  if (stepped) {
    // Floor to the tick the needle is SITTING on. A stepped needle that rounded to the nearest
    // tick would appear to jump early, half a tick before the press that lands it there.
    progress = Math.floor(progress * GOLDEN_DIAL_STEPS) / GOLDEN_DIAL_STEPS;
  }
  return progress < 0.5 ? progress * 2 : 2 - progress * 2;
}

/** Whether a needle position is inside the round's golden zone. Inclusive at both edges. */
export function isInsideGoldenDialZone(position: number, zoneCentre: number, roundIndex: number): boolean {
  return Math.abs(position - zoneCentre) <= goldenDialRound(roundIndex).zoneHalfWidth;
}

/**
 * Rolls where the zone SITS for a round, clamped so the whole zone stays on the track. This is
 * the only randomness the minigame contains, and it decides nothing: the zone is painted on the
 * dial before the needle is pressed, so a player can see it and aim at it. It exists so that
 * three rounds are not three identical presses at the same spot.
 */
function rollZoneCentre(rng: RngPort, roundIndex: number): number {
  const { zoneHalfWidth } = goldenDialRound(roundIndex);
  const span = 1 - zoneHalfWidth * 2;
  return Math.round((zoneHalfWidth + rng.next() * span) * 1000) / 1000;
}

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
    dial: undefined,
    rngStreamIndex: rng.getStreamIndex(),
  };
}

/**
 * CATCHING the sprite: opens the Oven Dial on it and starts round one's sweep.
 *
 * `stepped` comes from the player's `prefers-reduced-motion` setting, read by the view at the
 * moment of the catch and then FROZEN onto the state — so a setting changed mid-dial cannot move
 * the needle out from under a press already being aimed.
 *
 * A catch on nothing, or on a cookie already caught, is a no-op — the domain, not the view,
 * decides whether a second click on a sprite mid-dial means anything.
 */
export function catchGoldenCookie(
  state: GoldenCookieState,
  rng: RngPort,
  nowEpochMs: number,
  stepped = false,
): GoldenCookieState {
  if (!state.isSpawned || state.dial) return state;
  return {
    ...state,
    dial: {
      roundsWon: 0,
      zoneCentre: rollZoneCentre(rng, 0),
      roundStartedAtEpochMs: nowEpochMs,
      misses: 0,
      stepped,
    },
    rngStreamIndex: rng.getStreamIndex(),
  };
}

export interface GoldenDialPressResult {
  readonly goldenCookie: GoldenCookieState;
  /** Where the needle actually was when the press landed, 0..1. Reported so a view can mark it. */
  readonly needlePosition: number;
  /** Whether the needle was inside the zone. */
  readonly hit: boolean;
  /** Whether that press was the THIRD hit, i.e. the cookie is now redeemed. */
  readonly won: boolean;
}

/**
 * ONE PRESS on the dial.
 *
 * The needle's position is recomputed here from `roundStartedAtEpochMs` and the clock, rather
 * than taken from the action: the view cannot tell the reducer where the needle was, so a
 * hand-built dispatch cannot claim a hit it did not earn, and there is exactly one definition of
 * where the needle is.
 *
 * Hit, and not the last round: the next round starts, with a fresh zone position and the next
 * step of the difficulty curve. Hit on the last round: reports `won`, leaving the state alone —
 * the reducer runs `collectGoldenCookie` for the actual effect roll, so redemption goes through
 * exactly the same code path it always did.
 *
 * Miss: burns `GOLDEN_DIAL_MISS_PENALTY_MS` off the window's REMAINING time by ageing
 * `spawnedAtEpochMs` backwards. That is the whole penalty — the round is not lost, the zone does
 * not move, and the needle keeps sweeping, so a miss costs seconds and another attempt rather
 * than the cookie. The sweep is deliberately NOT restarted either: restarting it on every miss
 * would hand a player a fresh, predictable phase each time they got it wrong.
 */
export function pressGoldenDial(
  state: GoldenCookieState,
  nowEpochMs: number,
  rng: RngPort,
): GoldenDialPressResult {
  const dial = state.dial;
  if (!state.isSpawned || !dial) {
    return { goldenCookie: state, needlePosition: 0, hit: false, won: false };
  }

  const roundIndex = dial.roundsWon;
  const elapsedMs = nowEpochMs - dial.roundStartedAtEpochMs;
  const needlePosition = goldenDialNeedlePosition(elapsedMs, roundIndex, dial.stepped);
  const hit = isInsideGoldenDialZone(needlePosition, dial.zoneCentre, roundIndex);

  if (!hit) {
    const spawnedAtEpochMs =
      state.spawnedAtEpochMs === undefined ? undefined : state.spawnedAtEpochMs - GOLDEN_DIAL_MISS_PENALTY_MS;
    return {
      goldenCookie: { ...state, spawnedAtEpochMs, dial: { ...dial, misses: dial.misses + 1 } },
      needlePosition,
      hit: false,
      won: false,
    };
  }

  const roundsWon = roundIndex + 1;
  if (roundsWon >= GOLDEN_DIAL_ROUNDS) {
    return {
      goldenCookie: { ...state, dial: { ...dial, roundsWon } },
      needlePosition,
      hit: true,
      won: true,
    };
  }

  return {
    goldenCookie: {
      ...state,
      dial: {
        ...dial,
        roundsWon,
        zoneCentre: rollZoneCentre(rng, roundsWon),
        roundStartedAtEpochMs: nowEpochMs,
      },
      rngStreamIndex: rng.getStreamIndex(),
    },
    needlePosition,
    hit: true,
    won: false,
  };
}

/**
 * THE COOKIE FLEES: Escape from the dial card, or the window running out. Despawns and
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
    // dial are dropped, because both belonged to the cookie that just left.)
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
  // dial (and to photograph it) rather than to race it.
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
