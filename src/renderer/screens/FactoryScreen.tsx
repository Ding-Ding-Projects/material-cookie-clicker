import { memo, useState } from 'react';

import { bnCompare } from '../../shared/game/big-number.js';
import {
  computeRatings,
  equipmentBulkCost,
  equipmentOwned,
  EQUIPMENT_DEFINITIONS,
  FACTORY_UPGRADE_DEFINITIONS,
  hasAutomation,
  isFactoryUpgradeOffered,
  ownsFactoryUpgrade,
  shippableLitres,
  type DieselFactoryState,
  type EquipmentDefinition,
  type FactoryUpgradeBranch,
  type FactoryUpgradeDefinition,
} from '../../shared/game/diesel-factory.js';
import { DIESEL_LEDGER_DISPLAY_PATH } from '../../shared/game/diesel-exchange.js';
import { formatExact, formatExactDigits } from '../../shared/game/format-number.js';
import { BuyStepper, type BuyQuantity } from '../components/BuyStepper.js';
import { bilingualText, showsCantonese, showsEnglish, DIESEL_COPY, FACTORY_COPY, LIST_COPY } from '../game/copy.js';
import {
  useDieselExchange,
  useFactorySnapshot,
  useFastSnapshot,
  useGameDispatch,
  useStructureSnapshot,
} from '../game/GameProvider.js';
import { DIESEL_TARGET_KEY, usePurchaseFxTarget } from '../game/purchase-fx.js';

/**
 * THE DIESEL FACTORY PANEL — the game inside the game, on its own console surface.
 *
 * Everything the old Diesel Depot footer card did lives here now, plus the entire production
 * economy that makes the litres it ships (src/shared/game/diesel-factory.ts). The panel is laid
 * out as the line itself, left to right: the well, the pipeline, the refining units, the tanks,
 * and the shipping station at the end of it — so a player who has never read a word of this can
 * see which stage has stopped by looking at which stage is dark.
 *
 * WHAT IT WILL NOT DO. It never shows a litre that has not been refined, it never shows a rate
 * the plant is not currently achieving (the RATED figure and the ACHIEVED figure are separate
 * readouts and are labelled as such), and the tank gauges are drawn from the real fill fraction
 * rather than an animation that looks busy. Every figure is printed literally and grouped —
 * a tank level is a physical quantity and "1.2 thousand litres" is not a tank level.
 */

/** Grouped digits, fixed decimals. Physical quantities are small; none of them needs a big number. */
function figure(value: number, decimals = 0): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** A rate needs enough decimals to be non-zero at the bottom of the curve (0.05 barrels/sec). */
function rate(value: number): string {
  if (value === 0) return '0';
  return figure(value, value < 1 ? 3 : 2);
}

function percent(fraction: number): string {
  return figure(Math.min(100, Math.max(0, fraction * 100)), 0);
}

// ------------------------------------------------------------------- the production floor ----

/** One stage of the line, drawn as a lit or dark station with its own live readout. */
function Station({
  name,
  state,
  children,
}: {
  name: { en: string; yue: string };
  /** `running` lights the station, `idle` dims it, `stalled` marks it as stopped on purpose. */
  state: 'running' | 'idle' | 'stalled';
  children: React.ReactNode;
}) {
  return (
    <div className="factory-station" data-state={state}>
      <span className="factory-station__name">
        {showsEnglish() ? <span>{name.en}</span> : null}
        {showsCantonese() ? <span className="factory-station__name-zh">{name.yue}</span> : null}
      </span>
      <div className="factory-station__body">{children}</div>
    </div>
  );
}

/**
 * The pipe between two stations. It animates only while diesel is actually moving through it;
 * `prefers-reduced-motion` stops the dashes dead in CSS and leaves a static, still-legible pipe,
 * so the flow is never the ONLY way the state is communicated (the stations carry it too).
 */
function Pipe({ flowing }: { flowing: boolean }) {
  return <span className="factory-pipe" data-flowing={flowing ? 'true' : undefined} aria-hidden="true" />;
}

/** A real gauge: the fill is the fill fraction, not a decoration. */
function Gauge({
  fraction,
  label,
  variant,
}: {
  fraction: number;
  label: string;
  variant: 'crude' | 'diesel';
}) {
  const clamped = Math.min(1, Math.max(0, fraction));
  return (
    <div
      className="factory-gauge"
      data-variant={variant}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      aria-label={label}
    >
      <span className="factory-gauge__fill" style={{ height: `${clamped * 100}%` }} />
      <span className="factory-gauge__ticks" aria-hidden="true" />
    </div>
  );
}

