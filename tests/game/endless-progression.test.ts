import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { bnFromNumber } from "../../src/shared/game/big-number";
import {
  canStartHomeExtension,
  createInitialHomeState,
  HOME_EXTENSION_ID,
  ROOM_DEFINITIONS,
  tickHome,
} from "../../src/shared/game/home-construction";
import { performPrestige } from "../../src/shared/game/prestige";
import { freshState } from "./test-helpers";

describe("endless progression contract", () => {
  it("keeps prestige repeatable after an arbitrarily large existing run count", () => {
    const state = freshState({
      lifetimeCookies: bnFromNumber(1e18),
      prestige: {
        ascensionPoints: 10_000,
        totalPrestigeCount: 1_000_000,
        permanentUnlockIds: [],
        rebornNodeIds: [],
      },
    });
    expect(performPrestige(state).state.prestige.totalPrestigeCount).toBe(1_000_001);
  });

  it("can complete another Home floor after a million existing extensions", () => {
    const rooms = ROOM_DEFINITIONS.map((room) => ({ roomId: room.id, furnitureIds: [] }));
    const home = {
      ...createInitialHomeState(),
      blueprintIds: ROOM_DEFINITIONS.map((room) => room.id),
      rooms,
      extensionLevel: 1_000_000,
    };
    expect(canStartHomeExtension(home)).toBe(true);
    const built = tickHome(
      { ...home, build: { roomId: HOME_EXTENSION_ID, elapsedMs: 0, requiredMs: 1 } },
      1,
    ).state;
    expect(built.extensionLevel).toBe(1_000_001);
  });

  it("ships the Diesel Depot collapse control as a native persisted disclosure", () => {
    const source = readFileSync("src/renderer/screens/DieselDepot.tsx", "utf8");
    expect(source).toContain("material-cookie-clicker:diesel-depot:collapsed");
    expect(source).toContain("aria-expanded={!collapsed}");
    expect(source).toContain('aria-controls="diesel-depot-details"');
    expect(source).toContain('className="diesel-depot__details" hidden={collapsed}');
    expect(source).toContain('type="button"');
  });

  it("keeps furnished and endless Home capture fixtures on the completed look ladder", () => {
    const source = readFileSync("scripts/capture-seed-home.test.ts", "utf8");
    expect(source).toContain('import { LOOK_RUNG_IDS } from "../src/shared/game/look-tiers.js";');
    expect(source.match(/controlUnlocks: \{ purchasedRungIds: \[\.\.\.LOOK_RUNG_IDS\] \}/g)).toHaveLength(2);
  });
});
