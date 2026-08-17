import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import { bnMulScalar } from '../shared/game/big-number.js';
import { formatExact, formatExactDigits } from '../shared/game/format-number.js';
import { isEffectActive } from '../shared/game/golden-cookie.js';
import { computeMultipliers } from '../shared/game/upgrades.js';
import { computeDisclosure, type ConsoleSurfaceId } from '../shared/game/disclosure.js';
import { controlRungPrice, isControlUnlocked } from '../shared/game/control-unlocks.js';
import {
  CATALOGUE_PANEL_ID,
  consolePanelIds,
  openFeatureOutcome,
  SETTINGS_OPEN_RUNG_ID,
  SETTINGS_PANEL_ID,
  type PanelId,
  type SettingsRowId,
} from './game/console-panels.js';
import {
  GameProvider,
  useFastSnapshot,
  useMilestoneMessage,
  useOfflineNotice,
  useStructureSnapshot,
} from './game/GameProvider';
import { CONSOLE_EMBLEMS, PanelCorner } from './ConsoleEmblems';
import { CoinSlot, useControlRung } from './components/CoinSlot';
import { HUD_COOKIES_TARGET_KEY, PurchaseFxLayer, usePurchaseFxTarget } from './game/purchase-fx';
import {
  bilingualText,
  CONSOLE_COPY,
  CONTROL_COPY,
  GAME_SURFACE_COPY,
  SETTINGS_COPY,
  setActiveLanguageMode,
  SHELL_COPY,
  showsCantonese,
  showsEnglish,
  TAB_COPY,
  TITLE_BAR_COPY,
  type Bilingual,
} from './game/copy';
import {
  DEFAULT_APP_SETTINGS,
  effectiveLanguageMode,
  resolveAppSettingsStore,
  type AppSettings,
  type FunnyLevel,
  type LanguageMode,
} from './game/app-settings';
import { AppSettingsProvider, type AppSettingsContextValue } from './game/AppSettingsContext';
import { SettingsScreen } from './screens/SettingsScreen';
import { ControlsCatalogue } from './screens/ControlsCatalogue';
import { AchievementsScreen, AchievementUnlockToast } from './screens/AchievementsScreen';
import { CookieHero } from './screens/CookieHero';
import { DiscoveryTicket } from './screens/DiscoveryTicket';
import { MilkTide } from './screens/MilkTide';
import { ShopRail } from './screens/ShopRail';
import { FactoryScreen } from './screens/FactoryScreen';
import { HomeScreen } from './screens/HomeScreen';
import { PrestigeScreen } from './screens/PrestigeScreen';
import {
  MouseRaidAftermathToast,
  RaidSuppliesShelf,
  RandomEventIndicator,
  RandomEventStage,
  RandomEventToast,
} from './screens/RandomEventStage';
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
/**
 * The panel ids, the console order, and where a tool card's "Open it now" lands all live in
 * game/console-panels.ts so they can be asserted directly by tests without rendering anything.
 * SETTINGS is in that list unconditionally: it is an application surface, not a game unlock, so
 * progressive disclosure does not apply to it (tests/settings.test.ts asserts exactly that).
 */
type SurfaceId = ConsoleSurfaceId;

