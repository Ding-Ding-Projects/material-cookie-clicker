# Material Cookie Clicker — design specs (v2, "arcade cabinet")

Self-contained HTML preview/spec files for the Material Cookie Clicker design system. Every
file is a standalone document: inline CSS only, no external stylesheet, no CDN, no remote
font or image, no analytics, no network request of any kind. Open any file directly in a
browser to view it. These are inputs for a Claude Design bundle upload performed elsewhere;
nothing in this directory uploads itself.

Every file's first line is a card marker (`<!-- @dsCard group="..." -->`) used to build the
Design System pane's card index.

## What v2 is, and why v1 was replaced

v1 ("cosy bakery × arcade cabinet") read correctly as specs but the built app still read as a
**website**: pale flat panels, small type, hairline-ish borders, cards in a scrolling column,
features spread across tabbed pages. The owner's verdict was blunt — "it looks 100% like a
website — 100% unacceptable" — and the instruction was a full new design *for this game*, not
another pass over web conventions.

v2 is that redesign. The palette family is inherited (warm browns/golds, golden-cookie accent,
jewel tiers) because it was already right; almost everything else changed:

- **One game surface, not a set of pages.** See `game-layout.html`. The moment-to-moment loop —
  click the cookie, buy a generator, buy an upgrade — happens on a single screen with **no
  navigation between those three things**. The cookie is the hero, the generator shop is docked
  beside it as a right rail, and upgrades are a compact ticket strip on the same surface. Below
  ~860px the shop rail becomes a bottom-sheet drawer on that same surface (the cookie stays
  visible and clickable above it) rather than a separate screen. Tabs still exist, but only for
  genuinely secondary surfaces a player visits deliberately and briefly: statistics, achievements,
  the tools tech tree, prestige, settings. **Putting a core-loop control behind a tab is a spec
  violation.**
- **An arcade-cabinet frame instead of a document.** Every page background is a deep radial
  *oven glow* (`--bg-core` → `--bg-mid` → `--bg-edge`), never a flat fill. Light is "bakery
  daytime"; dark is "arcade night" — and dark is not the light theme with the lights off: the
  cabinet is lit from inside, so the glow gets *brighter* toward its centre while the rim goes
  to near-black.
- **Typography that shouts.** Headings are 28–50px display face, all-caps, letter-spaced,
  set on a bevelled marquee plate. Section labels are 0.20–0.24em letter-spaced all-caps runs,
  like the lettering painted on a cabinet bezel. Counters are 38–54px, weight 900, tight
  tracking, always `tabular-nums`. Still a system stack, no bundled or remote font (see below).
- **Physical chunk.** Borders went from 1–4px to 2–7px (`--border-thin` 2px through
  `--border-fat` 5px, with the prestige gate at 7px). Radii went from 4–28px (M3) via 8–34px (v1)
  to 10–40px. Depth is a paired system: `--drop-1…4` (4/6/8/10px) is the travel *length* a
  control moves when pressed and the height of its solid base, `--press-1…4` are the matching
  solid box-shadows. Nothing in v2 uses a blurred drop shadow.
- **Real arcade buttons.** The cookie is now 168px, domed by a radial fill plus a CSS glass
  highlight, seated in a doubled solid base (`--md-primary-shadow` plus a `--cabinet-frame-dark`
  ring), and it travels its full 10px base on press and bottoms out.
- **Game HUD idioms throughout**, so the bundle reads as one machine:
  - **Score-panel stat tiles with inset bezels** (`stat-tile.html`): a raised outer plate, a
    recessed inner face the number sits down inside.
  - **XP-bar progress** — an inset trough (`--track`) with a bevelled fill — used in `stat-tile`,
    `tool-card`, `tools-tree`, `bulk-toolbar` and the prestige gate.
  - **Medal/badge achievements with metallic bevels** (`achievement-badge.html`): a domed face, a
    rotating conic metal rim, a double ring and its own solid base.
  - **Jewel tier gems** (`tools-tree.html`): each node carries a faceted CSS gem cut in its tier's
    jewel tone, bronze → emerald → amethyst.
  - **Ticket/coupon upgrade cards** (`upgrade-card.html`, and the mini tickets in `game-layout.html`):
    notches punched out of both edges, a dashed perforation, a price stub.
  - **Marquee narrator toasts** (`narrator-toast.html`): a tinted, all-caps header plate that names
    the kind of moment in words, over a recessed message face.

### The colour work v2 had to do

