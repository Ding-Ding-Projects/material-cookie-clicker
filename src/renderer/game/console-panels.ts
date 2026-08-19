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
  "minigames",
  "achievements",
  "tools",
  "statistics",
  "prestige",
];

/**
 * SETTINGS is not a game surface, and progressive disclosure still has no opinion about it.
 *
 * The button is on the cabinet from the first frame of a brand-new save, exactly as it always
 * was: it is never earned, never hidden, never gated behind progress. What changed in this build
 * is that it is PRICED. By the owner's decree ("settings still appearing" / "needs to be
 * purchased") the emblem is the `settings.open` control (control-unlocks.ts, 25 cookies), so
 * until it is bought the console draws a coin-slot plate with that figure in the emblem's place
 * — same position, same tab stop, same accessible affordance, and pressing it buys rather than
 * opens. Priced is not gated: any save can pay it the moment it has 25 cookies.
 */
export const SETTINGS_PANEL_ID = "settings";

/**
 * THE PRICES CATALOGUE is the free console plate, and it is what keeps the pricing of Settings
 * honest.
 *
 * The controls catalogue — every control, every rung, every price — used to live only inside the
 * Settings panel, which is precisely why the Settings panel had to be free. Now that the panel
 * is sold, the catalogue moves OUT to its own button, appended to the console unconditionally
 * beside the Settings slot and never sold at any price. A save with zero cookies can still read
 * the whole price list, including the 25 that Settings itself costs, without paying anything.
 *
 * It is still rendered at the bottom of the Settings panel too, for a player who has bought in
 * and is already there. One component, two doors, one of them free forever.
 */
export const CATALOGUE_PANEL_ID = "catalogue";

export type PanelId = ConsoleSurfaceId | typeof SETTINGS_PANEL_ID | typeof CATALOGUE_PANEL_ID;

/** Which Settings row a request points at. Never an availability answer — only a destination. */
export type SettingsRowId = "language" | "funny";

/**
 * The console buttons, in cabinet order. The earned game emblems in their fixed order, then the
 * free prices catalogue, then Settings — the last two appended unconditionally, which is what
 * makes the console never empty and the price list never unreachable.
 */
export function consolePanelIds(disclosure: Disclosure): PanelId[] {
  return [...GAME_SURFACE_IDS.filter((id) => disclosure.consoles[id]), CATALOGUE_PANEL_ID, SETTINGS_PANEL_ID];
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

/**
 * WHAT "OPEN IT NOW" ACTUALLY DOES, now that its destination has a price on the door.
 *
 * The tech-tree contract has not changed and is not being weakened: no application feature is
 * ever gated behind the tech tree, and this function still never consults it — `toolId` picks a
 * row and nothing else. What HAS changed is that the destination itself, the Settings panel, is
 * a 25-cookie purchase by the owner's decree (control-unlocks.ts#settings.open), and a button
 * labelled "Open it now" that quietly did nothing because the player had not bought the panel
 * would be the dishonest way to spend that decree.
 *
 * So the press has two honest outcomes and says which:
 *
 *   • bought  → `kind: "open"`. Exactly the old behaviour, exactly the old row.
 *   • unbought→ `kind: "purchase"`. The shell surfaces the PURCHASE instead: it announces the
 *     control and its literal price, and puts focus on the coin-slot plate standing where the
 *     Settings emblem stands, which is the button that buys it. The player is one press from
 *     the panel, and knows the figure before pressing.
 *
 * PRICED, NOT PROGRESS-GATED, and the difference is the whole of why this is still compatible
 * with `tools.ts#gatesApplicationFeature`: there is no tool, no milestone and no unlock in front
 * of Settings. There is a till. Any save can pay it at any moment it has 25 cookies, including
 * a save that is one minute old, and the price is readable for free in the prices catalogue
 * beside it before a single cookie is spent.
 */
export type OpenFeatureOutcome =
  | { readonly kind: "open"; readonly panel: PanelId; readonly row: SettingsRowId }
  | { readonly kind: "purchase"; readonly rungId: string; readonly panel: PanelId };

/** The rung that stands between "Open it now" and the Settings panel. */
export const SETTINGS_OPEN_RUNG_ID = "settings.open";

export function openFeatureOutcome(toolId: string, settingsBought: boolean): OpenFeatureOutcome {
  const request = openFeatureRequest(toolId);
  if (settingsBought) return { kind: "open", panel: request.panel, row: request.row };
  return { kind: "purchase", rungId: SETTINGS_OPEN_RUNG_ID, panel: request.panel };
}
