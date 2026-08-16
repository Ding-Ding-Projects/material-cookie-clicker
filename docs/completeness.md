# Completeness inventory

Hand-written on purpose. A guard that only validates the features it can already find in source
passes cleanly on a project missing all of them; this list exists so a person — not the code being
audited — decides what should exist, then checks reality against it. Update this file in the same
change that adds, ships, or removes a feature.

Status legend: **built** — implemented, wired into a shipped surface, and verifiable today.
**logic only** — a real, presumably-tested TypeScript module exists in `packages/`, but it is not
wired into a shipped renderer or installer, and no end-to-end run has verified it. **not built** —
no implementation exists anywhere in this repository.

## Gameplay

| Feature | Article | Status |
| --- | --- | --- |
| Cookie clicking / CPS loop | [gameplay/cookie-clicking.md](gameplay/cookie-clicking.md) | not built |
| 14-tier generator ladder | [gameplay/generator-ladder.md](gameplay/generator-ladder.md) | not built |
| Golden-cookie random events | [gameplay/golden-cookie-events.md](gameplay/golden-cookie-events.md) | not built |
| Achievements | [gameplay/achievements.md](gameplay/achievements.md) | not built |
| Prestige (ascend) | [gameplay/prestige.md](gameplay/prestige.md) | not built |

## Tools (application features that double as in-game unlocks)

| Feature | Article | Status |
| --- | --- | --- |
| Tools tech tree (unlock/bonus layer) | [tools/tools-tech-tree.md](tools/tools-tech-tree.md) | not built |
| Command palette | [tools/command-palette.md](tools/command-palette.md) | logic only (`command-registry.ts`) |
| Regex builder | [tools/regex-builder.md](tools/regex-builder.md) | logic only (`regex-builder.ts`); site has its own working port |
| Authenticator (TOTP) | [tools/authenticator.md](tools/authenticator.md) | logic only (`totp.ts`, `qr.ts`) |
| File converter | [tools/file-converter.md](tools/file-converter.md) | logic only (`converter-registry.ts`) |
| Local model manager (Ollama) | [tools/local-model-manager.md](tools/local-model-manager.md) | logic only (`packages/local-ollama`) |
| Appearance editor | [tools/appearance-editor.md](tools/appearance-editor.md) | logic only (`appearance.ts`); site has a working colour-translator port |
| Notification centre | [tools/notification-centre.md](tools/notification-centre.md) | logic only (`notifications.ts`) |
| Local history | [tools/local-history.md](tools/local-history.md) | logic only (`history.ts`) |
| Scheduled settings | [tools/scheduled-settings.md](tools/scheduled-settings.md) | logic only (`scheduling.ts`) |
| Narrator (TTS) | [tools/narrator.md](tools/narrator.md) | logic only (`narration.ts`) |
| Exports | [tools/exports.md](tools/exports.md) | logic only (`exports.ts`) |
| Bulk actions | [tools/bulk-actions.md](tools/bulk-actions.md) | not built as a standalone module; depends on a real list surface that does not exist yet |

## Interface

| Feature | Article | Status |
| --- | --- | --- |
| Browser-style tabbed navigation, dockable to any edge | [interface/tabbed-navigation.md](interface/tabbed-navigation.md) | logic only in-app (`tabs.ts`); **built** on the documentation site (`site/assets/tabs.mjs`) |
| Material Design 3 appearance | [interface/material-design-appearance.md](interface/material-design-appearance.md) | **built** as specs (`design/tokens-*.html`); **built** on the site; not built in-app |
| Settings surface | [interface/settings-surface.md](interface/settings-surface.md) | logic only in-app (`preferences.ts`); **built** on the site |

## Localization

| Feature | Article | Status |
| --- | --- | --- |
| Three language modes (English / Cantonese / Bilingual) | [localization/language-modes.md](localization/language-modes.md) | logic only in-app (`preferences.ts`); **built** on the site |
| Two independent 1–5 funny-level sliders | [localization/funny-level-sliders.md](localization/funny-level-sliders.md) | logic only in-app; **built** on the site; specified in `design/settings-funny-sliders.html` |

## Accessibility

| Feature | Article | Status |
| --- | --- | --- |
| Keyboard and screen-reader operation | [accessibility/keyboard-and-screen-reader.md](accessibility/keyboard-and-screen-reader.md) | **built** on the site; not built in-app |
| Contrast and reduced motion | [accessibility/contrast-and-reduced-motion.md](accessibility/contrast-and-reduced-motion.md) | **built** as a verification script (`design/_verify/contrast-check.mjs`) and on the site; not built in-app |

## Data

| Feature | Article | Status |
| --- | --- | --- |
| Local version history | [data/local-version-history.md](data/local-version-history.md) | logic only (`history.ts`) |
| Exports and privacy | [data/exports-and-privacy.md](data/exports-and-privacy.md) | logic only (`exports.ts`); site export functions are **built** |
| Offline / no-network guarantee | [data/offline-and-no-network.md](data/offline-and-no-network.md) | **built** on the site (verified by this lane's own grep check); not yet verified in-app |

## Build and release

| Feature | Article | Status |
| --- | --- | --- |
| Unsigned installer policy | [build-and-release/unsigned-installer-policy.md](build-and-release/unsigned-installer-policy.md) | policy documented; no installer has been built yet |
| `build.bat` / `build-installer.bat` / `download-dependencies.bat` | [build-and-release/build-scripts.md](build-and-release/build-scripts.md) | **not present in this repository yet** — the README describes them; they do not exist as files |
| Dependency bootstrapping | [build-and-release/dependency-bootstrap.md](build-and-release/dependency-bootstrap.md) | not built (depends on the build scripts above) |
| CI and release workflow | [build-and-release/ci-and-release-workflow.md](build-and-release/ci-and-release-workflow.md) | **built** (`.github/workflows/ci.yml`, `release.yml`, `pages.yml`) |

## Negative-regression note

This inventory is deliberately conservative: several rows above say **not built** for a feature
whose logic module exists in `packages/surface-kernel`, because "a pure function exists" and "a
person can use this feature in the shipped application" are different claims, and this table only
asserts the second. If a later task wires a kernel module into a real renderer, updates this row to
**built** only after an actual runtime capture proves it, not when the wiring compiles.