const SURFACE_LABELS: Readonly<Record<PanelId, Bilingual>> = {
  achievements: TAB_COPY.achievements,
  tools: TAB_COPY.tools,
  statistics: TAB_COPY.statistics,
  prestige: TAB_COPY.prestige,
  factory: TAB_COPY.factory,
  home: TAB_COPY.home,
  catalogue: CONTROL_COPY.catalogueConsole,
  settings: SETTINGS_COPY.title,
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
    <div className="hud" role="group" aria-label={bilingualText(GAME_SURFACE_COPY.hudLabel)} aria-live="off">
      <HudReadout label={GAME_SURFACE_COPY.hudCookies} value={fast.cookies} fxKey={HUD_COOKIES_TARGET_KEY} />
      {disclosure.perSecondReadout ? <HudReadout label={GAME_SURFACE_COPY.hudPerSecond} value={fast.cps} /> : null}
      {disclosure.perClickReadout ? <HudReadout label={GAME_SURFACE_COPY.hudPerClick} value={clickValue} /> : null}
      {/* The active random event and how long is left on it (random-events.ts). It renders
          nothing when nothing is running, so the HUD keeps exactly the shape it always had, and
          it is not behind progressive disclosure: an event that halves production has to be
          visible on the save it happens to, including a brand-new one. */}
      <RandomEventIndicator />

      {/* What the player is holding against the next raid. In the HUD beside the raid's own
          plate, because that is where a player looks for it — not in the generator shop, which
          sells production. */}
      <RaidSuppliesShelf />
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
  value: Parameters<typeof formatExact>[0];
  /** Set on the cookies readout only: it is where a purchase's coins fly FROM, and the bezel
   *  that dips and settles when the reducer takes the cookies. */
  fxKey?: string;
}) {
  // LITERAL FIGURES IN THE BEZEL. "1.055 thousand" is both harder to read than "1,055" and
  // wider than the plate it sits in — the word ran past the bevel and clipped. Below the literal
  // threshold both formatters produce the same grouped digits, so the second line correctly
  // disappears; above it they diverge again and the compact forms are shown, shrink-to-fit by
  // the CSS (.hud__value), with the full figure always in the plate's title.
  const en = formatExact(value, 'en');
  const yue = formatExact(value, 'yue');
  const fxRef = usePurchaseFxTarget<HTMLDivElement>(fxKey ?? 'hud:unused');
  return (
    <div className="hud__readout" ref={fxKey ? fxRef : undefined} title={`${bilingualText(label)}: ${formatExactDigits(value)}`}>
      <span className="hud__key">
        {bilingualText(label)}
      </span>
      {/* Language mode reaches the NUMBERS too: Cantonese-only shows the Cantonese formatting of
          the value on its own rather than beside an English one. The two formatters agree on
          small values, so in bilingual mode the second line still only appears when it actually
          reads differently — printing "4.06" twice looks like a rendering bug, not a
          translation. */}
      {showsEnglish() || yue === en ? (
        // The plate is a fixed-width engraving, so the VALUE shrinks to fit it rather than
        // wrapping or spilling past the bevel. Six characters is full size ("1,055" and every
        // early figure); a longer string scales the type down proportionally, with a floor.
        <span className="hud__value" style={{ '--hud-value-chars': Math.max(6, en.length) } as CSSProperties}>
          {en}
        </span>
      ) : null}
      {showsCantonese() && yue !== en ? <span className="hud__value-zh">{yue}</span> : null}
    </div>
  );
}

/**
 * THE ONE SCREEN (design-v2/game-layout.html). Hero cookie plus the upgrade ticket strip in the
 * left column, the generator shop docked as a rail on the right, everything on a single surface.
 * Below ~900px the CSS turns the rail into a bottom drawer on this same surface — the cookie
 * stays visible above it and no route changes.
 */
function GameSurface({ onOpenFactory }: { onOpenFactory: (button: HTMLButtonElement) => void }) {
  // Progressive disclosure (src/shared/game/disclosure.ts). A fresh save is the cookie and its
  // counter, full stop: the shop rail and the upgrade strip are each bought back with a real
  // upgrade, and until the strip exists the DiscoveryTicket beside the cookie is the one place
  // those reveals can be bought from.
  const structure = useStructureSnapshot();
  const disclosure = computeDisclosure(structure);

  return (
    <div className={`stage${disclosure.shop ? '' : ' stage--solo'}`}>
      {/* The event layer sits ON the stage, over the cookie and the shop alike, because that is
          where the falling cookies are falling. It returns null whenever no clickable event is
          running, so it never takes part in layout. */}
      <RandomEventStage />
      <div className="stage__hero-column">
        <CookieHero />
        <DiscoveryTicket />
        {disclosure.upgradeStrip ? <UpgradeStrip /> : null}
      </div>
      {disclosure.shop ? <ShopRail onOpenFactory={onOpenFactory} /> : null}
      {/* The tide is the LAST child of the stage and is positioned over it, so it rises behind
          the cookie and the shelf rather than pushing either of them anywhere. */}
      <MilkTide />
    </div>
  );
}

