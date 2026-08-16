import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';

import { bnMulScalar } from '../shared/game/big-number.js';
import { formatBigNum } from '../shared/game/format-number.js';
import { isEffectActive } from '../shared/game/golden-cookie.js';
import { computeMultipliers } from '../shared/game/upgrades.js';
import {
  GameProvider,
  useFastSnapshot,
  useMilestoneMessage,
  useOfflineNotice,
  useStructureSnapshot,
} from './game/GameProvider';
import { GAME_SURFACE_COPY, SHELL_COPY, TAB_COPY, type Bilingual } from './game/copy';
import { AchievementsScreen } from './screens/AchievementsScreen';
import { CookieHero } from './screens/CookieHero';
import { ShopRail } from './screens/ShopRail';
import { PrestigeScreen } from './screens/PrestigeScreen';
import { StatisticsScreen } from './screens/StatisticsScreen';
import { ToolsScreen, type OpenApplicationFeature } from './screens/ToolsScreen';
import { UpgradeStrip } from './screens/UpgradeStrip';

/**
 * The dock order. `game` is the single surface the core loop lives on — clicking the cookie,
 * buying a generator and buying an upgrade all happen there with NO navigation between them.
 * The other four are genuinely secondary surfaces a player visits deliberately and briefly, and
 * they are the only reason a tab strip exists at all. Adding a core-loop control to one of them
 * would be a spec violation (design-v2/game-layout.html).
 */
const TAB_IDS = ['game', 'achievements', 'tools', 'statistics', 'prestige'] as const;

type TabId = (typeof TAB_IDS)[number];

/** v2 because the destination set changed: the old cookie/generators/upgrades tabs no longer
 *  exist, so a stored v1 choice must not resurrect a page that is now part of the game surface. */
const ACTIVE_TAB_KEY = 'material-cookie-clicker:active-tab:v2';

function isTabId(value: unknown): value is TabId {
  return typeof value === 'string' && (TAB_IDS as readonly string[]).includes(value);
}

function readStoredTab(): TabId {
  try {
    const stored = window.localStorage.getItem(ACTIVE_TAB_KEY);
    if (isTabId(stored)) return stored;
  } catch {
    // Private-mode / disabled storage: the tab choice simply does not persist.
  }
  return 'game';
}

/** Both labels for every dock button. The game surface has no TAB_COPY entry of its own because
 *  it is not one of the "sections" that list named; it is the game. */
const TAB_LABELS: Readonly<Record<TabId, Bilingual>> = {
  game: GAME_SURFACE_COPY.surfaceLabel,
  achievements: TAB_COPY.achievements,
  tools: TAB_COPY.tools,
  statistics: TAB_COPY.statistics,
  prestige: TAB_COPY.prestige,
};

/** How long a shell announcement stays in the status region before it clears itself. */
const SHELL_STATUS_MS = 6_000;

/**
 * The pinned HUD: cookies, cookies per second, cookies per click. Always visible, never scrolls
 * away, and the ONLY place any of those three numbers is shown — the hero panel deliberately does
 * not repeat the count. Everything here is `aria-live="off"`: the throttled milestone region is
 * the single thing that ever announces, so a screen reader is not flooded by the tick.
 */
function Hud() {
  const fast = useFastSnapshot();
  const structure = useStructureSnapshot();

  const clickValue = (() => {
    const multipliers = computeMultipliers(structure);
    let value = bnMulScalar(structure.baseClickValue, multipliers.clickMultiplier);
    const effect = structure.goldenCookie.activeEffect;
    if (effect?.kind === 'clickFrenzy' && effect.multiplier !== undefined && isEffectActive(effect, Date.now())) {
      value = bnMulScalar(value, effect.multiplier);
    }
    return value;
  })();

  return (
    <div className="hud" role="group" aria-label={`${GAME_SURFACE_COPY.hudLabel.en} · ${GAME_SURFACE_COPY.hudLabel.yue}`} aria-live="off">
      <HudReadout label={GAME_SURFACE_COPY.hudCookies} value={fast.cookies} />
      <HudReadout label={GAME_SURFACE_COPY.hudPerSecond} value={fast.cps} />
      <HudReadout label={GAME_SURFACE_COPY.hudPerClick} value={clickValue} />
    </div>
  );
}

