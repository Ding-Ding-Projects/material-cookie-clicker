import { describe, expect, it } from "vitest";
import { bnFromNumber, bnToNumber } from "../../src/shared/game/big-number";
import { applyGameAction, type ReducerCtx } from "../../src/shared/game/reducer";
import {
  ownedToolBonusTotals,
  previewBuyAllAffordableTools,
  previewToolPurchase,
  priceOfTool,
  purchaseTool,
  toolOwnershipCorrection,
  toolShopStatus,
} from "../../src/shared/game/tool-shop";
import * as ToolShopModule from "../../src/shared/game/tool-shop";
import { TOOL_DEFINITIONS } from "../../src/shared/game/tools";
import { totalCps } from "../../src/shared/game/cps";
import { computeMultipliers } from "../../src/shared/game/upgrades";
import { freshState, fixedRng } from "./test-helpers";

function ctxAt(epochMs: number): ReducerCtx {
  return { now: () => epochMs, rng: fixedRng(0.99) };
}

describe("Tool Shop status flow: locked -> discovered -> purchasable -> owned", () => {
  it("is locked when the unlock condition is not met", () => {
    const state = freshState({});
    expect(toolShopStatus(state, "commandPalette")).toBe("locked");
  });

  it("is discovered (but not purchasable) once the condition is met without enough cookies", () => {
    // commandPalette unlocks at totalClicks >= 50, costs a small multiple of cursor's base cost.
    const state = freshState({
      stats: { totalClicks: 50, totalCookiesBaked: bnFromNumber(0), clockAnomalyCount: 0 },
      cookies: bnFromNumber(0),
    });
    expect(toolShopStatus(state, "commandPalette")).toBe("discovered");
  });

  it("is purchasable once discovered AND affordable", () => {
    const state = freshState({
      stats: { totalClicks: 50, totalCookiesBaked: bnFromNumber(0), clockAnomalyCount: 0 },
      cookies: priceOfTool("commandPalette"),
    });
    expect(toolShopStatus(state, "commandPalette")).toBe("purchasable");
  });

  it("is owned once bought, regardless of current cookies", () => {
    const state = freshState({
      stats: { totalClicks: 50, totalCookiesBaked: bnFromNumber(0), clockAnomalyCount: 0 },
      cookies: priceOfTool("commandPalette"),
      ownedTools: [{ id: "commandPalette", purchasedAtTickCount: 50 }],
    });
    expect(toolShopStatus(state, "commandPalette")).toBe("owned");
  });
});

describe("Every one of the 20 tools has a positive, finite price derived from the ladder", () => {
  it("priceOfTool returns a positive finite BigNum for every tool", () => {
    for (const def of TOOL_DEFINITIONS) {
      const price = priceOfTool(def.id);
      const asNumber = bnToNumber(price);
      expect(Number.isFinite(asNumber), `price of ${def.id} must be finite`).toBe(true);
      expect(asNumber, `price of ${def.id} must be positive`).toBeGreaterThan(0);
    }
  });

  it("priceOfTool is stable/deterministic across repeated calls", () => {
    for (const def of TOOL_DEFINITIONS) {
      expect(bnToNumber(priceOfTool(def.id))).toBe(bnToNumber(priceOfTool(def.id)));
    }
  });
});

describe("previewToolPurchase", () => {
  it("reports canAfford=false and status=locked before the unlock condition is met", () => {
    const state = freshState({ cookies: bnFromNumber(1e15) });
    const preview = previewToolPurchase(state, "commandPalette");
    expect(preview.status).toBe("locked");
    expect(preview.canAfford).toBe(false);
  });

  it("reports canAfford=true exactly when cookies >= price, once discovered", () => {
    const state = freshState({
      stats: { totalClicks: 50, totalCookiesBaked: bnFromNumber(0), clockAnomalyCount: 0 },
      cookies: priceOfTool("commandPalette"),
    });
    const preview = previewToolPurchase(state, "commandPalette");
    expect(preview.canAfford).toBe(true);
    expect(bnToNumber(preview.remainingCookiesAfterPurchase)).toBeCloseTo(0, 4);
  });
});

