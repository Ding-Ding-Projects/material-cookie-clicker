import { formatBigNum } from '../../shared/game/format-number.js';
import { bnFromNumber } from '../../shared/game/big-number.js';
import {
  rebornNodeState,
  rebornPermanentSlots,
  rebornPointsSpent,
  REBORN_NODE_DEFINITIONS,
  type RebornBranch,
  type RebornNodeDefinition,
  type RebornNodeState,
} from '../../shared/game/reborn.js';
import { getUpgradeDefinition } from '../../shared/game/upgrades.js';
import { bilingualText, REBORN_COPY, showsCantonese, showsEnglish, type Bilingual } from '../game/copy.js';
import { useGameDispatch, useStructureSnapshot } from '../game/GameProvider.js';

/** The branch headings, in the order the tree draws them. */
const BRANCH_ORDER: readonly RebornBranch[] = ['inheritance', 'power', 'memory'];

const BRANCH_LABELS: Readonly<Record<RebornBranch, Bilingual>> = {
  inheritance: REBORN_COPY.branchInheritance,
  power: REBORN_COPY.branchPower,
  memory: REBORN_COPY.branchMemory,
};

/** What a node actually does, in both languages, derived from its effect rather than written
 *  twice. A node whose blurb and whose effect could disagree is a node that will. */
function describeNode(def: RebornNodeDefinition): Bilingual {
  switch (def.effect.kind) {
    case 'startWithCookies':
      return REBORN_COPY.effectStartWith(formatBigNum(bnFromNumber(def.effect.cookies), 'en'));
    case 'retainUpgrades':
      return REBORN_COPY.effectRetain(Math.round(def.effect.fraction * 100));
    case 'globalCpsMultiplier':
      return REBORN_COPY.effectGlobal(def.effect.multiplier);
    case 'clickMultiplier':
      return REBORN_COPY.effectClick(def.effect.multiplier);
    case 'permanentSlots':
      return REBORN_COPY.effectSlots(def.effect.slots);
  }
}

/** The state word printed on the node itself, so state is never colour-only. */
function stateLabel(state: RebornNodeState, def: RebornNodeDefinition): Bilingual {
  if (state === 'owned') return REBORN_COPY.bought;
  if (state === 'locked') {
    const previous = REBORN_NODE_DEFINITIONS.find((n) => n.id === def.requires);
    return REBORN_COPY.requires(previous?.nameEn ?? '—', previous?.nameYue ?? '—');
  }
  return REBORN_COPY.cost(def.cost);
}

function RebornNode({
  def,
  state,
  onBuy,
}: {
  def: RebornNodeDefinition;
  state: RebornNodeState;
  onBuy: () => void;
}) {
  const effect = describeNode(def);
  const label = stateLabel(state, def);
  return (
    <li className={`reborn-node reborn-node--${state}`}>
      <button
        type="button"
        className="reborn-node__button"
        disabled={state !== 'affordable'}
        aria-label={`${def.nameEn} · ${def.nameYue} — ${bilingualText(effect)} — ${bilingualText(label)}`}
        onClick={onBuy}
      >
        <span className="reborn-node__head">
          {showsEnglish() ? <span className="reborn-node__name">{def.nameEn}</span> : null}
          {showsCantonese() ? (
            <span className="reborn-node__name-zh" lang="zh-HK">
              {def.nameYue}
            </span>
          ) : null}
          <span className="reborn-node__cost">{bilingualText(REBORN_COPY.cost(def.cost))}</span>
        </span>
        <span className="reborn-node__effect">{bilingualText(effect)}</span>
        <span className="reborn-node__state">{bilingualText(label)}</span>
      </button>
    </li>
  );
}

/**
 * The permanent-pin shelf. Slots are bought in the Memory branch; pinning itself is free and
 * reversible, because the point was already spent on the slot and a slot the player cannot
 * change their mind about is a trap rather than a choice.
 */
