import { useEffect, useRef, useState, type CSSProperties } from 'react';

import {
  GOLDEN_PUZZLE_ROUNDS,
  GOLDEN_PUZZLE_TILE_COUNT,
} from '../../shared/game/golden-cookie.js';
import { HeroCookieArt, PuzzleCookieTileArt } from '../assets/icons.js';
import { bilingualText, showsCantonese, showsEnglish, GOLDEN_PUZZLE_COPY } from '../game/copy.js';
import { useGameDispatch, useStructureSnapshot } from '../game/GameProvider.js';

/**
 * THE GOLDEN COOKIE, ON THE STAGE — catch it, then solve it.
 *
 * Owner decrees, in order: the golden cookie "needs to appear somewhere random on screen" "and
 * opens a puzzle". Both are here, and the older standing decree ("the user must press it 10
 * times to redeem, not auto redeem") is honoured in spirit rather than by literal count — see
 * reducer.ts#handleGoldenCatch. The catch is one press and the puzzle is three rounds of a
 * sixteen-tile grid, so redemption costs about ten deliberate presses and is never automatic.
 *
 * A VIEW, like RandomEventStage beside it. Nothing here decides where the cookie is, which tile
 * is odd, what a wrong pick costs or what the cookie is worth: the position and the odd tile are
 * drawn from the seeded rng in the domain (golden-cookie.ts) and persisted in the save, so the
 * cookie does not teleport between renders and a seeded replay puts it in the same place twice.
 * This file positions, draws and dispatches.
 *
 * ── THE ACCESSIBILITY NOTE, STATED HONESTLY ─────────────────────────────────────────────────
 *
 * Odd Cookie Out is a SIGHTED-SKILL minigame. Every tile carries the same accessible name
 * ("Cookie tile 5" and so on) and the odd one is NOT named as odd, because naming it would hand
 * a screen-reader user the answer instantly while a sighted player hunts for it — the mirror of
 * the unfairness, not a fix for it. So the difference is visual, and we do not pretend otherwise.
 *
 * What that costs is bounded on purpose, and this is the whole mitigation:
 *
 *   - Failing costs NOTHING that was already owned. A wrong pick burns two seconds of the
 *     cookie's own window; running out of time, or pressing Escape, simply lets the cookie flee
 *     and the ordinary cooldown starts. No cookies are lost, no progress is undone, and golden
 *     cookies are a bonus on top of the game rather than a gate through it.
 *   - After TWO wrong picks in a round the odd tile is RINGED (PuzzleCookieTileArt `hint`) and
 *     that fact is announced through this card's status line. It is still a visual ring — it
 *     makes the puzzle easier for anyone with low vision or a bad monitor, and it does not make
 *     it solvable without sight. Saying so plainly is better than an aria-label that quietly
 *     turns a puzzle into a lottery for some players and a test for others.
 *   - The difference is never colour alone (rotation, a missing chip, an extra chip, a mirror),
 *     so it survives colour-blindness and a greyscale display.
 *
 * The rest of the dialog discipline is the full AnchoredPanel contract, scaled down: role
 * dialog, aria-modal, labelled by its own heading, focus moved in and trapped, Escape closes
 * (here, Escape lets the cookie flee), and focus restored to what opened it.
 */

/** The 4x4 grid, as a flat list of indices. */
const TILE_INDICES = Array.from({ length: GOLDEN_PUZZLE_TILE_COUNT }, (_, index) => index);

/** Wrong picks in one round after which the odd tile is ringed. */
const HINT_AFTER_WRONG_PICKS = 2;

const FOCUSABLE_SELECTOR = 'button:not([disabled])';

type Outcome = { readonly kind: 'redeemed' | 'fled'; readonly key: number };

let outcomeKeySeq = 0;