function ProductionFloor({ factory }: { factory: DieselFactoryState }) {
  const ratings = computeRatings(factory);
  const tankFraction = ratings.litreCapacity > 0 ? factory.litres / ratings.litreCapacity : 0;
  const yardFraction = ratings.crudeCapacity > 0 ? factory.crude / ratings.crudeCapacity : 0;

  const hasIntake = ratings.crudePerSecond > 0;
  const hasRefining = ratings.refiningLitresPerSecond > 0;
  const tanksFull = tankFraction >= 1 - 1e-9;
  const yardFull = yardFraction >= 1 - 1e-9;
  // Starved means the yard cannot keep up with what the columns are rated for — a different
  // problem, with a different fix, from the tanks being full.
  const starved = hasRefining && ratings.crudeDemandPerSecond > ratings.crudePerSecond + 1e-9 && factory.crude <= 1e-9;
  const refiningRunning = hasRefining && !tanksFull && !starved;

  const message = (() => {
    if (!hasIntake && !hasRefining) return FACTORY_COPY.stateIdleNoPlant;
    if (tanksFull && hasRefining) return FACTORY_COPY.stateTanksFull;
    if (hasIntake && !hasRefining) return FACTORY_COPY.stateNoRefining;
    if (starved) return FACTORY_COPY.stateStarvedOfCrude;
    return FACTORY_COPY.stateRunning;
  })();

  // The rate actually being achieved right now, which is the rated throughput only when nothing
  // upstream or downstream is limiting it. Shown beside the rating, never instead of it.
  const achieved = refiningRunning
    ? Math.min(ratings.refiningLitresPerSecond, ratings.crudePerSecond / Math.max(ratings.barrelsPerLitre, 1e-9))
    : 0;

  return (
    <section className="factory-floor" aria-label={bilingualText(FACTORY_COPY.floorTitle)}>
      <h3 className="factory-section__title">{bilingualText(FACTORY_COPY.floorTitle)}</h3>

      <div className="factory-line">
        <Station name={FACTORY_COPY.stageIntake} state={hasIntake ? (yardFull ? 'stalled' : 'running') : 'idle'}>
          <span className="factory-derrick" aria-hidden="true">
            <span className="factory-derrick__beam" />
          </span>
          {/* A bare rate, printed once. It went out as "3.75/s bbl · 3.75/s 桶" before this,
              which is the bilingual helper doing its job on a string that is all digits and a
              unit symbol — two languages of the same number is not a translation, it is a
              rendering bug. The station's NAME above it carries both languages. */}
          <span className="factory-readout">{rate(ratings.crudePerSecond)} bbl/s</span>
        </Station>

        <Pipe flowing={hasIntake && !yardFull} />

        <Station name={FACTORY_COPY.stageRefining} state={hasRefining ? (refiningRunning ? 'running' : 'stalled') : 'idle'}>
          <span className="factory-columns" aria-hidden="true">
            <span className="factory-columns__unit" />
            <span className="factory-columns__unit factory-columns__unit--tall" />
            <span className="factory-columns__unit" />
          </span>
          <span className="factory-readout">{rate(achieved)} / {rate(ratings.refiningLitresPerSecond)} L/s</span>
        </Station>

        <Pipe flowing={refiningRunning} />

        <Station name={FACTORY_COPY.stageStorage} state={tanksFull ? 'stalled' : factory.litres > 0 ? 'running' : 'idle'}>
          <div className="factory-tanks">
            <Gauge
              fraction={yardFraction}
              variant="crude"
              label={bilingualText(FACTORY_COPY.yardGaugeLabel(percent(yardFraction)))}
            />
            <Gauge
              fraction={tankFraction}
              variant="diesel"
              label={bilingualText(FACTORY_COPY.tankGaugeLabel(percent(tankFraction)))}
            />
          </div>
          <span className="factory-readout">
            {figure(factory.litres, 1)} / {figure(ratings.litreCapacity)} L
          </span>
        </Station>
      </div>

      <p className="factory-state" role="status">
        {bilingualText(message)}
        {yardFull && hasIntake ? ` ${bilingualText(FACTORY_COPY.yardFullNote)}` : ''}
      </p>

      <dl className="factory-figures">
        <FactoryFigure label={FACTORY_COPY.crudeLabel} value={`${figure(factory.crude, 1)} / ${figure(ratings.crudeCapacity)} bbl`} />
        <FactoryFigure label={FACTORY_COPY.crudeRate} value={`${rate(ratings.crudePerSecond)} bbl/s`} />
        <FactoryFigure label={FACTORY_COPY.refiningRate} value={`${rate(ratings.refiningLitresPerSecond)} L/s`} />
        <FactoryFigure label={FACTORY_COPY.efficiencyLabel} value={`${figure(ratings.barrelsPerLitre, 3)} bbl`} />
        <FactoryFigure label={FACTORY_COPY.capacityLabel} value={`${figure(ratings.litreCapacity)} L`} />
        <FactoryFigure label={FACTORY_COPY.lifetimeLitres} value={`${figure(factory.lifetimeLitres, 1)} L`} />
      </dl>
    </section>
  );
}

