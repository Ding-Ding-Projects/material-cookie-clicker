# Material Cookie Clicker — design specs

Self-contained HTML preview/spec files for the Material Cookie Clicker design system. Every
file is a standalone document: inline CSS only, no external stylesheet, no CDN, no remote
font or image, no analytics, no network request of any kind. Open any file directly in a
browser to view it. These are inputs for a Claude Design bundle upload performed elsewhere;
nothing in this directory uploads itself.

Every file's first line is a card marker (`<!-- @dsCard group="..." -->`) used to build the
Design System pane's card index.

## Colour contrast verification

`_verify/contrast-check.mjs` is a standalone Node script (not shipped to the app) that computes
real WCAG 2.1 contrast ratios using the sRGB relative-luminance formula for every text-bearing
colour role pair, in both light and dark schemes. Run it with `node design/_verify/contrast-check.mjs`.
`tokens-color.html` additionally recomputes the same ratios live in the browser via inline
JavaScript, so the numbers shown on each swatch are calculated in-page, not typed constants.

## Files

### Foundations

| File | Specifies |
| --- | --- |
| `tokens-color.html` | Full M3 colour role set (primary / secondary / tertiary / surface / surface-variant / outline / error and their container/on- pairs, plus five surface-container tonal steps) in light and dark, with live-computed WCAG contrast ratios on every swatch. |
| `tokens-type.html` | M3 type scale (display / headline / title / body / label, each large/medium/small) shown against English and Traditional Chinese (Hong Kong) samples side by side, with the CJK-safe font fallback stack documented. |
| `tokens-shape-elevation.html` | Corner radii (none → full) and elevation levels 0–5, each rendered on a real card. |

### Game Surfaces

| File | Specifies |
| --- | --- |
| `cookie-surface.html` | The primary click target: rest / hover / pressed / focus-visible / reduced-motion / disabled states, the floating "+N" popup, and the golden-cookie overlay. |
| `building-row.html` | A generator list row: icon, bilingual name, owned count, cost, CPS contribution, buy-quantity stepper (×1/×10/×100/Max). Affordable / unaffordable / locked states. |
| `upgrade-card.html` | Locked / unlocked-buyable / owned states for one-time upgrade purchases. |
| `achievement-badge.html` | Locked silhouette vs. unlocked full-colour badge, plus the unlock toast variant. |
| `stat-tile.html` | A statistics-grid tile: value, bilingual label, optional trend indicator (colour + glyph, never colour alone). |
| `prestige-gate.html` | The destructive-action super-confirmation gate: two independently operated key toggles, a slider disabled until both are on, animated progress fill, distinct completion state, always-available Emergency exit. Two live variants: prestige (recoverable) and full wipe (severe). |
| `tool-card.html` | A single tool in the Tools tech tree (see below): undiscovered / discovered-locked / unlockable-now / unlocked states, with a persistent "Open it now" action present in every state proving the real application feature is never gated by the game unlock. |
| `tools-tree.html` | The tech-tree overview: tools grouped by tier with prerequisite arrows, a progress summary, mixed node states at a glance, the tree's own search field with its anchored regex builder, and a "tool progression" preview toggle that affects only the game display. |

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
| `narrator-toast.html` | Non-blocking, corner-anchored milestone toast: auto-dismiss and persist-until-dismissed variants. |

## Tools tech tree — the "Open it now" contract

Material Cookie Clicker's own canonical application features (command palette, regex builder,
authenticator, file converter, local model manager, appearance editor, and so on) double as
in-game "tools" discovered and unlocked through play, each granting a gameplay bonus on unlock.

**The unlock gates the game surfacing and the bonus only — never the real feature.** Every
`tool-card.html` state, including undiscovered, carries a persistent "Open it now" action that
opens the real application feature from Settings/the command palette immediately, because that
feature has always been available regardless of tech-tree progress. See `tool-card.html` and
`tools-tree.html` for the full states and the exact copy used to state this distinction to the
player.

## Palette summary

Warm baked-cookie brown/gold primary (`#7A4A1D` light / `#FFB876` dark), with the golden-cookie
accent reserved exclusively for the `tertiary` role — never used for ordinary UI chrome. Full
hex values and their verified contrast ratios are in `tokens-color.html`.
