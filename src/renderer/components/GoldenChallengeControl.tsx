import { useEffect, useRef, useState } from 'react';

import {
  getGoldenChallenge,
  type GoldenChallenge,
  type GoldenChallengeInput,
} from '../../shared/game/golden-challenges.js';
import type { GoldenDialState } from '../../shared/game/types.js';
import { bilingualText, GOLDEN_CHALLENGE_COPY } from '../game/copy.js';

/**
 * THE FOUR NON-DIAL CHALLENGE CONTROLS.
 *
 * A caught golden cookie now opens one of fifty challenges across five families
 * (golden-challenges.ts). The dial keeps its own bespoke control in GoldenCookieStage -- it has a
 * needle to draw and a slider role to carry -- and the other four live here.
 *
 * Every one of them is a REAL control, not a picture of one: it dispatches the same
 * `goldenDialPress` the dial does, the domain decides the outcome, and nothing here evaluates
 * anything on its own. The one thing these components own is capturing WHAT the player did --
 * which symbol, which option, how long they held -- and handing it over.
 *
 * ACCESSIBILITY IS NOT OPTIONAL HERE, because these are the only way to redeem a cookie:
 *   - every control is a real <button>, so keyboard and screen readers get it for free;
 *   - the hold measures a keyboard press as honestly as a pointer one, via keydown/keyup;
 *   - progress is announced through a polite live region rather than only drawn;
 *   - the sequence's symbols carry names, not just colours, so it is playable without colour.
 */

/** How long a sequence is shown before the player must repeat it. */
const SEQUENCE_SHOW_MS = 900;

/** The symbols a sequence is built from. Names, not colours, so the round is not colour-only. */
const SEQUENCE_SYMBOLS = ['🍪', '🥠', '🧁', '🍥', '🥮', '🍡'] as const;

export interface GoldenChallengeControlProps {
  readonly dial: GoldenDialState;
  readonly onPress: (input?: GoldenChallengeInput) => void;
}

/** Chooses the control for whichever challenge is open. Returns null for the dial, which owns its own. */
export function GoldenChallengeControl({ dial, onPress }: GoldenChallengeControlProps) {
  const challenge = getGoldenChallenge(dial.challengeId);
  switch (challenge.family) {
    case 'mash':
      return <MashControl challenge={challenge} dial={dial} onPress={onPress} />;
    case 'hold':
      return <HoldControl challenge={challenge} onPress={onPress} />;
    case 'sequence':
      return <SequenceControl challenge={challenge} dial={dial} onPress={onPress} />;
    case 'pick':
      return <PickControl challenge={challenge} onPress={onPress} />;
    case 'dial':
      return null;
  }
}

/* ------------------------------------------------------------------------------- mash */

function MashControl({
  challenge,
  dial,
  onPress,
}: {
  challenge: GoldenChallenge;
  dial: GoldenDialState;
  onPress: (input?: GoldenChallengeInput) => void;
}) {
  const done = dial.progress ?? 0;
  const target = challenge.params.presses;
  const [remainingMs, setRemainingMs] = useState(challenge.params.windowMs);

  // The window is real and the player must be able to see it running out. Derived from the round's
  // own start instant rather than a local countdown, so a re-render cannot hand back lost time.
  useEffect(() => {
    const tick = () =>
      setRemainingMs(Math.max(0, challenge.params.windowMs - (Date.now() - dial.roundStartedAtEpochMs)));
    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [challenge.params.windowMs, dial.roundStartedAtEpochMs]);

  return (
    <div className="golden-challenge golden-challenge--mash">
      <button type="button" className="golden-challenge__mash-button" onClick={() => onPress()}>
        {bilingualText(GOLDEN_CHALLENGE_COPY.mashPress)}
      </button>
      <p className="golden-challenge__progress" role="status" aria-live="polite">
        {bilingualText(GOLDEN_CHALLENGE_COPY.mashProgress(done, target, (remainingMs / 1000).toFixed(1)))}
      </p>
      {/* Progress is stated in words above; this is the same fact drawn, never the only channel. */}
      <div
        className="golden-challenge__bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={done}
      >
        <span style={{ width: `${Math.min(100, (done / target) * 100)}%` }} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------- hold */

function HoldControl({
  challenge,
  onPress,
}: {
  challenge: GoldenChallenge;
  onPress: (input?: GoldenChallengeInput) => void;
}) {
  const startedAt = useRef<number | null>(null);
  const [heldMs, setHeldMs] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (startedAt.current !== null) setHeldMs(Date.now() - startedAt.current);
    }, 50);
    return () => window.clearInterval(id);
  }, []);

  const begin = () => {
    if (startedAt.current === null) startedAt.current = Date.now();
  };
  const end = () => {
    if (startedAt.current === null) return;
    const held = Date.now() - startedAt.current;
    startedAt.current = null;
    setHeldMs(0);
    onPress({ heldMs: held });
  };

  return (
    <div className="golden-challenge golden-challenge--hold">
      <button
        type="button"
        className="golden-challenge__hold-button"
        onPointerDown={begin}
        onPointerUp={end}
        // A pointer that leaves the button still ends the hold, so a drag-off cannot leave it
        // running forever and then report an absurd duration.
        onPointerLeave={end}
        // Keyboard is measured exactly the same way rather than approximated: Space and Enter both
        // repeat while held, so the FIRST keydown starts the clock and keyup ends it.
        onKeyDown={(event) => {
          if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault();
            begin();
          }
        }}
        onKeyUp={(event) => {
          if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault();
            end();
          }
        }}
      >
        {bilingualText(GOLDEN_CHALLENGE_COPY.holdPress)}
      </button>
      <p className="golden-challenge__progress" role="status" aria-live="polite">
        {bilingualText(
          GOLDEN_CHALLENGE_COPY.holdTarget(
            (challenge.params.targetMs / 1000).toFixed(1),
            (challenge.params.toleranceMs / 1000).toFixed(1),
            (heldMs / 1000).toFixed(1),
          ),
        )}
      </p>
    </div>
  );
}

