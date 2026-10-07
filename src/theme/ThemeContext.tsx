import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance, useColorScheme } from 'react-native';
import type { FsAdapter } from '../library/types';
import { log } from '../logging/logger';
import { lightPalette, paletteFor, type Palette } from './palette';
import { loadSettings, saveSettings, toNativeScheme, type ThemePreference } from '../settings/settings';

type ThemeValue = {
  colors: Palette;
  scheme: 'light' | 'dark';
  preference: ThemePreference;
  setPreference(p: ThemePreference): void;
  /** True once the saved preference has been read. */
  loaded: boolean;
};

// Outside a provider (e.g. screen tests) everything renders light.
const ThemeContext = createContext<ThemeValue>({
  colors: lightPalette,
  scheme: 'light',
  preference: 'system',
  setPreference: () => {},
  loaded: true,
});

/**
 * Overrides the native color scheme app-wide (Alerts, keyboard and pickers follow it) and
 * exposes the palette for the effective scheme. In 'system' mode the device setting applies live.
 */
export function ThemeProvider({ children, fs }: { children: ReactNode; fs?: FsAdapter }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [loaded, setLoaded] = useState(false);
  const scheme: 'light' | 'dark' = useColorScheme() === 'dark' ? 'dark' : 'light';

  useEffect(() => {
    let active = true;
    loadSettings(fs).then(({ theme: p }) => {
      if (!active) return;
      setPreferenceState(p);
      Appearance.setColorScheme(toNativeScheme(p));
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [fs]);

  const setPreference = useCallback(
    (p: ThemePreference) => {
      setPreferenceState(p);
      Appearance.setColorScheme(toNativeScheme(p));
      // A failed save keeps the choice for this session only.
      log.info('settings.theme', { value: p });
      saveSettings({ theme: p }, fs).catch((e) => log.warn('saveSettings (theme) failed', { cause: e }));
    },
    [fs],
  );

  const value = useMemo(
    () => ({ colors: paletteFor(scheme), scheme, preference, setPreference, loaded }),
    [scheme, preference, setPreference, loaded],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}
