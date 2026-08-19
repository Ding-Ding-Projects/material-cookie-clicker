import { useEffect, useMemo, useState } from 'react';

import {
  CommandRegistry,
  createSearchState,
  searchCommands,
  teleportTarget,
  type CommandDescriptor,
} from '@material-cookie-clicker/surface-kernel';

import { useAppSettings } from '../game/AppSettingsContext.js';
import { bilingualText } from '../game/copy.js';
import { CanonicalSearch } from './CanonicalSearch.js';

export const CANONICAL_COMMANDS: CommandDescriptor[] = [
  { id: 'settings.language', label: 'Language mode', detail: 'Choose English, Cantonese, or bilingual presentation.', surface: 'Settings', tab: 'General', target: 'settings-language-label', kind: 'control', control: { control: 'select', preferenceKey: 'languageMode', options: [{ value: 'en', label: 'English' }, { value: 'yue', label: 'Cantonese' }, { value: 'both', label: 'Bilingual' }] } },
  { id: 'settings.funny.en', label: 'English funny level', detail: 'Change the English voice from serious to playful.', surface: 'Settings', tab: 'General', target: 'settings-funny-en', kind: 'control', control: { control: 'range', preferenceKey: 'funnyLevelEn', min: 1, max: 5, step: 1 } },
  { id: 'settings.funny.yue', label: 'Cantonese funny level', detail: 'Change the Cantonese voice independently.', surface: 'Settings', tab: 'General', target: 'settings-funny-yue', kind: 'control', control: { control: 'range', preferenceKey: 'funnyLevelYue', min: 1, max: 5, step: 1 } },
  { id: 'settings.dialog-emoji', label: 'Dialog emoji decoration', detail: 'Show or hide non-semantic emoji in dialogs.', surface: 'Settings', tab: 'General', target: 'settings-dialog-emoji', kind: 'control', control: { control: 'switch', preferenceKey: 'dialogEmoji' } },
  { id: 'settings.school-mode', label: 'School mode', detail: 'Force English and suppress playful and private vocabulary surfaces.', surface: 'Settings', tab: 'General', target: 'settings-school-mode', kind: 'control', control: { control: 'switch', preferenceKey: 'schoolMode' } },
  { id: 'settings.display-name', label: 'Application display name', detail: 'Rename presentation without changing package identity.', surface: 'Settings', tab: 'General', target: 'settings-display-name', kind: 'navigate' },
  { id: 'tools.tabs', label: 'Application tabs', detail: 'Dock, pin, group, search, and bulk-close application tabs.', surface: 'Application tools', tab: 'Navigation', target: 'canonical-navigation', kind: 'navigate' },
  { id: 'tools.vocabulary', label: 'Personal vocabulary', detail: 'Load, replace, or clear a local JSON wording map.', surface: 'Application tools', tab: 'Privacy', target: 'canonical-vocabulary', kind: 'navigate' },
  { id: 'tools.narrator', label: 'Narrator', detail: 'Choose voices, rate, pitch, and spoken language.', surface: 'Application tools', tab: 'Narration', target: 'canonical-narrator', kind: 'navigate' },
  { id: 'tools.notifications', label: 'Notification centre', detail: 'Review and manage persisted non-blocking notices.', surface: 'Application tools', tab: 'Notifications', target: 'canonical-notifications', kind: 'navigate' },
  { id: 'tools.status', label: 'Local Status Hub', detail: 'Inspect the live local application status and evidence.', surface: 'Application tools', tab: 'Status', target: 'canonical-status', kind: 'navigate' },
];

const COMMAND_YUE: Readonly<Record<string, { label: string; detail: string }>> = {
  'settings.language': { label: '語言模式', detail: '選擇英文、廣東話或者雙語顯示。' },
  'settings.funny.en': { label: '英文搞笑程度', detail: '由認真到活潑調整英文語氣。' },
  'settings.funny.yue': { label: '廣東話搞笑程度', detail: '獨立調整廣東話語氣。' },
  'settings.dialog-emoji': { label: '對話框表情符號', detail: '顯示或者隱藏對話框入面非語意嘅表情符號。' },
  'settings.school-mode': { label: '學校模式', detail: '強制英文並省略玩味同私人詞彙畫面。' },
  'settings.display-name': { label: '應用程式顯示名稱', detail: '改顯示名稱但唔改套件身份。' },
  'tools.tabs': { label: '應用程式分頁', detail: '泊位、釘住、分組、搜尋同批量關閉。' },
  'tools.vocabulary': { label: '私人詞彙', detail: '載入、取代或者清除本機 JSON 詞彙。' },
  'tools.narrator': { label: '旁白', detail: '選擇聲線、速度、音高同朗讀語言。' },
  'tools.notifications': { label: '通知中心', detail: '檢視同管理已保存嘅非阻塞通知。' },
  'tools.status': { label: '本機狀態中心', detail: '檢視而家嘅本機應用程式狀態。' },
};