function PermanentPins() {
  const dispatch = useGameDispatch();
  const structure = useStructureSnapshot();
  const slots = rebornPermanentSlots(structure.prestige.rebornNodeIds ?? []);
  const pinned = structure.prestige.permanentUnlockIds;

  return (
    <section className="reborn-pins">
      <h3>{bilingualText(REBORN_COPY.pinTitle)}</h3>
      {slots === 0 ? (
        <p className="reborn-pins__empty">{bilingualText(REBORN_COPY.pinNoSlots)}</p>
      ) : (
        <>
          <p className="reborn-pins__usage">{bilingualText(REBORN_COPY.pinUsage(pinned.length, slots))}</p>
          <ul className="reborn-pins__list">
            {structure.upgrades.map((owned) => {
              const def = getUpgradeDefinition(owned.id);
              const isPinned = pinned.includes(owned.id);
              const full = !isPinned && pinned.length >= slots;
              return (
                <li key={owned.id} className={isPinned ? 'reborn-pins__row is-pinned' : 'reborn-pins__row'}>
                  <span className="reborn-pins__name">
                    {showsEnglish() ? def.nameEn : null}
                    {showsEnglish() && showsCantonese() ? ' · ' : null}
                    {showsCantonese() ? <span lang="zh-HK">{def.nameYue}</span> : null}
                  </span>
                  <button
                    type="button"
                    className="reborn-pins__toggle"
                    disabled={full}
                    onClick={() =>
                      dispatch({ type: 'setPermanentUpgrade', upgradeId: owned.id, pinned: !isPinned })
                    }
                  >
                    {bilingualText(isPinned ? REBORN_COPY.unpin : REBORN_COPY.pin)}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

/**
 * THE REBORN TREE — 轉生.
 *
 * Ascension points used to be a single number that did one thing. This is where they are spent:
 * three chains of permanent nodes that sit outside the run entirely, so nothing in here is ever
 * reset and nothing in here is ever refunded. Every purchase is manual, goes through the one
 * `applyGameAction` seam as `{ type: 'buyRebornNode' }`, and is re-checked by the reducer.
 *
 * It lives inside the Prestige panel rather than on a console button of its own, because a
 * Reborn node is a decision about ascending and belongs next to the ascension gate.
 */
export function RebornTree() {
  const dispatch = useGameDispatch();
  const structure = useStructureSnapshot();
  const ownedNodeIds = structure.prestige.rebornNodeIds ?? [];
  const points = structure.prestige.ascensionPoints;

  return (
    <section className="reborn-tree">
      <h2 className="reborn-tree__title">
        {showsEnglish() ? <span>{REBORN_COPY.title.en}</span> : null}
        {showsCantonese() ? (
          <span className="reborn-tree__title-zh" lang="zh-HK">
            {REBORN_COPY.title.yue}
          </span>
        ) : null}
      </h2>
      <p className="reborn-tree__intro">{bilingualText(REBORN_COPY.intro)}</p>
      <p className="reborn-tree__points">
        <span>{bilingualText(REBORN_COPY.pointsAvailable(points))}</span>
        <span>{bilingualText(REBORN_COPY.pointsSpent(rebornPointsSpent(ownedNodeIds)))}</span>
      </p>

      <div className="reborn-tree__branches">
        {BRANCH_ORDER.map((branch) => (
          <div key={branch} className={`reborn-branch reborn-branch--${branch}`}>
            <h3 className="reborn-branch__heading">{bilingualText(BRANCH_LABELS[branch])}</h3>
            <ul className="reborn-branch__list">
              {REBORN_NODE_DEFINITIONS.filter((def) => def.branch === branch).map((def) => (
                <RebornNode
                  key={def.id}
                  def={def}
                  state={rebornNodeState(def, ownedNodeIds, points)}
                  onBuy={() => dispatch({ type: 'buyRebornNode', nodeId: def.id })}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>

      <PermanentPins />
    </section>
  );
}
