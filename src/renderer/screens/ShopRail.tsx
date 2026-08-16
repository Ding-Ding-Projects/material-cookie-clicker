import { memo, useMemo, useState, type ReactNode } from 'react';

import { bnCompare, bnMulScalar } from '../../shared/game/big-number.js';
import { formatBigNum } from '../../shared/game/format-number.js';
import { costOfBulk, GENERATOR_DEFINITIONS, generatorCps, maxAffordable, type GeneratorDefinition } from '../../shared/game/generators.js';
import { totalBuyMaxDiscount } from '../../shared/game/tools.js';
import { GeneratorIcon } from '../assets/icons.js';
import { BuyStepper, type BuyQuantity } from '../components/BuyStepper.js';
import { BulkToolbar } from '../components/BulkToolbar.js';
import { createSearchState, SearchWithRegexBuilder } from '../components/SearchWithRegexBuilder.js';
import { useSelection } from '../components/useSelection.js';
import { matchesSearch } from '../game/local-regex-search.js';
import { BULK_COPY, GAME_SURFACE_COPY, LIST_COPY } from '../game/copy.js';
import { useFastSnapshot, useGameDispatch, useStructureSnapshot } from '../game/GameProvider.js';

/** The tiny leaf that actually depends on live cookies: cost text + the buy button's
 *  enabled/disabled state. Subscribing to the fast slice HERE, rather than in the row or the
 *  screen, is what keeps a cookie tick from re-rendering the other 13 rows' icons/names/steppers. */
const GeneratorBuyButton = memo(function GeneratorBuyButton({
  def,
  owned,
  quantity,
  unlocked,
}: {
  def: GeneratorDefinition;
  owned: number;
  quantity: BuyQuantity;
  unlocked: boolean;
}) {
  const dispatch = useGameDispatch();
  const fast = useFastSnapshot();
  const structure = useStructureSnapshot();

  const discount = totalBuyMaxDiscount(structure);
  const requestedQuantity =
    quantity === 'max' ? maxAffordable(def, owned, discount > 0 ? bnMulScalar(fast.cookies, 1 / (1 - discount)) : fast.cookies) : quantity;
  const rawCost = costOfBulk(def, owned, requestedQuantity);
  const finalCost = discount > 0 ? bnMulScalar(rawCost, 1 - discount) : rawCost;
  const affordable = requestedQuantity > 0 && bnCompare(fast.cookies, finalCost) >= 0;

  if (!unlocked) {
    return (
      <button type="button" className="buy-btn" disabled>
        {LIST_COPY.locked.en} · {LIST_COPY.locked.yue}
      </button>
    );
  }

  return (
    <button
      type="button"
      className="buy-btn"
      disabled={!affordable || requestedQuantity <= 0}
      onClick={() => dispatch({ type: 'buyGeneratorBulk', generatorId: def.id, quantity })}
    >
      {LIST_COPY.buy.en} · {LIST_COPY.buy.yue} — 🍪 {formatBigNum(finalCost, 'en')}
      {quantity === 'max' && requestedQuantity > 0 ? ` (×${requestedQuantity})` : ''}
    </button>
  );
});

