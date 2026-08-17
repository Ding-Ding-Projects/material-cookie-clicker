import { describe, expect, it } from "vitest";

import { bnFromNumber, bnToNumber } from "../../src/shared/game/big-number";
import {
  ALL_CONTROL_RUNG_IDS,
  CONTROL_UNLOCKS,
  CONTROL_CONFIRM_BALANCE_FRACTION,
  canBuyControlRung,
  controlRungLevel,
  controlRungPrice,
  createInitialControlUnlocksState,
  findControlRung,
  getControlUnlock,
  grantedRungIdsForMigration,
  hasControlRung,
  isControlUnlocked,
  MIGRATION_GRANT_LIFETIME_THRESHOLD,
  needsPurchaseConfirmation,
  nextControlRung,
  V6_GRANDFATHERED_RUNG_IDS,
  V7_GRANDFATHERED_RUNG_IDS,
} from "../../src/shared/game/control-unlocks";
import { migrateToLatest } from "../../src/shared/game/migrations";
import { applyGameAction, createInitialGameState } from "../../src/shared/game/reducer";
import { decodeSave, encodeSave } from "../../src/shared/game/save-codec";
import { SAVE_SCHEMA_VERSION } from "../../src/shared/game/save-schema";
import { GameStore } from "../../src/renderer/game/store";
import type { GameState } from "../../src/shared/game/types";
import { computeDisclosure } from "../../src/shared/game/disclosure";
import { CATALOGUE_PANEL_ID, consolePanelIds, SETTINGS_PANEL_ID } from "../../src/renderer/game/console-panels";
import { fixedRng, freshState } from "./test-helpers";

const ctx = { now: () => Date.parse("2026-06-01T00:00:00.000Z"), rng: fixedRng() };

function withCookies(cookies: number, overrides: Partial<GameState> = {}): GameState {
  return freshState({ cookies: bnFromNumber(cookies), ...overrides });
}

function buy(state: GameState, rungId: string): GameState {
  return applyGameAction(state, { type: "buyControlUnlock", rungId }, ctx);
}

/* ────────────────────────────────────────────────────────────── registry integrity */

describe("control-unlocks: registry integrity", () => {
  it("gives every control at least one rung", () => {
    for (const control of CONTROL_UNLOCKS) {
      expect(control.rungs.length).toBeGreaterThan(0);
    }
  });

  it("has globally unique control ids", () => {
    const ids = CONTROL_UNLOCKS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has globally unique rung ids across every ladder", () => {
    expect(new Set(ALL_CONTROL_RUNG_IDS).size).toBe(ALL_CONTROL_RUNG_IDS.length);
  });

  it("prices every ladder strictly upward, so a later rung is never cheaper", () => {
    for (const control of CONTROL_UNLOCKS) {
      const prices = control.rungs.map((r) => r.price);
      for (let i = 1; i < prices.length; i += 1) {
        expect(prices[i]).toBeGreaterThan(prices[i - 1]);
      }
    }
  });

  it("prices everything as a positive whole number of cookies", () => {
    for (const rungId of ALL_CONTROL_RUNG_IDS) {
      const price = bnToNumber(controlRungPrice(rungId));
      expect(price).toBeGreaterThan(0);
      expect(Number.isInteger(price)).toBe(true);
    }
  });

  it("prices the bands the way control-unlocks.ts documents them", () => {
    // Window chrome is the cheapest thing in the game on purpose: the first minute of a fresh
    // save is spent clicking a cookie in a window that cannot be moved, and that minute has to
    // end quickly.
    for (const control of CONTROL_UNLOCKS.filter((c) => c.group === "chrome")) {
      expect(control.rungs[0].price).toBeLessThanOrEqual(100);
    }
    // Settings entries and the first rung of a search field are reachable inside the first few
    // dozen clicks.
    for (const control of CONTROL_UNLOCKS.filter((c) => c.group === "settings" || c.group === "search")) {
      expect(control.rungs[0].price).toBeLessThanOrEqual(100);
    }
    // Everything else is a convenience, and the ONE deliberate outlier is the auto-ship switch:
    // it belongs to a factory that costs millions to build, so pricing it like a drag handle
    // would be pricing it like nothing.
    const autoShip = getControlUnlock("toggle.autoShip");
    expect(autoShip.rungs[0].price).toBe(2_500);
    for (const control of CONTROL_UNLOCKS.filter((c) => c.id !== "toggle.autoShip")) {
      expect(control.rungs[0].price).toBeLessThanOrEqual(300);
    }
  });

  it("writes both languages for every control and every rung", () => {
    for (const control of CONTROL_UNLOCKS) {
      expect(control.nameEn.length).toBeGreaterThan(0);
      expect(control.nameYue.length).toBeGreaterThan(0);
      expect(control.whereEn.length).toBeGreaterThan(0);
      expect(control.whereYue.length).toBeGreaterThan(0);
      for (const rung of control.rungs) {
        expect(rung.nameEn.length).toBeGreaterThan(0);
        expect(rung.nameYue.length).toBeGreaterThan(0);
        expect(rung.detailEn.length).toBeGreaterThan(0);
        expect(rung.detailYue.length).toBeGreaterThan(0);
      }
    }
  });

  it("resolves every rung id back to its own control", () => {
    for (const control of CONTROL_UNLOCKS) {
      control.rungs.forEach((rung, index) => {
        const found = findControlRung(rung.id);
        expect(found).not.toBeNull();
        expect(found?.control.id).toBe(control.id);
        expect(found?.index).toBe(index);
      });
    }
  });

  it("refuses to price or resolve an id that is not in the table", () => {
    expect(findControlRung("chrome.teleport")).toBeNull();
    expect(() => controlRungPrice("chrome.teleport")).toThrow(RangeError);
    expect(() => getControlUnlock("chrome.teleport")).toThrow(RangeError);
  });
});

