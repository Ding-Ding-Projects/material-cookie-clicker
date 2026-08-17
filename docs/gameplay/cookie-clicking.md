# Cookie clicking

> **Status: not built.** No click handler, cookie counter, or cookies-per-second (CPS) accumulator
> exists in this repository. This article documents the specified behaviour from
> `design/cookie-surface.html` so implementation has a single source of truth to build against.

## What it does

The cookie is the primary click target and the game's home surface. Each click adds one cookie
(multiplied by any active click-power upgrades) to the player's total, and shows a floating "+N"
popup that rises and fades over the cookie. Independently of clicking, every owned generator
contributes a fixed cookies-per-second rate, accumulated continuously and reflected in a live
counter.

`design/cookie-surface.html` specifies five interaction states for the cookie itself: rest, hover,
pressed, focus-visible, and reduced-motion, plus a disabled state for whenever clicking is
temporarily unavailable (for example, during the prestige gate's destructive-confirmation flow).
The golden-cookie overlay (see [Golden-cookie events](golden-cookie-events.md)) is a distinct
visual layer on top of this same surface, not a separate click target.

## How it is configured

Nothing is configurable yet because nothing is built. Once implemented, the specification requires:
click power and CPS to be plain numbers the player can inspect (not hidden behind an obscured
counter), the "+N" popup to respect the reduced-motion state, and the disabled state to carry an
explicit reason a screen reader can announce (never a silently unresponsive button).

## Failure modes

Not applicable yet — there is no running code to fail. Once built, the two failure modes the
design anticipates are: a click registering while the cookie is disabled (must be rejected, not
queued), and a CPS accumulator drifting from wall-clock time across a long idle session (must be
computed from an explicit last-tick timestamp, never from a fixed-interval counter that can lose
time when the renderer is throttled in the background).

## Security considerations

Purely local arithmetic; no network request, no server-authoritative state, and no economy that
crosses a trust boundary. The only integrity concern once built is against the player's own save
file — an editable local total is expected and is not a security defect, since nobody pays for
progress and there is nothing to protect it from.

## Verification

Not yet verifiable: there is no build, no test suite exercising a click handler, and no capture of
a running cookie surface. `design/cookie-surface.html` is a standalone, self-contained specification
file that can be opened directly in a browser today to see every state rendered, which is the only
verification currently possible.

## Suggested articles

- [The 20-tier generator ladder](generator-ladder.md)
- [Golden-cookie events](golden-cookie-events.md)
- [Material Design 3 appearance](../interface/material-design-appearance.md)
- [Contrast and reduced motion](../accessibility/contrast-and-reduced-motion.md)
