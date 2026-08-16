import { memo, useState } from 'react';

import { bnCompare } from '../../shared/game/big-number.js';
import { formatBigNum } from '../../shared/game/format-number.js';
import { toolPrice } from '../../shared/game/tool-shop.js';
import type { GameState } from '../../shared/game/types.js';
import { createSearchState, SearchWithRegexBuilder } from '../components/SearchWithRegexBuilder.js';
import { LIST_COPY, TOOLS_SCREEN_COPY, type Bilingual } from '../game/copy.js';
import { useFastSnapshot, useGameDispatch, useStructureSnapshot } from '../game/GameProvider.js';
import { matchesSearch } from '../game/local-regex-search.js';
import { buildAllToolRowViewModels, type ToolRowViewModel } from '../game/tool-view-model.js';

/** Decorative card glyph; the mystery state gets the same treatment as design/tool-card.html. */
function toolGlyph(vm: ToolRowViewModel): string {
  return vm.state === 'undiscovered' ? '❔' : '🧰';
}

/** What this card is allowed to call itself: undiscovered cards hide name AND flavour. */
function visibleName(vm: ToolRowViewModel): { nameEn: string; nameYue: string; body: Bilingual } {
  if (vm.state === 'undiscovered') {
    return {
      nameEn: TOOLS_SCREEN_COPY.undiscoveredName.en,
      nameYue: TOOLS_SCREEN_COPY.undiscoveredName.yue,
      body: TOOLS_SCREEN_COPY.undiscoveredBody,
    };
  }
  return { nameEn: vm.def.nameEn, nameYue: vm.def.nameYue, body: { en: vm.def.flavourEn, yue: vm.def.flavourYue } };
}

/** The affordability leaf — the only part of a card that needs live cookies, exactly like
 *  GeneratorsScreen's GeneratorBuyButton. An active bonus has nothing left to sell. */
const ToolBuyButton = memo(function ToolBuyButton({ vm }: { vm: ToolRowViewModel }) {
  const dispatch = useGameDispatch();
  const fast = useFastSnapshot();

  if (vm.state === 'unlocked') {
    return (
      <button type="button" className="item-card__buy" disabled>
        {LIST_COPY.alreadyOwned.en} · {LIST_COPY.alreadyOwned.yue}
      </button>
    );
  }

  const price = toolPrice(vm.id);
  const affordable = bnCompare(fast.cookies, price) >= 0;
  return (
    <button
      type="button"
      className="item-card__buy"
      disabled={!affordable}
      onClick={() => dispatch({ type: 'buyTool', toolId: vm.id })}
    >
      {TOOLS_SCREEN_COPY.buyEarly.en} · {TOOLS_SCREEN_COPY.buyEarly.yue} — 🍪 {formatBigNum(price, 'en')}
    </button>
  );
});

const ToolCard = memo(function ToolCard({ vm }: { vm: ToolRowViewModel }) {
  const [openedMessage, setOpenedMessage] = useState<Bilingual | null>(null);
  const { nameEn, nameYue, body } = visibleName(vm);
  const stateClass = vm.state === 'unlocked' ? ' unlocked' : vm.state === 'undiscovered' ? ' undiscovered locked' : ' locked';

  function openRealFeature(): void {
    // The one feature this screen can genuinely present in place is the regex builder — this
    // very screen's search field carries the real one. Everything else gets the honest
    // "not wired into a screen of its own yet" note; either way the message proves the
    // click did something and the feature was never behind this card.
    setOpenedMessage(vm.id === 'regexBuilder' ? TOOLS_SCREEN_COPY.openedRegexBuilder : TOOLS_SCREEN_COPY.openedGeneric);
  }

  return (
    <div className={`item-card${stateClass}`}>
      <div className="item-card__icon" aria-hidden="true">
        {toolGlyph(vm)}
      </div>
      <div className="item-card__name-en">{nameEn}</div>
      <div className="item-card__name-zh">{nameYue}</div>
      <div className="item-card__desc">
        {body.en} · {body.yue}
        <br />
        {vm.bonus.en} · {vm.bonus.yue}
      </div>
      <div className="item-card__progress-line">
        {vm.progress.en} · {vm.progress.yue}
      </div>
      <div className="item-card__progress-track" aria-hidden="true">
        <div className="item-card__progress-fill" style={{ width: `${Math.round(vm.progressRatio * 100)}%` }} />
      </div>
      <ToolBuyButton vm={vm} />
      {/* The always-present, state-identical "the real feature is not locked" callout — the
          tools contract made visible (see HANDOFF.md and design/tool-card.html). It renders
          the SAME way on an undiscovered mystery card as on a fully unlocked one. */}
      <div className="open-real-feature">
        <span className="open-real-feature__note">
          {TOOLS_SCREEN_COPY.openItNowNote.en} · {TOOLS_SCREEN_COPY.openItNowNote.yue}
        </span>
        <button type="button" className="open-real-feature__button" onClick={openRealFeature}>
          {TOOLS_SCREEN_COPY.openItNow.en} · {TOOLS_SCREEN_COPY.openItNow.yue}
        </button>
      </div>
      {openedMessage && (
        <p className="item-card__progress-line" role="status">
          {openedMessage.en} · {openedMessage.yue}
        </p>
      )}
    </div>
  );
});

export function ToolsScreen() {
  const dispatch = useGameDispatch();
  const structure = useStructureSnapshot();
  // The fast subscription exists so lifetimeCookies/totalClicks-driven discovery progress
  // advances live between discrete actions; `structure` is the store's full current state,
  // so any re-render reads fresh values. Twenty cards at tick rate is cheap; the leaves memo.
  useFastSnapshot();
  const [search, setSearch] = useState(createSearchState());

  const state: GameState = structure;
  const viewModels = buildAllToolRowViewModels(state);
  const visible = viewModels.filter((vm) => {
    const { nameEn, nameYue } = visibleName(vm);
    return matchesSearch(`${nameEn} ${nameYue}`, search);
  });

  const progressionCopy = state.toolProgressionEnabled ? TOOLS_SCREEN_COPY.progressionToggleOn : TOOLS_SCREEN_COPY.progressionToggleOff;

  return (
    <div className="screen">
      <h1>
        Tools<span className="screen-title-zh">工具</span>
      </h1>
      <p>
        {TOOLS_SCREEN_COPY.principle.en} · {TOOLS_SCREEN_COPY.principle.yue}
      </p>
      <button
        type="button"
        className="bulk-toolbar__count"
        style={{ alignSelf: 'flex-start', border: 'none', cursor: 'pointer', font: 'inherit', fontSize: 13, minHeight: 40 }}
        aria-pressed={state.toolProgressionEnabled}
        onClick={() => dispatch({ type: 'setToolProgression', enabled: !state.toolProgressionEnabled })}
      >
        {progressionCopy.en} · {progressionCopy.yue}
      </button>
      <SearchWithRegexBuilder
        idPrefix="tools-search"
        state={search}
        onChange={setSearch}
        placeholder={LIST_COPY.searchPlaceholderTools}
        ariaLabel={LIST_COPY.searchPlaceholderTools}
      />
      {visible.length === 0 ? (
        <p>
          {LIST_COPY.noResults.en} · {LIST_COPY.noResults.yue}
        </p>
      ) : (
        <div className="card-grid">
          {visible.map((vm) => (
            <ToolCard key={vm.id} vm={vm} />
          ))}
        </div>
      )}
    </div>
  );
}
