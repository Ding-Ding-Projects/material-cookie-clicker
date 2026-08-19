# Graphics purchase progression

## Behavior

A brand-new save begins with one usable plain cookie and no surrounding graphics. The title bar,
cookie counters, cabinet frame, console, discovery tickets, shop rail, background effects, event
decorations, room drawings, and other visual layers do not appear merely because the player has
produced cookies.

Graphics are bought in one ordered seven-rung ladder:

| Rung | Price | What it adds |
| --- | ---: | --- |
| Colour | 50 | The warm bakery colour palette |
| The cabinet | 250 | The cabinet structure, counters, console, and gameplay-owned rails |
| Display typography | 750 | The marquee and display type |
| The oven glow | 1,800 | Background light, embers, crumbs, and golden-cookie rays |
| The illustrated art | 4,000 | The drawn cookie, icons, room cutaways, furniture, and gauges |
| Motion | 8,000 | Press travel and animation, subject to reduced-motion preferences |
| The dark theme | 15,000 | System-dark appearance support |

Reaching a price makes only the next rung's purchase button appear. It never buys the rung. The
purchase subtracts its exact price once, persists in `controlUnlocks.purchasedRungIds`, and cannot
be repeated or bought out of order. While the button is not yet visible, the cookie's accessible
description names the next rung, its price, and that continued clicking is the path to it.

## Configuration and persistence

The registry and prices live in `src/shared/game/control-unlocks.ts`. The ordered presentation
mapping lives in `src/shared/game/look-tiers.ts`; `data-look-stage` selects the cookie-only,
palette-only, or cabinet composition, while the seven `data-look-*` attributes select individual
visual layers. The ordinary save codec already persists the purchased rung identifiers.

Existing saves keep graphics they already own. The version-9 migration continues to grandfather
the seven look rungs only for sufficiently played version-8 saves, preserving their previously
visible interface. New saves and barely started older saves receive no graphics automatically.

## Failure modes

- Production must never append a graphics rung to the save.
- A purchase below its price, above an unowned predecessor, or already owned is a no-op.
- An unowned cabinet must not leak counters, console controls, rails, or discovery cards.
- An unowned glow must not leak particle or golden-ray effects.
- An unowned art tier must not leak room or furniture drawings.
- The plain cookie keeps its accessible name, focus ring, full hit target, and next-purchase
  description even when every surrounding visual surface is absent.

## Security and privacy

This is local save-state arithmetic. It performs no network request and stores no credential or
personal data. A locally edited save may grant a rung; this is expected for a single-player local
game and is not treated as a security boundary.

## Verification

`tests/game/look-tiers.test.ts` proves the exact fresh structural state, ordered affordability,
single deduction, duplicate refusal, persistence attributes, golden-ray boundary, room-art
boundary, and the grandfather migration. Its purchase regression is also exercised red then green
by temporarily inverting the expected fresh stage.

## Suggested articles

- [Cookie clicking](cookie-clicking.md)
- [The 21-tier generator ladder](generator-ladder.md)
- [Endless Home construction](home-construction.md)
- [Golden-cookie events](golden-cookie-events.md)
