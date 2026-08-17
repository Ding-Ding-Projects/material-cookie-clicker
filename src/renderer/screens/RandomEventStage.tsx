import { useEffect, useRef, useState, type CSSProperties } from 'react';

import { bnCompare, bnFromNumber } from '../../shared/game/big-number.js';
import { formatExact, formatExactDigits } from '../../shared/game/format-number.js';
import {
  BIGGER_WHACK_RADIUS_PX,
  getRandomEventDefinition,
  getRaidConsumableDefinition,
  isRaidConsumableAtCap,
  miceWithinWhackRadius,
  raidConsumablePrice,
  RAID_CONSUMABLE_DEFINITIONS,
  remainingFraction,
  remainingMs,
  type ActiveRandomEvent,
  type MousePoint,
  type RaidMouse,
  type RandomEventId,
} from '../../shared/game/random-events.js';
import { RainDropArt, MouseArt, OvenHiccupArt, RANDOM_EVENT_ART } from '../assets/icons.js';
import {
  bilingualText,
  MOUSE_RAID_COPY,
  RANDOM_EVENT_COPY,
  showsCantonese,
  showsEnglish,
} from '../game/copy.js';
import { describeMilestone, detectMilestones } from '../game/narration.js';
import { useGameDispatch, useGameStoreInstance, useStructureSnapshot } from '../game/GameProvider.js';
import type { Bilingual } from '../game/copy.js';

/**
 * The random-event surfaces (src/shared/game/random-events.ts), all three of them:
 *
 *   - `RandomEventStage`     — the clickable targets, ON the game stage where the cookie is.
 *   - `RandomEventIndicator` — what is running and how long is left, in the HUD.
 *   - `RandomEventToast`     — the marquee that names the event in both languages.
 *
 * Every one of them is a VIEW. Nothing here decides what an event is worth, when it ends, or
 * whether a click counted: each click dispatches `randomEventClick` with a target id and the
 * reducer answers. A target that is no longer really there is refused in the domain, so a
 * stale render cannot pay the player twice — which is why these components are free to be as
 * animated as they like.
 *
 * The honesty rules the rest of the app follows apply unchanged. Every target is a real
 * `<button>` with a real accessible name and a 44px hit area, never a decorated `<div>`. The
 * announcement is the existing throttled `role="status"` milestone region (narration.ts already
 * describes spawns and resolutions), so this file adds no second live region and the toast is
 * `aria-hidden`. Nothing an event does gates a feature; the worst one costs production for
 * thirty seconds and gives the player a button to end it early.
 */

/** How long the marquee names an event before it clears itself. Matches the achievement toast. */
const TOAST_DISMISS_MS = 6_000;

/** The raid aftermath carries a figure worth reading twice, so it stays up longer than a name. */
const RAID_AFTERMATH_DISMISS_MS = 12_000;

/**
 * A repainting clock for the countdown bar only.
 *
 * The game state does not change four times a second just because time passed, and it should
 * not: `remainingFraction` is derived from two epoch timestamps that were fixed when the event
 * spawned. So the bar drives itself from a local interval that runs ONLY while an event is
 * active, and stops the moment nothing is running.
 */
function useEventClock(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(interval);
  }, [active]);
  return now;
}

/**
 * Where drop number `index` falls, as a stable percentage across the stage.
 *
 * Deliberately arithmetic rather than random: the drops must sit in the same places on every
 * render, or React would move them mid-fall each time the state changed. The golden-ratio step
 * scatters twelve of them across the width without any two landing on top of each other, and
 * the same index also picks the fall delay, so they arrive staggered rather than as one row.
 */
function dropLayout(index: number): CSSProperties {
  const across = ((index * 0.6180339887) % 1) * 84 + 8;
  const delay = ((index * 0.4142135624) % 1) * 6;
  const drift = index % 2 === 0 ? 1 : -1;
  // The static (reduced-motion) position: the same column, spread down the stage instead of
  // falling through it, so the identical twelve targets are all reachable without any movement.
  const settled = 12 + ((index * 7) % 74);
  return {
    '--drop-x': `${across.toFixed(2)}%`,
    '--drop-y': `${settled}%`,
    '--drop-delay': `${delay.toFixed(2)}s`,
    '--drop-drift': `${drift * 14}px`,
  } as CSSProperties;
}