/* ─────────────────────────────────────────────────────────────────── THE FLOORS */

describe("control-unlocks: the floors are never for sale", () => {
  const haystack = JSON.stringify(CONTROL_UNLOCKS).toLowerCase();

  it("never sells the close button", () => {
    // Both the ids and the prose. If anybody ever adds a rung about closing the window, this
    // fails, and it should: a build that can trap somebody inside itself is a defect.
    expect(ALL_CONTROL_RUNG_IDS.some((id) => id.toLowerCase().includes("close"))).toBe(false);
    expect(CONTROL_UNLOCKS.some((c) => c.id.toLowerCase().includes("close"))).toBe(false);
    expect(haystack).not.toContain("close the window");
    expect(haystack).not.toContain("quit");
  });

  it("DOES sell the Settings surface now, by the owner's decree, and cheaply", () => {
    // This test used to assert the opposite. The owner looked at the console and said "settings
    // still appearing" / "needs to be purchased", and that boundary was theirs to move, so it
    // moved — see the header of control-unlocks.ts. What survives is the SHAPE of the promise:
    // the price is small, printed, and payable by a save that has done nothing but click.
    expect(ALL_CONTROL_RUNG_IDS).toContain("settings.open");
    expect(bnToNumber(controlRungPrice("settings.open"))).toBe(25);
    // Cheaper than every entry it now stands in front of, so the door is never the expensive part.
    for (const control of CONTROL_UNLOCKS.filter((c) => c.group === "settings" && c.id !== "settings.open")) {
      expect(control.rungs[0].price).toBeGreaterThan(25);
    }
  });

  it("keeps it PRICED and never progress-gated: one rung, no prerequisite, buyable at 25 cookies from a fresh save", () => {
    // The distinction the brief turns on. A fresh save with exactly the price in hand can buy it
    // outright — no milestone, no tool, no other rung in front of it.
    const control = getControlUnlock("settings.open");
    expect(control.rungs).toHaveLength(1);
    const fresh = withCookies(25);
    expect(isControlUnlocked(fresh, "settings.open")).toBe(false);
    expect(canBuyControlRung(fresh, "settings.open")).toBe(true);
    const bought = buy(fresh, "settings.open");
    expect(isControlUnlocked(bought, "settings.open")).toBe(true);
    expect(bnToNumber(bought.cookies)).toBeCloseTo(0, 6);
  });

  it("never sells the controls catalogue or its own search field", () => {
    expect(ALL_CONTROL_RUNG_IDS.some((id) => id.includes("catalogue"))).toBe(false);
    expect(ALL_CONTROL_RUNG_IDS).not.toContain("search.catalogue");
    expect(ALL_CONTROL_RUNG_IDS).not.toContain("search.controls");
  });

  it("keeps the catalogue reachable OUTSIDE Settings, which is what makes selling Settings honest", () => {
    // The floor is no longer "the room is free"; it is "the price list is free". So the
    // catalogue has its own console button, appended unconditionally, and no rung sells it.
    const fresh = freshState();
    expect(isControlUnlocked(fresh, "settings.open")).toBe(false);
    const ids = consolePanelIds(computeDisclosure(fresh));
    expect(ids).toContain(CATALOGUE_PANEL_ID);
    // And it is not behind the thing it prices.
    expect(ids.indexOf(CATALOGUE_PANEL_ID)).toBeLessThan(ids.indexOf(SETTINGS_PANEL_ID));
    for (const id of ALL_CONTROL_RUNG_IDS) {
      expect(id.startsWith("console.")).toBe(false);
      expect(id.startsWith("panel.")).toBe(false);
    }
  });

  it("sells the two non-English language modes and never English", () => {
    // "unlock more languages by buying" — with the floor that the app stays readable for free.
    expect(ALL_CONTROL_RUNG_IDS).toContain("settings.language.yue");
    expect(ALL_CONTROL_RUNG_IDS).toContain("settings.language.both");
    expect(ALL_CONTROL_RUNG_IDS).not.toContain("settings.language.en");
    expect(ALL_CONTROL_RUNG_IDS.some((id) => id.toLowerCase().includes("english"))).toBe(false);
  });

  it("keeps the two modes independent of each other rather than a ladder", () => {
    // Buying bilingual must not require buying Cantonese first: they are two destinations, not
    // two rungs, and a ladder would invent an order the feature does not have.
    const rich = withCookies(1_000);
    expect(canBuyControlRung(rich, "settings.language.both")).toBe(true);
    const both = buy(rich, "settings.language.both");
    expect(hasControlRung(both, "settings.language.both")).toBe(true);
    expect(hasControlRung(both, "settings.language.yue")).toBe(false);
  });

  it("keeps ×1 free by never giving the stepper ladder a ×1 rung", () => {
    const stepper = getControlUnlock("stepper");
    expect(stepper.rungs.map((r) => r.id)).toEqual(["stepper.x10", "stepper.x100", "stepper.max"]);
  });

  it("covers every surface the owner named", () => {
    const ids = CONTROL_UNLOCKS.map((c) => c.id);
    for (const required of [
      "chrome.drag",
      "chrome.minimize",
      "chrome.maximize",
      "chrome.resize",
      "settings.language",
      "settings.funny.en",
      "settings.funny.yue",
      "search.generators",
      "search.upgrades",
      "search.achievements",
      "search.tools",
      "stepper",
      "bulk",
      "toggle.toolProgression",
      "toggle.autoShip",
    ]) {
      expect(ids).toContain(required);
    }
  });
});

