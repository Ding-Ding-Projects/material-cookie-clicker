# Design-parity drift analysis · 設計對照偏差分析

Scope: the five worst-drifting rows in `design/parity/inventory.json`
(`tokens-type--scale` 57.0%, `cookie-surface--gallery` 43.3%,
`building-row--gallery` 41.8%, `settings-funny-sliders--default` 38.8%,
`upgrade-card--gallery` 36.7%). All measurements below were taken directly
against the checked-in evidence PNGs (`design/parity/evidence/<row>/reference.png`
and `.../product.png`), not against `inventory.json`'s own `evidence.*.status`
fields — those fields all read `"pending"` even though the PNG pairs exist on
disk and the per-row `diff.json` / `receipt.json` files describe a completed
`cheap-lowlevel-headless` capture at commit `6f878d9fc1dc6246a7a078ce33aa9b12531fe775`.
That mismatch between the inventory's own bookkeeping and the evidence that
actually exists is itself worth fixing, but it is not one of the five rows
and I have not touched it (read-only lane).

Method: for each row I diffed `reference.png` against `product.png` pixel-by-pixel
(threshold: per-channel sum of absolute differences > 30), built an 8×5 coarse
grid of local diff density to locate *where* the difference concentrates, and
then cropped and visually inspected the reference and product images side by
side at those coordinates. For `tokens-type--scale` I additionally cross-correlated
the two images at vertical offsets -6..+6px to check for a simple scroll/shift
explanation, and rendered a 4x-amplified `ImageChops.difference` overlay to see
ghosting patterns across the whole page in one image.

No product CSS was changed. No file other than this one was created or edited.

---

## tokens-type--scale (57.0% changed)

**Where the difference is:** everywhere with text on the page — the top
"Toggle light / dark" pill, the "Live type scale" heading, and every row of
the type-scale sample card, plus a solid vertical stripe in the rightmost
~160px column (the scrollbar track).

**Evidence:** the amplified difference overlay
(cross-checked by eye against `reference.png`/`product.png` crops) shows
every glyph on the page doubled/ghosted by a small, roughly constant offset —
on the order of 2-3px, both horizontally and vertically — rather than any
missing text, wrong font, wrong size, or wrong color. Cross-correlating the
two images at vertical shifts of -6..+6px found the *unshifted* (dy=0)
alignment already minimizes pixel difference, so this is not a simple
whole-page vertical scroll offset; the ghosting is closer to a sub-pixel/AA
registration difference that is present at every single line of text on the
page rather than a real content or layout change. The card's background fill
is also a hair darker in the product capture than the reference (visible as a
faint navy tint in the amplified diff over the card body), and the scrollbar
thumb is a different color between the two (thin grey in the reference,
themed brown in the product) — that scrollbar-track stripe alone, at ~15-20px
wide inside a 160px-wide grid column, plausibly accounts for the persistent
~11-16% "column 7" reading in every row of the coarse grid.

**Classification: (b) tuple mismatch — most likely — with residual uncertainty.**
The declared tuple (1280×800, scale 1, light theme, `en-HK`) is identical on
both sides per `inventory.json`, and the *content* is identical (same text,
same type ramp, same card). But the reference is captured from
`design/reference-app` (a plain static page, presumably a bundled headless
Chromium with its default scrollbar) while the product route runs the actual
Electron app with an app-styled scrollbar. A themed scrollbar that is even a
few pixels narrower/wider than the reference's native OS scrollbar changes
the available content width by that same amount, which is enough to reflow
every line of text by a small constant number of pixels — exactly the
uniform whole-page ghosting seen here, and exactly why nearly every grid cell
shows a "differs a little" rather than "differs a lot" reading.

I cannot fully rule out (c) — a genuine sub-pixel line-height, padding, or
letter-spacing token difference between the reference stylesheet and the
product's Material type tokens would look the same at this resolution. But
the pattern (uniform, non-accumulating offset present on literally every
glyph including a heading that never changes across states) is much more
consistent with a rendering/chrome artifact than with a targeted CSS bug.

**Next action:** before touching any token, first make the two capture
harnesses render the *same* scrollbar (either force `overflow: hidden` /
disable the scrollbar in the design-parity route for both sides, or apply
`scrollbar-gutter: stable` identically in `design/reference-app` and in
`design-parity-route.css`, and confirm both harnesses hide it in the exact
same way). Recapture, re-diff, and see how much of the 57% survives. If a
meaningful residual remains after the scrollbar/gutter is equalized, escalate
to inspecting `line-height` / vertical rhythm in `design-parity-route.css`
against the reference's type-scale CSS — but do that only after the cheap fix
has been tried and measured, not before.

