# Material Cookie Clicker — Material Design 3 Expressive references

These 16 checked-in HTML files are the independent design-reference application inputs for the
Windows desktop product. Each page is real design data, not product DOM, a screenshot, or agent
instructions. The dedicated loopback app in `reference-app/` renders each file directly in place.

The pages share only `material-reference.css`, a local, dependency-free Material Design 3
Expressive foundation. There are no remote fonts, images, scripts, analytics, or network requests.
Every file starts with an explicit `@dsCard` marker and keeps its own semantic HTML, labels,
counts, states, and domain artwork.

## Design boundary

Product chrome uses Material primitives and anatomy:

- semantic colour roles and tonal surfaces;
- 4/8/12/16/28/full shape scale;
- elevation levels 0–3 rather than solid offset bases;
- Material display, headline, title, body, and label typography;
- filled, tonal, icon-button, segmented, field, dialog, snackbar, card, range, and progress anatomy;
- explicit hover, pressed, selected, disabled, focus, and reduced-motion states;
- at least 48px targets for icon and selection controls.

Game-specific data art remains independent: the cookie face, achievement medal, ticket edge,
tier jewel, progress values, trend glyphs, and chart/status colours may retain the geometry or
colour required to communicate their data. That exception never extends to the button, field,
dialog, card, menu, tab, or navigation surface around the art.

The one-screen core loop remains mandatory. Clicking the cookie, buying a generator, and buying an
upgrade stay on one surface. Secondary panels never replace those actions.

## Deterministic reference app

Start the loopback-only server:

```powershell
node design/reference-app/server.mjs
```

Open an exact route from `parity/inventory.json`, for example:

```text
http://127.0.0.1:4174/design/reference-app/index.html?row=game-layout--main&theme=light&width=1280&height=800&scale=1&state=main&locale=en-HK&capture=1
```

The route refuses tuple drift, uses the declared 1280×800 CSS viewport and 1× scale, fixes the
locale, time, random seed, motion, and scroll position, and blocks reference-document network
access. Capture tooling still owns process isolation, device scale, privacy, geometry, raw PNG
validation, and receipts.

## Inventory and fail-closed checks

`parity/inventory.json` is hand-written. It contains exactly one row for every checked-in reference
and explicitly names every declared state, reference route, built-product route, shared tuple,
deterministic fixture, primitive audit, evidence path, and deviation.

Run:

```powershell
node design/_verify/design-parity-guard.mjs --structure
node design/_verify/design-parity-guard.mjs --negative
node design/_verify/design-parity-guard.mjs --release
```

`--structure` validates the exact reference set and source hashes. `--negative` deliberately
removes each asserted boundary and must turn red before the restored inventory returns green.
`--release` additionally requires current raw reference and product captures, their receipts,
the labelled comparison, machine-readable visual diff, approved review, and source-commit binding.

Changing any reference invalidates the prior evidence. Old PNGs and receipts remain immutable
historical evidence; the inventory marks them pending until a fresh cheap-headless capture run
regenerates every affected input and derived record.

## Reference files

| Category | Files | Current composition |
| --- | --- | --- |
| Foundations | `tokens-color.html`, `tokens-shape-elevation.html`, `tokens-type.html` | Semantic colour roles, Material shape/elevation, bilingual type scale |
| Core game | `game-layout.html`, `cookie-surface.html`, `building-row.html`, `upgrade-card.html` | One-screen loop, cookie states, three generator states, three upgrade states |
| Progress | `achievement-badge.html`, `stat-tile.html`, `prestige-gate.html` | Locked/unlocked medal, deterministic statistics, ready super-confirmation |
| Tools | `tool-card.html`, `tools-tree.html` | Four card states and exact 7 / 17 mixed-tier tree |
| Lists/settings | `bulk-toolbar.html`, `search-regex-builder.html`, `settings-funny-sliders.html` | 4 / 7 bulk progress, open regex builder, bilingual independent levels 2 and 4 |
| Feedback | `narrator-toast.html` | Golden-cookie and offline-report snackbar variants |

## Accessibility and privacy

- Semantic controls retain programmatic names, roles, states, and visible focus.
- Text and non-text contrast use semantic role pairs; data trends add ▲/▼ and text.
- Controls remain keyboard-operable and touch-sized.
- `prefers-reduced-motion` removes animation without removing state information.
- Bilingual strings are preserved at the fixed `en-HK` capture tuple.
- No reference page reads user data, credentials, a real profile, or an external service.
