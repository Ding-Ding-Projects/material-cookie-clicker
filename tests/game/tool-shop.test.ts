import { describe, expect, it } from "vitest";
import { bnCompare, bnFromNumber, bnToNumber } from "../../src/shared/game/big-number";
import { applyGameAction, type ReducerCtx } from "../../src/shared/game/reducer";
import { canBuyTool, isToolPurchased, toolPrice, toolShopEntries } from "../../src/shared/game/tool-shop";
import { isToolBonusActive, TOOL_DEFINITIONS } from "../../src/shared/game/tools";
import { freshState, fixedRng } from "./test-helpers";

function ctxAt(epochMs: number, rngValue = 0.99): ReducerCtx {
  return { now: () => epochMs, rng: fixedRng(rngValue) };
}

describe("tool-shop: toolPrice", () => {
  it("assigns exactly one price per tool, all positive, strictly increasing by roster order", () => {
    let previous = 0;
    for (const def of TOOL_DEFINITIONS) {
      const price = bnToNumber(toolPrice(def.id));
      expect(price).toBeGreaterThan(previous);
      previous = price;
    }
  });

  it("throws for an unknown tool id", () => {
    expect(() => toolPrice("not-a-real-tool")).toThrow(RangeError);
  });
});

describe("tool-shop: canBuyTool / isToolPurchased", () => {
  it("is not buyable when the bonus is already active by play", () => {
    // narrator unlocks at totalClicks >= 1000 (see tools.ts).
    const state = freshState({
      stats: { totalClicks: 1000, totalCookiesBaked: bnFromNumber(0), clockAnomalyCount: 0 },
      cookies: bnFromNumber(1e12),
    });
    expect(canBuyTool(state, "narrator")).toBe(false);
  });

  it("is buyable once affordable and not yet active, and not buyable when unaffordable", () => {
    const cheapest = TOOL_DEFINITIONS[0]!;
    const price = bnToNumber(toolPrice(cheapest.id));
    const poor = freshState({ cookies: bnFromNumber(price - 1) });
    const rich = freshState({ cookies: bnFromNumber(price) });
    expect(canBuyTool(poor, cheapest.id)).toBe(false);
    expect(canBuyTool(rich, cheapest.id)).toBe(true);
  });

  it("isToolPurchased reads state.purchasedToolIds", () => {
    const cheapest = TOOL_DEFINITIONS[0]!;
    const notYet = freshState({});
    const bought = freshState({ purchasedToolIds: [cheapest.id] });
    expect(isToolPurchased(notYet, cheapest.id)).toBe(false);
    expect(isToolPurchased(bought, cheapest.id)).toBe(true);
  });
});

describe("tool-shop: toolShopEntries", () => {
  it("returns one entry per tool, in roster order, with consistent flags", () => {
    const state = freshState({ cookies: bnFromNumber(1e6) });
    const entries = toolShopEntries(state);
    expect(entries.length).toBe(TOOL_DEFINITIONS.length);
    entries.forEach((entry, index) => {
      expect(entry.id).toBe(TOOL_DEFINITIONS[index]!.id);
      expect(entry.active).toBe(isToolBonusActive(state, entry.id));
      if (entry.active) expect(entry.affordable).toBe(false);
    });
  });
});

describe("reducer: buyTool", () => {
  it("spends the exact price and marks the tool active", () => {
    const cheapest = TOOL_DEFINITIONS[0]!;
    const price = toolPrice(cheapest.id);
    const state = freshState({ cookies: price });
    expect(isToolBonusActive(state, cheapest.id)).toBe(false);

    const next = applyGameAction(state, { type: "buyTool", toolId: cheapest.id }, ctxAt(0));

    expect(next.purchasedToolIds).toContain(cheapest.id);
    expect(bnCompare(next.cookies, bnFromNumber(0))).toBe(0);
    expect(isToolBonusActive(next, cheapest.id)).toBe(true);
  });

  it("refuses (no-op) when unaffordable", () => {
    const cheapest = TOOL_DEFINITIONS[0]!;
    const price = bnToNumber(toolPrice(cheapest.id));
    const state = freshState({ cookies: bnFromNumber(price - 1) });
    const next = applyGameAction(state, { type: "buyTool", toolId: cheapest.id }, ctxAt(0));
    expect(next.purchasedToolIds).not.toContain(cheapest.id);
    expect(bnToNumber(next.cookies)).toBeCloseTo(price - 1, 6);
  });

  it("refuses (no-op) once the bonus is already active, even with plenty of cookies", () => {
    // narrator unlocks at totalClicks >= 1000.
    const state = freshState({
      stats: { totalClicks: 1000, totalCookiesBaked: bnFromNumber(0), clockAnomalyCount: 0 },
      cookies: bnFromNumber(1e12),
    });
    const before = state.cookies;
    const next = applyGameAction(state, { type: "buyTool", toolId: "narrator" }, ctxAt(0));
    expect(next.purchasedToolIds).not.toContain("narrator");
    expect(bnCompare(next.cookies, before)).toBe(0);
  });

  it("a purchased tool's bonus composes into computeMultipliers exactly like a naturally unlocked one", async () => {
    const { computeMultipliers } = await import("../../src/shared/game/upgrades");
    const cheapest = TOOL_DEFINITIONS[0]!; // commandPalette: clickMultiplier x1.05
    const price = toolPrice(cheapest.id);
    const before = freshState({ cookies: price });
    const after = applyGameAction(before, { type: "buyTool", toolId: cheapest.id }, ctxAt(0));
    expect(computeMultipliers(after).clickMultiplier).toBeGreaterThan(computeMultipliers(before).clickMultiplier);
  });
});

describe("reducer: setToolProgression", () => {
  it("flips state.toolProgressionEnabled", () => {
    const state = freshState({ toolProgressionEnabled: true });
    const off = applyGameAction(state, { type: "setToolProgression", enabled: false }, ctxAt(0));
    expect(off.toolProgressionEnabled).toBe(false);
    const on = applyGameAction(off, { type: "setToolProgression", enabled: true }, ctxAt(0));
    expect(on.toolProgressionEnabled).toBe(true);
  });

  it("is a genuine no-op (same reference) when already at the requested value", () => {
    const state = freshState({ toolProgressionEnabled: true });
    const next = applyGameAction(state, { type: "setToolProgression", enabled: true }, ctxAt(0));
    expect(next).toBe(state);
  });
});
