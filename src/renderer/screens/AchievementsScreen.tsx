import { memo, useMemo, useState } from 'react';

import { ACHIEVEMENT_DEFINITIONS, type AchievementDefinition } from '../../shared/game/achievements.js';
import { bnToNumber } from '../../shared/game/big-number.js';
import { getGeneratorDefinition } from '../../shared/game/generators.js';
import { createSearchState, SearchWithRegexBuilder } from '../components/SearchWithRegexBuilder.js';
import { ACHIEVEMENTS_SCREEN_COPY, LIST_COPY, type Bilingual } from '../game/copy.js';
import { achievementEmoji } from '../game/emoji.js';
import { useStructureSnapshot } from '../game/GameProvider.js';
import { matchesSearch } from '../game/local-regex-search.js';

/** The requirement, described from the STATIC definition alone. Deliberately no live
 *  current-value readout: this grid subscribes only to the structure slice (see store.ts),
 *  and a per-badge live counter would drag ~95 cells back into re-rendering on every tick. */
function describeRequirement(def: AchievementDefinition): Bilingual {
  switch (def.condition.kind) {
    case 'lifetimeCookies':
      return ACHIEVEMENTS_SCREEN_COPY.requireLifetimeCookies(bnToNumber(def.condition.atLeast).toLocaleString('en-US'));
    case 'totalClicks':
      return ACHIEVEMENTS_SCREEN_COPY.requireClicks(def.condition.atLeast.toLocaleString('en-US'));
    case 'generatorOwned': {
      const genDef = getGeneratorDefinition(def.condition.generatorId);
      return ACHIEVEMENTS_SCREEN_COPY.requireGeneratorOwned(def.condition.atLeast, genDef.nameEn, genDef.nameYue);
    }
    case 'prestigeCount':
      return ACHIEVEMENTS_SCREEN_COPY.requirePrestige(def.condition.atLeast);
  }
}

const AchievementCell = memo(function AchievementCell({
  def,
  unlockedAtIso,
}: {
  def: AchievementDefinition;
  unlockedAtIso: string | null;
}) {
  const unlocked = unlockedAtIso !== null;
  const requirement = describeRequirement(def);
  const unlockedLine = unlockedAtIso ? ACHIEVEMENTS_SCREEN_COPY.unlockedAt(new Date(unlockedAtIso).toLocaleDateString('en-US')) : null;
  return (
    <div className="achievement-cell">
      <div
        className={`achievement-badge ${unlocked ? 'unlocked' : 'locked'}`}
        role="img"
        aria-label={
          unlocked
            ? `${def.nameEn} — ${unlockedLine?.en} · ${def.nameYue}——${unlockedLine?.yue}`
            : `${LIST_COPY.locked.en}: ${def.nameEn} — ${requirement.en} · ${LIST_COPY.locked.yue}：${def.nameYue}——${requirement.yue}`
        }
      >
        {/* Decorative only — the badge's accessible name lives on the role="img" wrapper above. */}
        <span aria-hidden="true">{unlocked ? achievementEmoji(def) : '🔒'}</span>
      </div>
      <span className="achievement-name">{def.nameEn}</span>
      <span className="achievement-name-zh">{def.nameYue}</span>
      <span className="achievement-name-zh">{unlocked && unlockedLine ? `${unlockedLine.en} · ${unlockedLine.yue}` : `${requirement.en} · ${requirement.yue}`}</span>
    </div>
  );
});

export function AchievementsScreen() {
  const structure = useStructureSnapshot();
  const [search, setSearch] = useState(createSearchState());

  const unlockedAtById = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of structure.achievements) map.set(a.id, a.unlockedAtIso);
    return map;
  }, [structure.achievements]);

  const visible = ACHIEVEMENT_DEFINITIONS.filter((def) => matchesSearch(`${def.nameEn} ${def.nameYue}`, search));
  const summary = ACHIEVEMENTS_SCREEN_COPY.unlockedSummary(structure.achievements.length, ACHIEVEMENT_DEFINITIONS.length);

  return (
    <div className="screen">
      <h1>
        Achievements<span className="screen-title-zh">成就</span>
      </h1>
      <p>
        {summary.en} · {summary.yue}
      </p>
      <SearchWithRegexBuilder
        idPrefix="achievements-search"
        state={search}
        onChange={setSearch}
        placeholder={LIST_COPY.searchPlaceholderAchievements}
        ariaLabel={LIST_COPY.searchPlaceholderAchievements}
      />
      {visible.length === 0 ? (
        <p>
          {LIST_COPY.noResults.en} · {LIST_COPY.noResults.yue}
        </p>
      ) : (
        <div className="achievement-grid">
          {visible.map((def) => (
            <AchievementCell key={def.id} def={def} unlockedAtIso={unlockedAtById.get(def.id) ?? null} />
          ))}
        </div>
      )}
    </div>
  );
}
