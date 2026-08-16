import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { bnMulScalar } from '../../shared/game/big-number.js';
import { formatBigNum } from '../../shared/game/format-number.js';
import { isEffectActive } from '../../shared/game/golden-cookie.js';
import { computeMultipliers } from '../../shared/game/upgrades.js';
import { GoldenCookieIcon } from '../assets/icons.js';
import { COOKIE_SCREEN_COPY } from '../game/copy.js';
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

  const controllerRef = useRef(createHoldToClickController(performClick));
  useEffect(() => {
    controllerRef.current = createHoldToClickController(performClick);
    return () => controllerRef.current.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentClickValue, goldenActive]);

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
        {/* Oven embers drifting up behind the cookie. Decorative, and still under reduced motion. */}
        <span className="cookie-embers" aria-hidden="true">
          <span className="cookie-embers__mote" />
          <span className="cookie-embers__mote" />
          <span className="cookie-embers__mote" />
        </span>
        <button
          ref={buttonRef}
          type="button"
          className="cookie-btn cookie-btn--art cookie-btn--lift"
          aria-label={goldenActive ? `${COOKIE_SCREEN_COPY.goldenAvailable.en} · ${COOKIE_SCREEN_COPY.goldenAvailable.yue}` : `${COOKIE_SCREEN_COPY.clickTarget.en} · ${COOKIE_SCREEN_COPY.clickTarget.yue}`}
          onClick={(event) => {
            // A keyboard-activated click reports 0,0 detail; only a real pointer has a position.
            if (event.detail > 0) recordPoint(event.clientX, event.clientY);
            performClick();
          }}
          onPointerDown={(event) => {
            event.preventDefault();
            recordPoint(event.clientX, event.clientY);
            controllerRef.current.start();
          }}
          onPointerUp={() => controllerRef.current.stop()}
          onPointerLeave={() => controllerRef.current.stop()}
          onPointerCancel={() => controllerRef.current.stop()}
        >
          {/* The ordinary cookie is already drawn by CSS (dough gradient plus chocolate chips),
              so only the golden state needs art: the ray-burst cookie replaces the sparkle
              character that used to be stuck on the dough. */}
          {goldenActive ? <GoldenCookieIcon extraClass="cookie-btn__art" /> : null}
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

      <div className="cookie-cps" aria-live="off">
        {formatBigNum(fast.cps, 'en')} / sec · {COOKIE_SCREEN_COPY.cpsLabel.yue} {formatBigNum(fast.cps, 'yue')}
      </div>

      <p className="cookie-hero__hint">
        {COOKIE_SCREEN_COPY.holdHint.en} · {COOKIE_SCREEN_COPY.holdHint.yue}
      </p>
    </div>
  );
}
