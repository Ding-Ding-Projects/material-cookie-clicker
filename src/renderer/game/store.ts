import { totalCps } from "../../shared/game/cps.js";
import { applyGameAction, type GameAction, type ReducerCtx } from "../../shared/game/reducer.js";
import type { BigNum } from "../../shared/game/big-number.js";
import type { GameState } from "../../shared/game/types.js";

/**
 * Three narrow, independently-subscribable slices of `GameState`, so a component only
 * re-renders for the exact class of change it cares about:
 *
 *   - `fast`      — cookies/lifetimeCookies/derived CPS. Changes on every click AND every tick
 *                    (multiple times a second). Only the cookie counter leaf and each row's tiny
 *                    affordability badge subscribe here.
 *   - `stats`      — `state.stats` alone. Also changes on every click/tick (totalCookiesBaked is
 *                    bumped by the same `addCookies` helper that updates `cookies`), but is its
 *                    own slice so the (much larger) `structure` slice below does not fire on
 *                    every tick just because stats moved too.
 *   - `structure`  — generators / upgrades / achievements / prestige / goldenCookie /
 *                    toolProgressionEnabled. These are referentially stable across a plain tick
 *                    (see reducer.ts#handleTick — it never touches generators/upgrades/
 *                    achievements arrays, and golden-cookie helpers return the SAME object
 *                    reference when nothing about the golden cookie actually changed) and only
 *                    change on a discrete action (buy, prestige, unlock, golden-cookie spawn/
 *                    collect/despawn). The 14-generator, ~75-upgrade and ~95-achievement lists
 *                    subscribe here, so a cookie tick never re-renders them.
 *
 * The brief describes this as "two slices" (fast + slow); splitting `stats` out of what would
 * otherwise be one large "slow" slice is a deliberate refinement — without it, the Upgrades and
 * Achievements lists (the two biggest lists in the game) would re-render every tick anyway,
 * because `stats.totalCookiesBaked` changes just as often as `cookies` does.
 */
export interface FastSnapshot {
  readonly cookies: BigNum;
  readonly lifetimeCookies: BigNum;
  readonly cps: BigNum;
}

type Listener = () => void;

const STRUCTURE_KEYS = [
  "generators",
  "upgrades",
  "achievements",
  "prestige",
  "goldenCookie",
  // The random-event scheduler: spawns, expiries and every claimed rain drop are discrete
  // structural changes, and a plain tick that rolls nothing returns the SAME object reference
  // (see random-events.ts#tickRandomEvents), so the stage does not re-render five times a
  // second just because the scheduler was asked whether anything should happen.
  "randomEvents",
  "toolProgressionEnabled",
  // Buying a tool early changes which console emblems progressive disclosure shows (see
  // disclosure.ts#hasDiscoveredATool), so it has to wake the structural slice like any other
  // discrete purchase. It only ever changes on a `buyTool` action, never on a tick.
  "purchasedToolIds",
] as const satisfies readonly (keyof GameState)[];

function computeFastSnapshot(state: GameState): FastSnapshot {
  return { cookies: state.cookies, lifetimeCookies: state.lifetimeCookies, cps: totalCps(state) };
}

function structureChanged(previous: GameState, next: GameState): boolean {
  return STRUCTURE_KEYS.some((key) => previous[key] !== next[key]);
}

export type DispatchListener = (previous: GameState, next: GameState, action: GameAction) => void;

/**
 * The single client-side owner of `GameState`. All mutation flows through
 * `applyGameAction` (reducer.ts's one mutation seam) via `dispatch`; this class only adds
 * subscription bookkeeping and the fast/stats/structure slicing described above.
 */
export class GameStore {
  #state: GameState;
  #fastSnapshot: FastSnapshot;

  readonly #fastListeners = new Set<Listener>();
  readonly #factoryListeners = new Set<Listener>();
  readonly #statsListeners = new Set<Listener>();
  readonly #structureListeners = new Set<Listener>();
  readonly #dispatchListeners = new Set<DispatchListener>();

  constructor(initialState: GameState) {
    this.#state = initialState;
    this.#fastSnapshot = computeFastSnapshot(initialState);
  }

  getState = (): GameState => this.#state;
  getFastSnapshot = (): FastSnapshot => this.#fastSnapshot;
  getStatsSnapshot = (): GameState["stats"] => this.#state.stats;
  getStructureSnapshot = (): GameState => this.#state;
  getFactorySnapshot = (): GameState["dieselFactory"] => this.#state.dieselFactory;

  subscribeFast = (listener: Listener): (() => void) => {
    this.#fastListeners.add(listener);
    return () => this.#fastListeners.delete(listener);
  };
  /**
   * The diesel factory's own slice (diesel-factory.ts).
   *
   * It needs to be its own subscription rather than riding on `fast`, and the reason is a bug
   * this had before it was one: the factory moves on a plain tick while `cookies` may not move
   * at all — a player with a refinery and no generators earns nothing per second — so a panel
   * subscribed to the fast slice sat frozen at 0 L while the tanks really were filling. It is
   * not the structure slice either, because it changes several times a second and would drag
   * the whole generator/upgrade/achievement tree along with it.
   */
  subscribeFactory = (listener: Listener): (() => void) => {
    this.#factoryListeners.add(listener);
    return () => this.#factoryListeners.delete(listener);
  };
  subscribeStats = (listener: Listener): (() => void) => {
    this.#statsListeners.add(listener);
    return () => this.#statsListeners.delete(listener);
  };
  subscribeStructure = (listener: Listener): (() => void) => {
    this.#structureListeners.add(listener);
    return () => this.#structureListeners.delete(listener);
  };

  /** Notified after every dispatch that actually changed state, with the raw before/after/action
   *  — used by narration.ts to detect milestones without re-deriving them from snapshots. */
  onDispatch = (listener: DispatchListener): (() => void) => {
    this.#dispatchListeners.add(listener);
    return () => this.#dispatchListeners.delete(listener);
  };

  dispatch(action: GameAction, ctx: ReducerCtx): GameState {
    const previous = this.#state;
    const next = applyGameAction(previous, action, ctx);
    if (next === previous) return next;

    this.#state = next;

    if (next.cookies !== previous.cookies || next.lifetimeCookies !== previous.lifetimeCookies) {
      this.#fastSnapshot = computeFastSnapshot(next);
      this.#fastListeners.forEach((listener) => listener());
    }
    if (next.dieselFactory !== previous.dieselFactory) {
      this.#factoryListeners.forEach((listener) => listener());
    }
    if (next.stats !== previous.stats) {
      this.#statsListeners.forEach((listener) => listener());
    }
    if (structureChanged(previous, next)) {
      this.#structureListeners.forEach((listener) => listener());
    }
    this.#dispatchListeners.forEach((listener) => listener(previous, next, action));

    return next;
  }

  /** Replaces the whole state (used by save-import / offline-progress-on-load), notifying
   *  every slice unconditionally since any of them may have changed. */
  replaceState(next: GameState): void {
    const previous = this.#state;
    this.#state = next;
    this.#fastSnapshot = computeFastSnapshot(next);
    this.#fastListeners.forEach((listener) => listener());
    this.#factoryListeners.forEach((listener) => listener());
    this.#statsListeners.forEach((listener) => listener());
    this.#structureListeners.forEach((listener) => listener());
    this.#dispatchListeners.forEach((listener) => listener(previous, next, { type: "tick", elapsedMs: 0 }));
  }
}
