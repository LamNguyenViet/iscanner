import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocales } from 'expo-localization';
import type { FsAdapter } from '../library/types';
import { loadSettings, saveSettings, type LanguagePreference } from '../settings/settings';
import { resolveLanguage, stringsFor, type Language } from './language';
import { vi, type Strings } from './vi';

type LocaleValue = {
  t: Strings;
  language: Language;
  preference: LanguagePreference;
  setPreference(p: LanguagePreference): void;
};

// Outside a provider (e.g. screen tests) everything renders Vietnamese.
const LocaleContext = createContext<LocaleValue>({
  t: vi,
  language: 'vi',
  preference: 'system',
  setPreference: () => {},
});

/** Provides the active string table; in 'system' mode the device language applies live. */
export function LocaleProvider({ children, fs }: { children: ReactNode; fs?: FsAdapter }) {
  const [preference, setPreferenceState] = useState<LanguagePreference>('system');
  // Children wait for the saved preference so nothing captures a first-render table in the wrong language.
  const [loaded, setLoaded] = useState(false);
  const deviceCode = useLocales()[0]?.languageCode;

  useEffect(() => {
    let active = true;
    loadSettings(fs).then(({ language }) => {
      if (!active) return;
      setPreferenceState(language);
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [fs]);

  const setPreference = useCallback(
    (p: LanguagePreference) => {
      setPreferenceState(p);
      // A failed save keeps the choice for this session only.
      saveSettings({ language: p }, fs).catch(() => {});
    },
    [fs],
  );

  const value = useMemo(() => {
    const language = resolveLanguage(preference, deviceCode);
    return { t: stringsFor(language), language, preference, setPreference };
  }, [preference, deviceCode, setPreference]);
  if (!loaded) return null;
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleValue {
  return useContext(LocaleContext);
}
