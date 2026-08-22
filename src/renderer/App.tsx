import { useCallback, useRef, useState, type ComponentType, type KeyboardEvent } from 'react';

import {
  reduceTabs,
  resolveKeyboardMove,
  sortTabs,
  type TabModel,
  type TabsState,
} from '@material-cookie-clicker/surface-kernel';

import { bilingualText, NARRATOR_COPY, TAB_COPY } from './game/copy.js';
import { GameProvider, useGameReady, useMilestoneMessage, useOfflineNotice } from './game/GameProvider.js';
import { AchievementsScreen } from './screens/AchievementsScreen.js';
import { CookieScreen } from './screens/CookieScreen.js';
import { GeneratorsScreen } from './screens/GeneratorsScreen.js';
import { PrestigeScreen } from './screens/PrestigeScreen.js';
import { StatisticsScreen } from './screens/StatisticsScreen.js';
import { ToolsScreen } from './screens/ToolsScreen.js';
import { UpgradesScreen } from './screens/UpgradesScreen.js';

type DestinationId = keyof typeof TAB_COPY;

const DESTINATION_IDS: readonly DestinationId[] = [
  'cookie',
  'generators',
  'upgrades',
  'achievements',
  'tools',
  'statistics',
  'prestige',
];

const SCREENS: Record<DestinationId, ComponentType> = {
  cookie: CookieScreen,
  generators: GeneratorsScreen,
  upgrades: UpgradesScreen,
  achievements: AchievementsScreen,
  tools: ToolsScreen,
  statistics: StatisticsScreen,
  prestige: PrestigeScreen,
};

function destinationTab(id: DestinationId, order: number): TabModel {
  // Seven fixed destinations: none closable, none pinned, no groups. The shared tabs engine
  // still owns ordering/activation so keyboard behaviour matches every sibling surface.
  return { id, order, pinned: false, groupId: null, closable: false };
}

const INITIAL_TABS: TabsState = {
  tabs: DESTINATION_IDS.map((id, index) => destinationTab(id, index)),
  groups: [],
  activeId: 'cookie',
};

function TabStrip({ state, onActivate }: { state: TabsState; onActivate: (id: string) => void }) {
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  const ordered = sortTabs(state.tabs);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    const targetId = resolveKeyboardMove(state.tabs, state.activeId ?? '', event.key, 'left');
    if (!targetId) return;
    event.preventDefault();
    onActivate(targetId);
    buttonRefs.current.get(targetId)?.focus();
  }

  return (
    <nav className="tab-strip" role="tablist" aria-orientation="vertical" aria-label="Game destinations · 遊戲目的地">
      {ordered.map((tab) => {
        const copy = TAB_COPY[tab.id as DestinationId];
        const selected = state.activeId === tab.id;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              if (el) buttonRefs.current.set(tab.id, el);
              else buttonRefs.current.delete(tab.id);
            }}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            className="tab-strip__button"
            aria-selected={selected}
            aria-controls={`panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onActivate(tab.id)}
            onKeyDown={handleKeyDown}
          >
            <span>{copy.en}</span>
            <span className="tab-strip__label-zh">{copy.yue}</span>
          </button>
        );
      })}
    </nav>
  );
}

function OfflineBanner() {
  const { notice, dismiss } = useOfflineNotice();
  if (!notice) return null;
  return (
    <div className="offline-banner" role="status">
      <span>{notice.en}</span>
      <span style={{ fontFamily: 'var(--font-zh)' }}>{notice.yue}</span>
      <button type="button" className="offline-banner__dismiss" onClick={dismiss}>
        OK
      </button>
    </div>
  );
}

/** The throttled milestone announcer — the ONLY aria-live surface in the game, one message at
 *  a time (see GameProvider's queue); the raw cookie counter is deliberately aria-live="off". */
function MilestoneRegion() {
  const message = useMilestoneMessage();
  return (
    <div className="milestone-region" role="status" aria-label={bilingualText(NARRATOR_COPY.regionLabel)}>
      {message ? bilingualText(message) : ''}
    </div>
  );
}

function GameShell() {
  const ready = useGameReady();
  const [tabs, setTabs] = useState<TabsState>(INITIAL_TABS);
  const activate = useCallback((id: string) => setTabs((prev) => reduceTabs(prev, { type: 'activate', id })), []);

  const activeId = (tabs.activeId ?? 'cookie') as DestinationId;
  const ActiveScreen = SCREENS[activeId];

  return (
    <div className="app-content" id="root-content">
      <TabStrip state={tabs} onActivate={activate} />
      <div role="tabpanel" id={`panel-${activeId}`} aria-labelledby={`tab-${activeId}`} style={{ display: 'contents' }}>
        {ready ? <ActiveScreen /> : <div className="screen">…</div>}
      </div>
      <OfflineBanner />
      <MilestoneRegion />
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
      <GameProvider>
        <GameShell />
      </GameProvider>
    </div>
  );
}
