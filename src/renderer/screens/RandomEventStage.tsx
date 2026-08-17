import { useEffect, useRef, useState, type CSSProperties } from 'react';

import { bnCompare, bnFromNumber, type BigNum } from '../../shared/game/big-number.js';
import { formatExact, formatExactDigits } from '../../shared/game/format-number.js';
import {
  BIGGER_WHACK_RADIUS_PX,
  getRandomEventDefinition,
  getRaidConsumableDefinition,
  isRaidConsumableAtCap,
  miceWithinWhackRadius,
  nextWhackStoragePrice,
  raidConsumablePrice,
  whackStorageCap,
  RAID_CONSUMABLE_DEFINITIONS,
  remainingFraction,
  remainingMs,
  tasteTestServePayout,
  type ActiveRandomEvent,
  type MousePoint,
  type RaidConsumablesState,
  type RaidMouse,
  type RandomEventId,
} from '../../shared/game/random-events.js';
import {
  RainDropArt,
  MouseArt,
  OvenHiccupArt,
  ParcelArt,
  SprinkleArt,
  RANDOM_EVENT_ART,
} from '../assets/icons.js';
import {
  bilingualText,
  EVENT_EXTRA_COPY,
  MOUSE_RAID_COPY,
  RANDOM_EVENT_COPY,
  showsCantonese,
  showsEnglish,
} from '../game/copy.js';
import { describeMilestone, detectMilestones } from '../game/narration.js';
import { suppliesTargetKey, usePurchaseFxTarget } from '../game/purchase-fx.js';
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
 * describes spawns and resolutions), so this file adds no second live region: neither toast is a
 * live region, and both are reachable content rather than hidden decoration.
 * Nothing an event does gates a feature; the worst one costs production for
 * thirty seconds and gives the player a button to end it early.
 */

/**
 * An event's name joined to whatever the label goes on to say, ONE LANGUAGE AT A TIME.
 *
 * These labels used to be built as `${def.nameEn} · ${def.nameYue} — …`, which hardcoded the
 * paired presentation into every accessible name on this file: a player who set the language mode
 * to English or to Cantonese still heard both names, even though the visible spans beside them
 * obeyed the setting. copy.ts is explicit that `formatBilingual`/`bilingualText` is the one place
 * that decides which languages render, so the pair is assembled here and formatted there.
 */
