import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';

import { GameProvider, useMilestoneMessage, useOfflineNotice } from './game/GameProvider';
import { SHELL_COPY, TAB_COPY, type Bilingual } from './game/copy';
import { AchievementsScreen } from './screens/AchievementsScreen';
import { CookieScreen } from './screens/CookieScreen';
import { GeneratorsScreen } from './screens/GeneratorsScreen';
import { PrestigeScreen } from './screens/PrestigeScreen';
import { StatisticsScreen } from './screens/StatisticsScreen';
import { ToolsScreen, type OpenApplicationFeature } from './screens/ToolsScreen';
import { UpgradesScreen } from './screens/UpgradesScreen';

/** Dock order of the seven destinations. TAB_COPY supplies both labels for each. */
const TAB_IDS = [
  'cookie',
  'generators',
  'upgrades',
  'achievements',
  'tools',
  'statistics',
  'prestige',
] as const;

type TabId = (typeof TAB_IDS)[number];

const ACTIVE_TAB_KEY = 'material-cookie-clicker:active-tab:v1';

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
  return 'cookie';
}

/** How long a shell announcement stays in the status region before it clears itself. */
const SHELL_STATUS_MS = 6_000;

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
      // Vertical strip, so Up/Down move; Left/Right are accepted too because the dock edge is
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
      <div className="tab-strip" role="tablist" aria-orientation="vertical" aria-label={SHELL_COPY.tabsLabel.en}>
        {TAB_IDS.map((id, index) => {
          const label = TAB_COPY[id];
          const selected = id === activeTab;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              id={`tab-${id}`}
              className="tab-strip__button"
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
              <span>{label.en}</span>
              <span className="tab-strip__label-zh">{label.yue}</span>
            </button>
          );
        })}
      </div>

      <div
        className="tab-panel"
        role="tabpanel"
        id={`panel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
        tabIndex={0}
      >
        {activeTab === 'cookie' && <CookieScreen />}
        {activeTab === 'generators' && <GeneratorsScreen />}
        {activeTab === 'upgrades' && <UpgradesScreen />}
        {activeTab === 'achievements' && <AchievementsScreen />}
        {activeTab === 'tools' && <ToolsScreen onOpenApplicationFeature={openApplicationFeature} />}
        {activeTab === 'statistics' && <StatisticsScreen />}
        {activeTab === 'prestige' && <PrestigeScreen />}
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
