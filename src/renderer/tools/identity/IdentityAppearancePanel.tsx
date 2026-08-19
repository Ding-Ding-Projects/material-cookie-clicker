import { useState } from "react";

import {
  DEFAULT_IDENTITY_PREFERENCES,
  DEFAULT_LOGO_TRANSFORM,
  LOGO_PRESETS,
  MAX_LOGO_BYTES,
  SHIPPED_APP_NAME,
  STABLE_APP_IDENTITY,
  resolveDisplayName,
  type IdentityPreferences,
  type LogoTransform,
} from "../../../shared/identity-model";
import { loadIdentityPreferences, saveIdentityPreferences, withDisplayName, withPreset } from "./identity-store";
import { processLogoFile } from "./logo-processor";

export interface IdentityAppearancePanelProps {
  initialValue?: IdentityPreferences;
  onChange?(value: IdentityPreferences): void;
}

export function IdentityAppearancePanel({ initialValue, onChange }: IdentityAppearancePanelProps) {
  const [value, setValue] = useState(() => initialValue ?? loadIdentityPreferences());
  const [nameDraft, setNameDraft] = useState(value.displayName);
  const [transform, setTransform] = useState<LogoTransform>(value.logo.kind === "custom" ? value.logo.transform : DEFAULT_LOGO_TRANSFORM);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const commit = (next: IdentityPreferences) => {
    try { saveIdentityPreferences(next); setValue(next); onChange?.(next); setStatus("Saved locally."); }
    catch { setStatus("The change is active for this session, but local persistence was unavailable."); setValue(next); onChange?.(next); }
  };

  const upload = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true);
    setStatus("Validating and creating local display sizes…");
    try {
      const result = await processLogoFile(file, transform);
      if (!result.ok) { setStatus(result.reason); return; }
      commit({ version: 1, displayName: value.displayName, logo: { kind: "custom", transform, ...result.value } });
    } finally { setBusy(false); }
  };

  return (
    <section aria-labelledby="identity-heading" className="identity-appearance-panel">
      <h2 id="identity-heading">App identity and logo</h2>
      <p>The display name and logo can change. The installed identity, data directory, executable, and update channel never change.</p>
      <dl>
        <dt>Shown name</dt><dd>{resolveDisplayName(value)}</dd>
        <dt>Stable application ID</dt><dd><code>{STABLE_APP_IDENTITY.applicationId}</code></dd>
        <dt>Stable data directory key</dt><dd><code>{STABLE_APP_IDENTITY.dataDirectoryName}</code></dd>
      </dl>
      <form onSubmit={(event) => { event.preventDefault(); try { commit(withDisplayName(value, nameDraft)); } catch (error) { setStatus(error instanceof Error ? error.message : "The display name was rejected."); } }}>
        <label>Display name <input value={nameDraft} maxLength={60} onChange={(event) => setNameDraft(event.target.value)} placeholder={SHIPPED_APP_NAME} /></label>
        <button type="submit">Save display name</button>
        <button type="button" onClick={() => { setNameDraft(""); commit(withDisplayName(value, "")); }}>Reset shipped name</button>
      </form>

      <fieldset>
        <legend>Shipped logo presets</legend>
        {LOGO_PRESETS.map((preset) => <button key={preset.id} type="button" aria-pressed={value.logo.kind === "preset" && value.logo.presetId === preset.id} onClick={() => commit(withPreset(value, preset.id))}>{preset.name}<span> — {preset.description}</span></button>)}
      </fieldset>

      <fieldset disabled={busy}>
        <legend>Local custom logo</legend>
        <p>PNG or JPEG only, at most {MAX_LOGO_BYTES / 1024} KB. Animated, malformed, oversized, or signature-mismatched files are rejected without replacing the current logo. Processing makes no network request.</p>
        <input type="file" accept="image/png,image/jpeg" aria-label="Choose a local PNG or JPEG logo" onChange={(event) => void upload(event.currentTarget.files?.[0])} />
        <label>Fit <select value={transform.fit} onChange={(event) => setTransform({ ...transform, fit: event.target.value as LogoTransform["fit"] })}><option value="contain">Contain</option><option value="cover">Cover</option><option value="fill">Fill</option></select></label>
        <label>Focal point X <input type="range" min="0" max="1" step="0.01" value={transform.focalX} onChange={(event) => setTransform({ ...transform, focalX: Number(event.target.value) })} /></label>
        <label>Focal point Y <input type="range" min="0" max="1" step="0.01" value={transform.focalY} onChange={(event) => setTransform({ ...transform, focalY: Number(event.target.value) })} /></label>
        <label>Crop left <input type="number" min="0" max="1" step="0.01" value={transform.cropX} onChange={(event) => setTransform({ ...transform, cropX: Number(event.target.value) })} /></label>
        <label>Crop top <input type="number" min="0" max="1" step="0.01" value={transform.cropY} onChange={(event) => setTransform({ ...transform, cropY: Number(event.target.value) })} /></label>
        <label>Crop width <input type="number" min="0.01" max="1" step="0.01" value={transform.cropWidth} onChange={(event) => setTransform({ ...transform, cropWidth: Number(event.target.value) })} /></label>
        <label>Crop height <input type="number" min="0.01" max="1" step="0.01" value={transform.cropHeight} onChange={(event) => setTransform({ ...transform, cropHeight: Number(event.target.value) })} /></label>
        <label>Background <input value={transform.background} onChange={(event) => setTransform({ ...transform, background: event.target.value })} /></label>
      </fieldset>

      {value.logo.kind === "custom" ? <div aria-label="Custom logo safe-area previews">{value.logo.derivatives.map((asset) => <figure key={asset.size}><img src={asset.dataUrl} width={asset.size} height={asset.size} alt={`Custom app logo at ${asset.size} pixels`} /><figcaption>{asset.size}×{asset.size} safe area</figcaption></figure>)}</div> : null}
      <button type="button" onClick={() => commit(DEFAULT_IDENTITY_PREFERENCES)}>Reset all identity presentation</button>
      <p role="status" aria-live="polite">{status}</p>
    </section>
  );
}
