# Golden-cookie events

Every so often a golden cookie appears **somewhere random on the game stage** as its own clickable
sprite. Catching it opens **The Oven Dial** — a timing minigame — and beating that is what redeems
the bonus.

## What it does

The scheduler (`src/shared/game/golden-cookie.ts`) picks a moment between five and fifteen minutes
after the last cookie, and at that moment it also picks a **position**: `{spawnXPct, spawnYPct}`,
drawn from the same seeded PRNG and stored on `GoldenCookieState`. The sprite is 64px of drawn
gilded cookie inside a 72px hit area, it scurries a few pixels (still, under
`prefers-reduced-motion`), it carries its own accessible name, and its appearance is announced
through the existing status region.

Clicking it does **not** redeem anything. It catches the cookie and opens the dial:

- a needle sweeps back and forth across a dial face, and a golden band is painted on that face;
- press **Stop the needle** while the needle is inside the band;
- **three rounds** redeem the cookie, and the band narrows and the needle speeds up each round;
- a miss shakes the card and **burns two seconds** off the golden window's remaining time;
- the window running out, Escape, or a press on the dimmed surface behind lets the cookie **flee**:
  it despawns and the ordinary cooldown starts. Nothing already owned is lost.

Winning all three rounds runs the same `collectGoldenCookie` the game has always used, so the
reward is unchanged:

| Effect | What it does | Default |
| --- | --- | --- |
| Frenzy | Multiplies all production | 7× for 77 seconds |
| Click frenzy | Multiplies click value | 3× for 13 seconds |
| Windfall | Instant cookie payout | 15 minutes of current CPS |

## A minigame, not a chance game

This is the point of the whole design, and it is a decree: *"golden cookie puzzle must be a
minigame, not a chance game."*

The needle's position is an **exact, pure function of how long the round has been running**
(`goldenDialNeedlePosition`) — a triangle wave over the track, with no easing, so no part of the
track is worth more than any other. A press either was or was not inside the band, and the same
press at the same millisecond lands the same way on every machine, every save and every seed. The
reducer recomputes the position itself from the round's start time rather than trusting a number
from the view, so there is exactly one definition of where the needle is.

The difficulty curve is **fixed and published** (`GOLDEN_DIAL_ROUND_CURVE`), the same for everyone:

| Round | Band width | Sweep (there and back) |
| --- | --- | --- |
| 1 | 26% of the dial | 1.80s |
| 2 | 19% | 1.40s |
| 3 | 13% | 1.05s |

Nothing in it is rolled, scaled by progress, or adjusted to how the player is doing.

The **one** seeded value in the minigame is where on the face the band *sits*. That cannot decide a
round, because the band is drawn before the player presses — a visible target that moves between
rounds is scenery, not luck. It exists so three rounds are not three identical presses at the same
spot. There is a test that presses at a fixed moment across fifty different PRNG streams and
asserts the verdict is identical in all fifty.

### What this replaced, and why

This slot has held three mechanics. Each one's fields are deleted when the next arrives.

1. **A ten-press countdown** on the hero cookie (`GOLDEN_COOKIE_REDEEM_CLICKS`, `redeemClicks`),
   the literal reading of the standing decree *"the user must press it 10 times to redeem, not
   auto redeem."*
2. **Odd Cookie Out** — a 4×4 grid with one subtly different tile, three rounds. It looked like a
   puzzle and behaved like a lottery: the odd tile was seeded, so pressing at random won a round
   one time in sixteen with no skill involved. That is exactly what the second decree forbids.
3. **The Oven Dial**, which has no such hole.

The older ten-press decree is still honoured in spirit: a catch plus at least three deliberate
timed presses, with every miss costing seconds and another press. Redemption is never one click and
never automatic.

## Accessibility: what is and is not achieved

Stated in both halves, because only one of them is good news.

