import { useRef, useState } from 'react';

import { formatBigNum } from '../../shared/game/format-number.js';
import { ascensionValue, canPrestige, prestigeMultiplierFor } from '../../shared/game/prestige.js';
import { getUpgradeDefinition } from '../../shared/game/upgrades.js';
import { DestructiveGate } from '../components/DestructiveGate.js';
import { PRESTIGE_SCREEN_COPY, STATS_SCREEN_COPY, TAB_COPY, type Bilingual } from '../game/copy.js';
import {
  useFastSnapshot,
  useGameDispatch,
  useStructureSnapshot,
  useWipeAllSaveData,
} from '../game/GameProvider.js';

/**
 * The Prestige screen: the player's permanent-bonus standing, an honest projection of what
 * ascending right now would earn, and the two destructive-action gates from
 * `design/prestige-gate.html`.
 *
 * The prestige gate confirms an action that flows through the domain's single mutation seam
 * (`applyGameAction` via `useGameDispatch`, action `{ type: 'prestige' }`) — this screen never
 * computes a reset itself. The wipe gate is the one action a reducer cannot express, because
 * it has to reach the persistence backend as well as memory; it goes through the provider's
 * `wipeAllSaveData`, which is documented as such on the context.
 *
 * Only one gate is open at a time, and opening either scrolls it into the same place, so the
 * two can never be confused for each other mid-drag.
 */
type OpenGate = 'none' | 'prestige' | 'wipe';

/** One prestige standing tile. Same markup StatisticsScreen renders, same copy source. */
function PrestigeStatTile({ label, value }: { label: Bilingual; value: string }) {
  return (
    <div className="stat-tile">
      <span className="stat-tile__label-en">{label.en}</span>
      <span className="stat-tile__label-zh">{label.yue}</span>
      <span className="stat-tile__value">{value}</span>
    </div>
  );
}

