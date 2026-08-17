import { memo, useState } from 'react';

import { bnCompare, bnFromNumber } from '../../shared/game/big-number.js';
import { formatExact, formatExactDigits } from '../../shared/game/format-number.js';
import {
  buildProgressFraction,
  builtRoom,
  computeHomeBonuses,
  furnitureForRoom,
  getRoomDefinition,
  isBlueprintOffered,
  isRoomBuilt,
  MAX_COZINESS,
  ownsBlueprint,
  ownsFurniture,
  remainingBuildMs,
  requiredBuildMs,
  roomCoziness,
  ROOM_DEFINITIONS,
  canStartConstruction,
  type FurnitureDefinition,
  type HomeConstructionState,
  type RoomDefinition,
} from '../../shared/game/home-construction.js';
import { bilingualText, showsCantonese, showsEnglish, HOME_COPY, LIST_COPY } from '../game/copy.js';
import { useFastSnapshot, useGameDispatch, useHomeSnapshot } from '../game/GameProvider.js';

/**
 * THE HOME PANEL — the bakery-home, on its own console surface.
 *
 * Laid out the way you would look at a doll's house with the front taken off: a CUTAWAY GRID of
 * room cards, each drawn rather than listed. A room is in exactly one of three states and looks
 * like it — a plan you could buy, a site under construction with a real progress bar and an
 * honest countdown, or a finished room with its furniture standing in it.
 *
 * WHAT IT WILL NOT DO. It never shows a room as built while it is still going up, it never shows
 * a time remaining it has not derived from the real elapsed milliseconds, and it never shows a
 * furniture bonus the player has not bought. Every price is printed literally and grouped: a
 * blueprint costs "5,000", not "5 thousand".
 */

