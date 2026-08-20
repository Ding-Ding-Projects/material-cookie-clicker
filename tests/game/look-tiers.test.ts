import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { bnFromNumber } from "../../src/shared/game/big-number";
import {
  canBuyControlRung,
  CONTROL_UNLOCKS,
  controlRungLevel,
  controlRungPrice,
  getControlUnlock,
  V9_GRANDFATHERED_RUNG_IDS,
} from "../../src/shared/game/control-unlocks";
import {
  LOOK_ATTRIBUTES,
  LOOK_RUNG_IDS,
  LOOK_TIERS,
  hasLookTier,
  lookStage,
  lookTierAttributes,
  nextLookPurchase,
} from "../../src/shared/game/look-tiers";
import { migrateToLatest } from "../../src/shared/game/migrations";
import { applyGameAction } from "../../src/shared/game/reducer";
import { SAVE_SCHEMA_VERSION } from "../../src/shared/game/save-schema";
import type { GameState } from "../../src/shared/game/types";
import { fixedRng, freshState } from "./test-helpers";

/**
 * THE AESTHETIC LADDER.
 *
 * The owner's decree: "the app should start with a purely super plain cheaply made app with just
 * a cookie". These tests hold the two halves of that promise honest — that the plain state is
 * really the starting state and really assembles into today's look a rung at a time, and that
 * the floors underneath it (contrast, focus, hit area, motion preference, a playable economy)
 * are never any of the things being sold.
 *
 * A NOTE ON THE STYLESHEET ASSERTIONS BELOW. Several tests read `styles/index.css` as text and
 * assert what THE PLAIN LAYER declares. That is a coarse instrument and it is chosen on purpose:
 * there is no DOM and no layout engine in this suite, so the alternative to reading the sheet is
 * not a better test, it is no test at all — and the properties being checked (does the plain
 * palette really put near-black on white, does any rule in that layer touch a hit area, can the
 * motion rung reach a reduced-motion query) are exactly the ones a silent edit would break.
 */

const ctx = { now: () => Date.parse("2026-06-01T00:00:00.000Z"), rng: fixedRng() };

const STYLESHEET = readFileSync(
  resolve(import.meta.dirname, "..", "..", "src", "renderer", "styles", "index.css"),
  "utf8",
);

const COOKIE_HERO_SOURCE = readFileSync(
  resolve(import.meta.dirname, "..", "..", "src", "renderer", "screens", "CookieHero.tsx"),
  "utf8",
);

/**
 * The text of THE PLAIN LAYER.
 *
 * This used to be "everything after its banner comment", which was true only while the plain layer
 * was the last thing in the stylesheet. It stopped being last: a MINIGAME EVENTS / LUCKY DRAWER
 * section was appended after it, and that section legitimately carries its own
 * `@media (prefers-reduced-motion: reduce)` rule for the board buttons. The slice swallowed it and
 * the plain layer was reported as buying motion back from someone who had asked not to have it —
 * a finding about a rule that is not in the plain layer at all.
 *
 * Bounded at the next top-level section banner, so the slice describes what it claims to.
 */
const SECTION_BANNER = new RegExp(String.raw`^/\* -{4,} [A-Z]`, "m");
const PLAIN_LAYER_START = STYLESHEET.indexOf("THE PLAIN LAYER");
const NEXT_SECTION = STYLESHEET.slice(PLAIN_LAYER_START).search(SECTION_BANNER);
const PLAIN_LAYER = NEXT_SECTION < 0
  ? STYLESHEET.slice(PLAIN_LAYER_START)
  : STYLESHEET.slice(PLAIN_LAYER_START, PLAIN_LAYER_START + NEXT_SECTION);

/** Everything BEFORE the plain layer: the v2 sheet, which this feature must not have rewritten. */
const V2_LAYER = STYLESHEET.slice(0, STYLESHEET.indexOf("THE PLAIN LAYER"));

function withCookies(cookies: number): GameState {
  return freshState({ cookies: bnFromNumber(cookies) });
}

function buy(state: GameState, rungId: string): GameState {
  return applyGameAction(state, { type: "buyControlUnlock", rungId }, ctx);
}

/** Buys every look rung in ladder order, from a balance that can afford all of them. */
function fullyBought(): GameState {
  let state = withCookies(1_000_000);
  for (const rungId of LOOK_RUNG_IDS) state = buy(state, rungId);
  return state;
}

/* ─────────────────────────────────────────────────────────────────── the ladder itself */