export function PrestigeScreen() {
  const dispatch = useGameDispatch();
  const wipeAllSaveData = useWipeAllSaveData();
  const structure = useStructureSnapshot();
  const fast = useFastSnapshot();

  const [openGate, setOpenGate] = useState<OpenGate>('none');
  const [completion, setCompletion] = useState<Bilingual | null>(null);
  const prestigeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const wipeTriggerRef = useRef<HTMLButtonElement | null>(null);

  const { ascensionPoints, totalPrestigeCount, permanentUnlockIds } = structure.prestige;
  const projectedPoints = ascensionValue(fast.lifetimeCookies);
  const eligible = canPrestige(structure);
  const multiplier = prestigeMultiplierFor(ascensionPoints);

  function closeGate(): void {
    setOpenGate('none');
    setCompletion(null);
  }

  return (
    <div className="screen">
      <h1>
        {TAB_COPY.prestige.en}
        <span className="screen-title-zh">{TAB_COPY.prestige.yue}</span>
      </h1>

      <div className="stat-grid" aria-live="off">
        {/* Labels come from STATS_SCREEN_COPY, the same block StatisticsScreen reads, so the two
            screens can never drift into two different names for the same number. */}
        <PrestigeStatTile label={STATS_SCREEN_COPY.ascensionPoints} value={ascensionPoints.toLocaleString('en-US')} />
        <PrestigeStatTile label={STATS_SCREEN_COPY.productionMultiplier} value={`×${multiplier.toFixed(2)}`} />
        <PrestigeStatTile label={STATS_SCREEN_COPY.prestigeRuns} value={totalPrestigeCount.toLocaleString('en-US')} />
        <PrestigeStatTile
          label={STATS_SCREEN_COPY.lifetimeCookiesThisRun}
          value={formatBigNum(fast.lifetimeCookies, 'en')}
        />
      </div>

      <section className="projection-card">
        <h2>
          {PRESTIGE_SCREEN_COPY.projectionTitle.en} · {PRESTIGE_SCREEN_COPY.projectionTitle.yue}
        </h2>
        <p>
          {eligible ? (
            <>
              {PRESTIGE_SCREEN_COPY.projectionBody(projectedPoints).en}
              <br />
              {PRESTIGE_SCREEN_COPY.projectionBody(projectedPoints).yue}
            </>
          ) : (
            <>
              {PRESTIGE_SCREEN_COPY.notYetEligible.en}
              <br />
              {PRESTIGE_SCREEN_COPY.notYetEligible.yue}
            </>
          )}
        </p>
        <p className="projection-card__detail">
          Each ascension point is a permanent +1% to total production, so ascending now would take
          you to ×{prestigeMultiplierFor(ascensionPoints + projectedPoints).toFixed(2)}. · 每粒飛升點
          等於永久 +1% 總產量，即係而家轉生會去到 ×
          {prestigeMultiplierFor(ascensionPoints + projectedPoints).toFixed(2)}。
        </p>
      </section>

      <section className="permanent-shop-card">
        <h2>
          {PRESTIGE_SCREEN_COPY.permanentShopTitle.en} · {PRESTIGE_SCREEN_COPY.permanentShopTitle.yue}
        </h2>
        {permanentUnlockIds.length === 0 ? (
          <p className="empty-slot">
            <span className="empty-slot__key">Nothing yet · 未有</span>
            <span className="empty-slot__text">
              {PRESTIGE_SCREEN_COPY.permanentShopEmpty.en}
              <br />
              {PRESTIGE_SCREEN_COPY.permanentShopEmpty.yue}
            </span>
          </p>
        ) : (
          <ul className="permanent-shop-card__list">
            {permanentUnlockIds.map((id) => {
              const def = getUpgradeDefinition(id);
              return (
                <li key={id}>
                  {def.nameEn} · {def.nameYue}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="gate-triggers">
        <button
          ref={prestigeTriggerRef}
          type="button"
          className="gate-trigger tone-prestige"
          disabled={!eligible || openGate !== 'none'}
          onClick={() => {
            setCompletion(null);
            setOpenGate('prestige');
          }}
        >
          {PRESTIGE_SCREEN_COPY.prestigeButton.en} · {PRESTIGE_SCREEN_COPY.prestigeButton.yue}
        </button>
        <button
          ref={wipeTriggerRef}
          type="button"
          className="gate-trigger tone-wipe"
          disabled={openGate !== 'none'}
          onClick={() => {
            setCompletion(null);
            setOpenGate('wipe');
          }}
        >
          {PRESTIGE_SCREEN_COPY.wipeButton.en} · {PRESTIGE_SCREEN_COPY.wipeButton.yue}
        </button>
      </div>

      {openGate === 'prestige' ? (
        <DestructiveGate
          tone="prestige"
          title={PRESTIGE_SCREEN_COPY.gatePrestigeTitle}
          key2Label={PRESTIGE_SCREEN_COPY.key2PrestigeLabel}
          impact={
            <>
              <strong>This will reset · 呢個會清空</strong>
              {PRESTIGE_SCREEN_COPY.gatePrestigeResets.en}
              <br />
              {PRESTIGE_SCREEN_COPY.gatePrestigeResets.yue}
              <strong>This carries forward · 呢個會保留</strong>
              {PRESTIGE_SCREEN_COPY.gatePrestigeKeeps(ascensionPoints + projectedPoints).en}
              <br />
              {PRESTIGE_SCREEN_COPY.gatePrestigeKeeps(ascensionPoints + projectedPoints).yue}
            </>
          }
          completion={completion}
          onConfirm={() => {
            const before = structure.prestige.ascensionPoints;
            const next = dispatch({ type: 'prestige' });
            // Report what the reducer actually awarded rather than the projection, so a
            // refusal or a mid-drag change of state can never be reported as a success.
            const awarded = next.prestige.ascensionPoints - before;
            setCompletion(PRESTIGE_SCREEN_COPY.prestigeCompleted(awarded));
          }}
          onExit={closeGate}
          returnFocusTo={prestigeTriggerRef}
        />
      ) : null}

      {openGate === 'wipe' ? (
        <DestructiveGate
          tone="wipe"
          title={PRESTIGE_SCREEN_COPY.gateWipeTitle}
          key2Label={PRESTIGE_SCREEN_COPY.key2WipeLabel}
          impact={
            <>
              <strong>This will permanently delete · 呢個會永久刪除</strong>
              {PRESTIGE_SCREEN_COPY.gateWipeBody.en}
              <br />
              {PRESTIGE_SCREEN_COPY.gateWipeBody.yue}
            </>
          }
          completion={completion}
          onConfirm={() => {
            void wipeAllSaveData().then(() => setCompletion(PRESTIGE_SCREEN_COPY.wipeCompleted));
          }}
          onExit={closeGate}
          returnFocusTo={wipeTriggerRef}
        />
      ) : null}
    </div>
  );
}
