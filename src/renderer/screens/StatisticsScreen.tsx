import { useMemo, useRef } from 'react';

import { bnMulScalar, bnToNumber, type BigNum } from '../../shared/game/big-number.js';
import { ACHIEVEMENT_DEFINITIONS } from '../../shared/game/achievements.js';
import { totalCps } from '../../shared/game/cps.js';
import { formatBigNum } from '../../shared/game/format-number.js';
import { generatorCps, getGeneratorDefinition } from '../../shared/game/generators.js';
import { prestigeMultiplierFor } from '../../shared/game/prestige.js';
import { isToolBonusActive, TOOL_DEFINITIONS } from '../../shared/game/tools.js';
import { computeMultipliers } from '../../shared/game/upgrades.js';
import { showsEnglish, showsCantonese, STATS_SCREEN_COPY, TAB_COPY, type Bilingual } from '../game/copy.js';
import { useFastSnapshot, useStatsSnapshot, useStructureSnapshot } from '../game/GameProvider.js';

/**
 * The statistics grid (design/stat-tile.html).
 *
 * Every tile here reads a figure the domain genuinely exposes — `state.stats`, the fast slice,
 * `state.prestige`, or something derived from them by the domain's own pure functions
 * (`totalCps`, `computeMultipliers`, `generatorCps`). Nothing is invented for the sake of
 * filling a tile: if the domain does not track it, it is not shown.
 *
 * Trend indicators name their own baseline honestly. The only baseline this screen actually
 * has is "when this session's Statistics screen first mounted", so that is exactly what the
 * trend text says — it does not claim to compare against the last prestige or the last day,
 * neither of which is recorded anywhere. Direction is carried by a glyph AND a sign AND the
 * colour, never by colour alone.
 */

type TrendDirection = 'up' | 'down' | 'flat';

interface Trend {
  readonly direction: TrendDirection;
  readonly percent: number;
}

const TREND_GLYPH: Record<TrendDirection, string> = { up: '▲', down: '▼', flat: '■' };

function trendSince(baseline: number, current: number): Trend | null {
  if (!Number.isFinite(baseline) || !Number.isFinite(current)) return null;
  // A baseline of zero has no meaningful percentage change to report, so we report none
  // rather than dividing by zero and printing "Infinity%".
  if (baseline <= 0) return null;
  const percent = ((current - baseline) / baseline) * 100;
  if (Math.abs(percent) < 0.05) return { direction: 'flat', percent: 0 };
  return { direction: percent > 0 ? 'up' : 'down', percent };
}

function StatTile({ label, value, trend }: { label: Bilingual; value: string; trend?: Trend | null }) {
  return (
    <div className="stat-tile">
      {showsEnglish() ? <span className="stat-tile__label-en">{label.en}</span> : null}
      {showsCantonese() ? <span className="stat-tile__label-zh">{label.yue}</span> : null}
      <span className="stat-tile__value">{value}</span>
      {trend ? (
        <span className={`stat-tile__trend ${trend.direction}`}>
          <span aria-hidden="true">{TREND_GLYPH[trend.direction]}</span>
          {trend.direction === 'flat'
            ? ' No change this session · 呢節冇變'
            : ` ${trend.percent > 0 ? '+' : '−'}${Math.abs(trend.percent).toFixed(1)}% this session · 呢節${
                trend.direction === 'up' ? '升咗' : '跌咗'
              } ${Math.abs(trend.percent).toFixed(1)}%`}
        </span>
      ) : null}
    </div>
  );
}

