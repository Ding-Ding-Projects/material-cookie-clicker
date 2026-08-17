import { describe, expect, it } from "vitest";

import { bnFromNumber, bnToNumber } from "../../src/shared/game/big-number";
import {
  computeDisclosure,
  isHoldToClickEnabled,
  visibleGeneratorLadder,
  PRESTIGE_CONSOLE_ACHIEVEMENT_ID,
} from "../../src/shared/game/disclosure";
import { GENERATOR_DEFINITIONS } from "../../src/shared/game/generators";
import { applyGameAction, type ReducerCtx } from "../../src/shared/game/reducer";
import { decodeSave } from "../../src/shared/game/save-codec";
import { SAVE_SCHEMA_VERSION } from "../../src/shared/game/save-schema";
import { TOOL_DEFINITIONS } from "../../src/shared/game/tools";
import { REVEAL_UPGRADE_DEFINITIONS, UPGRADE_DEFINITIONS } from "../../src/shared/game/upgrades";
import {
  createHoldToClickController,
  defaultHoldToClickScheduler,
  type HoldToClickScheduler,
} from "../../src/renderer/game/hold-to-click";
import { fixedRng, freshState } from "./test-helpers";

function ctxAt(epochMs = 0, rngValue = 0.99): ReducerCtx {
  return { now: () => epochMs, rng: fixedRng(rngValue) };
}

/** A scheduler that records the repeat callback instead of running a real timer. */
function fakeScheduler(): HoldToClickScheduler & { fire(times: number): void; scheduled: boolean } {
  let callback: (() => void) | null = null;
  return {
    schedule(cb) {
      callback = cb;
      return "handle";
    },
    cancel() {
      callback = null;
    },
    get scheduled() {
      return callback !== null;
    },
    fire(times: number) {
      for (let i = 0; i < times; i += 1) callback?.();
    },
  };
}

describe("disclosure: a fresh save shows nothing but the cookie", () => {
  it("has no shop, no upgrade strip, no hold-to-click, no readouts and no console emblems", () => {
    const disclosure = computeDisclosure(freshState());
    expect(disclosure).toEqual({
      shop: false,
      upgradeStrip: false,
      holdToClick: false,
      dieselDepot: false,
      dieselFactory: false,
      perSecondReadout: false,
      perClickReadout: false,
      consoles: { achievements: false, tools: false, statistics: false, prestige: false, factory: false },
    });
  });

  it("owns none of the four reveal upgrades", () => {
    expect(freshState().upgrades).toEqual([]);
    expect(REVEAL_UPGRADE_DEFINITIONS).toHaveLength(4);
  });

  it("still lets the player click the cookie — clicking is never gated", () => {
    const next = applyGameAction(freshState(), { type: "click" }, ctxAt());
    expect(bnToNumber(next.cookies)).toBeCloseTo(1, 6);
  });
});

