# site/

The project's public GitHub Pages site. `.github/workflows/pages.yml` uploads this directory as
the deployment root, so `site/index.html` is the site's home page and every path here is served
from the root of `https://ding-ding-projects.github.io/material-cookie-clicker/`.

## What is here

| Path | What it is |
| --- | --- |
| `index.html` | Landing page: product identity, explicit non-playable-site boundary, verified download, feature overview and Open Graph metadata. |
| `control-center.html` | The site-owned settings, appearance, privacy, local-tool, status and tab-management surface. |
| `features/index.html` | Feature index plus the client-side search. |
| `features/*.html` | One article per feature area, each with behaviour, configuration and related links. |
| `assets/captures/*.png` | Screenshots of the real running application. Sixteen of them are the current set, shown in the landing page's capture matrix and in the matching articles; the rest are superseded images from earlier lanes, kept on disk because a true photograph of a build that shipped is not deleted, and simply no longer referenced by any page. |
| `assets/site.css` | The site's only stylesheet. Tokens copied verbatim from the `design/` v2 specs. |
| `assets/search.js` | The search index (baked in at authoring time) and the matcher. |
| `assets/search-ui.js` | The small module that wires the matcher to the search field. |
| `assets/site-shell.js` | The persistent browser-style site tab strip, tab groups, pin/close controls, context-menu filter and command palette. |
| `assets/control-center.js` | Local persistence and interactions for site settings, narration, schedules, logo preview, toy locks, support tickets, authenticator, converter, status, history and exports. |
| `social-preview.png` | Byte-identical copy of the real progressed-application capture used by the deployed page's Open Graph metadata. |

The deploy workflow additionally writes `assets/generated-changelog.mjs` into this directory at
deploy time from the real GitHub release inventory. It is generated, not committed, and no page
here depends on it.

## Rules this directory has to keep

- **Self-contained.** No CDN, no remote font, no remote image, no analytics, no network request of
  any kind. Every graphic is either drawn in CSS or a PNG committed in `assets/captures/`. The only
  external addresses anywhere in the tree are the GitHub repository and release URLs, and both are
  links a person clicks, never fetched resources.
- **Material Design 3 interactive controls over the project artwork.** The retained arcade-cabinet
  illustration and captures identify the product; interactive site chrome uses Material colour
  roles, state layers, shape, elevation, touch targets, focus states and reduced-motion behavior.
- **A project site, never a playable substitute.** The visible boundary statement says that the
  game runs only in the installed Windows application. Browser-only equivalents state their limits:
  the converter exposes only bounded browser-native transforms, and the Ollama guide never claims a
  live loopback connection, model inventory, pull or chat.
- **Accessible.** Semantic landmarks, ordered headings, visible 4px focus rings, 44px minimum touch
  targets, `prefers-reduced-motion` equivalents, AA-verified colour pairs only, responsive from
  320px with no sideways body scroll (wide tables scroll inside their own container).
- **Honest.** The site describes the application as it is today. Every panel it names is shown in
  a real capture of the built application, and what is still unverified or unphotographed is named
  on the page rather than glossed over: no genuinely narrow window (the shop-drawer breakpoint was
  checked by forcing it), no finished home, fifteen of the sixteen pool events with no photograph,
  no Mouse Raid, no update notice and no Cantonese-only mode. The site also names a real fault the
  capture run found by looking — on a maximised window the raid-supplies shelf clips its third
  plate. Counts on the page (generators, upgrades, achievements, tools, control rungs, events,
  look tiers, tests) are re-derived from the source tree and from the test run, never carried
  over. If a feature ships or a capture is taken, update the page in the same change.

## Checking it

```
node scripts/check-site.mjs
```

Resolves every internal `href`/`src` (including fragment targets) against real files, fails on any
external address that is not the allowed GitHub repository or release URL, fails on anything that
would make a network request, and checks each page for its `lang`, viewport meta, `<main>`, `<h1>`,
skip link, and that no Traditional Chinese text sits outside a `lang="zh-HK"` element.
