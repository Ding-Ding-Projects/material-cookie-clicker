import { GENERATOR_DEFINITIONS, isGeneratorUnlocked } from "./generators.js";
import { evaluateNewlyUnlockedTools } from "./tools.js";
import { areMinigameEventsUnlocked } from "./control-unlocks.js";
import { REVEAL_UPGRADE_DEFINITIONS, type RevealSurface, type UpgradeDefinition } from "./upgrades.js";
import type { GameState } from "./types.js";

/**
 * PROGRESSIVE DISCLOSURE — what the player can currently SEE.
 *
 * A fresh save is one cookie and one number. Everything else on the game surface is earned:
 * the shop rail, the upgrade ticket strip, hold-to-click, the per-second and per-click
 * readouts, each of the four console emblem buttons, and each rung of the generator ladder.
 *
 * There are exactly two ways a surface is earned, and both are derived here from ordinary
 * game state — nothing about disclosure is stored as its own persisted field:
 *
 *   1. BOUGHT. The shop rail, the upgrade strip and hold-to-click each have a real reveal
 *      upgrade in UPGRADE_DEFINITIONS (upgrades.ts#REVEAL_UPGRADE_DEFINITIONS), purchased
 *      through the ordinary `buyUpgrade` action and the one `applyGameAction` seam.
 *   2. REACHED. The readouts and the console buttons appear the moment the progress they
 *      describe first exists — your first generator, your first achievement, your first
 *      discovered tool, and closing on the prestige threshold.
 *
 * WHAT THIS IS NOT. Every predicate below answers "does the player see this piece of the GAME
 * yet". None of them answers "is a real application feature available", which is always yes
 * and is never the game domain's question — see tools.ts#ToolDefinition.gatesApplicationFeature.
 * Hiding the Tools console emblem hides a game panel; the Tools tech tree and its "Open it now"
 * button behave exactly as before once that panel is open, for every tool in every state.
 *
 * SAVE COMPATIBILITY, AND ITS ONE LIMIT. The two VIEW surfaces (shop rail, ticket strip) OR
 * their bought condition against progress already in the save, so a save written before
 * disclosure existed never loses a view it used to show: a generator in the save means the
 * shop was open, a non-reveal upgrade means the strip was. Nothing is granted by migration any
 * more (migrations.ts#migrateV2ToV3 hands out no upgrades at all).
 *
 * `holdToClick` is deliberately outside that arrangement, and outside the ascension term too.
 * It is not a view: it changes what the input device DOES. A player who never bought Steady
 * Hand must not find their save holding-and-repeating, and must not be shown a hint for a
 * behaviour they did not buy. It reads one thing and one thing only — do you own the upgrade.
 */

/**
 * The Prestige console emblem appears when the player crosses a thousandth of the 1e12 lifetime
 * cookies `canPrestige` actually requires — close enough that ascension is a real prospect
 * rather than a rumour, far enough that it is not dangled in front of a beginner.
 *
 * It is keyed off the ACHIEVEMENT for that milestone rather than off `lifetimeCookies`
 * directly, and deliberately: `achievements` is part of the store's structural slice and only
 * changes on a discrete unlock, whereas `lifetimeCookies` changes several times a second. A
 * console cluster that re-derived itself from the cookie count would re-render four inline-SVG
 * emblems on every tick, for a button whose answer changes exactly once in a run.
 */
export const PRESTIGE_CONSOLE_ACHIEVEMENT_ID = "lifetime_1000000000";

export type ConsoleSurfaceId = "achievements" | "tools" | "statistics" | "prestige" | "factory" | "home" | "minigames";