describe("disclosure: each reveal upgrade flips exactly its own surface", () => {
  it("Shop Sign reveals the shop rail and nothing else", () => {
    const before = freshState({ cookies: bnFromNumber(10) });
    const after = applyGameAction(before, { type: "buyUpgrade", upgradeId: "reveal_shop_sign" }, ctxAt());
    const disclosure = computeDisclosure(after);

    expect(disclosure.shop).toBe(true);
    expect(disclosure.upgradeStrip).toBe(false);
    expect(disclosure.holdToClick).toBe(false);
    expect(disclosure.perSecondReadout).toBe(false);
    expect(disclosure.perClickReadout).toBe(false);
    // The Achievements emblem now appears here, and that is not the reveal leaking: buying any
    // upgrade at all satisfies the "1 Upgrade Bought" badge (achievements.ts), so the player
    // genuinely has an achievement to look at. Every other console stays bolted down.
    expect(disclosure.consoles).toEqual({
      achievements: true,
      tools: false,
      statistics: false,
      prestige: false,
      factory: false,
    });
    expect(bnToNumber(after.cookies)).toBeCloseTo(0, 6);
  });

  it("Upgrade Catalogue reveals the upgrade strip, and only after the Shop Sign is owned", () => {
    const withoutSign = freshState({ cookies: bnFromNumber(1000) });
    const refused = applyGameAction(
      withoutSign,
      { type: "buyUpgrade", upgradeId: "reveal_upgrade_catalogue" },
      ctxAt(),
    );
    expect(refused).toBe(withoutSign);
    expect(computeDisclosure(refused).upgradeStrip).toBe(false);

    const withSign = applyGameAction(withoutSign, { type: "buyUpgrade", upgradeId: "reveal_shop_sign" }, ctxAt());
    const after = applyGameAction(withSign, { type: "buyUpgrade", upgradeId: "reveal_upgrade_catalogue" }, ctxAt());
    const disclosure = computeDisclosure(after);

    expect(disclosure.upgradeStrip).toBe(true);
    expect(disclosure.shop).toBe(true);
    expect(disclosure.holdToClick).toBe(false);
  });

  it("Steady Hand reveals hold-to-click and the per-click readout, and only after the Catalogue", () => {
    let state = freshState({ cookies: bnFromNumber(1000) });
    const refused = applyGameAction(state, { type: "buyUpgrade", upgradeId: "reveal_steady_hand" }, ctxAt());
    expect(refused).toBe(state);

    for (const id of ["reveal_shop_sign", "reveal_upgrade_catalogue", "reveal_steady_hand"]) {
      state = applyGameAction(state, { type: "buyUpgrade", upgradeId: id }, ctxAt());
    }
    const disclosure = computeDisclosure(state);

    expect(disclosure.holdToClick).toBe(true);
    expect(disclosure.perClickReadout).toBe(true);
    // Buying the hand does not conjure production out of nothing.
    expect(disclosure.perSecondReadout).toBe(false);
  });

  it("refuses a reveal the player cannot afford, leaving every surface hidden", () => {
    const broke = freshState({ cookies: bnFromNumber(9) });
    const after = applyGameAction(broke, { type: "buyUpgrade", upgradeId: "reveal_shop_sign" }, ctxAt());
    expect(after).toBe(broke);
    expect(computeDisclosure(after).shop).toBe(false);
  });

  it("reveal upgrades multiply nothing — they are surface, not power", () => {
    let state = freshState({ cookies: bnFromNumber(1000) });
    for (const id of ["reveal_shop_sign", "reveal_upgrade_catalogue", "reveal_steady_hand"]) {
      state = applyGameAction(state, { type: "buyUpgrade", upgradeId: id }, ctxAt());
    }
    const clicked = applyGameAction({ ...state, cookies: bnFromNumber(0) }, { type: "click" }, ctxAt());
    expect(bnToNumber(clicked.cookies)).toBeCloseTo(1, 6);
  });
});

describe("disclosure: hold-to-click is inert before Steady Hand", () => {
  it("does not start, does not fire the immediate click, and schedules no repeat", () => {
    let state = freshState();
    const scheduler = fakeScheduler();
    const controller = createHoldToClickController(
      () => {
        state = applyGameAction(state, { type: "click" }, ctxAt());
      },
      scheduler,
      10,
      () => isHoldToClickEnabled(state),
    );

    controller.start();
    expect(controller.isActive()).toBe(false);
    expect(scheduler.scheduled).toBe(false);
    scheduler.fire(5);
    expect(state.stats.totalClicks).toBe(0);
  });

  it("repeats through the REAL setInterval scheduler once Steady Hand is owned", async () => {
    // The fake-scheduler test below proves the wiring; this one proves the shipped timer path —
    // defaultHoldToClickScheduler's own setInterval — actually drives the reducer while a hold
    // is held, with no individual presses in between.
    let state = freshState({ cookies: bnFromNumber(1000) });
    for (const id of ["reveal_shop_sign", "reveal_upgrade_catalogue", "reveal_steady_hand"]) {
      state = applyGameAction(state, { type: "buyUpgrade", upgradeId: id }, ctxAt());
    }
    expect(isHoldToClickEnabled(state)).toBe(true);

    const controller = createHoldToClickController(
      () => {
        state = applyGameAction(state, { type: "click" }, ctxAt());
      },
      defaultHoldToClickScheduler,
      20,
      () => isHoldToClickEnabled(state),
    );

    controller.start(); // one press down, held...
    await new Promise((resolve) => setTimeout(resolve, 250));
    controller.stop(); // ...and released.

    expect(state.stats.totalClicks).toBeGreaterThan(5);
  });

  it("repeats through the real reducer once Steady Hand is owned", () => {
    let state = freshState({ cookies: bnFromNumber(1000) });
    for (const id of ["reveal_shop_sign", "reveal_upgrade_catalogue", "reveal_steady_hand"]) {
      state = applyGameAction(state, { type: "buyUpgrade", upgradeId: id }, ctxAt());
    }

    const scheduler = fakeScheduler();
    const controller = createHoldToClickController(
      () => {
        state = applyGameAction(state, { type: "click" }, ctxAt());
      },
      scheduler,
      10,
      () => isHoldToClickEnabled(state),
    );

    controller.start();
    expect(controller.isActive()).toBe(true);
    scheduler.fire(4);
    // One immediate click on press, plus four repeats.
    expect(state.stats.totalClicks).toBe(5);
    controller.stop();
    expect(controller.isActive()).toBe(false);
  });
});

