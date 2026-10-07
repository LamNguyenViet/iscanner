import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import Pdf from 'react-native-pdf';
import { useLocale } from '../../src/i18n/LocaleContext';
import { useLibrary } from '../../src/library/LibraryContext';
import { shareDocument } from '../../src/native/share';
import type { Palette } from '../../src/theme/palette';
import { useTheme } from '../../src/theme/ThemeContext';

// react-native-pdf 7.0.5 reloads the document on every render and leaks the cancelled
// native load (~3 MB each, upstream issue #1046): render it only when its props change.
const PdfView = memo(Pdf);

export default function Viewer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { documents, loading, store, refresh } = useLibrary();
  const [pdfError, setPdfError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const refreshed = useRef(false);
  const doc = documents.find((d) => d.id === id);
  const { colors } = useTheme();
  const { t } = useLocale();
  const themed = useMemo(() => makeStyles(colors), [colors]);
  const uri = doc ? store.fileUri(doc) : undefined;
  const pdfSource = useMemo(() => ({ uri }), [uri]);
  const pdfStyle = useMemo(() => [styles.pdf, themed.screen], [themed]);
  const onPdfError = useCallback(() => setPdfError(true), []);

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
      <View style={[styles.center, themed.screen]}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!doc) {
    return (
      <View style={[styles.center, themed.screen]}>
        <Text style={[styles.text, themed.text]}>{t.viewer.notFound}</Text>
        <Pressable style={[styles.button, themed.button]} onPress={() => router.back()}>
          <Text style={[styles.buttonText, themed.buttonText]}>{t.viewer.back}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, themed.screen]}>
      <Stack.Screen
        options={{
          title: doc.name,
          headerRight: () => (
            <Pressable onPress={() => shareDocument(store.fileUri(doc), doc.name).catch(() => Alert.alert(t.errors.generic))}>
              <Text style={[styles.share, themed.share]}>{t.viewer.share}</Text>
            </Pressable>
          ),
        }}
      />
      {pdfError ? (
        <View style={[styles.center, themed.screen]}>
          <Text style={[styles.text, themed.text]}>{t.viewer.openError}</Text>
        </View>
      ) : (
        <PdfView source={pdfSource} style={pdfStyle} onError={onPdfError} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pdf: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  text: { fontSize: 16, marginBottom: 16 },
  button: { borderRadius: 8, paddingVertical: 12, paddingHorizontal: 24 },
  buttonText: { fontSize: 16, fontWeight: '600' },
  share: { fontSize: 16, fontWeight: '600' },
});

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { backgroundColor: c.background },
    text: { color: c.textMuted },
    button: { backgroundColor: c.primary },
    buttonText: { color: c.onPrimary },
    share: { color: c.primary },
  });
