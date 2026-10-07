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
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ThemeMenuButton } from '../src/components/ThemeMenuButton';
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

/** Navigation headers and the status bar follow the app theme. */
function ThemedStack() {
  const { colors, scheme } = useTheme();
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
          options={{ title: 'iScanner', headerRight: () => <ThemeMenuButton /> }}
        />
        <Stack.Screen name="scan" options={{ title: 'Scan tài liệu' }} />
        <Stack.Screen name="merge" options={{ title: 'Gộp PDF' }} />
        <Stack.Screen name="viewer/[id]" options={{ title: 'Tài liệu' }} />
        <Stack.Screen name="incoming" options={{ title: 'Nhận file' }} />
      </Stack>
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  useOpenWaitingShare();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <LibraryProvider>
          <ThemedStack />
        </LibraryProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