function FactoryFigure({ label, value }: { label: { en: string; yue: string }; value: string }) {
  return (
    <div className="factory-figure">
      <dt>{bilingualText(label)}</dt>
      <dd>{value}</dd>
    </div>
  );
}

// ------------------------------------------------------------------------ the equipment shop ----

/** The affordability leaf, split out so a five-times-a-second tick does not redraw the row. */
const EquipmentBuyButton = memo(function EquipmentBuyButton({
  def,
  owned,
  quantity,
}: {
  def: EquipmentDefinition;
  owned: number;
  quantity: number;
}) {
  const dispatch = useGameDispatch();
  const fast = useFastSnapshot();
  const cost = equipmentBulkCost(def, owned, quantity);
  const affordable = bnCompare(fast.cookies, cost) >= 0;

  return (
    <button
      type="button"
      className="buy-btn"
      disabled={!affordable}
      title={`${def.nameEn} · ${def.nameYue} — 🍪 ${formatExactDigits(cost)}`}
      aria-label={`${FACTORY_COPY.buy.en} ${def.nameEn} · ${FACTORY_COPY.buy.yue}${def.nameYue} — 🍪 ${formatExactDigits(cost)}`}
      onClick={() => dispatch({ type: 'buyFactoryEquipment', equipmentId: def.id, quantity })}
    >
      {bilingualText(FACTORY_COPY.buy)} — 🍪 {formatExact(cost, 'en')}
      {quantity > 1 ? ` (×${quantity})` : ''}
    </button>
  );
});

