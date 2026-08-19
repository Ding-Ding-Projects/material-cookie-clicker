import { useRef, useState } from 'react';

import { MAX_VOCABULARY_BYTES, validateVocabularyDocument } from '@material-cookie-clicker/surface-kernel';

import { useAppSettings } from '../game/AppSettingsContext.js';
import { bilingualText } from '../game/copy.js';
import { publishCanonicalNotification } from './CanonicalNotifications.js';

export function CanonicalVocabulary() {
  const { settings, updateSettings } = useAppSettings();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState(settings.personalVocabulary ? `${Object.keys(settings.personalVocabulary.replacements).length} replacements loaded.` : 'No personal vocabulary loaded.');

  const load = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_VOCABULARY_BYTES) {
      setStatus(`Invalid file: exceeds ${MAX_VOCABULARY_BYTES / 1024} KB.`);
      return;
    }
    const verdict = validateVocabularyDocument(await file.text());
    if (!verdict.ok) {
      setStatus(`Invalid file: ${verdict.reason} The previous valid vocabulary remains active.`);
      publishCanonicalNotification({ kind: 'error', title: 'Vocabulary not applied', body: verdict.reason });
      return;
    }
    updateSettings({ personalVocabulary: { version: 1, replacements: verdict.replacements } });
    setStatus(`${Object.keys(verdict.replacements).length} replacements loaded locally.`);
    publishCanonicalNotification({ kind: 'success', title: 'Vocabulary applied', body: `${Object.keys(verdict.replacements).length} local replacements are active.` });
  };

  const clear = () => {
    updateSettings({ personalVocabulary: null });
    if (inputRef.current) inputRef.current.value = '';
    setStatus('Personal vocabulary cleared. Original shipped wording is active.');
  };

  return (
    <section id="canonical-vocabulary" className="canonical-tool-card" aria-labelledby="canonical-vocabulary-title">
      <h3 id="canonical-vocabulary-title">{bilingualText({ en: 'Personal vocabulary', yue: '私人詞彙' })}</h3>
      <p>{bilingualText({ en: 'The optional JSON file is validated and cached locally. It is never uploaded, logged, exported, or copied into game saves.', yue: '可選嘅 JSON 檔案只會喺本機驗證同快取，唔會上載、記錄、匯出或者放入遊戲存檔。' })}</p>
      <label htmlFor="canonical-vocabulary-file">{settings.personalVocabulary ? bilingualText({ en: 'Replace local vocabulary JSON', yue: '取代本機詞彙 JSON' }) : bilingualText({ en: 'Choose local vocabulary JSON', yue: '選擇本機詞彙 JSON' })}</label>
      <input
        ref={inputRef}
        id="canonical-vocabulary-file"
        type="file"
        accept="application/json,.json"
        onChange={(event) => { void load(event.target.files?.[0]); }}
      />
      <button type="button" disabled={!settings.personalVocabulary} onClick={clear}>{bilingualText({ en: 'Clear vocabulary and local cache', yue: '清除詞彙同本機快取' })}</button>
      <p role="status">{status}</p>
      <details>
        <summary>{bilingualText({ en: 'Accepted local schema', yue: '接受嘅本機格式' })}</summary>
        <pre>{`{"version":1,"replacements":{"original wording":"private replacement"}}`}</pre>
        <p>Maximum 64 KB, 200 entries, safe bounded string keys and values, no unexpected fields.</p>
      </details>
    </section>
  );
}