/* ────────────────────────────────────────────────────── reducer purchase arithmetic */

describe("control-unlocks: reducer purchase arithmetic", () => {
  it("starts a fresh save owning nothing at all", () => {
    const fresh = createInitialGameState("2026-06-01T00:00:00.000Z");
    expect(fresh.controlUnlocks).toEqual(createInitialControlUnlocksState());
    for (const control of CONTROL_UNLOCKS) {
      expect(isControlUnlocked(fresh, control.id)).toBe(false);
    }
  });

  it("takes exactly the printed price and records exactly the rung bought", () => {
    const before = withCookies(500);
    const after = buy(before, "chrome.drag");
    expect(bnToNumber(after.cookies)).toBeCloseTo(490, 6);
    expect(hasControlRung(after, "chrome.drag")).toBe(true);
    expect(after.controlUnlocks?.purchasedRungIds).toEqual(["chrome.drag"]);
  });

  it("refuses silently when the cookies are not there, changing nothing", () => {
    const before = withCookies(9);
    expect(buy(before, "chrome.drag")).toBe(before);
  });

  it("refuses to buy the same rung twice", () => {
    const once = buy(withCookies(500), "chrome.drag");
    const twice = buy(once, "chrome.drag");
    expect(twice).toBe(once);
    expect(bnToNumber(twice.cookies)).toBeCloseTo(490, 6);
  });

  it("refuses an unknown rung id", () => {
    const before = withCookies(1_000_000);
    expect(buy(before, "chrome.teleport")).toBe(before);
  });

  it("refuses a rung whose predecessor is not owned — no skipping to Max", () => {
    const rich = withCookies(1_000_000);
    expect(buy(rich, "stepper.max")).toBe(rich);
    expect(buy(rich, "stepper.x100")).toBe(rich);

    const withTen = buy(rich, "stepper.x10");
    expect(hasControlRung(withTen, "stepper.x10")).toBe(true);
    expect(buy(withTen, "stepper.max")).toBe(withTen);
  });

  it("walks a whole ladder in order and charges each rung once", () => {
    let state = withCookies(10_000);
    state = buy(state, "stepper.x10");
    state = buy(state, "stepper.x100");
    state = buy(state, "stepper.max");
    expect(controlRungLevel(state, "stepper")).toBe(3);
    expect(nextControlRung(state, "stepper")).toBeNull();
    // 120 + 900 + 6000
    expect(bnToNumber(state.cookies)).toBeCloseTo(10_000 - 7_020, 6);
  });

  it("never lets a purchase drive the balance negative", () => {
    const exact = withCookies(10);
    const after = buy(exact, "chrome.drag");
    expect(bnToNumber(after.cookies)).toBeCloseTo(0, 6);
  });

  it("counts a ladder level up to the first gap, never past it", () => {
    // A hand-edited save carrying Max without ×100 must not be read as owning the whole ladder.
    const tampered = freshState({
      controlUnlocks: { purchasedRungIds: ["stepper.x10", "stepper.max"] },
    });
    expect(controlRungLevel(tampered, "stepper")).toBe(1);
    expect(nextControlRung(tampered, "stepper")?.id).toBe("stepper.x100");
  });

  it("agrees with canBuyControlRung about every refusal", () => {
    const poor = withCookies(5);
    expect(canBuyControlRung(poor, "chrome.drag")).toBe(false);
    expect(buy(poor, "chrome.drag")).toBe(poor);

    const rich = withCookies(50_000);
    expect(canBuyControlRung(rich, "stepper.x100")).toBe(false);
    expect(canBuyControlRung(rich, "stepper.x10")).toBe(true);
    expect(canBuyControlRung(rich, "nope")).toBe(false);
  });
});