The palette was deepened, not swapped. Surfaces went warmer and richer (light surface
`#FFF3E6`, dark surface `#120C08`), a full cabinet-chrome family was added
(`--bg-core`/`--bg-mid`/`--bg-edge`, `--panel-inset`, `--bevel-hi`/`--bevel-lo`,
`--metal-hi`/`--metal-lo`, `--cabinet-frame`, `--track`), tier 1 got its own bronze instead of
borrowing the primary, and `--spark-ring` was darkened in light mode from `#D97300` to `#9C4B00`
so it clears 4.5:1 as text, not merely 3:1 as a border.

Because the background is now a *gradient*, text sits on a **range** of colours rather than one.
Every stop of that range is contrast-checked, in both schemes — that is the single most important
difference between v2's verification and v1's.

## Material Design 3 is the product-chrome target

The checked-in v2 references preserve useful game-specific art and information hierarchy, but
their product chrome is not the final conformance target. Buttons, fields, menus, tabs, dialogs,
navigation, selection controls, typography, shape, elevation, state layers, focus and motion must
use Material Design 3 primitives and anatomy. A cookie illustration, achievement medal, upgrade
ticket cut, tier jewel, chart series or progress datum may keep the colour and geometry required to
communicate game data; that exception does not extend to the button, card, dialog or navigation
surface around it.

The hand-written inventory at `parity/inventory.json` records the source-level migration without
laundering the older checked-in references into product chrome. The final cascade in
`src/renderer/styles/index.css` now supplies Material system colour aliases, type, shape, tonal
elevation, state layers, focus, reduced-motion behavior, and component anatomy for buttons,
fields, tabs, dialogs, menus, selection controls, cards, navigation and snackbars. The retained
references remain migration inputs. Every parity row still has pending reference/product captures,
comparison images and diff evidence, so this source audit is not a visual release verdict.

The following boundary is deliberate and now enforced by the focused source-style test:

| Retained as game data or art | Material product chrome now applied to |
| --- | --- |
| Cookie illustration and golden-cookie effect | Click target container and interaction state layers |
| Achievement medal artwork | Achievement card, toast and dismiss action |
| Upgrade ticket cuts and item illustration | Purchase button, card surface and focus/pressed states |
| Tool-tier jewels, progress and graph edges | Search field, cards, panels, toggles and navigation |
| Production figures, trends and chart colours | Typography scale, cards, menus and dialogs |

The one-screen core loop remains a product requirement, not an excuse for custom controls. Material
components can share one game surface while still preserving the hierarchy, speed and visibility
that the loop needs.

**Nothing about accessibility, contrast, focus, touch targets, reduced motion, or the
fully-self-contained/offline requirement changed.** Those rules apply exactly as strictly as they
did before — more strictly in practice, because a deeper, more saturated palette on a gradient is
exactly where contrast quietly fails if nobody computes it.

## Deterministic design-reference application and parity guard

The dedicated reference application renders the real checked-in HTML files directly from this
directory. It does not copy or transcribe them. Start its loopback-only server with:

```powershell
node design/reference-app/server.mjs
```

Then open a route recorded verbatim in `parity/inventory.json`, for example:

```text
http://127.0.0.1:4174/design/reference-app/index.html?row=game-layout--main&theme=light&width=1280&height=800&scale=1&state=main&locale=en-HK&capture=1
```

The route refuses tuple drift, sizes the iframe to the declared CSS viewport, validates the device
scale, renders the referenced file in place, freezes animation and transitions, fixes the random
seed and scroll position, and blocks all non-loopback content through the server's content-security
policy. Capture tooling still owns the real display scale, process isolation and raw PNG receipt.

Run the structural and deliberate negative checks with:

```powershell
node design/_verify/design-parity-guard.mjs --structure
node design/_verify/design-parity-guard.mjs --negative
node design/_verify/design-parity-guard.mjs --release
```

`--structure` proves that every checked-in reference appears exactly once with routes, tuple,
deterministic inputs, primitive audit and explicit evidence targets. `--negative` removes each
asserted boundary in turn, observes a failure, restores the inventory and observes green.
`--release` is intentionally stricter: it remains red while a raw reference capture, matching raw
product capture, labelled comparison, diff record, hash, or approved Material audit is pending.
No filename-only or source-preview substitute can make that mode green.

### Why the display face is a system stack, not a bundled font

