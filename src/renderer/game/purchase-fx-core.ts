import type { GameAction } from "../../shared/game/reducer.js";
import type { GameState } from "../../shared/game/types.js";

/**
 * PURCHASE FEEDBACK — the pure half.
 *
 * Everything in this file is plain data and timers-as-numbers: no DOM, no React, no `window`.
 * That is deliberate, because the two things about purchase animation that can actually be
 * wrong in a way a screenshot will not show are (a) whether an animation fires for a purchase
 * the reducer REFUSED, and (b) whether a bulk buy turns into N overlapping storms. Both of
 * those live here, and both are unit-tested.
 *
 * The rule the rest of the system is built on: an effect is born from a state DIFF, never from
 * a click. `detectPurchase` is handed the same `(previous, next, action)` triple the narration
 * and autosave observers already receive from `GameStore.onDispatch`, and it returns null
 * unless the reducer actually applied something — an unaffordable buy, a locked upgrade or a
 * mint that failed its reveal check all produce no intent and therefore no animation.
 */

export type PurchaseKind = "generator" | "upgrade" | "diesel" | "control";

/** What a successful purchase was, in the terms the animation layer needs. */
export interface PurchaseIntent {
  readonly kind: PurchaseKind;
  /** Which registered DOM target the effect plays on ("generator:cursor", "upgrade:x", "diesel:depot"). */
  readonly targetKey: string;
  /** Generators bought, upgrades bought (always 1), or litres minted. */
  readonly quantity: number;
  /** The owned count AFTER the purchase, for the odometer roll. Generators only. */
  readonly ownedTo?: number;
  /** Total litres AFTER the mint, for the fuel gauge and the litres roll. Diesel only. */
  readonly litresTo?: number;
}

export function generatorTargetKey(id: string): string {
  return `generator:${id}`;
}
export function upgradeTargetKey(id: string): string {
  return `upgrade:${id}`;
}
/** The coin-slot plate for one control rung (control-unlocks.ts) — see CoinSlot.tsx. */
export function controlTargetKey(rungId: string): string {
  return `control:${rungId}`;
}
/** One plate on the raid supplies shelf: a consumable, or the storage chip ("supplies:storage"). */
export function suppliesTargetKey(id: string): string {
  return `supplies:${id}`;
}
export const DIESEL_TARGET_KEY = "diesel:depot";
export const HUD_COOKIES_TARGET_KEY = "hud:cookies";

export function detectPurchase(previous: GameState, next: GameState, action: GameAction): PurchaseIntent | null {
  switch (action.type) {
    case "buyGenerator":
    case "buyGeneratorBulk": {
      const before = previous.generators.find((g) => g.id === action.generatorId)?.count ?? 0;
      const after = next.generators.find((g) => g.id === action.generatorId)?.count ?? 0;
      if (after <= before) return null;
      return {
        kind: "generator",
        targetKey: generatorTargetKey(action.generatorId),
        quantity: after - before,
        ownedTo: after,
      };
    }
    case "buyUpgrade": {
      const owned = next.upgrades.some((u) => u.id === action.upgradeId);
      const alreadyOwned = previous.upgrades.some((u) => u.id === action.upgradeId);
      if (!owned || alreadyOwned) return null;
      return { kind: "upgrade", targetKey: upgradeTargetKey(action.upgradeId), quantity: 1 };
    }
    // Buying a control is a purchase like any other and gets the same handful of coins. The
    // diff is what proves it: a rung the reducer refused (already owned, ladder order wrong,
    // cookies short) leaves the list unchanged and animates nothing.
    case "buyControlUnlock": {
      const before = previous.controlUnlocks?.purchasedRungIds ?? [];
      const after = next.controlUnlocks?.purchasedRungIds ?? [];
      if (after.length <= before.length) return null;
      return { kind: "control", targetKey: controlTargetKey(action.rungId), quantity: 1 };
    }
    // The raid supplies shelf is a buying surface like any other, so a pass and a storage rung
    // both throw the same handful of coins — and both prove they landed by the diff, so a press
    // refused at the cap or short of the price animates nothing.
    case "buyRaidConsumable": {
      const before = previous.randomEvents.consumables[action.consumableId].stock;
      const after = next.randomEvents.consumables[action.consumableId].stock;
      if (after <= before) return null;
      return { kind: "control", targetKey: suppliesTargetKey(action.consumableId), quantity: 1 };
    }
    case "buyWhackStorage": {
      if (next.randomEvents.whackStorageLevel <= previous.randomEvents.whackStorageLevel) return null;
      return { kind: "control", targetKey: suppliesTargetKey("storage"), quantity: 1 };
    }
    case "mintDiesel": {
      const litres = next.dieselDepot.litresMinted - previous.dieselDepot.litresMinted;
      if (litres <= 0) return null;
      return {
        kind: "diesel",
        targetKey: DIESEL_TARGET_KEY,
        quantity: litres,
        litresTo: next.dieselDepot.litresMinted,
      };
    }
    default:
      return null;
  }
}