---

## cookie-surface--gallery (43.3% changed)

**Where the difference is:** concentrated almost entirely in one horizontal
band, roughly y=160–480 (the "Interaction states" cookie gallery row), where
grid cells read 90-99% different — i.e. essentially every pixel in that band
differs. The page header/toggle area above it (y<160) is unchanged.

**Evidence:** a direct crop-and-look comparison of that band shows two
different pieces of artwork, not a shifted or recolored version of the same
one. The reference renders six small, flat, simply-shaded vector cookie
icons (~130px diameter, soft single highlight, a handful of large dark
dots) laid out with visible spacing between them, and the fourth ("focus")
state has a visible outlined focus ring circle around it. The product
renders six much larger (~150-170px), heavily textured/gradient-shaded
photographic-style cookie illustrations (many small chips, visible dough
texture/striations, a warmer gradient) that overlap/crowd each other because
they are wider than the reference's icons, and the focus-ring outline on the
fourth cookie is not visibly present in the product crop.

**Classification: (c) genuine product divergence.** This is not a stale
capture or a tuple problem — the two sides are simply drawing different
cookie artwork at a different size, and the product is missing (or is
rendering illegibly small/absent) the visible focus indicator that the
reference shows on state 4. Recapturing either side would not change this;
the underlying assets/markup differ.

**Next action:** locate the cookie artwork used by the design-parity
`cookie-surface` gallery state in `src/renderer/DesignParityRoute.tsx` (the
gallery-state cookie rendering, likely reusing whatever asset the live
`#cookie` game surface uses) and compare it against whatever asset
`design/cookie-surface.html` references — confirm whether the product is
intentionally using the "live game" cookie art (which the reference's own
`materialDesign3Notes` says should remain "domain data art") at a size/shape
that was never matched to the reference's icon set, or whether the reference
itself needs updating to the current cookie art. Separately, verify the
`:focus-visible` ring token is actually applied to the fourth gallery state
in the product markup — the ring's absence is a distinct, checkable defect
regardless of which side's artwork is judged correct.

---

## building-row--gallery (41.8% changed)

**Where the difference is:** near the top text (heading ghosting, same
scrollbar-column pattern as `tokens-type--scale`) and heavily inside every
building row card body (y≈300 downward, especially columns 0-1 and 6-7 of
the grid, 20-48% differing per cell).

**Evidence:** cropping the first row ("Grandma's Bakery") side by side shows
a structural layout difference, not a rendering artifact:
- **Reference** lays the row out on a single line: emoji icon, then
  title/subtitle/CPS stacked at left, an owned-count number roughly
  center-left, a four-segment `×1 / ×10 / ×100 / Max` control in the middle,
  and a solid dark-brown filled "Buy · 買 — 🍪 1,240" pill button at the
  right — everything vertically centered in one ~110px-tall row.
- **Product** wraps the same information across two rows inside the card:
  a top row with icon, title/subtitle/CPS at left and the owned-count number
  pushed to the far right edge; a second row below it with the `×1/×10/×100/Max`
  segmented control at left and a much wider, pale-pink, low-contrast "Buy · 買
  — 🍪 1,240" button filling most of the remaining width at right. The icon
  itself also differs (a stylized bakery/cabinet glyph in product vs. a
  grandma-face emoji in reference).

**Classification: (c) genuine product divergence.** This is a component
structure and styling difference — different DOM/flex layout (one row vs.
two), a different icon asset, and a different visual treatment for the Buy
button (reference: high-contrast filled button; product: pale, low-contrast
button that reads as unstyled/disabled even though the row is affordable).
No capture or tuple setting explains a two-row vs. one-row layout.

**Next action:** open the building-row component markup/CSS the design-parity
route uses (`src/renderer/DesignParityRoute.tsx` plus whichever shared
building-row component it mounts) and compare its flex/grid layout against
`design/building-row.html`. Two concrete, checkable defects to start with:
(1) the Buy button's fill color/contrast token — it should almost certainly
be using the same filled/tonal button role as the reference's dark-brown
pill rather than whatever pale/disabled-looking role it currently resolves
to; (2) whether the row is deliberately meant to wrap onto two lines at this
viewport width (a legitimate design change) or whether the reference's
single-line layout is the target and the product's flex-wrap is a bug.

---

## settings-funny-sliders--default (38.8% changed)

**Where the difference is:** starts small near the top (same header/scrollbar
ghosting as the other rows) and then grows sharply and *progressively* deeper
into the page — by the "Message voice" section (y≈600-800) most grid cells
read 40-76% different, the worst of any row measured in this pass.