describe("purchaseTool (pure purchase step)", () => {
  it("refuses to buy a locked tool even with infinite cookies", () => {
    const state = freshState({ cookies: bnFromNumber(1e18) });
    const result = purchaseTool(state, "commandPalette", 0);
    expect(result.ok).toBe(false);
    expect(result.nextOwnedTools.length).toBe(0);
  });

  it("refuses to buy an already-owned tool again", () => {
    const state = freshState({
      stats: { totalClicks: 50, totalCookiesBaked: bnFromNumber(0), clockAnomalyCount: 0 },
      cookies: bnFromNumber(1e9),
      ownedTools: [{ id: "commandPalette", purchasedAtTickCount: 50 }],
    });
    const result = purchaseTool(state, "commandPalette", 50);
    expect(result.ok).toBe(false);
    expect(result.nextOwnedTools.length).toBe(1);
  });

  it("buys a discovered, affordable tool and deducts exactly its price", () => {
    const price = priceOfTool("commandPalette");
    const state = freshState({
      stats: { totalClicks: 50, totalCookiesBaked: bnFromNumber(0), clockAnomalyCount: 0 },
      cookies: bnFromNumber(bnToNumber(price) + 100),
    });
    const result = purchaseTool(state, "commandPalette", 50);
    expect(result.ok).toBe(true);
    expect(result.nextOwnedTools.some((t) => t.id === "commandPalette")).toBe(true);
    expect(bnToNumber(result.nextCookies)).toBeCloseTo(100, 4);
  });
});

describe("previewBuyAllAffordableTools", () => {
  it("simulates sequential spending rather than a static affordability filter", () => {
    // A late-game state where several tools are discovered at once. Give exactly enough
    // cookies for the two cheapest but not a third, and confirm the preview buys the cheapest
    // two in cheapest-first order rather than overspending.
    const state = freshState({
      stats: { totalClicks: 5000, totalCookiesBaked: bnFromNumber(0), clockAnomalyCount: 0 },
      cookies: bnFromNumber(0),
    });
    const discovered = TOOL_DEFINITIONS.filter((d) => toolShopStatus(state, d.id) !== "locked");
    expect(discovered.length).toBeGreaterThanOrEqual(2);

    const sorted = [...discovered].sort((a, b) => bnToNumber(priceOfTool(a.id)) - bnToNumber(priceOfTool(b.id)));
    const budget = bnToNumber(priceOfTool(sorted[0].id)) + bnToNumber(priceOfTool(sorted[1].id));

    const funded = { ...state, cookies: bnFromNumber(budget) };
    const preview = previewBuyAllAffordableTools(funded);

    expect(preview.countBought).toBe(2);
    expect(preview.toolIds).toEqual([sorted[0].id, sorted[1].id]);
    expect(bnToNumber(preview.totalCost)).toBeCloseTo(budget, 4);
  });

  it("never claims to buy more than it actually would", () => {
    const state = freshState({ cookies: bnFromNumber(0) });
    const preview = previewBuyAllAffordableTools(state);
    expect(preview.countBought).toBe(preview.toolIds.length);
    expect(preview.countBought).toBe(0);
  });
});

describe("ownedToolBonusTotals", () => {
  it("is all-neutral (1x, zero owned) before anything is bought", () => {
    const state = freshState({});
    const totals = ownedToolBonusTotals(state);
    expect(totals.ownedCount).toBe(0);
    expect(totals.clickMultiplierProduct).toBe(1);
    expect(totals.globalCpsMultiplierProduct).toBe(1);
  });

  it("reflects exactly the owned tools' effects, ignoring merely-discovered ones", () => {
    // narrator (totalClicks >= 1000, clickMultiplier x1.1) is discovered but NOT owned here.
    const state = freshState({
      stats: { totalClicks: 1000, totalCookiesBaked: bnFromNumber(0), clockAnomalyCount: 0 },
      ownedTools: [],
    });
    expect(ownedToolBonusTotals(state).clickMultiplierProduct).toBe(1);

    const owned = { ...state, ownedTools: [{ id: "narrator", purchasedAtTickCount: 1000 }] };
    expect(ownedToolBonusTotals(owned).ownedCount).toBe(1);
    expect(ownedToolBonusTotals(owned).clickMultiplierProduct).toBeCloseTo(1.1, 6);
  });
});