The brief asked for a display face with character, and the project's rules forbid a remote font
(no CDN, no network request of any kind, ever). No local `.woff`/`.ttf` is available to bundle.
Rather than break the offline requirement or ship a design system with no display face,
`--font-display` stacks `"Segoe UI Black"` — bundled with every supported Windows release, this
project's current active delivery scope — then `"Arial Black"` as a near-universal cross-platform
fallback with the same chunky letterform weight, before dropping to the ordinary body stack. v2
leans on this face far harder than v1 did, so the trade-off is stated here explicitly: if a
suitable local font file is ever added to the project, `--font-display` is the one place to point
it.

## Colour contrast verification

`_verify/contrast-check.mjs` is a standalone Node script (not shipped to the app) that computes
real WCAG 2.1 contrast ratios using the sRGB relative-luminance formula for every text-bearing
colour role pair, in both light and dark schemes. Run it with `node design/_verify/contrast-check.mjs`.
It currently checks **78 pairs (39 per scheme) and all 78 pass.** New in v2's pair list: all three
oven-glow background stops, the inset HUD bezel face, the surface-container ladder, the bronze
tier that v1 never checked, and `--spark-ring` as text rather than only as a border.

`tokens-color.html` additionally recomputes the same ratios live in the browser via inline
JavaScript, so the numbers shown on each swatch are calculated in-page, not typed constants.

Tokens that are intentionally **not** contrast-checked never carry text: `--spark`/`--spark-glow`
(decorative gradient and glow fills), `--bevel-hi`/`--bevel-lo` (bevel highlights),
`--metal-hi`/`--metal-lo` (medal sweep), `--cabinet-frame`/`--cabinet-frame-dark` (structural
frame and deep bases), and `--track` (progress trough — its label always sits beside the bar,
never on it). Anything meant to carry text uses an AA-verified role instead.

`_verify/apply-v2.mjs` is the re-runnable migration helper that writes the canonical v2 token
blocks and the shared cabinet chrome into every spec file, so the token values cannot drift
between files. It is also not shipped to the app.

## Files

### Foundations

| File | Specifies |
| --- | --- |
| `tokens-color.html` | The current colour reference: semantic roles and AA-verified pairs, plus legacy cabinet-only roles that remain inventoried for migration. Domain jewel and progress colours may remain data encodings; product chrome uses Material roles. |
| `tokens-type.html` | The type system: the display face, marquee labels (all-caps, 0.20–0.24em tracking), huge tabular counters, and the full type scale against English and Traditional Chinese (Hong Kong) samples side by side. |
| `tokens-shape-elevation.html` | The legacy 10–40px radii and paired solid press bases. This is retained as an explicit migration input, not an approved product-chrome target; Material shape, elevation and state layers replace it. |

### Game Surfaces

| File | Specifies |
| --- | --- |
| `game-layout.html` | **The single main game surface.** The composite one-screen arrangement: pinned HUD readouts, the cookie hero, the upgrade ticket strip and the docked shop rail, plus the narrow-width behaviour where the rail becomes a bottom-sheet drawer on the same surface. Names the rule that core-loop controls are never behind navigation. |
| `cookie-surface.html` | The primary click target as a real arcade button: rest / hover / pressed / focus-visible / reduced-motion / disabled, the floating "+N" popup, and the golden-cookie overlay with its spark glow, ring and ray burst. |
| `building-row.html` | A generator rack slot: icon, bilingual name, recessed owned-count readout, cost, CPS contribution, buy-quantity stepper (×1/×10/×100/Max) as a segmented cabinet switch. Affordable / unaffordable / locked. |
| `upgrade-card.html` | Locked / unlocked-buyable / owned states as ticket-shaped purchases with notches, a perforation and a price stub, a hover tilt (reduced-motion aware) and a metallic owned treatment. |
| `achievement-badge.html` | Locked silhouette vs. unlocked struck medal (domed face, rotating conic metal rim, double ring, solid base), plus the marquee unlock toast. |
| `stat-tile.html` | A score-panel readout: raised plate, recessed bezel face, huge tabular counter, bilingual label, optional trend indicator (colour + glyph, never colour alone) and an XP-bar goal variant. |
| `prestige-gate.html` | The destructive-action super-confirmation gate: two independently operated key toggles, a slider disabled until both are on, animated progress fill, distinct completion state, always-available Emergency exit — rendered as the heaviest plate in the cabinet. Two live variants: prestige (recoverable) and full wipe (severe). |
| `tool-card.html` | A single tool in the Tools tech tree: undiscovered / discovered-locked / unlockable-now / unlocked, with a persistent, distinctly-bezelled "Open it now" callout present in every state. |
| `tools-tree.html` | The tech-tree overview: tools grouped by tier, each node carrying its tier's jewel gem (bronze → emerald → amethyst), with prerequisite arrows, a HUD progress summary, mixed node states, the tree's own search field with its anchored regex builder, and a "tool progression" preview toggle that affects only the game display. |

