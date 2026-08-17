import { memo, useEffect, useMemo, useRef, useState } from 'react';

import {
  ACHIEVEMENT_DEFINITIONS,
  getAchievementDefinition,
  type AchievementCondition,
  type AchievementDefinition,
} from '../../shared/game/achievements.js';
import { AchievementMedal, type MedalFamily } from '../assets/icons.js';
import { createSearchState, SearchWithRegexBuilder } from '../components/SearchWithRegexBuilder.js';
import { TAB_COPY, showsEnglish, showsCantonese, ACHIEVEMENTS_COPY, bilingualText, LIST_COPY, type Bilingual } from '../game/copy.js';
import { useGameStoreInstance, useStructureSnapshot } from '../game/GameProvider.js';
import { matchesSearch } from '../game/local-regex-search.js';
import { detectMilestones, describeMilestone } from '../game/narration.js';

/** Matches design/achievement-badge.html's "~6s auto-dismiss". */
const TOAST_DISMISS_MS = 6_000;

/** Which struck medal face an achievement wears, taken from what it actually rewards. */
function medalFor(condition: AchievementCondition): MedalFamily {
  switch (condition.kind) {
    case 'lifetimeCookies':
      return 'cookies';
    case 'totalClicks':
      return 'clicks';
    case 'generatorOwned':
    case 'totalGeneratorsOwned':
    case 'generatorTypesOwned':
      return 'buildings';
    case 'prestigeCount':
    // A Reborn node is bought with ascension points and lives outside the run, so it wears the
    // prestige face rather than a face of its own.
    case 'rebornNodesOwned':
      return 'prestige';
    // Badges for buying upgrades, for collecting badges, and for the Diesel Depot's counters all
    // sit on the cookie face: they are all "you spent what the bakery made".
    case 'upgradesOwned':
    case 'achievementsUnlocked':
    case 'dieselLitresMinted':
    case 'dieselVouchersMinted':
      return 'cookies';
  }
}

const AchievementCell = memo(function AchievementCell({
  def,
  unlocked,
}: {
  def: AchievementDefinition;
  unlocked: boolean;
}) {
  // The unlocked badge's name is the SAME sentence the milestone region announces and the
  // unlock toast shows — one phrasing, produced by describeMilestone, not three.
  const label = unlocked
    ? bilingualText(describeMilestone({ kind: 'achievement', id: def.id }))
    : bilingualText(ACHIEVEMENTS_COPY.lockedHint);

  return (
    <div className="achievement-cell">
      {/* role="img" is a static role, so the badge is NOT a tab stop: making dozens of purely
          informational medals focusable forced keyboard users to Tab through the whole grid to
          reach the panel's close button. The aria-label keeps every badge in the accessibility
          tree and reachable in a screen reader's browse mode. */}
      <div className={`achievement-badge ${unlocked ? 'unlocked achievement-badge--minted' : 'locked'}`} role="img" aria-label={label}>
        <AchievementMedal family={unlocked ? medalFor(def.condition) : 'locked'} />
      </div>
      {showsEnglish() ? (
        <div className="achievement-name">{unlocked ? def.nameEn : ACHIEVEMENTS_COPY.lockedName.en}</div>
      ) : null}
      {showsCantonese() ? (
        <div className="achievement-name-zh">{unlocked ? def.nameYue : ACHIEVEMENTS_COPY.lockedName.yue}</div>
      ) : null}
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
 * The cabinet-wide unlock celebration (design/achievement-badge.html): a corner-anchored medal
 * toast that fires the MOMENT an achievement unlocks, wherever the player happens to be.
 *
 * It used to live inside the Achievements panel, which meant it could only ever be seen while
 * that panel was open — i.e. almost never, since achievements unlock during play. The shell
 * renders it now, so the medal always shows. It is driven by the SAME narration seam the status
 * region uses (`detectMilestones` / `describeMilestone` over each store dispatch) rather than a
 * second notion of "what just happened", so the two can never disagree, and it is `aria-hidden`:
 * the milestone status region is the single announcement to assistive tech, so an unlock is
 * never read out twice.
 */
export function AchievementUnlockToast() {
  const store = useGameStoreInstance();
  const [toast, setToast] = useState<ToastState | null>(null);
  const [toastPaused, setToastPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  if (!toast) return null;

  return (
    <div
      key={toast.key}
      className="achievement-toast"
      aria-hidden="true"
      onMouseEnter={() => setToastPaused(true)}
      onMouseLeave={() => setToastPaused(false)}
      onFocusCapture={() => setToastPaused(true)}
      onBlurCapture={() => setToastPaused(false)}
    >
      <div className="achievement-badge unlocked achievement-badge--minted achievement-toast__badge">
        <AchievementMedal family={toast.medal} />
      </div>
      <div className="achievement-toast__text">
        <strong>{bilingualText(ACHIEVEMENTS_COPY.unlockedToastTitle)}</strong>
        {bilingualText(toast.message)}
      </div>
    </div>
  );
}

/**
 * The Achievements screen: every achievement in the shared domain as a locked silhouette or an
 * unlocked medal badge. The unlock toast itself is rendered by the shell (see
 * `AchievementUnlockToast`) so the celebration is not trapped behind this panel being open.
 */
export function AchievementsScreen() {
  const structure = useStructureSnapshot();
  const [search, setSearch] = useState(createSearchState());

  const unlockedIds = useMemo(() => new Set(structure.achievements.map((a) => a.id)), [structure.achievements]);

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
        {showsEnglish() ? TAB_COPY.achievements.en : null}
        {showsCantonese() ? <span className="screen-title-zh">{TAB_COPY.achievements.yue}</span> : null}
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
        controlId="search.achievements"
      />
      {visible.length === 0 ? (
        <p>
          {bilingualText(LIST_COPY.noResults)}
        </p>
      ) : (
        <div className="achievement-grid">
          {visible.map((def) => (
            <AchievementCell key={def.id} def={def} unlocked={unlockedIds.has(def.id)} />
          ))}
        </div>
      )}

    </div>
  );
}
