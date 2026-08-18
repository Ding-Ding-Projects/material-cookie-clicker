import { useEffect, useRef, useState, type CSSProperties } from 'react';

import {
  GOLDEN_DIAL_ROUNDS,
  GOLDEN_DIAL_STEPS,
  goldenDialNeedlePosition,
  goldenDialRound,
  goldenDialSweepMs,
} from '../../shared/game/golden-cookie.js';
import { HeroCookieArt, OvenDialArt } from '../assets/icons.js';
import { bilingualText, showsCantonese, showsEnglish, GOLDEN_DIAL_COPY } from '../game/copy.js';
import { useGameDispatch, useStructureSnapshot } from '../game/GameProvider.js';

/**
 * THE GOLDEN COOKIE, ON THE STAGE — catch it, then beat the Oven Dial.
 *
 * Owner decrees, in the order they arrived: the golden cookie "needs to appear somewhere random
 * on screen" "and opens a puzzle"; then, of what that puzzle had to be, "golden cookie puzzle
 * must be a minigame, not a chance game."
 *
 * THE SECOND DECREE IS WHY THIS FILE NO LONGER DRAWS A GRID. The first attempt was Odd Cookie
 * Out: sixteen tiles, one subtly different, three rounds. It looked like a puzzle and behaved
 * like a lottery — the odd tile was seeded, and a player who pressed a tile at random won one
 * round in sixteen with no skill involved at all. The Oven Dial has no such hole. A needle sweeps
 * the face; its position is an exact function of how long the round has been running
 * (golden-cookie.ts#goldenDialNeedlePosition); you press to stop it inside a band you can see.
 * The difficulty curve is fixed and published — round one is a 26% band under a 1.8s sweep, round
 * three a 13% band under a 1.05s sweep — and it is the same three rounds for every player, every
 * save and every seed. The only seeded value in the whole minigame is where on the face the band
 * SITS, which cannot decide anything, because the band is painted before the press.
 *
 * A VIEW, like RandomEventStage beside it. The spawn position, the band position, the needle
 * function and the verdict on a press all live in the domain, and the press action deliberately
 * carries no needle position — the reducer recomputes it from the round's start time and the
 * clock, so this component cannot claim a hit it did not earn. What this file owns is the
 * animation frame, the drawing and the words.
 *
 * ── ACCESSIBILITY: WHAT IS AND IS NOT ACHIEVED ──────────────────────────────────────────────
 *
 * This is a genuine improvement on the tile hunt it replaced, and it is still not a game a blind
 * player can play as well as a sighted one. Both halves of that are worth stating.
 *
 * What IS achieved:
 *
 *   - The game is ONE BUTTON with ONE fixed name ("Stop the needle"). There is nothing to hunt
 *     for, nothing to compare, and no spatial search. Space or Enter on a focused button is the
 *     entire input, which is a far better keyboard game than sixteen tiles ever were.
 *   - The dial is a real `role="slider"`, and its `aria-valuetext` states, continuously, where
 *     the needle is and whether it is currently inside the band ("42%, outside the band" /
 *     "58%, IN THE BAND"). That is the position conveyed non-visually rather than only drawn.
 *     Screen readers throttle live updates, so this is a coarse read of a moving value, not a
 *     frame-accurate one — it is a genuine aid, not a promise of parity.
 *   - Each round is BRIEFED in text before it is played: the band's width as a percentage and the
 *     sweep time in seconds, announced through the card's status region. The difficulty is stated
 *     rather than merely felt, and because the curve is fixed those numbers are the same numbers
 *     every other player gets.
 *   - Under `prefers-reduced-motion` the needle does not sweep: it STEPS, one notch of
 *     twenty-four at a time, on a cadence 1.6x slower than the continuous sweep. That is a rhythm
 *     game — countable, learnable, and playable without watching a moving object at all. The
 *     mode is frozen onto the domain state at the catch, so the position judged is exactly the
 *     position shown, and the drawn ticks are exactly the positions the needle can occupy.
 *
 * What is NOT achieved: a player who cannot see the dial at all is relying on `aria-valuetext`
 * updates that no specification guarantees the timing of, and in continuous mode that is not good
 * enough to hit a 13% band reliably. The honest mitigation is the same one the whole feature
 * rests on: FAILING COSTS NOTHING ALREADY OWNED. A miss burns two seconds of the cookie's own
 * window and nothing else, and a timeout or an Escape just lets a bonus go. Golden cookies sit on
 * top of the game, never across it, so no progress, no purchase and no achievement is gated
 * behind beating this dial.
 *
 * The rest of the dialog discipline is the full AnchoredPanel contract, scaled down: role dialog,
 * aria-modal, labelled by its own heading, focus moved in and trapped, Escape closes (here,
 * Escape lets the cookie flee), and focus restored afterwards.
 */

const FOCUSABLE_SELECTOR = 'button:not([disabled])';

