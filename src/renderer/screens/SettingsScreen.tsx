import { useEffect, useState } from 'react';
import { createSearchState, matchesSearch } from '@material-cookie-clicker/surface-kernel';

import { bilingualText, funnyLevelPreview, SETTINGS_COPY, showsCantonese, showsEnglish } from '../game/copy';
import { effectiveLanguageMode, LANGUAGE_MODES, type FunnyLevel, type LanguageMode } from '../game/app-settings';
import { useAppSettings } from '../game/AppSettingsContext';
import type { SettingsRowId } from '../game/console-panels';
import { CoinSlot, useControlRung } from '../components/CoinSlot';
import { ControlsCatalogue } from './ControlsCatalogue';
import { ApplicationToolsScreen } from './ApplicationToolsScreen';
import { CanonicalSearch } from '../components/CanonicalSearch';

/**
 * SETTINGS — the application's own surface (design/settings-funny-sliders.html).
 *
 * Three controls, and every one of them does something real:
 *   • the language mode, which re-renders every screen in the app through copy.ts#bilingualText;
 *   • two independent 1–5 funny levels, one per language, which are stored and persisted.
 *
 * The funny levels are stated honestly on the surface itself: this build's copy is written once
 * per language, so a level changes nothing on screen yet. That caption is part of the feature,
 * not an apology bolted onto it — a slider that silently pretends to have five voices would be
 * the dishonest version of the same control.
 *
 * The spec's own warning is obeyed structurally: the two sliders are separate cards with
 * separate headings, separate values in state (`funnyLevelEn` / `funnyLevelYue`) and a setter
 * that can only ever move ONE of them.
 *
 * ── AND ALL THREE ARE NOW BOUGHT (src/shared/game/control-unlocks.ts) ─────────────────────────
 *
 * The language switch and each funny slider is a purchase, at a printed price, exactly like a
 * generator. Until bought, the control is replaced IN PLACE by a coin-slot plate carrying its
 * price — never removed, because a settings panel that hid the settings would read as a bug.
 *
 * ── AND SO IS THE PANEL ITSELF, NOW ──────────────────────────────────────────────────────────
 *
 * By the owner's decree ("settings still appearing" / "needs to be purchased") the Settings
 * emblem on the console is `settings.open`, 25 cookies, and until it is bought the console shows
 * a coin-slot plate there instead. The old boundary — this panel is free because the price list
 * lives in it — is answered by moving the price list out: the controls catalogue is now its own
 * FREE console button (console-panels.ts#CATALOGUE_PANEL_ID) and is still rendered at the bottom
 * of this panel as a convenience. Nobody has to buy anything to read what things cost.
 *
 * The language row carries the second decree ("unlock more languages by buying"). English is the
 * default and is free forever — a fresh save is fully readable without paying — and the two
 * other modes are separate purchases, shown as coin-slot plates in the switch until bought.
 * Buying `settings.language` puts the switch on the panel; buying a MODE makes that button work.
 * The two compose and neither implies the other.
 */

const MODE_LABELS: Readonly<Record<LanguageMode, { en: string; yue: string }>> = {
  en: SETTINGS_COPY.modeEn,
  yue: SETTINGS_COPY.modeYue,
  both: SETTINGS_COPY.modeBoth,
};

export interface SettingsScreenProps {
  /** Set when Settings was opened from the Tools tech tree, so the panel can say where the
   *  player came from and light up the row that request was closest to. */
  readonly highlightRow?: SettingsRowId | null;
  readonly openedFrom?: { readonly nameEn: string; readonly nameYue: string } | null;
  readonly teleportTarget?: string | null;
}