export interface Disclosure {
  /** The generator shop rail. Bought with Shop Sign. */
  readonly shop: boolean;
  /** The upgrade ticket strip. Bought with Upgrade Catalogue. */
  readonly upgradeStrip: boolean;
  /** Press-and-hold repeat clicking, and only then its hint line. Bought with Steady Hand. */
  readonly holdToClick: boolean;
  /**
   * The Diesel Depot card in the shop rail's footer. Bought with Fuel Contract, and — unlike
   * the three surfaces above it — NOT granted to an ascended player for free, because the depot
   * did not exist before this version and nobody can lose a surface they never had.
   */
  readonly dieselDepot: boolean;
  /**
   * The Diesel Factory panel — the whole nested subgame (diesel-factory.ts). Bought with the
   * same Fuel Contract upgrade the depot is: signing a contract to supply WinForge is what gives
   * you a reason to build a refinery, so one purchase opens the factory and the depot status
   * card that links to it. There is no separate second reveal to buy.
   */
  readonly dieselFactory: boolean;
  /**
   * The home construction panel — the bakery-home subgame (home-construction.ts). Bought with
   * the Property Deed, on exactly the same terms as the factory above: no "or ascended", no
   * progress-derived OR, no migration grant. The house is new, so there is no older save whose
   * surface this could take away.
   */
  readonly homeConstruction: boolean;
  /** The minigame events panel, permanently reached at 100,000 lifetime baked cookies. */
  readonly minigames: boolean;
  /** The per-second HUD readout and the hero's CPS line. Reached with the first generator. */
  readonly perSecondReadout: boolean;
  /** The per-click HUD readout. Reached with Steady Hand, which is when a click gains nuance. */
  readonly perClickReadout: boolean;
  /** Which console emblem buttons are bolted to the cabinet yet. */
  readonly consoles: Readonly<Record<ConsoleSurfaceId, boolean>>;
}

function ownsUpgrade(state: GameState, upgradeId: string): boolean {
  return state.upgrades.some((u) => u.id === upgradeId);
}

/** The reveal upgrade that turns on `surface`. Throws for an unknown surface, never silently. */
export function revealUpgradeFor(surface: RevealSurface): UpgradeDefinition {
  const def = REVEAL_UPGRADE_DEFINITIONS.find(
    (d) => d.effect.kind === "reveal" && d.effect.surface === surface,
  );
  if (!def) throw new RangeError(`No reveal upgrade defines surface: ${surface}`);
  return def;
}

function totalGeneratorsOwned(state: GameState): number {
  return state.generators.reduce((sum, g) => sum + g.count, 0);
}

/** True once at least one tool's own unlock condition is met (DISCOVERED — see tools.ts, where
 *  discovery is explicitly not the bonus), or one was bought in the shop.
 *  Deliberately does NOT consult `toolProgressionEnabled`: that toggle lives inside the Tools
 *  panel, and letting it decide whether the panel's own button exists would lock a player who
 *  turned it off out of ever turning it back on. */
function hasDiscoveredATool(state: GameState): boolean {
  if ((state.purchasedToolIds ?? []).length > 0) return true;
  return evaluateNewlyUnlockedTools(state, new Set<string>()).length > 0;
}

/** Ascended players keep every surface: prestige wipes non-permanent upgrades, and re-earning
 *  the shop sign after a full run would be a punishment nobody asked for. */
function hasAscended(state: GameState): boolean {
  return state.prestige.totalPrestigeCount > 0;
}

export function computeDisclosure(state: GameState): Disclosure {
  const ascended = hasAscended(state);
  const generatorsOwned = totalGeneratorsOwned(state);

  const shop = ascended || ownsUpgrade(state, "reveal_shop_sign") || generatorsOwned > 0;
  const upgradeStrip =
    ascended ||
    ownsUpgrade(state, "reveal_upgrade_catalogue") ||
    // A pre-disclosure save could own any upgrade at all; if it owns one that is not itself a
    // reveal, the strip is where it came from and must still be there.
    state.upgrades.some((u) => !u.id.startsWith("reveal_"));
  // No `ascended ||`, no progress-derived OR, no migration grant: bought, or not had.
  const holdToClick = ownsUpgrade(state, "reveal_steady_hand");

  return {
    shop,
    upgradeStrip,
    holdToClick,
    // Bought outright, every time, for everyone: no "or ascended", no "or you already have
    // progress that implies it". The depot is new, so there is no older save whose surface this
    // could take away, and inventing a free grant would put a cookie-spending panel in front of
    // a player who never chose it.
    dieselDepot: ownsUpgrade(state, "reveal_fuel_contract"),
    dieselFactory: ownsUpgrade(state, "reveal_fuel_contract"),
    homeConstruction: ownsUpgrade(state, "reveal_property_deed"),
    minigames: areMinigameEventsUnlocked(state),
    perSecondReadout: generatorsOwned > 0 || ascended,
    perClickReadout: holdToClick,
    consoles: {
      achievements: state.achievements.length > 0,
      tools: hasDiscoveredATool(state),
      statistics: generatorsOwned > 0,
      prestige:
        ascended || state.achievements.some((a) => a.id === PRESTIGE_CONSOLE_ACHIEVEMENT_ID),
      // The factory emblem is the one console button that is BOUGHT rather than reached: it
      // arrives with the Fuel Contract, exactly like the depot card it replaces the guts of.
      factory: ownsUpgrade(state, "reveal_fuel_contract"),
      // The second bought emblem, on the same terms: the Property Deed puts the house on the
      // cabinet, and nothing else ever does.
      home: ownsUpgrade(state, "reveal_property_deed"),
      minigames: areMinigameEventsUnlocked(state),
    },
  };
}