/* ────────────────────────────────────────────────────────── the confirmation threshold */

describe("control-unlocks: the confirmation threshold", () => {
  it("asks first for anything over one percent of the balance", () => {
    // 10-cookie drag handle against a 500-cookie balance: 1% is 5, so it asks.
    expect(needsPurchaseConfirmation(withCookies(500), "chrome.drag")).toBe(true);
    // Against 2,000 cookies, 1% is 20, so a 10-cookie purchase goes straight through.
    expect(needsPurchaseConfirmation(withCookies(2_000), "chrome.drag")).toBe(false);
  });

  it("always asks when the balance is empty rather than silently doing nothing", () => {
    expect(needsPurchaseConfirmation(withCookies(0), "chrome.drag")).toBe(true);
  });

  it("never interrupts a late-game balance that has overflowed a double", () => {
    // Past 1e308 the balance reads as Infinity through `bnToNumber`. That is a very large jar,
    // not an unreadable one, and one per cent of it clears every price in the table — so the
    // idle player buying a 10-cookie drag handle is not stopped and asked about it.
    const astronomical = freshState({ cookies: { mantissa: 3.5, exponent: 400 } });
    expect(bnToNumber(astronomical.cookies)).toBe(Number.POSITIVE_INFINITY);
    for (const rungId of ["chrome.drag", "stepper.max", "search.tools.tokens"]) {
      expect(needsPurchaseConfirmation(astronomical, rungId)).toBe(false);
    }
  });

  it("still asks when the balance is genuinely unreadable", () => {
    expect(needsPurchaseConfirmation(freshState({ cookies: { mantissa: Number.NaN, exponent: 3 } }), "chrome.drag")).toBe(
      true,
    );
  });

  it("keeps the documented fraction at one percent", () => {
    expect(CONTROL_CONFIRM_BALANCE_FRACTION).toBe(0.01);
  });
});

