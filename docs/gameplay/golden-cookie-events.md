# Golden-cookie events

> **Status: not built.** No spawn scheduler, click handler, or bonus-application logic exists in
> this repository. This article documents the specified overlay from `design/cookie-surface.html`.

## What it does

A golden-cookie event is a temporary overlay on the primary cookie surface: a distinct
golden-tinted click target appears for a limited window, and clicking it before it expires or
despawns applies a short-lived bonus (for example, a CPS multiplier or a one-time cookie windfall).
The golden-cookie visual treatment uses the `tertiary` colour role exclusively — see
[Material Design 3 appearance](../interface/material-design-appearance.md) — so the accent stays
meaningful and is never reused for ordinary chrome.

## How it is configured

Not configurable yet. Once built, the anticipated configurable surface is spawn frequency and
bonus magnitude, both of which are gameplay balance decisions for the implementation, not
documented here as fixed numbers because none exist yet.

## Failure modes

Not applicable yet. Once built, the anticipated failure modes are: an event that spawns while the
primary cookie is disabled (should not spawn, or should be suppressed until clicking resumes), a
bonus that stacks unboundedly with repeated fast clicks (must have an explicit cooldown), and an
overlay that obscures the accessible name of the underlying cookie button for assistive technology
(the overlay must expose its own distinct accessible name and role, not silently replace the
cookie's).

## Security considerations

Purely local and cosmetic; no network request, no server-side randomness to seed or manipulate, no
shared state. Nothing here differs from the [Cookie clicking](cookie-clicking.md) article's
reasoning.

## Verification

Not yet verifiable beyond `design/cookie-surface.html`'s static golden-cookie overlay state, which
can be opened directly in a browser today. There is no running spawn scheduler to test.

## Suggested articles

- [Cookie clicking](cookie-clicking.md)
- [Material Design 3 appearance](../interface/material-design-appearance.md)
- [Achievements](achievements.md)
- [Contrast and reduced motion](../accessibility/contrast-and-reduced-motion.md)