describe("disclosure: console emblems are earned by the progress their panel is about", () => {
  it("Achievements appears with the first achievement", () => {
    const before = freshState();
    expect(computeDisclosure(before).consoles.achievements).toBe(false);
    const after = applyGameAction(before, { type: "click" }, ctxAt());
    expect(after.achievements.length).toBeGreaterThan(0);
    expect(computeDisclosure(after).consoles.achievements).toBe(true);
  });

  it("Tools appears with the first discovered tool, and with a shop-bought tool too", () => {
    expect(computeDisclosure(freshState()).consoles.tools).toBe(false);
    const clicked = applyGameAction(freshState(), { type: "click" }, ctxAt());
    // first_bite unlocks the Colour Translator, which is a genuine tool discovery.
    expect(computeDisclosure(clicked).consoles.tools).toBe(true);

    const purchased = freshState({ purchasedToolIds: [TOOL_DEFINITIONS[0]!.id] });
    expect(computeDisclosure(purchased).consoles.tools).toBe(true);
  });

  it("Statistics and the per-second readout appear with the first generator", () => {
    const def = GENERATOR_DEFINITIONS[0]!;
    const before = freshState({ cookies: bnFromNumber(def.baseCost) });
    expect(computeDisclosure(before).consoles.statistics).toBe(false);
    expect(computeDisclosure(before).perSecondReadout).toBe(false);

    const after = applyGameAction(before, { type: "buyGenerator", generatorId: def.id }, ctxAt());
    expect(computeDisclosure(after).consoles.statistics).toBe(true);
    expect(computeDisclosure(after).perSecondReadout).toBe(true);
    // The shop is revealed too: owning a generator means the shop was already reachable.
    expect(computeDisclosure(after).shop).toBe(true);
  });

  it("Prestige appears only once the prestige-horizon achievement is unlocked", () => {
    expect(computeDisclosure(freshState()).consoles.prestige).toBe(false);
    const near = freshState({
      achievements: [{ id: PRESTIGE_CONSOLE_ACHIEVEMENT_ID, unlockedAtIso: "2026-01-01T00:00:00.000Z" }],
    });
    expect(computeDisclosure(near).consoles.prestige).toBe(true);
  });

  it("an ascended player keeps every VIEW surface even though prestige wiped their upgrades", () => {
    const ascended = freshState({
      upgrades: [],
      generators: [],
      prestige: { ascensionPoints: 3, totalPrestigeCount: 1, permanentUnlockIds: [] },
    });
    const disclosure = computeDisclosure(ascended);
    expect(disclosure.shop).toBe(true);
    expect(disclosure.upgradeStrip).toBe(true);
    expect(disclosure.consoles.prestige).toBe(true);
    // But NOT hold-to-click. It is not a view, it is what the input device does, and nothing in
    // this game switches a behaviour on for a player who did not buy it — ascension included.
    expect(disclosure.holdToClick).toBe(false);
    expect(disclosure.perClickReadout).toBe(false);
  });

  it("an ascended player who re-buys Steady Hand has it back", () => {
    const rebought = freshState({
      upgrades: [{ id: "reveal_steady_hand", purchasedAtTickCount: 3 }],
      prestige: { ascensionPoints: 3, totalPrestigeCount: 1, permanentUnlockIds: [] },
    });
    expect(computeDisclosure(rebought).holdToClick).toBe(true);
  });
});

