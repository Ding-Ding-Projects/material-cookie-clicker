import { memo, useMemo, useState } from 'react';

import { bnCompare, bnToNumber } from '../../shared/game/big-number.js';
import { formatBigNum } from '../../shared/game/format-number.js';
import { GENERATOR_DEFINITIONS } from '../../shared/game/generators.js';
import { toolPrice } from '../../shared/game/tool-shop.js';
import { TOOL_DEFINITIONS, type ToolDefinition, type ToolUnlockCondition } from '../../shared/game/tools.js';
import { ToolIcon, ToolTierGem } from '../assets/icons.js';
import { createSearchState, SearchWithRegexBuilder } from '../components/SearchWithRegexBuilder.js';
import { LIST_COPY, TOOLS_SCREEN_COPY, type Bilingual } from '../game/copy.js';
import { useFastSnapshot, useGameDispatch, useStructureSnapshot } from '../game/GameProvider.js';
import { matchesSearch } from '../game/local-regex-search.js';
import { buildToolRowViewModel, type ToolRowViewModel } from '../game/tool-view-model.js';

/**
 * The Tools tech-tree screen (design/tools-tree.html, design/tool-card.html).
 *
 * THE CONTRACT THIS SCREEN EXISTS TO HONOUR: unlocking or buying a tool here buys a GAMEPLAY
 * BONUS and its in-game surfacing — nothing else. It never gates the real application feature.
 * Every node, in every state including undiscovered, renders the same fully-enabled
 * "Open it now" callout in its own distinctly bordered box with an "always available" badge,
 * visually separated from the lock chrome on purpose. Do not add a predicate anywhere that is
 * shaped like "is this feature available": src/shared/game/tools.ts deliberately exports none,
 * and tests/game/tools.test.ts asserts that absence.
 */

/**
 * SEAM FOR THE ORCHESTRATOR: opening a real application feature.
 *
 * The shell's preload bridge (src/preload/index.ts) currently exposes window chrome only — it
 * has no "open this application feature" channel yet, and inventing an IPC channel from this
 * lane would guess at a contract another lane owns. So the callout is wired to this clearly
 * named handler instead: pass `onOpenApplicationFeature` from the shell once the bridge method
 * exists, and delete the fallback below. The fallback intentionally still *does* something
 * observable rather than silently swallowing the click.
 */
export type OpenApplicationFeature = (toolId: string, def: ToolDefinition) => void;

const UNWIRED_OPEN_APPLICATION_FEATURE: OpenApplicationFeature = (toolId, def) => {
  // eslint-disable-next-line no-console
  console.info(
    `[tools] "Open it now" requested for the ${def.nameEn} application feature (${toolId}). ` +
      'No preload bridge method exists for opening features yet — pass onOpenApplicationFeature ' +
      'into <ToolsScreen /> once it does. The feature itself is not gated by the tech tree.',
  );
};

/** Bronze / emerald / amethyst. A presentational grouping only — the domain has no tier field. */
export type ToolTier = 1 | 2 | 3;

/**
 * Tier is derived from how far into a real play sequence a tool's own unlock condition sits.
 * This is display grouping, nothing more: it never feeds a bonus, a price, or an availability
 * decision, and two tools in different tiers behave identically apart from their accent colour.
 */
export function toolTier(condition: ToolUnlockCondition): ToolTier {
  switch (condition.kind) {
    case 'always':
    case 'achievementUnlocked':
      return 1;
    case 'totalClicks':
      return condition.atLeast <= 200 ? 1 : condition.atLeast <= 1000 ? 2 : 3;
    case 'lifetimeCookies': {
      const target = bnToNumber(condition.atLeast);
      return target <= 1e4 ? 1 : target <= 1e7 ? 2 : 3;
    }
    case 'generatorOwned': {
      const index = GENERATOR_DEFINITIONS.findIndex((g) => g.id === condition.generatorId);
      return index <= 1 ? 1 : index <= 5 ? 2 : 3;
    }
    case 'prestigeCount':
      return 3;
  }
}

