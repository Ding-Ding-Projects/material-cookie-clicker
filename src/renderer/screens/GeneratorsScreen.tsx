import { memo, useMemo, useState } from 'react';

import { bnCompare, bnMulScalar } from '../../shared/game/big-number.js';
import { formatBigNum } from '../../shared/game/format-number.js';
import { costOfBulk, GENERATOR_DEFINITIONS, generatorCps, maxAffordable, type GeneratorDefinition } from '../../shared/game/generators.js';
import { totalBuyMaxDiscount } from '../../shared/game/tools.js';
import { BuyStepper, type BuyQuantity } from '../components/BuyStepper.js';
import { BulkToolbar } from '../components/BulkToolbar.js';
import { createSearchState, SearchWithRegexBuilder } from '../components/SearchWithRegexBuilder.js';
import { useSelection } from '../components/useSelection.js';
import { matchesSearch } from '../game/local-regex-search.js';
import { BULK_COPY, LIST_COPY } from '../game/copy.js';
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
    <div className={`building-row${unlocked ? '' : ' locked'}${owned > 0 ? ' owned' : ''}`}>
      <input
        type="checkbox"
        className="select-checkbox"
        checked={selected}
        onChange={onToggleSelect}
        aria-label={`Select ${def.nameEn} · 選取${def.nameYue}`}
      />
      <div className="building-row__icon" aria-hidden="true">
        🏭
      </div>
      <div className="building-row__names">
        <span className="building-row__name-en">{def.nameEn}</span>
        <span className="building-row__name-zh">{def.nameYue}</span>
        <div className="building-row__meta">
          {unlocked ? (
            <>
              <span className="owned-chip">
                {LIST_COPY.owned.en} {owned} · {LIST_COPY.owned.yue} {owned}
              </span>
              <span>+{formatBigNum(generatorCps(def, 1), 'en')} CPS each · 每個 +{formatBigNum(generatorCps(def, 1), 'en')} 產量</span>
            </>
          ) : (
            <span>Unlocks after buying its previous tier · 買咗上一層先會出現</span>
          )}
        </div>
      </div>
      <span id={stepperLabelId} style={{ display: 'none' }}>
        Buy quantity for {def.nameEn} · {def.nameYue}購買數量
      </span>
      <BuyStepper value={quantity} onChange={onQuantityChange} disabled={!unlocked} ariaLabelId={stepperLabelId} />
      <GeneratorBuyButton def={def} owned={owned} quantity={quantity} unlocked={unlocked} />
    </div>
  );
});

export function GeneratorsScreen() {
  const dispatch = useGameDispatch();
  const structure = useStructureSnapshot();
  const [search, setSearch] = useState(createSearchState());
  const [quantities, setQuantities] = useState<Record<string, BuyQuantity>>({});
  const selection = useSelection();
  const [busy, setBusy] = useState(false);
  const [resultText, setResultText] = useState<string | null>(null);

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
    setResultText(`✅ ${bought} bought, ⚠️ ${skipped} skipped · 買咗 ${bought} 項，跳過 ${skipped} 項`);
    setBusy(false);
  }

  return (
    <div className="screen">
      <h1>
        Generators<span className="screen-title-zh">生產建築</span>
      </h1>
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
        <div>
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
    </div>
  );
}
