import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { bnMulScalar } from '../../shared/game/big-number.js';
import { formatBigNum } from '../../shared/game/format-number.js';
import { isEffectActive } from '../../shared/game/golden-cookie.js';
import { GOLDEN_COOKIE_REDEEM_CLICKS } from '../../shared/game/reducer.js';
import { computeMultipliers } from '../../shared/game/upgrades.js';
import { computeDisclosure } from '../../shared/game/disclosure.js';
import { HeroCookieArt } from '../assets/icons.js';
import { showsEnglish, showsCantonese, bilingualText, COOKIE_SCREEN_COPY } from '../game/copy.js';
import { useFastSnapshot, useGameDispatch, useStructureSnapshot } from '../game/GameProvider.js';
import { createHoldToClickController } from '../game/hold-to-click.js';

interface Popup {
  readonly id: number;
  readonly text: string;
  readonly golden: boolean;
  /** Where the popup spawns, as a percentage of the wrap's width/height. */
  readonly x: number;
  readonly y: number;
}

let popupIdSeq = 0;

/**
 * The hero panel of the single game surface: the primary click target and nothing else.
 *
 * The headline cookie count is deliberately NOT repeated here — it lives once, in the pinned HUD
 * that App.tsx renders above this panel, so a number means the same thing in one place. The CPS
 * line is `aria-live="off"` — deliberately silent on every click — and only the separate,
 * throttled milestone status region ever announces to assistive technology. Holding the button
 * repeats a click at a fixed accessible rate through the exact same dispatch as a discrete click.
 */