describe("look tiers: the ladder", () => {
  it("sells the look as ONE ladder of seven rungs, not seven separate controls", () => {
    // A look assembles in an order — colour before the frame painted in it, the frame before the
    // type mounted on it — so the ladder's bottom-up rule is the feature's own rule.
    const look = getControlUnlock("look");
    expect(look.group).toBe("look");
    expect(look.rungs.map((rung) => rung.id)).toEqual([
      "look.palette",
      "look.cabinet",
      "look.marquee",
      "look.glow",
      "look.art",
      "look.motion",
      "look.dark",
    ]);
    expect(CONTROL_UNLOCKS.filter((control) => control.group === "look")).toHaveLength(1);
  });

  it("keeps look-tiers.ts and the registry describing the same seven rungs", () => {
    expect(LOOK_RUNG_IDS).toEqual(getControlUnlock("look").rungs.map((rung) => rung.id));
    expect(LOOK_ATTRIBUTES).toEqual([
      "data-look-palette",
      "data-look-cabinet",
      "data-look-marquee",
      "data-look-glow",
      "data-look-art",
      "data-look-motion",
      "data-look-dark",
    ]);
    expect(new Set(LOOK_ATTRIBUTES).size).toBe(LOOK_TIERS.length);
  });

  it("escalates from the cheapest end of the table to the most expensive thing in it", () => {
    const prices = LOOK_RUNG_IDS.map((id) => {
      const price = controlRungPrice(id);
      return price.mantissa * 10 ** price.exponent;
    });
    expect(prices).toEqual([50, 250, 750, 1_800, 4_000, 8_000, 15_000]);
    // The first rung is affordable inside the first minute — the plain state is a starting
    // state, not a punishment — and the whole look is roughly an hour's play.
    expect(prices[0]).toBeLessThanOrEqual(50);
    expect(prices.reduce((sum, price) => sum + price, 0)).toBe(29_850);
  });

  it("writes both languages for every rung, like every other control", () => {
    for (const rung of getControlUnlock("look").rungs) {
      expect(rung.nameEn.length).toBeGreaterThan(0);
      expect(rung.nameYue.length).toBeGreaterThan(0);
      expect(rung.detailEn.length).toBeGreaterThan(0);
      expect(rung.detailYue.length).toBeGreaterThan(0);
    }
  });
});

/* ────────────────────────────────────────────────────────────────────── gating and state */

