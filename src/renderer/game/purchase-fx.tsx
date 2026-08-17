import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';

import { FuelNozzleIcon, JerrycanGaugeIcon } from '../assets/icons.js';
import { useDieselExchange, useGameStoreInstance } from './GameProvider.js';
import {
  DIESEL_TARGET_KEY,
  HUD_COOKIES_TARGET_KEY,
  detectPurchase,
  planCoinFlight,
  PurchaseFxQueue,
  type CoinPlan,
  type FxEffect,
  type Rectish,
} from './purchase-fx-core.js';

export {
  DIESEL_TARGET_KEY,
  HUD_COOKIES_TARGET_KEY,
  controlTargetKey,
  generatorTargetKey,
  upgradeTargetKey,
} from './purchase-fx-core.js';

/**
 * PURCHASE FEEDBACK — the DOM half.
 *
 * One layer for the whole game. Screens do not start animations and do not know one is
 * happening; they only say "this element is the thing called `generator:cursor`" via
 * `usePurchaseFxTarget`. The layer watches `GameStore.onDispatch` — the same seam narration
 * and the diesel voucher writer already use — and plays an effect only when the reducer
 * actually applied a purchase. A click on an unaffordable row changes no state, produces no
 * intent, and animates nothing.
 *
 * Everything that moves is a transform or an opacity on an element in this overlay, which is
 * `position: fixed`, `pointer-events: none`, and never in the layout of any control. A row can
 * bounce without the buy button shifting out from under the pointer, because the bounce is a
 * transform on the row and the coins are somewhere else entirely.
 */

/** Live map of animation target elements, keyed by the stable keys in purchase-fx-core. */
const targetElements = new Map<string, HTMLElement>();

/**
 * Registers an element as an animation target. Returns a ref callback; a component that
 * unmounts (a shop row scrolled out by a search, a ticket that just became owned) drops out of
 * the map, and an effect aimed at a target that is gone simply does not play.
 */
export function usePurchaseFxTarget<T extends HTMLElement>(key: string): (node: T | null) => void {
  return useCallback(
    (node: T | null) => {
      if (node) targetElements.set(key, node);
      else if (targetElements.get(key)) targetElements.delete(key);
    },
    [key],
  );
}

