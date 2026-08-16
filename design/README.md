# Material Cookie Clicker — design specs

Self-contained HTML preview/spec files for the Material Cookie Clicker design system. Every
file is a standalone document: inline CSS only, no external stylesheet, no CDN, no remote
font or image, no analytics, no network request of any kind. Open any file directly in a
browser to view it. These are inputs for a Claude Design bundle upload performed elsewhere;
nothing in this directory uploads itself.

Every file's first line is a card marker (`<!-- @dsCard group="..." -->`) used to build the
Design System pane's card index.

## This project deliberately does not follow Material Design 3

Material Cookie Clicker's specs originally conformed strictly to Material Design 3. The owner
made an explicit decision to change that: **the theme should fit a game, not a settings panel.**
M3 is kept as a *reference and a naming convention* — the files still talk about `primary`,
`secondary`, `tertiary`, `surface` roles, and the underlying colour hex values, because those were
already warm and appetising — but the visual language layered on top of those tokens is a
**cosy bakery crossed with an arcade cabinet**, not M3 Expressive. This is a decision, not an
omission: nobody forgot to finish an M3 pass, the owner asked for the opposite of one.

Concretely, here is what changed and why:

- **Chunky, pressable depth instead of M3's soft tonal elevation.** Every interactive surface
  (the cookie itself, buy buttons, cards, toggles, toasts) sits on a *solid* offset shadow — a
  darker shade of its own colour, not a blur — and visibly compresses flat when pressed, like a
  real arcade-cabinet button. See `tokens-shape-elevation.html` for the full recipe
  (`--press-1`/`--press-2`/`--press-3` plus `--md-*-shadow` tokens) and click the demo cards there.
- **Bigger, more confident shapes.** The shape scale moved from M3's 4–28px range to 8–34px
  (`tokens-shape-elevation.html`), and every border went from a 1px hairline to a minimum 2px,
  usually 3–4px. Timid corners and hairlines read as productivity software, not a bakery counter.
- **Colour with personality.** The original brown/gold/golden-cookie palette is kept (it was
  already right), but two new families were added on top: an **arcade spark accent**
  (`--spark`/`--spark-glow`/`--spark-ring`) reserved for golden-cookie moments and celebratory
  callouts, and a **jewel tool-tier ladder** (`--tier1` bronze → `--tier2` emerald →
  `--tier3` amethyst) so the Tools tech tree visibly escalates tier over tier instead of one hue
  getting slightly darker. See `tokens-color.html`.
- **A display face with character.** Headings and big milestone numbers use `--font-display`
  (`"Segoe UI Black", "Arial Black", "Segoe UI", …` — see the note below on why this is a system
  stack, not a bundled font). Body text and every factual figure stay in the highly legible
  `--font-en`/`--font-zh` stack, with `font-variant-numeric: tabular-nums` wherever a number is
  read repeatedly (stat tiles, costs, CPS deltas, progress fractions) so digits align in a column.
  See `tokens-type.html`.
- **Texture and delight, kept restrained.** A soft radial warmth sits behind the cookie surface's
  page background (an "oven glow", pure CSS gradient — no image); the cookie's chocolate-chip
  texture is bigger and bolder; a golden cookie gets a spinning ray burst and pulsing glow; upgrade
  cards tilt a couple of degrees on hover. Every one of these has a static, non-animated
  equivalent under `prefers-reduced-motion: reduce` — this is a place people sit for hours, so
  delight stops short of being tiring or distracting.

**Nothing about accessibility, contrast, focus, touch targets, reduced motion, or the
fully-self-contained/offline requirement changed.** Those rules apply exactly as strictly as they
did under the M3 pass — arguably more strictly, since a warm, saturated palette is exactly where
contrast quietly fails if nobody checks it (cream-on-caramel *looks* fine and measures 2.9:1). See
below.

### Why the display face is a system stack, not a bundled font