describe("look tiers: gating", () => {
  it("starts a fresh save with every tier off — the plain app IS the starting state", () => {
    const attributes = lookTierAttributes(freshState());
    for (const attribute of LOOK_ATTRIBUTES) {
      expect(attributes[attribute]).toBe("off");
    }
  });

  it("always writes both values out, never omitting the attribute", () => {
    // An absent attribute is indistinguishable from "the effect has not run yet", which is the
    // frame in which a fully-earned cabinet would flash plain on load.
    const attributes = lookTierAttributes(fullyBought());
    expect(Object.keys(attributes).sort()).toEqual([...LOOK_ATTRIBUTES].sort());
    for (const attribute of LOOK_ATTRIBUTES) {
      expect(attributes[attribute]).toBe("on");
    }
  });

  it("flips exactly one attribute per rung, in ladder order", () => {
    let state = withCookies(1_000_000);
    for (let index = 0; index < LOOK_RUNG_IDS.length; index += 1) {
      state = buy(state, LOOK_RUNG_IDS[index]);
      const attributes = lookTierAttributes(state);
      LOOK_ATTRIBUTES.forEach((attribute, position) => {
        expect(attributes[attribute]).toBe(position <= index ? "on" : "off");
      });
      expect(controlRungLevel(state, "look")).toBe(index + 1);
    }
  });

  it("refuses a rung whose predecessor is unowned, so the look cannot assemble out of order", () => {
    const rich = withCookies(1_000_000);
    expect(canBuyControlRung(rich, "look.palette")).toBe(true);
    for (const rungId of LOOK_RUNG_IDS.slice(1)) {
      expect(canBuyControlRung(rich, rungId)).toBe(false);
    }
    const afterPalette = buy(rich, "look.palette");
    expect(canBuyControlRung(afterPalette, "look.cabinet")).toBe(true);
    expect(canBuyControlRung(afterPalette, "look.marquee")).toBe(false);
  });

  it("is never granted by play — a rich save that bought nothing still looks plain", () => {
    const rich = withCookies(10_000_000);
    expect(controlRungLevel(rich, "look")).toBe(0);
    expect(hasLookTier(rich, "look.palette")).toBe(false);
  });

  it("makes production affordable without owning graphics, then charges exactly once", () => {
    const earned = freshState({
      cookies: bnFromNumber(500),
      lifetimeCookies: bnFromNumber(500),
    });

    expect(lookStage(earned)).toBe("cookie-only");
    expect(nextLookPurchase(earned)).toMatchObject({
      rungId: "look.palette",
      price: 50,
      affordable: true,
    });
    expect(earned.controlUnlocks?.purchasedRungIds ?? []).toEqual([]);

    const bought = buy(earned, "look.palette");
    expect(bought.cookies).toEqual(bnFromNumber(450));
    expect(bought.controlUnlocks?.purchasedRungIds).toEqual(["look.palette"]);
    expect(lookStage(bought)).toBe("palette-only");

    const duplicate = buy(bought, "look.palette");
    expect(duplicate).toBe(bought);
    expect(duplicate.cookies).toEqual(bnFromNumber(450));
    expect(duplicate.controlUnlocks?.purchasedRungIds).toEqual(["look.palette"]);
  });

  it("reveals the graphics purchase affordances in ladder order", () => {
    expect(nextLookPurchase(withCookies(49))).toMatchObject({ rungId: "look.palette", affordable: false });
    expect(nextLookPurchase(withCookies(50))).toMatchObject({ rungId: "look.palette", affordable: true });

    const earned = withCookies(300);
    expect(nextLookPurchase(earned)).toMatchObject({ rungId: "look.palette", affordable: true });

    const palette = buy(earned, "look.palette");
    expect(palette.cookies).toEqual(bnFromNumber(250));
    expect(nextLookPurchase(palette)).toMatchObject({ rungId: "look.cabinet", affordable: true });
    expect(lookStage(palette)).toBe("palette-only");

    const cabinet = buy(palette, "look.cabinet");
    expect(cabinet.cookies).toEqual(bnFromNumber(0));
    expect(nextLookPurchase(cabinet)).toMatchObject({ rungId: "look.marquee", affordable: false });
    expect(lookStage(cabinet)).toBe("cabinet");
  });

  it("puts the dark theme above the palette, which is what keeps the plain state coherent", () => {
    // THE PLAIN LAYER's palette block and the dark blocks both sit on `:root`, and the dark
    // blocks carry more weight. That is only safe because the ladder makes "dark bought, palette
    // not" unreachable: buying dark requires everything under it.
    const ids = LOOK_RUNG_IDS;
    expect(ids.indexOf("look.dark")).toBeGreaterThan(ids.indexOf("look.palette"));
    const state = buy(withCookies(1_000_000), "look.palette");
    expect(canBuyControlRung(state, "look.dark")).toBe(false);
  });
});

/* ───────────────────────────────────────────────────────────────── the fallback token set */

