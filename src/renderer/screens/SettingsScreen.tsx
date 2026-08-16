import { bilingualText, SETTINGS_COPY, showsCantonese, showsEnglish } from '../game/copy';
import { LANGUAGE_MODES, type FunnyLevel, type LanguageMode } from '../game/app-settings';
import { useAppSettings } from '../game/AppSettingsContext';
import type { SettingsRowId } from '../game/console-panels';

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
}

export function SettingsScreen({ highlightRow = null, openedFrom = null }: SettingsScreenProps = {}) {
  const { settings, setLanguageMode, setFunnyLevel } = useAppSettings();

  return (
    <div className="settings-screen">
      {openedFrom ? (
        <p className="settings-screen__from-tool" role="status">
          {bilingualText(SETTINGS_COPY.openedFromTool(openedFrom.nameEn, openedFrom.nameYue))}
        </p>
      ) : null}

      <section
        className="settings-block"
        data-highlight={highlightRow === 'language' ? 'true' : undefined}
        aria-labelledby="settings-language-label"
      >
        <h3 className="settings-block__label" id="settings-language-label">
          {bilingualText(SETTINGS_COPY.languageLabel)}
        </h3>
        <div className="settings-modes" role="group" aria-label={bilingualText(SETTINGS_COPY.languageLabel)}>
          {LANGUAGE_MODES.map((mode) => {
            const label = MODE_LABELS[mode];
            const selected = settings.languageMode === mode;
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
        <p className="settings-caption">{bilingualText(SETTINGS_COPY.languageCaption)}</p>
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
          <FunnySlider
            language="en"
            level={settings.funnyLevelEn}
            title={SETTINGS_COPY.funnyEnTitle}
            scale={SETTINGS_COPY.funnyEnScale}
            ariaLabel={SETTINGS_COPY.funnyEnSliderLabel(settings.funnyLevelEn)}
            onChange={(level) => setFunnyLevel('en', level)}
          />
          <FunnySlider
            language="yue"
            level={settings.funnyLevelYue}
            title={SETTINGS_COPY.funnyYueTitle}
            scale={SETTINGS_COPY.funnyYueScale}
            ariaLabel={SETTINGS_COPY.funnyYueSliderLabel(settings.funnyLevelYue)}
            onChange={(level) => setFunnyLevel('yue', level)}
          />
        </div>

        <p className="settings-note settings-note--honest">{bilingualText(SETTINGS_COPY.funnyScopeNote)}</p>
        <p className="settings-caption">{bilingualText(SETTINGS_COPY.factsNote)}</p>
      </section>
    </div>
  );
}

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