function EquipmentShop({ factory }: { factory: DieselFactoryState }) {
  const [quantities, setQuantities] = useState<Record<string, BuyQuantity>>({});

  return (
    <section className="factory-shop" aria-label={bilingualText(FACTORY_COPY.shopTitle)}>
      <h3 className="factory-section__title">{bilingualText(FACTORY_COPY.shopTitle)}</h3>
      <div className="factory-shop__list">
        {EQUIPMENT_DEFINITIONS.map((def) => {
          const owned = equipmentOwned(factory, def.id);
          const raw = quantities[def.id] ?? 1;
          // The stepper offers 'max' for generators; the factory floor is a physical place and
          // "buy as many wells as I can afford" is a way to fill it by accident, so this shop
          // takes a whole number and nothing else.
          const quantity = raw === 'max' ? 10 : raw;
          const stepperLabelId = `factory-stepper-${def.id}`;
          return (
            <div className="factory-row" key={def.id} data-role={def.role}>
              <span className="factory-row__role" aria-hidden="true" data-role={def.role} />
              <div className="factory-row__names">
                {showsEnglish() ? <span className="factory-row__name">{def.nameEn}</span> : null}
                {showsCantonese() ? <span className="factory-row__name-zh">{def.nameYue}</span> : null}
                <span className="factory-row__sub">{bilingualText({ en: def.blurbEn, yue: def.blurbYue })}</span>
              </div>
              <span className="factory-row__owned" aria-label={`${FACTORY_COPY.owned.en} ${owned} · ${FACTORY_COPY.owned.yue} ${owned}`}>
                {owned}
              </span>
              <span id={stepperLabelId} style={{ display: 'none' }}>
                {FACTORY_COPY.equipmentQuantity.en} — {def.nameEn} · {def.nameYue}
              </span>
              <div className="factory-row__controls">
                <BuyStepper
                  value={raw}
                  onChange={(q) => setQuantities((prev) => ({ ...prev, [def.id]: q }))}
                  ariaLabelId={stepperLabelId}
                />
                <EquipmentBuyButton def={def} owned={owned} quantity={quantity} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------------- the upgrade tree ----

const BRANCH_LABELS: Readonly<Record<FactoryUpgradeBranch, { en: string; yue: string }>> = {
  throughput: FACTORY_COPY.branchThroughput,
  efficiency: FACTORY_COPY.branchEfficiency,
  capacity: FACTORY_COPY.branchCapacity,
  automation: FACTORY_COPY.branchAutomation,
};

const BRANCH_ORDER: readonly FactoryUpgradeBranch[] = ['throughput', 'efficiency', 'capacity', 'automation'];

function UpgradeCard({ def, factory }: { def: FactoryUpgradeDefinition; factory: DieselFactoryState }) {
  const dispatch = useGameDispatch();
  const fast = useFastSnapshot();
  const owned = ownsFactoryUpgrade(factory, def.id);
  const affordable = bnCompare(fast.cookies, def.cost) >= 0;

  return (
    <div className={`factory-upgrade${owned ? ' factory-upgrade--owned' : ''}`}>
      <div className="factory-upgrade__names">
        {showsEnglish() ? <span className="factory-upgrade__name">{def.nameEn}</span> : null}
        {showsCantonese() ? <span className="factory-upgrade__name-zh">{def.nameYue}</span> : null}
      </div>
      <p className="factory-upgrade__blurb">{bilingualText({ en: def.blurbEn, yue: def.blurbYue })}</p>
      {owned ? (
        <span className="factory-upgrade__chip">{bilingualText(LIST_COPY.owned)}</span>
      ) : (
        <button
          type="button"
          className="buy-btn"
          disabled={!affordable}
          title={`${def.nameEn} · ${def.nameYue} — 🍪 ${formatExactDigits(def.cost)}`}
          aria-label={`${FACTORY_COPY.buy.en} ${def.nameEn} · ${FACTORY_COPY.buy.yue}${def.nameYue} — 🍪 ${formatExactDigits(def.cost)}`}
          onClick={() => dispatch({ type: 'buyFactoryUpgrade', upgradeId: def.id })}
        >
          {bilingualText(FACTORY_COPY.buy)} — 🍪 {formatExact(def.cost, 'en')}
        </button>
      )}
    </div>
  );
}

/**
 * The tree, in four branches. An upgrade whose condition is not met yet is ABSENT rather than
 * dimmed — the same rule the generator ladder follows (disclosure.ts#visibleGeneratorLadder):
 * a card the player cannot act on is not a card, and a locked list is a list of spoilers.
 */
function UpgradeTree({ factory }: { factory: DieselFactoryState }) {
  const offered = FACTORY_UPGRADE_DEFINITIONS.filter(
    (def) => ownsFactoryUpgrade(factory, def.id) || isFactoryUpgradeOffered(factory, def.unlockCondition),
  );

  return (
    <section className="factory-tree" aria-label={bilingualText(FACTORY_COPY.upgradesTitle)}>
      <h3 className="factory-section__title">{bilingualText(FACTORY_COPY.upgradesTitle)}</h3>
      {offered.length === 0 ? (
        <p className="empty-slot">
          <span className="empty-slot__text">{bilingualText(FACTORY_COPY.emptyUpgrades)}</span>
        </p>
      ) : (
        BRANCH_ORDER.map((branch) => {
          const inBranch = offered.filter((def) => def.branch === branch);
          if (inBranch.length === 0) return null;
          return (
            <div className="factory-branch" key={branch} data-branch={branch}>
              <h4 className="factory-branch__title">{bilingualText(BRANCH_LABELS[branch])}</h4>
              <div className="factory-branch__cards">
                {inBranch.map((def) => (
                  <UpgradeCard key={def.id} def={def} factory={factory} />
                ))}
              </div>
            </div>
          );
        })
      )}
    </section>
  );
}

// ---------------------------------------------------------------------- the shipping station ----

/**
 * Where the two applications meet. This is the ONLY control in the game that writes to the
 * shared ledger, and it is now a withdrawal from a tank rather than a purchase: the button is
 * dead when the tanks do not hold a whole litre, and it says why rather than dimming silently.
 */
function ShippingStation({ factory }: { factory: DieselFactoryState }) {
  const dispatch = useGameDispatch();
  const exchange = useDieselExchange();
  const depot = useStructureSnapshot().dieselDepot;
  const fxRef = usePurchaseFxTarget<HTMLElement>(DIESEL_TARGET_KEY);
  const ratings = computeRatings(factory);
  const available = shippableLitres(factory);
  const automationOwned = hasAutomation(factory);

  const consumedText =
    exchange.summary && exchange.summary.consumedCount > 0
      ? String(exchange.summary.consumedCount)
      : bilingualText(DIESEL_COPY.consumedNone);

  return (
    <section ref={fxRef} className="factory-station-card" aria-label={bilingualText(FACTORY_COPY.stationTitle)}>
      <h3 className="factory-section__title">{bilingualText(FACTORY_COPY.stationTitle)}</h3>

      <button
        type="button"
        className="factory-ship"
        disabled={available <= 0}
        aria-label={bilingualText(FACTORY_COPY.shipButton(available))}
        onClick={() => dispatch({ type: 'mintDiesel', litres: available })}
      >
        {bilingualText(FACTORY_COPY.shipButton(available))}
      </button>

      {available <= 0 ? <p className="factory-note">{bilingualText(FACTORY_COPY.shipNothing)}</p> : null}
      <p className="factory-note">{bilingualText(FACTORY_COPY.shipNote)}</p>

      <div className="factory-auto">
        <label className="factory-auto__switch">
          <input
            type="checkbox"
            checked={factory.autoShipEnabled}
            disabled={!automationOwned}
            onChange={(event) => dispatch({ type: 'setFactoryAutoShip', enabled: event.currentTarget.checked })}
          />
          <span>{bilingualText(FACTORY_COPY.autoShipLabel)}</span>
        </label>
        <p className="factory-note">
          {automationOwned
            ? bilingualText(FACTORY_COPY.autoShipAt(percent(ratings.autoShipAtFraction ?? autoFractionIfOff(factory))))
            : bilingualText(FACTORY_COPY.autoShipLocked)}
        </p>
      </div>

      {/* Three figures that answer three different questions, and are never merged. What is in
          the tank ready to go is the GAME's number; the voucher count is the LEDGER FILE's; and
          the consumed count is WinForge's, which this application only ever reads. An earlier
          version of this block printed "2 L ready" under a label reading "Litres shipped",
          which is two of those questions answered with one wrong number. */}
      <dl className="factory-figures">
        <FactoryFigure label={FACTORY_COPY.readyLabel} value={`${figure(available)} L`} />
        <FactoryFigure label={FACTORY_COPY.shippedLabel} value={`${figure(depot.litresMinted)} L`} />
        <FactoryFigure
          label={DIESEL_COPY.vouchersLabel}
          value={String(exchange.summary?.voucherCount ?? depot.vouchersMinted)}
        />
        <FactoryFigure label={DIESEL_COPY.consumedLabel} value={consumedText} />
      </dl>

      <p className="factory-note">{bilingualText(FACTORY_COPY.amortizedNote)}</p>
      <p className="factory-note">{bilingualText(DIESEL_COPY.handoffNote)}</p>

      {exchange.error ? (
        <p className="factory-note factory-note--problem" role="status">
          {bilingualText(exchange.error)}
        </p>
      ) : null}
      {!exchange.bridgeAvailable ? (
        <p className="factory-note factory-note--problem">{bilingualText(DIESEL_COPY.noBridge)}</p>
      ) : null}
      <p className="factory-path">{DIESEL_COPY.ledgerAt(exchange.ledgerPath ?? DIESEL_LEDGER_DISPLAY_PATH).en}</p>
    </section>
  );
}

/** The threshold the owned automation WOULD use, for the caption shown while the switch is off. */
function autoFractionIfOff(factory: DieselFactoryState): number {
  return computeRatings({ ...factory, autoShipEnabled: true }).autoShipAtFraction ?? 1;
}

// -------------------------------------------------------------------------------- the panel ----

export function FactoryScreen() {
  const factory = useFactorySnapshot();

  return (
    <div className="factory-screen">
      <p className="factory-lede">{bilingualText(FACTORY_COPY.subtitle)}</p>
      <ProductionFloor factory={factory} />
      <ShippingStation factory={factory} />
      <EquipmentShop factory={factory} />
      <UpgradeTree factory={factory} />
    </div>
  );
}