const TIER_META: Record<ToolTier, { label: Bilingual; prereq: Bilingual }> = {
  1: { label: TOOLS_SCREEN_COPY.tier1, prereq: TOOLS_SCREEN_COPY.tier1Prereq },
  2: { label: TOOLS_SCREEN_COPY.tier2, prereq: TOOLS_SCREEN_COPY.tier2Prereq },
  3: { label: TOOLS_SCREEN_COPY.tier3, prereq: TOOLS_SCREEN_COPY.tier3Prereq },
};

type NodeState = 'undiscovered' | 'locked' | 'ready' | 'unlocked';

/**
 * The always-present escape hatch from the lock. Rendered identically, and always enabled, in
 * all four node states — an undiscovered card gets exactly the same one as a fully unlocked one.
 */
function OpenItNowCallout({ def, onOpen }: { def: ToolDefinition; onOpen: OpenApplicationFeature }) {
  return (
    <div className="open-real-feature">
      <span className="open-real-feature__badge">
        🔓 {TOOLS_SCREEN_COPY.alwaysAvailable.en} · {TOOLS_SCREEN_COPY.alwaysAvailable.yue}
      </span>
      <span className="open-real-feature__note">
        {TOOLS_SCREEN_COPY.openItNowNote.en} · {TOOLS_SCREEN_COPY.openItNowNote.yue}
      </span>
      <button
        type="button"
        className="open-real-feature__button"
        onClick={() => onOpen(def.id, def)}
        aria-label={`${TOOLS_SCREEN_COPY.openItNow.en} — ${def.nameEn} · ${TOOLS_SCREEN_COPY.openItNow.yue} — ${def.nameYue}`}
      >
        {TOOLS_SCREEN_COPY.openItNow.en} · {TOOLS_SCREEN_COPY.openItNow.yue}
      </button>
    </div>
  );
}

const ToolNode = memo(function ToolNode({
  vm,
  tier,
  nodeState,
  priceText,
  affordable,
  onBuy,
  onOpen,
}: {
  vm: ToolRowViewModel;
  tier: ToolTier;
  nodeState: NodeState;
  priceText: string;
  affordable: boolean;
  onBuy: () => void;
  onOpen: OpenApplicationFeature;
}) {
  const { def } = vm;
  const hidden = nodeState === 'undiscovered';
  const chip: Bilingual =
    nodeState === 'unlocked'
      ? TOOLS_SCREEN_COPY.unlockedChip
      : nodeState === 'ready'
        ? TOOLS_SCREEN_COPY.readyChip
        : nodeState === 'locked'
          ? TOOLS_SCREEN_COPY.lockedChip
          : TOOLS_SCREEN_COPY.undiscoveredChip;

  return (
    <li className={`item-card tool-node ${nodeState}`}>
      <span className="item-card__icon" aria-hidden="true">
        <ToolIcon id={def.id} tier={tier} hidden={hidden} />
      </span>
      <span className="item-card__name-en">{hidden ? TOOLS_SCREEN_COPY.undiscoveredName.en : def.nameEn}</span>
      <span className="item-card__name-zh">{hidden ? TOOLS_SCREEN_COPY.undiscoveredName.yue : def.nameYue}</span>
      <span className="tool-node__chip">
        {chip.en} · {chip.yue}
      </span>
      <p className="item-card__desc">
        {hidden ? (
          <>
            {TOOLS_SCREEN_COPY.undiscoveredBody.en} · {TOOLS_SCREEN_COPY.undiscoveredBody.yue}
          </>
        ) : (
          <>
            {def.flavourEn} · {def.flavourYue}
          </>
        )}
      </p>
      {!hidden && (
        <span className="item-card__progress-line">
          🎁 {vm.bonus.en} · {vm.bonus.yue}
        </span>
      )}
      {nodeState !== 'unlocked' && !hidden && (
        <>
          <span className="item-card__progress-line">
            {vm.progress.en} · {vm.progress.yue}
          </span>
          <div
            className="item-card__progress-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(vm.progressRatio * 100)}
            aria-label={`${def.nameEn} unlock progress · ${def.nameYue}解鎖進度`}
          >
            <div className="item-card__progress-fill" style={{ width: `${vm.progressRatio * 100}%` }} />
          </div>
          <button type="button" className="item-card__buy" disabled={!affordable} onClick={onBuy}>
            {affordable
              ? `${TOOLS_SCREEN_COPY.unlockNow.en} · ${TOOLS_SCREEN_COPY.unlockNow.yue} — 🍪 ${priceText}`
              : `${TOOLS_SCREEN_COPY.cannotAfford.en} · ${TOOLS_SCREEN_COPY.cannotAfford.yue} — 🍪 ${priceText}`}
          </button>
        </>
      )}
      {/* Deliberately OUTSIDE and after the lock chrome above, and never disabled with it. */}
      <OpenItNowCallout def={def} onOpen={onOpen} />
    </li>
  );
});

