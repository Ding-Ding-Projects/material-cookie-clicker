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
import { cookiesSpentString, summarizeLedger, type LedgerSummary } from '../../shared/game/diesel-exchange.js';
import { formatBigNum } from '../../shared/game/format-number.js';
import { createInitialGameState, type GameAction, type ReducerCtx } from '../../shared/game/reducer.js';
import {
  FAST_RANDOM_EVENTS_FLAG,
  resolveRandomEventConfig,
  type RandomEventConfig,
} from '../../shared/game/random-events.js';
import {
  FAST_GOLDEN_COOKIE_FLAG,
  resolveGoldenCookieConfig,
  type GoldenCookieConfig,
} from '../../shared/game/golden-cookie.js';
import type { GameState } from '../../shared/game/types.js';
import { DIESEL_COPY, OFFLINE_COPY, type Bilingual } from './copy.js';
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

/**
 * What the Diesel Depot card is allowed to say, and no more.
 *
 * `summary` is read back from the ledger FILE, so `consumedCount` reports what WinForge has
 * actually marked — which, until the WinForge side exists, is zero and is shown as "none yet".
 * `bridgeAvailable` is false when the game is running somewhere without the preload bridge (a
 * browser tab, a test harness); the card then says plainly that nothing was written, rather
 * than pretending a mint reached a file.
 */
export interface DieselExchangeStatus {
  readonly bridgeAvailable: boolean;
  readonly summary: LedgerSummary | null;
  readonly ledgerPath: string | null;
  /** The identifier the main process wrote for the most recent voucher this session, or null
   *  when nothing has been minted yet (or the write failed). The purchase-feedback layer prints
   *  its short prefix on the voucher slip, so the slip shows a real id or nothing at all. */
  readonly lastVoucherId: string | null;
  /** Set when the last mint could not be written. Never cleared by a later failure's absence. */
  readonly error: Bilingual | null;
  readonly refresh: () => void;
}

interface GameContextValue {
  readonly store: GameStore;
  readonly dispatch: (action: GameAction) => GameState;
  readonly ready: boolean;
  readonly offlineNotice: Bilingual | null;
  readonly dismissOfflineNotice: () => void;
  readonly milestoneMessage: Bilingual | null;
  /**
   * Erases the persisted save and returns the live store to a fresh game. This is the
   * irreversible "full wipe" behind the destructive-action gate in PrestigeScreen; it is
   * deliberately NOT a reducer action, because a reducer action cannot reach the persistence
   * backend, and a wipe that cleared memory but left the save file on disk would resurrect
   * itself on the next launch.
   */
  readonly wipeAllSaveData: () => Promise<void>;
  readonly diesel: DieselExchangeStatus;
}

const GameContext = createContext<GameContextValue | null>(null);

/**
 * Reads one developer-only localStorage flag. Wrapped because storage can throw outright in a
 * locked-down context, and a game that refused to start because a private-mode browser said no
 * to a debug key would be a worse game than one with a slow event schedule.
 */