export function GoldenCookieStage() {
  const dispatch = useGameDispatch();
  const structure = useStructureSnapshot();
  const golden = structure.goldenCookie;
  const spriteRef = useRef<HTMLButtonElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [shakeKey, setShakeKey] = useState(0);

  // A spawn with no position is a save written before this redesign (save-schema.ts explains
  // why no migration invents one): treat it as nothing spawned and let the scheduler hand out a
  // fresh cookie on the next tick rather than drawing one in the corner.
  const positioned = golden.isSpawned && golden.spawnXPct !== undefined && golden.spawnYPct !== undefined;
  const puzzle = positioned ? golden.puzzle : undefined;

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
  }, [golden.isSpawned, golden.activeEffect]);

  // The outcome line clears itself; it is a report, not a permanent fixture.
  useEffect(() => {
    if (!outcome) return;
    const timer = setTimeout(() => setOutcome(null), 4200);
    return () => clearTimeout(timer);
  }, [outcome]);

  /**
   * Focus moves into the card when it opens, and on the way out it goes to the HERO COOKIE
   * rather than back to whatever opened the card: the sprite that opened it no longer exists by
   * then (caught, redeemed or fled), and a card that closed leaving focus on <body> would strand
   * a keyboard player at the top of the document. The hero cookie is the thing they were using
   * before the golden one interrupted them.
   */
  const puzzleOpen = puzzle !== undefined;
  useEffect(() => {
    if (puzzleOpen) {
      cardRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
      return () => {
        if (document.activeElement === document.body || document.activeElement === null) {
          document.querySelector<HTMLElement>('.cookie-btn')?.focus();
        }
      };
    }
    return undefined;
  }, [puzzleOpen]);

  if (!positioned && !outcome) return null;

  const wrongPicks = puzzle?.wrongPicks ?? 0;
  const roundsSolved = puzzle?.roundsSolved ?? 0;
  const showHint = wrongPicks >= HINT_AFTER_WRONG_PICKS;

  function pick(index: number): void {
    if (!puzzle) return;
    if (index !== puzzle.oddIndex) setShakeKey((key) => key + 1);
    dispatch({ type: 'goldenPuzzlePick', tileIndex: index });
  }

  return (
    <div className="golden-stage">
      {positioned && !puzzle ? (
        <button
          type="button"
          ref={spriteRef}
          className="golden-sprite"
          style={{ '--golden-x': `${golden.spawnXPct}%`, '--golden-y': `${golden.spawnYPct}%` } as CSSProperties}
          aria-label={bilingualText(GOLDEN_PUZZLE_COPY.spriteLabel)}
          onClick={() => dispatch({ type: 'goldenCatch' })}
        >
          {/* The wash and the ray-burst that used to sit over the hero cookie now sit on the
              thing they were always about. Decorative; the button carries the name. */}
          <span className="golden-sprite__rays" aria-hidden="true" />
          <HeroCookieArt golden extraClass="golden-sprite__art" />
        </button>
      ) : null}

      {positioned && puzzle ? (
        <div
          className="golden-puzzle-scrim"
          onMouseDown={(event) => {
            // A press on the dimmed stage behind is a walk-away, and a walk-away lets it flee.
            if (event.target === event.currentTarget) dispatch({ type: 'goldenFlee' });
          }}
        >
          <div
            className="golden-puzzle"
            role="dialog"
            aria-modal="true"
            aria-labelledby="golden-puzzle-title"
            aria-describedby="golden-puzzle-status"
            ref={cardRef}
            data-shake={shakeKey}
            key={shakeKey}
            style={
              {
                '--golden-x': `${golden.spawnXPct}%`,
                '--golden-y': `${golden.spawnYPct}%`,
              } as CSSProperties
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
            <h2 className="golden-puzzle__title" id="golden-puzzle-title">
              {showsEnglish() ? <span>{GOLDEN_PUZZLE_COPY.title.en}</span> : null}
              {showsCantonese() ? <span className="golden-puzzle__title-zh">{GOLDEN_PUZZLE_COPY.title.yue}</span> : null}
            </h2>
            <p className="golden-puzzle__round">
              {bilingualText(GOLDEN_PUZZLE_COPY.round(roundsSolved + 1, GOLDEN_PUZZLE_ROUNDS))}
            </p>
            <p className="golden-puzzle__instruction">{bilingualText(GOLDEN_PUZZLE_COPY.instruction)}</p>
            {/* role="grid" would oblige a full grid-navigation contract (rows, cells, roving
                focus). Sixteen buttons in a labelled group with ordinary Tab order keeps the
                promise it makes, so that is what this is. */}
            <div
              className="golden-puzzle__grid"
              role="group"
              aria-label={bilingualText(GOLDEN_PUZZLE_COPY.instruction)}
            >
              {TILE_INDICES.map((index) => (
                <button
                  key={index}
                  type="button"
                  className="golden-puzzle__tile"
                  // EVERY tile gets the same shape of name and none of them says "odd". See the
                  // accessibility note at the top of this file.
                  aria-label={bilingualText(GOLDEN_PUZZLE_COPY.tileLabel(index + 1))}
                  onClick={() => pick(index)}
                >
                  <PuzzleCookieTileArt
                    odd={index === puzzle.oddIndex}
                    variant={puzzle.variant}
                    hint={showHint && index === puzzle.oddIndex}
                  />
                </button>
              ))}
            </div>
            <p className="golden-puzzle__status" id="golden-puzzle-status" role="status" aria-live="polite">
              {showHint
                ? bilingualText(GOLDEN_PUZZLE_COPY.hintOffered)
                : wrongPicks > 0
                  ? bilingualText(GOLDEN_PUZZLE_COPY.wrongPick)
                  : ''}
            </p>
            <button type="button" className="golden-puzzle__close" onClick={() => dispatch({ type: 'goldenFlee' })}>
              {bilingualText(GOLDEN_PUZZLE_COPY.close)}
            </button>
          </div>
        </div>
      ) : null}

      {outcome ? (
        <p className="golden-outcome" role="status" aria-live="polite" key={outcome.key}>
          {outcome.kind === 'fled'
            ? bilingualText(GOLDEN_PUZZLE_COPY.fled)
            : bilingualText(
                GOLDEN_PUZZLE_COPY.redeemed(
                  GOLDEN_PUZZLE_COPY.effectNames[golden.activeEffect?.kind ?? 'windfall'].en,
                  GOLDEN_PUZZLE_COPY.effectNames[golden.activeEffect?.kind ?? 'windfall'].yue,
                ),
              )}
        </p>
      ) : null}
    </div>
  );
}
