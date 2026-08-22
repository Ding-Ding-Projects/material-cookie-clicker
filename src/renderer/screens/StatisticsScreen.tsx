import { useMemo } from 'react';

import { ACHIEVEMENT_DEFINITIONS } from '../../shared/game/achievements.js';
import { bnMulScalar } from '../../shared/game/big-number.js';
import { formatBigNum } from '../../shared/game/format-number.js';
import { isToolBonusActive, TOOL_DEFINITIONS } from '../../shared/game/tools.js';
import { computeMultipliers } from '../../shared/game/upgrades.js';
import { STATS_SCREEN_COPY, type Bilingual } from '../game/copy.js';
import { useFastSnapshot, useStatsSnapshot, useStructureSnapshot } from '../game/GameProvider.js';

function StatTile({ label, value }: { label: Bilingual; value: string }) {
  return (
    <div className="stat-tile">
      <span className="stat-tile__label-en">{label.en}</span>
      <span className="stat-tile__label-zh">{label.yue}</span>
      <span className="stat-tile__value">{value}</span>
    </div>
  );
}

/**
 * Read-only stat tiles (design/stat-tile.html). The whole grid re-renders on every tick —
 * that is the point of a live statistics page, and unlike the big card lists it is a handful
 * of leaf text nodes, so no slice gymnastics are needed here.
 */
export function StatisticsScreen() {
  const fast = useFastSnapshot();
  const stats = useStatsSnapshot();
  const structure = useStructureSnapshot();

  // Base click power including upgrade/tool/prestige multipliers, excluding any transient
  // golden-cookie frenzy — the tile reports the standing value, not a 30-second spike.
  const clickPower = useMemo(
    () => bnMulScalar(structure.baseClickValue, computeMultipliers(structure).clickMultiplier),
    [structure],
  );
  const toolsUnlocked = useMemo(
    () => TOOL_DEFINITIONS.filter((def) => isToolBonusActive(structure, def.id)).length,
    [structure],
  );

  return (
    <div className="screen">
      <h1>
        Statistics<span className="screen-title-zh">統計</span>
      </h1>
      <div className="stat-grid">
        <StatTile label={STATS_SCREEN_COPY.totalCookiesBaked} value={formatBigNum(stats.totalCookiesBaked, 'en')} />
        <StatTile label={STATS_SCREEN_COPY.lifetimeCookies} value={formatBigNum(fast.lifetimeCookies, 'en')} />
        <StatTile label={STATS_SCREEN_COPY.cookiesPerSecond} value={`${formatBigNum(fast.cps, 'en')}/s`} />
        <StatTile label={STATS_SCREEN_COPY.clickPower} value={formatBigNum(clickPower, 'en')} />
        <StatTile label={STATS_SCREEN_COPY.totalClicks} value={stats.totalClicks.toLocaleString('en-US')} />
        <StatTile label={STATS_SCREEN_COPY.prestigeRuns} value={structure.prestige.totalPrestigeCount.toLocaleString('en-US')} />
        <StatTile label={STATS_SCREEN_COPY.ascensionPoints} value={structure.prestige.ascensionPoints.toLocaleString('en-US')} />
        <StatTile
          label={STATS_SCREEN_COPY.achievementsUnlocked}
          value={`${structure.achievements.length} / ${ACHIEVEMENT_DEFINITIONS.length}`}
        />
        <StatTile label={STATS_SCREEN_COPY.toolsUnlocked} value={`${toolsUnlocked} / ${TOOL_DEFINITIONS.length}`} />
        <StatTile label={STATS_SCREEN_COPY.clockAnomalies} value={stats.clockAnomalyCount.toLocaleString('en-US')} />
      </div>
    </div>
  );
}
