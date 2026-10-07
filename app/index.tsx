import { useCallback, useMemo, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DocumentActions } from '../src/components/DocumentActions';
import { DocumentRow } from '../src/components/DocumentRow';
import { NameInput } from '../src/components/NameInput';
import { useLocale } from '../src/i18n/LocaleContext';
import { useLibrary } from '../src/library/LibraryContext';
import type { DocumentMeta } from '../src/library/types';
import { shareDocument } from '../src/native/share';
import type { Palette } from '../src/theme/palette';
import { useTheme } from '../src/theme/ThemeContext';
import { sanitizeName } from '../src/utils/format';

export default function Home() {
  const { documents, store, refresh, rename, remove } = useLibrary();
  const [renaming, setRenaming] = useState<DocumentMeta | null>(null);
  const [draft, setDraft] = useState('');
  const [menuDoc, setMenuDoc] = useState<DocumentMeta | null>(null);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t } = useLocale();
  const showError = () => Alert.alert(t.errors.generic);
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
        onPress: () => remove(doc.id).catch(showError),
      },
      { text: t.documentMenu.cancel, style: 'cancel' },
    ]);

  const startRename = (doc: DocumentMeta) => {
    setDraft(doc.name);
    setRenaming(doc);
  };

  const share = (doc: DocumentMeta) => shareDocument(store.fileUri(doc), doc.name).catch(showError);

  // Android's Alert keeps only 3 buttons (dropping Cancel), so Android gets a custom menu.
  const openMenu = (doc: DocumentMeta) => {
    if (Platform.OS !== 'ios') {
      setMenuDoc(doc);
      return;
    }
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: doc.name,
        options: [t.documentMenu.rename, t.documentMenu.share, t.documentMenu.delete, t.documentMenu.cancel],
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

  const saveRename = () => {
    const doc = renaming;
    if (!doc) return;
    setRenaming(null);
    rename(doc.id, sanitizeName(draft, doc.name)).catch(showError);
  };

  return (
    <View style={[styles.container, themed.container]}>
      <FlatList
        data={documents}
        keyExtractor={(d) => d.id}
        renderItem={({ item }) => (
          <DocumentRow
            doc={item}
            onPress={() => router.push(`/viewer/${item.id}`)}
            onLongPress={() => openMenu(item)}
          />
        )}
        contentContainerStyle={documents.length === 0 ? styles.emptyContainer : undefined}
        ListEmptyComponent={
          <Text style={[styles.empty, themed.empty]}>{t.library.empty}</Text>
        }
      />
      <View testID="actions" style={[styles.actions, { paddingBottom: 16 + insets.bottom }]}>
        <Pressable style={[styles.button, themed.button]} onPress={() => router.push('/scan')}>
          <Text style={[styles.buttonText, themed.buttonText]}>{t.library.scan}</Text>
        </Pressable>
        <Pressable style={[styles.button, themed.button]} onPress={() => router.push('/merge')}>
          <Text style={[styles.buttonText, themed.buttonText]}>{t.library.merge}</Text>
        </Pressable>
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
                <Text style={[styles.dialogButton, themed.dialogButton]}>{t.documentMenu.cancel}</Text>
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
  });
