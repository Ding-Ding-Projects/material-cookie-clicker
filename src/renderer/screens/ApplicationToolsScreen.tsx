import { useEffect, useState, type ReactNode } from 'react';

import { useAppSettings } from '../game/AppSettingsContext.js';
import { CanonicalNarrator } from '../components/CanonicalNarrator.js';
import { CanonicalNotificationCenter } from '../components/CanonicalNotifications.js';
import { CanonicalTabs, type CanonicalPage } from '../components/CanonicalTabs.js';
import { CanonicalVocabulary } from '../components/CanonicalVocabulary.js';
import { bilingualText } from '../game/copy.js';

export interface ApplicationToolsScreenProps {
  /** Owned by the converter lane; omitted until its real implementation is integrated. */
  readonly converter?: ReactNode;
  /** Owned by the Ollama lane; omitted until its real implementation is integrated. */
  readonly ollama?: ReactNode;
  /** Owned by the identity/appearance lane; omitted until its real implementation is integrated. */
  readonly identity?: ReactNode;
  /** Owned by the security lane; omitted until its real implementation is integrated. */
  readonly security?: ReactNode;
}

function LocalStatusSurface() {
  const { settings } = useAppSettings();
  const [heartbeat, setHeartbeat] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setHeartbeat(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section id="canonical-status" className="canonical-tool-card" aria-labelledby="canonical-status-title">
      <h3 id="canonical-status-title">{bilingualText({ en: 'Local Status Hub', yue: '本機狀態中心' })}</h3>
      <p>{bilingualText({ en: 'This local surface reports current application state. It does not claim delivery to an external status service.', yue: '呢個本機畫面顯示而家嘅應用程式狀態，唔會聲稱已傳送去外部狀態服務。' })}</p>
      <dl className="canonical-status-grid">
        <div><dt>State</dt><dd>✅ running</dd></div>
        <div><dt>Last heartbeat</dt><dd><time dateTime={heartbeat.toISOString()}>{heartbeat.toLocaleString()}</time></dd></div>
        <div><dt>Language</dt><dd>{settings.schoolMode ? 'English (School mode)' : settings.languageMode}</dd></div>
        <div><dt>Narrator</dt><dd>{settings.narrator.enabled ? 'enabled' : 'off'}</dd></div>
        <div><dt>Vocabulary</dt><dd>{settings.personalVocabulary ? `${Object.keys(settings.personalVocabulary.replacements).length} local replacements` : 'original wording'}</dd></div>
        <div><dt>Tab dock</dt><dd>{settings.tabs.dock}</dd></div>
      </dl>
    </section>
  );
}

function NavigationSurface() {
  return (
    <section id="canonical-navigation" className="canonical-tool-card" aria-labelledby="canonical-navigation-title">
      <h3 id="canonical-navigation-title">{bilingualText({ en: 'Application navigation', yue: '應用程式導覽' })}</h3>
      <p>{bilingualText({ en: 'The surrounding browser-style strip is the live control: dock it to any edge, pin tabs, create and rename groups, search at all four scopes, or preview a bulk close.', yue: '外圍嘅瀏覽器式分頁列係真控制：可以泊去任何邊、釘住分頁、建立同改名群組、用四個範圍搜尋，或者預覽批量關閉。' })}</p>
      <p>{bilingualText({ en: 'Vertical strips use Up and Down; horizontal strips use Left and Right. Home and End move to the strip edges.', yue: '直向分頁列用上落鍵；橫向用左右鍵。Home 同 End 會去到分頁列兩端。' })}</p>
    </section>
  );
}

export function ApplicationToolsScreen({ converter, ollama, identity, security }: ApplicationToolsScreenProps = {}) {
  const { settings } = useAppSettings();
  const pages: CanonicalPage[] = [
    { id: 'general', label: bilingualText({ en: 'Navigation', yue: '導覽' }), detail: bilingualText({ en: 'Dock, pin, group, search, and bulk-close tabs.', yue: '泊位、釘住、分組、搜尋同批量關閉分頁。' }), content: <NavigationSurface /> },
    { id: 'narration', label: bilingualText({ en: 'Narrator', yue: '旁白' }), detail: bilingualText({ en: 'Voices, language, rate, pitch, and spoken preview.', yue: '聲線、語言、速度、音高同朗讀預覽。' }), content: <CanonicalNarrator /> },
    { id: 'notifications', label: bilingualText({ en: 'Notifications', yue: '通知' }), detail: bilingualText({ en: 'Review and manage persisted non-blocking notices.', yue: '檢視同管理已保存嘅非阻塞通知。' }), content: <CanonicalNotificationCenter /> },
    { id: 'status', label: bilingualText({ en: 'Status', yue: '狀態' }), detail: bilingualText({ en: 'Current local application state and heartbeat.', yue: '而家嘅本機應用程式狀態同心跳。' }), content: <LocalStatusSurface /> },
  ];
  if (!settings.schoolMode) pages.splice(2, 0, { id: 'privacy', label: bilingualText({ en: 'Vocabulary', yue: '詞彙' }), detail: bilingualText({ en: 'Private local vocabulary upload, replace, and clear.', yue: '上載、取代同清除本機私人詞彙。' }), content: <CanonicalVocabulary /> });
  if (converter) pages.push({ id: 'converter', label: 'Converter', detail: 'Local categorized file conversion.', content: converter });
  if (ollama) pages.push({ id: 'ollama', label: 'Ollama', detail: 'Local model store, pulls, chat, and harnesses.', content: ollama });
  if (identity) pages.push({ id: 'identity', label: 'Identity', detail: 'Display name, application mark, and appearance.', content: identity });
  if (security) pages.push({ id: 'security', label: 'Security', detail: 'Toy locks, authenticator, and local support tickets.', content: security });
  return <CanonicalTabs pages={pages} />;
}
