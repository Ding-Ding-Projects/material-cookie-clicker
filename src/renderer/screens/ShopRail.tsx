import { memo, useMemo, useState, type ReactNode } from 'react';

import { bnCompare, bnMulScalar } from '../../shared/game/big-number.js';
import { formatBigNum, formatExact, formatExactDigits } from '../../shared/game/format-number.js';
import { costOfBulk, generatorCps, getGeneratorDefinition, maxAffordable, type GeneratorDefinition } from '../../shared/game/generators.js';
import { visibleGeneratorLadder } from '../../shared/game/disclosure.js';
import { totalBuyMaxDiscount } from '../../shared/game/tools.js';
import { GeneratorIcon } from '../assets/icons.js';
import { BuyStepper, type BuyQuantity } from '../components/BuyStepper.js';
import { BulkToolbar } from '../components/BulkToolbar.js';
import { createSearchState, SearchWithRegexBuilder } from '../components/SearchWithRegexBuilder.js';
import { CoinSlot, useControlRung } from '../components/CoinSlot.js';
import { useSelection } from '../components/useSelection.js';
import { matchesSearch } from '../game/local-regex-search.js';
import { DieselDepot } from './DieselDepot.js';
import { showsEnglish, showsCantonese, bilingualText, BULK_COPY, DISCLOSURE_COPY, GAME_SURFACE_COPY, LIST_COPY } from '../game/copy.js';
import { useFastSnapshot, useGameDispatch, useStructureSnapshot } from '../game/GameProvider.js';
import { generatorTargetKey, usePurchaseFxTarget } from '../game/purchase-fx.js';

/** The tiny leaf that actually depends on live cookies: cost text + the buy button's
 *  enabled/disabled state. Subscribing to the fast slice HERE, rather than in the row or the
 *  screen, is what keeps a cookie tick from re-rendering the other 13 rows' icons/names/steppers. */