function rectOf(key: string): Rectish | null {
  const element = targetElements.get(key);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

/** The one-shot class each kind of purchase stamps on its target element. */
const TARGET_CLASS: Readonly<Record<FxEffect['kind'], string>> = {
  generator: 'fx-row-buy',
  upgrade: 'fx-ticket-tear',
  diesel: 'fx-depot-mint',
  control: 'fx-slot-accept',
};

interface CoinBurst {
  readonly id: number;
  readonly plans: readonly CoinPlan[];
  readonly golden: boolean;
}

interface TearOverlay {
  readonly id: number;
  readonly rect: Rectish;
}

interface PumpOverlay {
  readonly id: number;
  readonly rect: Rectish;
  readonly litres: number;
  readonly reduced: boolean;
}

let overlayIdSeq = 0;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function PurchaseFxLayer() {
  const store = useGameStoreInstance();
  const exchange = useDieselExchange();
  const queueRef = useRef<PurchaseFxQueue | null>(null);
  if (!queueRef.current) queueRef.current = new PurchaseFxQueue({ reducedMotion: prefersReducedMotion() });
  const queue = queueRef.current;

  const [coins, setCoins] = useState<readonly CoinBurst[]>([]);
  const [tears, setTears] = useState<readonly TearOverlay[]>([]);
  const [pumps, setPumps] = useState<readonly PumpOverlay[]>([]);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const startedRef = useRef<Set<number>>(new Set());
  const pumpTokenRef = useRef<string | null>(null);

  const later = useCallback((fn: () => void, ms: number) => {
    const timer = setTimeout(() => {
      timersRef.current.delete(timer);
      fn();
    }, ms);
    timersRef.current.add(timer);
  }, []);

  // Reduced-motion is read live, not once: switching the OS setting mid-session takes effect on
  // the next purchase rather than needing a restart.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => queue.setReducedMotion(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [queue]);

  /** Plays one effect: stamps the target, throws the coins, mounts whatever overlay it needs. */
  const play = useCallback(
    (effect: FxEffect) => {
      const reduced = prefersReducedMotion();
      const duration = queue.durationFor(effect.kind);
      const target = targetElements.get(effect.targetKey);
      const targetRect = rectOf(effect.targetKey);

      if (target) {
        const className = TARGET_CLASS[effect.kind];
        // Re-stamping mid-animation must restart it, so the class comes off first.
        target.classList.remove(className);
        void target.offsetWidth;
        target.classList.add(className);
        if (effect.ownedTo !== undefined) target.style.setProperty('--fx-owned-to', String(effect.ownedTo));
        later(() => target.classList.remove(className), duration + 40);
      }

      // The counter dips and settles on every applied purchase — the cookies really did leave.
      const hud = targetElements.get(HUD_COOKIES_TARGET_KEY);
      if (hud) {
        hud.classList.remove('fx-hud-dip');
        void hud.offsetWidth;
        hud.classList.add('fx-hud-dip');
        later(() => hud.classList.remove('fx-hud-dip'), 460);
      }

      // Coins travel, so under reduced motion they do not exist at all; the dip, the stamped
      // target state and the overlays below carry the whole message instead.
      if (!reduced && effect.coinBurst && targetRect) {
        const hudRect = rectOf(HUD_COOKIES_TARGET_KEY);
        if (hudRect) {
          const id = ++overlayIdSeq;
          const burst: CoinBurst = {
            id,
            plans: planCoinFlight(hudRect, targetRect, effect.quantity),
            golden: effect.kind !== 'generator',
          };
          setCoins((prev) => [...prev.slice(-3), burst]);
          later(() => setCoins((prev) => prev.filter((c) => c.id !== id)), 900);
        }
      }

      if (effect.kind === 'upgrade' && targetRect) {
        const id = ++overlayIdSeq;
        setTears((prev) => [...prev.slice(-2), { id, rect: targetRect }]);
        later(() => setTears((prev) => prev.filter((t) => t.id !== id)), duration + 120);
      }

      if (effect.kind === 'diesel' && targetRect) {
        const id = ++overlayIdSeq;
        pumpTokenRef.current = `pump-${id}`;
        setPumps((prev) => [...prev.slice(-1), { id, rect: targetRect, litres: effect.litresTo ?? effect.quantity, reduced }]);
        later(() => setPumps((prev) => prev.filter((p) => p.id !== id)), duration + 160);
      }
    },
    [later, queue],
  );

  // The dispatch observation. This is the gate: `detectPurchase` returns null for every action
  // the reducer refused, so nothing below ever runs on a rejected click.
  useEffect(() => {
    const unsubscribe = store.onDispatch((previous, next, action) => {
      const intent = detectPurchase(previous, next, action);
      if (!intent) return;
      queue.submit(intent, Date.now());
    });
    return unsubscribe;
  }, [store, queue]);

  // The pump loop. It only runs while something is in flight — an idle game schedules nothing.
  useEffect(() => {
    let frame: ReturnType<typeof setTimeout> | null = null;
    const drain = () => {
      const now = Date.now();
      queue.advance(now);
      for (const effect of queue.getActive()) {
        if (startedRef.current.has(effect.id)) continue;
        startedRef.current.add(effect.id);
        play(effect);
      }
      if (queue.getActive().length > 0 || queue.getPendingDieselCount() > 0) {
        frame = setTimeout(drain, 60);
      } else {
        frame = null;
        startedRef.current.clear();
      }
    };
    const unsubscribe = queue.subscribe(() => {
      if (frame === null) drain();
    });
    return () => {
      unsubscribe();
      if (frame) clearTimeout(frame);
    };
  }, [queue, play]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  // The voucher slip prints what the ledger actually gave back. Until the main process answers,
  // the slip says so rather than inventing an identifier.
  const voucherPrefix = exchange.lastVoucherId ? exchange.lastVoucherId.slice(0, 8) : null;

  return (
    <div className="purchase-fx" aria-hidden="true">
      {coins.map((burst) =>
        burst.plans.map((plan) => (
          <span
            key={`${burst.id}-${plan.index}`}
            className={`fx-coin${burst.golden ? ' fx-coin--golden' : ''}`}
            style={
              {
                left: `${plan.fromX}px`,
                top: `${plan.fromY}px`,
                '--fx-dx': `${plan.dx}px`,
                '--fx-dy': `${plan.dy}px`,
                '--fx-arc-x': `${plan.arcX}px`,
                '--fx-arc-y': `${plan.arcY}px`,
                '--fx-spin': `${plan.spinDeg}deg`,
                animationDelay: `${plan.delayMs}ms`,
              } as CSSProperties
            }
          />
        )),
      )}

      {tears.map((tear) => (
        <span
          key={tear.id}
          className="fx-tear"
          style={{ left: `${tear.rect.left}px`, top: `${tear.rect.top}px`, width: `${tear.rect.width}px`, height: `${tear.rect.height}px` }}
        >
          <span className="fx-tear__half fx-tear__half--top" />
          <span className="fx-tear__stub" />
          <span className="fx-tear__spark" />
        </span>
      ))}

      {pumps.map((pump) => (
        <span
          key={pump.id}
          className={`fx-pump${pump.reduced ? ' fx-pump--instant' : ''}`}
          style={{ left: `${pump.rect.left}px`, top: `${pump.rect.top}px`, width: `${pump.rect.width}px`, height: `${pump.rect.height}px` }}
        >
          <span className="fx-pump__hose">
            <FuelNozzleIcon extraClass="fx-pump__nozzle" />
          </span>
          <span className="fx-pump__can">
            <JerrycanGaugeIcon extraClass="fx-pump__can-art" />
          </span>
          <span className="fx-pump__drops">
            <span className="fx-pump__drop" />
            <span className="fx-pump__drop" />
            <span className="fx-pump__drop" />
            <span className="fx-pump__drop" />
          </span>
          <span className="fx-pump__litres">{pump.litres} L</span>
          <span className="fx-pump__voucher">
            <span className="fx-pump__voucher-key">VOUCHER</span>
            <span className="fx-pump__voucher-id">{voucherPrefix ?? '········'}</span>
          </span>
        </span>
      ))}
    </div>
  );
}

/** The depot's own target key, re-exported for screens that only need the constant. */
export const DEPOT_TARGET_KEY = DIESEL_TARGET_KEY;
