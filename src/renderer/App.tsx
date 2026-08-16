import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { bnMulScalar } from '../shared/game/big-number.js';
import { formatBigNum } from '../shared/game/format-number.js';
import { isEffectActive } from '../shared/game/golden-cookie.js';
import { computeMultipliers } from '../shared/game/upgrades.js';
import { computeDisclosure } from '../shared/game/disclosure.js';
import {
  GameProvider,
  useFastSnapshot,
  useMilestoneMessage,
  useOfflineNotice,
  useStructureSnapshot,
} from './game/GameProvider';
import { CONSOLE_EMBLEMS, PanelCorner } from './ConsoleEmblems';
import { HUD_COOKIES_TARGET_KEY, PurchaseFxLayer, usePurchaseFxTarget } from './game/purchase-fx';
import {
  bilingualText,
  CONSOLE_COPY,
  GAME_SURFACE_COPY,
  SHELL_COPY,
  TAB_COPY,
  TITLE_BAR_COPY,
  type Bilingual,
} from './game/copy';
import { AchievementsScreen, AchievementUnlockToast } from './screens/AchievementsScreen';
import { CookieHero } from './screens/CookieHero';
import { DiscoveryTicket } from './screens/DiscoveryTicket';
import { ShopRail } from './screens/ShopRail';
import { PrestigeScreen } from './screens/PrestigeScreen';
import { StatisticsScreen } from './screens/StatisticsScreen';
import { ToolsScreen, type OpenApplicationFeature } from './screens/ToolsScreen';
import { UpgradeStrip } from './screens/UpgradeStrip';

/**
 * The four secondary surfaces. The game surface is NOT in this list, because it is not a
 * destination any more: it is the base of the screen and it never goes away. Each entry here is
 * a panel that grows out of its own console button on top of the still-running game.
 *
 * Adding a core-loop control (clicking the cookie, buying a generator, buying an upgrade) to any
 * of these would still be a spec violation — those three live on the game surface only
 * (design/game-layout.html).
 */
const SURFACE_IDS = ['achievements', 'tools', 'statistics', 'prestige'] as const;

type SurfaceId = (typeof SURFACE_IDS)[number];

const SURFACE_LABELS: Readonly<Record<SurfaceId, Bilingual>> = {
  achievements: TAB_COPY.achievements,
  tools: TAB_COPY.tools,
  statistics: TAB_COPY.statistics,
  prestige: TAB_COPY.prestige,
};


/** Where a panel is allowed to grow from, measured in the viewport, so the open animation and the
 *  notch both point back at the button the player actually pressed. */
type Anchor = { x: number; y: number };

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

  // Progressive disclosure: a brand-new save has exactly one number on it, the cookie count.
  // The rate readouts arrive when there is a rate to read — per-second with the first
  // generator, per-click once Steady Hand makes a click something you can vary.
  const disclosure = computeDisclosure(structure);

  return (
    <div className="hud" role="group" aria-label={`${GAME_SURFACE_COPY.hudLabel.en} · ${GAME_SURFACE_COPY.hudLabel.yue}`} aria-live="off">
      <HudReadout label={GAME_SURFACE_COPY.hudCookies} value={fast.cookies} fxKey={HUD_COOKIES_TARGET_KEY} />
      {disclosure.perSecondReadout ? <HudReadout label={GAME_SURFACE_COPY.hudPerSecond} value={fast.cps} /> : null}
      {disclosure.perClickReadout ? <HudReadout label={GAME_SURFACE_COPY.hudPerClick} value={clickValue} /> : null}
    </div>
  );
}

/** One recessed bezel in the HUD. Both labels always show; the Cantonese *number* only shows when
 *  it actually reads differently from the English one (the two formatters agree on small values,
 *  and printing "4.06" twice would look like a rendering bug rather than a translation). */
