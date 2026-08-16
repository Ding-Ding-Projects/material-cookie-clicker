# Roadmap

Status as of 2026-08-16. Nothing here is aspirational phrasing dressed as
progress: a thing is either shipped and verified, shipped and unverified, or not
built. Where it is unverified, that is said.

## Shipped and verified

- **Release pipeline.** Every push builds, packages an unsigned Squirrel
  installer, and publishes exactly one uniquely tagged non-draft release with a
  line-count table, a dim sum code name, a link to the public catalog photo, and
  UTC workflow timing. No workflow runs tests or lint, deliberately.
- **`v0.1.5`** — first real release. 144 MB `Setup.exe`, `RELEASES`, full
  `.nupkg`, target commit verified.
- **Game domain.** Fourteen generators, twenty tools, upgrades, achievements,
  prestige, golden cookies, offline progress, save schema with forward-only
  migrations. 109 tests.
- **Vendored engines.** Regex builder, command palette, tabs, colour translator,
  notifications, local history, time-based codes and QR, locks, scheduling,
  exports, conversion registry, local model suite. 126 tests.
- **Design system.** Fifteen specs, bakery-arcade theme, all 46 contrast pairs
  computed and passing, mirrored to a Claude Design project.
- **Build scripts.** `download-dependencies.bat`, `build.bat`,
  `build-installer.bat`, all with silent modes that exit non-zero on first real
  failure.

## In flight

- **Game screens** — six tabbed destinations plus the tools tech tree.
- **Documentation and site** — categorized articles and the Pages site.

## Not built yet

Listed honestly rather than omitted, because a roadmap that only lists what went
well is a sales page.

- **App-logo customization.** The one canonical feature with no reference
  implementation in any sibling project, so it is genuinely from scratch.
- **Completeness inventory and its negative regression Shek Q.** The
  hand-written per-surface list that must fail closed when any canonical feature
  is missing. Until this exists, "every feature is present" is an assertion
  nobody can check — and a guard that only validates the features it can already
  find would pass on a project missing all of them.
- **Captures.** No surface has been photographed from a real build. Until then
  the README and the site have paragraphs where images belong.
- **Launching the built artifact.** The installer exists; nobody has run it.

## The order these should happen in, and why

1. **Run the built artifact and capture it.** The pipeline is proven and the
   interface is not. A unit test that injects the bridge proves the screen and
   says nothing about the wiring, so the first smoke run against the real
   package is where the next genuine defect is.
2. **Completeness inventory.** It cannot be written before the surfaces exist,
   and everything after it is easier once it can fail closed.
3. **App-logo customization**, then the remaining canonical surfaces.

## Standing constraints

- **Nobody ever pays a penny.** No purchase, licence, subscription, or feature
  behind a paywall.
- **Code signing is permanently prohibited.** Artifacts are unsigned and say so.
- **An unlock never gates a feature** — see `HANDOFF.md`.
- **The theme is deliberately not Material Design 3**, by explicit owner
  decision, with every accessibility rule still applying.