describe("disclosure: the generator ladder shows one rung at a time", () => {
  it("a fresh save sees the first tier plus a single unnamed rung, and nothing deeper", () => {
    const ladder = visibleGeneratorLadder(freshState());
    expect(ladder.map((r) => r.id)).toEqual([GENERATOR_DEFINITIONS[0]!.id, GENERATOR_DEFINITIONS[1]!.id]);
    expect(ladder.map((r) => r.state)).toEqual(["available", "mystery"]);
  });

  it("owning tier N reveals exactly tier N+1's row", () => {
    let state = freshState({ cookies: bnFromNumber(1e9) });
    for (let tier = 0; tier < 4; tier += 1) {
      const before = visibleGeneratorLadder(state);
      state = applyGameAction(
        state,
        { type: "buyGenerator", generatorId: GENERATOR_DEFINITIONS[tier]!.id },
        ctxAt(),
      );
      const after = visibleGeneratorLadder(state);
      expect(after).toHaveLength(before.length + 1);
      const added = after.filter((row) => !before.some((b) => b.id === row.id));
      expect(added.map((r) => r.id)).toEqual([GENERATOR_DEFINITIONS[tier + 2]!.id]);
      // The tier just bought is named and buyable; exactly one unnamed rung trails the list.
      expect(after.filter((r) => r.state === "mystery")).toHaveLength(1);
      expect(after[after.length - 1]!.state).toBe("mystery");
    }
  });

  it("never lists a tier beyond the unnamed rung", () => {
    const ladder = visibleGeneratorLadder(freshState());
    const deepest = GENERATOR_DEFINITIONS[GENERATOR_DEFINITIONS.length - 1]!;
    expect(ladder.some((row) => row.id === deepest.id)).toBe(false);
  });

  it("shows every tier a legacy save already owns, even out of order", () => {
    const deepId = GENERATOR_DEFINITIONS[6]!.id;
    const ladder = visibleGeneratorLadder(freshState({ generators: [{ id: deepId, count: 3 }] }));
    expect(ladder.some((row) => row.id === deepId && row.state === "available")).toBe(true);
    expect(ladder).toHaveLength(9); // tiers 0..7 available, tier 8 unnamed
  });

  it("stops cleanly at the end of the ladder with no unnamed rung left to show", () => {
    const all = GENERATOR_DEFINITIONS.map((def) => ({ id: def.id, count: 1 }));
    const ladder = visibleGeneratorLadder(freshState({ generators: all }));
    expect(ladder).toHaveLength(GENERATOR_DEFINITIONS.length);
    expect(ladder.every((row) => row.state === "available")).toBe(true);
  });
});

