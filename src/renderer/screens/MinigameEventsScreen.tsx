import { BilingualLines } from '../components/BilingualLines.js';
import { MinigameAction, MinigameActionLabel } from '../components/MinigameAction.js';
import { bilingualText, showsCantonese, showsEnglish, type Bilingual } from '../game/copy.js';
import { MINIGAME_COPY, MINIGAME_IDS } from '../game/minigame-copy.js';
import type { MinigameId } from '../../shared/game/minigames.js';

export type MinigameEventStatus = 'scheduled' | 'active' | 'minimized' | 'completed' | 'abandoned';

export interface MinigameEventView {
  readonly eventId: string;
  readonly gameId: MinigameId;
  readonly status: MinigameEventStatus;
  readonly scheduledFor?: string;
  readonly detail?: Bilingual;
}

export interface MinigameEventsScreenProps {
  readonly events: readonly MinigameEventView[];
  readonly goldenTokenBalance: number;
  readonly luckyChanceOpen: boolean;
  readonly luckyChanceCanDraw: boolean;
  readonly luckyChanceResult?: Bilingual | null;
  readonly onSchedule: (gameId: MinigameId) => void;
  readonly onAbandon: (eventId: string) => void;
  readonly onMinimize: (eventId: string) => void;
  readonly onResume: (eventId: string) => void;
  readonly onRestart: (eventId: string) => void;
  readonly onOpenLuckyChance: () => void;
  readonly onCloseLuckyChance: () => void;
  readonly onDrawLuckyChance: () => void;
}

export function MinigameEventsScreen({
  events,
  goldenTokenBalance,
  luckyChanceOpen,
  luckyChanceCanDraw,
  luckyChanceResult = null,
  onSchedule,
  onAbandon,
  onMinimize,
  onResume,
  onRestart,
  onOpenLuckyChance,
  onCloseLuckyChance,
  onDrawLuckyChance,
}: MinigameEventsScreenProps) {
  return (
    <div className="screen" aria-label={bilingualText(MINIGAME_COPY.title)}>
      <h1>
        {showsEnglish() ? MINIGAME_COPY.title.en : null}
        {showsCantonese() ? <span className="screen-title-zh">{MINIGAME_COPY.title.yue}</span> : null}
      </h1>
      <p className="screen-summary">{bilingualText(MINIGAME_COPY.summary)}</p>

      <section className="settings-block" aria-labelledby="minigame-events-heading">
        <h2 className="settings-block__label" id="minigame-events-heading">
          {bilingualText(MINIGAME_COPY.gamesHeading)}
        </h2>
        <p className="settings-caption">{bilingualText(MINIGAME_COPY.gamesSummary)}</p>
        <div className="stat-grid">
          {MINIGAME_IDS.map((gameId) => (
            <MinigameCard
              key={gameId}
              gameId={gameId}
              event={events.find((candidate) => candidate.gameId === gameId)}
              onSchedule={onSchedule}
              onAbandon={onAbandon}
              onMinimize={onMinimize}
              onResume={onResume}
              onRestart={onRestart}
            />
          ))}
        </div>
      </section>

      <section className="settings-block" aria-labelledby="minigame-token-heading">
        <div className="panel__header">
          <h2 className="settings-block__label" id="minigame-token-heading">
            {bilingualText(MINIGAME_COPY.goldenTokenHeading)}
          </h2>
          <MinigameAction
            data-action="events-lucky-toggle"
            variant="tonal"
            icon={luckyChanceOpen ? 'abandon' : 'spark'}
            aria-expanded={luckyChanceOpen}
            aria-controls="minigame-lucky-chance-drawer"
            onClick={luckyChanceOpen ? onCloseLuckyChance : onOpenLuckyChance}
          >
            <MinigameActionLabel text={luckyChanceOpen ? MINIGAME_COPY.closeLuckyChance : MINIGAME_COPY.openLuckyChance} />
          </MinigameAction>
        </div>
        <p className="settings-caption">{bilingualText(MINIGAME_COPY.goldenTokenSummary)}</p>
        <div className="stat-grid">
          <div className="stat-tile">
            {showsEnglish() ? <span className="stat-tile__label-en">{MINIGAME_COPY.goldenTokenHeading.en}</span> : null}
            {showsCantonese() ? <span className="stat-tile__label-zh">{MINIGAME_COPY.goldenTokenHeading.yue}</span> : null}
            <strong className="stat-tile__value">{goldenTokenBalance}</strong>
            <span className="settings-caption">{bilingualText(MINIGAME_COPY.tokenBalance(goldenTokenBalance))}</span>
          </div>
          <div className="stat-tile">
            {showsEnglish() ? <span className="stat-tile__label-en">{MINIGAME_COPY.luckyChanceHeading.en}</span> : null}
            {showsCantonese() ? <span className="stat-tile__label-zh">{MINIGAME_COPY.luckyChanceHeading.yue}</span> : null}
            <span className="settings-caption">{bilingualText(MINIGAME_COPY.luckyChanceSummary)}</span>
          </div>
        </div>
      </section>

      {luckyChanceOpen ? (
        <LuckyChanceDrawer
          goldenTokenBalance={goldenTokenBalance}
          canDraw={luckyChanceCanDraw}
          result={luckyChanceResult}
          onClose={onCloseLuckyChance}
          onDraw={onDrawLuckyChance}
        />
      ) : null}
    </div>
  );
}

