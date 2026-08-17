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

  if (!computeDisclosure(structure).dieselDepot) return null;

  const ratings = computeRatings(factory);
  const ready = shippableLitres(factory);
  const fill = ratings.litreCapacity > 0 ? Math.min(1, factory.litres / ratings.litreCapacity) : 0;
  const fillPercent = Math.round(fill * 100);

  return (
    <section className="diesel-depot diesel-depot--status" aria-label={bilingualText(DIESEL_COPY.title)}>
      <header className="diesel-depot__head">
        <span className="diesel-depot__icon" aria-hidden="true">
          <DieselCanisterIcon />
        </span>
        <span className="diesel-depot__names">
          {showsEnglish() ? <span className="diesel-depot__name">{DIESEL_COPY.title.en}</span> : null}
          {showsCantonese() ? <span className="diesel-depot__name-zh">{DIESEL_COPY.title.yue}</span> : null}
        </span>
      </header>

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
    </section>
  );
}
