# Cookie clicking

> **Status: shipped and verified in the v0.2.55 baseline.** The click handler, counter, CPS loop,
> offline calculation, save path, tests, packaged renderer, built interaction, and current captures
> all exist. `design/cookie-surface.html` remains a design reference, not the runtime.

## What it does

The cookie is the primary click target and the game's home surface. Each click adds one cookie
(multiplied by any active click-power upgrades) to the player's total, and shows a floating "+N"
popup that rises and fades over the cookie. Independently of clicking, every owned generator
contributes a fixed cookies-per-second rate, accumulated continuously and reflected in a live
counter.

A new save renders only this usable plain cookie. Cookie production never unlocks the graphics
around it. At each graphics price, the next one-time purchase control appears beside the cookie;
buying it deducts the exact price and reveals the corresponding tier. See
[Graphics purchase progression](graphics-progression.md).

`design/cookie-surface.html` specifies five interaction states for the cookie itself: rest, hover,
pressed, focus-visible, and reduced-motion, plus a disabled state for whenever clicking is
temporarily unavailable (for example, during the prestige gate's destructive-confirmation flow).
The golden-cookie overlay (see [Golden-cookie events](golden-cookie-events.md)) is a distinct
visual layer on top of this same surface, not a separate click target.

## How it is configured

Click power and CPS are plain numbers the player can inspect (not hidden behind an obscured
counter), the "+N" popup to respect the reduced-motion state, and the disabled state to carry an
explicit reason a screen reader can announce (never a silently unresponsive button).

## Failure modes

The two key failure modes are a click registering while the cookie is disabled (it must be rejected, not
queued), and a CPS accumulator drifting from wall-clock time across a long idle session (must be
computed from an explicit last-tick timestamp, never from a fixed-interval counter that can lose
time when the renderer is throttled in the background).

## Security considerations

Purely local arithmetic; no network request, no server-authoritative state, and no economy that
crosses a trust boundary. The only integrity concern once built is against the player's own save
file — an editable local total is expected and is not a security defect, since nobody pays for
progress and there is nothing to protect it from.

## Verification

`tests/game/reducer.test.ts`, `effective-cps.test.ts`, `offline-progress.test.ts`, and
`look-tiers.test.ts` cover the domain. The prior `captures/app/fresh-start.png` predates the
stricter cookie-only composition and must not be used as evidence for it. A new built-artifact
capture is required after integration; `game-progressed.png` remains evidence for the fully
purchased surface.

## Suggested articles

- [The 21-tier generator ladder](generator-ladder.md)
- [Graphics purchase progression](graphics-progression.md)
- [Golden-cookie events](golden-cookie-events.md)
- [Material Design 3 appearance](../interface/material-design-appearance.md)
- [Contrast and reduced motion](../accessibility/contrast-and-reduced-motion.md)
