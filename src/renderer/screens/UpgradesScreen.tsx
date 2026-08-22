import { memo, useMemo, useState } from 'react';

import { bnCompare } from '../../shared/game/big-number.js';
import { formatBigNum } from '../../shared/game/format-number.js';
import { getGeneratorDefinition } from '../../shared/game/generators.js';
import { isUpgradeUnlocked, UPGRADE_DEFINITIONS, type UpgradeDefinition } from '../../shared/game/upgrades.js';
import { BulkToolbar } from '../components/BulkToolbar.js';
import { createSearchState, SearchWithRegexBuilder } from '../components/SearchWithRegexBuilder.js';
import { matchesSearch } from '../game/local-regex-search.js';
import { useSelection } from '../components/useSelection.js';
import { BULK_COPY, LIST_COPY, type Bilingual } from '../game/copy.js';
import { upgradeEmoji } from '../game/emoji.js';
import { useFastSnapshot, useGameDispatch, useStructureSnapshot } from '../game/GameProvider.js';

/** A short, honest one-line effect description — the same shape tool-view-model.ts uses for tools. */
function describeUpgradeEffect(def: UpgradeDefinition): Bilingual {
  switch (def.effect.kind) {
    case 'clickMultiplier':
      return { en: `Click power ×${def.effect.multiplier}`, yue: `每擊力量 ×${def.effect.multiplier}` };
    case 'globalCpsMultiplier':
      return { en: `Global CPS ×${def.effect.multiplier}`, yue: `全局產量 ×${def.effect.multiplier}` };
    case 'generatorMultiplier': {
      const genDef = getGeneratorDefinition(def.effect.generatorId);
      return { en: `${genDef.nameEn} output ×${def.effect.multiplier}`, yue: `${genDef.nameYue}產量 ×${def.effect.multiplier}` };
    }
  }
}

function describeUnlockProgress(def: UpgradeDefinition, ownedByGenerator: Map<string, number>): Bilingual | null {
  if (def.unlockCondition.kind === 'always') return null;
  if (def.unlockCondition.kind === 'generatorOwned') {
    const genDef = getGeneratorDefinition(def.unlockCondition.generatorId);
    const owned = ownedByGenerator.get(def.unlockCondition.generatorId) ?? 0;
    const current = Math.min(owned, def.unlockCondition.atLeast);
    return { en: `${current} / ${def.unlockCondition.atLeast} ${genDef.nameEn}`, yue: `${current} / ${def.unlockCondition.atLeast} 個${genDef.nameYue}` };
  }
  return null;
}

const UpgradeBuyButton = memo(function UpgradeBuyButton({
  def,
  owned,
  unlocked,
}: {
  def: UpgradeDefinition;
  owned: boolean;
  unlocked: boolean;
}) {
  const dispatch = useGameDispatch();
  const fast = useFastSnapshot();
  const affordable = bnCompare(fast.cookies, def.cost) >= 0;

  if (owned) {
    return (
      <button type="button" className="item-card__buy" disabled>
        {LIST_COPY.alreadyOwned.en} · {LIST_COPY.alreadyOwned.yue}
      </button>
    );
  }
  if (!unlocked) {
    return (
      <button type="button" className="item-card__buy" disabled>
        {LIST_COPY.locked.en} · {LIST_COPY.locked.yue}
      </button>
    );
  }
  return (
    <button
      type="button"
      className="item-card__buy"
      disabled={!affordable}
      onClick={() => dispatch({ type: 'buyUpgrade', upgradeId: def.id })}
    >
      {LIST_COPY.buy.en} · {LIST_COPY.buy.yue} — 🍪 {formatBigNum(def.cost, 'en')}
    </button>
  );
});

const UpgradeCard = memo(function UpgradeCard({
  def,
  owned,
  unlocked,
  progress,
  selected,
  onToggleSelect,
}: {
  def: UpgradeDefinition;
  owned: boolean;
  unlocked: boolean;
  progress: Bilingual | null;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const stateClass = owned ? 'owned' : unlocked ? '' : 'locked';
  const effect = describeUpgradeEffect(def);
  return (
    <div className={`item-card${stateClass ? ` ${stateClass}` : ''}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="checkbox"
          className="select-checkbox"
          checked={selected}
          onChange={onToggleSelect}
          aria-label={`Select ${def.nameEn} · 選取${def.nameYue}`}
        />
        {owned && (
          <span className="item-card__badge">
            {LIST_COPY.alreadyOwned.en} · {LIST_COPY.alreadyOwned.yue}
          </span>
        )}
      </div>
      <div className="item-card__icon" aria-hidden="true">
        {upgradeEmoji(def)}
      </div>
      <div className="item-card__name-en">{def.nameEn}</div>
      <div className="item-card__name-zh">{def.nameYue}</div>
      <div className="item-card__desc">
        {effect.en} · {effect.yue}
      </div>
      {!owned && progress && (
        <div className="item-card__progress-line">
          {progress.en} · {progress.yue}
        </div>
      )}
      <UpgradeBuyButton def={def} owned={owned} unlocked={unlocked} />
    </div>
  );
});

export function UpgradesScreen() {
  const dispatch = useGameDispatch();
  const fast = useFastSnapshot();
  const structure = useStructureSnapshot();
  const [search, setSearch] = useState(createSearchState());
  const selection = useSelection();
  const [busy, setBusy] = useState(false);
  const [resultText, setResultText] = useState<string | null>(null);

  const ownedById = useMemo(() => new Set(structure.upgrades.map((u) => u.id)), [structure.upgrades]);
  const ownedByGenerator = useMemo(() => {
    const map = new Map<string, number>();
    for (const g of structure.generators) map.set(g.id, g.count);
    return map;
  }, [structure.generators]);

  const rows = UPGRADE_DEFINITIONS.map((def) => ({
    def,
    owned: ownedById.has(def.id),
    unlocked: isUpgradeUnlocked(def.unlockCondition, structure),
    progress: describeUnlockProgress(def, ownedByGenerator),
  }));

  const visibleRows = rows.filter((row) => matchesSearch(`${row.def.nameEn} ${row.def.nameYue}`, search));

  async function runBulkBuy(): Promise<void> {
    setBusy(true);
    let bought = 0;
    let skipped = 0;
    for (const id of selection.ids) {
      const row = rows.find((r) => r.def.id === id);
      if (!row || row.owned || !row.unlocked) {
        skipped += 1;
        continue;
      }
      const before = bnCompare(fast.cookies, row.def.cost);
      const next = dispatch({ type: 'buyUpgrade', upgradeId: id });
      if (before >= 0 && next.upgrades.some((u) => u.id === id)) bought += 1;
      else skipped += 1;
    }
    setResultText(`✅ ${bought} bought, ⚠️ ${skipped} skipped · 買咗 ${bought} 項，跳過 ${skipped} 項`);
    setBusy(false);
  }

  return (
    <div className="screen">
      <h1>
        Upgrades<span className="screen-title-zh">升級</span>
      </h1>
      <SearchWithRegexBuilder
        idPrefix="upgrades-search"
        state={search}
        onChange={setSearch}
        placeholder={LIST_COPY.searchPlaceholderUpgrades}
        ariaLabel={LIST_COPY.searchPlaceholderUpgrades}
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
        <div className="card-grid">
          {visibleRows.map((row) => (
            <UpgradeCard
              key={row.def.id}
              def={row.def}
              owned={row.owned}
              unlocked={row.unlocked}
              progress={row.progress}
              selected={selection.has(row.def.id)}
              onToggleSelect={() => selection.toggle(row.def.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
