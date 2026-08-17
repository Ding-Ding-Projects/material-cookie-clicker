import { describe, expect, it } from "vitest";

import {
  DIESEL_TARGET_KEY,
  FX_DURATION_MS,
  FX_GROUP_WINDOW_MS,
  FX_REDUCED_MS,
  PurchaseFxQueue,
  detectPurchase,
  generatorTargetKey,
  planCoinFlight,
  suppliesTargetKey,
  upgradeTargetKey,
  type PurchaseIntent,
} from "../../src/renderer/game/purchase-fx-core.js";
import { applyGameAction, createInitialGameState, type GameAction, type ReducerCtx } from "../../src/shared/game/reducer.js";
import { bnFromNumber } from "../../src/shared/game/big-number.js";
import type { GameState } from "../../src/shared/game/types.js";
import { fixedRng } from "./test-helpers.js";

const CTX: ReducerCtx = { now: () => 1_700_000_000_000, rng: fixedRng() };

function freshState(): GameState {
  return createInitialGameState(new Date(CTX.now()).toISOString());
}

function withCookies(state: GameState, amount: number): GameState {
  return { ...state, cookies: bnFromNumber(amount), lifetimeCookies: bnFromNumber(amount) };
}

/** Runs an action through the REAL reducer and reports what the fx layer would make of it. */
function detectThrough(state: GameState, action: GameAction) {
  const next = applyGameAction(state, action, CTX);
  return { next, intent: detectPurchase(state, next, action) };
}

describe("detectPurchase — gating on what the reducer actually did", () => {
  it("returns nothing for a generator the player cannot afford", () => {
    const state = freshState();
    const { next, intent } = detectThrough(state, { type: "buyGeneratorBulk", generatorId: "cursor", quantity: 1 });
    expect(next.generators.find((g) => g.id === "cursor")?.count ?? 0).toBe(0);
    expect(intent).toBeNull();
  });

  it("reports the target, the quantity and the new owned count for a generator that was bought", () => {
    const state = withCookies(freshState(), 1_000);
    const { intent } = detectThrough(state, { type: "buyGeneratorBulk", generatorId: "cursor", quantity: 3 });
    expect(intent).not.toBeNull();
    expect(intent?.kind).toBe("generator");
    expect(intent?.targetKey).toBe(generatorTargetKey("cursor"));
    expect(intent?.quantity).toBe(3);
    expect(intent?.ownedTo).toBe(3);
  });

  it("returns nothing for an upgrade that is already owned", () => {
    const bought = applyGameAction(withCookies(freshState(), 1_000_000), { type: "buyUpgrade", upgradeId: "reveal_shop_sign" }, CTX);
    expect(bought.upgrades.some((u) => u.id === "reveal_shop_sign")).toBe(true);
    const { intent } = detectThrough(bought, { type: "buyUpgrade", upgradeId: "reveal_shop_sign" });
    expect(intent).toBeNull();
  });

  it("reports an upgrade purchase the reducer applied", () => {
    const state = withCookies(freshState(), 1_000_000);
    const { intent } = detectThrough(state, { type: "buyUpgrade", upgradeId: "reveal_shop_sign" });
    expect(intent?.kind).toBe("upgrade");
    expect(intent?.targetKey).toBe(upgradeTargetKey("reveal_shop_sign"));
  });

  it("returns nothing for a shipment the reducer refused, and the litres total for one it applied", () => {
    // Refused because the tanks are empty: cookies buy the plant now, never a litre, so a rich
    // player with no refinery ships exactly nothing.
    const dry = withCookies(freshState(), 5_000_000);
    expect(detectThrough(dry, { type: "mintDiesel", litres: 1 }).intent).toBeNull();

    // The factory needs its reveal chain before a shipment is legal at all, and it needs the
    // litre to actually be in the tank.
    let state = withCookies(freshState(), 5_000_000);
    for (const id of ["reveal_shop_sign", "reveal_upgrade_catalogue", "reveal_fuel_contract"]) {
      state = applyGameAction(state, { type: "buyUpgrade", upgradeId: id }, CTX);
    }
    state = { ...state, dieselFactory: { ...state.dieselFactory, litres: 1, lifetimeLitres: 1 } };
    const { next, intent } = detectThrough(state, { type: "mintDiesel", litres: 1 });
    expect(next.dieselDepot.litresMinted).toBe(1);
    expect(intent?.kind).toBe("diesel");
    expect(intent?.targetKey).toBe(DIESEL_TARGET_KEY);
    expect(intent?.litresTo).toBe(1);
  });

  it("ignores every action that is not a purchase", () => {
    const state = withCookies(freshState(), 100);
    expect(detectThrough(state, { type: "click" }).intent).toBeNull();
    expect(detectThrough(state, { type: "tick", elapsedMs: 500 }).intent).toBeNull();
  });
});

