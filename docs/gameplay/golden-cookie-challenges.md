# Golden cookie challenges

Catching a golden cookie opens one of **fifty** challenges, rolled fresh every time. The Oven Dial
used to be the whole game; it is now one family of five.

## The five families

Fifty genuinely different interactions would be fifty surfaces to build, localize, make
keyboard-operable, screen-reader-name and test — and the fiftieth would be a reskin of the fourth
whether or not anyone admitted it. Instead there are five mechanics that ask for five different
things:

| Family | What it asks for | How it fails |
|---|---|---|
| **dial** | Reflex — stop a sweeping needle inside a band | The needle is outside the band |
| **mash** | Speed — a burst of presses inside a window | The window closes first |
| **hold** | Estimation — hold for an exact duration | Too short **or** too long |
| **sequence** | Memory — repeat a shown order | A wrong symbol resets the round |
| **pick** | Attention — choose the golden one | Any other option |

Ten challenges per family, with parameters that change how they are played rather than only what
they are called. A two-symbol sequence and a seven-symbol one are not the same task; a 0.5s hold and
a 3.4s hold fail for opposite reasons.

## Which one appears

Rolled uniformly from the seeded stream at the moment of the catch, then **persisted** — exactly the
treatment the dial's zone centre has always had. A challenge that changed under the player on a
re-render or a reload would not be a skill challenge at all.

Every challenge is equally likely every time. The roll is deliberately **not** weighted by
difficulty, by progress, or by what came last: a run of the same family twice is chance doing its
job, and steering it would make the roll a difficulty curve wearing a dice costume.

## Everything is published and identical for everyone

Nothing is scaled by how rich a player is or adjusted to how they are doing. The only rolled values
are *which* challenge appears and *where its target sits*; each challenge's difficulty is fixed and
readable in `src/shared/game/golden-challenges.ts`.

## Rounds, misses and progress

A challenge redeems after its own `rounds` count — between one and five, depending on which one.

- A **miss** costs two seconds off the golden window and drops whatever the round had banked. That
  is what makes a sequence a memory test rather than a typing exercise.
- A **hit that does not finish the round** — another symbol, another press — banks progress and asks
  for more. It is neither a win nor a miss, so it costs nothing.
- Every round rolls its **own** answer, so a three-round pick is three real decisions rather than one
  decision repeated.

## Accessibility

These controls are the only way to redeem a cookie, so none of this is optional:

- Every control is a real `<button>`, so keyboard and screen readers get it for free.
- The **hold** measures a keyboard press exactly as honestly as a pointer one, through `keydown` and
  `keyup`. A pointer that leaves the button ends the hold rather than leaving the clock running.
- **Sequence symbols carry names**, not only glyphs, so a round is never colour-or-shape-only.
- Progress is announced through a polite live region rather than only drawn, and the mash's bar is
  the same fact drawn — never the only channel.
- The dial keeps its `role="slider"` and its `aria-valuetext`, which state in words both where the
  needle is and whether it is in the band.
- Reduced motion is respected: the press animations are suppressed, not merely slowed.

## Saves

`challengeId`, `progress` and `target` are **optional** fields rather than a new schema version. A
save written before the registry existed simply has none, and the absence already says the right
thing: it was playing the Oven Dial, and it still will.

An id this build does not recognise falls back to the Oven Dial rather than throwing. A save can
legitimately name a challenge from a newer version, and losing a golden cookie the player already
caught is a far worse outcome than playing a different challenge for it.

## Verification

`tests/game/golden-challenges.test.ts` — the count is the easy half and the cheap thing to fake, so
the tests go after the rest:

- no two challenges share a family, round count **and** every parameter (this is what resists a
  registry of fifty renamed twins);
- all fifty are reachable over twenty thousand draws, which catches an off-by-one that would strand
  the last entry forever;
- no family dominates the table;
- every challenge is named in both languages, and a Cantonese name equal to the English one fails;
- each family's rule genuinely rejects a wrong answer — including that the hold fails **both**
  directions and the sequence resets rather than letting a player press everything.

`tests/game/golden-cookie.test.ts` pins the challenge to the dial where it tests dial geometry,
because a catch now rolls one of fifty and those assertions are about the needle.

Driven against the built artifact, family by family: *Knead the Dough* shows its press count and
window, *Steep the Tea* states its target and tolerance and the hold being measured, *Four-Step
Recipe* shows the order then four symbol buttons, *Six on the Tray* renders exactly six options, and
the *Oven Dial* still has its slider and instruction untouched.

## Two defects the built artifact caught

Both were invisible to source review and are worth recording:

- The card printed the dial's *"stop the needle inside the golden band"* instruction and its
  band-width briefing on top of a sequence — telling the player to stop a needle that was not on
  screen. Both are now dial-only.
- The card's title said *"Oven Dial"* whatever was open, so forty-nine of the fifty were unnamed.

## Suggested articles

- [Golden-cookie events](golden-cookie-events.md) — how they spawn, and what redeeming one pays.
- [Minigame events](minigame-events.md) — the other pool that interrupts a session, and how it differs.
