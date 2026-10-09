import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  BackHandler,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useErrorAlert } from '../src/errors/useErrorAlert';
import { DocumentActions } from '../src/components/DocumentActions';
import { DocumentRow } from '../src/components/DocumentRow';
import { NameInput } from '../src/components/NameInput';
import { SettingsButton } from '../src/components/SettingsButton';
import { useLocale } from '../src/i18n/LocaleContext';
import { useLibrary } from '../src/library/LibraryContext';
import type { DocumentMeta } from '../src/library/types';
import { log } from '../src/logging/logger';
import { shareDocument } from '../src/native/share';
import type { Palette } from '../src/theme/palette';
import { useTheme } from '../src/theme/ThemeContext';
import { sanitizeName } from '../src/utils/format';

export default function Home() {
  const { documents, store, refresh, rename, remove, removeMany } = useLibrary();
  // null = normal mode; a Set = selection mode (possibly empty).
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [renaming, setRenaming] = useState<DocumentMeta | null>(null);
  const [draft, setDraft] = useState('');
  const [menuDoc, setMenuDoc] = useState<DocumentMeta | null>(null);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t } = useLocale();
  const showError = useErrorAlert();
  const themed = useMemo(() => makeStyles(colors), [colors]);

  useFocusEffect(
    useCallback(() => {
      refresh().catch(() => {});
    }, [refresh]),
  );

  const confirmRemove = (doc: DocumentMeta) =>
    Alert.alert(t.library.deleteConfirm, undefined, [
      {
        text: t.documentMenu.delete,
        style: 'destructive',
        onPress: () =>
          remove(doc.id)
            .then(() => log.info('document.deleted', { count: 1 }))
            .catch(showError),
      },
      { text: t.common.cancel, style: 'cancel' },
    ]);

  const startRename = (doc: DocumentMeta) => {
    setDraft(doc.name);
    setRenaming(doc);
  };

  const share = (doc: DocumentMeta) =>
    shareDocument(store.fileUri(doc), doc.name)
      .then(() => log.info('document.shared'))
      .catch(showError);

  // Android's Alert keeps only 3 buttons (dropping Cancel), so Android gets a custom menu.
  const openMenu = (doc: DocumentMeta) => {
    if (Platform.OS !== 'ios') {
      setMenuDoc(doc);
      return;
    }
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: doc.name,
        options: [t.documentMenu.rename, t.documentMenu.share, t.documentMenu.delete, t.common.cancel],
        destructiveButtonIndex: 2,
        cancelButtonIndex: 3,
      },
      (index) => {
        if (index === 0) startRename(doc);
        else if (index === 1) share(doc);
        else if (index === 2) confirmRemove(doc);
      },
    );
  };

  const fromMenu = (action: (doc: DocumentMeta) => void) => () => {
    const doc = menuDoc;
    setMenuDoc(null);
    if (doc) action(doc);
  };

  const selecting = selected !== null;
  // Only ids still in the list count: a refresh can drop a selected document.
  const selectedIds = selected ? documents.filter((d) => selected.has(d.id)).map((d) => d.id) : [];
  const selectedCount = selectedIds.length;
  const allSelected = selecting && documents.length > 0 && selectedCount === documents.length;

  const exitSelection = useCallback(() => setSelected(null), []);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Android back leaves selection mode instead of the screen.
  useEffect(() => {
    if (!selecting) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      exitSelection();
      return true;
    });
    return () => sub.remove();
  }, [selecting, exitSelection]);

  const confirmRemoveSelected = () => {
    const ids = selectedIds;
    if (ids.length === 0) return;
    const title = ids.length === 1 ? t.library.deleteConfirm : t.library.deleteManyConfirm(ids.length);
    Alert.alert(title, undefined, [
      {
        text: t.documentMenu.delete,
        style: 'destructive',
        onPress: () =>
          removeMany(ids)
            .then(() => {
              log.info('document.deleted', { count: ids.length });
              exitSelection();
            })
            .catch(showError),
      },
      { text: t.common.cancel, style: 'cancel' },
    ]);
  };

  const headerOptions = !selecting
    ? { title: t.titles.library, headerLeft: undefined, headerRight: () => <SettingsButton /> }
    : {
        title: t.library.selectedCount(selectedCount),
        headerLeft: () => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.library.exitSelection}
            hitSlop={8}
            onPress={exitSelection}
          >
            <Text style={[styles.headerButton, themed.headerButton]}>✕</Text>
          </Pressable>
        ),
        headerRight: () => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={allSelected ? t.library.deselectAll : t.library.selectAll}
            hitSlop={8}
            onPress={() => setSelected(allSelected ? new Set() : new Set(documents.map((d) => d.id)))}
          >
            <Text style={[styles.headerText, themed.headerButton]}>
              {allSelected ? t.library.deselectAll : t.library.selectAll}
            </Text>
          </Pressable>
        ),
      };

  const saveRename = () => {
    const doc = renaming;
    if (!doc) return;
    setRenaming(null);
    rename(doc.id, sanitizeName(draft, doc.name))
      .then(() => log.info('document.renamed'))
      .catch(showError);
  };

  return (
    <View style={[styles.container, themed.container]}>
      {/* Always rendered: options a screen sets persist after it unmounts, so leaving selection
          mode must put the normal header back. */}
      <Stack.Screen options={headerOptions} />
      <FlatList
        data={documents}
        keyExtractor={(d) => d.id}
        renderItem={({ item }) => (
          <DocumentRow
            doc={item}
            selecting={selecting}
            selected={selected?.has(item.id) ?? false}
            onPress={() => (selecting ? toggle(item.id) : router.push(`/viewer/${item.id}`))}
            onLongPress={() => (selecting ? toggle(item.id) : setSelected(new Set([item.id])))}
            onMore={() => openMenu(item)}
          />
        )}
        contentContainerStyle={documents.length === 0 ? styles.emptyContainer : undefined}
        ListEmptyComponent={
          <Text style={[styles.empty, themed.empty]}>{t.library.empty}</Text>
        }
      />
      <View testID="actions" style={[styles.actions, { paddingBottom: 16 + insets.bottom }]}>
        {selecting ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.library.deleteCount(selectedCount)}
            disabled={selectedCount === 0}
            style={[styles.button, themed.danger, selectedCount === 0 && styles.disabled]}
            onPress={confirmRemoveSelected}
          >
            <Text style={[styles.buttonText, themed.buttonText]}>
              {t.library.deleteCount(selectedCount)}
            </Text>
          </Pressable>
        ) : (
          <>
            <Pressable style={[styles.button, themed.button]} onPress={() => router.push('/scan')}>
              <Text style={[styles.buttonText, themed.buttonText]}>{t.library.scan}</Text>
            </Pressable>
            <Pressable style={[styles.button, themed.button]} onPress={() => router.push('/merge')}>
              <Text style={[styles.buttonText, themed.buttonText]}>{t.library.merge}</Text>
            </Pressable>
          </>
        )}
      </View>
      <DocumentActions
        visible={menuDoc !== null}
        title={menuDoc?.name ?? ''}
        onRename={fromMenu(startRename)}
        onShare={fromMenu(share)}
        onDelete={fromMenu(confirmRemove)}
        onClose={() => setMenuDoc(null)}
      />
      <Modal
        visible={renaming !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRenaming(null)}
      >
        <View style={[styles.backdrop, themed.backdrop]}>
          <View style={[styles.dialog, themed.dialog]}>
            <NameInput value={draft} onChangeText={setDraft} autoFocus />
            <View style={styles.dialogActions}>
              <Pressable onPress={() => setRenaming(null)}>
                <Text style={[styles.dialogButton, themed.dialogButton]}>{t.common.cancel}</Text>
              </Pressable>
              <Pressable onPress={saveRename}>
                <Text style={[styles.dialogButton, themed.dialogButton]}>{t.library.save}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  emptyContainer: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  empty: { textAlign: 'center', fontSize: 15 },
  actions: { flexDirection: 'row', gap: 12, padding: 16 },
  button: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: { fontSize: 16, fontWeight: '600' },
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  dialog: { borderRadius: 12, padding: 16 },
  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 24, marginTop: 16 },
  dialogButton: { fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  headerButton: { fontSize: 20, paddingHorizontal: 4 },
  headerText: { fontSize: 16, fontWeight: '600' },
});

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    container: { backgroundColor: c.background },
    empty: { color: c.textMuted },
    button: { backgroundColor: c.primary },
    buttonText: { color: c.onPrimary },
    backdrop: { backgroundColor: c.backdrop },
    dialog: { backgroundColor: c.surface },
    dialogButton: { color: c.primary },
    danger: { backgroundColor: c.danger },
    headerButton: { color: c.primary },
  });
