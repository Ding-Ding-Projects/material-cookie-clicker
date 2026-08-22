import { memo, useState } from 'react';

import { bnCompare } from '../../shared/game/big-number.js';
import { formatBigNum } from '../../shared/game/format-number.js';
import { toolPrice } from '../../shared/game/tool-shop.js';
import { isFeatureAvailable, TOOL_DEFINITIONS } from '../../shared/game/tools.js';
import type { GameState } from '../../shared/game/types.js';
import { createSearchState, SearchWithRegexBuilder } from '../components/SearchWithRegexBuilder.js';
import { LIST_COPY, TOOLS_SCREEN_COPY, type Bilingual } from '../game/copy.js';
import { toolEmoji, toolTier } from '../game/emoji.js';
import { useFastSnapshot, useGameDispatch, useStructureSnapshot } from '../game/GameProvider.js';
import { matchesSearch } from '../game/local-regex-search.js';
import { buildAllToolRowViewModels, type ToolRowViewModel } from '../game/tool-view-model.js';

/** Decorative card glyph; the mystery state keeps its ❔ exactly as design/tool-card.html shows,
 *  and every discovered tool wears its own face from the one emoji table. */
function toolGlyph(vm: ToolRowViewModel): string {
  return vm.state === 'undiscovered' ? '❔' : toolEmoji(vm.id);
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

const ToolCard = memo(function ToolCard({
  vm,
  featureAvailable,
  rosterIndex,
  rosterSize,
}: {
  vm: ToolRowViewModel;
  featureAvailable: boolean;
  rosterIndex: number;
  rosterSize: number;
}) {
  const [openedMessage, setOpenedMessage] = useState<Bilingual | null>(null);
  const { nameEn, nameYue, body } = visibleName(vm);
  const stateClass = vm.state === 'unlocked' ? ' unlocked' : vm.state === 'undiscovered' ? ' undiscovered locked' : ' locked';
  // The jewel ladder only shows on cards the player has actually earned: a locked or mystery
  // card must not leak how far up the roster its prize sits (design/tokens-color.html).
  const tierClass = vm.state === 'unlocked' ? ` tier${toolTier(vm.def, rosterIndex, rosterSize)}` : '';

  function openRealFeature(): void {
    // Only reachable when the feature is switched on. The one feature this screen can present
    // in place is the regex builder — this very screen's search field carries the real one.
    // Everything else gets the honest "owned, but not wired into a screen of its own yet" note.
    setOpenedMessage(vm.id === 'regexBuilder' ? TOOLS_SCREEN_COPY.openedRegexBuilder : TOOLS_SCREEN_COPY.openedGeneric);
  }

  return (
    <div className={`item-card${stateClass}${tierClass}`}>
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
      {/* The feature callout sits on every card, but it is now a real gate: the button only
          opens the application feature once `isFeatureAvailable` says the tool is bought or
          naturally unlocked. A locked or mystery card explains that the feature itself is off
          and offers no way through. */}
      <div className="open-real-feature">
        {featureAvailable ? (
          <button type="button" className="open-real-feature__button" onClick={openRealFeature}>
            {TOOLS_SCREEN_COPY.openFeature.en} · {TOOLS_SCREEN_COPY.openFeature.yue}
          </button>
        ) : (
          <>
            <span className="feature-gate-note">
              {TOOLS_SCREEN_COPY.featureGateNote.en} · {TOOLS_SCREEN_COPY.featureGateNote.yue}
            </span>
            <button type="button" className="open-real-feature__button" disabled>
              {TOOLS_SCREEN_COPY.featureLocked.en} · {TOOLS_SCREEN_COPY.featureLocked.yue}
            </button>
          </>
        )}
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
  // The jewel tier is a property of the fixed roster order, not of what the search happens to
  // show, so the index is taken from TOOL_DEFINITIONS itself and survives any filtering.
  const rosterSize = TOOL_DEFINITIONS.length;
  const visible = viewModels
    .map((vm, rosterIndex) => ({ vm, rosterIndex, featureAvailable: isFeatureAvailable(state, vm.id) }))
    .filter(({ vm }) => {
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
          {visible.map(({ vm, rosterIndex, featureAvailable }) => (
            <ToolCard key={vm.id} vm={vm} featureAvailable={featureAvailable} rosterIndex={rosterIndex} rosterSize={rosterSize} />
          ))}
        </div>
      )}
    </div>
  );
}
