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

## Integrated source candidate; runtime evidence pending

The independent implementation lanes have converged in the current source candidate. Settings →
Application tools mounts identity/appearance, categorized conversion with dedicated PDF controls,
local-model recovery, and security/state tools. Main-process file grants, a persistent bounded
conversion queue, operating-system-vault storage, and local Git history are wired through preload.
The full packaged local-model catalog/pull/chat/harness adapter remains explicitly unavailable.
Installed interactions, captures, installer proof, and release proof are still pending, so the
[per-surface inventory](docs/completeness.md) keeps the affected rows partial or evidence-pending.

## Remaining canonical gaps after source integration

The hand-written matrix is authoritative; the largest gaps are:

- no authenticated external desktop Status Hub reporting and no complete site Status Hub proof;
- no installed interaction/capture proof for logo customization, converter/PDF, tabs, appearance,
  authenticator registration, local history, schedules, exports, or local-model recovery;
- no packaged full Ollama catalog, pull queue, streaming chat, or allowlisted harness runtime;
- no persisted secret-free authenticator code-view hydration and no authenticated history restore;
- no complete per-element toy locks, unlock ladder, durable Support Tickets, exhaustive exports/VS
  Code handoff, or populated offline docs/changelog bundle;
- no browser-extension Start/Downloading/Complete integration;
- several application and site capabilities remain partial rather than universally applied.

## Completion order

1. Pin the integrated source candidate and keep the per-surface matrix factual.
2. Run the built-artifact interaction/capture matrix for every newly mounted tool tab.
3. Package and verify the unsigned installer and its original product icon.
4. Publish exactly one release for the final integrated commit, verify its assets and workflow
   timing, and leave the repository with only proven, merged work.

## Standing constraints

- Nobody pays for the application: no purchase, licence, subscription, or paid feature tier.
- Code signing is permanently prohibited; releases are unsigned and say so.
- In-game discovery may gate a gameplay bonus but never substitute for a usable application feature.
- The bakery-arcade visual language is an explicit product decision; accessibility, contrast,
  focus, target size, reduced motion, and clipping requirements still apply.
