import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as NavigationThemeProvider,
  router,
  Stack,
  usePathname,
} from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import { useEffect, useMemo, useRef } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { UpdateGate } from '../src/components/UpdateGate';
import { LocaleProvider, useLocale } from '../src/i18n/LocaleContext';
import { LibraryProvider } from '../src/library/LibraryContext';
import { installGlobalHandlers } from '../src/logging/globalHandlers';
import { log } from '../src/logging/logger';
import { hasSharedFiles } from '../src/native/sharedPayloads';
import { ThemeProvider, useTheme } from '../src/theme/ThemeContext';
import { UpdateProvider } from '../src/update/UpdateContext';
import { useForegroundCheck } from '../src/workflows/useForegroundCheck';

/**
 * Opens the incoming screen for a share that arrived while the app was running. expo-sharing keeps the
 * shared intent natively; its JS event is one-shot and is lost if it fires before JS listens, so the
 * waiting share is checked on startup and on every return to the foreground instead.
 */
function useOpenWaitingShare() {
  const pathname = usePathname();
  useForegroundCheck(
    () => {
      // The incoming screen reads a new share itself.
      if (pathname !== '/incoming' && hasSharedFiles()) router.navigate('/incoming');
    },
    { onMount: true },
  );
}

/**
 * Starts the system log once the saved language and theme are known: file header, `app.start`,
 * crash handlers, and a flush whenever the app leaves the foreground.
 */
function useAppLogging() {
  const { language } = useLocale();
  const { preference: theme, loaded } = useTheme();
  const ready = useRef<Promise<void>>(Promise.resolve());
  const started = useRef(false);
  useEffect(() => {
    ready.current = log.init({
      app: Constants.expoConfig?.version ?? 'unknown',
      os: `${Platform.OS} ${Platform.Version}`,
    });
    const uninstall = installGlobalHandlers(log);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') void log.flush();
    });
    return () => {
      uninstall();
      sub.remove();
    };
  }, []);
  // Theme loads independently of the language, so wait for its saved value; log exactly once.
  useEffect(() => {
    if (!loaded || started.current) return;
    started.current = true;
    void ready.current.then(() => log.info('app.start', { language, theme }));
  }, [loaded, language, theme]);
}

/** Header button that opens the settings screen. */
function SettingsButton() {
  const { colors } = useTheme();
  const { t } = useLocale();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t.settings.title}
      hitSlop={8}
      onPress={() => router.push('/settings')}
    >
      <Text style={[styles.icon, { color: colors.primary }]}>⚙︎</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  icon: { fontSize: 22, paddingHorizontal: 4 },
});

/** Navigation headers and the status bar follow the app theme. */
function ThemedStack() {
  // Only here: the navigator is mounted in this commit, so router.navigate is safe.
  useAppLogging();
  useOpenWaitingShare();
  const { colors, scheme } = useTheme();
  const { t } = useLocale();
  const navTheme = useMemo(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.primary,
        background: colors.background,
        card: colors.surface,
        text: colors.text,
        border: colors.border,
      },
    };
  }, [colors, scheme]);
  return (
    <NavigationThemeProvider value={navTheme}>
      <StatusBar style="auto" />
      <Stack>
        <Stack.Screen
          name="index"
          options={{ title: t.titles.library, headerRight: () => <SettingsButton /> }}
        />
        <Stack.Screen name="scan" options={{ title: t.titles.scan }} />
        <Stack.Screen name="merge" options={{ title: t.titles.merge }} />
        <Stack.Screen name="viewer/[id]" options={{ title: t.titles.viewer }} />
        <Stack.Screen name="incoming" options={{ title: t.titles.incoming }} />
        <Stack.Screen name="settings" options={{ title: t.settings.title }} />
      </Stack>
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <LocaleProvider>
          <LibraryProvider>
            <UpdateProvider>
              <UpdateGate>
                <ThemedStack />
              </UpdateGate>
            </UpdateProvider>
          </LibraryProvider>
        </LocaleProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
