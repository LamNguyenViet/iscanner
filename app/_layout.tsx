import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { LibraryProvider } from '../src/library/LibraryContext';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <LibraryProvider>
        <Stack>
          <Stack.Screen name="index" options={{ title: 'iScanner' }} />
          <Stack.Screen name="scan" options={{ title: 'Scan tài liệu' }} />
          <Stack.Screen name="merge" options={{ title: 'Gộp PDF' }} />
          <Stack.Screen name="viewer/[id]" />
        </Stack>
      </LibraryProvider>
    </GestureHandlerRootView>
  );
}