export interface ToolsScreenProps {
  readonly onOpenApplicationFeature?: OpenApplicationFeature;
}

export function ToolsScreen({ onOpenApplicationFeature }: ToolsScreenProps = {}) {
  const dispatch = useGameDispatch();
  const structure = useStructureSnapshot();
  const fast = useFastSnapshot();
  const [search, setSearch] = useState(createSearchState());

  const onOpen = onOpenApplicationFeature ?? UNWIRED_OPEN_APPLICATION_FEATURE;

  const rows = useMemo(
    () =>
      TOOL_DEFINITIONS.map((def) => {
        const vm = buildToolRowViewModel(def, structure);
        const price = toolPrice(def.id);
        return { vm, tier: toolTier(def.unlockCondition), price };
      }),
    [structure],
  );

  const unlockedCount = rows.filter((row) => row.vm.state === 'unlocked').length;
  const percent = rows.length === 0 ? 0 : Math.round((unlockedCount / rows.length) * 100);

  const visible = rows.filter((row) =>
    // An undiscovered tool is searchable by its placeholder name only — its real name stays
    // hidden so discovery is still a moment rather than a spoiled checklist item.
    matchesSearch(
      row.vm.state === 'undiscovered'
        ? `${TOOLS_SCREEN_COPY.undiscoveredName.en} ${TOOLS_SCREEN_COPY.undiscoveredName.yue}`
        : `${row.vm.def.nameEn} ${row.vm.def.nameYue}`,
      search,
    ),
  );

  const progressionOn = structure.toolProgressionEnabled;

  return (
    <div className="screen">
      <h1>
        {TOOLS_SCREEN_COPY.title.en}
        <span className="screen-title-zh">{TOOLS_SCREEN_COPY.title.yue}</span>
      </h1>
      {/*
        The contract banner. It is compressed to one marquee line, NOT weakened: the full
        sentence is one keystroke away in the disclosure below, which is honestly collapsed by
        default because the headline above it already states the rule outright.
      */}
      <details className="hud-strip hud-strip--contract">
        <summary className="hud-strip__summary">
          <span className="hud-strip__flash hud-strip__flash--finite" aria-hidden="true">
            🎮
          </span>
          <span className="hud-strip__headline">
            {TOOLS_SCREEN_COPY.principleHeadline.en} · {TOOLS_SCREEN_COPY.principleHeadline.yue}
          </span>
          <span className="hud-strip__more">
            <span className="hud-strip__more-text">
              {TOOLS_SCREEN_COPY.principleMore.en} · {TOOLS_SCREEN_COPY.principleMore.yue}
            </span>
          </span>
        </summary>
        <p className="hud-strip__body">
          {TOOLS_SCREEN_COPY.principle.en} · {TOOLS_SCREEN_COPY.principle.yue}
        </p>
      </details>

      {/* One HUD row: bezelled counter + bar + the progression toggle and its caption. */}
      <div className="tools-hud">
        <span className="tools-hud__counter">
          <span className="tools-hud__counter-value">
            {unlockedCount}
            <span className="tools-hud__counter-sep" aria-hidden="true">
              /
            </span>
            {rows.length}
          </span>
          <span className="tools-hud__counter-label">
            {TOOLS_SCREEN_COPY.toolsUnlockedLabel.en} · {TOOLS_SCREEN_COPY.toolsUnlockedLabel.yue}
          </span>
        </span>
        <div
          className="tools-hud__track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label={`${TOOLS_SCREEN_COPY.toolsUnlockedLabel.en} · ${TOOLS_SCREEN_COPY.toolsUnlockedLabel.yue}`}
        >
          <div className="tools-hud__fill" style={{ width: `${percent}%` }} />
        </div>
        <div className="tools-hud__toggle-wrap">
          <button
            type="button"
            className="tools-hud__toggle"
            aria-pressed={progressionOn}
            onClick={() => dispatch({ type: 'setToolProgression', enabled: !progressionOn })}
          >
            {progressionOn
              ? `${TOOLS_SCREEN_COPY.progressionToggleOn.en} · ${TOOLS_SCREEN_COPY.progressionToggleOn.yue}`
              : `${TOOLS_SCREEN_COPY.progressionToggleOff.en} · ${TOOLS_SCREEN_COPY.progressionToggleOff.yue}`}
          </button>
          <details className="hud-strip hud-strip--caption">
            <summary className="hud-strip__summary">
              <span className="hud-strip__headline">
                {TOOLS_SCREEN_COPY.progressionCaption.en} · {TOOLS_SCREEN_COPY.progressionCaption.yue}
              </span>
              {/* In the tight HUD row the label is kept for screen readers and collapsed to the
                  chevron visually, so the row stays one line. */}
              <span className="hud-strip__more">
                <span className="hud-strip__more-text">
                  {TOOLS_SCREEN_COPY.progressionMore.en} · {TOOLS_SCREEN_COPY.progressionMore.yue}
                </span>
              </span>
            </summary>
            <p className="hud-strip__body">
              {TOOLS_SCREEN_COPY.progressionNote.en} · {TOOLS_SCREEN_COPY.progressionNote.yue}
            </p>
          </details>
        </div>
      </div>

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
        ([1, 2, 3] as ToolTier[]).map((tier) => {
          const tierRows = visible.filter((row) => row.tier === tier);
          if (tierRows.length === 0) return null;
          const meta = TIER_META[tier];
          return (
            <section className="tools-tier" data-tier={tier} key={tier} aria-labelledby={`tools-tier-${tier}`}>
              <h2 className="tools-tier__heading" id={`tools-tier-${tier}`}>
                Tier {tier}
                <span className="tools-tier__chip">
                  <span className="tools-tier__gem" aria-hidden="true">
                    <ToolTierGem tier={tier} />
                  </span>
                  {meta.label.en} · {meta.label.yue}
                </span>
              </h2>
              <p className="tools-tier__prereq">
                {tier > 1 && (
                  <span className="tools-tier__arrow" aria-hidden="true">
                    →
                  </span>
                )}
                {meta.prereq.en} · {meta.prereq.yue}
              </p>
              <ul className="card-grid">
                {tierRows.map(({ vm, price }) => {
                  const affordable = bnCompare(fast.cookies, price) >= 0;
                  const nodeState: NodeState =
                    vm.state === 'unlocked' ? 'unlocked' : vm.state === 'undiscovered' ? 'undiscovered' : affordable ? 'ready' : 'locked';
                  return (
                    <ToolNode
                      key={vm.id}
                      vm={vm}
                      tier={tier}
                      nodeState={nodeState}
                      priceText={formatBigNum(price, 'en')}
                      affordable={affordable}
                      onBuy={() => dispatch({ type: 'buyTool', toolId: vm.id })}
                      onOpen={onOpen}
                    />
                  );
                })}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