/** How long each kind of effect runs, in milliseconds. */
export const FX_DURATION_MS: Readonly<Record<PurchaseKind, number>> = {
  generator: 700,
  upgrade: 850,
  diesel: 2000,
  // The shortest of the four: a coin drops into a slot and the control it was blocking is simply
  // there. Nothing tears, nothing pumps, and the plate it replaces is usually small.
  control: 620,
};

/**
 * Under `prefers-reduced-motion` every effect collapses to this: long enough for the changed
 * state to be noticed (the filled can, the owned ticket, the new count), short enough that
 * nothing travels or repeats. The layer swaps travel for an instant state change in CSS.
 */
export const FX_REDUCED_MS = 320;

/**
 * Two purchases landing inside this window are one player action as far as feedback goes.
 * A bulk buy dispatches once per selected row in a single synchronous loop, so every one of
 * those lands in the same millisecond.
 */
export const FX_GROUP_WINDOW_MS = 140;

export interface FxEffect {
  readonly id: number;
  readonly kind: PurchaseKind;
  readonly targetKey: string;
  /** Accumulated across everything grouped into this effect. */
  readonly quantity: number;
  readonly ownedTo?: number;
  readonly litresTo?: number;
  readonly startedAt: number;
  readonly endsAt: number;
  /**
   * Whether this effect owns the cookie-coin flight. Exactly ONE effect per group window
   * carries it: a five-row bulk buy bounces five rows but throws one handful of coins, which
   * is the difference between celebratory and unusable.
   */
  readonly coinBurst: boolean;
}

type Listener = () => void;

/**
 * The queue. Holds what is currently animating, groups what arrives together, and serialises
 * diesel mints so two overlapping mints play one pump sequence after the other rather than
 * two half-drawn ones on top of each other.
 *
 * It is driven, not self-driving: `advance(now)` is called by the layer's frame loop. Keeping
 * the clock outside makes every rule above testable without waiting in real time.
 */
export class PurchaseFxQueue {
  #nextId = 1;
  #active: FxEffect[] = [];
  #pendingDiesel: PurchaseIntent[] = [];
  #reducedMotion: boolean;
  readonly #listeners = new Set<Listener>();

  constructor(options: { reducedMotion?: boolean } = {}) {
    this.#reducedMotion = options.reducedMotion ?? false;
  }

  setReducedMotion(value: boolean): void {
    this.#reducedMotion = value;
  }

  durationFor(kind: PurchaseKind): number {
    return this.#reducedMotion ? FX_REDUCED_MS : FX_DURATION_MS[kind];
  }

