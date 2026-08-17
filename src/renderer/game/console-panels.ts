import type { ConsoleSurfaceId, Disclosure } from "../../shared/game/disclosure.js";

/**
 * Which buttons the cabinet console shows, and where a tool card's "Open it now" lands.
 *
 * Kept out of App.tsx deliberately: both answers are contracts worth testing directly rather
 * than inferring from a rendered tree, and neither needs React to decide.
 */

/**
 * The GAME surfaces, in cabinet order. Each is earned — see disclosure.ts. The Factory sits
 * first because it is the only one that is a game in its own right rather than a report on the
 * game, and because it is bought outright (with the Fuel Contract) rather than reached.
 */
export const GAME_SURFACE_IDS: readonly ConsoleSurfaceId[] = [
  "factory",
  // The Home sits next to the Factory for the same reason the Factory sits first: it is a game
  // in its own right rather than a report on the game, and it is bought outright (with the
  // Property Deed) rather than reached.
  "home",
  "achievements",
  "tools",
  "statistics",
  "prestige",
];

/**
 * SETTINGS is the fifth emblem and is NOT a game surface.
 *
 * Language mode and the two funny levels are preferences of the APPLICATION, not rewards for
 * playing it, so progressive disclosure does not apply: the button is on the cabinet from the
 * first frame of a brand-new save. A player who cannot read English must never have to earn
 * their way to the language switch.
 */
export const SETTINGS_PANEL_ID = "settings";

export type PanelId = ConsoleSurfaceId | typeof SETTINGS_PANEL_ID;

/** Which Settings row a request points at. Never an availability answer — only a destination. */
export type SettingsRowId = "language" | "funny";

/**
 * The console buttons, in cabinet order. The earned game emblems in their fixed order, then
 * Settings — appended unconditionally, which is what makes the console never empty.
 */
export function consolePanelIds(disclosure: Disclosure): PanelId[] {
  return [...GAME_SURFACE_IDS.filter((id) => disclosure.consoles[id]), SETTINGS_PANEL_ID];
}

/**
 * Where "Open it now" on a tool card goes.
 *
 * ALWAYS Settings, for every tool in every unlock state — this function does not take the game
 * state and could not consult the tech tree if it wanted to (see
 * tools.ts#ToolDefinition.gatesApplicationFeature). Only the highlighted ROW varies, and only to
 * decide where to point the player's attention.
 */
export function openFeatureRequest(toolId: string): { panel: PanelId; row: SettingsRowId } {
  const row: SettingsRowId = toolId === "narrator" || toolId === "personalVocabulary" ? "funny" : "language";
  return { panel: SETTINGS_PANEL_ID, row };
}