export function CookieHero() {
  const dispatch = useGameDispatch();
  const fast = useFastSnapshot();
  const structure = useStructureSnapshot();
  const [popups, setPopups] = useState<Popup[]>([]);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  /** The last pointer position over the cookie, so a popup spawns where the player actually
   *  pressed. Keyboard and hold-to-repeat clicks have no pointer, so they get a small scatter
   *  around the centre instead — either way, no two popups land exactly on top of each other. */
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const goldenActive = structure.goldenCookie.isSpawned;
  const goldenPresses = structure.goldenCookie.redeemClicks ?? 0;
  // Progressive disclosure (src/shared/game/disclosure.ts): a fresh save is the cookie alone.
  // The per-second line arrives with the first generator, and press-and-hold — plus the hint
  // that teaches it — only after the Steady Hand reveal upgrade is bought.
  const disclosure = computeDisclosure(structure);
  const holdEnabled = disclosure.holdToClick;

  const currentClickValue = useMemo(() => {
    const multipliers = computeMultipliers(structure);
    let value = bnMulScalar(structure.baseClickValue, multipliers.clickMultiplier);
    const effect = structure.goldenCookie.activeEffect;
    if (effect?.kind === 'clickFrenzy' && effect.multiplier !== undefined && isEffectActive(effect, Date.now())) {
      value = bnMulScalar(value, effect.multiplier);
    }
    return value;
  }, [structure]);

  function spawnPopup(text: string, golden: boolean): void {
    const id = ++popupIdSeq;
    const point = lastPointRef.current;
    // Fixed-point spawning made rapid clicking read as one strobing pill, because up to six
    // concurrent popups rendered at identical coordinates. Spawn above the click instead.
    const x = point ? point.x : 50 + (Math.random() * 30 - 15);
    const y = point ? point.y : 34 + (Math.random() * 16 - 8);
    lastPointRef.current = null;
    setPopups((prev) => [...prev.slice(-5), { id, text, golden, x, y }]);
    setTimeout(() => setPopups((prev) => prev.filter((p) => p.id !== id)), 750);
  }

  /** Records a pointer position as a percentage of the cookie wrap, clamped inside it. */
  function recordPoint(clientX: number, clientY: number): void {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    lastPointRef.current = {
      x: Math.min(Math.max(((clientX - rect.left) / rect.width) * 100, 10), 90),
      y: Math.min(Math.max(((clientY - rect.top) / rect.height) * 100, 8), 92),
    };
  }

  function performClick(): void {
    const wasGolden = goldenActive;
    if (wasGolden) dispatch({ type: 'collectGoldenCookie' });
    dispatch({ type: 'click' });
    spawnPopup(`+${formatBigNum(currentClickValue, 'en')}`, wasGolden);
  }

  // The enabled predicate is read at press time rather than captured, so buying Steady Hand
  // mid-session makes holding work immediately without waiting for a controller rebuild.
  const holdEnabledRef = useRef(holdEnabled);
  holdEnabledRef.current = holdEnabled;

  /**
   * WHY THE CONTROLLER IS BUILT EXACTLY ONCE, AND WHY HOLDING USED TO STOP DEAD.
   *
   * This component previously rebuilt the controller in an effect keyed on `currentClickValue`
   * and `goldenActive`, cancelling the old one in the cleanup. `currentClickValue` is derived
   * from the structure snapshot, and the FIRST repeat of a hold changes game state — so the
   * next render handed the effect a fresh value, the cleanup ran, and the interval that was
   * driving the hold was cancelled about a tick after the press began. Holding the cookie
   * produced one click and then silence, which is exactly what it looked like.
   *
   * The controller is now built once and never replaced. Everything that legitimately changes
   * between presses (the click value baked into the popup, whether a golden cookie is up,
   * whether Steady Hand has been bought) is read through refs at fire time instead, so a hold
   * that is still held keeps firing across any number of re-renders.
   */
  const performClickRef = useRef(performClick);
  performClickRef.current = performClick;

  const controllerRef = useRef(
    createHoldToClickController(
      () => performClickRef.current(),
      undefined,
      undefined,
      () => holdEnabledRef.current,
    ),
  );
  useEffect(() => {
    const controller = controllerRef.current;
    return () => controller.stop();
  }, []);

  return (
    <div className="panel cookie-hero">
      <div
        ref={wrapRef}
        className={`cookie-target-wrap${goldenActive ? ' golden' : ''}${goldenActive ? ' golden-overlay-wrap' : ''}`}
      >
        {/* The spinning ray-burst the golden moment is built around (design/cookie-surface.html).
            Pure CSS: a repeating conic gradient behind a ring mask. Under reduced motion it stays
            fully visible but stops rotating, exactly as the spec calls for. */}
        {goldenActive ? <span className="golden-rays" aria-hidden="true" /> : null}
        {/* Ten presses to redeem (reducer.ts GOLDEN_COOKIE_REDEEM_CLICKS): the countdown is on
            the surface so nobody wonders why one press did nothing. aria-hidden — the same
            figure is appended to the button's accessible name below via the wrap's label. */}
        {goldenActive ? (
          <span className="golden-press-count" role="status">
            {GOLDEN_COOKIE_REDEEM_CLICKS - goldenPresses}
          </span>
        ) : null}
        {/* Oven embers drifting up behind the cookie. Decorative, and still under reduced motion.
            Six motes now rather than three, in two depth bands: the three carrying
            `--far` are smaller, dimmer, slightly blurred and drift slower, so the air in front
            of the oven has depth instead of being one flat sheet of identical sparks. The blur
            lives only on these decorative spans — never on the cookie, which animates. */}
        <span className="cookie-embers" aria-hidden="true">
          <span className="cookie-embers__mote cookie-embers__mote--far" />
          <span className="cookie-embers__mote" />
          <span className="cookie-embers__mote cookie-embers__mote--far" />
          <span className="cookie-embers__mote" />
          <span className="cookie-embers__mote cookie-embers__mote--far" />
          <span className="cookie-embers__mote" />
        </span>
        {/* Crumbs on the counter at the foot of the cookie. Still in every state — this is
            scatter, not animation — and drawn as gradient dots, so it costs nothing. */}
        <span className="cookie-crumbs" aria-hidden="true" />
        <button
          ref={buttonRef}
          type="button"
          className="cookie-btn cookie-btn--art cookie-btn--lift"
          aria-label={goldenActive ? `${bilingualText(COOKIE_SCREEN_COPY.goldenAvailable)}` : `${bilingualText(COOKIE_SCREEN_COPY.clickTarget)}`}
          onClick={(event) => {
            // A keyboard-activated click reports 0,0 detail; only a real pointer has a position.
            if (event.detail > 0) recordPoint(event.clientX, event.clientY);
            performClick();
          }}
          onPointerDown={(event) => {
            event.preventDefault();
            recordPoint(event.clientX, event.clientY);
            // Capture the pointer so a hand that drifts a pixel — or a re-render that moves the
            // art under the cursor — cannot silently end the hold by way of pointerleave.
            try {
              event.currentTarget.setPointerCapture(event.pointerId);
            } catch {
              // Older/synthetic pointers may refuse capture; holding still works without it.
            }
            controllerRef.current.start();
          }}
          onPointerUp={() => controllerRef.current.stop()}
          onPointerLeave={() => controllerRef.current.stop()}
          onPointerCancel={() => controllerRef.current.stop()}
        >
          {/* The cookie itself is now a real drawing rather than a stack of CSS radial
              gradients on the button face: an irregular baked silhouette with a browned rim,
              cracks, speckle and chocolate chunks that have depth (see HeroCookieArt in
              assets/icons.tsx). The button underneath keeps its arcade physics and stays the
              solid base the cookie sits on; the drawing simply overhangs it. The golden state
              is the same geometry, gilded — so it is unmistakably this cookie, gone gold. */}
          {/* THE PLAIN COOKIE. `look.art` is a purchase (control-unlocks.ts), and until it is
              bought this is what the game's one and only button is: a grey circle with the word
              COOKIE printed on it in the system font. It is emitted next to the drawing rather
              than instead of it, and THE PLAIN LAYER in styles/index.css shows exactly one of
              the two, so buying the rung swaps them with no component subscribing to the save.
              It is aria-hidden like the drawing is — the button's own aria-label has always
              carried the name and still does, so the plain state announces identically. */}
          <span className="cookie-btn__plain" aria-hidden="true">
            COOKIE
          </span>
          <HeroCookieArt golden={goldenActive} extraClass="cookie-btn__art" />
        </button>
        {popups.map((popup) => (
          <span
            key={popup.id}
            className={`click-popup click-popup--at-point${popup.golden ? ' golden' : ''}`}
            style={{ '--popup-x': `${popup.x}%`, '--popup-y': `${popup.y}%` } as CSSProperties}
            aria-hidden="true"
          >
            {popup.text}
          </span>
        ))}
      </div>

      {disclosure.perSecondReadout ? (
        <div className="cookie-cps" aria-live="off">
          {showsEnglish() ? `${formatBigNum(fast.cps, 'en')} / sec` : null}
          {showsEnglish() && showsCantonese() ? ' · ' : null}
          {showsCantonese() ? `${COOKIE_SCREEN_COPY.cpsLabel.yue} ${formatBigNum(fast.cps, 'yue')}` : null}
        </div>
      ) : null}

      {holdEnabled ? (
        <p className="cookie-hero__hint">
          {bilingualText(COOKIE_SCREEN_COPY.holdHint)}
        </p>
      ) : null}
    </div>
  );
}