  submit(intent: PurchaseIntent, now: number): void {
    this.#expire(now);

    if (intent.kind === "diesel") {
      // One pump at a time. A second mint pressed mid-sequence is not dropped and does not
      // double-draw: it waits its turn and plays in full.
      if (this.#active.some((effect) => effect.kind === "diesel")) {
        this.#pendingDiesel.push(intent);
        this.#notify();
        return;
      }
      this.#start(intent, now);
      return;
    }

    const existing = this.#active.find(
      (effect) => effect.targetKey === intent.targetKey && now - effect.startedAt <= FX_GROUP_WINDOW_MS,
    );
    if (existing) {
      this.#active = this.#active.map((effect) =>
        effect === existing
          ? {
              ...effect,
              quantity: effect.quantity + intent.quantity,
              ownedTo: intent.ownedTo ?? effect.ownedTo,
            }
          : effect,
      );
      this.#notify();
      return;
    }

    this.#start(intent, now);
  }

  /** Retires finished effects and starts the next queued mint. Safe to call every frame. */
  advance(now: number): void {
    const before = this.#active.length;
    this.#expire(now);
    const startedMint = this.#promoteDiesel(now);
    if (this.#active.length !== before || startedMint) this.#notify();
  }

  getActive(): readonly FxEffect[] {
    return this.#active;
  }

  getPendingDieselCount(): number {
    return this.#pendingDiesel.length;
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #start(intent: PurchaseIntent, now: number): void {
    // The coin flight belongs to whichever effect opens a group window; anything grouping in
    // behind it rides the same handful of coins.
    const coinBurst = !this.#active.some((effect) => now - effect.startedAt <= FX_GROUP_WINDOW_MS);
    const effect: FxEffect = {
      id: this.#nextId++,
      kind: intent.kind,
      targetKey: intent.targetKey,
      quantity: intent.quantity,
      ownedTo: intent.ownedTo,
      litresTo: intent.litresTo,
      startedAt: now,
      endsAt: now + this.durationFor(intent.kind),
      coinBurst,
    };
    this.#active = [...this.#active, effect];
    this.#notify();
  }

  #expire(now: number): void {
    if (this.#active.every((effect) => effect.endsAt > now)) return;
    this.#active = this.#active.filter((effect) => effect.endsAt > now);
  }

  #promoteDiesel(now: number): boolean {
    if (this.#pendingDiesel.length === 0) return false;
    if (this.#active.some((effect) => effect.kind === "diesel")) return false;
    const next = this.#pendingDiesel.shift();
    if (!next) return false;
    this.#start(next, now);
    return true;
  }

  #notify(): void {
    this.#listeners.forEach((listener) => listener());
  }
}

/** One cookie coin's flight plan, in viewport pixels, measured at fire time. */
export interface CoinPlan {
  readonly index: number;
  readonly fromX: number;
  readonly fromY: number;
  readonly dx: number;
  readonly dy: number;
  /** Sideways bow of the arc's midpoint, so coins fan out instead of stacking on one line. */
  readonly arcX: number;
  readonly arcY: number;
  readonly delayMs: number;
  readonly spinDeg: number;
}

export interface Rectish {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export const COIN_MIN = 3;
export const COIN_MAX = 6;

/**
 * Lays out a coin flight from the HUD counter to the purchased control. `random` is injected so
 * the fan is testable; the caller passes `Math.random`.
 *
 * Bigger purchases throw more coins, capped at six — a hundred-generator bulk buy is still a
 * handful, because the point is "that worked", not confetti.
 */
export function planCoinFlight(from: Rectish, to: Rectish, quantity: number, random: () => number = Math.random): CoinPlan[] {
  const count = Math.max(COIN_MIN, Math.min(COIN_MAX, COIN_MIN + Math.floor(Math.log2(Math.max(quantity, 1)) + 0.5)));
  const originX = from.left + from.width / 2;
  const originY = from.top + from.height / 2;
  const targetX = to.left + to.width / 2;
  const targetY = to.top + to.height / 2;
  const plans: CoinPlan[] = [];
  for (let index = 0; index < count; index += 1) {
    const spread = (index - (count - 1) / 2) / Math.max(count - 1, 1);
    plans.push({
      index,
      fromX: originX + spread * Math.min(from.width * 0.3, 40),
      fromY: originY,
      dx: targetX - originX,
      dy: targetY - originY,
      arcX: spread * 60 + (random() * 20 - 10),
      arcY: -60 - random() * 50,
      delayMs: index * 32,
      spinDeg: 180 + Math.round(random() * 360),
    });
  }
  return plans;
}