function MinigameCard({
  gameId,
  event,
  onSchedule,
  onAbandon,
  onMinimize,
  onResume,
  onRestart,
}: {
  readonly gameId: MinigameId;
  readonly event?: MinigameEventView;
  readonly onSchedule: (gameId: MinigameId) => void;
  readonly onAbandon: (eventId: string) => void;
  readonly onMinimize: (eventId: string) => void;
  readonly onResume: (eventId: string) => void;
  readonly onRestart: (eventId: string) => void;
}) {
  const gameName = MINIGAME_COPY.games[gameId];
  const headingId = `minigame-${gameId}-heading`;

  return (
    <article className="stat-tile" aria-labelledby={headingId} data-status={event?.status ?? 'unscheduled'}>
      {showsEnglish() ? <span className="stat-tile__label-en">{gameName.en}</span> : null}
      {showsCantonese() ? <span className="stat-tile__label-zh">{gameName.yue}</span> : null}
      <h3 className="stat-tile__value" id={headingId}>
        {bilingualText(gameName)}
      </h3>
      {event ? <EventState event={event} /> : <p className="settings-caption">{bilingualText(MINIGAME_COPY.noEvent)}</p>}
      {event?.detail ? <p className="settings-caption">{bilingualText(event.detail)}</p> : null}
      <div className="settings-modes" role="group" aria-label={bilingualText(MINIGAME_COPY.eventHeading)}>
        {renderEventActions(event, { gameId, onSchedule, onAbandon, onMinimize, onResume, onRestart })}
      </div>
    </article>
  );
}

function EventState({ event }: { readonly event: MinigameEventView }) {
  const statusLabel = bilingualText(MINIGAME_COPY.status[event.status]);
  const detail = event.status === 'scheduled'
    ? MINIGAME_COPY.scheduledFor(event.scheduledFor)
    : event.status === 'active'
      ? MINIGAME_COPY.activeNote
      : event.status === 'minimized'
        ? MINIGAME_COPY.minimizedNote
        : event.status === 'completed'
          ? MINIGAME_COPY.completedNote
          : MINIGAME_COPY.abandonedNote;

  return (
    <p className="stat-tile__trend flat" role="status">
      {statusLabel} · {bilingualText(detail)}
    </p>
  );
}

