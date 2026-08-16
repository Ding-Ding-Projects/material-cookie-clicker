import { useEffect, useMemo, useRef, useState } from 'react';

import { bnMulScalar } from '../../shared/game/big-number.js';
import { formatBigNum } from '../../shared/game/format-number.js';
import { isEffectActive } from '../../shared/game/golden-cookie.js';
import { computeMultipliers } from '../../shared/game/upgrades.js';
import { COOKIE_SCREEN_COPY } from '../game/copy.js';
import { useFastSnapshot, useGameDispatch, useStructureSnapshot } from '../game/GameProvider.js';
import { createHoldToClickController } from '../game/hold-to-click.js';

interface Popup {
  readonly id: number;
  readonly text: string;
  readonly golden: boolean;
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
    setPopups((prev) => [...prev.slice(-5), { id, text, golden }]);
    setTimeout(() => setPopups((prev) => prev.filter((p) => p.id !== id)), 750);
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
      <div className={`cookie-target-wrap${goldenActive ? ' golden' : ''}${goldenActive ? ' golden-overlay-wrap' : ''}`}>
        <button
          ref={buttonRef}
          type="button"
          className="cookie-btn"
          aria-label={goldenActive ? `${COOKIE_SCREEN_COPY.goldenAvailable.en} · ${COOKIE_SCREEN_COPY.goldenAvailable.yue}` : `${COOKIE_SCREEN_COPY.clickTarget.en} · ${COOKIE_SCREEN_COPY.clickTarget.yue}`}
          onClick={performClick}
          onPointerDown={(event) => {
            event.preventDefault();
            controllerRef.current.start();
          }}
          onPointerUp={() => controllerRef.current.stop()}
          onPointerLeave={() => controllerRef.current.stop()}
          onPointerCancel={() => controllerRef.current.stop()}
        >
          {goldenActive ? '✨' : '🍪'}
        </button>
        {popups.map((popup) => (
          <span key={popup.id} className={`click-popup${popup.golden ? ' golden' : ''}`} aria-hidden="true">
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
