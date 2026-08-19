import { useMemo, useState, type CSSProperties } from "react";

import {
  APPEARANCE_PROPERTY_SUPPORT,
  RAINBOW_SENTINEL,
  rainbowCss,
  exportProductAppearancePreset,
  importProductAppearancePreset,
  validateProductAppearanceValue,
  type AppearanceLockPort,
  type AppearancePropertyId,
  type ElementAppearanceTarget,
  type RainbowSpeedLevel,
} from "../../../shared/identity-model";
import { describeColor } from "./color-tools";

import type { ProductAppearanceStore } from "../../../shared/identity-model";
export type { ProductAppearanceStore } from "../../../shared/identity-model";

export interface AppearanceEditorProps {
  target: ElementAppearanceTarget;
  store: ProductAppearanceStore;
  installedFonts: readonly { stableId: string; displayName: string }[];
  lockPort?: AppearanceLockPort;
  reducedMotion: boolean;
  rainbowSpeed: RainbowSpeedLevel;
  onChange(store: ProductAppearanceStore): void;
  onRainbowSpeedChange(level: RainbowSpeedLevel): void;
  onClose(): void;
}

const PROPERTY_LABELS: Record<AppearancePropertyId, string> = {
  fontFamily: "Font family", fontSize: "Font size", fontWeight: "Weight", fontStyle: "Style",
  fontVariationSettings: "Variable-font axes", underline: "Underline", underlineColor: "Underline colour",
  strike: "Strikethrough", doubleStrike: "Double strikethrough", overline: "Overline",
  textTransform: "Capitalization", smallCaps: "Small caps", superscript: "Superscript", subscript: "Subscript",
  textColor: "Text colour", highlight: "Highlight", outline: "Outline", shadow: "Shadow", glow: "Glow",
  letterSpacing: "Character spacing", wordSpacing: "Word spacing", lineHeight: "Line height",
  baselineOffset: "Baseline offset", direction: "Text direction", textAlign: "Alignment",
  surfaceColor: "Surface colour", borderColor: "Border colour", borderWidth: "Border width",
  radius: "Corner radius", padding: "Padding", gap: "Spacing", elevation: "Elevation",
};

const COLOR_PROPERTIES = new Set<AppearancePropertyId>(["textColor", "highlight", "underlineColor", "surfaceColor", "borderColor"]);