export function StatisticsScreen() {
  const fast = useFastSnapshot();
  const stats = useStatsSnapshot();
  const structure = useStructureSnapshot();

  const multipliers = useMemo(() => computeMultipliers(structure), [structure]);
  const clickPower: BigNum = bnMulScalar(structure.baseClickValue, multipliers.clickMultiplier);

  // Session baselines, captured once on first render and never updated — this is the honest
  // source behind every "this session" trend below.
  const baselineRef = useRef<{ cps: number; clickPower: number } | null>(null);
  if (baselineRef.current === null) {
    baselineRef.current = { cps: bnToNumber(fast.cps), clickPower: bnToNumber(clickPower) };
  }
  const baseline = baselineRef.current;

  const unlockedAchievementCount = structure.achievements.length;
  const activeToolCount = TOOL_DEFINITIONS.filter((def) => isToolBonusActive(structure, def.id)).length;

  // Per-generator contributions, derived exactly the way cps.ts derives the total, so the
  // shares below always add up to the CPS shown at the top of the screen.
  const contributions = useMemo(() => {
    const totalNumeric = bnToNumber(totalCps(structure));
    return structure.generators
      .filter((owned) => owned.count > 0)
      .map((owned) => {
        const def = getGeneratorDefinition(owned.id);
        const perGenerator = bnMulScalar(
          bnMulScalar(generatorCps(def, owned.count), multipliers.generatorMultipliers[owned.id] ?? 1),
          multipliers.globalCpsMultiplier,
        );
        const numeric = bnToNumber(perGenerator);
        return {
          def,
          count: owned.count,
          cps: perGenerator,
          sharePercent: totalNumeric > 0 ? (numeric / totalNumeric) * 100 : 0,
        };
      })
      .sort((a, b) => b.sharePercent - a.sharePercent);
  }, [structure, multipliers]);

  return (
    <div className="screen">
      <h1>
        {showsEnglish() ? TAB_COPY.statistics.en : null}
        {showsCantonese() ? <span className="screen-title-zh">{TAB_COPY.statistics.yue}</span> : null}
      </h1>

      {/* aria-live="off": these figures change several times a second and must never be
          announced continuously. The throttled milestone region owned by App.tsx is the only
          thing that ever speaks. */}
      <div className="stat-grid" aria-live="off">
        <StatTile
          label={STATS_SCREEN_COPY.totalCookiesBaked}
          value={formatBigNum(stats.totalCookiesBaked, 'en')}
        />
        <StatTile label={STATS_SCREEN_COPY.lifetimeCookies} value={formatBigNum(fast.lifetimeCookies, 'en')} />
        <StatTile
          label={STATS_SCREEN_COPY.cookiesPerSecond}
          value={formatBigNum(fast.cps, 'en')}
          trend={trendSince(baseline.cps, bnToNumber(fast.cps))}
        />
        <StatTile
          label={STATS_SCREEN_COPY.clickPower}
          value={formatBigNum(clickPower, 'en')}
          trend={trendSince(baseline.clickPower, bnToNumber(clickPower))}
        />
        <StatTile label={STATS_SCREEN_COPY.totalClicks} value={stats.totalClicks.toLocaleString('en-US')} />
        <StatTile
          label={STATS_SCREEN_COPY.ascensionPoints}
          value={structure.prestige.ascensionPoints.toLocaleString('en-US')}
        />
        <StatTile
          label={STATS_SCREEN_COPY.prestigeRuns}
          value={structure.prestige.totalPrestigeCount.toLocaleString('en-US')}
        />
        <StatTile
          label={STATS_SCREEN_COPY.achievementsUnlocked}
          value={`${unlockedAchievementCount} / ${ACHIEVEMENT_DEFINITIONS.length}`}
        />
        <StatTile
          label={STATS_SCREEN_COPY.toolsUnlocked}
          value={`${activeToolCount} / ${TOOL_DEFINITIONS.length}`}
        />
        <StatTile
          label={STATS_SCREEN_COPY.clockAnomalies}
          value={stats.clockAnomalyCount.toLocaleString('en-US')}
        />
      </div>

      <h2 className="stat-section-heading">
        {showsEnglish() ? 'Where your cookies come from' : null}
        {showsCantonese() ? <span className="screen-title-zh">你嘅曲奇由邊度嚟</span> : null}
      </h2>
      {contributions.length === 0 ? (
        <p className="stat-empty">
          No generators owned yet — every cookie so far came from your own clicks. · 仲未有生產建築，
          到而家為止全部曲奇都係你自己撳返嚟。
        </p>
      ) : (
        <table className="contribution-table">
          <caption className="contribution-table__caption">
            Each generator&apos;s share of current cookies per second, including its upgrade and
            prestige multipliers. · 每種生產建築佔而家每秒產量嘅比例（已計埋升級同轉生加成）。
          </caption>
          <thead>
            <tr>
              <th scope="col">Generator · 生產建築</th>
              <th scope="col">Owned · 擁有</th>
              <th scope="col">CPS · 每秒產量</th>
              <th scope="col">Share · 佔比</th>
            </tr>
          </thead>
          <tbody>
            {contributions.map((row) => (
              <tr key={row.def.id}>
                <th scope="row">
                  {showsEnglish() ? row.def.nameEn : null}
                  {showsCantonese() ? <span className="contribution-table__name-zh">{row.def.nameYue}</span> : null}
                </th>
                <td className="numeric">{row.count.toLocaleString('en-US')}</td>
                <td className="numeric">{formatBigNum(row.cps, 'en')}</td>
                <td className="numeric">
                  {row.sharePercent.toFixed(1)}%
                  {/* The bar is decorative; the percentage beside it carries the meaning. */}
                  <span className="contribution-bar" aria-hidden="true">
                    <span
                      className="contribution-bar__fill"
                      style={{ width: `${Math.min(100, row.sharePercent)}%` }}
                    />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="stat-footnote">
        Prestige production bonus currently in effect: ×{prestigeMultiplierFor(structure.prestige.ascensionPoints).toFixed(2)}
        <span className="screen-title-zh">
          而家生效嘅轉生產量加成：×{prestigeMultiplierFor(structure.prestige.ascensionPoints).toFixed(2)}
        </span>
      </p>
    </div>
  );
}
