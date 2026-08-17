# Material Cookie Clicker documentation

Material Cookie Clicker is a Material Design 3 cookie-clicker desktop application for Windows,
built with Electron. It is bilingual (English and Hong Kong Cantonese) with two independent
1-to-5 humour sliders, one per language, and it works with the network unplugged.

> [!NOTE]
> This project is in early construction. Nothing has been released yet — there is no published
> installer and no packaged runtime. Every article below states its real build status. An article
> describing a feature does not mean that feature currently runs; it means the feature is
> specified, and it says exactly how much of it exists in source today.

## The defining mechanic: the tech tree is the feature inventory

Material Cookie Clicker's own application features — command palette, regex builder,
authenticator, file converter, local model manager, appearance editor, notification centre, local
history, scheduled settings, narrator, exports, bulk actions — also appear **inside the game** as
**tools** the player discovers and unlocks, each granting a gameplay bonus.

**An unlock gates the gameplay bonus and the in-game surfacing only. It never gates the feature
itself.** Every one of those twelve features is reachable from Settings and from the command
palette at all times, whether or not its matching in-game tool has been discovered. See
[The tools tech tree](tools/tools-tech-tree.md) for the full contract and how it is verified.

## Categories

- [Gameplay](gameplay/README.md) — clicking, the twenty-generator ladder, golden-cookie events,
  achievements, prestige.
- [Tools](tools/README.md) — the twelve application features that double as in-game tools, plus
  the tech tree that unlocks their gameplay bonus.
- [Interface](interface/README.md) — tabbed navigation, Material Design 3 appearance, the
  settings surface.
- [Localization](localization/README.md) — the three language modes and the two independent
  funny-level sliders.
- [Accessibility](accessibility/README.md) — keyboard and screen-reader operation, contrast, and
  reduced motion.
- [Data](data/README.md) — local version history, exports, and the no-network guarantee.
- [Build and release](build-and-release/README.md) — the unsigned-installer policy, the build
  scripts, dependency bootstrapping, and the CI/release workflow.

## Completeness inventory

[docs/completeness.md](completeness.md) is a hand-written list of every canonical feature this
product owes, each with its article and its honest current state. It is hand-written on purpose: a
guard that only validates features it can already find passes cleanly on a project that is missing
all of them, so this list exists to be checked against by a person, not derived from the code it is
auditing.

## Documentation site

A Material Design 3 documentation site is published from [`site/`](../site/README.md) at
`https://ding-ding-projects.github.io/material-cookie-clicker/` once it is deployed from the
default branch. It carries the full tabbed-navigation, search-and-regex-builder, command-palette,
settings, and notification contract described in its own README, not a cut-down marketing page.

## Source layout

- `design/` — the Material Design 3 spec files this documentation and the site draw their tokens
  from.
- `packages/surface-kernel/` — the framework-neutral TypeScript logic shared by the desktop
  application and (in spirit — see below) this site: search, tabs, notifications, history,
  exports, appearance overrides, colour, scheduling, narration, the authenticator, and more.
- `packages/local-ollama/` — the local Ollama model-manager logic package.
- `docs/`, `site/` — this documentation and the static site (owned by this lane).

The static site under `site/` cannot literally `import` the TypeScript packages above without a
bundler, and no bundler is part of this lane's scope. Where the site implements the same
contract — the regex builder and the colour translator, most visibly — it is a hand-written
JavaScript port that matches the kernel's documented semantics and constants, so a pattern typed
into the site behaves the same as one typed into the eventual desktop application. Each such
article says plainly that it is a port, not a shared import.