/** One recessed bezel in the HUD. Both labels always show; the Cantonese *number* only shows when
 *  it actually reads differently from the English one (the two formatters agree on small values,
 *  and printing "4.06" twice would look like a rendering bug rather than a translation). */
function HudReadout({ label, value }: { label: Bilingual; value: Parameters<typeof formatBigNum>[0] }) {
  const en = formatBigNum(value, 'en');
  const yue = formatBigNum(value, 'yue');
  return (
    <div className="hud__readout">
      <span className="hud__key">
        {label.en} · {label.yue}
      </span>
      <span className="hud__value">{en}</span>
      {yue === en ? null : <span className="hud__value-zh">{yue}</span>}
    </div>
  );
}

/**
 * THE ONE SCREEN (design-v2/game-layout.html). Hero cookie plus the upgrade ticket strip in the
 * left column, the generator shop docked as a rail on the right, everything on a single surface.
 * Below ~900px the CSS turns the rail into a bottom drawer on this same surface — the cookie
 * stays visible above it and no route changes.
 */
function GameSurface() {
  return (
    <div className="stage">
      <div className="stage__hero-column">
        <CookieHero />
        <UpgradeStrip />
      </div>
      <ShopRail />
    </div>
  );
}

export function App() {
  const minimize = useCallback(() => window.materialCookieClicker?.window.minimize(), []);
  const toggleMaximize = useCallback(() => window.materialCookieClicker?.window.toggleMaximize(), []);
  const close = useCallback(() => window.materialCookieClicker?.window.close(), []);

  return (
    <div className="app-shell">
      <header className="title-bar" role="banner">
        <span className="title-bar__label">Material Cookie Clicker</span>
        <div className="title-bar__controls" role="group" aria-label="Window controls">
          <button type="button" className="title-bar__button" aria-label="Minimize window" onClick={minimize}>
            &#x2013;
          </button>
          <button type="button" className="title-bar__button" aria-label="Maximize or restore window" onClick={toggleMaximize}>
            &#x25A1;
          </button>
          <button type="button" className="title-bar__button title-bar__button--close" aria-label="Close window" onClick={close}>
            &#x2715;
          </button>
        </div>
      </header>
      {/* One GameProvider for the whole shell: every screen reads the same store, so switching
          tabs never restarts the tick loop or reloads the save. */}
      <GameProvider>
        <GameShell />
      </GameProvider>
    </div>
  );
}