describe("look tiers: the plain fallback really is applied", () => {
  it("re-maps the colour roles down to a plain white-and-grey set", () => {
    const block = plainBlock(":root[data-look-palette='off']");
    expect(declaration(block, "--surface")).toBe("#ffffff");
    expect(declaration(block, "--surface-lowest")).toBe("#ffffff");
    expect(declaration(block, "--on-surface")).toBe("#111111");
    expect(declaration(block, "--on-surface-variant")).toBe("#333333");
    expect(declaration(block, "--outline")).toBe("#999999");
    expect(declaration(block, "--primary-container")).toBe("#dddddd");
    // The oven glow is a gradient token, so the flat background is a token swap rather than an
    // override on `.cabinet` — that is the whole "no duplicated CSS" claim in miniature.
    expect(declaration(block, "--oven-glow")).toBe("#ffffff");
    // Every decorative bevel and grain role goes fully transparent, which switches off every
    // inset highlight in the v2 sheet without any of those rules knowing.
    for (const role of ["--bevel-hi", "--bevel-lo", "--sheen", "--grain-dark", "--grain-hi", "--grain-deep"]) {
      expect(declaration(block, role)).toBe("transparent");
    }
  });

  it("flattens the shape and elevation roles to a 1px hairline and a 2px corner", () => {
    const block = plainBlock(":root[data-look-cabinet='off']");
    for (const role of ["--shape-xs", "--shape-sm", "--shape-md", "--shape-lg", "--shape-xl", "--shape-2xl"]) {
      expect(declaration(block, role)).toBe("2px");
    }
    for (const role of ["--border-thin", "--border-thick", "--border-chunky", "--border-fat"]) {
      expect(declaration(block, role)).toBe("1px");
    }
    for (const role of ["--press-1", "--press-2", "--press-3", "--press-4"]) {
      expect(declaration(block, role)).toBe("none");
    }
    // --shape-full is deliberately NOT flattened: a circle is a shape, not a bevel, and the
    // plain cookie is still a circle.
    expect(declaration(block, "--shape-full")).toBeNull();
  });

  it("points the display face at the plain system stack when the marquee is unbought", () => {
    const block = plainBlock(":root[data-look-marquee='off']");
    expect(declaration(block, "--font-display")).toBe("var(--font-en)");
  });

  it("zeroes the motion scale and stops every transition when motion is unbought", () => {
    expect(declaration(plainBlock(":root[data-look-motion='off']"), "--motion-scale")).toBe("0");
    expect(PLAIN_LAYER).toContain("animation: none !important");
    expect(PLAIN_LAYER).toContain("transition: none !important");
  });

  it("hides the drawn art in favour of the plain glyph, and the drawn cookie in favour of a word", () => {
    expect(PLAIN_LAYER).toContain(":root[data-look-art='off'] .game-icon,");
    expect(PLAIN_LAYER).toContain(":root[data-look-art='off'] .game-icon-plain {");
    expect(PLAIN_LAYER).toContain(":root[data-look-art='off'] .cookie-btn__plain {");
  });

  it("gates every dark block in the sheet on the dark rung", () => {
    // The mechanism is a narrowed guard, not a second palette: with the rung unbought no dark
    // block matches and the light values on bare `:root` are what is left standing.
    expect(V2_LAYER).not.toMatch(/:root:not\(\[data-theme='light'\]\)/);
    expect(V2_LAYER).not.toMatch(/(?<!\])\s:root\[data-theme='dark'\]/);
    // Six guards: the token block, the cookie-palette block and the destructive gate's key,
    // each written twice — once for the system preference and once for an explicit choice.
    expect(V2_LAYER.match(/data-look-dark='on'/g)?.length).toBe(6);
  });
});

/* ─────────────────────────────────────────────────────────────────────────────── the floors */

