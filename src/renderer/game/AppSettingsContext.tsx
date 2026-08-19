import { createContext, useContext, type ReactNode } from 'react';

import type { AppSettings, FunnyLevel, LanguageMode } from './app-settings.js';

/**
 * The live application settings and the two ways to change them.
 *
 * The STATE itself deliberately lives in `App` rather than in this provider. A provider that
 * holds its own `useState` and renders `{children}` re-renders only its context consumers when
 * that state changes — React bails out of the identical `children` element — and roughly a
 * hundred label sites in this app read the language mode through the module-level seam in
 * copy.ts rather than through a hook. Keeping the state at the top of the tree means a mode
 * change re-renders every screen, so no screen can be left rendering the previous language.
 */
export interface AppSettingsContextValue {
  readonly settings: AppSettings;
  readonly updateSettings: (patch: Partial<AppSettings>) => void;
  readonly setLanguageMode: (mode: LanguageMode) => void;
  /** Sets ONE language's funny level. There is no combined setter on purpose: the two levels are
   *  independent controls (design/settings-funny-sliders.html), and an API that could set both
   *  at once is the first step toward accidentally syncing them. */
  readonly setFunnyLevel: (language: 'en' | 'yue', level: FunnyLevel) => void;
}

const AppSettingsContext = createContext<AppSettingsContextValue | null>(null);

export function AppSettingsProvider({
  value,
  children,
}: {
  value: AppSettingsContextValue;
  children: ReactNode;
}) {
  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
}

export function useAppSettings(): AppSettingsContextValue {
  const value = useContext(AppSettingsContext);
  if (!value) throw new Error('useAppSettings must be used inside <AppSettingsProvider>.');
  return value;
}