function readDevFlag(key: string): string | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage?.getItem(key) ?? null : null;
  } catch {
    return null;
  }
}

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
  const [dieselSummary, setDieselSummary] = useState<LedgerSummary | null>(null);
  const [dieselPath, setDieselPath] = useState<string | null>(null);
  const [dieselError, setDieselError] = useState<Bilingual | null>(null);
  const [lastVoucherId, setLastVoucherId] = useState<string | null>(null);

  /**
   * THE DEVELOPER-ONLY FAST EVENT SCHEDULE.
   *
   * Random events fire every three to ten minutes, which is right for playing and impossible
   * for photographing or for a smoke run. The window is therefore overridable by ONE
   * localStorage key, read once here at startup:
   *
   *     localStorage.setItem('material-cookie-clicker:events:fast', '1')
   *
   * with the key's name and the resolver both living in the domain (random-events.ts) so the
   * decision is tested rather than trusted. There is deliberately no button, no settings row and
   * no "spawn now" control anywhere in the shipped UI: a random event you can summon is not a
   * random event. A player who never sets the key can never reach this schedule, and the read is
   * wrapped because storage can throw in a locked-down context.
   */
  const randomEventConfigRef = useRef<RandomEventConfig | null>(null);
  if (randomEventConfigRef.current === null) {
    randomEventConfigRef.current = resolveRandomEventConfig(readDevFlag(FAST_RANDOM_EVENTS_FLAG));
  }

  /**
   * The same seam for GOLDEN cookies, read from its own key:
   *
   *     localStorage.setItem('material-cookie-clicker:golden:fast', '1')
   *
   * Five to fifteen minutes is right for playing and impossible to photograph, and the golden
   * cookie now has a puzzle behind it that has to be looked at to be checked. Resolver in the
   * domain (golden-cookie.ts#resolveGoldenCookieConfig), tested, and with no UI anywhere.
   */
  const goldenCookieConfigRef = useRef<GoldenCookieConfig | null>(null);
  if (goldenCookieConfigRef.current === null) {
    goldenCookieConfigRef.current = resolveGoldenCookieConfig(readDevFlag(FAST_GOLDEN_COOKIE_FLAG));
  }

  const nowCtx = (): ReducerCtx => ({
    now: () => Date.now(),
    rng: rngRef.current,
    randomEventConfig: randomEventConfigRef.current ?? undefined,
    goldenCookieConfig: goldenCookieConfigRef.current ?? undefined,
    // Read fresh on every dispatch rather than stored in state: it is an input to one decision
    // (whether a Mouse Raid may START — see random-events.ts#tickRandomEvents) and nothing
    // renders from it, so subscribing to visibilitychange would only re-render the tree for a
    // fact no component shows. NO CLOCK IS PAUSED BY THIS. Cookies keep accruing while the
    // window is hidden exactly as they did before, which is the same promise
    // offline-progress.ts makes for an app that is not running at all.
    windowHidden: typeof document !== 'undefined' ? document.visibilityState === 'hidden' : false,
  });

  const dieselBridge = typeof window !== 'undefined' ? window.materialCookieClicker?.diesel : undefined;

  /** Reads the shared ledger back and reports what is actually in it. */
  function refreshDieselLedger(): void {
    if (!dieselBridge) return;
    void dieselBridge
      .read()
      .then((response) => {
        if (response.ok) {
          setDieselSummary(summarizeLedger(response.ledger));
          setDieselPath(response.filePath);
        } else {
          setDieselError(DIESEL_COPY.ledgerUnreadable(response.reason));
        }
      })
      .catch((error: unknown) => {
        setDieselError(DIESEL_COPY.ledgerUnreadable(error instanceof Error ? error.message : String(error)));
      });
  }

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
        setOfflineNotice(OFFLINE_COPY.saveCorrupt(loaded.detail ?? OFFLINE_COPY.saveCorruptUnknown));
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

  // THE MINT SIDE EFFECT.
  //
  // The reducer already did the whole game half of a shipment — checked the reveal, checked the
  // tanks really hold the litres, drew them down, recorded the shipment — and it did it purely.
  // What it cannot do is write a file. This observer is the seam where that happens, and it is
  // the SAME seam autosave uses: subscribe to dispatches, look at what actually changed, and ask
  // the main process to do the I/O. A shipment the reducer refused changes nothing, so this sees
  // no litres and writes no voucher.
  //
  // It watches the STATE DIFF rather than the action kind, because there are now two ways a
  // shipment happens: the player pressing Ship, and an automation upgrade shipping on a `tick`.
  // Both draw from the same tanks through the same reducer helper, so both deserve a voucher —
  // and keying off the diff means neither can be forgotten when a third way is added.
  useEffect(() => {
    const unsubscribe = store.onDispatch((previous, next) => {
      const litres = next.dieselDepot.litresMinted - previous.dieselDepot.litresMinted;
      if (litres <= 0) return;
      if (!dieselBridge) {
        setDieselError(DIESEL_COPY.noBridge);
        return;
      }
      // The amortized share of what the plant cost to build (diesel-factory.ts), which is what
      // `cookiesSpent` means now that no cookies are handed over at the shipping counter.
      const cookiesSpent = cookiesSpentString(
        bnSub(next.dieselDepot.cookiesSpent, previous.dieselDepot.cookiesSpent),
      );
      void dieselBridge
        .mint({ litres, cookiesSpent })
        .then((response) => {
          if (response.ok) {
            setDieselPath(response.filePath);
            setLastVoucherId(response.voucher.id);
            setDieselError(null);
            refreshDieselLedger();
          } else {
            setDieselError(DIESEL_COPY.mintFailed(response.reason));
          }
        })
        .catch((error: unknown) => {
          setDieselError(DIESEL_COPY.mintFailed(error instanceof Error ? error.message : String(error)));
        });
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One read at startup, so the card opens with what the ledger really holds — including any
  // vouchers a previous run left behind, and anything WinForge has since marked consumed.
  useEffect(() => {
    refreshDieselLedger();
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
    wipeAllSaveData: async () => {
      // Order matters: clear the backend FIRST, so that if the fresh state's autosave races
      // in behind us it writes over an already-empty slot rather than us deleting it.
      await persistenceRef.current.wipe();
      store.replaceState(createInitialGameState(new Date().toISOString()));
    },
    diesel: {
      bridgeAvailable: Boolean(dieselBridge),
      summary: dieselSummary,
      ledgerPath: dieselPath,
      lastVoucherId,
      error: dieselError,
      refresh: refreshDieselLedger,
    },
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

export function useWipeAllSaveData(): () => Promise<void> {
  return useGameContext().wipeAllSaveData;
}

/** The Diesel Depot card's view of the exchange. */
export function useDieselExchange(): DieselExchangeStatus {
  return useGameContext().diesel;
}

export function useMilestoneMessage(): Bilingual | null {
  return useGameContext().milestoneMessage;
}

/** Fast slice: cookies / lifetimeCookies / derived CPS — updates on every click and tick. */
export function useFastSnapshot(): FastSnapshot {
  const { store } = useGameContext();
  return useSyncExternalStore(store.subscribeFast, store.getFastSnapshot, store.getFastSnapshot);
}

/**
 * The diesel factory's subtree (diesel-factory.ts). It has its OWN store slice, and must: the
 * factory moves on every tick that the line produces something, which is not the same set of
 * ticks on which `cookies` moves — a player with a refinery and no generators has a static
 * cookie count and a filling tank. Riding on the fast slice left the gauges frozen at zero
 * while the save underneath them really was accruing litres; this is that bug's fix.
 *
 * `tickFactory` returns the SAME object when a bare floor does nothing, so a game with no
 * factory built never re-renders for this at all.
 */
export function useFactorySnapshot(): GameState['dieselFactory'] {
  const { store } = useGameContext();
  return useSyncExternalStore(store.subscribeFactory, store.getFactorySnapshot, store.getFactorySnapshot);
}

/**
 * The home construction subtree (home-construction.ts). Its own slice for the same reason the
 * factory has one: a build in progress moves on every tick whether or not a cookie does, and the
 * progress bar has to move with it.
 */
export function useHomeSnapshot(): GameState['homeConstruction'] {
  const { store } = useGameContext();
  return useSyncExternalStore(store.subscribeHome, store.getHomeSnapshot, store.getHomeSnapshot);
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
