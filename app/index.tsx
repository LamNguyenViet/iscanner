import { useCallback, useState } from 'react';
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
import { useLibrary } from '../src/library/LibraryContext';
import type { DocumentMeta } from '../src/library/types';
import { shareDocument } from '../src/native/share';
import { sanitizeName } from '../src/utils/format';

const showError = () => Alert.alert('Có lỗi xảy ra');

export default function Home() {
  const { documents, store, refresh, rename, remove } = useLibrary();
  const [renaming, setRenaming] = useState<DocumentMeta | null>(null);
  const [draft, setDraft] = useState('');
  const [menuDoc, setMenuDoc] = useState<DocumentMeta | null>(null);
  const insets = useSafeAreaInsets();

  useFocusEffect(
    useCallback(() => {
      refresh().catch(() => {});
    }, [refresh]),
  );

  const confirmRemove = (doc: DocumentMeta) =>
    Alert.alert('Xoá tài liệu này?', undefined, [
      {
        text: 'Xoá',
        style: 'destructive',
        onPress: () => remove(doc.id).catch(showError),
      },
      { text: 'Huỷ', style: 'cancel' },
    ]);

  const startRename = (doc: DocumentMeta) => {
    setDraft(doc.name);
    setRenaming(doc);
  };

  const share = (doc: DocumentMeta) => shareDocument(store.fileUri(doc)).catch(showError);

  // Android's Alert keeps only 3 buttons (dropping "Huỷ"), so Android gets a custom menu.
  const openMenu = (doc: DocumentMeta) => {
    if (Platform.OS !== 'ios') {
      setMenuDoc(doc);
      return;
    }
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: doc.name,
        options: ['Đổi tên', 'Chia sẻ', 'Xoá', 'Huỷ'],
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
    <View style={styles.container}>
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
          <Text style={styles.empty}>Chưa có tài liệu nào. Hãy scan hoặc gộp PDF để bắt đầu.</Text>
        }
      />
      <View testID="actions" style={[styles.actions, { paddingBottom: 16 + insets.bottom }]}>
        <Pressable style={styles.button} onPress={() => router.push('/scan')}>
          <Text style={styles.buttonText}>Scan tài liệu</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={() => router.push('/merge')}>
          <Text style={styles.buttonText}>Gộp PDF</Text>
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
        <View style={styles.backdrop}>
          <View style={styles.dialog}>
            <NameInput value={draft} onChangeText={setDraft} autoFocus />
            <View style={styles.dialogActions}>
              <Pressable onPress={() => setRenaming(null)}>
                <Text style={styles.dialogButton}>Huỷ</Text>
              </Pressable>
              <Pressable onPress={saveRename}>
                <Text style={styles.dialogButton}>Lưu</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  emptyContainer: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  empty: { textAlign: 'center', color: '#666', fontSize: 15 },
  actions: { flexDirection: 'row', gap: 12, padding: 16 },
  button: {
    flex: 1,
    backgroundColor: '#1f6feb',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: { backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 24, marginTop: 16 },
  dialogButton: { fontSize: 16, fontWeight: '600', color: '#1f6feb' },
});