export function SettingsScreen({ highlightRow = null, openedFrom = null, teleportTarget = null }: SettingsScreenProps = {}) {
  const { settings, updateSettings, setLanguageMode, setFunnyLevel } = useAppSettings();
  const [settingsTab, setSettingsTab] = useState<'general' | 'application'>('general');
  const [search, setSearch] = useState(() => createSearchState());
  const languageBought = useControlRung('settings.language');
  const ownedModes = {
    yue: useControlRung('settings.language.yue'),
    both: useControlRung('settings.language.both'),
  };
  const activeMode = effectiveLanguageMode(settings.languageMode, ownedModes);
  const funnyEnBought = useControlRung('settings.funny.en');
  const funnyYueBought = useControlRung('settings.funny.yue');
  const generalMatches = matchesSearch('language funny English Cantonese bilingual emoji School mode display name application rename', search);
  const applicationMatches = matchesSearch('application tools tabs narrator vocabulary notifications status converter Ollama identity security', search);

  useEffect(() => {
    if (!teleportTarget) return;
    const expectedTab = teleportTarget.startsWith('canonical-') ? 'application' : 'general';
    if (settingsTab !== expectedTab) {
      setSettingsTab(expectedTab);
      return;
    }
    const timer = window.setTimeout(() => {
      const target = document.getElementById(teleportTarget);
      if (!target) return;
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      target.setAttribute('data-teleport-highlight', 'true');
      const focusable = target.matches('input,button,select,textarea,[tabindex]')
        ? target as HTMLElement
        : target.querySelector<HTMLElement>('input,button,select,textarea,[tabindex]');
      (focusable ?? target).focus({ preventScroll: true });
      window.setTimeout(() => target.removeAttribute('data-teleport-highlight'), 1800);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [settingsTab, teleportTarget]);

  return (
    <div className="settings-screen">
      {openedFrom ? (
        <p className="settings-screen__from-tool" role="status">
          {bilingualText(SETTINGS_COPY.openedFromTool(openedFrom.nameEn, openedFrom.nameYue))}
        </p>
      ) : null}

      <CanonicalSearch label={bilingualText({ en: 'Search settings', yue: '搜尋設定' })} state={search} onChange={setSearch} />
      <div className="settings-browser-tabs" role="tablist" aria-label={bilingualText({ en: 'Settings sections', yue: '設定分頁' })}>
        <button type="button" role="tab" aria-selected={settingsTab === 'general'} aria-controls="settings-tabpanel-general" onClick={() => setSettingsTab('general')}>{bilingualText({ en: 'General', yue: '一般' })}</button>
        <button type="button" role="tab" aria-selected={settingsTab === 'application'} aria-controls="settings-tabpanel-application" onClick={() => setSettingsTab('application')}>{bilingualText({ en: 'Application tools', yue: '應用程式工具' })}</button>
      </div>

      {settingsTab === 'general' ? (
      <div id="settings-tabpanel-general" role="tabpanel">
      {generalMatches ? <>

      {!settings.schoolMode ? <>
      <section
        className="settings-block"
        data-highlight={highlightRow === 'language' ? 'true' : undefined}
        aria-labelledby="settings-language-label"
      >
        <h3 className="settings-block__label" id="settings-language-label">
          {bilingualText(SETTINGS_COPY.languageLabel)}
        </h3>
        {languageBought ? (
          <div className="settings-modes" role="group" aria-label={bilingualText(SETTINGS_COPY.languageLabel)}>
            {LANGUAGE_MODES.map((mode) => {
              const label = MODE_LABELS[mode];
              // The PRESSED state is the mode actually being rendered, not the stored
              // preference: a save that owns neither extra mode is reading English, and the
              // switch has to agree with the screen the player is looking at.
              const selected = activeMode === mode;
              // English is free and always was. The other two are bought, one each, and until
              // then their button is replaced in place by its coin-slot plate — same position in
              // the switch, same tab stop, price printed on it, buys itself when pressed.
              if (mode !== 'en' && !ownedModes[mode]) {
                return (
                  <CoinSlot
                    key={mode}
                    rungId={`settings.language.${mode}`}
                    variant="inline"
                    className="settings-modes__slot"
                    labelEn={label.en}
                    labelYue={label.yue}
                    // Buying a mode does not switch to it: the purchase is a purchase, and
                    // choosing is still the player's press on the button it becomes.
                  />
                );
              }
              return (
                <button
                  key={mode}
                  type="button"
                  className="settings-modes__button"
                  // A segmented switch of plain buttons, exactly as the spec draws it: each one
                  // reports its own pressed state, so a screen reader hears which mode is on
                  // without the group pretending to be a radio group it does not behave like.
                  aria-pressed={selected}
                  onClick={() => setLanguageMode(mode)}
                >
                  {/* The mode buttons name their language in that language wherever possible, so
                      an English-only reader can still find English after switching away from it. */}
                  {showsEnglish() ? <span className="settings-modes__en">{label.en}</span> : null}
                  {showsCantonese() ? <span className="settings-modes__yue">{label.yue}</span> : null}
                </button>
              );
            })}
          </div>
        ) : (
          <CoinSlot rungId="settings.language" />
        )}
        <p className="settings-caption">{bilingualText(SETTINGS_COPY.languageCaption)}</p>
        <p className="settings-note settings-note--honest">{bilingualText(SETTINGS_COPY.languagePricedNote)}</p>
      </section>

      <section
        className="settings-block"
        data-highlight={highlightRow === 'funny' ? 'true' : undefined}
        aria-labelledby="settings-funny-label"
      >
        <h3 className="settings-block__label" id="settings-funny-label">
          {bilingualText(SETTINGS_COPY.funnyHeading)}
        </h3>
        <p className="settings-note settings-note--warning">{bilingualText(SETTINGS_COPY.independenceNote)}</p>

        <div className="settings-sliders">
          {/* Two separate purchases as well as two separate sliders — buying the English one
              cannot move, enable or reveal the Cantonese one. The independence the spec asked
              for now runs all the way down to the till. */}
          {funnyEnBought ? (
            <FunnySlider
              language="en"
              level={settings.funnyLevelEn}
              title={SETTINGS_COPY.funnyEnTitle}
              scale={SETTINGS_COPY.funnyEnScale}
              ariaLabel={SETTINGS_COPY.funnyEnSliderLabel(settings.funnyLevelEn)}
              onChange={(level) => setFunnyLevel('en', level)}
            />
          ) : (
            <div className="settings-slider settings-slider--en settings-slider--locked">
              <h4 className="settings-slider__title">{bilingualText(SETTINGS_COPY.funnyEnTitle)}</h4>
              <CoinSlot rungId="settings.funny.en" />
            </div>
          )}
          {funnyYueBought ? (
            <FunnySlider
              language="yue"
              level={settings.funnyLevelYue}
              title={SETTINGS_COPY.funnyYueTitle}
              scale={SETTINGS_COPY.funnyYueScale}
              ariaLabel={SETTINGS_COPY.funnyYueSliderLabel(settings.funnyLevelYue)}
              onChange={(level) => setFunnyLevel('yue', level)}
            />
          ) : (
            <div className="settings-slider settings-slider--yue settings-slider--locked">
              <h4 className="settings-slider__title">{bilingualText(SETTINGS_COPY.funnyYueTitle)}</h4>
              <CoinSlot rungId="settings.funny.yue" />
            </div>
          )}
        </div>

        <p className="settings-note settings-note--honest">{bilingualText(SETTINGS_COPY.funnyScopeNote)}</p>
        <p className="settings-caption">{bilingualText(SETTINGS_COPY.factsNote)}</p>
        <div className="settings-funny-preview" role="status">
          <p id="settings-funny-en">{funnyLevelPreview('en', settings.funnyLevelEn)}</p>
          {!settings.schoolMode ? <p id="settings-funny-yue">{funnyLevelPreview('yue', settings.funnyLevelYue)}</p> : null}
        </div>
      </section>

      </> : <p role="status">{bilingualText({ en: `${settings.schoolModeName} is active. English is forced; language, funny-level, and personal-vocabulary controls are omitted until it is turned off.`, yue: `${settings.schoolModeName} 已開啟。現時強制使用英文；語言、搞笑程度同私人詞彙控制會暫時省略。` })}</p>}

      <section className="settings-block" aria-labelledby="settings-application-label">
        <h3 className="settings-block__label" id="settings-application-label">{bilingualText({ en: 'Application presentation', yue: '應用程式顯示' })}</h3>
        <label id="settings-dialog-emoji">
          <input type="checkbox" checked={settings.dialogEmoji} onChange={(event) => updateSettings({ dialogEmoji: event.target.checked })} />
          {bilingualText({ en: 'Show emojis in dialogs and message boxes', yue: '喺對話框同訊息框顯示表情符號' })}
        </label>
        <label id="settings-school-mode">
          <input type="checkbox" checked={settings.schoolMode} onChange={(event) => updateSettings({ schoolMode: event.target.checked })} />
          {settings.schoolModeName}
        </label>
        <label>
          {bilingualText({ en: 'Rename this mode', yue: '重新命名呢個模式' })}
          <input value={settings.schoolModeName} maxLength={48} onChange={(event) => updateSettings({ schoolModeName: event.target.value })} onBlur={(event) => { if (!event.currentTarget.value.trim()) updateSettings({ schoolModeName: 'School mode' }); }} />
        </label>
        <p>{bilingualText({ en: 'When active, this mode forces English and omits Cantonese, funny-level, private-vocabulary, and dim-sum controls while preserving their stored choices.', yue: '開啟後會強制使用英文，省略廣東話、搞笑程度、私人詞彙同點心控制，但會保留之前儲存嘅選擇。' })}</p>
        <label id="settings-display-name">
          {bilingualText({ en: 'Application display name', yue: '應用程式顯示名稱' })}
          <input value={settings.displayName} maxLength={80} onChange={(event) => updateSettings({ displayName: event.target.value })} onBlur={(event) => { if (!event.currentTarget.value.trim()) updateSettings({ displayName: DEFAULT_DISPLAY_NAME }); }} />
        </label>
        <button type="button" onClick={() => updateSettings({ displayName: DEFAULT_DISPLAY_NAME })}>{bilingualText({ en: 'Reset display name', yue: '重設顯示名稱' })}</button>
        <p>{bilingualText({ en: 'Renaming changes presentation only. Package identity, data folders, executable name, installer identity, and update feed do not move.', yue: '改名淨係改顯示。套件身份、資料夾、執行檔名稱、安裝程式身份同更新來源都唔會搬。' })}</p>
      </section>

      <ControlsCatalogue />
      </> : <p>No setting in General matches this search. The matching result may be on Application tools.</p>}
      </div>
      ) : (
        <div id="settings-tabpanel-application" role="tabpanel">
          {applicationMatches ? <ApplicationToolsScreen /> : <p>No setting in Application tools matches this search. The matching result may be on General.</p>}
        </div>
      )}
    </div>
  );
}

const DEFAULT_DISPLAY_NAME = 'Material Cookie Clicker';

function FunnySlider({
  language,
  level,
  title,
  scale,
  ariaLabel,
  onChange,
}: {
  /** Only used to key the two cards apart visually; each card owns one value and one setter. */
  language: 'en' | 'yue';
  level: FunnyLevel;
  title: { en: string; yue: string };
  scale: { en: string; yue: string };
  ariaLabel: { en: string; yue: string };
  onChange: (level: FunnyLevel) => void;
}) {
  return (
    <div className={`settings-slider settings-slider--${language}`}>
      <h4 className="settings-slider__title">{bilingualText(title)}</h4>
      <p className="settings-slider__scale">{bilingualText(scale)}</p>
      <input
        className="settings-slider__input"
        type="range"
        min={1}
        max={5}
        step={1}
        value={level}
        aria-label={bilingualText(ariaLabel)}
        onChange={(event) => onChange(Number(event.target.value) as FunnyLevel)}
      />
      <div className="settings-slider__ticks" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((tick) => (
          <span key={tick} data-current={tick === level ? 'true' : undefined}>
            {tick}
          </span>
        ))}
      </div>
      <p className="settings-slider__value">{bilingualText(SETTINGS_COPY.funnyLevelValue(level))}</p>
    </div>
  );
}

/** Re-exported so the catalogue can be reached without a deep import. */
export { ControlsCatalogue };