describe("look tiers: the floors, which are not for sale at any tier", () => {
  /** WCAG relative luminance of a #rrggbb string. */
  function luminance(hex: string): number {
    const channels = [1, 3, 5].map((offset) => {
      const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  }

  function contrast(a: string, b: string): number {
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (high + 0.05) / (low + 0.05);
  }

  it("keeps every text pair in the plain palette at AA or better", () => {
    const block = plainBlock(":root[data-look-palette='off']");
    const token = (name: string) => {
      const value = declaration(block, name);
      expect(value, `${name} must be declared in the plain palette`).not.toBeNull();
      return value as string;
    };

    // Body text and secondary text on the page.
    expect(contrast(token("--on-surface"), token("--surface"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("--on-surface-variant"), token("--surface"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("--on-surface"), token("--surface-high"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("--on-surface-variant"), token("--surface-high"))).toBeGreaterThanOrEqual(4.5);
    // The container roles, which is what a coin-slot plate and a shop row are painted with.
    expect(contrast(token("--on-primary-container"), token("--primary-container"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("--on-secondary-container"), token("--secondary-container"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("--on-tertiary-container"), token("--tertiary-container"))).toBeGreaterThanOrEqual(4.5);
    // The filled roles, used for a primary button's label.
    expect(contrast(token("--on-primary"), token("--primary"))).toBeGreaterThanOrEqual(4.5);
    // The three tool tiers, which keep their ORDER in grey so the tech tree still escalates.
    for (const tier of ["1", "2", "3"]) {
      expect(contrast(token(`--on-tier${tier}`), token(`--tier${tier}`))).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(token(`--on-tier${tier}-container`), token(`--tier${tier}-container`)),
      ).toBeGreaterThanOrEqual(4.5);
    }
    expect(luminance(token("--tier1"))).toBeGreaterThan(luminance(token("--tier2")));
    expect(luminance(token("--tier2"))).toBeGreaterThan(luminance(token("--tier3")));
  });

  it("keeps the status and error roles readable rather than greying them out", () => {
    // --error is the shared surface-kernel's, and the plain state re-pins it to the kernel's own
    // LIGHT value rather than to a grey, because an error that reads as ordinary text is worse
    // than an ugly one. #ba1a1a on white is 5.9:1.
    const block = plainBlock(":root[data-look-dark='off']");
    expect(declaration(block, "--error")).toBe("#ba1a1a");
    expect(contrast("#ba1a1a", "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrast(declaration(block, "--on-error-container") as string, declaration(block, "--error-container") as string)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the focus ring visible in the plain state", () => {
    // v2 draws every focus ring with an outline in --spark-ring. The token survives into plain
    // as a dark grey rather than being switched off, so not one focus rule above had to change.
    const ring = declaration(plainBlock(":root[data-look-palette='off']"), "--spark-ring") as string;
    expect(ring).toBe("#555555");
    expect(contrast(ring, "#ffffff")).toBeGreaterThanOrEqual(3);
    expect(V2_LAYER).toContain("outline: 4px solid var(--spark-ring)");
    // And no rule in the plain layer removes an outline anywhere.
    expect(PLAIN_LAYER).not.toMatch(/outline:\s*(none|0)/);
  });

  it("never shrinks either opening-state control's hit area", () => {
    // The structural stage now legitimately sizes layout wrappers and the visually hidden
    // description. The two controls themselves remain the ordinary full-size cookie and slot.
    const cookieBlock = plainBlock(":root[data-look-cabinet='off'] .cookie-btn");
    for (const property of ["width:", "height:", "min-height:", "min-width:", "padding:"]) {
      expect(cookieBlock).not.toContain(property);
    }
    expect(PLAIN_LAYER).not.toMatch(/^\s*:root[^\n]*\.coin-slot[^\n]*\{/m);
  });

  it("cannot buy motion back from someone who asked the system not to have it", () => {
    // The reduced-motion queries live entirely in the v2 layer and the plain layer adds none of
    // its own, so there is no combination in which owning `look.motion` reaches one of them.
    expect(V2_LAYER).toContain("@media (prefers-reduced-motion: reduce)");
    expect(PLAIN_LAYER).not.toContain("@media (prefers-reduced-motion");
    expect(PLAIN_LAYER).not.toContain("data-look-motion='on'");
  });

  it("keeps the affordable graphics purchase slot visible without restyling coin slots", () => {
    // The opening composition hides the cabinet, not the graphics ladder's own affordable
    // purchase affordance. No rule in this layer changes a coin slot's target or semantics.
    expect(PLAIN_LAYER).toContain(".look-purchase-slot");
    expect(PLAIN_LAYER).not.toMatch(/^\s*:root[^\n]*\.coin-slot[^\n]*\{/m);
    expect(PLAIN_LAYER).not.toContain("controls-catalogue");
  });

  it("defines the exact fresh render as one cookie and no surrounding graphics", () => {
    const hiddenUntilCabinet = [
      ".title-bar",
      ".cabinet-head",
      ".discovery-ticket",
      ".upgrade-shelf",
      ".shop-rail",
      ".milk-tide",
      ".golden-stage",
      ".event-stage",
      ".event-indicator-stack",
      ".toast-stack",
      ".offline-banner",
      ".shell-status",
      ".canonical-palette-launch",
      ".click-popup",
      ".cookie-cps",
      ".cookie-hero__hint",
    ];
    for (const selector of hiddenUntilCabinet) {
      expect(PLAIN_LAYER).toContain(`:root[data-look-stage='cookie-only'] ${selector}`);
      expect(PLAIN_LAYER).toContain(`:root[data-look-stage='palette-only'] ${selector}`);
    }
    expect(PLAIN_LAYER).toContain(":root[data-look-stage='cookie-only'] .stage__hero-column > .panel.cookie-hero");
    expect(PLAIN_LAYER).toContain(":root[data-look-stage='cookie-only'] .cookie-target-wrap");
    expect(PLAIN_LAYER).not.toContain(":root[data-look-stage='cookie-only'] .cookie-btn");
  });

  it("holds golden rays and home drawings behind their purchased graphics tiers", () => {
    expect(PLAIN_LAYER).toContain(":root[data-look-glow='off'] .golden-sprite__rays");
    for (const selector of [
      ".home-room__cutaway",
      ".home-room__plan",
      ".home-room__scaffold",
      ".home-furnishing",
      ".home-furniture-row__glyph",
      ".home-gauge__arc",
      ".home-gauge__fill",
      ".home-gauge__needle",
      ".home-gauge__hub",
    ]) {
      expect(PLAIN_LAYER).toContain(`:root[data-look-art='off'] ${selector}`);
    }
  });

  it("keeps the only visible control named and points it at an accessible purchase explanation", () => {
    expect(COOKIE_HERO_SOURCE).toContain("aria-label={bilingualText(COOKIE_SCREEN_COPY.clickTarget)}");
    expect(COOKIE_HERO_SOURCE).toContain("aria-describedby={lookDescriptionId}");
    expect(COOKIE_HERO_SOURCE).toContain('className="look-purchase-description"');
    expect(COOKIE_HERO_SOURCE).toContain("nextLook.affordable ?");
    expect(COOKIE_HERO_SOURCE).toContain("requestAnimationFrame(() => buttonRef.current?.focus())");
    const descriptionBlock = plainBlock(".look-purchase-description");
    expect(descriptionBlock).not.toContain("display: none");
    expect(descriptionBlock).toContain("clip-path: inset(50%)");
  });
});

/* ──────────────────────────────────────────────────────────────────────── the grandfather */

describe("look tiers: the grandfather clause", () => {
  it("hands a played save the whole look, because it has been looking at it all along", () => {
    const played = migrateToLatest(
      {
        schemaVersion: 8,
        lifetimeCookies: { mantissa: 5, exponent: 3 }, // 5,000
        controlUnlocks: { purchasedRungIds: ["chrome.drag"] },
      },
      8,
    );
    expect(played.finalVersion).toBe(SAVE_SCHEMA_VERSION);
    expect((played.data.controlUnlocks as { purchasedRungIds: string[] }).purchasedRungIds).toEqual([
      "chrome.drag",
      ...V9_GRANDFATHERED_RUNG_IDS,
    ]);
  });

  it("starts a save that never got going plain, exactly like a fresh one", () => {
    const barely = migrateToLatest(
      {
        schemaVersion: 8,
        lifetimeCookies: { mantissa: 4, exponent: 2 }, // 400
        controlUnlocks: { purchasedRungIds: [] },
      },
      8,
    );
    expect((barely.data.controlUnlocks as { purchasedRungIds: string[] }).purchasedRungIds).toEqual([]);
  });

  it("keeps the deepest saves on the granting side of the threshold", () => {
    // A lifetime total past 1e308 overflows a double; comparing the pair is what keeps the
    // most-played save in existence from waking up as a white page.
    const maxed = migrateToLatest(
      { schemaVersion: 8, lifetimeCookies: { mantissa: 4.2, exponent: 400 }, controlUnlocks: { purchasedRungIds: [] } },
      8,
    );
    expect((maxed.data.controlUnlocks as { purchasedRungIds: string[] }).purchasedRungIds).toEqual([
      ...V9_GRANDFATHERED_RUNG_IDS,
    ]);
  });

  it("never duplicates a rung the save already bought", () => {
    const already = migrateToLatest(
      {
        schemaVersion: 8,
        lifetimeCookies: { mantissa: 9, exponent: 9 },
        controlUnlocks: { purchasedRungIds: ["look.palette"] },
      },
      8,
    );
    const ids = (already.data.controlUnlocks as { purchasedRungIds: string[] }).purchasedRungIds;
    expect(ids.filter((id) => id === "look.palette")).toHaveLength(1);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("freezes the grant list at exactly the seven rungs that exist at version 9", () => {
    expect(V9_GRANDFATHERED_RUNG_IDS).toEqual(LOOK_RUNG_IDS);
    // Every granted id must still be a real rung. The reverse is deliberately not asserted: a
    // tier added after this migration was written was never seen by an older save.
    for (const id of V9_GRANDFATHERED_RUNG_IDS) {
      expect(LOOK_RUNG_IDS).toContain(id);
    }
  });
});

/* ───────────────────────────────────────────────────────────────────────────────── helpers */

/** The body of one selector's block inside THE PLAIN LAYER. Throws if the selector is missing. */
function plainBlock(selector: string): string {
  const start = PLAIN_LAYER.indexOf(`\n${selector} {`);
  if (start < 0) throw new Error(`The plain layer has no block for ${selector}`);
  const open = PLAIN_LAYER.indexOf("{", start);
  const close = PLAIN_LAYER.indexOf("\n}", open);
  return PLAIN_LAYER.slice(open + 1, close);
}

/** One custom property's value inside a block, or null when the block does not declare it. */
function declaration(block: string, property: string): string | null {
  const match = new RegExp(`(?:^|\\n)\\s*${property.replace(/-/g, "\\-")}:\\s*([^;]+);`).exec(block);
  return match ? match[1].trim() : null;
}
