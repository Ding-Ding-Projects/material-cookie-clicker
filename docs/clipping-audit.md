# Clipping audit

A systematic overflow/clipping audit of the running game, and the record of what it
found. Every number here is a rect read off the built application through the Chrome
DevTools Protocol — nothing in this file was estimated, and nothing was taken from a
screenshot by eye.

## How to run it

```
npx vitest run scripts/capture-seed-clipping.test.ts     # writes the three save states
node_modules/electron/dist/electron.exe . --remote-debugging-port=<port>
node scripts/clipping-audit.mjs <port> captures/tmp/clipping/report.json
```

`scripts/clipping-audit.mjs` walks every visible element and reports six shapes:

| Check | What it means |
| --- | --- |
| `overflow-x` | a child or text run is wider than a box that does not scroll |
| `clipped-text` | text cut by `overflow: hidden` with no ellipsis to admit it |
| `escapes-viewport` | a border box outside the window |
| `escapes-clipper` | a border box outside its nearest clipping ancestor, per axis |
| `cut-mid-row` | a card sliced by a scroller that has less than one card left to scroll |
| `flush-label` | a label with under 2px of room inside a box it cannot enlarge |

It runs three saves (`plain`, `mid`, `late`) at 1440x900, 1232x860 and 1000x720 with
every dialog opened, plus 900x720 and 820x700 for the stacked drawer layout, plus the
two owner-reported cases that are not element geometry: which door a panel was opened
from, and whether a toast takes the clicks aimed at an open dialog. 42 blocks in all.

### Measuring honestly is most of the work

Five rules in the harness exist because the naive version of the check reported
thousands of things that were not defects, and each is worth knowing before trusting a
number from it:

- **`scrollWidth` is useless in this cabinet.** Almost every lit control carries a
  drifting `::after` sheen inset `-60%` past its own box, and a pseudo-element counts
  towards `scrollWidth` — so it reported every console cap as overflowing by ~200px, at
  a different amount every frame. Overflow is measured from real children and text runs.
- **A range over a block element measures the line box, not the ink.** Measuring one
  reports every block-level button as flush against itself. Only elements that own their
  own text node are measured.
- **A shrink-to-fit box is snug by construction.** The coin-slot price plates are sized
  *by* their text, so "text fills the content box" is true of them at any window size and
  nothing is ever cut. Recorded as excluded rather than dropped.
- **`overflow-x: clip` clips one axis.** Comparing both axes against a single-axis
  clipper invents findings.
- **Visually-hidden text is a 1px clipped box on purpose.** Detected by its shape, not by
  a class name.

## What the audit found, and what happened to it

Fixed on `main` in `a9037c3` from this lane's first report, and re-verified here:

| Finding | Measured | State |
| --- | --- | --- |
| `DIESEL FACTORY` cap label ran past its cap | 3.2px past a 96px cap | fixed |
| cabinet head ran past the cabinet at 1000px | 71.4px past a 939px box | fixed |
| supplies plates clipped off-screen at 1000px | shelf contents to x 1063 in a 900px window | fixed |
| depot status card escaped the rail's box | — | superseded (see below) |
| home room cards cut mid-card | — | partly; snap added, card still larger than the panel |
| tools "Open it now" label flush | 97px box | regressed (see below) |

Found by the verification pass and fixed here:

| Finding | Measured | Fix |
| --- | --- | --- |
| hold-to-click hint cut by the hero band | hint at y 545–560 in a panel ending at 549 — 4px of a 15px line, at every size | band allowance measured (62px) instead of guessed (48px) |
| depot card and its Open button clipped out of the rail | card to y 698 and its 44px button to 712, in a rail ending at 663 | ladder yields its floor; the card's `max-height: 55%` cannot close below the card's own 190px contents; on short windows the card drops its figures and note |
| shop row Buy button off the bottom of the window (stacked layout) | button at y 705–749 in a 720px window | the cabinet scrolls below 900px; the rail is bounded and keeps its furniture |
| supplies shelf ran off the right of the window | shelf squeezed to 100px, contents to x 1063 at 900px | shelf clips its own box; its plates become a declared horizontal scroller below 1260px; below 900px the shelf takes its own row |
| panel opened from the depot card was a third-size strip | 240px panel with a 155px body, against 551px/466px from the console emblem — the same dialog | `top` is clamped so the panel keeps its full working height whichever control opened it |
| toast stack covered an open dialog **and took its clicks** | 560x146px overlap; `elementFromPoint` returned the toast | stack moves to z-index 30, below the modal scrim's 40 |
| `ACHIEVEMENTS` cap label broke mid-word | "ACHIEVEMEN / TS" | 10px/0.02em in a 100px cap fits the longest word whole; word-breaking turned off |
| event countdown clock clipped | "62s" cut inside its own body at 1000x720 | `.event-indicator *` from the previous pass reached the clock and the bar, which section 11 exempts by name; exemption restored |
| supplies prices hidden below 1180px | — | withdrawn: these are buy controls, and this stylesheet's own rule is "a price you cannot see is not an offer" |

Excluded, with reasons, and unchanged:

| Excluded | Why |
| --- | --- |
| visually-hidden text (76) | a 1px clipped box that exists for the accessibility tree |
| hero decoration — embers, rays, sparkle (59) | drawn to spill past the cookie on purpose |
| the milk tide (30) | a decorative band drawn behind the hero |
| shrink-to-fit plates (15) | the box is sized by its own text, so nothing is cut |
| bakery room cards (7) | deliberately larger than the dialog viewport; the panel scrolls and snaps to whole cards |
| toast stack, purchase FX, event stage, golden cookie | declared overlay layers |

**Final state: 0 unexcluded findings across all 42 blocks, stable over three
consecutive runs.**

## The layout contract this had to not break

`index.css` section 11 says the cabinet head is a constant height for a given window, so
that nothing appearing in it can move the cookie mid-play. Two fixes in this pass touch
that row, so it was re-measured rather than reasoned about:

| Window | plain | mid | late |
| --- | --- | --- | --- |
| 1440x900 | head 99, cookie y 281 | head 218, cookie y 408 | head 218, cookie y 408 |
| 1000x720 | head 95, cookie y 259 | head 214, cookie y 386 | head 214, cookie y 386 |

Identical between the mid and late saves at each width — the head does not change as the
figures inside it do. `plain` differs because it has fewer readouts on it, which is
progressive disclosure rather than the head twitching.

Where a wrap was added it is a function of window width alone and lands at a breakpoint,
never as a value changes.

## Captures

`captures/app/clip-before.png` and `captures/app/clip-after.png`, both the same view: the
mid-game save at 1000x720. In the before, the hero panel ends at "221.6 / SEC" with the
hold-to-click line cut off under it, the shop rail's footer is missing entirely, and the
console's third cap reads "ACHIEVEMEN / TS". In the after, the hint line is on screen, the
Diesel Depot card is back in the rail with its door, every cap label is whole on one line,
and the supplies plates have their prices again.
