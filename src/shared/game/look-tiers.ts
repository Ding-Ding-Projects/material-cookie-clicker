import {
  canBuyControlRung,
  controlRungLevel,
  getControlUnlock,
  hasControlRung,
} from "./control-unlocks.js";
import type { GameState } from "./types.js";

/**
 * THE AESTHETIC LADDER, translated from "which rungs are owned" into "which data attributes are
 * on the root element".
 *
 * The owner's decree: "the app should start with a purely super plain cheaply made app with just
 * a cookie". So the entire v2 arcade-bakery look is earned. This module is the one place that
 * decides what the DOM says about it; `styles/index.css` (THE PLAIN LAYER, at the foot of the
 * file) is the one place that decides what each `off` state looks like.
 *
 * HOW THIS IS IMPLEMENTED, AND WHY IT IS NOT A SECOND STYLESHEET.
 *
 * The v2 sheet stays the source of truth. Not one of its ten thousand lines is duplicated for the
 * plain state. Instead:
 *
 *   • `[data-look-palette='off']` re-maps the COLOUR CUSTOM PROPERTIES on `:root` down to a plain
 *     set — white surfaces, near-black text, #999 outlines, #ddd control faces. Every component
 *     rule in the sheet already reads its colour through `var(...)`, so the whole application
 *     repaints from one block.
 *   • `[data-look-cabinet='off']` re-maps the SHAPE and ELEVATION properties — radii to 2px,
 *     border widths to 1px, the press shadows to `none` — and then switches off the handful of
 *     literal frame/bevel/grain paint jobs that are not expressible as a token.
 *   • `[data-look-marquee='off']` re-maps the font tokens so `--font-display` is the system stack,
 *     and flattens weight and letter-spacing on the display surfaces.
 *   • `[data-look-glow='off']` flattens the oven-glow gradient token and hides the purely
 *     decorative ember/crumb/ray layers.
 *   • `[data-look-art='off']` hides the inline SVG art and reveals the plain glyph beside it. The
 *     art is `aria-hidden` in both states and the accessible name comes from the adjacent text or
 *     the parent's label, so nothing a screen reader hears changes at all.
 *   • `[data-look-motion='off']` zeroes the travel and duration tokens and stops every animation.
 *   • `[data-look-dark='off']` narrows the guard on the dark-theme blocks so they never match.
 *
 * WHY THE ATTRIBUTES GO ON `document.documentElement` AND NOT ONLY ON `.cabinet`. The palette
 * lives on `:root`, and the anchored panels, the title bar and the toasts are rendered OUTSIDE
 * the cabinet element. Scoping the attributes to `.cabinet` would have re-themed the game surface
 * and left every dialog in full v2 colours. They are mirrored onto the cabinet element as well,
 * so the state is visible where a reader would look for it and a structural rule can use either.
 */

/** One tier of the ladder: its rung id and the attribute name that carries it. */
export interface LookTier {
  readonly rungId: string;
  readonly attribute: string;
}

/**
 * The ladder, bottom-up. The order matters twice: it is the order the rungs are sold in
 * (control-unlocks.ts `look`), and it is the order a look assembles in — colour before the frame
 * that is painted in it, the frame before the type mounted on it.
 */
export const LOOK_TIERS: readonly LookTier[] = [
  { rungId: "look.palette", attribute: "data-look-palette" },
  { rungId: "look.cabinet", attribute: "data-look-cabinet" },
  { rungId: "look.marquee", attribute: "data-look-marquee" },
  { rungId: "look.glow", attribute: "data-look-glow" },
  { rungId: "look.art", attribute: "data-look-art" },
  { rungId: "look.motion", attribute: "data-look-motion" },
  { rungId: "look.dark", attribute: "data-look-dark" },
];

/** The look rung ids, in ladder order. */
export const LOOK_RUNG_IDS: readonly string[] = LOOK_TIERS.map((tier) => tier.rungId);

/** The attribute names, in ladder order. */
export const LOOK_ATTRIBUTES: readonly string[] = LOOK_TIERS.map((tier) => tier.attribute);

/**
 * The three structural states of the application shell.
 *
 * `cookie-only` is deliberately stronger than "all the colours are grey": the title bar,
 * counters, cabinet, discovery tickets, shop rail and every decorative stage layer are absent.
 * `palette-only` keeps that same one-button composition but paints the page with the first bought
 * tier. The ordinary cabinet composition begins only after its own rung has been bought.
 */
export type LookStage = "cookie-only" | "palette-only" | "cabinet";

export interface NextLookPurchase {
  readonly rungId: string;
  readonly nameEn: string;
  readonly nameYue: string;
  readonly price: number;
  readonly affordable: boolean;
}

export function lookStage(state: GameState): LookStage {
  if (!hasControlRung(state, "look.palette")) return "cookie-only";
  if (!hasControlRung(state, "look.cabinet")) return "palette-only";
  return "cabinet";
}

/** The next graphics rung and whether the current balance can buy it, or null at the top. */
export function nextLookPurchase(
  state: GameState,
): NextLookPurchase | null {
  const rung = getControlUnlock("look").rungs[controlRungLevel(state, "look")];
  if (!rung) return null;
  return {
    rungId: rung.id,
    nameEn: rung.nameEn,
    nameYue: rung.nameYue,
    price: rung.price,
    affordable: canBuyControlRung(state, rung.id),
  };
}

/**
 * The attribute map for a given save: every tier's attribute, always present, always literally
 * `'on'` or `'off'`.
 *
 * BOTH VALUES ARE WRITTEN OUT rather than the attribute being omitted when a tier is owned. An
 * absent attribute and an attribute set to `off` would style identically today, but an absent one
 * is indistinguishable from "the effect has not run yet", which is exactly the frame in which a
 * fully-earned cabinet would flash plain for a paint. Writing both values means the plain layer's
 * selectors are positive matches on a value that is always there.
 */
export function lookTierAttributes(state: GameState): Readonly<Record<string, "on" | "off">> {
  const out: Record<string, "on" | "off"> = {};
  for (const tier of LOOK_TIERS) {
    out[tier.attribute] = hasControlRung(state, tier.rungId) ? "on" : "off";
  }
  return out;
}

/** Whether one named tier is owned. Convenience for a component that needs the boolean itself. */
export function hasLookTier(state: GameState, rungId: string): boolean {
  return hasControlRung(state, rungId);
}
