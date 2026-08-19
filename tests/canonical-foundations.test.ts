import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createSearchState } from '@material-cookie-clicker/surface-kernel';

import {
  DEFAULT_APP_SETTINGS,
  LEGACY_APP_SETTINGS_KEY,
  createLocalStorageAppSettings,
  normalizeAppSettings,
  type SettingsStorageLike,
} from '../src/renderer/game/app-settings';
import {
  bilingualText,
  funnyLevelPreview,
  getActiveLanguageMode,
  setActiveLanguageMode,
  setActiveVocabulary,
} from '../src/renderer/game/copy';
import { resolveBulkCloseIds, type CanonicalPage } from '../src/renderer/components/CanonicalTabs';
import { CANONICAL_COMMANDS } from '../src/renderer/components/CanonicalCommandPalette';
import { normalizeCanonicalSharedSettings } from '../src/shared/canonical-ipc';

function memoryStorage(): SettingsStorageLike {
  const values = new Map<string, string>();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
}

describe('canonical application settings', () => {
  it('persists and restores the complete normalized application contract', () => {
    const storage = memoryStorage();
    const store = createLocalStorageAppSettings(storage);
    const chosen = {
      ...DEFAULT_APP_SETTINGS,
      dialogEmoji: false,
      schoolMode: true,
      displayName: 'Cookie Office',
      personalVocabulary: { version: 1 as const, replacements: { Bakery: 'Kitchen' } },
      narrator: { ...DEFAULT_APP_SETTINGS.narrator, enabled: true, language: 'both' as const, rate: 1.4 },
      tabs: { ...DEFAULT_APP_SETTINGS.tabs, dock: 'right' as const, pinnedIds: ['general', 'status'] },
      paletteSize: 'window' as const,
    };
    store.save(chosen);
    expect(store.load()).toEqual(chosen);
  });

  it('repairs corrupt nested settings and revalidates a private vocabulary cache', () => {
    const repaired = normalizeAppSettings({
      narrator: { enabled: true, language: 'sideways', rate: 99, pitch: 0 },
      tabs: { dock: 'ceiling', pinnedIds: ['general', 4, 'general'] },
      personalVocabulary: { version: 1, replacements: { constructor: 'unsafe' } },
    });
    expect(repaired.narrator).toMatchObject({ enabled: true, language: 'en', rate: 2, pitch: 0.5 });
    expect(repaired.tabs.dock).toBe('left');
    expect(repaired.tabs.pinnedIds).toEqual(['general']);
    expect(repaired.personalVocabulary).toBeNull();
  });

  it('migrates the legacy three-field record through normalization', () => {
    const storage = memoryStorage();
    storage.setItem(LEGACY_APP_SETTINGS_KEY, JSON.stringify({ languageMode: 'yue', funnyLevelEn: 1, funnyLevelYue: 5 }));
    expect(createLocalStorageAppSettings(storage).load()).toEqual({
      ...DEFAULT_APP_SETTINGS,
      languageMode: 'yue',
      funnyLevelEn: 1,
      funnyLevelYue: 5,
    });
  });

  it('normalizes the cross-application School-mode record without accepting extra shapes', () => {
    expect(normalizeCanonicalSharedSettings({ schoolMode: true, schoolModeName: 'Focus', updatedAt: '2026-08-19T00:00:00.000Z' })).toEqual({
      version: 1,
      schoolMode: true,
      schoolModeName: 'Focus',
      updatedAt: '2026-08-19T00:00:00.000Z',
    });
    expect(normalizeCanonicalSharedSettings({ schoolMode: 'yes', schoolModeName: '' })).toMatchObject({ schoolMode: false, schoolModeName: 'School mode' });
  });
});

describe('real funny-level and vocabulary copy', () => {
  it('has five distinct rendered voices in each language', () => {
    expect(new Set([1, 2, 3, 4, 5].map((level) => funnyLevelPreview('en', level as 1 | 2 | 3 | 4 | 5))).size).toBe(5);
    expect(new Set([1, 2, 3, 4, 5].map((level) => funnyLevelPreview('yue', level as 1 | 2 | 3 | 4 | 5))).size).toBe(5);
  });

  it('applies an accepted vocabulary at the final text boundary and clears cleanly', () => {
    const restore = getActiveLanguageMode();
    try {
      setActiveLanguageMode('en');
      setActiveVocabulary({ Bakery: 'Kitchen' });
      expect(bilingualText({ en: 'Bakery settings', yue: '餅店設定' })).toBe('Kitchen settings');
      setActiveVocabulary(null);
      expect(bilingualText({ en: 'Bakery settings', yue: '餅店設定' })).toBe('Bakery settings');
    } finally {
      setActiveVocabulary(null);
      setActiveLanguageMode(restore);
    }
  });
});

describe('browser-style tabs and command palette', () => {
  const pages: CanonicalPage[] = ['general', 'narration', 'privacy', 'status'].map((id) => ({ id, label: id, detail: `${id} detail`, content: null }));

  it('previews containing and inverse bulk closes while protecting pinned tabs', () => {
    const search = createSearchState({ query: 'a' });
    expect(resolveBulkCloseIds(pages, ['general'], search, false)).toEqual(['narration', 'privacy', 'status']);
    expect(resolveBulkCloseIds(pages, ['general'], search, true)).toEqual([]);
    expect(resolveBulkCloseIds(pages, ['general'], createSearchState({ query: 'privacy' }), true)).toEqual(['narration', 'status']);
  });

  it('registers every canonical settings destination once', () => {
    const ids = CANONICAL_COMMANDS.map((command) => command.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(['settings.language', 'settings.school-mode', 'tools.tabs', 'tools.vocabulary', 'tools.narrator', 'tools.notifications', 'tools.status']));
  });

  it('keeps the exact global shortcut and four distinct tab discovery searches in source', () => {
    const palette = readFileSync(new URL('../src/renderer/components/CanonicalCommandPalette.tsx', import.meta.url), 'utf8');
    const tabs = readFileSync(new URL('../src/renderer/components/CanonicalTabs.tsx', import.meta.url), 'utf8');
    expect(palette).toContain("event.ctrlKey && event.shiftKey");
    expect(palette).toContain("event.key.toLocaleLowerCase() === 'f'");
    expect(tabs).toContain('Search this tab strip');
    expect(tabs).toContain('Search inside ${groupName}');
    expect(tabs).toContain('Search tab groups');
    expect(tabs).toContain('Search every application tab');
  });
});

describe('runtime surface contracts', () => {
  it('listens for late speech voices and keeps the display name separate from package identity', () => {
    const narrator = readFileSync(new URL('../src/renderer/components/CanonicalNarrator.tsx', import.meta.url), 'utf8');
    const app = readFileSync(new URL('../src/renderer/App.tsx', import.meta.url), 'utf8');
    const main = readFileSync(new URL('../src/main/main.ts', import.meta.url), 'utf8');
    expect(narrator).toContain("addEventListener('voiceschanged'");
    expect(app).toContain('{settings.displayName}');
    expect(main).toContain("const PRODUCT_APP_ID = 'org.dingdingprojects.materialcookieclicker'");
  });

  it('exposes only the bounded canonical aggregate bridge', () => {
    const preload = readFileSync(new URL('../src/preload/index.ts', import.meta.url), 'utf8');
    expect(preload).toContain('readSharedSettings');
    expect(preload).toContain('writeSharedSettings');
    expect(preload).toContain('openApplicationData');
    expect(preload).not.toContain('readFile:');
    expect(preload).not.toContain('writeFile:');
  });
});
