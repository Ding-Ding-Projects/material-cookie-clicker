import { useEffect, useMemo, useRef, useState } from 'react';

import {
  NarrationQueue,
  bilingualSegments,
  createSearchState,
  matchesSearch,
  type NarrationHost,
  type VoiceDescriptor,
} from '@material-cookie-clicker/surface-kernel';

import { useAppSettings } from '../game/AppSettingsContext.js';
import { bilingualText, funnyLevelPreview } from '../game/copy.js';
import { CanonicalSearch } from './CanonicalSearch.js';

function browserVoices(): SpeechSynthesisVoice[] {
  return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis.getVoices() : [];
}

function toDescriptor(voice: SpeechSynthesisVoice): VoiceDescriptor {
  return { id: voice.voiceURI, label: `${voice.name} · ${voice.lang}${voice.localService ? '' : ' · network'}`, lang: voice.lang };
}

export function CanonicalNarrator() {
  const { settings, updateSettings } = useAppSettings();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(browserVoices);
  const [englishSearch, setEnglishSearch] = useState(() => createSearchState());
  const [cantoneseSearch, setCantoneseSearch] = useState(() => createSearchState());
  const preferences = settings.narrator;

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const refresh = () => setVoices(browserVoices());
    refresh();
    window.speechSynthesis.addEventListener('voiceschanged', refresh);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', refresh);
  }, []);

  const host = useMemo<NarrationHost>(() => ({
    listVoices: () => voices.map(toDescriptor),
    speak: (text, voiceId, rate, pitch, onEnd) => {
      if (!('speechSynthesis' in window)) { onEnd(); return; }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = voices.find((voice) => voice.voiceURI === voiceId) ?? null;
      utterance.rate = rate;
      utterance.pitch = pitch;
      utterance.onend = onEnd;
      utterance.onerror = onEnd;
      window.speechSynthesis.speak(utterance);
    },
    cancel: () => { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); },
  }), [voices]);
  const queueRef = useRef<NarrationQueue | null>(null);
  useEffect(() => {
    queueRef.current?.cancel();
    queueRef.current = new NarrationQueue(host);
    return () => queueRef.current?.cancel();
  }, [host]);

  const updateNarrator = (patch: Partial<typeof preferences>) => updateSettings({ narrator: { ...preferences, ...patch } });
  const englishVoices = voices.filter((voice) => /^en\b/i.test(voice.lang) && matchesSearch(`${voice.name} ${voice.lang}`, englishSearch));
  const cantoneseVoices = voices.filter((voice) => /^(yue|zh-HK)\b/i.test(voice.lang) && matchesSearch(`${voice.name} ${voice.lang}`, cantoneseSearch));
  const selectedEnglishInstalled = !preferences.englishVoiceId || voices.some((voice) => voice.voiceURI === preferences.englishVoiceId);
  const selectedCantoneseInstalled = !preferences.cantoneseVoiceId || voices.some((voice) => voice.voiceURI === preferences.cantoneseVoiceId);

  const speakPreview = () => {
    const en = preferences.language === 'yue' ? '' : funnyLevelPreview('en', settings.funnyLevelEn);
    const yue = settings.schoolMode || preferences.language === 'en' ? '' : funnyLevelPreview('yue', settings.funnyLevelYue);
    queueRef.current?.cancel();
    queueRef.current?.enqueue(bilingualSegments(en, yue, preferences));
  };

  return (
    <section id="canonical-narrator" className="canonical-tool-card" aria-labelledby="canonical-narrator-title">
      <h3 id="canonical-narrator-title">{bilingualText({ en: 'Narrator', yue: '旁白' })}</h3>
      <p>{bilingualText({ en: 'Off by default. Speech is serialized; bilingual preview always speaks English before Cantonese.', yue: '預設關閉。朗讀會逐段排隊；雙語預覽一定先讀英文，再讀廣東話。' })}</p>
      <button type="button" role="switch" aria-checked={preferences.enabled} onClick={() => updateNarrator({ enabled: !preferences.enabled })}>{preferences.enabled ? bilingualText({ en: 'Narrator on', yue: '旁白已開' }) : bilingualText({ en: 'Narrator off', yue: '旁白已關' })}</button>
      <fieldset>
        <legend>{bilingualText({ en: 'Spoken language', yue: '朗讀語言' })}</legend>
        {(['en', 'yue', 'both'] as const).map((language) => (
          <label key={language}><input type="radio" name="narrator-language" value={language} checked={(settings.schoolMode ? 'en' : preferences.language) === language} disabled={settings.schoolMode && language !== 'en'} onChange={() => updateNarrator({ language })} />{language === 'en' ? 'English' : language === 'yue' ? 'Cantonese' : 'Both'}</label>
        ))}
      </fieldset>
      {!('speechSynthesis' in window) ? <p role="status">Speech synthesis is unavailable on this computer.</p> : null}
      <div className="canonical-voice-grid">
        <div>
          <CanonicalSearch label={bilingualText({ en: 'Search installed English voices', yue: '搜尋已安裝英文聲線' })} state={englishSearch} onChange={setEnglishSearch} />
          <label><input type="radio" name="english-voice" checked={preferences.englishVoiceId === null} onChange={() => updateNarrator({ englishVoiceId: null })} />Choose automatically</label>
          {englishVoices.map((voice) => <label key={voice.voiceURI}><input type="radio" name="english-voice" checked={preferences.englishVoiceId === voice.voiceURI} onChange={() => updateNarrator({ englishVoiceId: voice.voiceURI })} />{toDescriptor(voice).label}</label>)}
          {englishVoices.length === 0 ? <p>No installed English voice matches.</p> : null}
          {!selectedEnglishInstalled ? <p role="status">The chosen English voice is not installed on this computer. The choice is kept and automatic fallback is active.</p> : null}
        </div>
        {!settings.schoolMode ? <div>
          <CanonicalSearch label={bilingualText({ en: 'Search installed Cantonese voices', yue: '搜尋已安裝廣東話聲線' })} state={cantoneseSearch} onChange={setCantoneseSearch} />
          <label><input type="radio" name="cantonese-voice" checked={preferences.cantoneseVoiceId === null} onChange={() => updateNarrator({ cantoneseVoiceId: null })} />Choose automatically</label>
          {cantoneseVoices.map((voice) => <label key={voice.voiceURI}><input type="radio" name="cantonese-voice" checked={preferences.cantoneseVoiceId === voice.voiceURI} onChange={() => updateNarrator({ cantoneseVoiceId: voice.voiceURI })} />{toDescriptor(voice).label}</label>)}
          {cantoneseVoices.length === 0 ? <p>No installed Hong Kong Cantonese voice is available.</p> : null}
          {!selectedCantoneseInstalled ? <p role="status">The chosen Cantonese voice is not installed on this computer. The choice is kept and automatic fallback is active.</p> : null}
        </div> : null}
      </div>
      <label>Rate {preferences.rate.toFixed(1)}<input type="range" min={0.5} max={2} step={0.1} value={preferences.rate} onChange={(event) => updateNarrator({ rate: Number(event.target.value) })} /></label>
      <label>Pitch {preferences.pitch.toFixed(1)}<input type="range" min={0.5} max={2} step={0.1} value={preferences.pitch} onChange={(event) => updateNarrator({ pitch: Number(event.target.value) })} /></label>
      <button type="button" disabled={!preferences.enabled} onClick={speakPreview}>{bilingualText({ en: 'Speak preview', yue: '朗讀預覽' })}</button>
      <button type="button" onClick={() => queueRef.current?.cancel()}>{bilingualText({ en: 'Stop speaking', yue: '停止朗讀' })}</button>
    </section>
  );
}