function intent(partial: Partial<PurchaseIntent> & Pick<PurchaseIntent, "kind" | "targetKey">): PurchaseIntent {
  return { quantity: 1, ...partial };
}

describe("detectPurchase — the raid supplies shelf", () => {
  it("throws coins for a pass the reducer actually stocked, and none for one it refused", () => {
    const rich = withCookies(freshState(), 1e12);
    const { next, intent } = detectThrough(rich, { type: "buyRaidConsumable", consumableId: "whack_pass" });
    expect(next.randomEvents.consumables.whack_pass.stock).toBe(1);
    expect(intent?.kind).toBe("control");
    expect(intent?.targetKey).toBe(suppliesTargetKey("whack_pass"));

    const poor = withCookies(freshState(), 10);
    expect(detectThrough(poor, { type: "buyRaidConsumable", consumableId: "whack_pass" }).intent).toBeNull();
  });

  it("throws coins for a storage rung that was bought, and none at the top of the ladder", () => {
    const rich = withCookies(freshState(), 1e12);
    const { next, intent } = detectThrough(rich, { type: "buyWhackStorage" });
    expect(next.randomEvents.whackStorageLevel).toBe(1);
    expect(intent?.targetKey).toBe(suppliesTargetKey("storage"));

    const maxed = { ...rich, randomEvents: { ...rich.randomEvents, whackStorageLevel: 2 } };
    expect(detectThrough(maxed, { type: "buyWhackStorage" }).intent).toBeNull();
  });
});

describe("PurchaseFxQueue — grouping", () => {
  it("collapses repeated buys of the same row inside the group window into one effect", () => {
    const queue = new PurchaseFxQueue();
    queue.submit(intent({ kind: "generator", targetKey: "generator:cursor", quantity: 1, ownedTo: 1 }), 1_000);
    queue.submit(intent({ kind: "generator", targetKey: "generator:cursor", quantity: 1, ownedTo: 2 }), 1_020);
    queue.submit(intent({ kind: "generator", targetKey: "generator:cursor", quantity: 1, ownedTo: 3 }), 1_060);

    const active = queue.getActive();
    expect(active).toHaveLength(1);
    expect(active[0]?.quantity).toBe(3);
    expect(active[0]?.ownedTo).toBe(3);
  });

  it("starts a fresh effect once the group window has passed", () => {
    const queue = new PurchaseFxQueue();
    queue.submit(intent({ kind: "generator", targetKey: "generator:cursor" }), 1_000);
    queue.submit(intent({ kind: "generator", targetKey: "generator:cursor" }), 1_000 + FX_GROUP_WINDOW_MS + 1);
    expect(queue.getActive()).toHaveLength(2);
  });

  it("gives a bulk buy across many rows one coin burst, not one per row", () => {
    const queue = new PurchaseFxQueue();
    // A bulk buy dispatches once per selected row in a single synchronous loop.
    for (const id of ["cursor", "grandma", "farm", "mine", "factory"]) {
      queue.submit(intent({ kind: "generator", targetKey: generatorTargetKey(id) }), 1_000);
    }
    const active = queue.getActive();
    expect(active).toHaveLength(5);
    expect(active.filter((effect) => effect.coinBurst)).toHaveLength(1);
  });

  it("retires effects once their duration is up", () => {
    const queue = new PurchaseFxQueue();
    queue.submit(intent({ kind: "generator", targetKey: "generator:cursor" }), 1_000);
    queue.advance(1_000 + FX_DURATION_MS.generator - 1);
    expect(queue.getActive()).toHaveLength(1);
    queue.advance(1_000 + FX_DURATION_MS.generator + 1);
    expect(queue.getActive()).toHaveLength(0);
  });
});