function namedLabel(def: { readonly nameEn: string; readonly nameYue: string }, tail: Bilingual): string {
  return bilingualText({ en: `${def.nameEn} — ${tail.en}`, yue: `${def.nameYue}——${tail.yue}` });
}

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

  if (!active) return null;
  const def = getRandomEventDefinition(active.id);

  // A choice event has no targets at all — it has a question, and the question is the stage.
  if (def.shape === 'choice') return <TasteTestStage active={active} />;

  if (active.pendingTargetIds.length === 0) return null;
  if (def.shape !== 'clickable') return null;

  if (active.id === 'mouse_raid') return <MouseRaidStage active={active} />;
  if (active.id === 'sprinkle_storm') return <SprinkleStormStage active={active} />;
  if (active.id === 'delivery_rush') return <DeliveryRushStage active={active} />;

  if (active.id === 'oven_hiccup') {
    return (
      <div className="event-stage event-stage--oven">
        <button
          type="button"
          className="event-oven"
          aria-label={namedLabel(def, RANDOM_EVENT_COPY.fixOven)}
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
      aria-label={namedLabel(def, RANDOM_EVENT_COPY.stageLabel)}
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


/* --------------------------------------------------------------------- the sprinkle storm */

/**
 * THE SPRINKLE STORM: ten targets whose value climbs as the stage clears.
 *
 * Laid out by the same golden-ratio arithmetic the rain uses, for the same reason — a target
 * that moved when a sibling was claimed would be unhittable — but scattered across the WHOLE
 * stage rather than falling down it, because sprinkles land everywhere and the difference in
 * motion is what tells the two events apart at a glance.
 *
 * The accessible name counts down how many are left, which is the fact that actually matters
 * here: because each sprinkle is worth more than the last, "three left" is a much more useful
 * thing to know than "this is sprinkle number seven".
 */
function SprinkleStormStage({ active }: { active: ActiveRandomEvent }) {
  const dispatch = useGameDispatch();
  const def = getRandomEventDefinition('sprinkle_storm');
  const left = active.pendingTargetIds.length;

  return (
    <div
      className="event-stage event-stage--sprinkles"
      role="group"
      aria-label={namedLabel(def, RANDOM_EVENT_COPY.stageLabel)}
    >
      {active.pendingTargetIds.map((targetId, index) => {
        const seed = Number(targetId.split(':')[1] ?? index);
        const across = ((seed * 0.6180339887) % 1) * 80 + 10;
        const down = ((seed * 0.7548776662) % 1) * 70 + 12;
        const spin = ((seed * 0.4142135624) % 1) * 180 - 90;
        return (
          <button
            key={targetId}
            type="button"
            className="event-sprinkle"
            style={
              {
                '--sprinkle-x': `${across.toFixed(2)}%`,
                '--sprinkle-y': `${down.toFixed(2)}%`,
                '--sprinkle-spin': `${spin.toFixed(1)}deg`,
                '--sprinkle-delay': `${((seed * 0.31) % 1).toFixed(2)}s`,
              } as CSSProperties
            }
            aria-label={bilingualText(EVENT_EXTRA_COPY.catchSprinkle(left, def.targetCount))}
            onClick={() => dispatch({ type: 'randomEventClick', targetId })}
          >
            <SprinkleArt extraClass="event-sprinkle__art" />
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------------- the delivery rush */

/**
 * THE DELIVERY RUSH: three parcels, and only one of them live.
 *
 * The chain rule is enforced in the domain, not here — an out-of-order press is refused by
 * `clickRandomEventTarget` — but the view has to make it VISIBLE, or a refused click reads as a
 * broken button. So the next parcel is the only one that is enabled: the other two are real
 * `<button>`s carrying `disabled`, dimmed, and their accessible names say "not this one yet".
 * A disabled control that explains itself is a much better answer than an enabled one that
 * silently does nothing.
 */
function DeliveryRushStage({ active }: { active: ActiveRandomEvent }) {
  const dispatch = useGameDispatch();
  const def = getRandomEventDefinition('delivery_rush');
  const nextId = active.pendingTargetIds[0];

  return (
    <div
      className="event-stage event-stage--delivery"
      role="group"
      aria-label={namedLabel(def, RANDOM_EVENT_COPY.stageLabel)}
    >
      <ul className="event-parcels">
        {active.pendingTargetIds.map((targetId) => {
          const index = Number(targetId.split(':')[1] ?? 0);
          const isNext = targetId === nextId;
          return (
            <li key={targetId}>
              <button
                type="button"
                className={`event-parcel${isNext ? ' event-parcel--next' : ''}`}
                disabled={!isNext}
                aria-label={bilingualText(
                  isNext
                    ? EVENT_EXTRA_COPY.sendParcel(index + 1, def.targetCount)
                    : EVENT_EXTRA_COPY.parcelWaiting(index + 1),
                )}
                onClick={() => dispatch({ type: 'randomEventClick', targetId })}
              >
                <ParcelArt extraClass="event-parcel__art" />
                <span className="event-parcel__index" aria-hidden="true">
                  {index + 1}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- the taste test */

/**
 * THE TASTE TEST: two buttons, and the numbers on both of them.
 *
 * The accessibility story is the reason this is a plain card of two real buttons rather than
 * anything cleverer. It is a `role="group"` with a name, the two answers are ordinary focusable
 * `<button>`s in DOM order, each one's accessible name states what it pays, and the note under
 * them says outright that letting the clock run out gives you neither — so a player using a
 * screen reader has exactly the same information a sighted player reads off the card, including
 * the part that is easy to leave out.
 *
 * Once "send it back" is pressed the card becomes a one-line statement that the buff is running,
 * with no buttons at all: there is nothing left to decide, and leaving a dead control on screen
 * would be inviting a click that the domain would refuse.
 */
function TasteTestStage({ active }: { active: ActiveRandomEvent }) {
  const dispatch = useGameDispatch();
  const structure = useStructureSnapshot();
  const def = getRandomEventDefinition('taste_test');

  if (active.choiceTaken !== undefined) {
    return (
      <div className="event-stage event-stage--choice">
        <p className="event-choice__running">{bilingualText(EVENT_EXTRA_COPY.buffRunning)}</p>
      </div>
    );
  }

  // The serve button prints the literal figure it pays, like every other amount in this game,
  // computed from the same domain function the reducer will use when the button is pressed.
  const servePayout = tasteTestServePayout(structure);

  return (
    <div
      className="event-stage event-stage--choice"
      role="group"
      aria-label={namedLabel(def, EVENT_EXTRA_COPY.chooseLabel)}
    >
      <div className="event-choice">
        <p className="event-choice__prompt">
          {showsEnglish() ? <span>{def.blurbEn}</span> : null}
          {showsCantonese() ? <span lang="zh-HK">{def.blurbYue}</span> : null}
        </p>
        <div className="event-choice__options">
          <button
            type="button"
            className="event-choice__option event-choice__option--now"
            title={formatExactDigits(servePayout)}
            /* Each half of the label carries the payout formatted for ITS OWN locale, exactly as
               the two visible spans below do. Passing the 'en' figure to both put English compact
               suffixes inside the Cantonese sentence. */
            aria-label={bilingualText({
              en: EVENT_EXTRA_COPY.chooseServe(formatExact(servePayout, 'en')).en,
              yue: EVENT_EXTRA_COPY.chooseServe(formatExact(servePayout, 'yue')).yue,
            })}
            onClick={() => dispatch({ type: 'randomEventChoose', choiceId: 'serve' })}
          >
            {showsEnglish() ? (
              <span>{EVENT_EXTRA_COPY.chooseServe(formatExact(servePayout, 'en')).en}</span>
            ) : null}
            {showsCantonese() ? (
              <span lang="zh-HK">{EVENT_EXTRA_COPY.chooseServe(formatExact(servePayout, 'yue')).yue}</span>
            ) : null}
          </button>
          <button
            type="button"
            className="event-choice__option event-choice__option--later"
            aria-label={bilingualText(EVENT_EXTRA_COPY.chooseSendBack)}
            onClick={() => dispatch({ type: 'randomEventChoose', choiceId: 'send_back' })}
          >
            {showsEnglish() ? <span>{EVENT_EXTRA_COPY.chooseSendBack.en}</span> : null}
            {showsCantonese() ? <span lang="zh-HK">{EVENT_EXTRA_COPY.chooseSendBack.yue}</span> : null}
          </button>
        </div>
        <p className="event-choice__note">{bilingualText(EVENT_EXTRA_COPY.chooseNote)}</p>
      </div>
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
      aria-label={namedLabel(getRandomEventDefinition('mouse_raid'), MOUSE_RAID_COPY.stageLabel)}
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
/**
 * One supply plate: a real buy control, in the coin-press idiom the rest of the cabinet uses.
 *
 * Its own component only because each plate registers itself as a purchase-fx target, and a
 * hook cannot be called inside a `.map`. Everything it decides it decides from the domain —
 * price, cap, affordability — and everything it does it does by dispatching, so a stale render
 * cannot buy anything the reducer would refuse.
 */
function SupplyPlate({ def, cookies, consumables, cap }: {
  readonly def: (typeof RAID_CONSUMABLE_DEFINITIONS)[number];
  readonly cookies: BigNum;
  readonly consumables: RaidConsumablesState;
  readonly cap: number;
}) {
  const dispatch = useGameDispatch();
  const fxRef = usePurchaseFxTarget<HTMLSpanElement>(suppliesTargetKey(def.id));
  const price = raidConsumablePrice(def.id, consumables);
  const stock = consumables[def.id].stock;
  const atCap = stock >= cap;
  const affordable = bnCompare(cookies, price) >= 0;
  const priceText = formatExact(price, 'en');
  const definition = getRaidConsumableDefinition(def.id);
  // The state line and the stock line, each assembled per language before formatting, so
  // the mode setting reaches these labels the way it reaches the visible spans.
  const state: Bilingual = atCap
    ? MOUSE_RAID_COPY.suppliesFull
    : {
        en: MOUSE_RAID_COPY.suppliesBuy(formatExact(price, 'en')).en,
        yue: MOUSE_RAID_COPY.suppliesBuy(formatExact(price, 'yue')).yue,
      };
  const stockLine = MOUSE_RAID_COPY.suppliesStock(stock, cap);
  const label = bilingualText({
    en: `${def.nameEn} — ${state.en} ${stockLine.en}`,
    yue: `${def.nameYue}——${state.yue} ${stockLine.yue}`,
  });
  return (
    /* Never `disabled`: the same rule CoinSlot states and the home buy buttons follow.
       A pass you cannot afford is still where its price is written, the press is
       refused by the domain, and narration.ts speaks the refusal. */
    <button
      type="button"
      className="raid-supplies__buy"
      aria-disabled={atCap || !affordable}
      title={bilingualText({ en: definition.blurbEn, yue: definition.blurbYue })}
      aria-label={label}
      onClick={() => dispatch({ type: 'buyRaidConsumable', consumableId: def.id })}
    >
      <span className="raid-supplies__name">
        {showsEnglish() ? <span>{def.nameEn}</span> : null}
        {showsCantonese() ? <span lang="zh-HK">{def.nameYue}</span> : null}
      </span>
      <span className="raid-supplies__stock" ref={fxRef}>
        {stock} / {cap}
      </span>
      <span className="raid-supplies__price">
        {atCap ? bilingualText(MOUSE_RAID_COPY.suppliesFull) : priceText}
      </span>
    </button>
  );
}

/**
 * The storage chip: it reads "Storage 3" and it is ITSELF the ladder's buy control, rather than
 * a badge beside one. A number a player wants to raise and a button that raises it are the same
 * thing here, which is one control instead of two and one place to look.
 */
function StorageChip({ level, cookies }: { readonly level: number; readonly cookies: BigNum }) {
  const dispatch = useGameDispatch();
  const fxRef = usePurchaseFxTarget<HTMLSpanElement>(suppliesTargetKey('storage'));
  const cap = whackStorageCap(level);
  const price = nextWhackStoragePrice(level);
  const maxed = price === null;
  const affordable = price !== null && bnCompare(cookies, price) >= 0;
  const nextCap = maxed ? cap : whackStorageCap(level + 1);
  const label = maxed
    ? bilingualText(MOUSE_RAID_COPY.storageMax(cap))
    : bilingualText({
        en: MOUSE_RAID_COPY.storageBuy(nextCap, formatExact(price, 'en')).en,
        yue: MOUSE_RAID_COPY.storageBuy(nextCap, formatExact(price, 'yue')).yue,
      });
  return (
    <button
      type="button"
      className="raid-supplies__storage"
      aria-disabled={maxed || !affordable}
      title={label}
      aria-label={label}
      onClick={() => dispatch({ type: 'buyWhackStorage' })}
    >
      <span className="raid-supplies__storage-chip" ref={fxRef}>
        {showsEnglish() ? <span>{MOUSE_RAID_COPY.storageChip(cap).en}</span> : null}
        {showsCantonese() ? <span lang="zh-HK">{MOUSE_RAID_COPY.storageChip(cap).yue}</span> : null}
      </span>
      <span className="raid-supplies__storage-price">
        {maxed ? bilingualText(MOUSE_RAID_COPY.suppliesFull) : formatExact(price, 'en')}
      </span>
    </button>
  );
}

export function RaidSuppliesShelf() {
  const structure = useStructureSnapshot();
  const consumables = structure.randomEvents.consumables;
  const level = structure.randomEvents.whackStorageLevel;
  const cap = whackStorageCap(level);

  // The shelf appears once a save is rich enough to be raided at all (the same thousand-cookie
  // floor the raid itself uses) or once one raid has happened, so a fresh game is never shown a
  // shop for a mechanic it has not met.
  const met = structure.randomEvents.raidCount > 0 || bnCompare(structure.cookies, bnFromNumber(1_000)) >= 0;
  if (!met) return null;

  return (
    <div className="raid-supplies" role="group" aria-label={bilingualText(MOUSE_RAID_COPY.suppliesLabel)}>
      <div className="raid-supplies__head">
        <span className="raid-supplies__title">
          {showsEnglish() ? <span>{MOUSE_RAID_COPY.suppliesLabel.en}</span> : null}
          {showsCantonese() ? (
            <span lang="zh-HK">{MOUSE_RAID_COPY.suppliesLabel.yue}</span>
          ) : null}
        </span>
        <StorageChip level={level} cookies={structure.cookies} />
      </div>
      <ul className="raid-supplies__list">
        {RAID_CONSUMABLE_DEFINITIONS.map((def) => (
          <li key={def.id}>
            <SupplyPlate def={def} cookies={structure.cookies} consumables={consumables} cap={cap} />
          </li>
        ))}
      </ul>
    </div>
  );
}

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
      // The class accent is data-driven rather than a chain of id checks: `event-indicator--frenzy`,
      // `--clot`, `--chain`, `--choice`, `--tradeoff` or `--boon`, straight off the definition. A
      // new event gets its warm or cold plate by declaring what it is.
      className={`event-indicator event-indicator--${def.eventClass}${
        def.isSetback ? ' event-indicator--setback' : ''
      }${isRaid ? ' event-indicator--raid' : ''}`}
      aria-live="off"
      aria-label={bilingualText({
        en: `${RANDOM_EVENT_COPY.indicatorLabel.en}: ${def.nameEn}${miceLine ? ` — ${miceLine.en}` : ''}`,
        yue: `${RANDOM_EVENT_COPY.indicatorLabel.yue}：${def.nameYue}${miceLine ? `——${miceLine.yue}` : ''}`,
      })}
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

  // The record is destroyed when this fires, and the whole point of this toast is that a
  // screen-reader user can reach it and re-read the figure. So the clock stops while a pointer is
  // over it or focus is inside it, and starts again from the top when they leave (WCAG 2.2.1).
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (!raid || held) return;
    const timer = setTimeout(() => dispatch({ type: 'randomEventRaidDismiss' }), RAID_AFTERMATH_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [raid, held, dispatch]);

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
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
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

/**
 * The one-line note the marquee prints under an event's name, or null when the name and the
 * blurb already said everything there is to say.
 */
function eventNote(id: RandomEventId, isSetback: boolean): Bilingual | null {
  switch (id) {
    case 'mouse_raid':
      return MOUSE_RAID_COPY.warning;
    case 'clot':
      return EVENT_EXTRA_COPY.clotNote;
    case 'flour_shortage':
      return EVENT_EXTRA_COPY.reboundNote;
    case 'night_shift':
      return EVENT_EXTRA_COPY.nightShiftNote;
    case 'combo_window':
      return EVENT_EXTRA_COPY.comboNote;
    case 'production_frenzy':
    case 'click_frenzy':
    case 'burnt_batch_frenzy':
      return EVENT_EXTRA_COPY.frenzyNote;
    default:
      return isSetback ? RANDOM_EVENT_COPY.setbackNote : null;
  }
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
 * thing that is drawn can never disagree about what happened. It is `not a live region for exactly
 * that reason: the message has already been spoken once, by the one region that speaks.
 *
 * The dismiss button is real and focusable, and it also dispatches `randomEventResolve`, which
 * clears the domain's finished-event record. Closing the marquee therefore actually closes it
 * rather than hiding a thing that is still notionally on screen. Because that button performs a
 * real state change, the marquee is NOT `aria-hidden`: a control nobody can reach is worse than
 * no control. The six-second clock pauses on hover AND on focus, so a keyboard or touch user can
 * hold it open long enough to press it.
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
      className={`event-toast event-toast--${def.eventClass}${
        toast.isSetback ? ' event-toast--setback' : ''
      }`}
      /* NOT aria-hidden any more. It carries a real dismiss button that clears domain state, and
         an interactive control inside a hidden subtree is a control keyboard and screen-reader
         users simply cannot operate. It is still not a live region — the status region spoke this
         message once, through narration.ts — but it is now reachable, re-readable content, the
         same shape the raid aftermath toast already had. */
      role="group"
      aria-label={bilingualText(RANDOM_EVENT_COPY.toastLabel)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className="event-toast__emblem" aria-hidden="true">{Emblem ? <Emblem /> : null}</span>
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
        {/* The note under the name says what THIS event actually does. A generic "production is
            down" line would be wrong about a Mouse Raid (which does not touch production), wrong
            about a Flour Shortage (which pays it all back), and useless on a Clot (whose whole
            point is that there is no button). So each one carries its own sentence. */}
        {eventNote(def.id, def.isSetback) ? (
          <span className={`event-toast__warn${def.isSetback ? '' : ' event-toast__warn--good'}`}>
            {bilingualText(eventNote(def.id, def.isSetback)!)}
          </span>
        ) : null}
      </span>
      <button
        type="button"
        className="event-toast__dismiss"
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
