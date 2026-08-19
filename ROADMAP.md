# Roadmap

Status as of 2026-08-19. A feature is listed as verified, evidence-pending, partial, logic-only, or
not implemented; planned work is never phrased as shipped.

## Published and verified baseline

- **Release `v0.2.55`.** Non-draft release at
  `a98e38c07423a7cfb4cb3190412884a404a7245e`, with unsigned Squirrel.Windows
  `MaterialCookieClicker-Setup.exe`, `RELEASES`, full `.nupkg`, and
  `release-changelog.json`. The Release, CI, and Pages workflows completed successfully.
- **Local checks.** The v0.2.55 source completed `903/903` tests plus renderer/main TypeScript
  checks. GitHub workflows deliberately run no tests or lint, so this local result and the workflow
  verdicts are separate evidence.
- **Core game.** Cookie/CPS/offline loop, twenty-one generators, upgrades, 201 achievements, milk,
  Reborn tree, golden cookies/Oven Dial, random event stacks, Mouse Raids, diesel factory/exchange,
  Home construction, prestige, and automatic updates.
- **Endless progression.** Generator ownership and prestige runs are uncapped. Office Building is
  explicitly uncapped. Home construction continues after six authored rooms through repeatable,
  persisted extension floors with no final level.
- **Minigame events and Lucky Chance.** Five persisted minigames unlock at 100,000 lifetime baked
  cookies; Mouse Raids unlock at 1,000,000. Golden Tokens have bounded idempotent award sources and
  Lucky Chance persists one-token seeded draws atomically.
- **Built evidence.** The desktop has been launched, driven, and photographed from real built
  artifacts on an off-screen Windows desktop. Existing capture evidence is catalogued in
  `captures/README.md`.
- **Build path.** Root dependency, runnable-build, and installer scripts exist with silent modes.
  Release automation publishes unique unsigned releases with timing, line-count evidence, a dim-sum
  code name, and the reconciled changelog manifest.

## Implemented with narrower evidence pending

- **Office Building capture.** Domain/UI behavior and tests exist, but the committed deep-ladder
  image predates the Office row.
- **Endless Home capture.** A v0.2.55 headless run exercised extension floors, but no current
  release capture is committed.
- **Minigame capture.** Built interaction exists, but no current committed image proves the five
  boards and Lucky Chance drawer.
- **Collapsible Diesel Depot capture.** Persistence and interaction were exercised; the committed
  depot image does not show the collapsed state.
- **Documentation site evidence.** The site is deployed, but the current per-page capture and
  anonymous Open Graph fetch matrix remains incomplete.

## Release-completeness work in progress

Independent implementation lanes are working on application foundations, identity/appearance,
file conversion, the local model manager, security/state tools, design parity, site completeness,
and build evidence. None is counted as shipped in the
[per-surface inventory](docs/completeness.md) until its exact commit, focused tests, packaged proof,
built interactions, and captures land.

## Canonical gaps at the v0.2.55 baseline

The hand-written matrix is authoritative; the largest gaps are:

- no desktop or site Status Hub surface;
- no full app-logo customization workflow;
- no wired categorized converter/PDF suite;
- no wired local Ollama manager surface;
- no complete command palette, dockable tab/group system, or per-element appearance editor;
- no built-in authenticator, per-element toy locks, unlock ladder, or Support Tickets UI;
- no complete School mode, personal-vocabulary upload, scheduled settings, or narrator voice UI;
- no complete local Git history manager, exhaustive exports/VS Code handoff, or offline docs browser;
- no browser-extension Start/Downloading/Complete integration;
- several application and site capabilities remain partial rather than universally applied.

## Completion order

1. Land each independent implementation lane with focused evidence.
2. Reconcile the per-surface matrix against the integrated commit, never against lane intent.
3. Run the full local suite inventory and built-artifact interaction/capture matrix.
4. Package and verify the unsigned installer and its original product icon.
5. Publish exactly one release for the final integrated commit, verify its assets and workflow
   timing, and leave the repository with only proven, merged work.

## Standing constraints

- Nobody pays for the application: no purchase, licence, subscription, or paid feature tier.
- Code signing is permanently prohibited; releases are unsigned and say so.
- In-game discovery may gate a gameplay bonus but never substitute for a usable application feature.
- The bakery-arcade visual language is an explicit product decision; accessibility, contrast,
  focus, target size, reduced motion, and clipping requirements still apply.