type Outcome = { readonly kind: 'redeemed' | 'fled'; readonly key: number };
type PressFeedback = { readonly kind: 'hit' | 'miss'; readonly key: number };

let outcomeKeySeq = 0;

/** Whether the player has asked the system for less motion. Read at the catch, then frozen. */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function GoldenCookieStage() {
  const dispatch = useGameDispatch();
  const structure = useStructureSnapshot();
  const golden = structure.goldenCookie;
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [feedback, setFeedback] = useState<PressFeedback | null>(null);

  // A spawn with no position is a save written before the sprite existed (save-schema.ts explains
  // why no migration invents one): treat it as nothing spawned and let the scheduler hand out a
  // fresh cookie on the next tick rather than drawing one in the corner.
  const positioned = golden.isSpawned && golden.spawnXPct !== undefined && golden.spawnYPct !== undefined;
  const dial = positioned ? golden.dial : undefined;
  const dialOpen = dial !== undefined;

  /**
   * WHERE THE NEEDLE IS, THIS FRAME.
   *
   * Kept in component state and advanced on an animation frame, but NEVER used to decide
   * anything: it is recomputed from the domain's own pure function on the domain's own round
   * start time, so it is a picture of the number the reducer will independently recompute when a
   * press lands. Drawing from a second, drifting clock is exactly how a dial minigame becomes a
   * liar, so there is only one clock and one function.
   */
  const [needle, setNeedle] = useState(0);
  useEffect(() => {
    if (!dial) return undefined;
    let frame = 0;
    const roundIndex = Math.min(dial.roundsWon, GOLDEN_DIAL_ROUNDS - 1);
    const tick = () => {
      setNeedle(goldenDialNeedlePosition(Date.now() - dial.roundStartedAtEpochMs, roundIndex, dial.stepped));
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [dial?.roundStartedAtEpochMs, dial?.roundsWon, dial?.stepped, dialOpen]);

  /**
   * What happened to the cookie that just left the stage. Redeemed if it left carrying a new
   * effect; fled otherwise (Escape, or the window ran out under the player). Tracked here rather
   * than in the domain because it is a sentence, not a rule — the domain already said everything
   * it needs to by despawning.
   */
  const previousRef = useRef<{ spawned: boolean; effect: unknown }>({
    spawned: golden.isSpawned,
    effect: golden.activeEffect,
  });
  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = { spawned: golden.isSpawned, effect: golden.activeEffect };
    if (!previous.spawned || golden.isSpawned) return;
    const redeemed = golden.activeEffect !== previous.effect;
    setOutcome({ kind: redeemed ? 'redeemed' : 'fled', key: ++outcomeKeySeq });
    setFeedback(null);
  }, [golden.isSpawned, golden.activeEffect]);

  /**
   * The outcome line clears itself; it is a report, not a permanent fixture. Six and a half
   * seconds rather than the four it used to get: this is the ONE line that names what the cookie
   * paid out, it arrives at the end of a minigame the player was concentrating on, and four
   * seconds was short enough to miss while still looking at the dial that had just closed.
   */
  useEffect(() => {
    if (!outcome) return;
    const timer = setTimeout(() => setOutcome(null), 6500);
    return () => clearTimeout(timer);
  }, [outcome]);

  /**
   * Focus moves into the card when it opens, and on the way out it goes to the HERO COOKIE rather
   * than back to whatever opened the card: the sprite that opened it no longer exists by then
   * (caught, redeemed or fled), and a card that closed leaving focus on <body> would strand a
   * keyboard player at the top of the document.
   */
  useEffect(() => {
    if (!dialOpen) return undefined;
    cardRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
    return () => {
      if (document.activeElement === document.body || document.activeElement === null) {
        document.querySelector<HTMLElement>('.cookie-btn')?.focus();
      }
    };
  }, [dialOpen]);

  if (!positioned && !outcome) return null;

  const roundIndex = dial ? Math.min(dial.roundsWon, GOLDEN_DIAL_ROUNDS - 1) : 0;
  const curve = goldenDialRound(roundIndex);
  const insideBand = dial ? Math.abs(needle - dial.zoneCentre) <= curve.zoneHalfWidth : false;
  const bandWidthPct = Math.round(curve.zoneHalfWidth * 200);
  const sweepSeconds = dial ? (goldenDialSweepMs(roundIndex, dial.stepped) / 1000).toFixed(1) : '0';

  function press(): void {
    if (!dial) return;
    // Read the verdict the same way the reducer will, purely so the shake and the line match what
    // the domain decided. The domain is still the only thing that CHANGES anything.
    const wasInside = Math.abs(needle - dial.zoneCentre) <= curve.zoneHalfWidth;
    setFeedback({ kind: wasInside ? 'hit' : 'miss', key: ++outcomeKeySeq });
    dispatch({ type: 'goldenDialPress' });
  }

  return (
    <div className="golden-stage">
      {positioned && !dial ? (
        <button
          type="button"
          className="golden-sprite"
          style={{ '--golden-x': `${golden.spawnXPct}%`, '--golden-y': `${golden.spawnYPct}%` } as CSSProperties}
          aria-label={bilingualText(GOLDEN_DIAL_COPY.spriteLabel)}
          onClick={() => dispatch({ type: 'goldenCatch', stepped: prefersReducedMotion() })}
        >
          {/* The wash and the ray-burst that used to sit over the hero cookie now sit on the
              thing they were always about. Decorative; the button carries the name. */}
          <span className="golden-sprite__rays" aria-hidden="true" />
          <HeroCookieArt golden extraClass="golden-sprite__art" />
        </button>
      ) : null}

      {positioned && dial ? (
        <div
          className="golden-dial-scrim"
          onMouseDown={(event) => {
            // A press on the dimmed surface behind is a walk-away, and a walk-away lets it flee.
            if (event.target === event.currentTarget) dispatch({ type: 'goldenFlee' });
          }}
        >
          <div
            className="golden-dial-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="golden-dial-title"
            ref={cardRef}
            data-feedback={feedback?.kind}
            key={feedback?.key ?? 'fresh'}
            style={
              { '--golden-x': `${golden.spawnXPct}%`, '--golden-y': `${golden.spawnYPct}%` } as CSSProperties
            }
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                dispatch({ type: 'goldenFlee' });
                return;
              }
              if (event.key !== 'Tab') return;
              const node = cardRef.current;
              if (!node) return;
              const focusable = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
              if (focusable.length === 0) return;
              const first = focusable[0];
              const last = focusable[focusable.length - 1];
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
              }
            }}
          >
            <h2 className="golden-dial-card__title" id="golden-dial-title">
              {showsEnglish() ? <span>{GOLDEN_DIAL_COPY.title.en}</span> : null}
              {showsCantonese() ? (
                <span className="golden-dial-card__title-zh">{GOLDEN_DIAL_COPY.title.yue}</span>
              ) : null}
            </h2>
            <p className="golden-dial-card__round">
              {bilingualText(GOLDEN_DIAL_COPY.round(dial.roundsWon + 1, GOLDEN_DIAL_ROUNDS))}
            </p>
            <p className="golden-dial-card__instruction">
              {bilingualText(dial.stepped ? GOLDEN_DIAL_COPY.steppedInstruction : GOLDEN_DIAL_COPY.instruction)}
            </p>

            {/* The dial as a real slider: a value with a range and, crucially, a valuetext that
                says in words both where the needle is and whether it is in the band. This is the
                non-visual channel for a position that is otherwise only drawn. It is read-only —
                arrow keys do not move the needle, because the needle is the clock's, not the
                player's; the ONE thing the player does is stop it. */}
            <div
              className="golden-dial"
              role="slider"
              aria-readonly="true"
              aria-label={bilingualText(GOLDEN_DIAL_COPY.instruction)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(needle * 100)}
              aria-valuetext={`${Math.round(needle * 100)}%${insideBand ? ', in the band' : ', outside the band'}`}
            >
              <OvenDialArt
                position={needle}
                zoneCentre={dial.zoneCentre}
                zoneHalfWidth={curve.zoneHalfWidth}
                stepped={dial.stepped}
                steps={GOLDEN_DIAL_STEPS}
                outcome={feedback?.kind}
              />
            </div>

            <button type="button" className="golden-dial-card__stop" onClick={press}>
              {bilingualText(GOLDEN_DIAL_COPY.stopLabel)}
            </button>

            {/* One status region carrying the round briefing and the verdict on the last press.
                The briefing states the difficulty in numbers, so the curve is something a player
                is told rather than something they have to infer from how it felt. */}
            <p className="golden-dial-card__status" role="status" aria-live="polite">
              {feedback
                ? bilingualText(feedback.kind === 'hit' ? GOLDEN_DIAL_COPY.hit : GOLDEN_DIAL_COPY.miss)
                : bilingualText(
                    GOLDEN_DIAL_COPY.roundBriefing(dial.roundsWon + 1, bandWidthPct, sweepSeconds),
                  )}
            </p>

            <button type="button" className="golden-dial-card__close" onClick={() => dispatch({ type: 'goldenFlee' })}>
              {bilingualText(GOLDEN_DIAL_COPY.close)}
            </button>
          </div>
        </div>
      ) : null}

      {outcome ? (
        <p className="golden-outcome" role="status" aria-live="polite" key={outcome.key}>
          {outcome.kind === 'fled'
            ? bilingualText(GOLDEN_DIAL_COPY.fled)
            : bilingualText(
                GOLDEN_DIAL_COPY.redeemed(
                  GOLDEN_DIAL_COPY.effectNames[golden.activeEffect?.kind ?? 'windfall'].en,
                  GOLDEN_DIAL_COPY.effectNames[golden.activeEffect?.kind ?? 'windfall'].yue,
                ),
              )}
        </p>
      ) : null}
    </div>
  );
}