/**
 * The event layer over the game stage. Renders nothing at all — not an empty box, not a
 * zero-height div — when no clickable event is running, so it never takes part in layout.
 */
export function RandomEventStage() {
  const structure = useStructureSnapshot();
  const dispatch = useGameDispatch();
  const active = structure.randomEvents.active;

  if (!active || active.pendingTargetIds.length === 0) return null;
  const def = getRandomEventDefinition(active.id);
  if (def.shape !== 'clickable') return null;

  if (active.id === 'mouse_raid') return <MouseRaidStage active={active} />;

  if (active.id === 'oven_hiccup') {
    return (
      <div className="event-stage event-stage--oven">
        <button
          type="button"
          className="event-oven"
          aria-label={`${def.nameEn} · ${def.nameYue} — ${bilingualText(RANDOM_EVENT_COPY.fixOven)}`}
          onClick={() => dispatch({ type: 'randomEventClick', targetId: 'oven:fix' })}
        >
          <OvenHiccupArt extraClass="event-oven__art" />
          <span className="event-oven__label">
            {showsEnglish() ? <span>{def.nameEn}</span> : null}
            {showsCantonese() ? <span lang="zh-HK">{def.nameYue}</span> : null}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div
      className="event-stage event-stage--rain"
      role="group"
      aria-label={`${def.nameEn} · ${def.nameYue} — ${bilingualText(RANDOM_EVENT_COPY.stageLabel)}`}
    >
      {active.pendingTargetIds.map((targetId, index) => (
        <button
          key={targetId}
          type="button"
          className="event-drop"
          style={dropLayout(index)}
          aria-label={`${bilingualText(RANDOM_EVENT_COPY.catchDrop)} (${index + 1}/${active.pendingTargetIds.length})`}
          onClick={() => dispatch({ type: 'randomEventClick', targetId })}
        >
          <RainDropArt extraClass="event-drop__art" />
        </button>
      ))}
    </div>
  );
}


/* ------------------------------------------------------------------------- the mouse raid */

/**
 * Where mouse number `index` runs, as CSS custom properties.
 *
 * Arithmetic rather than random for the same reason the rain drops are: these positions have to
 * survive every re-render of the stage, and a mouse that teleported each time another mouse was
 * whacked would be unhittable. Each mouse gets its own lane down the lower half of the stage
 * (the counter, not the sky), its own delay, and its own direction, so five of them read as a
 * scattering of vermin rather than a marching band.
 *
 * `--mouse-settled` is the reduced-motion position: the same lane, a fixed spot along it. The
 * mouse is then still, still 56px, still worth exactly the same, and still whackable.
 */
function mouseLayout(index: number, total: number): CSSProperties {
  const lane = 52 + (index % total) * (40 / Math.max(1, total));
  const delay = ((index * 0.6180339887) % 1) * 1.6;
  const rightToLeft = index % 2 === 1;
  const settled = 10 + ((index * 19) % 72);
  return {
    '--mouse-lane': `${lane.toFixed(2)}%`,
    '--mouse-delay': `${delay.toFixed(2)}s`,
    '--mouse-settled': `${settled}%`,
    '--mouse-facing': rightToLeft ? '-1' : '1',
    animationDirection: rightToLeft ? 'reverse' : 'normal',
  } as CSSProperties;
}

interface SqueakPuff {
  readonly key: number;
  readonly x: number;
  readonly y: number;
}

let puffKeySeq = 0;

/**
 * THE RAID, on the stage: three to five real buttons running along the counter.
 *
 * Every mouse is a `<button>` with its own accessible name and a 56px hit area around a 36px
 * sprite — the target is deliberately bigger than the drawing, because the thing is MOVING and
 * a hit area that exactly matched the sprite would make a 44px minimum a fiction. Whacking one
 * dispatches `randomEventWhack`; the domain decides whether that mouse was really still there,
 * so a double-fired pointer or a stale render cannot whack the same mouse twice.
 *
 * The squeak puff is drawn where the pointer actually landed, measured against the stage box,
 * rather than at the mouse's last known lane: the mouse is gone from the state by the time this
 * renders, and a puff in the wrong place would be a small lie about where the player hit.
 */
function MouseRaidStage({ active }: { active: ActiveRandomEvent }) {
  const dispatch = useGameDispatch();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [puffs, setPuffs] = useState<readonly SqueakPuff[]>([]);
  const mice: readonly RaidMouse[] =
    active.mice ?? active.pendingTargetIds.map((id) => ({ id, hp: 1, maxHp: 1, share: 1, fat: false }));
  const total = mice.length + active.claimedCount;
  const wide = (active.armed ?? []).includes('bigger_whack');

  /**
   * Where the mice REALLY are, measured off their own buttons.
   *
   * A Bigger Whack reaches a radius around the press, and the mice are animated by the browser,
   * so the only honest answer to "what was within reach" is the one the layout gives. The view
   * measures; `miceWithinWhackRadius` (domain, tested) decides which of those are caught; and
   * the domain independently checks the player was entitled to a wide swing at all before
   * applying it, so a hand-built dispatch cannot clear a stage it did not pay for.
   */
  function measure(): readonly MousePoint[] {
    const root = stageRef.current;
    if (!root) return [];
    return [...root.querySelectorAll<HTMLElement>('.event-mouse')].map((button) => {
      const rect = button.getBoundingClientRect();
      return { id: button.dataset.mouseId ?? '', x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
  }

  function whack(targetId: string, event: { clientX: number; clientY: number }): void {
    const box = stageRef.current?.getBoundingClientRect();
    if (box && event.clientX > 0 && event.clientY > 0) {
      const puff: SqueakPuff = { key: ++puffKeySeq, x: event.clientX - box.left, y: event.clientY - box.top };
      setPuffs((current) => [...current, puff]);
      setTimeout(() => setPuffs((current) => current.filter((p) => p.key !== puff.key)), 700);
    }
    const caught = wide ? miceWithinWhackRadius(measure(), targetId, BIGGER_WHACK_RADIUS_PX) : [targetId];
    dispatch({ type: 'randomEventWhack', mouseIds: caught.length > 0 ? caught : [targetId] });
  }

  return (
    <div
      className={`event-stage event-stage--raid${wide ? ' event-stage--wide' : ''}`}
      ref={stageRef}
      role="group"
      aria-label={`${MOUSE_RAID_DEFINITION_NAME} — ${bilingualText(MOUSE_RAID_COPY.stageLabel)}`}
    >
      {mice.map((mouse, index) => (
        <button
          key={mouse.id}
          type="button"
          className={`event-mouse${mouse.fat ? ' event-mouse--fat' : ''}`}
          data-mouse-id={mouse.id}
          style={mouseLayout(index, total)}
          aria-label={
            mouse.maxHp > 1
              ? `${bilingualText(MOUSE_RAID_COPY.whackFat(mouse.hp))} (${index + 1}/${mice.length})`
              : `${bilingualText(MOUSE_RAID_COPY.whack)} (${index + 1}/${mice.length})`
          }
          onClick={(event) => whack(mouse.id, event)}
        >
          <MouseArt extraClass="event-mouse__art" />
          {/* A fat mouse shows how many more hits it needs, as pips rather than a number, so the
              information survives at 36px and does not have to be read. The count is in the
              accessible name as well, where it is words. */}
          {mouse.maxHp > 1 ? (
            <span className="event-mouse__pips" aria-hidden="true">
              {Array.from({ length: mouse.maxHp }, (_, pip) => (
                <span key={pip} className={pip < mouse.hp ? 'is-full' : 'is-spent'} />
              ))}
            </span>
          ) : null}
        </button>
      ))}
      {puffs.map((puff) => (
        <span
          key={puff.key}
          className="event-squeak"
          aria-hidden="true"
          style={{ left: `${puff.x}px`, top: `${puff.y}px` }}
        >
          {showsEnglish() ? 'squeak!' : '吱!'}
        </span>
      ))}
    </div>
  );
}

/**
 * THE RAID SUPPLIES SHELF: the three consumables, their prices, and what is in stock.
 *
 * It sits in the HUD beside the event indicator rather than in the generator shop, because these
 * are not production — they are what you are holding against the next raid, and the raid's own
 * corner of the cabinet is where a player will look for them. Prices are printed literally, like
 * every other price in this game, with the full digits on the control's title. A card that
 * cannot be bought is disabled and says why, rather than disappearing.
 *
 * There is nothing automatic here: no auto-buy, no subscription, no "restock" button. Each pass
 * is one deliberate purchase, exactly like a generator.
 */
export function RaidSuppliesShelf() {
  const structure = useStructureSnapshot();
  const dispatch = useGameDispatch();
  const consumables = structure.randomEvents.consumables;

  // The shelf appears once a save is rich enough to be raided at all (the same thousand-cookie
  // floor the raid itself uses) or once one raid has happened, so a fresh game is never shown a
  // shop for a mechanic it has not met.
  const met = structure.randomEvents.raidCount > 0 || bnCompare(structure.cookies, bnFromNumber(1_000)) >= 0;
  if (!met) return null;

  return (
    <div className="raid-supplies" role="group" aria-label={bilingualText(MOUSE_RAID_COPY.suppliesLabel)}>
      <span className="raid-supplies__title">
        {showsEnglish() ? <span>{MOUSE_RAID_COPY.suppliesLabel.en}</span> : null}
        {showsCantonese() ? (
          <span lang="zh-HK">{MOUSE_RAID_COPY.suppliesLabel.yue}</span>
        ) : null}
      </span>
      <ul className="raid-supplies__list">
        {RAID_CONSUMABLE_DEFINITIONS.map((def) => {
          const price = raidConsumablePrice(def.id, consumables);
          const atCap = isRaidConsumableAtCap(def.id, consumables);
          const affordable = bnCompare(structure.cookies, price) >= 0;
          const stock = consumables[def.id].stock;
          const priceText = formatExact(price, 'en');
          const definition = getRaidConsumableDefinition(def.id);
          return (
            <li key={def.id}>
              <button
                type="button"
                className="raid-supplies__buy"
                disabled={atCap || !affordable}
                title={`${definition.blurbEn} · ${definition.blurbYue} — ${formatExactDigits(price)}`}
                aria-label={`${def.nameEn} · ${def.nameYue} — ${bilingualText(
                  atCap ? MOUSE_RAID_COPY.suppliesFull : MOUSE_RAID_COPY.suppliesBuy(priceText),
                )} · ${bilingualText(MOUSE_RAID_COPY.suppliesStock(stock, def.stockCap))}`}
                onClick={() => dispatch({ type: 'buyRaidConsumable', consumableId: def.id })}
              >
                <span className="raid-supplies__name">
                  {showsEnglish() ? <span>{def.nameEn}</span> : null}
                  {showsCantonese() ? <span lang="zh-HK">{def.nameYue}</span> : null}
                </span>
                <span className="raid-supplies__stock">
                  {stock} / {def.stockCap}
                </span>
                <span className="raid-supplies__price">
                  {atCap ? bilingualText(MOUSE_RAID_COPY.suppliesFull) : priceText}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const MOUSE_RAID_DEFINITION_NAME = `${getRandomEventDefinition('mouse_raid').nameEn} · ${
  getRandomEventDefinition('mouse_raid').nameYue
}`;

/**
 * The HUD's active-event indicator: the event's emblem, its name in both languages, and a bar
 * that empties as the window closes. `aria-live="off"` like every other HUD readout — the
 * milestone region already announced this event once, and a bar that spoke four times a second
 * would be unusable.
 */
export function RandomEventIndicator() {
  const structure = useStructureSnapshot();
  const active = structure.randomEvents.active;
  const now = useEventClock(active !== null);

  if (!active) return null;
  const def = getRandomEventDefinition(active.id);
  const fraction = remainingFraction(structure.randomEvents, now);
  const seconds = Math.ceil(remainingMs(structure.randomEvents, now) / 1000);
  const Emblem = RANDOM_EVENT_ART[def.id];
  // A raid's indicator carries one extra fact the countdown cannot: how many mice are still
  // loose. That number is what the player is actually racing, and it is in the accessible name
  // as well as on the plate, because it changes with every whack.
  const isRaid = active.id === 'mouse_raid';
  const miceLeft = active.pendingTargetIds.length;
  const miceTotal = miceLeft + active.claimedCount;
  const miceLine = isRaid ? MOUSE_RAID_COPY.miceLeft(miceLeft, miceTotal) : null;

  return (
    <div
      className={`event-indicator${def.isSetback ? ' event-indicator--setback' : ''}${
        isRaid ? ' event-indicator--raid' : ''
      }`}
      aria-live="off"
      aria-label={`${bilingualText(RANDOM_EVENT_COPY.indicatorLabel)}: ${def.nameEn} · ${def.nameYue}${
        miceLine ? ` — ${bilingualText(miceLine)}` : ''
      }`}
    >
      <span className="event-indicator__emblem" aria-hidden="true">
        {Emblem ? <Emblem /> : null}
      </span>
      <span className="event-indicator__body">
        <span className="event-indicator__name">
          {showsEnglish() ? <span>{def.nameEn}</span> : null}
          {showsCantonese() ? <span lang="zh-HK">{def.nameYue}</span> : null}
        </span>
        <span className="event-indicator__bar" aria-hidden="true">
          <span className="event-indicator__fill" style={{ '--event-remaining': fraction } as CSSProperties} />
        </span>
        <span className="event-indicator__time">{seconds}s</span>
        {miceLine ? (
          <span className="event-indicator__mice">
            {showsEnglish() ? <span>{miceLine.en}</span> : null}
            {showsCantonese() ? <span lang="zh-HK">{miceLine.yue}</span> : null}
          </span>
        ) : null}
      </span>
    </div>
  );
}

/**
 * THE AFTERMATH TOAST: what the raid actually cost, or what defending it paid.
 *
 * Reads the domain's own finished-raid record (`randomEvents.lastRaid`), so the figure on screen
 * is the figure that left the balance rather than a percentage re-derived from a number that has
 * since moved. Amounts are printed with `formatExact` — the literal grouped figure, the same
 * treatment prices get — because "80% of your cookies" is not a number a player can check
 * against their counter and "12,481,003" is.
 *
 * Unlike the event marquee this one is NOT `aria-hidden`: it is still not a live region (the
 * status region announced the outcome once, through narration.ts), but it is real, focusable
 * content a screen-reader user can reach and re-read, which matters more here than for a toast
 * that only names an event. Dismissing it dispatches `randomEventRaidDismiss`, so closing it
 * actually clears the record rather than hiding something still notionally on screen.
 */
export function MouseRaidAftermathToast() {
  const structure = useStructureSnapshot();
  const dispatch = useGameDispatch();
  const raid = structure.randomEvents.lastRaid;

  useEffect(() => {
    if (!raid) return;
    const timer = setTimeout(() => dispatch({ type: 'randomEventRaidDismiss' }), RAID_AFTERMATH_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [raid, dispatch]);

  if (!raid) return null;
  // Three outcomes, three sentences, and the middle one is the reason this is not a boolean:
  // a raid stopped by a Whack Pass was NOT defended, and saying so is the difference between a
  // receipt and a flattering story. The pass line says a pass was spent, in as many words.
  function outcomeLine(locale: 'en' | 'yue') {
    if (raid!.defended) return MOUSE_RAID_COPY.defended(formatExact(raid!.reward, locale));
    if (raid!.passSpent) return MOUSE_RAID_COPY.passSpent(raid!.miceEscaped);
    return MOUSE_RAID_COPY.stolen(formatExact(raid!.stolen, locale), raid!.miceEscaped, raid!.miceTotal);
  }
  const line = outcomeLine('en');
  const lineYue = outcomeLine('yue');
  const spentEn = raid.consumablesSpent.map((id) => getRaidConsumableDefinition(id).nameEn).join(', ');
  const spentYue = raid.consumablesSpent.map((id) => getRaidConsumableDefinition(id).nameYue).join('、');
  const Emblem = RANDOM_EVENT_ART.mouse_raid;

  return (
    <div
      className={`raid-aftermath${raid.defended || raid.passSpent ? ' raid-aftermath--defended' : ''}`}
      role="group"
      aria-label={bilingualText(MOUSE_RAID_COPY.aftermathLabel)}
    >
      <span className="raid-aftermath__emblem" aria-hidden="true">{Emblem ? <Emblem /> : null}</span>
      {/* Past a quadrillion the sentence prints the compact figure, because that is what the
          rest of the game does with numbers a literal rendering cannot keep readable. The full
          digits are still available, on the title, so the exact amount is never unobtainable. */}
      <span
        className="raid-aftermath__lines"
        title={formatExactDigits(raid.defended ? raid.reward : raid.stolen)}
      >
        {showsEnglish() ? <span className="raid-aftermath__en">{line.en}</span> : null}
        {showsCantonese() ? (
          <span className="raid-aftermath__yue" lang="zh-HK">
            {lineYue.yue}
          </span>
        ) : null}
        {raid.defended || raid.passSpent ? null : (
          <span className="raid-aftermath__note">{bilingualText(MOUSE_RAID_COPY.historyNote)}</span>
        )}
        {raid.consumablesSpent.length > 0 ? (
          <span className="raid-aftermath__note">
            {showsEnglish() ? <span>{MOUSE_RAID_COPY.armedNote(spentEn).en}</span> : null}
            {showsCantonese() ? (
              <span lang="zh-HK">{MOUSE_RAID_COPY.armedNote(spentYue).yue}</span>
            ) : null}
          </span>
        ) : null}
      </span>
      <button
        type="button"
        className="raid-aftermath__dismiss"
        onClick={() => dispatch({ type: 'randomEventRaidDismiss' })}
      >
        {bilingualText(MOUSE_RAID_COPY.dismiss)}
      </button>
    </div>
  );
}

interface EventToast {
  readonly key: number;
  readonly id: RandomEventId;
  readonly message: Bilingual;
  readonly isSetback: boolean;
}

let toastKeySeq = 0;

/**
 * The marquee that names an event as it lands, in both languages.
 *
 * Driven off the SAME narration seam the status region uses — `detectMilestones` on every
 * dispatch — rather than off a second diff of its own, so the thing that is announced and the
 * thing that is drawn can never disagree about what happened. It is `aria-hidden` for exactly
 * that reason: the message has already been spoken once, by the one region that speaks.
 *
 * The dismiss button is real and focusable, and it also dispatches `randomEventResolve`, which
 * clears the domain's finished-event record. Closing the marquee therefore actually closes it
 * rather than hiding a thing that is still notionally on screen.
 */
export function RandomEventToast() {
  const store = useGameStoreInstance();
  const dispatch = useGameDispatch();
  const [toast, setToast] = useState<EventToast | null>(null);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubscribe = store.onDispatch((previous, next, action) => {
      for (const event of detectMilestones(previous, next, action)) {
        if (event.kind !== 'random-event-spawned') continue;
        setToast({
          key: ++toastKeySeq,
          id: event.id,
          message: describeMilestone(event),
          isSetback: getRandomEventDefinition(event.id).isSetback,
        });
      }
    });
    return unsubscribe;
  }, [store]);

  useEffect(() => {
    if (!toast || paused) return;
    timerRef.current = setTimeout(() => setToast(null), TOAST_DISMISS_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast, paused]);

  if (!toast) return null;
  const def = getRandomEventDefinition(toast.id);
  const Emblem = RANDOM_EVENT_ART[def.id];

  return (
    <div
      key={toast.key}
      className={`event-toast${toast.isSetback ? ' event-toast--setback' : ''}`}
      aria-hidden="true"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <span className="event-toast__emblem">{Emblem ? <Emblem /> : null}</span>
      <span className="event-toast__lines">
        {showsEnglish() ? <span className="event-toast__en">{toast.message.en}</span> : null}
        {showsCantonese() ? (
          <span className="event-toast__yue" lang="zh-HK">
            {toast.message.yue}
          </span>
        ) : null}
        {/* The warning line has to say what THIS setback actually does. An Oven Hiccup cuts
            production; a Mouse Raid does not touch production at all, it threatens the balance,
            so it gets its own line rather than inheriting a sentence that would be untrue. */}
        {def.isSetback ? (
          <span className="event-toast__warn">
            {bilingualText(def.id === 'mouse_raid' ? MOUSE_RAID_COPY.warning : RANDOM_EVENT_COPY.setbackNote)}
          </span>
        ) : null}
      </span>
      <button
        type="button"
        className="event-toast__dismiss"
        tabIndex={-1}
        onClick={() => {
          setToast(null);
          dispatch({ type: 'randomEventResolve' });
        }}
      >
        {bilingualText(RANDOM_EVENT_COPY.dismissToast)}
      </button>
    </div>
  );
}
