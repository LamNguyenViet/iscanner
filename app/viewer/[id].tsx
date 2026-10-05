import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import Pdf from 'react-native-pdf';
import { useLibrary } from '../../src/library/LibraryContext';
import { shareDocument } from '../../src/native/share';

export default function Viewer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { documents, loading, store, refresh } = useLibrary();
  const [pdfError, setPdfError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const refreshed = useRef(false);
  const doc = documents.find((d) => d.id === id);

  // The document may have been added after the library loaded: refresh once before giving up.
  useEffect(() => {
    if (loading || doc || refreshed.current) return;
    refreshed.current = true;
    setRefreshing(true);
    refresh()
      .catch(() => {})
      .finally(() => setRefreshing(false));
  }, [loading, doc, refresh]);

  if (loading || (!doc && (refreshing || !refreshed.current))) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!doc) {
    return (
      <View style={styles.center}>
        <Text style={styles.text}>Không tìm thấy tài liệu</Text>
        <Pressable style={styles.button} onPress={() => router.back()}>
          <Text style={styles.buttonText}>Quay lại</Text>
        </Pressable>
      </View>
    );
  }

  const uri = store.fileUri(doc);
  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: doc.name,
          headerRight: () => (
            <Pressable onPress={() => shareDocument(uri, doc.name).catch(() => Alert.alert('Có lỗi xảy ra'))}>
              <Text style={styles.share}>Chia sẻ</Text>
            </Pressable>
          ),
        }}
      />
      {pdfError ? (
        <View style={styles.center}>
          <Text style={styles.text}>Không mở được tài liệu</Text>
        </View>
      ) : (
        <Pdf source={{ uri }} style={styles.pdf} onError={() => setPdfError(true)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  pdf: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  text: { fontSize: 16, color: '#666', marginBottom: 16 },
  button: { backgroundColor: '#1f6feb', borderRadius: 8, paddingVertical: 12, paddingHorizontal: 24 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  share: { fontSize: 16, fontWeight: '600', color: '#1f6feb' },
});