function GameShell() {
  const [activeTab, setActiveTab] = useState<TabId>(readStoredTab);
  const [shellStatus, setShellStatus] = useState<Bilingual | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tabRefs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});
  const { notice: offlineNotice, dismiss: dismissOfflineNotice } = useOfflineNotice();
  const milestoneMessage = useMilestoneMessage();

  useEffect(() => {
    try {
      window.localStorage.setItem(ACTIVE_TAB_KEY, activeTab);
    } catch {
      // Non-fatal: persistence of the tab choice is a convenience, not game state.
    }
  }, [activeTab]);

  useEffect(() => {
    return () => {
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    };
  }, []);

  const announce = useCallback((message: Bilingual) => {
    setShellStatus(message);
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(() => setShellStatus(null), SHELL_STATUS_MS);
  }, []);

  /**
   * "Open it now" on a tool card. The preload bridge (src/preload/index.ts) exposes window
   * chrome only — minimize/maximize/close — and has no channel for opening an application
   * feature, so rather than inventing an IPC contract this lane does not own, the click is
   * answered honestly in the status region. Nothing here consults the tech tree: the handler
   * runs identically for every tool in every unlock state.
   */
  const openApplicationFeature = useCallback<OpenApplicationFeature>(
    (_toolId, def) => {
      announce(SHELL_COPY.featureSurfaceMissing(def.nameEn, def.nameYue));
    },
    [announce],
  );

  const focusTab = useCallback((id: TabId) => {
    setActiveTab(id);
    tabRefs.current[id]?.focus();
  }, []);

  const onTabKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
      // Horizontal dock, so Left/Right move; Up/Down are accepted too because the dock edge is
      // a layout choice and players reach for both. Home/End jump to the ends.
      let nextIndex: number | null = null;
      switch (event.key) {
        case 'ArrowDown':
        case 'ArrowRight':
          nextIndex = (index + 1) % TAB_IDS.length;
          break;
        case 'ArrowUp':
        case 'ArrowLeft':
          nextIndex = (index - 1 + TAB_IDS.length) % TAB_IDS.length;
          break;
        case 'Home':
          nextIndex = 0;
          break;
        case 'End':
          nextIndex = TAB_IDS.length - 1;
          break;
        default:
          return;
      }
      event.preventDefault();
      focusTab(TAB_IDS[nextIndex]);
    },
    [focusTab],
  );

  return (
    <main className="app-content" id="root-content">
      {/* One cabinet. The HUD is pinned to its top, the body holds either the game surface or one
          secondary surface, and the dock along the bottom is the only navigation in the app. */}
      <div className="cabinet">
        <Hud />

        <div
          className="cabinet-body"
          role="tabpanel"
          id={`panel-${activeTab}`}
          aria-labelledby={`tab-${activeTab}`}
          tabIndex={0}
        >
          {activeTab === 'game' ? (
            <GameSurface />
          ) : (
            <div className="tab-panel">
              {activeTab === 'achievements' && <AchievementsScreen />}
              {activeTab === 'tools' && <ToolsScreen onOpenApplicationFeature={openApplicationFeature} />}
              {activeTab === 'statistics' && <StatisticsScreen />}
              {activeTab === 'prestige' && <PrestigeScreen />}
            </div>
          )}
        </div>

        <div
          className="cabinet-dock"
          role="tablist"
          aria-orientation="horizontal"
          aria-label={`${SHELL_COPY.tabsLabel.en} · ${SHELL_COPY.tabsLabel.yue}`}
        >
          {TAB_IDS.map((id, index) => {
            const label = TAB_LABELS[id];
            const selected = id === activeTab;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                id={`tab-${id}`}
                className={`cabinet-dock__button${id === 'game' ? ' cabinet-dock__button--game' : ''}`}
                aria-selected={selected}
                aria-controls={`panel-${id}`}
                // Roving tabindex: exactly one tab is in the page tab order at a time, and the
                // arrow keys move between the rest.
                tabIndex={selected ? 0 : -1}
                ref={(node) => {
                  tabRefs.current[id] = node;
                }}
                onClick={() => setActiveTab(id)}
                onKeyDown={(event) => onTabKeyDown(event, index)}
              >
                {id === 'game' ? <span aria-hidden="true">🍪</span> : null}
                <span>{label.en}</span>
                <span className="cabinet-dock__label-zh">{label.yue}</span>
              </button>
            );
          })}
        </div>
      </div>

      {offlineNotice && (
        <div className="offline-banner" role="status">
          <span>{offlineNotice.en}</span>
          <span>{offlineNotice.yue}</span>
          <button type="button" className="offline-banner__dismiss" onClick={dismissOfflineNotice}>
            {SHELL_COPY.dismiss.en} · {SHELL_COPY.dismiss.yue}
          </button>
        </div>
      )}

      <div className="milestone-region" role="status" aria-live="polite">
        {milestoneMessage ? `${milestoneMessage.en} · ${milestoneMessage.yue}` : ''}
      </div>

      <div className="shell-status" role="status" aria-live="polite">
        {shellStatus ? `${shellStatus.en} · ${shellStatus.yue}` : ''}
      </div>
    </main>
  );
}