/** True when press-and-hold repeat clicking is available. The hold controller consults this;
 *  a discrete click is never gated, because clicking the cookie is the whole game. */
export function isHoldToClickEnabled(state: GameState): boolean {
  return computeDisclosure(state).holdToClick;
}

/**
 * THE GENERATOR LADDER, one rung at a time.
 *
 * Only tiers the player already owns are named, plus the one tier they can buy next, plus a
 * single unnamed "???" rung hinting that the ladder continues. Everything past that is absent
 * from the list entirely — not a named locked row, not a search hit, not a bulk-select target.
 * Buying the next tier therefore reveals exactly one new row, every time.
 */
export type LadderRowState = "available" | "mystery";

export interface LadderRow {
  readonly id: string;
  readonly index: number;
  readonly state: LadderRowState;
}

export function visibleGeneratorLadder(state: GameState): readonly LadderRow[] {
  const ownedById = new Map(state.generators.map((g) => [g.id, g.count] as const));
  // The deepest tier the player actually owns. Read from the WHOLE ladder rather than stopping
  // at the first gap, so a save that somehow owns a deep tier without the shallow ones (an
  // import, an older build) still sees every tier it owns instead of losing rows.
  let deepestOwned = -1;
  GENERATOR_DEFINITIONS.forEach((def, index) => {
    if ((ownedById.get(def.id) ?? 0) > 0) deepestOwned = index;
  });
  // A milestone-unlocked tier becomes named as soon as the preserved all-time counter crosses
  // its threshold, even when the player has spent the current cookie balance or just prestiged.
  // Owned tiers remain visible for imported/older saves, but an unowned tier never leaks before
  // its own explicit predicate is true.
  let deepestLifetimeUnlocked = -1;
  GENERATOR_DEFINITIONS.forEach((def, index) => {
    if (def.lifetimeUnlock !== undefined && isGeneratorUnlocked(def, state.stats.totalCookiesBaked)) {
      deepestLifetimeUnlocked = index;
    }
  });
  // Named and buyable: everything down to one rung past the deepest tier owned. A lifetime-gated
  // next tier is the exception: keep that exact rung as the unnamed mystery until its predicate
  // is true, rather than leaking its name just because the previous tier is owned.
  const nextCandidate = GENERATOR_DEFINITIONS[deepestOwned + 1];
  const nextCandidateBlocked =
    nextCandidate !== undefined &&
    nextCandidate.lifetimeUnlock !== undefined &&
    !isGeneratorUnlocked(nextCandidate, state.stats.totalCookiesBaked);
  const availableThrough = nextCandidateBlocked
    ? deepestOwned
    : Math.max(deepestOwned + 1, deepestLifetimeUnlocked);

  const rows: LadderRow[] = [];
  for (let index = 0; index <= availableThrough && index < GENERATOR_DEFINITIONS.length; index += 1) {
    rows.push({ id: GENERATOR_DEFINITIONS[index]!.id, index, state: "available" });
  }
  const mysteryIndex = availableThrough + 1;
  if (mysteryIndex < GENERATOR_DEFINITIONS.length) {
    rows.push({ id: GENERATOR_DEFINITIONS[mysteryIndex]!.id, index: mysteryIndex, state: "mystery" });
  }
  return rows;
}