**Evidence:** the amplified difference overlay shows the same doubled-text
ghosting pattern as `tokens-type--scale` at the top of the page, but unlike
that row the vertical offset between reference and product visibly *increases*
the further down the page you look — the "Language mode" card boundary is
only slightly misaligned, but by the "These are two separate controls…" notice
box and the "Message voice" section headings, the reference and product
copies of the same text are offset by a visibly larger number of pixels than
at the top. This growing-with-depth pattern is different in kind from the
constant small offset seen in `tokens-type--scale`, and rules out a single
shared cause (like just the scrollbar) for both rows.

**Classification: (c) genuine product divergence**, most likely a spacing/
padding/gap difference that compounds section-by-section down the page
(e.g., a card's internal padding, or the margin between stacked settings
sections, is a few pixels larger or smaller in the product than in the
reference, and that difference accumulates every time another section is
stacked below it). I did not isolate the exact rule — that requires reading
`design-parity-route.css` next to `design/settings-funny-sliders.html`
section by section, which is out of scope for a read-only drift triage —
but the progressive-offset signature is a strong, specific lead for whoever
does that work.

**Next action:** measure the vertical distance between two fixed landmarks
present in both the reference and product screenshots (e.g. top of the
"Language mode" card to top of the "Message voice" heading) directly in
pixels on each side; the delta is the accumulated spacing error and should
point at exactly which margin/padding/gap token to compare between
`design/settings-funny-sliders.html` and the product's settings-section CSS.
Do this before changing any spacing value, since guessing which of several
stacked sections carries the error would likely require multiple
build/screenshot round-trips otherwise.

---

## upgrade-card--gallery (36.7% changed)

**Where the difference is:** concentrated in the three upgrade cards
themselves (y≈380-716), with the second and third cards showing the most
extreme cell readings in this entire five-row pass (up to 100% differing in
single grid cells).

**Evidence:** a direct crop of the three-card row shows the cards using
visibly different shapes and positioning between the two sides, not just
different colors or icons:
- **Reference:** three same-sized rectangular cards with modestly rounded
  corners, laid out in a uniform 3-column grid, each with an icon/lock badge
  near the top-left, title, description, and status/CTA text stacked below
  it, all starting at the same vertical position.
- **Product:** the first card is roughly rectangular (closer to the
  reference), but the second card renders as a large organic blob/oval shape
  and the third as a tall stadium/pill shape — different shapes from each
  other and from the reference's uniform rectangle — and both are taller and
  shifted lower/wider than the reference's card, overlapping the row's
  right edge and reference's set boundaries.

**Classification: (c) genuine product divergence.** Rectangular vs.
oval vs. pill silhouettes for what should be three instances of the same
card component cannot come from a stale screenshot or a viewport/theme
mismatch; it means the three cards are picking up different `border-radius`
(shape token) values, or different shape roles entirely, depending on state
(locked / unlocked-buyable / owned), when the reference clearly intends one
consistent card shape across all three states.

**Next action:** find where the upgrade-card gallery states set their shape
token (likely a per-state class or inline style keyed to
`locked`/`unlocked-buyable`/`owned` in the design-parity route or the shared
upgrade-card component) and confirm whether a shape token meant for something
else (e.g., a badge or a button) is being applied to the whole card container
for two of the three states. This is the most visually severe of the five
rows and the shape mismatch alone is very likely the largest single
contributor to its 36.7%.

---

## Summary table

| Row | Ratio | Classification | Confidence |
| --- | --- | --- | --- |
| tokens-type--scale | 57.0% | (b) tuple/rendering-chrome mismatch (scrollbar/gutter), residual (c) not ruled out | medium |
| cookie-surface--gallery | 43.3% | (c) genuine divergence — different cookie artwork + missing focus ring | high |
| building-row--gallery | 41.8% | (c) genuine divergence — two-row vs. one-row layout, Buy button contrast, icon asset | high |
| settings-funny-sliders--default | 38.8% | (c) genuine divergence — accumulating vertical spacing error | high (pattern), unlocated (exact rule) |
| upgrade-card--gallery | 36.7% | (c) genuine divergence — inconsistent card shape token across states | high |

Four of the five worst rows are real product/component defects, not capture
artifacts — recapturing them would not close the gap. Only
`tokens-type--scale` has a plausible capture-fidelity explanation (scrollbar
rendering difference between the two harnesses), and even there a residual
CSS difference cannot be ruled out without first equalizing the scrollbar and
re-measuring.
