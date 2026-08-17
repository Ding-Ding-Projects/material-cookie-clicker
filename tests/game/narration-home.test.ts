import { describe, expect, it } from "vitest";

import { bnFromNumber } from "../../src/shared/game/big-number";
import {
  createInitialHomeState,
  getRoomDefinition,
  furnitureForRoom,
  ROOM_DEFINITIONS,
} from "../../src/shared/game/home-construction";
import { applyGameAction, type GameAction, type ReducerCtx } from "../../src/shared/game/reducer";
import type { GameState } from "../../src/shared/game/types";
import { detectMilestones, describeMilestone } from "../../src/renderer/game/narration";
import { formatBilingual } from "../../src/renderer/game/copy";
import { GameStore } from "../../src/renderer/game/store";
import { fixedRng, freshState } from "./test-helpers";

/**
 * The home and raid-supply purchases are announced through the SAME milestone seam every other
 * purchase uses. These buy buttons carry no live region of their own, so this seam is the only
 * path by which a screen-reader user hears that a press did anything — and, because the buttons
 * are deliberately still pressable when they cannot succeed, the REFUSAL has to be spoken too.
 */

const CTX: ReducerCtx = { now: () => 1_700_000_000_000, rng: fixedRng(0.5) };

function deedState(cookies: number, overrides: Partial<GameState> = {}): GameState {
  return freshState({
    cookies: bnFromNumber(cookies),
    upgrades: [
      { id: "reveal_shop_sign", purchasedAtTickCount: 0 },
      { id: "reveal_property_deed", purchasedAtTickCount: 0 },
    ],
    ...overrides,
  });
}

/**
 * Dispatch one action and report what the status region would have been given, with the
 * achievement lines dropped: the seeded upgrades on these fixtures happen to unlock one, and it
 * is not what any of these cases is about.
 */
function announce(state: GameState, action: GameAction) {
  const next = applyGameAction(state, action, CTX);
  return { next, events: detectMilestones(state, next, action).filter((e) => e.kind !== "achievement") };
}

const FIRST = ROOM_DEFINITIONS[0]!;

describe("home purchases reach the status region", () => {
  it("announces a blueprint that was actually bought", () => {
    const { events } = announce(deedState(FIRST.blueprintCost), {
      type: "buyHomeBlueprint",
      roomId: FIRST.id,
    });
    expect(events).toEqual([{ kind: "home-blueprint-bought", roomId: FIRST.id }]);
    expect(describeMilestone(events[0]!).en).toContain(FIRST.nameEn);
  });

  it("announces a refusal rather than nothing when the cookies are not there", () => {
    const { events } = announce(deedState(0), { type: "buyHomeBlueprint", roomId: FIRST.id });
    expect(events).toEqual([
      { kind: "purchase-refused", nameEn: FIRST.nameEn, nameYue: FIRST.nameYue, reason: "afford" },
    ]);
    expect(describeMilestone(events[0]!).en).toContain("not enough cookies");
  });

  it("announces construction starting, and says WHY when the one-site rule blocks it", () => {
    const second = ROOM_DEFINITIONS[1]!;
    const owned = deedState(FIRST.buildCost + second.buildCost, {
      homeConstruction: { ...createInitialHomeState(), blueprintIds: [FIRST.id, second.id] },
    });
    const started = announce(owned, { type: "startHomeConstruction", roomId: FIRST.id });
    expect(started.events).toEqual([{ kind: "home-construction-started", roomId: FIRST.id }]);

    const blocked = announce(started.next, { type: "startHomeConstruction", roomId: second.id });
    expect(blocked.events).toEqual([
      { kind: "purchase-refused", nameEn: second.nameEn, nameYue: second.nameYue, reason: "busy" },
    ]);
    expect(describeMilestone(blocked.events[0]!).en).toContain("already under construction");
  });

  it("announces a room finishing, which no button was pressed for", () => {
    const owned = deedState(FIRST.buildCost, {
      homeConstruction: { ...createInitialHomeState(), blueprintIds: [FIRST.id] },
    });
    const started = applyGameAction(owned, { type: "startHomeConstruction", roomId: FIRST.id }, CTX);
    const required = started.homeConstruction.build!.requiredMs;
    const action: GameAction = { type: "tick", elapsedMs: required + 1_000 };
    const finished = applyGameAction(started, action, CTX);
    const events = detectMilestones(started, finished, action);
    expect(events).toContainEqual({ kind: "home-room-completed", roomId: FIRST.id });
  });

  it("announces a furniture purchase by name", () => {
    const item = furnitureForRoom(FIRST.id)[0]!;
    const state = deedState(item.cost, {
      homeConstruction: {
        ...createInitialHomeState(),
        blueprintIds: [FIRST.id],
        rooms: [{ roomId: FIRST.id, furnitureIds: [] }],
      },
    });
    const { events } = announce(state, { type: "buyHomeFurniture", furnitureId: item.id });
    expect(events).toEqual([{ kind: "home-furniture-bought", furnitureId: item.id }]);
    expect(describeMilestone(events[0]!).en).toContain(item.nameEn);
  });
});

describe("raid supplies reach the status region", () => {
  it("announces a bought pass and a refused one", () => {
    const rich = freshState({ cookies: bnFromNumber(1e12) });
    const bought = announce(rich, { type: "buyRaidConsumable", consumableId: "whack_pass" });
    expect(bought.events).toEqual([{ kind: "raid-consumable-bought", consumableId: "whack_pass" }]);

    const broke = freshState({ cookies: bnFromNumber(0) });
    const refused = announce(broke, { type: "buyRaidConsumable", consumableId: "whack_pass" });
    expect(refused.events[0]!.kind).toBe("purchase-refused");
  });
});

describe("every new line is bilingual in both directions", () => {
  it("renders one language per mode, never a hardcoded pair", () => {
    const line = describeMilestone({ kind: "home-blueprint-bought", roomId: FIRST.id });
    expect(formatBilingual(line, "en")).toBe(line.en);
    expect(formatBilingual(line, "yue")).toBe(line.yue);
    expect(formatBilingual(line, "en")).not.toContain(getRoomDefinition(FIRST.id).nameYue);
    expect(formatBilingual(line, "yue")).not.toContain(getRoomDefinition(FIRST.id).nameEn);
  });
});

describe("the store tells its listeners about a refusal", () => {
  it("notifies onDispatch even when the reducer returned the state unchanged", () => {
    const store = new GameStore(deedState(0));
    const heard: string[] = [];
    store.onDispatch((previous, next, action) => {
      for (const event of detectMilestones(previous, next, action)) heard.push(event.kind);
    });
    store.dispatch({ type: "buyHomeBlueprint", roomId: FIRST.id }, CTX);
    expect(heard).toContain("purchase-refused");
  });
});