The brief for this pass asked for "a display face with character," and the project's own rules
forbid a remote font (no CDN, no network request of any kind, ever). No local `.woff`/`.ttf` was
available to bundle for this pass. Rather than either breaking the offline requirement or shipping
a design system with no display face at all, `--font-display` stacks `"Segoe UI Black"` — bundled
with every supported Windows release, which is this project's current active delivery scope —
then `"Arial Black"` as a near-universal cross-platform fallback with the same chunky, blocky
letterform weight, before dropping to the ordinary body stack. This is stated here explicitly so
it reads as a considered trade-off rather than a shortcut: if a suitable local font file is added
to the project in the future, `--font-display` is the one place to point it.

## Colour contrast verification

`_verify/contrast-check.mjs` is a standalone Node script (not shipped to the app) that computes
real WCAG 2.1 contrast ratios using the sRGB relative-luminance formula for every text-bearing
colour role pair — including the new jewel-tier and spark-ring pairs introduced by this theme —
in both light and dark schemes. Run it with `node design/_verify/contrast-check.mjs`.
`tokens-color.html` additionally recomputes the same ratios live in the browser via inline
JavaScript, so the numbers shown on each swatch are calculated in-page, not typed constants.

Two colour tokens are intentionally **not** contrast-checked and never carry text:
`--spark`/`--spark-glow` are decorative-only gradient/glow fills (used inside blurred golden-cookie
overlays and badge glows). Anything meant to carry text uses an AA-verified role instead
(`--spark-ring`, or the existing `tertiary`/`primary` families) — see the "Arcade spark accent"
section of `tokens-color.html` for the exact boundary.

## Files

### Foundations

| File | Specifies |
| --- | --- |
| `tokens-color.html` | The cosy-bakery-arcade colour system: the original M3-derived primary / secondary / tertiary / surface / surface-variant / outline / error role set (kept, AA-verified) plus the new arcade spark accent and the jewel tool-tier ladder (bronze/emerald/amethyst), all with live-computed WCAG contrast ratios on every text-bearing swatch. |
| `tokens-type.html` | The type system: a bold display face for headings and big numbers, a highly legible body/CJK face with tabular numerals for every factual figure, and the full M3-derived type scale shown against English and Traditional Chinese (Hong Kong) samples side by side. |
| `tokens-shape-elevation.html` | Corner radii (bigger and more confident than M3's defaults) and the chunky pressable-depth shadow system that replaces M3's soft tonal elevation — click the demo cards to feel the compress-on-press behaviour, including its reduced-motion equivalent. |

### Game Surfaces

| File | Specifies |
| --- | --- |
| `cookie-surface.html` | The primary click target: rest / hover / pressed / focus-visible / reduced-motion / disabled states on a chunky pressable button with a solid offset shadow, the floating "+N" popup, and the golden-cookie overlay with its spark-accent glow, ring, and ray burst. |
| `building-row.html` | A generator list row: icon, bilingual name, owned count, cost, CPS contribution, buy-quantity stepper (×1/×10/×100/Max), all in chunky bordered chrome with tabular figures. Affordable / unaffordable / locked states. |
| `upgrade-card.html` | Locked / unlocked-buyable / owned states for one-time upgrade purchases, with a subtle hover tilt (reduced-motion aware) and a spark-accented owned glow. |
| `achievement-badge.html` | Locked silhouette vs. unlocked medal-style badge (bevelled highlight, chunky spark-accent ring), plus the unlock toast variant. |
| `stat-tile.html` | A statistics-grid tile: display-face value with tabular numerals, bilingual label, optional trend indicator (colour + glyph, never colour alone). |
| `prestige-gate.html` | The destructive-action super-confirmation gate: two independently operated key toggles, a slider disabled until both are on, animated progress fill, distinct completion state, always-available Emergency exit — rendered deliberately heavier and more deliberate than the rest of the theme. Two live variants: prestige (recoverable) and full wipe (severe). |
| `tool-card.html` | A single tool in the Tools tech tree (see below): undiscovered / discovered-locked / unlockable-now / unlocked states, with a persistent, distinctly-bordered "Open it now" callout present in every state proving the real application feature is never gated by the game unlock. |
| `tools-tree.html` | The tech-tree overview: tools grouped by tier — each tier struck in a genuinely different jewel tone (bronze → emerald → amethyst) so the ladder visibly escalates — with prerequisite arrows, a progress summary, mixed node states at a glance, the tree's own search field with its anchored regex builder, and a "tool progression" preview toggle that affects only the game display. |

### List Controls

| File | Specifies |
| --- | --- |
| `bulk-toolbar.html` | Multi-select bulk-action bar: selection count baked into every action label, disabled in-flight state with honest progress, and an honest partial-result report. |
| `search-regex-builder.html` | A search field with the regex builder anchored directly beside it as a popover (never a detached dialog), plain-text default and regex-enabled states. |

### Settings

| File | Specifies |
| --- | --- |
| `settings-funny-sliders.html` | Language-mode selector (English / Cantonese / Bilingual) plus two independent 1–5 funny-level sliders, one per language, made visually and functionally distinct so it is unmistakable they are separate controls. |

### Feedback

| File | Specifies |
| --- | --- |
| `narrator-toast.html` | Non-blocking, corner-anchored milestone toast: auto-dismiss and persist-until-dismissed variants, each with a coloured left accent stripe naming the kind of moment. |

## Tools tech tree — the "Open it now" contract

Material Cookie Clicker's own canonical application features (command palette, regex builder,
authenticator, file converter, local model manager, appearance editor, and so on) double as
in-game "tools" discovered and unlocked through play, each granting a gameplay bonus on unlock.

