import type { CSSProperties } from 'react';

import { milkBandFor, milkPercent, milkTideFraction } from '../../shared/game/milk.js';
import { bilingualText, MILK_COPY, showsCantonese, showsEnglish } from '../game/copy.js';
import { useStructureSnapshot } from '../game/GameProvider.js';

/**
 * THE MILK TIDE.
 *
 * A rising liquid at the bottom of the game stage whose height is the player's achievement
 * count and nothing else (src/shared/game/milk.ts: 4% per badge). It is drawn, not narrated:
 * the number climbing is the whole readout, and the flavour band that names it changes with it.
 *
 * Three deliberate decisions:
 *
 *   - It reads the STRUCTURAL store slice, not the fast one. Milk changes on a discrete badge
 *     unlock, roughly a handful of times a run; subscribing it to the tick would repaint a
 *     full-width gradient several times a second for a number that had not moved.
 *   - It is `aria-hidden` as a graphic and carries its meaning in a separate text line, because
 *     a liquid level is not something a screen reader can be asked to interpret.
 *   - The surface animation is CSS-only and switched off entirely under
 *     `prefers-reduced-motion`, where the tide simply sits at its level. The LEVEL is never
 *     animation — it is the data — so reduced motion loses the sway and loses nothing else.
 */
export function MilkTide() {
  const structure = useStructureSnapshot();
  const percent = milkPercent(structure);
  const fraction = milkTideFraction(structure);
  const band = milkBandFor(structure);

  // Nothing has been earned yet: an empty glass at the bottom of the cabinet would be a piece of
  // furniture that explains nothing, so the tide simply is not there until the first badge.
  if (percent <= 0) return null;

  const style = {
    '--milk-height': `${(fraction * 100).toFixed(2)}%`,
    '--milk-tint': band.tint,
  } as CSSProperties;

  return (
    <div className="milk-tide" style={style}>
      <div className="milk-tide__liquid" aria-hidden="true">
        <div className="milk-tide__surface" />
      </div>
      <p className="milk-tide__caption">
        {showsEnglish() ? (
          <span className="milk-tide__caption-en">
            {band.nameEn} — {percent}% {MILK_COPY.label.en.toLowerCase()}
          </span>
        ) : null}
        {showsCantonese() ? (
          <span className="milk-tide__caption-zh" lang="zh-HK">
            {band.nameYue}——{percent}% {MILK_COPY.label.yue}
          </span>
        ) : null}
        <span className="milk-tide__sr">
          {bilingualText(MILK_COPY.tideLabel(band.nameEn, band.nameYue, percent))}
        </span>
      </p>
    </div>
  );
}