describe("disclosure: save compatibility", () => {
  /** A version-2 save: the shape written by the build before disclosure existed. */
  function v2Save(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    const zero = { mantissa: 0, exponent: 0 };
    return {
      schemaVersion: 2,
      cookies: zero,
      lifetimeCookies: { mantissa: 5, exponent: 3 },
      baseClickValue: { mantissa: 1, exponent: 0 },
      generators: [{ id: "cursor", count: 4 }],
      upgrades: [{ id: "reinforced_finger", purchasedAtTickCount: 12 }],
      achievements: [{ id: "first_bite", unlockedAtIso: "2026-01-01T00:00:00.000Z" }],
      prestige: { ascensionPoints: 0, totalPrestigeCount: 0, permanentUnlockIds: [] },
      goldenCookie: { isSpawned: false, rngStreamIndex: 0, nextEligibleAtEpochMs: 0 },
      stats: { totalClicks: 40, totalCookiesBaked: zero, clockAnomalyCount: 0 },
      toolProgressionEnabled: true,
      purchasedToolIds: [],
      lastTickAtIso: "2026-01-01T00:00:00.000Z",
      lastSavedAtIso: "2026-01-01T00:00:00.000Z",
      ...overrides,
    };
  }

  it("migrates a version-2 save to the current version and grants NO reveal upgrade at all", () => {
    const decoded = decodeSave(v2Save());
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;

    expect(decoded.state.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    // Not one of the four is handed out. A migration must never make a player own something
    // they did not buy — the surfaces an old save genuinely used are kept by derivation from
    // the progress already in the save (see the next test), which is the honest route.
    for (const id of [
      "reveal_shop_sign",
      "reveal_upgrade_catalogue",
      "reveal_steady_hand",
      "reveal_fuel_contract",
    ]) {
      expect(decoded.state.upgrades.some((u) => u.id === id)).toBe(false);
    }
    expect(computeDisclosure(decoded.state).dieselDepot).toBe(false);
    // The upgrade it actually bought is untouched.
    expect(decoded.state.upgrades.some((u) => u.id === "reinforced_finger" && u.purchasedAtTickCount === 12)).toBe(true);
  });

  it("keeps every surface an old save could already see, except hold-to-click", () => {
    const decoded = decodeSave(v2Save());
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;

    const disclosure = computeDisclosure(decoded.state);
    // Derived from what the save demonstrably contains: it owns generators, so the shop was
    // open; it owns a non-reveal upgrade, so the ticket strip was.
    expect(disclosure.shop).toBe(true);
    expect(disclosure.upgradeStrip).toBe(true);
    expect(disclosure.perSecondReadout).toBe(true);
    // Steady Hand was never bought by this save and is never granted to it. The hold hint and
    // the hold behaviour both stay off until the player buys the upgrade for real.
    expect(disclosure.holdToClick).toBe(false);
    expect(disclosure.perClickReadout).toBe(false);
    expect(disclosure.consoles.achievements).toBe(true);
    expect(disclosure.consoles.statistics).toBe(true);
    expect(disclosure.consoles.tools).toBe(true);
  });

  it("keeps an old save's generator rows visible for every tier it owns", () => {
    const decoded = decodeSave(v2Save({ generators: [{ id: "cursor", count: 4 }, { id: "grandma", count: 2 }] }));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;

    const ladder = visibleGeneratorLadder(decoded.state);
    expect(ladder.some((r) => r.id === "cursor" && r.state === "available")).toBe(true);
    expect(ladder.some((r) => r.id === "grandma" && r.state === "available")).toBe(true);
    expect(ladder.some((r) => r.id === "farm" && r.state === "available")).toBe(true);
  });

  it("migrates a version-1 save all the way forward without duplicating a reveal", () => {
    const { purchasedToolIds: _dropped, ...v1 } = v2Save({ schemaVersion: 1 });
    const decoded = decodeSave(v1);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;

    expect(decoded.state.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(decoded.state.purchasedToolIds).toEqual([]);
    const ids = decoded.state.upgrades.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("does not re-grant a reveal a save already owns", () => {
    const decoded = decodeSave(
      v2Save({ upgrades: [{ id: "reveal_shop_sign", purchasedAtTickCount: 7 }] }),
    );
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;

    const signs = decoded.state.upgrades.filter((u) => u.id === "reveal_shop_sign");
    expect(signs).toHaveLength(1);
    expect(signs[0]!.purchasedAtTickCount).toBe(7);
  });

  it("a save written by this build round-trips at the current version", () => {
    const decoded = decodeSave({
      ...v2Save(),
      schemaVersion: SAVE_SCHEMA_VERSION,
      dieselDepot: { litresMinted: 0, vouchersMinted: 0, cookiesSpent: { mantissa: 0, exponent: 0 } },
      dieselFactory: {
        equipment: [],
        upgradeIds: [],
        crude: 0,
        litres: 0,
        lifetimeCrude: 0,
        lifetimeLitres: 0,
        cookiesInvested: { mantissa: 0, exponent: 0 },
        autoShipEnabled: false,
        stalledSeconds: 0,
      },
    });
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    // Already current: no migration ran, so nothing was granted.
    expect(decoded.state.upgrades.some((u) => u.id === "reveal_shop_sign")).toBe(false);
  });
});

describe("disclosure: the reveal upgrades are ordinary upgrades", () => {
  it("live in UPGRADE_DEFINITIONS, so the strip's own counter includes them", () => {
    for (const def of REVEAL_UPGRADE_DEFINITIONS) {
      expect(UPGRADE_DEFINITIONS).toContain(def);
    }
  });

  it("form a ladder whose costs rise 10 / 50 / 100 / 500", () => {
    expect(REVEAL_UPGRADE_DEFINITIONS.map((d) => bnToNumber(d.cost))).toEqual([10, 50, 100, 500]);
  });

  it("declare no multiplier at all", () => {
    for (const def of REVEAL_UPGRADE_DEFINITIONS) {
      expect(def.effect.kind).toBe("reveal");
    }
  });
});