/** The drawn emblem for one surface. Decorative in every position it appears — the button and
 *  the panel header both carry their own accessible name. */
function ConsoleEmblem({ id }: { id: PanelId }) {
  const Drawing = CONSOLE_EMBLEMS[id];
  return <Drawing />;
}

/**
 * The console cluster bolted to the cabinet frame. Arcade buttons, each with its own emblem and
 * a small label. They are plain buttons — deliberately NOT a tablist — because pressing one
 * opens a panel over the game rather than navigating anywhere.
 */
function CabinetConsole({
  openId,
  onOpen,
  buttonRefs,
  settingsSlotRef,
}: {
  openId: PanelId | null;
  onOpen: (id: PanelId, button: HTMLButtonElement) => void;
  buttonRefs: React.MutableRefObject<Partial<Record<PanelId, HTMLButtonElement | null>>>;
  /** The Settings coin-slot plate's own button, while Settings is unbought, so "Open it now"
   *  can send the keyboard to the thing that sells it. Null once the emblem is bought. */
  settingsSlotRef: React.MutableRefObject<HTMLButtonElement | null>;
}) {
  // Each GAME emblem is earned by the progress its panel is about: a first achievement, a first
  // discovered tool, a first generator, a first sight of the prestige horizon. Hiding a button
  // hides a GAME panel and nothing else — the Tools tech tree's contract that every real
  // application feature stays reachable is untouched, and its "Open it now" control behaves
  // identically the moment the panel is open (see tools.ts#gatesApplicationFeature).
  const structure = useStructureSnapshot();
  const disclosure = computeDisclosure(structure);
  // The prices catalogue and Settings are last in the row and FIRST in time: consolePanelIds
  // appends both unconditionally, so the console is never empty.
  //
  // THE SETTINGS EMBLEM IS NOW BOUGHT (control-unlocks.ts#settings.open, 25 cookies, by the
  // owner's decree). Until it is, its position on the console holds a coin-slot plate with that
  // figure on it instead — the same plate every other unbought control in this application
  // wears, in the same place, with the same tab stop, buying itself when pressed. It is a price,
  // not a gate: nothing has to be achieved first, only paid.
  //
  // The catalogue plate beside it is never sold at any price. That is what keeps this honest —
  // the entire price list, including the 25 cookies Settings costs, is one free press away on a
  // save that has never earned a cookie.
  const visibleIds = consolePanelIds(disclosure);
  const settingsBought = isControlUnlocked(structure, SETTINGS_OPEN_RUNG_ID);

  return (
    <div className="console" role="group" aria-label={bilingualText(CONSOLE_COPY.consoleLabel)}>
      {visibleIds.map((id) => {
        const label = SURFACE_LABELS[id];
        const open = id === openId;
        if (id === SETTINGS_PANEL_ID && !settingsBought) {
          return (
            <CoinSlot
              key={id}
              rungId={SETTINGS_OPEN_RUNG_ID}
              className="console__coin-slot"
              labelEn={label.en}
              labelYue={label.yue}
              focusRef={settingsSlotRef}
            />
          );
        }
        return (
          <button
            key={id}
            type="button"
            className="console__button"
            id={`console-${id}`}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-label={bilingualText(CONSOLE_COPY.open(label.en, label.yue))}
            data-open={open ? 'true' : undefined}
            ref={(node) => {
              buttonRefs.current[id] = node;
            }}
            onClick={(event) => onOpen(id, event.currentTarget)}
          >
            <ConsoleEmblem id={id} />
            {showsEnglish() ? (
              <span className="console__label console__label--legible" aria-hidden="true">
                {label.en}
              </span>
            ) : null}
            {showsCantonese() ? (
              <span className="console__label-zh console__label-zh--legible" aria-hidden="true">
                {label.yue}
              </span>
            ) : null}
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
  surfaceId: PanelId;
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
            {showsEnglish() ? <span>{label.en}</span> : null}
            {showsCantonese() ? <span className="anchored-panel__title-zh">{label.yue}</span> : null}
          </h2>
          <button
            type="button"
            className="anchored-panel__close"
            ref={closeRef}
            aria-label={bilingualText(CONSOLE_COPY.close)}
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

/**
 * THE CABINET'S TITLE BAR — and the one part of this application whose own chrome is for sale.
 *
 * Dragging, minimizing, maximizing and resizing are each a separate purchase in the control
 * economy (src/shared/game/control-unlocks.ts). CLOSE IS NOT AND NEVER WILL BE: it is
 * unconditional here, it is unconditional in the main process, and the registry-integrity test
 * fails if anything called "close" ever appears in the price table. A build that could trap
 * somebody inside itself is not a joke.
 *
 * The bar lives inside GameProvider (see `App` below) because every one of those questions is a
 * question about the save. It is still the first child of `.app-shell`, so nothing about the
 * layout, the drag region or the window's own geometry moved.
 */
function TitleBar() {
  const dragBought = useControlRung('chrome.drag');
  const dragFull = useControlRung('chrome.drag.full');
  const minimizeBought = useControlRung('chrome.minimize');
  const maximizeBought = useControlRung('chrome.maximize');
  const maximizeDoubleClick = useControlRung('chrome.maximize.doubleClick');
  const resizeBought = useControlRung('chrome.resize');

  const minimize = useCallback(() => window.materialCookieClicker?.window.minimize(), []);
  const toggleMaximize = useCallback(() => window.materialCookieClicker?.window.toggleMaximize(), []);
  const close = useCallback(() => window.materialCookieClicker?.window.close(), []);

  /**
   * RESIZING IS ENFORCED BY THE MAIN PROCESS, not by this renderer.
   *
   * On a frameless window the resize grips belong to the operating system — there is no element
   * here to disable and no CSS that would stop a drag on the real edge. So the window is CREATED
   * not resizable (main.ts) and this effect is the only thing that ever asks for it to change.
   * It runs on mount too, which is what makes a reload of an unlocked save re-assert the flag.
   */
  useEffect(() => {
    window.materialCookieClicker?.window.setResizable?.(resizeBought);
  }, [resizeBought]);

  // Three states, not two: nothing drags, the marquee plate drags, or the whole bar drags.
  const dragState = !dragBought ? 'locked' : dragFull ? 'full' : 'marquee';

  return (
    <header
      className="title-bar"
      role="banner"
      data-drag={dragState}
      onDoubleClick={maximizeBought && maximizeDoubleClick ? toggleMaximize : undefined}
    >
      {/* The cabinet's marquee: the game's name on a bevelled plate between two rivets. The
          plate sits inside the drag region, so dragging the rail and double-clicking it to
          toggle maximize still work anywhere that is not one of the three caps. */}
      <span className="title-bar__marquee">
        <span className="title-bar__rivet" aria-hidden="true" />
        <span className="title-bar__label">Material Cookie Clicker</span>
        <span className="title-bar__rivet" aria-hidden="true" />
      </span>
      {/* Until dragging is bought the bar carries its price instead of its drag region, so the
          very first thing a fresh save sees is what a control costs. */}
      {!dragBought ? (
        <span className="title-bar__drag-plate">
          <CoinSlot
            rungId="chrome.drag"
            variant="inline"
            labelEn="Drag the window"
            labelYue="拖呢個窗"
            className="title-bar__drag-slot"
          />
        </span>
      ) : null}
      <div className="title-bar__controls" role="group" aria-label={bilingualText(TITLE_BAR_COPY.controlsLabel)}>
        {minimizeBought ? (
          <button type="button" className="title-bar__button" aria-label={bilingualText(TITLE_BAR_COPY.minimize)} onClick={minimize}>
            <span className="title-bar__glyph" aria-hidden="true">&#x2013;</span>
          </button>
        ) : (
          <CoinSlot rungId="chrome.minimize" variant="chrome" glyph="&#x2013;" labelEn="Minimize" labelYue="縮到最細" />
        )}
        {maximizeBought ? (
          <button
            type="button"
            className="title-bar__button"
            aria-label={bilingualText(TITLE_BAR_COPY.maximizeRestore)}
            onClick={toggleMaximize}
          >
            <span className="title-bar__glyph" aria-hidden="true">&#x25A1;</span>
          </button>
        ) : (
          <CoinSlot rungId="chrome.maximize" variant="chrome" glyph="&#x25A1;" labelEn="Maximize" labelYue="放到最大" />
        )}
        {/* Never gated. Never will be. */}
        <button
          type="button"
          className="title-bar__button title-bar__button--close"
          aria-label={bilingualText(TITLE_BAR_COPY.close)}
          onClick={close}
        >
          <span className="title-bar__glyph" aria-hidden="true">&#x2715;</span>
        </button>
      </div>
    </header>
  );
}

export function App() {
  // The settings STORE is resolved once and kept in a ref: it is a backend, not state, and
  // re-resolving it on every render would re-read localStorage for nothing.
  const settingsStoreRef = useRef<ReturnType<typeof resolveAppSettingsStore> | null>(null);
  if (!settingsStoreRef.current) settingsStoreRef.current = resolveAppSettingsStore();
  const settingsStore = settingsStoreRef.current;

  // Loaded synchronously from the initialiser, so the very first paint is already in the
  // player's chosen language — a bilingual flash before switching to Cantonese would be a bug
  // visible on every single launch.
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      return settingsStore.load();
    } catch {
      return DEFAULT_APP_SETTINGS;
    }
  });

  // The one write to copy.ts's module-level mode used to happen here. It now happens one level
  // down, in <LanguageModeGate>, because the answer needs the SAVE: Cantonese and Bilingual are
  // bought controls and English is the free default, so what the app renders in is a function of
  // the stored preference AND of what has been paid for. The gate sits directly inside
  // GameProvider and above everything that reads copy, so the guarantee is unchanged — every
  // child below renders against one already-decided mode, with no flash of the previous one.

  const commit = useCallback(
    (next: AppSettings) => {
      setSettings(next);
      settingsStore.save(next);
    },
    [settingsStore],
  );

  const settingsContext: AppSettingsContextValue = {
    settings,
    setLanguageMode: useCallback(
      (languageMode: LanguageMode) => commit({ ...settings, languageMode }),
      [commit, settings],
    ),
    // One language per call, by construction: there is no code path that can move both levels.
    setFunnyLevel: useCallback(
      (language: 'en' | 'yue', level: FunnyLevel) =>
        commit(language === 'en' ? { ...settings, funnyLevelEn: level } : { ...settings, funnyLevelYue: level }),
      [commit, settings],
    ),
  };

  // One GameProvider for the whole shell: every screen reads the same store, so switching
  // panels never restarts the tick loop or reloads the save. It now also wraps the TITLE BAR,
  // because the window's own buttons are bought with cookies (control-unlocks.ts) and therefore
  // ask the save a question. The rendered DOM is unchanged: `.app-shell` is still the shell and
  // the bar is still its first child.
  return (
    <AppSettingsProvider value={settingsContext}>
      <GameProvider>
        <LanguageModeGate stored={settings.languageMode}>
          <TitleBar />
          <GameShell />
        </LanguageModeGate>
      </GameProvider>
    </AppSettingsProvider>
  );
}

/**
 * Decides the language the whole application renders in, and writes it to copy.ts's one seam.
 *
 * Two inputs, one answer. The STORED preference is what the player chose and is never rewritten
 * behind their back. What is bought (control-unlocks.ts#settings.language.yue / .both) is what
 * they are entitled to render in — English, the default, is free and always available and is the
 * fallback whenever the chosen mode is not paid for. `effectiveLanguageMode` is the pure
 * function that combines them and is asserted directly in tests.
 *
 * It lives inside GameProvider because the second input is the save, and above every consumer
 * because copy.ts's mode is module-level state that must already be correct when children render.
 */
function LanguageModeGate({ stored, children }: { stored: LanguageMode; children: ReactNode }) {
  const structure = useStructureSnapshot();
  const mode = effectiveLanguageMode(stored, {
    yue: isControlUnlocked(structure, 'settings.language.yue'),
    both: isControlUnlocked(structure, 'settings.language.both'),
  });
  setActiveLanguageMode(mode);
  return (
    <div className="app-shell" data-language-mode={mode}>
      {children}
    </div>
  );
}

function GameShell() {
  // Which panel is open, if any, and where it grows from. Nothing about this is persisted: the
  // game surface is always the base state, so a reload never reopens a panel over it.
  const [openSurface, setOpenSurface] = useState<PanelId | null>(null);
  const [anchor, setAnchor] = useState<Anchor>({ x: 0, y: 0 });
  const [shellStatus, setShellStatus] = useState<Bilingual | null>(null);
  // Set only when Settings was opened by a tool card's "Open it now", so the panel can say where
  // the player came from and light up the row that request was closest to. Cleared on close.
  const [settingsEntry, setSettingsEntry] = useState<{
    row: SettingsRowId;
    nameEn: string;
    nameYue: string;
  } | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buttonRefs = useRef<Partial<Record<PanelId, HTMLButtonElement | null>>>({});
  // The Settings coin-slot plate on the console, while Settings is unbought. "Open it now"
  // sends the keyboard here rather than opening a panel nobody has paid for yet.
  const settingsSlotRef = useRef<HTMLButtonElement | null>(null);
  const settingsBought = useControlRung(SETTINGS_OPEN_RUNG_ID);
  const { notice: offlineNotice, dismiss: dismissOfflineNotice } = useOfflineNotice();
  const milestoneMessage = useMilestoneMessage();

  const openPanel = useCallback((id: PanelId, button: HTMLButtonElement) => {
    const rect = button.getBoundingClientRect();
    setAnchor({ x: rect.left + rect.width / 2, y: rect.bottom });
    setOpenSurface(id);
    // Pressing the Settings emblem directly is not an arrival from the tech tree.
    setSettingsEntry(null);
  }, []);

  // Closing always hands focus back to the button that opened the panel, so the keyboard never
  // gets dropped at the top of the document.
  const closePanel = useCallback(() => {
    setOpenSurface((current) => {
      if (current) buttonRefs.current[current]?.focus();
      return null;
    });
    setSettingsEntry(null);
  }, []);

  /** The depot status card in the shop rail's footer is a door into the factory panel: it opens
   *  the same anchored dialog the console emblem does, anchored to the card's own button so the
   *  panel still grows out of the control the player actually pressed. */
  const openFactoryPanel = useCallback((button: HTMLButtonElement) => {
    const rect = button.getBoundingClientRect();
    setAnchor({ x: rect.left + rect.width / 2, y: rect.bottom });
    setOpenSurface('factory');
    setSettingsEntry(null);
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
   * "Open it now" on a tool card. Its destination is the Settings panel, which is the
   * application surface this build ships — and which, by the owner's decree, now costs 25
   * cookies to open (control-unlocks.ts#settings.open).
   *
   * So the handler has two honest branches, decided by console-panels.ts#openFeatureOutcome:
   *
   *   • BOUGHT — unchanged from before. The open panel swaps from Tools to Settings, anchored to
   *     the Settings emblem, with the closest row highlighted and a note saying where the player
   *     came from.
   *   • UNBOUGHT — the purchase is SURFACED rather than the panel silently failing to open. The
   *     status region announces the control and its literal price, and focus moves to the
   *     coin-slot plate standing in the emblem's place, which is the button that buys it. One
   *     press from there and the panel opens.
   *
   * Nothing here consults the tech tree, in either branch. The handler runs identically for
   * every tool in every unlock state, and the price in front of Settings is a price, not a
   * progress gate: no tool, milestone or unlock stands in front of it, any save can pay it the
   * moment it has the cookies, and the figure is readable for free in the prices catalogue on
   * the console beside it (see tools.ts#gatesApplicationFeature).
   */
  const openApplicationFeature = useCallback<OpenApplicationFeature>(
    (toolId, def) => {
      const outcome = openFeatureOutcome(toolId, settingsBought);
      if (outcome.kind === 'purchase') {
        announce(SETTINGS_COPY.featureNeedsPurchase(formatExactDigits(controlRungPrice(outcome.rungId))));
        settingsSlotRef.current?.focus();
        return;
      }
      setSettingsEntry({ row: outcome.row, nameEn: def.nameEn, nameYue: def.nameYue });
      const button = buttonRefs.current[outcome.panel];
      if (button) {
        const rect = button.getBoundingClientRect();
        setAnchor({ x: rect.left + rect.width / 2, y: rect.bottom });
      }
      setOpenSurface(outcome.panel);
      announce(SETTINGS_COPY.featureOpened(def.nameEn, def.nameYue));
    },
    [announce, settingsBought],
  );

  return (
    <main className="app-content" id="root-content">
      {/* One cabinet, one surface. The HUD is pinned to its top with the console cluster bolted
          on beside it, and the game fills the rest — permanently. Secondary surfaces are panels
          that grow out of a console button on top of it; the tick loop keeps running behind. */}
      <div className="cabinet" data-panel-open={openSurface ? 'true' : undefined}>
        <div className="cabinet-head">
          <Hud />
          <CabinetConsole
            openId={openSurface}
            onOpen={openPanel}
            buttonRefs={buttonRefs}
            settingsSlotRef={settingsSlotRef}
          />
        </div>

        <div className="cabinet-body">
          <GameSurface onOpenFactory={openFactoryPanel} />
        </div>
      </div>

      {openSurface && (
        <AnchoredPanel
          surfaceId={openSurface}
          label={SURFACE_LABELS[openSurface]}
          anchor={anchor}
          onClose={closePanel}
        >
          {openSurface === 'factory' && <FactoryScreen />}
          {openSurface === 'home' && <HomeScreen />}
          {openSurface === 'achievements' && <AchievementsScreen />}
          {openSurface === 'tools' && <ToolsScreen onOpenApplicationFeature={openApplicationFeature} />}
          {openSurface === 'statistics' && <StatisticsScreen />}
          {openSurface === 'prestige' && <PrestigeScreen />}
          {openSurface === CATALOGUE_PANEL_ID && <ControlsCatalogue />}
          {openSurface === 'settings' && (
            <SettingsScreen
              highlightRow={settingsEntry?.row ?? null}
              openedFrom={settingsEntry ? { nameEn: settingsEntry.nameEn, nameYue: settingsEntry.nameYue } : null}
            />
          )}
        </AnchoredPanel>
      )}

      {offlineNotice && (
        <div className="offline-banner" role="status">
          <span>{offlineNotice.en}</span>
          <span>{offlineNotice.yue}</span>
          <button type="button" className="offline-banner__dismiss offline-banner__dismiss--target" onClick={dismissOfflineNotice}>
            {bilingualText(SHELL_COPY.dismiss)}
          </button>
        </div>
      )}

      {/* The medal celebration, cabinet-wide: an achievement unlocks during PLAY, so the toast
          lives on the shell rather than inside the Achievements panel that the player almost
          never has open at that moment. It is aria-hidden — the milestone region below is the
          single spoken announcement. */}
      <AchievementUnlockToast />

      {/* The same treatment for a random event landing. Also aria-hidden: narration.ts already
          put this event through the one milestone region that speaks. */}
      <RandomEventToast />

      {/* What a Mouse Raid actually cost, or what defending it paid, with the literal figure in
          it. Real content rather than aria-hidden decoration — the status region announced the
          outcome once, and this is the copy of it a player can go back and read. */}
      <MouseRaidAftermathToast />

      <div className="milestone-region" role="status" aria-live="polite">
        {milestoneMessage ? `${bilingualText(milestoneMessage)}` : ''}
      </div>

      {/* The one purchase-feedback overlay for the whole game. It renders nothing until a
          dispatch actually applies a purchase, and never takes part in layout. */}
      <PurchaseFxLayer />

      <div className="shell-status" role="status" aria-live="polite">
        {shellStatus ? `${bilingualText(shellStatus)}` : ''}
      </div>
    </main>
  );
}