function renderEventActions(
  event: MinigameEventView | undefined,
  handlers: {
    readonly gameId: MinigameId;
    readonly onSchedule: (gameId: MinigameId) => void;
    readonly onAbandon: (eventId: string) => void;
    readonly onMinimize: (eventId: string) => void;
    readonly onResume: (eventId: string) => void;
    readonly onRestart: (eventId: string) => void;
  },
) {
  if (!event || event.status === 'completed' || event.status === 'abandoned') {
    return (
      <MinigameAction data-action="event-schedule" variant="filled" icon="play" onClick={() => handlers.onSchedule(handlers.gameId)}>
        <MinigameActionLabel text={MINIGAME_COPY.schedule} />
      </MinigameAction>
    );
  }

  if (event.status === 'active') {
    return (
      <>
        <MinigameAction data-action="event-minimize" variant="text" icon="minimize" onClick={() => handlers.onMinimize(event.eventId)}>
          <MinigameActionLabel text={MINIGAME_COPY.minimize} />
        </MinigameAction>
        <MinigameAction data-action="event-restart" variant="tonal" icon="restart" onClick={() => handlers.onRestart(event.eventId)}>
          <MinigameActionLabel text={MINIGAME_COPY.restart} />
        </MinigameAction>
        <MinigameAction data-action="event-abandon" variant="danger-text" icon="abandon" onClick={() => handlers.onAbandon(event.eventId)}>
          <MinigameActionLabel text={MINIGAME_COPY.abandon} />
        </MinigameAction>
      </>
    );
  }

  if (event.status === 'minimized') {
    return (
      <>
        <MinigameAction data-action="event-resume" variant="filled" icon="play" onClick={() => handlers.onResume(event.eventId)}>
          <MinigameActionLabel text={MINIGAME_COPY.resume} />
        </MinigameAction>
        <MinigameAction data-action="event-restart" variant="tonal" icon="restart" onClick={() => handlers.onRestart(event.eventId)}>
          <MinigameActionLabel text={MINIGAME_COPY.restart} />
        </MinigameAction>
        <MinigameAction data-action="event-abandon" variant="danger-text" icon="abandon" onClick={() => handlers.onAbandon(event.eventId)}>
          <MinigameActionLabel text={MINIGAME_COPY.abandon} />
        </MinigameAction>
      </>
    );
  }

  return (
    <MinigameAction data-action="event-abandon" variant="danger-text" icon="abandon" onClick={() => handlers.onAbandon(event.eventId)}>
      <MinigameActionLabel text={MINIGAME_COPY.abandon} />
    </MinigameAction>
  );
}

function LuckyChanceDrawer({
  goldenTokenBalance,
  canDraw,
  result,
  onClose,
  onDraw,
}: {
  readonly goldenTokenBalance: number;
  readonly canDraw: boolean;
  readonly result: Bilingual | null | undefined;
  readonly onClose: () => void;
  readonly onDraw: () => void;
}) {
  return (
    <aside className="settings-block" id="minigame-lucky-chance-drawer" aria-labelledby="lucky-chance-drawer-heading">
      <div className="panel__header">
        <h2 className="settings-block__label" id="lucky-chance-drawer-heading">
          {bilingualText(MINIGAME_COPY.luckyChanceHeading)}
        </h2>
        <MinigameAction data-action="drawer-close" variant="outlined" icon="abandon" onClick={onClose}>
          <MinigameActionLabel text={MINIGAME_COPY.closeLuckyChance} />
        </MinigameAction>
      </div>
      <p className="settings-note settings-note--warning">
        <BilingualLines text={MINIGAME_COPY.luckyChanceSummary} />
        <br />
        <BilingualLines text={MINIGAME_COPY.luckyChanceOfflineRule} />
      </p>
      <div className="stat-grid">
        <div className="stat-tile">
          {showsEnglish() ? <span className="stat-tile__label-en">{MINIGAME_COPY.goldenTokenHeading.en}</span> : null}
          {showsCantonese() ? <span className="stat-tile__label-zh">{MINIGAME_COPY.goldenTokenHeading.yue}</span> : null}
          <strong className="stat-tile__value">{goldenTokenBalance}</strong>
          <span className="settings-caption">{bilingualText(MINIGAME_COPY.tokenBalance(goldenTokenBalance))}</span>
        </div>
        <div className="stat-tile">
          {showsEnglish() ? <span className="stat-tile__label-en">{MINIGAME_COPY.luckyChanceHeading.en}</span> : null}
          {showsCantonese() ? <span className="stat-tile__label-zh">{MINIGAME_COPY.luckyChanceHeading.yue}</span> : null}
          <MinigameAction
            data-action="drawer-draw"
            variant="filled"
            icon="spark"
            aria-disabled={!canDraw}
            aria-describedby={!canDraw ? 'lucky-chance-draw-unavailable' : undefined}
            onClick={() => {
              if (canDraw) onDraw();
            }}
          >
            <MinigameActionLabel text={MINIGAME_COPY.drawLuckyChance} />
          </MinigameAction>
          {!canDraw ? <p className="settings-caption" id="lucky-chance-draw-unavailable"><BilingualLines text={MINIGAME_COPY.insufficientTokens} /></p> : null}
        </div>
      </div>
      {result ? (
        <p className="settings-note settings-note--honest" role="status" aria-live="polite">
          <strong>{bilingualText(MINIGAME_COPY.lastDrawHeading)}</strong>
          <br />
          <BilingualLines text={result} />
        </p>
      ) : null}
      <p className="settings-caption"><BilingualLines text={MINIGAME_COPY.drawerDisclosure} /></p>
    </aside>
  );
}