### List Controls

| File | Specifies |
| --- | --- |
| `bulk-toolbar.html` | Multi-select bulk-action rail: selection count in a recessed readout and baked into every action label, disabled in-flight state with honest progress, and an honest partial-result report. |
| `search-regex-builder.html` | A search field (recessed bezel) with the regex builder anchored directly beside it as a popover, never a detached dialog; plain-text default and regex-enabled states. |

### Settings

| File | Specifies |
| --- | --- |
| `settings-funny-sliders.html` | Language-mode selector (English / Cantonese / Bilingual) as a segmented cabinet switch, plus two independent 1–5 funny-level sliders, one per language, made visually and functionally distinct so it is unmistakable they are separate controls. |

### Feedback

| File | Specifies |
| --- | --- |
| `narrator-toast.html` | Non-blocking, corner-anchored milestone marquee: auto-dismiss and persist-until-dismissed variants, each with a tinted header plate that names the kind of moment in words. |

## The one-screen rule

Stated once, because it is the constraint most likely to be eroded by a later change:

- Clicking the cookie, buying a generator and buying an upgrade must all be reachable **without a
  single route change**.
- The cookie is never occluded by a purchase surface. At narrow widths the shop drawer covers at
  most the lower portion of the screen and the cookie stays visible and clickable above it.
- The drawer is a region on the same document, not a modal — focus is never trapped.
- Tabs are for statistics, achievements, the tools tech tree, prestige and settings only.

## Tools tech tree — the "Open it now" contract

Material Cookie Clicker's own canonical application features (command palette, regex builder,
authenticator, file converter, local model manager, appearance editor, and so on) double as
in-game "tools" discovered and unlocked through play, each granting a gameplay bonus on unlock.

**The unlock gates the game surfacing and the bonus only — never the real feature.** Every
`tool-card.html` state, including undiscovered, carries a persistent "Open it now" action that
opens the real application feature from Settings/the command palette immediately, because that
feature has always been available regardless of tech-tree progress. In v2 this callout is a
recessed bezel with a solid spark-ring border and its own "always available" badge, deliberately
distinct from the dashed, greyed lock chrome around it — precisely *because* a chunkier padlock
treatment could otherwise make it read as part of the lock rather than an escape hatch from it.

## Accessibility, contrast, and offline requirements — unchanged

These requirements apply identically to every file in this directory regardless of the visual
theme layered on top of them:

- **Contrast still meets WCAG AA, computed rather than asserted.** Run `node design/_verify/contrast-check.mjs`
  before trusting any colour change; and if you add a gradient a glyph can land on, add *both* of
  its ends to the pair list.
- **Visible focus rings on everything interactive** (v2 uses a 4px `--spark-ring` outline with a
  3px offset), keyboard operability, correct roles and accessible names on every control.
- **Minimum touch targets** (44px; most v2 buttons are 48–56px), no clipping at narrow widths or
  high display scales, checked against the longest bilingual strings.
- **`prefers-reduced-motion: reduce` fully respected.** Every bounce, tilt, press-compression,
  spin, sheen rotation, bulb blink and sparkle in this theme has a still equivalent that still
  communicates the state change — usually an instant inset shade instead of a travel animation,
  which is a discrete state change rather than motion.
- **Light and dark both legible**, driven from the same custom properties in every file so they
  cannot drift apart.
- **Fully self-contained.** No CDN, no remote font, no remote image, no network request of any
  kind. See the display-face note above for how that constraint was honoured.

## Palette summary

Warm baked-cookie brown/gold primary (`#7A4A1D` light / `#FFB876` dark) on deepened warm surfaces
(`#FFF3E6` light / `#120C08` dark), with the golden-cookie accent reserved exclusively for the
`tertiary` role — never ordinary UI chrome — plus a decorative arcade spark accent, a structural
cabinet-chrome family (oven-glow stops, inset bezel face, bevels, metal, frame, track), and a
three-step jewel tool-tier ladder (bronze/emerald/amethyst). Full hex values and their verified
contrast ratios are in `tokens-color.html`.