const GeneratorRow = memo(function GeneratorRow({
  def,
  owned,
  unlocked,
  quantity,
  onQuantityChange,
  selected,
  onToggleSelect,
}: {
  def: GeneratorDefinition;
  owned: number;
  unlocked: boolean;
  quantity: BuyQuantity;
  onQuantityChange: (q: BuyQuantity) => void;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const stepperLabelId = `stepper-label-${def.id}`;
  return (
    <div className={`shop-row${unlocked ? '' : ' locked'}${owned > 0 ? ' owned' : ''}`}>
      <input
        type="checkbox"
        className="select-checkbox"
        checked={selected}
        onChange={onToggleSelect}
        aria-label={`Select ${def.nameEn} · 選取${def.nameYue}`}
      />
      <div className="shop-row__icon" aria-hidden="true">
        <GeneratorIcon id={def.id} />
      </div>
      <div className="shop-row__names">
        <span className="shop-row__name">{def.nameEn}</span>
        <span className="shop-row__name-zh">{def.nameYue}</span>
        <span className="shop-row__sub">
          {unlocked
            ? `+${formatBigNum(generatorCps(def, 1), 'en')}/sec each · 每個 +${formatBigNum(generatorCps(def, 1), 'en')}`
            : 'Buy the previous tier first · 買咗上一層先會出現'}
        </span>
      </div>
      <span className="shop-row__owned" aria-label={`${LIST_COPY.owned.en} ${owned} · ${LIST_COPY.owned.yue} ${owned}`}>
        {owned}
      </span>
      <span id={stepperLabelId} style={{ display: 'none' }}>
        Buy quantity for {def.nameEn} · {def.nameYue}購買數量
      </span>
      <div className="shop-row__controls">
        <BuyStepper value={quantity} onChange={onQuantityChange} disabled={!unlocked} ariaLabelId={stepperLabelId} />
        <GeneratorBuyButton def={def} owned={owned} quantity={quantity} unlocked={unlocked} />
      </div>
    </div>
  );
});

/**
 * The generator shop, docked to the cookie as a rail on the single game surface (never its own
 * page). Buying here does not move the player away from the cookie: the rail scrolls inside
 * itself, and below ~900px it becomes a bottom drawer on the same surface.
 *
 * The search field, multi-select and bulk-buy toolbar are carried over unchanged — they were
 * working affordances of the old screen and none of them is part of a route.
 */
export function ShopRail() {
  const dispatch = useGameDispatch();
  const structure = useStructureSnapshot();
  const [search, setSearch] = useState(createSearchState());
  const [quantities, setQuantities] = useState<Record<string, BuyQuantity>>({});
  const selection = useSelection();
  const [busy, setBusy] = useState(false);
  const [resultText, setResultText] = useState<ReactNode | null>(null);

  const ownedById = useMemo(() => {
    const map = new Map<string, number>();
    for (const g of structure.generators) map.set(g.id, g.count);
    return map;
  }, [structure.generators]);

  // A generator tier unlocks once the previous tier has at least one unit owned; the first
  // tier is always unlocked. This is purely a display/reachability convenience — the reducer
  // itself already refuses an unaffordable purchase, this just avoids showing tier 9 as
  // "buyable" before tier 8 exists.
  const rows = GENERATOR_DEFINITIONS.map((def, index) => {
    const previous = GENERATOR_DEFINITIONS[index - 1];
    const unlocked = index === 0 || (previous ? (ownedById.get(previous.id) ?? 0) > 0 : true);
    return { def, owned: ownedById.get(def.id) ?? 0, unlocked };
  });

  const visibleRows = rows.filter((row) => matchesSearch(`${row.def.nameEn} ${row.def.nameYue}`, search));

  async function runBulkBuy(): Promise<void> {
    setBusy(true);
    let bought = 0;
    let skipped = 0;
    for (const id of selection.ids) {
      const row = rows.find((r) => r.def.id === id);
      if (!row || !row.unlocked) {
        skipped += 1;
        continue;
      }
      const before = row.owned;
      const next = dispatch({ type: 'buyGeneratorBulk', generatorId: id, quantity: quantities[id] ?? 1 });
      const after = next.generators.find((g) => g.id === id)?.count ?? before;
      if (after > before) bought += 1;
      else skipped += 1;
    }
    // Drawn status marks, not stock OS emoji: each mark carries its own glyph (a tick, a bang)
    // AND its own colour role, so the two outcomes are never distinguished by colour alone.
    setResultText(
      <>
        <span className="bulk-status bulk-status--ok">
          <span className="bulk-status__mark" aria-hidden="true">
            ✓
          </span>
          {bought} {BULK_COPY.bulkBought.en} · {BULK_COPY.bulkBought.yue}
        </span>
        <span className="bulk-status bulk-status--skipped">
          <span className="bulk-status__mark" aria-hidden="true">
            !
          </span>
          {skipped} {BULK_COPY.bulkSkipped.en} · {BULK_COPY.bulkSkipped.yue}
        </span>
      </>,
    );
    setBusy(false);
  }

  return (
    <section className="panel shop-rail" aria-label={`${GAME_SURFACE_COPY.shopDrawerLabel.en} · ${GAME_SURFACE_COPY.shopDrawerLabel.yue}`}>
      <h2 className="panel__title">
        <span>{GAME_SURFACE_COPY.shopTitle.en}</span>
        <span className="panel__title-zh">{GAME_SURFACE_COPY.shopTitle.yue}</span>
      </h2>
      <SearchWithRegexBuilder
        idPrefix="generators-search"
        state={search}
        onChange={setSearch}
        placeholder={LIST_COPY.searchPlaceholderGenerators}
        ariaLabel={LIST_COPY.searchPlaceholderGenerators}
      />
      <BulkToolbar
        selectedCount={selection.ids.size}
        matchingCount={visibleRows.length}
        onSelectAllMatching={() => selection.selectAll(visibleRows.map((r) => r.def.id))}
        onClearSelection={() => {
          selection.clear();
          setResultText(null);
        }}
        busy={busy}
        resultText={resultText}
        actions={[
          {
            key: 'buy',
            label: `${BULK_COPY.buySelected(selection.ids.size).en} · ${BULK_COPY.buySelected(selection.ids.size).yue}`,
            onRun: () => void runBulkBuy(),
          },
        ]}
      />
      {visibleRows.length === 0 ? (
        <p>
          {LIST_COPY.noResults.en} · {LIST_COPY.noResults.yue}
        </p>
      ) : (
        <div className="shop-rail__list">
          {visibleRows.map((row) => (
            <GeneratorRow
              key={row.def.id}
              def={row.def}
              owned={row.owned}
              unlocked={row.unlocked}
              quantity={quantities[row.def.id] ?? 1}
              onQuantityChange={(q) => setQuantities((prev) => ({ ...prev, [row.def.id]: q }))}
              selected={selection.has(row.def.id)}
              onToggleSelect={() => selection.toggle(row.def.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