/* ─────────────────────────────────────────────── search and stepper gating decisions */

describe("control-unlocks: search and stepper gating", () => {
  it("gates each surface's search field separately", () => {
    const state = buy(withCookies(1_000), "search.generators");
    expect(isControlUnlocked(state, "search.generators")).toBe(true);
    expect(isControlUnlocked(state, "search.upgrades")).toBe(false);
    expect(isControlUnlocked(state, "search.achievements")).toBe(false);
    expect(isControlUnlocked(state, "search.tools")).toBe(false);
  });

  it("gives every search field the same three-rung ladder at the same prices", () => {
    const shapes = ["search.generators", "search.upgrades", "search.achievements", "search.tools"].map((id) =>
      getControlUnlock(id).rungs.map((r) => r.price),
    );
    for (const shape of shapes) expect(shape).toEqual([50, 400, 1_500]);
  });

  it("puts the regex builder above the plain field and the token palette above that", () => {
    let state = withCookies(10_000);
    expect(canBuyControlRung(state, "search.tools.builder")).toBe(false);
    state = buy(state, "search.tools");
    expect(canBuyControlRung(state, "search.tools.tokens")).toBe(false);
    expect(canBuyControlRung(state, "search.tools.builder")).toBe(true);
    state = buy(state, "search.tools.builder");
    expect(canBuyControlRung(state, "search.tools.tokens")).toBe(true);
  });

  it("reads the stepper level as exactly how many multiples are offered above ×1", () => {
    let state = withCookies(10_000);
    expect(controlRungLevel(state, "stepper")).toBe(0);
    state = buy(state, "stepper.x10");
    expect(controlRungLevel(state, "stepper")).toBe(1);
    state = buy(state, "stepper.x100");
    expect(controlRungLevel(state, "stepper")).toBe(2);
  });

  it("sells the bulk checkboxes before the bulk toolbar", () => {
    let state = withCookies(10_000);
    expect(canBuyControlRung(state, "bulk.toolbar")).toBe(false);
    state = buy(state, "bulk.select");
    expect(canBuyControlRung(state, "bulk.toolbar")).toBe(true);
  });
});

/* ──────────────────────────────────────────────────────────────── migration policy */