/* --------------------------------------------------------------------------- sequence */

function SequenceControl({
  challenge,
  dial,
  onPress,
}: {
  challenge: GoldenChallenge;
  dial: GoldenDialState;
  onPress: (input?: GoldenChallengeInput) => void;
}) {
  const target = dial.target ?? [];
  const [showing, setShowing] = useState(true);

  // Show the order, then hide it. Re-runs whenever the ROUND changes, so every round is shown once
  // and a wrong answer inside a round does not get a free second look.
  useEffect(() => {
    setShowing(true);
    const id = window.setTimeout(() => setShowing(false), SEQUENCE_SHOW_MS * Math.max(1, target.length));
    return () => window.clearTimeout(id);
  }, [dial.roundStartedAtEpochMs, target.length]);

  const symbols = SEQUENCE_SYMBOLS.slice(0, challenge.params.symbols);
  const done = dial.progress ?? 0;

  return (
    <div className="golden-challenge golden-challenge--sequence">
      <p className="golden-challenge__progress" role="status" aria-live="polite">
        {bilingualText(
          showing
            ? GOLDEN_CHALLENGE_COPY.sequenceWatch(target.length)
            : GOLDEN_CHALLENGE_COPY.sequenceRepeat(done, target.length),
        )}
      </p>

      {showing ? (
        <ol className="golden-challenge__shown">
          {target.map((symbol, index) => (
            <li key={index}>
              {/* Named, not merely coloured: the label is what a screen reader reads and what a
                  player who cannot distinguish the glyphs relies on. */}
              <span aria-hidden="true">{SEQUENCE_SYMBOLS[symbol]}</span>
              <span className="golden-challenge__symbol-name">
                {bilingualText(GOLDEN_CHALLENGE_COPY.symbolNames[symbol] ?? GOLDEN_CHALLENGE_COPY.symbolUnknown)}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <div className="golden-challenge__symbols">
          {symbols.map((glyph, index) => (
            <button
              key={index}
              type="button"
              className="golden-challenge__symbol"
              onClick={() => onPress({ value: index })}
              aria-label={bilingualText(
                GOLDEN_CHALLENGE_COPY.symbolNames[index] ?? GOLDEN_CHALLENGE_COPY.symbolUnknown,
              )}
            >
              <span aria-hidden="true">{glyph}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------------- pick */

function PickControl({
  challenge,
  onPress,
}: {
  challenge: GoldenChallenge;
  onPress: (input?: GoldenChallengeInput) => void;
}) {
  const options = Array.from({ length: challenge.params.options }, (_, index) => index);
  return (
    <div className="golden-challenge golden-challenge--pick">
      <p className="golden-challenge__progress" role="status" aria-live="polite">
        {bilingualText(GOLDEN_CHALLENGE_COPY.pickPrompt(options.length))}
      </p>
      <div className="golden-challenge__options">
        {options.map((index) => (
          <button
            key={index}
            type="button"
            className="golden-challenge__option"
            onClick={() => onPress({ value: index })}
            aria-label={bilingualText(GOLDEN_CHALLENGE_COPY.pickOption(index + 1))}
          >
            <span aria-hidden="true">🥠</span>
          </button>
        ))}
      </div>
    </div>
  );
}
