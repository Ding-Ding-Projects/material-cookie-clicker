# Golden-cookie events

Every so often a golden cookie appears **somewhere random on the game stage** as its own clickable
sprite — not as a wash over the hero cookie, which is where it used to live. Catching it opens a
small puzzle card, and solving that puzzle is what redeems the bonus.

## What it does

The scheduler (`src/shared/game/golden-cookie.ts`) picks a moment between five and fifteen minutes
after the last cookie, and at that moment it also picks a **position**: `{spawnXPct, spawnYPct}`,
drawn from the same seeded PRNG and stored on `GoldenCookieState`. The sprite is 64px of drawn
gilded cookie inside a 72px hit area, it scurries a few pixels (still, under
`prefers-reduced-motion`), it carries its own accessible name, and its appearance is announced
through the existing status region.

Clicking it does **not** redeem anything. It catches the cookie and opens **Odd Cookie Out**:

- a 4×4 grid of sixteen drawn cookie tiles, exactly one of them subtly different;
- press the odd one — **three rounds** to redeem;
- a wrong pick shakes the card and **burns two seconds** off the golden window's remaining time;
- the window running out, Escape, or a press on the dimmed stage behind lets the cookie **flee**:
  it despawns and the ordinary cooldown starts. Nothing already owned is lost.

Solving all three rounds runs the same `collectGoldenCookie` the game has always used, so the
reward is unchanged:

| Effect | What it does | Default |
| --- | --- | --- |
| Frenzy | Multiplies all production | 7× for 77 seconds |
| Click frenzy | Multiplies click value | 3× for 13 seconds |
| Windfall | Instant cookie payout | 15 minutes of current CPS |

### Why three rounds, and where the ten presses went

The standing owner decree was *"the user must press it 10 times to redeem, not auto redeem"*. It
used to be implemented literally, as a ten-press countdown chip on the hero cookie
(`GOLDEN_COOKIE_REDEEM_CLICKS`). Both the constant and the `redeemClicks` field are now deleted.
The decree is kept in **spirit**: one press to catch plus three rounds of a sixteen-tile grid is
about ten deliberate presses — more when picks go wrong — and none of them is automatic.

## How it is configured

`GoldenCookieConfig` carries the delay range, the clickable window, both multipliers, both
durations and the windfall payout. `GOLDEN_SPAWN_BOUNDS` carries where on the stage a cookie may
land (12–88% across, 16–78% down), keeping the sprite clear of the HUD above, the console below
and the shop rail at the right, so a spawn can never land under chrome that would swallow the
click. The puzzle's shape — sixteen tiles, three rounds, four visual variants, a two-second
wrong-pick penalty — is exported as named constants from the same module.

There is one developer-only override, matching the random-events one in shape and in having no UI
whatsoever:

```js
localStorage.setItem('material-cookie-clicker:golden:fast', '1');
```

It shortens the wait to a few seconds and lengthens the window to two minutes, which is what makes
the surface photographable. `resolveGoldenCookieConfig` is a pure, tested function; any value
other than `"1"` or `"true"` leaves the shipped schedule alone.

## Seeded, not random

The spawn moment, the spawn position, the effect roll, the odd tile and its visual variant all
come from a splitmix32 PRNG with a saved stream position. `Math.random()` is never called. Given
the same seed, the same cookie appears at the same point on the stage with the same odd tile —
which is what makes the whole mechanic unit-testable, and what stops a save/load cycle from
re-rolling your luck.

## Accessibility, stated honestly

Odd Cookie Out is a **sighted-skill minigame** and the code says so rather than pretending
otherwise (see the note at the top of `src/renderer/screens/GoldenCookieStage.tsx`):

- Every tile is a real `<button>`, at least 44px, inside a labelled group, reachable by Tab.
- Every tile carries the **same shape of accessible name** ("Cookie tile 5"). The odd one is
  deliberately **not** named as odd — naming it would hand a screen-reader user the answer
  instantly while a sighted player hunts for it, which is the mirror of the unfairness rather than
  a fix for it.
- The consolation is that failing costs nothing already owned: a wrong pick spends the cookie's
  own seconds, and a timeout or an Escape simply lets a bonus go. Golden cookies sit on top of the
  game, never across it.
- After two wrong picks in a round the odd tile is **ringed**, and the card's status region says
  so. That helps low vision and bad monitors; it does not make the puzzle solvable without sight,
  and we do not claim it does.
- The difference is never colour alone — rotation, a missing chip, an extra chip, or a mirrored
  chip layout — so it survives colour-blindness and a greyscale display.

The card itself keeps the full dialog contract the app's `AnchoredPanel` keeps, scaled down:
`role="dialog"`, `aria-modal`, labelled by its own heading, focus moved in and trapped, Escape
closes (here, Escape lets the cookie flee), and focus restored afterwards to the hero cookie.

## Failure modes

- **A save written mid-spawn.** `spawnXPct`/`spawnYPct` and the open puzzle round-trip through the
  save. A save written *before* this redesign has neither, and carried a `redeemClicks` press
  count that no longer exists; zod drops it, the renderer treats a positionless spawn as nothing on
  the stage, and the scheduler hands out a fresh spawn. There is deliberately no migration step: a
  golden cookie in flight is worth seconds, and inventing a position for a cookie the player never
  saw would be the dishonest option.
- **A stale or hand-built dispatch.** `goldenCatch` on nothing, `goldenPuzzlePick` with no puzzle
  open or with an index that is not a tile, and `goldenFlee` with no cookie out all return the
  state unchanged, in the domain rather than in the view.
- **Two things on the stage at once.** The random-event scheduler declines to roll while a golden
  cookie is up, so the stage never has two interruptions on it.

## Security considerations

Purely local. No network request, no server-side randomness to seed or manipulate, no shared
state. Nothing here differs from the [Cookie clicking](cookie-clicking.md) article's reasoning.

## Verification

`tests/game/golden-cookie.test.ts` covers spawn-position bounds and determinism, the catch, the
round arithmetic, the wrong-pick penalty and its effect on the timeout, both flee paths, the
refusals, the dev-flag resolver, and redemption parity: solving three rounds pays byte-for-byte
what the old direct collect paid for the same rng. The save round-trip and the pre-redesign save
are both tested there too.

## Suggested articles

- [Cookie clicking](cookie-clicking.md)
- [Achievements](achievements.md)
- [Material Design 3 appearance](../interface/material-design-appearance.md)
- [Contrast and reduced motion](../accessibility/contrast-and-reduced-motion.md)