describe("control-unlocks: the migration policy", () => {
  it("grants nothing to a save that never really got going", () => {
    expect(grantedRungIdsForMigration(0)).toEqual([]);
    expect(grantedRungIdsForMigration(MIGRATION_GRANT_LIFETIME_THRESHOLD)).toEqual([]);
  });

  it("grants the whole frozen version-6 table to a save that has been played", () => {
    expect(grantedRungIdsForMigration(MIGRATION_GRANT_LIFETIME_THRESHOLD + 1)).toEqual(
      V6_GRANDFATHERED_RUNG_IDS,
    );
    expect(grantedRungIdsForMigration(1e12)).toEqual(V6_GRANDFATHERED_RUNG_IDS);
  });

  it("grants nothing for a nonsense lifetime figure", () => {
    expect(grantedRungIdsForMigration(Number.NaN)).toEqual([]);
    expect(grantedRungIdsForMigration({ mantissa: Number.NaN, exponent: 12 })).toEqual([]);
  });

  it("grants an astronomically large save the whole table rather than nothing", () => {
    // A 1e400-scale lifetime total is what a deep idle save actually looks like, and it does not
    // survive `bnToNumber` — it overflows to Infinity. Infinity is above the threshold, not
    // unreadable, and the grandfather clause exists for exactly this player.
    const astronomical = { mantissa: 1.234, exponent: 400 };
    expect(bnToNumber(astronomical)).toBe(Number.POSITIVE_INFINITY);
    expect(grantedRungIdsForMigration(astronomical)).toEqual(V6_GRANDFATHERED_RUNG_IDS);
    expect(grantedRungIdsForMigration(Number.POSITIVE_INFINITY)).toEqual(V6_GRANDFATHERED_RUNG_IDS);
  });

  it("carries that through the real v5 → v6 migration, so a maxed save keeps its controls", () => {
    const migrated = migrateToLatest(
      { schemaVersion: 5, lifetimeCookies: { mantissa: 4.2, exponent: 400 } },
      5,
    );
    expect(migrated.finalVersion).toBeGreaterThanOrEqual(6);
    // Walking all the way to the latest schema runs the v6 → v7 step too, which grants the three
    // controls that used to be free and are now sold. A maxed save keeps every one of them.
    expect((migrated.data.controlUnlocks as { purchasedRungIds: string[] }).purchasedRungIds).toEqual([
      ...V6_GRANDFATHERED_RUNG_IDS,
      ...V7_GRANDFATHERED_RUNG_IDS,
    ]);
  });

  it("still grants a tiny save nothing when it goes through the same migration", () => {
    const migrated = migrateToLatest({ schemaVersion: 5, lifetimeCookies: { mantissa: 5, exponent: 1 } }, 5);
    expect((migrated.data.controlUnlocks as { purchasedRungIds: string[] }).purchasedRungIds).toEqual([]);
  });

  it("keeps the frozen list a real subset of the live registry", () => {
    // Every id in the grandfathered list must still exist. The reverse is deliberately NOT
    // asserted: a control added after version 6 was never usable by an older save and must not
    // appear in the grant.
    for (const id of V6_GRANDFATHERED_RUNG_IDS) {
      expect(findControlRung(id)).not.toBeNull();
    }
  });

  it("keeps the threshold at the documented one thousand lifetime cookies", () => {
    expect(MIGRATION_GRANT_LIFETIME_THRESHOLD).toBe(1_000);
  });

  it("walks a version-5 save forward and grants by its lifetime figure", () => {
    const base = {
      schemaVersion: 5,
      lifetimeCookies: { mantissa: 5, exponent: 3 }, // 5,000
    };
    const played = migrateToLatest({ ...base }, 5);
    expect(played.finalVersion).toBe(SAVE_SCHEMA_VERSION);
    expect((played.data.controlUnlocks as { purchasedRungIds: string[] }).purchasedRungIds).toEqual([
      ...V6_GRANDFATHERED_RUNG_IDS,
      ...V7_GRANDFATHERED_RUNG_IDS,
    ]);

    const barely = migrateToLatest({ schemaVersion: 5, lifetimeCookies: { mantissa: 4, exponent: 2 } }, 5);
    expect((barely.data.controlUnlocks as { purchasedRungIds: string[] }).purchasedRungIds).toEqual([]);
  });

  it("v6 → v7: hands a played save the three controls that used to be free, and nothing else", () => {
    // The version-7 step exists only because the owner's two decrees put a price on things that
    // were free in version 6: the Settings emblem and the two non-English language modes. A save
    // that had been using them keeps them, on the same evidence and the same threshold as v6.
    const played = migrateToLatest(
      {
        schemaVersion: 6,
        lifetimeCookies: { mantissa: 5, exponent: 3 },
        controlUnlocks: { purchasedRungIds: ["chrome.drag"] },
      },
      6,
    );
    expect(played.finalVersion).toBe(SAVE_SCHEMA_VERSION);
    expect((played.data.controlUnlocks as { purchasedRungIds: string[] }).purchasedRungIds).toEqual([
      "chrome.drag",
      ...V7_GRANDFATHERED_RUNG_IDS,
    ]);
    // It chains nothing: the rest of the v6 table is NOT re-granted by this step.
    expect((played.data.controlUnlocks as { purchasedRungIds: string[] }).purchasedRungIds).not.toContain(
      "stepper.max",
    );
  });

  it("v6 → v7: a save under the threshold pays for the door and the languages like a fresh one", () => {
    const barely = migrateToLatest(
      {
        schemaVersion: 6,
        lifetimeCookies: { mantissa: 4, exponent: 2 },
        controlUnlocks: { purchasedRungIds: [] },
      },
      6,
    );
    expect((barely.data.controlUnlocks as { purchasedRungIds: string[] }).purchasedRungIds).toEqual([]);
  });

  it("v6 → v7: never duplicates an id a hand-edited save already carries", () => {
    const odd = migrateToLatest(
      {
        schemaVersion: 6,
        lifetimeCookies: { mantissa: 9, exponent: 9 },
        controlUnlocks: { purchasedRungIds: ["settings.open"] },
      },
      6,
    );
    const ids = (odd.data.controlUnlocks as { purchasedRungIds: string[] }).purchasedRungIds;
    expect(ids.filter((id) => id === "settings.open")).toHaveLength(1);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps the v7 frozen list a real subset of the live registry", () => {
    for (const id of V7_GRANDFATHERED_RUNG_IDS) {
      expect(findControlRung(id)).not.toBeNull();
    }
    // English is never granted because English is never sold.
    expect(V7_GRANDFATHERED_RUNG_IDS).not.toContain("settings.language.en");
  });

  it("grants nothing when the lifetime figure on disk is missing or malformed", () => {
    const missing = migrateToLatest({ schemaVersion: 5 }, 5);
    expect((missing.data.controlUnlocks as { purchasedRungIds: string[] }).purchasedRungIds).toEqual([]);

    const junk = migrateToLatest({ schemaVersion: 5, lifetimeCookies: "lots" }, 5);
    expect((junk.data.controlUnlocks as { purchasedRungIds: string[] }).purchasedRungIds).toEqual([]);
  });
});

