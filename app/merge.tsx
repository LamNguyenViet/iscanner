import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';
import { router } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NameInput } from '../src/components/NameInput';
import { useErrorAlert } from '../src/errors/useErrorAlert';
import { useLocale } from '../src/i18n/LocaleContext';
import { useLibrary } from '../src/library/LibraryContext';
import { pickPdfs } from '../src/native/pickPdfs';
import { deleteFiles } from '../src/native/deleteFiles';
import { readBytes } from '../src/native/readBytes';
import { clearPending, hasPendingImages, takePdfs } from '../src/share/incomingStore';
import { defaultName, sanitizeName } from '../src/utils/format';
import {
  createMergedDocument,
  loadPickedPdfs,
  type LoadedPdf,
} from '../src/workflows/mergeWorkflow';
import type { Palette } from '../src/theme/palette';
import { useTheme } from '../src/theme/ThemeContext';
import { useBusy } from '../src/workflows/useBusy';
import { useOrderedList, type Keyed } from '../src/workflows/useOrderedList';

export default function Merge() {
  const { t } = useLocale();
  const showError = useErrorAlert();
  const { store, refresh } = useLibrary();
  const { items, append, remove, setOrder } = useOrderedList<LoadedPdf>();
  const busy = useBusy();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const themed = useMemo(() => makeStyles(colors), [colors]);
  const headerHeight = useHeaderHeight();
  const [name, setName] = useState(() => defaultName('merge', new Date(), t));
  const started = useRef(false);
  const count = useRef(0);
  count.current = items.length;
  // Picked PDFs are copies in the app cache: delete them once used or abandoned.
  const fileUris = useRef<string[]>([]);
  fileUris.current = items.map((i) => i.value.uri);
  const merged = useRef(false);
  // Set when the screen hands its pending images over to /scan itself.
  const handedOff = useRef(false);

  useEffect(
    () => () => {
      if (!merged.current) {
        deleteFiles(fileUris.current);
        // Received images nobody consumed would otherwise leak and misroute a later merge.
        if (!handedOff.current) deleteFiles(clearPending().map((f) => f.uri));
      }
    },
    [],
  );

  const backIfEmpty = () => {
    if (count.current !== 0) return;
    if (hasPendingImages()) {
      handedOff.current = true;
      router.replace('/scan');
    } else {
      router.back();
    }
  };

  const loadFrom = async (getPicked: () => Promise<{ uri: string; name: string }[]>) => {
    try {
      const result = await busy.run(async () => {
        const picked = await getPicked();
        if (picked.length === 0) return null;
        const loaded = await loadPickedPdfs({ readBytes }, picked);
        const loadedUris = new Set(loaded.loaded.map((f) => f.uri));
        const unusable = picked.filter((f) => !loadedUris.has(f.uri)).map((f) => f.uri);
        if (unusable.length > 0) deleteFiles(unusable);
        return loaded;
      });
      if (result === undefined) return;
      if (result === null) {
        backIfEmpty();
        return;
      }
      if (result.loaded.length > 0) append(result.loaded);
      if (result.failed.length > 0) {
        showError(result.failed, { list: true });
      }
      if (result.loaded.length === 0) backIfEmpty();
    } catch (e) {
      showError(e);
      backIfEmpty();
    }
  };

  const pick = () => loadFrom(pickPdfs);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const pending = takePdfs();
    if (pending.length > 0) {
      loadFrom(async () => pending.map((f) => ({ uri: f.uri, name: f.name })));
    } else {
      pick();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const merge = async () => {
    let meta;
    try {
      meta = await busy.run(() =>
        createMergedDocument(
          { readBytes, library: store },
          items.map((i) => i.value),
          sanitizeName(name, defaultName('merge', new Date(), t)),
        ),
      );
    } catch (e) {
      showError(e);
      return;
    }
    if (!meta) return;
    merged.current = true;
    deleteFiles(items.map((i) => i.value.uri));
    // The document already exists; a failed refresh must not look like a failed merge.
    await refresh().catch(() => {});
    // Images received together with the PDFs continue into the scan screen.
    if (hasPendingImages()) router.replace('/scan');
    else router.replace(`/viewer/${meta.id}`);
  };

  const removeFile = (item: Keyed<LoadedPdf>) => {
    remove(item.key);
    // The same copy may be listed twice; keep it while another entry still uses it.
    const stillUsed = items.some((i) => i.key !== item.key && i.value.uri === item.value.uri);
    if (!stillUsed) deleteFiles([item.value.uri]);
  };

  const renderItem = ({ item, drag, isActive }: RenderItemParams<Keyed<LoadedPdf>>) => (
    <Pressable
      style={[styles.row, themed.row, isActive && themed.rowActive]}
      onLongPress={drag}
      disabled={isActive}
    >
      <Text style={[styles.fileName, themed.fileName]} numberOfLines={1}>
        {item.value.name || t.common.untitled}
      </Text>
      <Text style={[styles.pages, themed.pages]}>{t.format.pages(item.value.pageCount)}</Text>
      <Pressable onPress={() => removeFile(item)}>
        <Text style={[styles.delete, themed.delete]}>{t.merge.delete}</Text>
      </Pressable>
    </Pressable>
  );

  const mergeDisabled = items.length < 2 || busy.busy;

  return (
    <KeyboardAvoidingView
      style={[styles.container, themed.container]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={headerHeight}
    >
      <View style={styles.header}>
        <NameInput value={name} onChangeText={setName} />
        {items.length < 2 && <Text style={[styles.hint, themed.hint]}>{t.merge.hint}</Text>}
      </View>
      <DraggableFlatList
        data={items}
        keyExtractor={(i) => i.key}
        onDragEnd={({ data }) => setOrder(data)}
        renderItem={renderItem}
        containerStyle={styles.list}
      />
      {busy.busy && <ActivityIndicator style={styles.spinner} color={colors.primary} />}
      <View testID="actions" style={[styles.actions, { paddingBottom: 16 + insets.bottom }]}>
        <Pressable
          role="button"
          style={[styles.button, themed.button, busy.busy && styles.disabled]}
          disabled={busy.busy}
          onPress={pick}
        >
          <Text style={[styles.buttonText, themed.buttonText]}>{t.merge.addFiles}</Text>
        </Pressable>
        <Pressable
          role="button"
          style={[styles.button, themed.button, mergeDisabled && styles.disabled]}
          disabled={mergeDisabled}
          onPress={merge}
        >
          <Text style={[styles.buttonText, themed.buttonText]}>{t.merge.create}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 16, gap: 8 },
  hint: { fontSize: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  fileName: { flex: 1, fontSize: 16 },
  pages: { fontSize: 14 },
  delete: { fontSize: 15, fontWeight: '600', padding: 8 },
  list: { flex: 1 },
  spinner: { margin: 8 },
  actions: { flexDirection: 'row', gap: 12, padding: 16 },
  button: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  disabled: { opacity: 0.5 },
  buttonText: { fontSize: 16, fontWeight: '600' },
});

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    container: { backgroundColor: c.background },
    hint: { color: c.textMuted },
    row: { backgroundColor: c.surface },
    rowActive: { backgroundColor: c.surfaceActive },
    fileName: { color: c.text },
    pages: { color: c.textMuted },
    delete: { color: c.danger },
    button: { backgroundColor: c.primary },
    buttonText: { color: c.onPrimary },
  });