export function CanonicalCommandPalette({ onTeleport }: { readonly onTeleport: (targetId: string) => void }) {
  const { settings, updateSettings, setLanguageMode, setFunnyLevel } = useAppSettings();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(() => createSearchState());
  const registry = useMemo(() => {
    const next = new CommandRegistry();
    next.registerAll(CANONICAL_COMMANDS.map((command) => command.id === 'settings.school-mode'
      ? { ...command, label: settings.schoolModeName, detail: `Force English and suppress playful and private vocabulary surfaces while ${settings.schoolModeName} is active.` }
      : command));
    return next;
  }, [settings.schoolModeName]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLocaleLowerCase() === 'f') {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (!open) {
    return <button type="button" className="canonical-palette-launch" onClick={() => setOpen(true)}>{bilingualText({ en: 'Commands', yue: '指令' })} · Ctrl+Shift+F</button>;
  }

  const schoolHidden = new Set(['settings.language', 'settings.funny.en', 'settings.funny.yue', 'tools.vocabulary']);
  const commands = searchCommands(registry, search).filter((command) => !settings.schoolMode || !schoolHidden.has(command.id));
  const activate = (command: CommandDescriptor) => {
    onTeleport(teleportTarget(command).elementId);
    setOpen(false);
  };

  return (
    <div className="canonical-palette-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className={`canonical-palette canonical-palette--${settings.paletteSize}`} role="dialog" aria-modal="true" aria-label="Command palette">
        <header>
          <h2>{settings.dialogEmoji ? <span aria-hidden="true">⌘ </span> : null}{bilingualText({ en: 'Command palette', yue: '指令面板' })}</h2>
          <button type="button" onClick={() => updateSettings({ paletteSize: settings.paletteSize === 'card' ? 'window' : 'card' })}>{settings.paletteSize === 'card' ? bilingualText({ en: 'Full window', yue: '全視窗' }) : bilingualText({ en: 'Bounded card', yue: '有界卡片' })}</button>
          <button type="button" onClick={() => setOpen(false)}>{bilingualText({ en: 'Close', yue: '關閉' })}</button>
        </header>
        <CanonicalSearch label={bilingualText({ en: 'Search every command, feature, and setting', yue: '搜尋所有指令、功能同設定' })} state={search} onChange={setSearch} />
        <ul className="canonical-palette__results">
          {commands.map((command) => (
            <li key={command.id}>
              <div>
                <button type="button" onClick={() => activate(command)}><strong>{command.id === 'settings.school-mode' ? settings.schoolModeName : bilingualText({ en: command.label, yue: COMMAND_YUE[command.id]?.label ?? command.label })}</strong></button>
                <span>{command.surface} · {command.tab}</span>
                <p>{bilingualText({ en: command.detail, yue: COMMAND_YUE[command.id]?.detail ?? command.detail })}</p>
              </div>
              {command.id === 'settings.language' ? (
                <div role="group" aria-label="Language mode from command palette">
                  {(['en', 'yue', 'both'] as const).map((mode) => <button key={mode} type="button" aria-pressed={settings.languageMode === mode} onClick={() => setLanguageMode(mode)}>{mode === 'en' ? 'English' : mode === 'yue' ? 'Cantonese' : 'Bilingual'}</button>)}
                </div>
              ) : command.id === 'settings.funny.en' ? (
                <input aria-label="English funny level from command palette" type="range" min={1} max={5} value={settings.funnyLevelEn} onChange={(event) => setFunnyLevel('en', Number(event.target.value) as 1 | 2 | 3 | 4 | 5)} />
              ) : command.id === 'settings.funny.yue' ? (
                <input aria-label="Cantonese funny level from command palette" type="range" min={1} max={5} value={settings.funnyLevelYue} onChange={(event) => setFunnyLevel('yue', Number(event.target.value) as 1 | 2 | 3 | 4 | 5)} />
              ) : command.id === 'settings.dialog-emoji' ? (
                <button type="button" role="switch" aria-checked={settings.dialogEmoji} onClick={() => updateSettings({ dialogEmoji: !settings.dialogEmoji })}>{settings.dialogEmoji ? 'On' : 'Off'}</button>
              ) : command.id === 'settings.school-mode' ? (
                <button type="button" role="switch" aria-checked={settings.schoolMode} onClick={() => updateSettings({ schoolMode: !settings.schoolMode })}>{settings.schoolMode ? 'On' : 'Off'}</button>
              ) : null}
            </li>
          ))}
        </ul>
        {commands.length === 0 ? <p>{bilingualText({ en: 'No command matches this search.', yue: '冇指令符合呢個搜尋。' })}</p> : null}
      </section>
    </div>
  );
}