function HudReadout({
  label,
  value,
  fxKey,
}: {
  label: Bilingual;
  value: Parameters<typeof formatBigNum>[0];
  /** Set on the cookies readout only: it is where a purchase's coins fly FROM, and the bezel
   *  that dips and settles when the reducer takes the cookies. */
  fxKey?: string;
}) {
  const en = formatBigNum(value, 'en');
  const yue = formatBigNum(value, 'yue');
  const fxRef = usePurchaseFxTarget<HTMLDivElement>(fxKey ?? 'hud:unused');
  return (
    <div className="hud__readout" ref={fxKey ? fxRef : undefined}>
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
  // Progressive disclosure (src/shared/game/disclosure.ts). A fresh save is the cookie and its
  // counter, full stop: the shop rail and the upgrade strip are each bought back with a real
  // upgrade, and until the strip exists the DiscoveryTicket beside the cookie is the one place
  // those reveals can be bought from.
  const structure = useStructureSnapshot();
  const disclosure = computeDisclosure(structure);

  return (
    <div className={`stage${disclosure.shop ? '' : ' stage--solo'}`}>
      <div className="stage__hero-column">
        <CookieHero />
        <DiscoveryTicket />
        {disclosure.upgradeStrip ? <UpgradeStrip /> : null}
      </div>
      {disclosure.shop ? <ShopRail /> : null}
    </div>
  );
}

/** The drawn emblem for one surface. Decorative in every position it appears — the button and
 *  the panel header both carry their own accessible name. */
function ConsoleEmblem({ id }: { id: SurfaceId }) {
  const Drawing = CONSOLE_EMBLEMS[id];
  return <Drawing />;
}

/**
 * The console cluster bolted to the cabinet frame. Four arcade buttons, each with its own
 * emblem and a small label. They are plain buttons — deliberately NOT a tablist — because
 * pressing one opens a panel over the game rather than navigating anywhere.
 */
function CabinetConsole({
  openId,
  onOpen,
  buttonRefs,
}: {
  openId: SurfaceId | null;
  onOpen: (id: SurfaceId, button: HTMLButtonElement) => void;
  buttonRefs: React.MutableRefObject<Partial<Record<SurfaceId, HTMLButtonElement | null>>>;
}) {
  // Each emblem is earned by the progress its panel is about: a first achievement, a first
  // discovered tool, a first generator, a first sight of the prestige horizon. Hiding a button
  // hides a GAME panel and nothing else — the Tools tech tree's contract that every real
  // application feature stays reachable is untouched, and its "Open it now" control behaves
  // identically the moment the panel is open (see tools.ts#gatesApplicationFeature).
  const structure = useStructureSnapshot();
  const disclosure = computeDisclosure(structure);
  const visibleIds = SURFACE_IDS.filter((id) => disclosure.consoles[id]);
  // An empty group with an accessible name is a label pointing at nothing; render no console
  // at all until the first emblem is earned.
  if (visibleIds.length === 0) return null;

  return (
    <div className="console" role="group" aria-label={`${CONSOLE_COPY.consoleLabel.en} · ${CONSOLE_COPY.consoleLabel.yue}`}>
      {visibleIds.map((id) => {
        const label = SURFACE_LABELS[id];
        const open = id === openId;
        return (
          <button
            key={id}
            type="button"
            className="console__button"
            id={`console-${id}`}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-label={`${CONSOLE_COPY.open(label.en, label.yue).en} · ${CONSOLE_COPY.open(label.en, label.yue).yue}`}
            data-open={open ? 'true' : undefined}
            ref={(node) => {
              buttonRefs.current[id] = node;
            }}
            onClick={(event) => onOpen(id, event.currentTarget)}
          >
            <ConsoleEmblem id={id} />
            <span className="console__label console__label--legible" aria-hidden="true">
              {label.en}
            </span>
            <span className="console__label-zh console__label-zh--legible" aria-hidden="true">
              {label.yue}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * One secondary surface, opened as a real modal dialog that grows out of its console button.
 *
 * The accessibility contract, in full: role="dialog" + aria-modal, labelled by its own heading,
 * focus moves to the close button on open and is trapped inside until it closes, Escape closes,
 * a click on the dimmed game surface behind closes, and focus goes back to the button that
 * opened it. The panel scrolls internally — the page body never does. `prefers-reduced-motion`
 * is handled in CSS: the grow animation is simply not applied, so the panel appears at once.
 */
function AnchoredPanel({
  surfaceId,
  label,
  anchor,
  onClose,
  children,
}: {
  surfaceId: SurfaceId;
  label: Bilingual;
  anchor: Anchor;
  onClose: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const titleId = `panel-title-${surfaceId}`;

  // Point the panel back at its button: the top edge sits just under the button, the grow
  // animation starts from the button's centre, and the notch lines up with it too.
  // Recomputed on every window resize as well as on open. Without the listener a maximize or a
  // window resize left the panel at its stale `top`, which could push the header — and with it
  // the only visible close button — off the bottom of the new viewport while focus stayed
  // trapped inside. The top is also clamped so the header always stays on screen.
  useLayoutEffect(() => {
    const place = () => {
      const node = panelRef.current;
      if (!node) return;
      // Never start the panel so far down that its header would sit below the viewport: leave
      // at least a header's worth of room plus the bottom margin.
      const maxTop = Math.max(0, window.innerHeight - 240 - 28);
      const top = Math.max(0, Math.min(Math.round(anchor.y + 26), maxTop));
      node.style.top = `${top}px`;
      node.style.maxHeight = `${Math.max(160, Math.round(window.innerHeight - top - 28))}px`;
      const rect = node.getBoundingClientRect();
      const originX = Math.min(Math.max(anchor.x - rect.left, 0), rect.width);
      node.style.setProperty('--anchor-x', `${Math.round(originX)}px`);
      node.style.setProperty('--notch-x', `${Math.round(Math.min(Math.max(originX, 30), rect.width - 30))}px`);
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [anchor]);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  return (
    <div
      className="overlay-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="anchored-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={panelRef}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            onClose();
            return;
          }
          if (event.key !== 'Tab') return;
          const node = panelRef.current;
          if (!node) return;
          const focusable = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
            (element) => element.offsetParent !== null || element === document.activeElement,
          );
          if (focusable.length === 0) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        <span className="anchored-panel__notch" aria-hidden="true" />
        <PanelCorner className="anchored-panel__corner anchored-panel__corner--left" />
        <PanelCorner className="anchored-panel__corner anchored-panel__corner--right" />
        <div className="anchored-panel__bar">
          <span className="anchored-panel__crest">
            <ConsoleEmblem id={surfaceId} />
          </span>
          <h2 className="anchored-panel__title" id={titleId}>
            <span>{label.en}</span>
            <span className="anchored-panel__title-zh">{label.yue}</span>
          </h2>
          <button
            type="button"
            className="anchored-panel__close"
            ref={closeRef}
            aria-label={`${CONSOLE_COPY.close.en} · ${CONSOLE_COPY.close.yue}`}
            onClick={onClose}
          >
            <span aria-hidden="true">&#x2715;</span>
          </button>
        </div>
        <div className="anchored-panel__body">{children}</div>
      </div>
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
        <div className="title-bar__controls" role="group" aria-label={bilingualText(TITLE_BAR_COPY.controlsLabel)}>
          <button type="button" className="title-bar__button" aria-label={bilingualText(TITLE_BAR_COPY.minimize)} onClick={minimize}>
            &#x2013;
          </button>
          <button
            type="button"
            className="title-bar__button"
            aria-label={bilingualText(TITLE_BAR_COPY.maximizeRestore)}
            onClick={toggleMaximize}
          >
            &#x25A1;
          </button>
          <button
            type="button"
            className="title-bar__button title-bar__button--close"
            aria-label={bilingualText(TITLE_BAR_COPY.close)}
            onClick={close}
          >
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
  // Which panel is open, if any, and where it grows from. Nothing about this is persisted: the
  // game surface is always the base state, so a reload never reopens a panel over it.
  const [openSurface, setOpenSurface] = useState<SurfaceId | null>(null);
  const [anchor, setAnchor] = useState<Anchor>({ x: 0, y: 0 });
  const [shellStatus, setShellStatus] = useState<Bilingual | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buttonRefs = useRef<Partial<Record<SurfaceId, HTMLButtonElement | null>>>({});
  const { notice: offlineNotice, dismiss: dismissOfflineNotice } = useOfflineNotice();
  const milestoneMessage = useMilestoneMessage();

  const openPanel = useCallback((id: SurfaceId, button: HTMLButtonElement) => {
    const rect = button.getBoundingClientRect();
    setAnchor({ x: rect.left + rect.width / 2, y: rect.bottom });
    setOpenSurface(id);
  }, []);

  // Closing always hands focus back to the button that opened the panel, so the keyboard never
  // gets dropped at the top of the document.
  const closePanel = useCallback(() => {
    setOpenSurface((current) => {
      if (current) buttonRefs.current[current]?.focus();
      return null;
    });
  }, []);

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

  return (
    <main className="app-content" id="root-content">
      {/* One cabinet, one surface. The HUD is pinned to its top with the console cluster bolted
          on beside it, and the game fills the rest — permanently. Secondary surfaces are panels
          that grow out of a console button on top of it; the tick loop keeps running behind. */}
      <div className="cabinet" data-panel-open={openSurface ? 'true' : undefined}>
        <div className="cabinet-head">
          <Hud />
          <CabinetConsole openId={openSurface} onOpen={openPanel} buttonRefs={buttonRefs} />
        </div>

        <div className="cabinet-body">
          <GameSurface />
        </div>
      </div>

      {openSurface && (
        <AnchoredPanel
          surfaceId={openSurface}
          label={SURFACE_LABELS[openSurface]}
          anchor={anchor}
          onClose={closePanel}
        >
          {openSurface === 'achievements' && <AchievementsScreen />}
          {openSurface === 'tools' && <ToolsScreen onOpenApplicationFeature={openApplicationFeature} />}
          {openSurface === 'statistics' && <StatisticsScreen />}
          {openSurface === 'prestige' && <PrestigeScreen />}
        </AnchoredPanel>
      )}

      {offlineNotice && (
        <div className="offline-banner" role="status">
          <span>{offlineNotice.en}</span>
          <span>{offlineNotice.yue}</span>
          <button type="button" className="offline-banner__dismiss offline-banner__dismiss--target" onClick={dismissOfflineNotice}>
            {SHELL_COPY.dismiss.en} · {SHELL_COPY.dismiss.yue}
          </button>
        </div>
      )}

      {/* The medal celebration, cabinet-wide: an achievement unlocks during PLAY, so the toast
          lives on the shell rather than inside the Achievements panel that the player almost
          never has open at that moment. It is aria-hidden — the milestone region below is the
          single spoken announcement. */}
      <AchievementUnlockToast />

      <div className="milestone-region" role="status" aria-live="polite">
        {milestoneMessage ? `${milestoneMessage.en} · ${milestoneMessage.yue}` : ''}
      </div>

      {/* The one purchase-feedback overlay for the whole game. It renders nothing until a
          dispatch actually applies a purchase, and never takes part in layout. */}
      <PurchaseFxLayer />

      <div className="shell-status" role="status" aria-live="polite">
        {shellStatus ? `${shellStatus.en} · ${shellStatus.yue}` : ''}
      </div>
    </main>
  );
}
