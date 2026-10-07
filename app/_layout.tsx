import { router, Stack, usePathname } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { LibraryProvider } from '../src/library/LibraryContext';
import { hasSharedFiles } from '../src/native/sharedPayloads';
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

export default function RootLayout() {
  useOpenWaitingShare();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <LibraryProvider>
        <Stack>
          <Stack.Screen name="index" options={{ title: 'iScanner' }} />
          <Stack.Screen name="scan" options={{ title: 'Scan tài liệu' }} />
          <Stack.Screen name="merge" options={{ title: 'Gộp PDF' }} />
          <Stack.Screen name="viewer/[id]" options={{ title: 'Tài liệu' }} />
          <Stack.Screen name="incoming" options={{ title: 'Nhận file' }} />
        </Stack>
      </LibraryProvider>
    </GestureHandlerRootView>
  );
}
