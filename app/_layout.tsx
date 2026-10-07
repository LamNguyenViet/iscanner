import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as NavigationThemeProvider,
  router,
  Stack,
  usePathname,
} from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { LocaleProvider, useLocale } from '../src/i18n/LocaleContext';
import { LibraryProvider } from '../src/library/LibraryContext';
import { hasSharedFiles } from '../src/native/sharedPayloads';
import { ThemeProvider, useTheme } from '../src/theme/ThemeContext';
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
  useOpenWaitingShare();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <LocaleProvider>
          <LibraryProvider>
            <ThemedStack />
          </LibraryProvider>
        </LocaleProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