export function AppearanceEditor(props: AppearanceEditorProps) {
  const { target, store, installedFonts, lockPort, reducedMotion, rainbowSpeed, onChange, onRainbowSpeedChange, onClose } = props;
  const [fontQuery, setFontQuery] = useState("");
  const [presetMessage, setPresetMessage] = useState("");
  const [presetDraft, setPresetDraft] = useState("");
  const values = store[target.id] ?? {};
  const fonts = useMemo(() => installedFonts.filter((font) => font.displayName.toLocaleLowerCase().includes(fontQuery.toLocaleLowerCase())), [fontQuery, installedFonts]);

  const setProperty = (property: AppearancePropertyId, value: string) => {
    if (lockPort?.isBlocked(target.id, property)) { lockPort.requestUnlock(target.id, property); return; }
    if (!validateProductAppearanceValue(value)) return;
    onChange({ ...store, [target.id]: { ...values, [property]: value } });
  };
  const resetProperty = (property: AppearancePropertyId) => {
    if (lockPort?.isBlocked(target.id, property)) { lockPort.requestUnlock(target.id, property); return; }
    const next = { ...values };
    delete next[property];
    onChange({ ...store, [target.id]: next });
  };

  const preview: CSSProperties & Record<string, string | number | undefined> = {};
  for (const [property, value] of Object.entries(values) as [AppearancePropertyId, string][]) {
    const css = APPEARANCE_PROPERTY_SUPPORT[property].css;
    if (css && value !== RAINBOW_SENTINEL) preview[css] = value;
    if (value === RAINBOW_SENTINEL) Object.assign(preview, rainbowCss(rainbowSpeed, reducedMotion));
  }

  return (
    <section role="dialog" aria-modal="false" aria-labelledby="appearance-editor-title" className="identity-appearance-editor">
      <header>
        <h2 id="appearance-editor-title">Edit appearance — {target.label}</h2>
        <button type="button" onClick={onClose} aria-label="Close appearance editor">Close</button>
      </header>
      <p>Changes apply only to this element. Unsupported properties remain visible with their browser limitation.</p>
      <div aria-label="Live appearance preview" style={preview}>The quick brown cookie · 敏捷曲奇</div>

      {target.properties.map((property) => {
        const support = APPEARANCE_PROPERTY_SUPPORT[property];
        const value = values[property] ?? "";
        const locked = lockPort?.isBlocked(target.id, property) ?? false;
        if (!support.css) return (
          <div key={property} data-appearance-property={property}>
            <strong>{PROPERTY_LABELS[property]}</strong>
            <p role="note">Unavailable: {support.unsupportedReason}</p>
          </div>
        );
        if (property === "fontFamily") return (
          <fieldset key={property}>
            <legend>{PROPERTY_LABELS[property]}</legend>
            <label>Search installed fonts <input type="search" value={fontQuery} onChange={(event) => setFontQuery(event.target.value)} /></label>
            <select aria-label="Installed font family" value={value} disabled={locked} onChange={(event) => setProperty(property, event.target.value)}>
              <option value="">Inherit</option>
              {fonts.map((font) => <option key={font.stableId} value={font.displayName} style={{ fontFamily: font.displayName }}>{font.displayName}</option>)}
            </select>
            {locked ? <button type="button" onClick={() => lockPort?.requestUnlock(target.id, property)}>Unlock font family</button> : null}
            <button type="button" onClick={() => resetProperty(property)}>Reset</button>
          </fieldset>
        );
        if (COLOR_PROPERTIES.has(property)) {
          const colour = value && value !== RAINBOW_SENTINEL ? describeColor(value) : null;
          return (
            <fieldset key={property}>
              <legend>{PROPERTY_LABELS[property]}</legend>
              <label>Continuous colour <input type="color" value={colour?.ok ? colour.translations.hex.slice(0, 7) : "#6750a4"} disabled={locked} onChange={(event) => setProperty(property, event.target.value)} /></label>
              <label>HEX, RGB, HSL, HWB, Lab, LCH, Oklab or Oklch <input value={value === RAINBOW_SENTINEL ? "" : value} disabled={locked} onChange={(event) => setProperty(property, event.target.value)} /></label>
              <button type="button" aria-pressed={value === RAINBOW_SENTINEL} disabled={locked} onClick={() => setProperty(property, RAINBOW_SENTINEL)}>Animated rainbow</button>
              {value === RAINBOW_SENTINEL ? <label>Rainbow speed <input type="range" min="1" max="5" value={rainbowSpeed} onChange={(event) => onRainbowSpeedChange(Number(event.target.value) as RainbowSpeedLevel)} /></label> : null}
              {colour?.ok ? <p aria-live="polite">Contrast {colour.contrast.toFixed(2)}:1 · CMYK {colour.cmyk.c.toFixed(1)}, {colour.cmyk.m.toFixed(1)}, {colour.cmyk.y.toFixed(1)}, {colour.cmyk.k.toFixed(1)} · {colour.outOfSrgbGamut ? "Outside sRGB gamut" : "Inside sRGB gamut"}</p> : null}
              {colour && !colour.ok ? <p role="alert">{colour.reason}</p> : null}
              <button type="button" onClick={() => resetProperty(property)}>Reset</button>
            </fieldset>
          );
        }
        return (
          <fieldset key={property}>
            <legend>{PROPERTY_LABELS[property]}</legend>
            <input aria-label={PROPERTY_LABELS[property]} value={value} disabled={locked} onChange={(event) => setProperty(property, event.target.value)} />
            {locked ? <button type="button" onClick={() => lockPort?.requestUnlock(target.id, property)}>Unlock {PROPERTY_LABELS[property]}</button> : null}
            <button type="button" onClick={() => resetProperty(property)}>Reset</button>
          </fieldset>
        );
      })}

      <fieldset>
        <legend>Appearance preset</legend>
        <button type="button" onClick={() => { navigator.clipboard?.writeText(exportProductAppearancePreset(store, `${target.label} preset`)).then(() => setPresetMessage("Preset copied."), () => setPresetMessage("Copy was unavailable.")); }}>Copy preset JSON</button>
        <label>Import preset JSON <textarea value={presetDraft} onChange={(event) => setPresetDraft(event.target.value)} /></label>
        <button type="button" onClick={() => { const verdict = importProductAppearancePreset(presetDraft); if (verdict.ok) { onChange(verdict.value); setPresetMessage("Preset imported."); } else setPresetMessage(verdict.reason); }}>Validate and import preset</button>
        <p role="status">{presetMessage}</p>
      </fieldset>
    </section>
  );
}