**The unlock gates the game surfacing and the bonus only — never the real feature.** Every
`tool-card.html` state, including undiscovered, carries a persistent "Open it now" action that
opens the real application feature from Settings/the command palette immediately, because that
feature has always been available regardless of tech-tree progress. This callout is deliberately
styled with its own distinct border, fill, and "always available" badge — separate from the
lock/undiscovered chrome around it — precisely *because* a chunkier padlock treatment could
otherwise make it read as part of the lock rather than an escape hatch from it. See `tool-card.html`
and `tools-tree.html` for the full states and the exact copy used to state this distinction to the
player.

## Accessibility, contrast, and offline requirements — unchanged

These requirements apply identically to every file in this directory regardless of the visual
theme layered on top of them:

- **Contrast still meets WCAG AA, computed rather than asserted.** Run `node design/_verify/contrast-check.mjs`
  before trusting any colour change; a warm palette is exactly where contrast quietly fails.
- **Visible focus rings on everything interactive**, keyboard operability, correct roles and
  accessible names on every control, including the chunkier ones.
- **Minimum touch targets** (44px), no clipping at narrow widths or high display scales, checked
  against the longest bilingual strings.
- **`prefers-reduced-motion: reduce` fully respected.** Every bounce, tilt, press-compression,
  spin, pulse, and sparkle in this theme has a still equivalent that still communicates the state
  change — usually an instant, un-animated snap rather than an animated transition, which is a
  discrete state change rather than motion.
- **Light and dark both legible**, driven from the same custom properties in every file so they
  cannot drift apart.
- **Fully self-contained.** No CDN, no remote font, no remote image, no network request of any
  kind. See the display-face note above for how that constraint was honoured for this pass.

## Palette summary

Warm baked-cookie brown/gold primary (`#7A4A1D` light / `#FFB876` dark), with the golden-cookie
accent reserved exclusively for the `tertiary` role — never used for ordinary UI chrome — plus a
separate, purely-decorative arcade spark accent for golden-cookie moments and a three-step jewel
tool-tier ladder (bronze/emerald/amethyst). Full hex values and their verified contrast ratios are
in `tokens-color.html`.