describe("Tool Shop actually gates the gameplay bonus: discovered-but-unowned grants NOTHING", () => {
  it("clicking with a discovered-but-unowned clickMultiplier tool yields the SAME value as with no tool at all", () => {
    // narrator: totalClicks >= 1000, clickMultiplier x1.1.
    const discoveredNotOwned = freshState({
      stats: { totalClicks: 1000, totalCookiesBaked: bnFromNumber(0), clockAnomalyCount: 0 },
    });
    const noToolAtAll = freshState({
      stats: { totalClicks: 999, totalCookiesBaked: bnFromNumber(0), clockAnomalyCount: 0 },
    });

    const afterDiscovered = applyGameAction(discoveredNotOwned, { type: "click" }, ctxAt(0));
    const afterNoTool = applyGameAction(noToolAtAll, { type: "click" }, ctxAt(0));

    expect(bnToNumber(afterDiscovered.cookies)).toBeCloseTo(bnToNumber(afterNoTool.cookies), 6);
    // Sanity: computeMultipliers() (the OLD, unchanged, condition-only pipeline) DOES already
    // consider narrator active here -- proving the suppression comes from the correction, not
    // from narrator failing to unlock.
    expect(computeMultipliers(discoveredNotOwned).clickMultiplier).toBeCloseTo(1.1, 6);
  });

  it("owning that same tool grants EXACTLY its documented multiplier", () => {
    const owned = freshState({
      stats: { totalClicks: 1000, totalCookiesBaked: bnFromNumber(0), clockAnomalyCount: 0 },
      ownedTools: [{ id: "narrator", purchasedAtTickCount: 1000 }],
    });
    const baseline = freshState({
      stats: { totalClicks: 999, totalCookiesBaked: bnFromNumber(0), clockAnomalyCount: 0 },
    });

    const afterOwned = applyGameAction(owned, { type: "click" }, ctxAt(0));
    const afterBaseline = applyGameAction(baseline, { type: "click" }, ctxAt(0));

    expect(bnToNumber(afterOwned.cookies) / bnToNumber(afterBaseline.cookies)).toBeCloseTo(1.1, 4);
  });

  it("a discovered-but-unowned generatorMultiplier tool does not change that generator's CPS", () => {
    // regexBuilder: cursor >= 10, generatorMultiplier cursor x1.1.
    const discoveredNotOwned = freshState({ generators: [{ id: "cursor", count: 10 }] });
    const noTool = freshState({ generators: [{ id: "cursor", count: 9 }] });
    // Compare per-unit CPS to cancel out the linear owned-count difference.
    const perUnitDiscovered = bnToNumber(totalCps(discoveredNotOwned)) / 10;
    const perUnitNoTool = bnToNumber(totalCps(noTool)) / 9;
    expect(perUnitDiscovered).toBeCloseTo(perUnitNoTool, 6);
  });

  it("owning a generatorMultiplier tool changes tick-accrued cookies by exactly its multiplier", () => {
    const owned = freshState({
      generators: [{ id: "cursor", count: 10 }],
      ownedTools: [{ id: "regexBuilder", purchasedAtTickCount: 0 }],
    });
    const notOwned = freshState({ generators: [{ id: "cursor", count: 10 }] });

    const afterOwned = applyGameAction(owned, { type: "tick", elapsedMs: 10000 }, ctxAt(0));
    const afterNotOwned = applyGameAction(notOwned, { type: "tick", elapsedMs: 10000 }, ctxAt(0));

    expect(bnToNumber(afterOwned.cookies) / bnToNumber(afterNotOwned.cookies)).toBeCloseTo(1.1, 4);
  });

  it("toolProgressionEnabled=false bypasses BOTH the condition gate and the ownership gate (existing escape hatch preserved)", () => {
    const state = freshState({ toolProgressionEnabled: false, ownedTools: [] });
    const correction = toolOwnershipCorrection(state);
    expect(correction.clickMultiplier).toBe(1);
    expect(correction.globalCpsMultiplier).toBe(1);
    // Every tool bonus is active per tools.ts's own contract when this toggle is off; the shop
    // must not additionally suppress anything on top of that.
    const afterClick = applyGameAction(state, { type: "click" }, ctxAt(0));
    const multipliers = computeMultipliers(state);
    expect(bnToNumber(afterClick.cookies)).toBeCloseTo(multipliers.clickMultiplier, 4);
  });
});

describe("LOAD-BEARING: the Tool Shop can never gate the real application feature", () => {
  it("gatesApplicationFeature stays structurally false for every tool (re-verified from this module's own import)", () => {
    for (const def of TOOL_DEFINITIONS) {
      expect(def.gatesApplicationFeature).toBe(false);
    }
  });

  it("this module exposes no isFeatureAvailable-shaped predicate", () => {
    // This exact assertion shape was manually broken and restored once during development --
    // a temporary `export function isFeatureAvailable() {}` was added to tool-shop.ts, this
    // suite was re-run and this test went red, the temporary export was removed, and the suite
    // was re-run again and this test went green. See the task report for the transcript.
    const anyModule = ToolShopModule as unknown as Record<string, unknown>;
    expect(anyModule.isFeatureAvailable).toBeUndefined();
    expect(anyModule.isToolFeatureAvailable).toBeUndefined();
    expect(anyModule.isApplicationFeatureGated).toBeUndefined();
  });
});
