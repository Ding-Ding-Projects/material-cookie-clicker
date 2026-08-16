import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { bnSub, bnToNumber } from '../../shared/game/big-number.js';
import { formatBigNum } from '../../shared/game/format-number.js';
import { createInitialGameState, type GameAction, type ReducerCtx } from '../../shared/game/reducer.js';
import type { GameState } from '../../shared/game/types.js';
import { OFFLINE_COPY, type Bilingual } from './copy.js';
import { describeMilestone, detectMilestones } from './narration.js';
import { OFFLINE_PROGRESS_OPTIONS, resolvePersistence, type GamePersistence } from './persistence.js';
import { createSessionRng } from './rng.js';
import { GameStore, type FastSnapshot } from './store.js';

/** Below this, offline progress is not worth interrupting the player to announce. */
const OFFLINE_NOTICE_THRESHOLD_MS = 60_000;
const TICK_INTERVAL_MS = 200;
const AUTOSAVE_INTERVAL_MS = 10_000;
const AUTOSAVE_DEBOUNCE_MS = 1_500;
/** How long a milestone announcement stays before the next one may replace it, matching
 *  narrator-toast.html's "~6s auto-dismiss" spec. */
const MILESTONE_DISPLAY_MS = 6_000;

interface GameContextValue {
  readonly store: GameStore;
  readonly dispatch: (action: GameAction) => GameState;
  readonly ready: boolean;
  readonly offlineNotice: Bilingual | null;
  readonly dismissOfflineNotice: () => void;
  readonly milestoneMessage: Bilingual | null;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<GameStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = new GameStore(createInitialGameState(new Date().toISOString()));
  }
  const store = storeRef.current;

  const rngRef = useRef(createSessionRng(0));
  const persistenceRef = useRef<GamePersistence>(resolvePersistence());
  const [ready, setReady] = useState(false);
  const [offlineNotice, setOfflineNotice] = useState<Bilingual | null>(null);
  const [milestoneMessage, setMilestoneMessage] = useState<Bilingual | null>(null);
  const milestoneQueueRef = useRef<Bilingual[]>([]);
  const milestoneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nowCtx = (): ReducerCtx => ({ now: () => Date.now(), rng: rngRef.current });

  const dispatch = (action: GameAction): GameState => store.dispatch(action, nowCtx());

  // Initial load: try the resolved persistence backend, run the offline-progress/clock-
  // protection path through the SAME reducer seam ("importSave"), and surface an honest
  // notice for every non-fresh outcome (loaded, recovered-from-backup, or quarantined).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const loaded = await persistenceRef.current.load();
      if (cancelled) return;
      const nowIso = new Date().toISOString();

      if (loaded.outcome === 'loaded' && loaded.state) {
        rngRef.current = createSessionRng(loaded.state.goldenCookie.rngStreamIndex);
        const savedCookies = loaded.state.cookies;
        const savedLastTick = Date.parse(loaded.state.lastTickAtIso);
        const next = store.dispatch(
          { type: 'importSave', savedState: loaded.state, nowIso, offlineOptions: OFFLINE_PROGRESS_OPTIONS },
          nowCtx(),
        );
        const wasClockAnomaly = next.stats.clockAnomalyCount > loaded.state.stats.clockAnomalyCount;
        const elapsedMs = Number.isFinite(savedLastTick) ? Date.parse(nowIso) - savedLastTick : 0;

        if (wasClockAnomaly) {
          setOfflineNotice(OFFLINE_COPY.clockAnomaly);
        } else if (elapsedMs > OFFLINE_NOTICE_THRESHOLD_MS) {
          const earned = bnSub(next.cookies, savedCookies);
          if (bnToNumber(earned) > 0) {
            const hours = (elapsedMs / (60 * 60 * 1000)).toFixed(1);
            setOfflineNotice(OFFLINE_COPY.welcomeBack(formatBigNum(earned, 'en'), `${hours}h`));
          }
        }
        if (loaded.detail) {
          setOfflineNotice(OFFLINE_COPY.saveCorrupt(loaded.detail));
        }
      } else if (loaded.outcome === 'quarantined') {
        store.replaceState(createInitialGameState(nowIso));
        setOfflineNotice(OFFLINE_COPY.saveCorrupt(loaded.detail ?? 'unknown error'));
      } else {
        store.replaceState(createInitialGameState(nowIso));
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The game tick loop: wall-clock-driven CPS accrual plus the golden-cookie schedule, both
  // applied through the one reducer seam. Not started until the initial load has resolved, so
  // a tick can never race ahead of an in-flight importSave.
  useEffect(() => {
    if (!ready) return;
    let lastTick = Date.now();
    const interval = setInterval(() => {
      const now = Date.now();
      const elapsedMs = now - lastTick;
      lastTick = now;
      if (elapsedMs > 0) dispatch({ type: 'tick', elapsedMs });
    }, TICK_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Milestone narration: every dispatch is diffed for milestones (see narration.ts — a plain
  // click that crosses no threshold produces zero events) and queued into the throttled
  // role="status" region, one message at a time.
  useEffect(() => {
    const unsubscribe = store.onDispatch((previous, next, action) => {
      const events = detectMilestones(previous, next, action);
      for (const event of events) milestoneQueueRef.current.push(describeMilestone(event));
      if (events.length > 0 && milestoneTimerRef.current === null) {
        advanceMilestoneQueue();
      }
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function advanceMilestoneQueue(): void {
    const next = milestoneQueueRef.current.shift();
    if (!next) {
      setMilestoneMessage(null);
      milestoneTimerRef.current = null;
      return;
    }
    setMilestoneMessage(next);
    milestoneTimerRef.current = setTimeout(advanceMilestoneQueue, MILESTONE_DISPLAY_MS);
  }

  useEffect(() => {
    return () => {
      if (milestoneTimerRef.current) clearTimeout(milestoneTimerRef.current);
    };
  }, []);

  // Autosave: debounced shortly after any discrete change, backstopped by a fixed interval so
  // a long idle-but-ticking session still persists CPS progress periodically.
  useEffect(() => {
    if (!ready) return;
    const unsubscribe = store.onDispatch((_previous, _next, action) => {
      if (action.type === 'tick') return;
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = setTimeout(() => {
        void persistenceRef.current.save(store.getState());
      }, AUTOSAVE_DEBOUNCE_MS);
    });
    const interval = setInterval(() => {
      void persistenceRef.current.save(store.getState());
    }, AUTOSAVE_INTERVAL_MS);
    return () => {
      unsubscribe();
      clearInterval(interval);
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const value: GameContextValue = {
    store,
    dispatch,
    ready,
    offlineNotice,
    dismissOfflineNotice: () => setOfflineNotice(null),
    milestoneMessage,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

function useGameContext(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame* hooks must be used inside <GameProvider>.');
  return ctx;
}

export function useGameDispatch(): (action: GameAction) => GameState {
  return useGameContext().dispatch;
}

export function useGameReady(): boolean {
  return useGameContext().ready;
}

export function useOfflineNotice(): { notice: Bilingual | null; dismiss: () => void } {
  const { offlineNotice, dismissOfflineNotice } = useGameContext();
  return { notice: offlineNotice, dismiss: dismissOfflineNotice };
}

export function useMilestoneMessage(): Bilingual | null {
  return useGameContext().milestoneMessage;
}

/** Fast slice: cookies / lifetimeCookies / derived CPS — updates on every click and tick. */
export function useFastSnapshot(): FastSnapshot {
  const { store } = useGameContext();
  return useSyncExternalStore(store.subscribeFast, store.getFastSnapshot, store.getFastSnapshot);
}

/** Stats slice: `state.stats` alone — also updates every click/tick. */
export function useStatsSnapshot(): GameState['stats'] {
  const { store } = useGameContext();
  return useSyncExternalStore(store.subscribeStats, store.getStatsSnapshot, store.getStatsSnapshot);
}

/** Structure slice: generators/upgrades/achievements/prestige/goldenCookie/toolProgression —
 *  updates only on discrete actions, never on a plain tick. */
export function useStructureSnapshot(): GameState {
  const { store } = useGameContext();
  return useSyncExternalStore(store.subscribeStructure, store.getStructureSnapshot, store.getStructureSnapshot);
}

export function useGameStoreInstance(): GameStore {
  return useGameContext().store;
}