/** Literal grouped digits. Every price and count on this panel goes through here. */
function figure(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/** Milliseconds as minutes and seconds, in both languages. Rounded UP, so a countdown never
 *  prints "0s" while there is still work to do. */
function durationText(ms: number): string {
  const totalSeconds = Math.ceil(Math.max(0, ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return bilingualText(HOME_COPY.duration(minutes, seconds));
}

function percentText(fraction: number): string {
  return Math.round(Math.min(1, Math.max(0, fraction)) * 100).toLocaleString('en-US');
}

// ------------------------------------------------------------------- the coziness gauge ----

/**
 * The coziness meter, drawn as the same bevelled bezel the HUD readouts use: a dial arc with a
 * needle at the real fraction of MAX_COZINESS, the literal score beside it, and — the part that
 * matters — what the score is actually WORTH, as a percentage, derived from the same curve the
 * cookie economy multiplies by. There is no second number here; it is that one.
 */
function CozinessGauge({ home }: { home: HomeConstructionState }) {
  const bonuses = computeHomeBonuses(home);
  const fraction = MAX_COZINESS > 0 ? bonuses.coziness / MAX_COZINESS : 0;
  const bonusPercent = ((bonuses.globalCpsMultiplier - 1) * 100).toFixed(1);
  // -120deg at empty through +120deg at full: a 240-degree sweep, which is what the dial's
  // painted arc covers.
  const needleAngle = -120 + Math.min(1, Math.max(0, fraction)) * 240;

  return (
    <section className="home-coziness" aria-label={bilingualText(HOME_COPY.cozinessTitle)}>
      <h3 className="home-section__title">{bilingualText(HOME_COPY.cozinessTitle)}</h3>
      <div className="home-coziness__body">
        <div
          className="home-gauge"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={MAX_COZINESS}
          aria-valuenow={Math.round(bonuses.coziness)}
          aria-label={bilingualText(
            HOME_COPY.cozinessMeterLabel(figure(Math.round(bonuses.coziness)), figure(MAX_COZINESS)),
          )}
        >
          <span className="home-gauge__arc" aria-hidden="true" />
          <span className="home-gauge__fill" style={{ '--home-gauge-fraction': fraction } as React.CSSProperties} aria-hidden="true" />
          <span className="home-gauge__needle" style={{ transform: `rotate(${needleAngle}deg)` }} aria-hidden="true" />
          <span className="home-gauge__hub" aria-hidden="true" />
          <span className="home-gauge__value" aria-hidden="true">
            {figure(Math.round(bonuses.coziness))}
          </span>
        </div>
        <div className="home-coziness__text">
          <p className="home-note">
            {bonuses.coziness > 0
              ? bilingualText(HOME_COPY.cozinessEffect(bonusPercent))
              : bilingualText(HOME_COPY.cozinessNone)}
          </p>
          <dl className="home-figures">
            <HomeFigure label={HOME_COPY.cozinessOf} value={`${figure(Math.round(bonuses.coziness))} / ${figure(MAX_COZINESS)}`} />
            <HomeFigure label={HOME_COPY.roomsBuiltLabel} value={`${figure(home.rooms.length)} / ${figure(ROOM_DEFINITIONS.length)}`} />
            <HomeFigure
              label={HOME_COPY.furnitureOwnedLabel}
              value={figure(home.rooms.reduce((sum, r) => sum + r.furnitureIds.length, 0))}
            />
            <HomeFigure label={HOME_COPY.buildSpeedLabel} value={`+${percentText(bonuses.buildSpeedFraction)}%`} />
            <HomeFigure label={HOME_COPY.investedLabel} value={`🍪 ${formatExact(home.cookiesInvested, 'en')}`} />
          </dl>
        </div>
      </div>
    </section>
  );
}

function HomeFigure({ label, value }: { label: { en: string; yue: string }; value: string }) {
  return (
    <div className="home-figure">
      <dt>{bilingualText(label)}</dt>
      <dd>{value}</dd>
    </div>
  );
}

// ------------------------------------------------------------------ the building site ----

/**
 * The queue, which is a queue of one and says so. When something is going up this is the real
 * progress bar and the real countdown; when nothing is, it is the sentence explaining why there
 * is no second slot to put anything in.
 */
function BuildingSite({ home }: { home: HomeConstructionState }) {
  const build = home.build;
  const fraction = buildProgressFraction(home);
  const remaining = remainingBuildMs(home);

  return (
    <section className="home-site" aria-label={bilingualText(HOME_COPY.queueTitle)}>
      <h3 className="home-section__title">{bilingualText(HOME_COPY.queueTitle)}</h3>
      {build && fraction !== null && remaining !== null ? (
        <div className="home-site__active">
          <p className="home-site__what">
            {/* Both halves get their OWN language's room name. Interpolating the English name
                into the Cantonese half would be the bilingual helper printing a translation
                that is half untranslated, which is worse than not translating at all. */}
            {bilingualText(
              HOME_COPY.building(getRoomDefinition(build.roomId).nameEn, getRoomDefinition(build.roomId).nameYue),
            )}
          </p>
          <ProgressBar fraction={fraction} />
          <p className="home-note">
            {bilingualText(HOME_COPY.timeRemaining)}: {durationText(remaining)}
          </p>
        </div>
      ) : (
        <p className="home-note">{bilingualText(HOME_COPY.queueIdle)}</p>
      )}
      <p className="home-note home-note--rule">{bilingualText(HOME_COPY.queueRule)}</p>
    </section>
  );
}

/** A real progress bar: the fill is the fraction, and the value is announced as a meter. */
function ProgressBar({ fraction }: { fraction: number }) {
  const percent = percentText(fraction);
  return (
    <div
      className="home-progress"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Number(percent)}
      aria-label={bilingualText(HOME_COPY.buildProgress(percent))}
    >
      <span className="home-progress__fill" style={{ width: `${Math.min(100, Math.max(0, fraction * 100))}%` }} />
      <span className="home-progress__label" aria-hidden="true">
        {percent}%
      </span>
    </div>
  );
}

// --------------------------------------------------------------------- the drawn rooms ----

/**
 * A furniture item, drawn small. Deliberately abstract silhouettes rather than an icon per
 * item: what the player needs to read at this size is "there is something in this room and it is
 * a different something from the one beside it", and the name is on the shop card below.
 */
function FurnitureGlyph({ def }: { def: FurnitureDefinition }) {
  // The glyph is picked off the item's id so it is stable, and each room's four or five pieces
  // land on different shapes.
  const shape = def.id.charCodeAt(3) % 5;
  return (
    <svg className="home-furnishing" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      {shape === 0 && (
        <g stroke="var(--spark-ring)" strokeWidth="1" strokeLinejoin="round">
          <rect x="2.5" y="6.5" width="11" height="6" rx="1.2" fill="var(--tier1-container)" />
          <path d="M2.5 9.5h11" fill="none" />
        </g>
      )}
      {shape === 1 && (
        <g stroke="var(--spark-ring)" strokeWidth="1" strokeLinejoin="round">
          <path d="M4 13V6a4 4 0 0 1 8 0v7z" fill="var(--tier2-container)" />
          <path d="M6 13V9h4v4" fill="none" />
        </g>
      )}
      {shape === 2 && (
        <g stroke="var(--spark-ring)" strokeWidth="1" strokeLinejoin="round">
          <circle cx="8" cy="7" r="4" fill="var(--spark)" />
          <path d="M8 11v3" fill="none" strokeLinecap="round" />
        </g>
      )}
      {shape === 3 && (
        <g stroke="var(--spark-ring)" strokeWidth="1" strokeLinejoin="round">
          <rect x="3" y="3" width="10" height="10" rx="1.4" fill="var(--tier3-container)" />
          <path d="M3 8h10M8 3v10" fill="none" opacity="0.7" />
        </g>
      )}
      {shape === 4 && (
        <g stroke="var(--spark-ring)" strokeWidth="1" strokeLinejoin="round">
          <path d="M8 2.5l5 5-5 5-5-5z" fill="var(--tier1)" />
        </g>
      )}
    </svg>
  );
}

/** The scaffolding drawn across a room that is going up. Static; the progress bar carries the
 *  movement, and CSS stops even that under `prefers-reduced-motion`. */
function Scaffold() {
  return (
    <svg className="home-room__scaffold" viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <g stroke="var(--outline)" strokeWidth="1.6" strokeLinecap="round" opacity="0.8">
        <path d="M10 4v32M30 4v32M50 4v32" />
        <path d="M6 14h48M6 26h48" />
        <path d="M10 14l20 12M30 14l20 12" opacity="0.5" />
      </g>
    </svg>
  );
}

/**
 * What a room that is not built yet looks like: the DRAWING of it. Dashed walls, a door swing
 * and a dimension line — a floor plan rather than a room, because that is honestly all the
 * player has of this room, whether the blueprint is still on sale or already in the drawer.
 *
 * It replaced an empty box. The box was not wrong, but "nothing at all" and "a room with the
 * lights off" looked identical in it, and the card is the only place the difference is visible.
 */
function PlanSketch() {
  return (
    <svg className="home-room__plan" viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <g stroke="var(--outline)" strokeWidth="1.4" fill="none" strokeLinecap="round">
        <path d="M6 8h48v24H6z" strokeDasharray="4 3" />
        {/* the door, drawn the way a plan draws one: a gap in the wall and its swing */}
        <path d="M6 32h10M28 32h26" />
        <path d="M16 32a12 12 0 0 1 12-12" strokeWidth="1" opacity="0.6" />
        {/* a dimension line across the top, with its end ticks */}
        <path d="M10 14h40M10 11.5v5M50 11.5v5" strokeWidth="0.9" opacity="0.5" />
      </g>
    </svg>
  );
}

/** The three states of one room card, drawn as a card in the cutaway. */
function RoomCard({ home, def }: { home: HomeConstructionState; def: RoomDefinition }) {
  const built = builtRoom(home, def.id);
  const building = home.build?.roomId === def.id ? home.build : null;
  const offered = isBlueprintOffered(home, def.id);
  const owned = ownsBlueprint(home, def.id);

  // A room that is neither built, nor going up, nor buyable, nor already drawn is not shown at
  // all — the same rule the generator ladder and the factory upgrade tree follow.
  if (!built && !building && !offered && !owned) return null;

  const state = built ? 'built' : building ? 'building' : owned ? 'planned' : 'offered';

  return (
    <article className="home-room" data-state={state}>
      <header className="home-room__head">
        <span className="home-room__names">
          {showsEnglish() ? <span className="home-room__name">{def.nameEn}</span> : null}
          {showsCantonese() ? <span className="home-room__name-zh">{def.nameYue}</span> : null}
        </span>
        <span className="home-room__chip" data-state={state}>
          {built
            ? bilingualText(HOME_COPY.roomBuilt)
            : building
              ? bilingualText(HOME_COPY.underConstruction)
              : owned
                ? bilingualText(HOME_COPY.blueprintOwned)
                : bilingualText(HOME_COPY.blueprintForSale)}
        </span>
      </header>

      <div className="home-room__cutaway" data-state={state}>
        {building ? <Scaffold /> : null}
        {!built && !building ? <PlanSketch /> : null}
        {built ? (
          <div className="home-room__floor">
            {built.furnitureIds.length === 0 ? (
              <span className="home-room__bare" aria-hidden="true" />
            ) : (
              built.furnitureIds.map((id) => {
                const item = furnitureForRoom(def.id).find((f) => f.id === id);
                return item ? <FurnitureGlyph key={id} def={item} /> : null;
              })
            )}
          </div>
        ) : null}
      </div>

      <p className="home-room__blurb">{bilingualText({ en: def.blurbEn, yue: def.blurbYue })}</p>

      {building ? (
        <>
          <ProgressBar fraction={buildProgressFraction(home) ?? 0} />
          <p className="home-note">
            {bilingualText(HOME_COPY.timeRemaining)}: {durationText(remainingBuildMs(home) ?? 0)}
          </p>
        </>
      ) : null}

      {built ? (
        <p className="home-note">
          {bilingualText(HOME_COPY.cozinessOf)}: {figure(roomCoziness(home, def.id))}
        </p>
      ) : null}

      {!built && !building ? (
        <dl className="home-figures home-figures--compact">
          <HomeFigure label={HOME_COPY.buildCostLabel} value={`🍪 ${figure(def.buildCost)}`} />
          <HomeFigure label={HOME_COPY.buildTimeLabel} value={durationText(requiredBuildMs(home, def.id))} />
        </dl>
      ) : null}

      {!built && !building ? (
        owned ? (
          <StartBuildButton home={home} def={def} />
        ) : (
          <BlueprintButton def={def} />
        )
      ) : null}

    </article>
  );
}

/** The affordability leaf, split out so a five-times-a-second tick does not redraw the card. */
const BlueprintButton = memo(function BlueprintButton({ def }: { def: RoomDefinition }) {
  const dispatch = useGameDispatch();
  const fast = useFastSnapshot();
  const cost = bnFromNumber(def.blueprintCost);
  const affordable = bnCompare(fast.cookies, cost) >= 0;

  return (
    <button
      type="button"
      className="buy-btn"
      disabled={!affordable}
      title={`${def.nameEn} · ${def.nameYue} — 🍪 ${formatExactDigits(cost)}`}
      aria-label={`${HOME_COPY.buyBlueprint.en} ${def.nameEn} · ${HOME_COPY.buyBlueprint.yue}${def.nameYue} — 🍪 ${formatExactDigits(cost)}`}
      onClick={() => dispatch({ type: 'buyHomeBlueprint', roomId: def.id })}
    >
      {bilingualText(HOME_COPY.buyBlueprint)} — 🍪 {figure(def.blueprintCost)}
    </button>
  );
});

const StartBuildButton = memo(function StartBuildButton({
  home,
  def,
}: {
  home: HomeConstructionState;
  def: RoomDefinition;
}) {
  const dispatch = useGameDispatch();
  const fast = useFastSnapshot();
  const cost = bnFromNumber(def.buildCost);
  const affordable = bnCompare(fast.cookies, cost) >= 0;
  // The one-at-a-time rule is visible here as well as stated in words above: the button is dead
  // while another room is up, and the site card says why.
  const allowed = canStartConstruction(home, def.id);

  return (
    <button
      type="button"
      className="buy-btn buy-btn--build"
      disabled={!affordable || !allowed}
      title={`${def.nameEn} · ${def.nameYue} — 🍪 ${formatExactDigits(cost)}`}
      aria-label={`${HOME_COPY.startBuild.en} ${def.nameEn} · ${HOME_COPY.startBuild.yue}${def.nameYue} — 🍪 ${formatExactDigits(cost)}`}
      onClick={() => dispatch({ type: 'startHomeConstruction', roomId: def.id })}
    >
      {bilingualText(HOME_COPY.startBuild)} — 🍪 {figure(def.buildCost)}
    </button>
  );
});

/** The cutaway: every room the player can currently see, as a grid of drawn cards. */
function Cutaway({ home }: { home: HomeConstructionState }) {
  const visible = ROOM_DEFINITIONS.filter(
    (def) =>
      isRoomBuilt(home, def.id) ||
      home.build?.roomId === def.id ||
      ownsBlueprint(home, def.id) ||
      isBlueprintOffered(home, def.id),
  );

  return (
    <section className="home-cutaway" aria-label={bilingualText(HOME_COPY.cutawayTitle)}>
      <h3 className="home-section__title">{bilingualText(HOME_COPY.cutawayTitle)}</h3>
      {visible.length === 0 ? (
        <p className="empty-slot">
          <span className="empty-slot__text">{bilingualText(HOME_COPY.emptyRooms)}</span>
        </p>
      ) : (
        <div className="home-cutaway__grid">
          {visible.map((def) => (
            <RoomCard key={def.id} home={home} def={def} />
          ))}
        </div>
      )}
    </section>
  );
}

// -------------------------------------------------------------------- the furniture shop ----

const FurnitureBuyButton = memo(function FurnitureBuyButton({ def }: { def: FurnitureDefinition }) {
  const dispatch = useGameDispatch();
  const fast = useFastSnapshot();
  const cost = bnFromNumber(def.cost);
  const affordable = bnCompare(fast.cookies, cost) >= 0;

  return (
    <button
      type="button"
      className="buy-btn"
      disabled={!affordable}
      title={`${def.nameEn} · ${def.nameYue} — 🍪 ${formatExactDigits(cost)}`}
      aria-label={`${HOME_COPY.buyFurniture.en} ${def.nameEn} · ${HOME_COPY.buyFurniture.yue}${def.nameYue} — 🍪 ${formatExactDigits(cost)}`}
      onClick={() => dispatch({ type: 'buyHomeFurniture', furnitureId: def.id })}
    >
      {bilingualText(HOME_COPY.buyFurniture)} — 🍪 {formatExact(cost, 'en')}
    </button>
  );
});

/** What one piece of furniture pays, in words, beside its coziness score. */
function bonusText(def: FurnitureDefinition): string {
  switch (def.bonus.kind) {
    case 'globalCps':
      return bilingualText(HOME_COPY.bonusCps(((def.bonus.multiplier - 1) * 100).toFixed(1)));
    case 'click':
      return bilingualText(HOME_COPY.bonusClick(((def.bonus.multiplier - 1) * 100).toFixed(1)));
    case 'buildSpeed':
      return bilingualText(HOME_COPY.bonusBuild((def.bonus.fraction * 100).toFixed(0)));
    case 'none':
      return bilingualText(HOME_COPY.bonusNone);
  }
}

/**
 * A furniture shop PER ROOM, and only for rooms that are actually built. A room that does not
 * exist has no shop — not a locked one, not a greyed one. Rooms are tabbed rather than stacked
 * because six shelves of five items is a scroll, and the player is shopping for one room.
 */
function FurnitureShop({ home }: { home: HomeConstructionState }) {
  const builtRooms = ROOM_DEFINITIONS.filter((def) => isRoomBuilt(home, def.id));
  const [selected, setSelected] = useState<string | null>(null);
  const activeId = selected && builtRooms.some((r) => r.id === selected) ? selected : builtRooms[0]?.id ?? null;

  if (builtRooms.length === 0) return null;

  const items = activeId ? furnitureForRoom(activeId) : [];
  const unowned = items.filter((item) => !ownsFurniture(home, item.id));

  return (
    <section className="home-shop" aria-label={bilingualText(HOME_COPY.furnitureTitle)}>
      <h3 className="home-section__title">{bilingualText(HOME_COPY.furnitureTitle)}</h3>

      <div className="home-shop__tabs" role="group" aria-label={bilingualText(HOME_COPY.cutawayTitle)}>
        {builtRooms.map((def) => (
          <button
            key={def.id}
            type="button"
            className="home-shop__tab"
            data-active={def.id === activeId ? 'true' : undefined}
            aria-pressed={def.id === activeId}
            onClick={() => setSelected(def.id)}
          >
            {bilingualText({ en: def.nameEn, yue: def.nameYue })}
          </button>
        ))}
      </div>

      {unowned.length === 0 ? (
        <p className="empty-slot">
          <span className="empty-slot__text">{bilingualText(HOME_COPY.emptyFurniture)}</span>
        </p>
      ) : (
        <div className="home-shop__list">
          {unowned.map((def) => (
            <div className="home-furniture-row" key={def.id}>
              <span className="home-furniture-row__glyph" aria-hidden="true">
                <FurnitureGlyph def={def} />
              </span>
              <div className="home-furniture-row__names">
                {showsEnglish() ? <span className="home-furniture-row__name">{def.nameEn}</span> : null}
                {showsCantonese() ? <span className="home-furniture-row__name-zh">{def.nameYue}</span> : null}
                <span className="home-furniture-row__sub">{bilingualText({ en: def.blurbEn, yue: def.blurbYue })}</span>
              </div>
              <span className="home-furniture-row__stats">
                <span className="home-furniture-row__coziness">
                  {bilingualText(HOME_COPY.cozinessOf)} {figure(def.coziness)}
                </span>
                <span className="home-furniture-row__bonus">{bonusText(def)}</span>
              </span>
              <FurnitureBuyButton def={def} />
            </div>
          ))}
        </div>
      )}

      {/* What is already standing in this room, so the shop is not the only place a piece is
          ever named. Owned pieces leave the shelf above rather than sitting there greyed out. */}
      {activeId && (builtRoom(home, activeId)?.furnitureIds.length ?? 0) > 0 ? (
        <ul className="home-owned">
          {builtRoom(home, activeId)!.furnitureIds.map((id) => {
            const item = furnitureForRoom(activeId).find((f) => f.id === id);
            if (!item) return null;
            return (
              <li className="home-owned__item" key={id}>
                <FurnitureGlyph def={item} />
                <span>{bilingualText({ en: item.nameEn, yue: item.nameYue })}</span>
                <span className="home-owned__chip">{bilingualText(LIST_COPY.owned)}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

// -------------------------------------------------------------------------------- the panel ----

/**
 * There is deliberately NO separate "plan chest" list beside the cutaway. An earlier version had
 * one, and it was a second Buy-blueprint button for every room that the cutaway card already
 * offered — the same purchase, twice, on one panel. The illustrated card carries the builders'
 * price and the build time beside the button, so the list had nothing of its own to say.
 */
export function HomeScreen() {
  const home = useHomeSnapshot();

  return (
    <div className="home-screen">
      <p className="home-lede">{bilingualText(HOME_COPY.subtitle)}</p>
      <CozinessGauge home={home} />
      <BuildingSite home={home} />
      <Cutaway home={home} />
      <FurnitureShop home={home} />
    </div>
  );
}