**What is achieved.** The game is **one button with one fixed name** ("Stop the needle") — nothing
to hunt for, nothing to compare, no spatial search, and Space or Enter is the entire input. The
dial is a real `role="slider"` whose `aria-valuetext` continuously states the needle's position and
whether it is currently inside the band ("42%, outside the band" / "58%, in the band"), so the
position is conveyed non-visually rather than only drawn. Each round is **briefed in text** before
it is played — the band's width as a percentage and the sweep time in seconds — so the difficulty
is stated rather than merely felt. And under `prefers-reduced-motion` the needle does not sweep: it
**steps**, one notch of twenty-four at a time, on a cadence 1.6× slower. That is a rhythm game —
countable, learnable, playable without watching a moving object — and the drawn ticks are exactly
the positions the needle can occupy. The stepped flag is frozen onto the domain state at the catch,
so the position judged is always exactly the position shown.

**What is not achieved.** A player who cannot see the dial at all is relying on `aria-valuetext`
updates whose timing no specification guarantees, and in continuous mode that is not good enough to
hit a 13% band reliably. The honest mitigation is the one the whole feature rests on: **failing
costs nothing already owned.** A miss burns two seconds of the cookie's own window and nothing
else; a timeout or an Escape just lets a bonus go. Golden cookies sit on top of the game, never
across it — no progress, no purchase and no achievement is gated behind beating this dial.

The card keeps the full dialog contract the app's `AnchoredPanel` keeps, scaled down:
`role="dialog"`, `aria-modal`, labelled by its own heading, focus moved in and trapped, Escape
closes (here, Escape lets the cookie flee), and focus restored afterwards to the hero cookie.

## How it is configured

`GoldenCookieConfig` carries the delay range, the clickable window, both multipliers, both
durations and the windfall payout. `GOLDEN_SPAWN_BOUNDS` carries where on the stage a cookie may
land (12–88% across, 16–78% down), clear of the HUD above, the console below and the shop rail at
the right. The dial's numbers — three rounds, the round curve, twenty-four steps, the 1.6× stepped
slowdown, the two-second miss penalty — are named exports from the same module.

One developer-only override, with no UI whatsoever:

```js
localStorage.setItem('material-cookie-clicker:golden:fast', '1');
```

`resolveGoldenCookieConfig` is pure and tested; any value other than `"1"` or `"true"` leaves the
shipped schedule alone.

## Failure modes

- **A save written mid-minigame.** The spawn position and an open dial round-trip through the save.
  A save written under either *earlier* mechanic carries fields that no longer exist; zod drops
  them, the renderer treats a positionless spawn as nothing on the stage, and the scheduler hands
  out a fresh spawn. **No save ever carries an open minigame across a version**, deliberately: a
  half-finished round of a game that no longer exists cannot be translated into a round of the game
  that replaced it, and inventing one would be dishonest. `roundStartedAtEpochMs` is wall-clock, so
  a reloaded dial has a huge elapsed time — harmless, because the needle function is periodic, and
  the window it belonged to has expired anyway.
- **A stale or hand-built dispatch.** `goldenCatch` on nothing, `goldenDialPress` with no dial
  open, and `goldenFlee` with no cookie out all return the state unchanged, in the domain rather
  than in the view. A press cannot carry a claimed needle position, so it cannot claim a hit.
- **Mashing the button.** Tested: with the clock frozen outside the band, forty presses win nothing
  and cost forty misses. The dial is timing, not attrition.
- **Two things on the stage at once.** The random-event scheduler declines to roll while a golden
  cookie is up.

## Security considerations

Purely local. No network request, no server-side randomness to seed or manipulate, no shared state.
Nothing here differs from the [Cookie clicking](cookie-clicking.md) article's reasoning.

## Verification

`tests/game/golden-cookie.test.ts` (39 tests) covers the needle wave at known fractions of a sweep,
its bounds across every round and both modes, its exact repeatability and periodicity, the stepped
grid and how long each notch is held, the published curve to the number, band-edge hits and misses,
seed-independence of the verdict, the miss penalty and its effect on the timeout, both flee paths,
the refusals, the anti-mashing property, the dev-flag resolver, the save round-trip, and redemption
parity: winning three rounds pays byte-for-byte what the old direct collect paid for the same rng.

## Suggested articles

- [Cookie clicking](cookie-clicking.md)
- [Achievements](achievements.md)
- [Material Design 3 appearance](../interface/material-design-appearance.md)
- [Contrast and reduced motion](../accessibility/contrast-and-reduced-motion.md)