const GeneratorBuyButton = memo(function GeneratorBuyButton({
  def,
  owned,
  quantity,
}: {
  def: GeneratorDefinition;
  owned: number;
  quantity: BuyQuantity;
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

  // There is no locked-tier branch here any more. A tier the player cannot buy yet is not
  // dimmed on this list — it is not on this list at all (see disclosure.ts#
  // visibleGeneratorLadder and MysteryRow below), so every row that renders is a real buy.
  // A price is the exact number of cookies that will leave the account, so it is printed
  // exactly — grouped digits, never "1.1 thousand". The full figure is in the title too, for
  // the rare value past the literal threshold where the face falls back to the compact form.
  return (
    <button
      type="button"
      className="buy-btn"
      disabled={!affordable || requestedQuantity <= 0}
      onClick={() => dispatch({ type: 'buyGeneratorBulk', generatorId: def.id, quantity })}
      title={`${def.nameEn} · ${def.nameYue} — 🍪 ${formatExactDigits(finalCost)}`}
      aria-label={`${LIST_COPY.buy.en} ${def.nameEn} · ${LIST_COPY.buy.yue}${def.nameYue} — 🍪 ${formatExactDigits(finalCost)}`}
    >
      {bilingualText(LIST_COPY.buy)} — 🍪 {formatExact(finalCost, 'en')}
      {quantity === 'max' && requestedQuantity > 0 ? ` (×${requestedQuantity})` : ''}
    </button>
  );
});

/**
 * The unnamed rung at the bottom of the ladder (see disclosure.ts#visibleGeneratorLadder). It
 * exists to say "there is more" and nothing else: no name, no icon, no price, no checkbox and
 * no stepper — it is not a control, so it is not a focus stop, not a bulk-select target and not
 * a search hit. Buying the tier above it turns it into a real, named row.
 */
function MysteryRow() {
  return (
    <div className="shop-row locked shop-row--mystery">
      <div className="shop-row__icon" aria-hidden="true">
        <span className="shop-row__lock-emblem">🔒</span>
      </div>
      <div className="shop-row__names">
        <span className="shop-row__name">{DISCLOSURE_COPY.ladderMysteryName.en}</span>
        <span className="shop-row__sub">
          {bilingualText(DISCLOSURE_COPY.ladderMysteryHint)}
        </span>
      </div>
    </div>
  );
}

const GeneratorRow = memo(function GeneratorRow({
  def,
  owned,
  quantity,
  onQuantityChange,
  selected,
  onToggleSelect,
  selectable,
}: {
  def: GeneratorDefinition;
  owned: number;
  quantity: BuyQuantity;
  onQuantityChange: (q: BuyQuantity) => void;
  selected: boolean;
  onToggleSelect: () => void;
  /** Whether the bulk-selection control (control-unlocks.ts, "bulk.select") has been bought. */
  selectable: boolean;
}) {
  const stepperLabelId = `stepper-label-${def.id}`;
  // The row is the purchase-feedback target: a successful buy bounces it, rolls the owned
  // count and wiggles the icon. Registering the element is all this component does about it —
  // the animation is started by the fx layer from the reducer's own state diff, never here.
  const fxRef = usePurchaseFxTarget<HTMLDivElement>(generatorTargetKey(def.id));
  const rate = formatBigNum(generatorCps(def, 1), 'en');
  const rateLine = `+${rate}/sec each · 每個 +${rate}`;
  return (
    // `shop-row--selectable` is not decoration: the row's grid has a leading column FOR the
    // checkbox, and until the bulk-select rung is bought there is no checkbox to put in it. The
    // class is what tells the grid whether that column exists — without it every cell shifted one
    // track to the left, the names landed in the 34px icon track, and "Cursor" wrapped one
    // character per line while the owned count sat in the 1fr track doing nothing with it.
    <div ref={fxRef} className={`shop-row${selectable ? ' shop-row--selectable' : ''}${owned > 0 ? ' owned' : ''}`}>
      {/* The row checkbox is bought once, for every row at once — so only the FIRST row carries
          the price plate (see the list below), and every other locked row simply has no
          checkbox. Fourteen identical price tags down one rail would be noise, not an offer. */}
      {selectable ? (
        <input
          type="checkbox"
          className="select-checkbox"
          checked={selected}
          onChange={onToggleSelect}
          aria-label={`Select ${def.nameEn} · 選取${def.nameYue}`}
        />
      ) : null}
      <div className="shop-row__icon" aria-hidden="true">
        <GeneratorIcon id={def.id} />
      </div>
      {/* Each line is ONE line: the rail is a fixed-width column, and a name that wrapped
          vertically down it was unreadable. The lines ellipsize instead, and the whole plate
          carries the untruncated text in `title` — the buy button's aria-label already names the
          generator in full, so nothing accessible is lost to the ellipsis. */}
      <div className="shop-row__names" title={`${def.nameEn} · ${def.nameYue} — ${rateLine}`}>
        {showsEnglish() ? <span className="shop-row__name">{def.nameEn}</span> : null}
        {showsCantonese() ? <span className="shop-row__name-zh">{def.nameYue}</span> : null}
        <span className="shop-row__sub">{rateLine}</span>
      </div>
      <span className="shop-row__owned" aria-label={`${LIST_COPY.owned.en} ${owned} · ${LIST_COPY.owned.yue} ${owned}`}>
        {owned}
      </span>
      <span id={stepperLabelId} style={{ display: 'none' }}>
        Buy quantity for {def.nameEn} · {def.nameYue}購買數量
      </span>
      <div className="shop-row__controls">
        <BuyStepper value={quantity} onChange={onQuantityChange} ariaLabelId={stepperLabelId} />
        <GeneratorBuyButton def={def} owned={owned} quantity={quantity} />
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
export function ShopRail({ onOpenFactory }: { onOpenFactory?: (button: HTMLButtonElement) => void }) {
  const dispatch = useGameDispatch();
  const structure = useStructureSnapshot();
  const [search, setSearch] = useState(createSearchState());
  const [quantities, setQuantities] = useState<Record<string, BuyQuantity>>({});
  const selection = useSelection();
  const [busy, setBusy] = useState(false);
  // Below ~900px the CSS turns this rail into a bottom-sheet drawer; the handle is what taps it
  // down and back up. At rail width the handle is hidden and the body is always shown.
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [resultText, setResultText] = useState<ReactNode | null>(null);
  // The two rungs of the bulk ladder (control-unlocks.ts): the checkboxes, then the toolbar.
  const bulkSelectable = useControlRung('bulk.select');
  const bulkToolbar = useControlRung('bulk.toolbar');

  const ownedById = useMemo(() => {
    const map = new Map<string, number>();
    for (const g of structure.generators) map.set(g.id, g.count);
    return map;
  }, [structure.generators]);

  // Progressive disclosure of the ladder itself (disclosure.ts#visibleGeneratorLadder): the
  // tiers the player owns, the one tier they can buy next, and a single unnamed rung after
  // that. Everything deeper is ABSENT — not dimmed, not named, not findable — so each purchase
  // reveals exactly one new row and the ladder's depth stays something to discover.
  const ladder = visibleGeneratorLadder(structure);
  const rows = ladder
    .filter((row) => row.state === 'available')
    .map((row) => {
      const def = getGeneratorDefinition(row.id);
      return { def, owned: ownedById.get(def.id) ?? 0 };
    });
  const hasMysteryRow = ladder.some((row) => row.state === 'mystery');

  // Search matches only rows the player can already see. A hidden tier stays hidden: it must
  // not become findable by typing its name, which would leak the very ladder being revealed.
  const visibleRows = rows.filter((row) => matchesSearch(`${row.def.nameEn} ${row.def.nameYue}`, search));
  // The unnamed rung has no name to match against, so any active search filters it out too.
  const showMysteryRow = hasMysteryRow && visibleRows.length === rows.length;

  async function runBulkBuy(): Promise<void> {
    setBusy(true);
    let bought = 0;
    let skipped = 0;
    for (const id of selection.ids) {
      const row = rows.find((r) => r.def.id === id);
      if (!row) {
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
          {bought} {bilingualText(BULK_COPY.bulkBought)}
        </span>
        <span className="bulk-status bulk-status--skipped">
          <span className="bulk-status__mark" aria-hidden="true">
            !
          </span>
          {skipped} {bilingualText(BULK_COPY.bulkSkipped)}
        </span>
      </>,
    );
    setBusy(false);
  }

  return (
    <section
      className={`panel shop-rail${drawerOpen ? '' : ' collapsed'}`}
      aria-label={bilingualText(GAME_SURFACE_COPY.shopDrawerLabel)}
    >
      <button
        type="button"
        className="shop-rail__handle"
        aria-expanded={drawerOpen}
        aria-controls="shop-rail-body"
        aria-label={
          drawerOpen
            ? 'Close the generator shop drawer · 收埋生產器商店抽屜'
            : 'Open the generator shop drawer · 打開生產器商店抽屜'
        }
        onClick={() => setDrawerOpen((open) => !open)}
      />
      <h2 className="panel__title">
        <span>{GAME_SURFACE_COPY.shopTitle.en}</span>
        <span className="panel__title-zh">{GAME_SURFACE_COPY.shopTitle.yue}</span>
      </h2>
      <div className="shop-rail__body" id="shop-rail-body">
        <SearchWithRegexBuilder
          idPrefix="generators-search"
          state={search}
          onChange={setSearch}
          placeholder={LIST_COPY.searchPlaceholderGenerators}
          ariaLabel={LIST_COPY.searchPlaceholderGenerators}
          controlId="search.generators"
        />
        {/* The bulk ladder's own doors, in order. The checkbox plate stands where the first
            row's checkbox would be; the toolbar plate stands where the toolbar would be, and is
            only offered once there is something to select with. */}
        {!bulkSelectable ? <CoinSlot rungId="bulk.select" className="shop-rail__bulk-slot" /> : null}
        {bulkSelectable && !bulkToolbar ? (
          <CoinSlot rungId="bulk.toolbar" className="shop-rail__bulk-slot" />
        ) : null}
        {bulkToolbar ? (
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
              label: `${bilingualText(BULK_COPY.buySelected(selection.ids.size))}`,
              onRun: () => void runBulkBuy(),
            },
          ]}
        />
        ) : null}
        {visibleRows.length === 0 ? (
          <p className="empty-slot">
            <span className="empty-slot__key">No results · 冇結果</span>
            <span className="empty-slot__text">
              {LIST_COPY.noResults.en} {LIST_COPY.noResults.yue}
            </span>
          </p>
        ) : (
          <div className="shop-rail__list">
            {visibleRows.map((row) => (
              <GeneratorRow
                key={row.def.id}
                def={row.def}
                owned={row.owned}
                quantity={quantities[row.def.id] ?? 1}
                onQuantityChange={(q) => setQuantities((prev) => ({ ...prev, [row.def.id]: q }))}
                selected={selection.has(row.def.id)}
                onToggleSelect={() => selection.toggle(row.def.id)}
                selectable={bulkSelectable}
              />
            ))}
            {showMysteryRow ? <MysteryRow /> : null}
          </div>
        )}
        {/* The rail's footer. The depot is not a generator tier, so it sits below the ladder and
            outside the search field's reach rather than pretending to be a row. It renders
            nothing at all until the Fuel Contract reveal is bought. */}
        <DieselDepot onOpenFactory={onOpenFactory} />
      </div>
    </section>
  );
}
