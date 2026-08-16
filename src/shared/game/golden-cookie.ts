import { bnFromNumber, bnMulScalar, type BigNum } from "./big-number.js";
import { totalCps } from "./cps.js";
import type { GameState, GoldenCookieEffectState, GoldenCookieState, RngPort } from "./types.js";

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

  return {
    ...state,
    isSpawned: true,
    spawnedAtEpochMs: nowEpochMs,
    rngStreamIndex: rng.getStreamIndex(),
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

  const effectKind = pickEffectKind(rng);
  const nextEligibleAtEpochMs = nowEpochMs + rollDelayMs(rng, config);

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
      instantBonus = bnMulScalar(cps, config.windfallCpsSeconds);
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

/** Whether a timed golden-cookie effect (frenzy/clickFrenzy) is currently active. */
export function isEffectActive(effect: GoldenCookieEffectState | undefined, nowEpochMs: number): boolean {
  if (!effect || effect.expiresAtEpochMs === undefined) return false;
  return nowEpochMs < effect.expiresAtEpochMs;
}
