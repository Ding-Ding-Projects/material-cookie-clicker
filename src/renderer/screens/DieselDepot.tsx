import { useEffect, useState } from 'react';

import { computeRatings, shippableLitres } from '../../shared/game/diesel-factory.js';
import { computeDisclosure } from '../../shared/game/disclosure.js';
import { DieselCanisterIcon } from '../assets/icons.js';
import { showsEnglish, showsCantonese, bilingualText, DIESEL_COPY, FACTORY_COPY } from '../game/copy.js';
import { useFactorySnapshot, useStructureSnapshot } from '../game/GameProvider.js';

/**
 * THE DEPOT STATUS CARD — what is left in the shop rail's footer now that the depot itself has
 * moved.
 *
 * The whole diesel economy lives on its own console surface (FactoryScreen.tsx): the production
 * floor, the equipment shop, the upgrade tree and the shipping station. Leaving a second Ship
 * button down here would give the game two places to do the same irreversible thing, so this
 * card does none of it. It is a status light and a door: how much diesel is in the tanks, how
 * many litres have gone to WinForge, and a button that opens the factory.
 *
 * It renders nothing at all until the Fuel Contract reveal is bought (disclosure.ts).
 */
export function DieselDepot({ onOpenFactory }: { onOpenFactory?: (button: HTMLButtonElement) => void }) {
  const structure = useStructureSnapshot();
  const factory = useFactorySnapshot();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('material-cookie-clicker:diesel-depot:collapsed') === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('material-cookie-clicker:diesel-depot:collapsed', collapsed ? '1' : '0');
    } catch {
      // Storage refusal does not make the card inoperable; it only loses restart persistence.
    }
  }, [collapsed]);

  if (!computeDisclosure(structure).dieselDepot) return null;

  const ratings = computeRatings(factory);
  const ready = shippableLitres(factory);
  const fill = ratings.litreCapacity > 0 ? Math.min(1, factory.litres / ratings.litreCapacity) : 0;
  const fillPercent = Math.round(fill * 100);

  return (
    <section
      className="diesel-depot diesel-depot--status"
      data-collapsed={collapsed || undefined}
      aria-label={bilingualText(DIESEL_COPY.title)}
    >
      <button
        type="button"
        className="diesel-depot__head diesel-depot__toggle"
        aria-expanded={!collapsed}
        aria-controls="diesel-depot-details"
        aria-label={bilingualText(collapsed ? FACTORY_COPY.expandDepot : FACTORY_COPY.collapseDepot)}
        onClick={() => setCollapsed((value) => !value)}
      >
        <span className="diesel-depot__icon" aria-hidden="true">
          <DieselCanisterIcon />
        </span>
        <span className="diesel-depot__names">
          {showsEnglish() ? <span className="diesel-depot__name">{DIESEL_COPY.title.en}</span> : null}
          {showsCantonese() ? <span className="diesel-depot__name-zh">{DIESEL_COPY.title.yue}</span> : null}
        </span>
        <span className="diesel-depot__summary">{factory.litres.toLocaleString('en-US', { maximumFractionDigits: 1 })} L</span>
        <span className="diesel-depot__chevron" aria-hidden="true">⌄</span>
      </button>

      <div id="diesel-depot-details" className="diesel-depot__details" hidden={collapsed}>

      {/* The one live figure worth having on the game surface: how full the tanks are. Drawn as
          a real fill fraction, and stated in words beside it so it is never colour-and-length
          alone that carries the number. */}
      <div
        className="diesel-depot__bar"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={fillPercent}
        aria-label={bilingualText(FACTORY_COPY.tankGaugeLabel(String(fillPercent)))}
      >
        <span className="diesel-depot__bar-fill" style={{ width: `${fillPercent}%` }} />
      </div>

      <dl className="diesel-depot__figures">
        <div className="diesel-depot__figure">
          <dt>{bilingualText(FACTORY_COPY.litresLabel)}</dt>
          <dd className="diesel-depot__count">
            {factory.litres.toLocaleString('en-US', { maximumFractionDigits: 1 })} L
          </dd>
        </div>
        <div className="diesel-depot__figure">
          <dt>{bilingualText(DIESEL_COPY.litresLabel)}</dt>
          <dd className="diesel-depot__count">{structure.dieselDepot.litresMinted} L</dd>
        </div>
      </dl>

      <button
        type="button"
        className="diesel-depot__open"
        aria-label={bilingualText(FACTORY_COPY.openFactory)}
        onClick={(event) => onOpenFactory?.(event.currentTarget)}
      >
        {bilingualText(FACTORY_COPY.openFactory)}
        {ready > 0 ? ` (${ready} L)` : ''}
      </button>

      <p className="diesel-depot__note">{bilingualText(FACTORY_COPY.depotCardHint)}</p>
      </div>
    </section>
  );
}
