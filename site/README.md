# site/

The project's public GitHub Pages site. `.github/workflows/pages.yml` uploads this directory as
the deployment root, so `site/index.html` is the site's home page and every path here is served
from the root of `https://ding-ding-projects.github.io/material-cookie-clicker/`.

## What is here

| Path | What it is |
| --- | --- |
| `index.html` | Landing page: game identity, bilingual blurb, download section, feature overview. |
| `features/index.html` | Feature index plus the client-side search. |
| `features/*.html` | One article per feature area, each with behaviour, configuration and related links. |
| `assets/captures/*.png` | Twenty-four screenshots of the real running application, shown in the landing page's capture matrix and in the matching articles. |
| `assets/site.css` | The site's only stylesheet. Tokens copied verbatim from the `design/` v2 specs. |
| `assets/search.js` | The search index (baked in at authoring time) and the matcher. |
| `assets/search-ui.js` | The small module that wires the matcher to the search field. |

The deploy workflow additionally writes `assets/generated-changelog.mjs` into this directory at
deploy time from the real GitHub release inventory. It is generated, not committed, and no page
here depends on it.

## Rules this directory has to keep

- **Self-contained.** No CDN, no remote font, no remote image, no analytics, no network request of
  any kind. Every graphic is either drawn in CSS or a PNG committed in `assets/captures/`. The only
  external addresses anywhere in the tree are the GitHub repository and release URLs, and both are
  links a person clicks, never fetched resources.
- **The v2 "arcade cabinet" design system**, not Material Design 3 — see `design/README.md`. Radial
  oven-glow backgrounds, marquee headings on bevelled plates, solid offset shadows with no blur,
  2–7px borders, 10–40px radii, and light/dark driven from the same custom properties.
- **Accessible.** Semantic landmarks, ordered headings, visible 4px focus rings, 44px minimum touch
  targets, `prefers-reduced-motion` equivalents, AA-verified colour pairs only, responsive from
  320px with no sideways body scroll (wide tables scroll inside their own container).
- **Honest.** The site describes the application as it is today. The game and its four secondary
  tabs ship in this release and are shown in real captures; what is still unverified is named on
  the page rather than glossed over — no dark-theme capture exists, the narrow-width shop drawer
  was checked by forcing its breakpoint rather than by really resizing the window, an unlock toast
  can briefly overlay shop rows, no golden-cookie spawn has been photographed, and there is no
  settings surface yet. If a feature ships or a capture is taken, update the page in the same
  change.

## Checking it

```
node scripts/check-site.mjs
```

Resolves every internal `href`/`src` (including fragment targets) against real files, fails on any
external address that is not the allowed GitHub repository or release URL, fails on anything that
would make a network request, and checks each page for its `lang`, viewport meta, `<main>`, `<h1>`,
skip link, and that no Traditional Chinese text sits outside a `lang="zh-HK"` element.