/* ───────────────────────────────────────────────── the renderer's structural slice */

describe("control-unlocks: buying one wakes the structural slice", () => {
  it("notifies structure subscribers, so a bought control actually appears", () => {
    // A REGRESSION TEST FOR A REAL BUG. The store's structure slice only notifies when one of a
    // named list of keys changes reference (store.ts#STRUCTURE_KEYS), and `controlUnlocks` was
    // missing from that list at first: the reducer took the cookies and the save recorded the
    // rung, but the title bar went on showing the price plate until some unrelated action
    // happened to wake the slice. Every gated surface reads through this subscription.
    const store = new GameStore(withCookies(500));
    let woke = 0;
    store.subscribeStructure(() => {
      woke += 1;
    });

    store.dispatch({ type: "buyControlUnlock", rungId: "chrome.drag" }, ctx);
    expect(woke).toBe(1);
    expect(hasControlRung(store.getState(), "chrome.drag")).toBe(true);
  });

  it("does not wake it for a purchase the reducer refused", () => {
    const store = new GameStore(withCookies(1));
    let woke = 0;
    store.subscribeStructure(() => {
      woke += 1;
    });
    store.dispatch({ type: "buyControlUnlock", rungId: "chrome.drag" }, ctx);
    expect(woke).toBe(0);
  });
});

/* ───────────────────────────────────────────────────────────────── save round-trip */

describe("control-unlocks: the save round-trip", () => {
  it("carries bought rungs out to disk and back", () => {
    let state = withCookies(50_000);
    state = buy(state, "chrome.drag");
    state = buy(state, "stepper.x10");

    const decoded = decodeSave(encodeSave(state));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.state.controlUnlocks?.purchasedRungIds).toEqual(["chrome.drag", "stepper.x10"]);
    expect(hasControlRung(decoded.state, "chrome.drag")).toBe(true);
    expect(hasControlRung(decoded.state, "stepper.x100")).toBe(false);
  });

  it("encodes a state built without the subtree as having bought nothing", () => {
    const { controlUnlocks: _dropped, ...withoutSubtree } = createInitialGameState("2026-06-01T00:00:00.000Z");
    const encoded = encodeSave(withoutSubtree as GameState);
    expect(encoded.controlUnlocks).toEqual({ purchasedRungIds: [] });
  });
});
