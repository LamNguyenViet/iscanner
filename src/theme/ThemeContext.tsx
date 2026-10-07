import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance, useColorScheme } from 'react-native';
import type { FsAdapter } from '../library/types';
import { lightPalette, paletteFor, type Palette } from './palette';
import { loadPreference, savePreference, toNativeScheme, type ThemePreference } from './preference';

type ThemeValue = {
  colors: Palette;
  scheme: 'light' | 'dark';
  preference: ThemePreference;
  setPreference(p: ThemePreference): void;
};

// Outside a provider (e.g. screen tests) everything renders light.
const ThemeContext = createContext<ThemeValue>({
  colors: lightPalette,
  scheme: 'light',
  preference: 'system',
  setPreference: () => {},
});

/**
 * Overrides the native color scheme app-wide (Alerts, keyboard and pickers follow it) and
 * exposes the palette for the effective scheme. In 'system' mode the device setting applies live.
 */
export function ThemeProvider({ children, fs }: { children: ReactNode; fs?: FsAdapter }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const scheme: 'light' | 'dark' = useColorScheme() === 'dark' ? 'dark' : 'light';

  useEffect(() => {
    let active = true;
    loadPreference(fs).then((p) => {
      if (!active) return;
      setPreferenceState(p);
      Appearance.setColorScheme(toNativeScheme(p));
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
      savePreference(p, fs).catch(() => {});
    },
    [fs],
  );

  const value = useMemo(
    () => ({ colors: paletteFor(scheme), scheme, preference, setPreference }),
    [scheme, preference, setPreference],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}
