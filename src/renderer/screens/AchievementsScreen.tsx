import { memo, useEffect, useMemo, useRef, useState } from 'react';

import {
  ACHIEVEMENT_DEFINITIONS,
  getAchievementDefinition,
  type AchievementCondition,
  type AchievementDefinition,
} from '../../shared/game/achievements.js';
import { AchievementMedal, type MedalFamily } from '../assets/icons.js';
import { createSearchState, SearchWithRegexBuilder } from '../components/SearchWithRegexBuilder.js';
import { LIST_COPY, type Bilingual } from '../game/copy.js';
import { useGameStoreInstance, useStructureSnapshot } from '../game/GameProvider.js';
import { matchesSearch } from '../game/local-regex-search.js';
import { detectMilestones, describeMilestone } from '../game/narration.js';

/** Matches design/achievement-badge.html's "~6s auto-dismiss". */
const TOAST_DISMISS_MS = 6_000;

const ACHIEVEMENTS_COPY = {
  lockedName: { en: '???', yue: '未解鎖' },
  lockedHint: {
    en: 'Not unlocked yet — its name and icon stay hidden until you earn it.',
    yue: '仲未解鎖——攞到之前個名同圖示都會收埋。',
  },
  unlockedToastTitle: { en: 'Achievement unlocked', yue: '成就解鎖' },
  dismissToast: { en: 'Dismiss', yue: '關閉' },
} as const satisfies Record<string, Bilingual>;

/** Which struck medal face an achievement wears, taken from what it actually rewards. */
function medalFor(condition: AchievementCondition): MedalFamily {
  switch (condition.kind) {
    case 'lifetimeCookies':
      return 'cookies';
    case 'totalClicks':
      return 'clicks';
    case 'generatorOwned':
      return 'buildings';
    case 'prestigeCount':
      return 'prestige';
  }
}

const AchievementCell = memo(function AchievementCell({
  def,
  unlocked,
}: {
  def: AchievementDefinition;
  unlocked: boolean;
}) {
  const label = unlocked
    ? `Achievement unlocked: ${def.nameEn} · 成就已解鎖：${def.nameYue}`
    : `${ACHIEVEMENTS_COPY.lockedHint.en} · ${ACHIEVEMENTS_COPY.lockedHint.yue}`;

  return (
    <div className="achievement-cell">
      <div className={`achievement-badge ${unlocked ? 'unlocked' : 'locked'}`} role="img" aria-label={label} tabIndex={0}>
        <AchievementMedal family={unlocked ? medalFor(def.condition) : 'locked'} />
      </div>
      <div className="achievement-name">{unlocked ? def.nameEn : ACHIEVEMENTS_COPY.lockedName.en}</div>
      <div className="achievement-name-zh">{unlocked ? def.nameYue : ACHIEVEMENTS_COPY.lockedName.yue}</div>
    </div>
  );
});

interface ToastState {
  readonly key: number;
  readonly medal: MedalFamily;
  readonly message: Bilingual;
}

let toastKeySeq = 0;

/**
 * The Achievements screen: every achievement in the shared domain as a locked silhouette or an
 * unlocked medal badge, plus the celebratory unlock toast.
 *
 * The toast is driven by the SAME narration seam the status region uses — `detectMilestones` /
 * `describeMilestone` over each store dispatch — rather than a second, parallel notion of "what
 * just happened", so the two can never disagree. The toast is decorative and `aria-hidden`: the
 * milestone status region rendered by the shell is the single announcement to assistive tech, so
 * an unlock is never read out twice.
 */
export function AchievementsScreen() {
  const structure = useStructureSnapshot();
  const store = useGameStoreInstance();
  const [search, setSearch] = useState(createSearchState());
  const [toast, setToast] = useState<ToastState | null>(null);
  const [toastPaused, setToastPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const unlockedIds = useMemo(() => new Set(structure.achievements.map((a) => a.id)), [structure.achievements]);

  useEffect(() => {
    const unsubscribe = store.onDispatch((previous, next, action) => {
      for (const event of detectMilestones(previous, next, action)) {
        if (event.kind !== 'achievement') continue;
        setToast({
          key: ++toastKeySeq,
          medal: medalFor(getAchievementDefinition(event.id).condition),
          message: describeMilestone(event),
        });
      }
    });
    return unsubscribe;
  }, [store]);

  // Auto-dismiss, paused while the toast is hovered or holds focus.
  useEffect(() => {
    if (!toast || toastPaused) return;
    timerRef.current = setTimeout(() => setToast(null), TOAST_DISMISS_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast, toastPaused]);

  const visible = ACHIEVEMENT_DEFINITIONS.filter((def) => {
    const unlocked = unlockedIds.has(def.id);
    // A locked achievement's name is hidden from the player, so searching it would leak the
    // very text the badge deliberately withholds; locked cells match only an empty search.
    const haystack = unlocked ? `${def.nameEn} ${def.nameYue}` : `${ACHIEVEMENTS_COPY.lockedName.en} ???`;
    return matchesSearch(haystack, search);
  });

  return (
    <div className="screen">
      <h1>
        Achievements<span className="screen-title-zh">成就</span>
      </h1>
      <p className="screen-summary">
        {unlockedIds.size} / {ACHIEVEMENT_DEFINITIONS.length} unlocked · 已解鎖 {unlockedIds.size} /{' '}
        {ACHIEVEMENT_DEFINITIONS.length}
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
            <AchievementCell key={def.id} def={def} unlocked={unlockedIds.has(def.id)} />
          ))}
        </div>
      )}

      {toast ? (
        <div
          key={toast.key}
          className="achievement-toast"
          aria-hidden="true"
          onMouseEnter={() => setToastPaused(true)}
          onMouseLeave={() => setToastPaused(false)}
          onFocusCapture={() => setToastPaused(true)}
          onBlurCapture={() => setToastPaused(false)}
        >
          <div className="achievement-badge unlocked achievement-toast__badge">
            <AchievementMedal family={toast.medal} />
          </div>
          <div className="achievement-toast__text">
            <strong>
              {ACHIEVEMENTS_COPY.unlockedToastTitle.en} · {ACHIEVEMENTS_COPY.unlockedToastTitle.yue}
            </strong>
            {toast.message.en} · {toast.message.yue}
          </div>
        </div>
      ) : null}
    </div>
  );
}