describe("PurchaseFxQueue — diesel mints queue rather than overlap", () => {
  it("plays one mint at a time and starts the next when the first finishes", () => {
    const queue = new PurchaseFxQueue();
    queue.submit(intent({ kind: "diesel", targetKey: DIESEL_TARGET_KEY, litresTo: 1 }), 0);
    queue.submit(intent({ kind: "diesel", targetKey: DIESEL_TARGET_KEY, litresTo: 2 }), 200);
    queue.submit(intent({ kind: "diesel", targetKey: DIESEL_TARGET_KEY, litresTo: 3 }), 400);

    expect(queue.getActive()).toHaveLength(1);
    expect(queue.getActive()[0]?.litresTo).toBe(1);
    expect(queue.getPendingDieselCount()).toBe(2);

    queue.advance(FX_DURATION_MS.diesel + 1);
    expect(queue.getActive()).toHaveLength(1);
    expect(queue.getActive()[0]?.litresTo).toBe(2);
    expect(queue.getPendingDieselCount()).toBe(1);

    queue.advance(FX_DURATION_MS.diesel * 2 + 2);
    expect(queue.getActive()[0]?.litresTo).toBe(3);
    expect(queue.getPendingDieselCount()).toBe(0);

    queue.advance(FX_DURATION_MS.diesel * 3 + 3);
    expect(queue.getActive()).toHaveLength(0);
  });

  it("never drops a queued mint — three presses produce three sequences", () => {
    const queue = new PurchaseFxQueue();
    const seen: number[] = [];
    queue.subscribe(() => {
      for (const effect of queue.getActive()) if (!seen.includes(effect.id)) seen.push(effect.id);
    });
    queue.submit(intent({ kind: "diesel", targetKey: DIESEL_TARGET_KEY }), 0);
    queue.submit(intent({ kind: "diesel", targetKey: DIESEL_TARGET_KEY }), 10);
    queue.submit(intent({ kind: "diesel", targetKey: DIESEL_TARGET_KEY }), 20);
    queue.advance(FX_DURATION_MS.diesel + 1);
    queue.advance(FX_DURATION_MS.diesel * 2 + 2);
    expect(seen).toHaveLength(3);
  });

  it("does not let a generator buy block or be blocked by a running mint", () => {
    const queue = new PurchaseFxQueue();
    queue.submit(intent({ kind: "diesel", targetKey: DIESEL_TARGET_KEY }), 0);
    queue.submit(intent({ kind: "generator", targetKey: "generator:cursor" }), 300);
    expect(queue.getActive()).toHaveLength(2);
    expect(queue.getPendingDieselCount()).toBe(0);
  });
});

describe("PurchaseFxQueue — reduced motion", () => {
  it("collapses every duration to the short instant-state one", () => {
    const queue = new PurchaseFxQueue({ reducedMotion: true });
    expect(queue.durationFor("diesel")).toBe(FX_REDUCED_MS);
    expect(queue.durationFor("generator")).toBe(FX_REDUCED_MS);
    queue.setReducedMotion(false);
    expect(queue.durationFor("diesel")).toBe(FX_DURATION_MS.diesel);
  });
});

describe("planCoinFlight", () => {
  const hud = { left: 0, top: 0, width: 200, height: 80 };
  const row = { left: 600, top: 400, width: 300, height: 60 };

  it("throws between three and six coins, more for a bigger purchase", () => {
    expect(planCoinFlight(hud, row, 1, () => 0.5)).toHaveLength(3);
    expect(planCoinFlight(hud, row, 64, () => 0.5).length).toBeGreaterThan(3);
    expect(planCoinFlight(hud, row, 100_000, () => 0.5).length).toBeLessThanOrEqual(6);
  });

  it("aims every coin at the difference between the two measured rects", () => {
    const plans = planCoinFlight(hud, row, 1, () => 0.5);
    for (const plan of plans) {
      expect(plan.dx).toBeCloseTo(750 - 100);
      expect(plan.dy).toBeCloseTo(430 - 40);
    }
  });

  it("fans the coins apart and staggers them, so they never stack into one strobing dot", () => {
    const plans = planCoinFlight(hud, row, 4, () => 0.5);
    const arcs = new Set(plans.map((plan) => plan.arcX));
    expect(arcs.size).toBe(plans.length);
    expect(plans[0]?.delayMs).toBe(0);
    expect(plans[plans.length - 1]?.delayMs).toBeGreaterThan(0);
  });
});
