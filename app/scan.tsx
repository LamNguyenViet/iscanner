import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
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
import { useLibrary } from '../src/library/LibraryContext';
import { deleteFiles } from '../src/native/deleteFiles';
import { readBytes } from '../src/native/readBytes';
import { DEFAULT_LAYOUT } from '../src/pdf/layout';
import { scanDocuments } from '../src/scanner/scanner';
import { defaultName, sanitizeName } from '../src/utils/format';
import { useBusy } from '../src/workflows/useBusy';
import { createScanDocument } from '../src/workflows/scanWorkflow';
import { useOrderedList, type Keyed } from '../src/workflows/useOrderedList';

export default function Scan() {
  const { store, refresh } = useLibrary();
  const { items, append, remove, setOrder } = useOrderedList<string>();
  const busy = useBusy();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const [name, setName] = useState(() => defaultName('scan', new Date()));
  const started = useRef(false);
  const count = useRef(0);
  count.current = items.length;
  // Scanned images are temporary files: delete them once used or abandoned.
  const pageUris = useRef<string[]>([]);
  pageUris.current = items.map((i) => i.value);
  const created = useRef(false);

  useEffect(
    () => () => {
      if (!created.current) deleteFiles(pageUris.current);
    },
    [],
  );

  const backIfEmpty = () => {
    if (count.current === 0) router.back();
  };

  const openSettings = () => {
    Linking.openSettings().catch(() => {});
    backIfEmpty();
  };

  const showPermissionAlert = () =>
    Alert.alert('Cần quyền camera', undefined, [
      { text: 'Mở Cài đặt', onPress: openSettings },
      { text: 'Huỷ', style: 'cancel', onPress: backIfEmpty },
    ]);

  // The scanner's permission error text may be localized, so the generic error
  // also points to Settings.
  const showScanErrorAlert = () =>
    Alert.alert(
      'Không thể scan tài liệu',
      'Nếu bạn đã từ chối quyền camera, hãy cấp quyền trong Cài đặt.',
      [
        { text: 'Mở Cài đặt', onPress: openSettings },
        { text: 'Đóng', style: 'cancel', onPress: backIfEmpty },
      ],
    );

  const scan = async () => {
    try {
      const uris = await busy.run(() => scanDocuments());
      if (uris === undefined) return;
      if (uris.length === 0) {
        backIfEmpty();
        return;
      }
      append(uris);
    } catch (e) {
      if (e instanceof Error && e.message === 'CAMERA_PERMISSION') {
        showPermissionAlert();
      } else {
        showScanErrorAlert();
      }
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async () => {
    let meta;
    try {
      meta = await busy.run(() =>
        createScanDocument(
          { readBytes, library: store },
          items.map((i) => ({ uri: i.value, align: 'center' as const })),
          sanitizeName(name, defaultName('scan', new Date())),
          DEFAULT_LAYOUT,
        ),
      );
    } catch {
      Alert.alert('Không thể tạo PDF');
      return;
    }
    if (!meta) return;
    created.current = true;
    deleteFiles(items.map((i) => i.value));
    // The document already exists; a failed refresh must not look like a failed create.
    await refresh().catch(() => {});
    router.replace(`/viewer/${meta.id}`);
  };

  const removePage = (item: Keyed<string>) => {
    remove(item.key);
    deleteFiles([item.value]);
  };

  const renderItem = ({ item, drag, isActive }: RenderItemParams<Keyed<string>>) => (
    <Pressable
      style={[styles.row, isActive && styles.rowActive]}
      onLongPress={drag}
      disabled={isActive}
    >
      <Text style={styles.pageLabel}>Trang {items.findIndex((i) => i.key === item.key) + 1}</Text>
      <Image
        source={{ uri: item.value }}
        style={styles.thumb}
        resizeMethod="resize"
        testID="thumb"
      />
      <Pressable onPress={() => removePage(item)}>
        <Text style={styles.delete}>Xoá</Text>
      </Pressable>
    </Pressable>
  );

  const createDisabled = items.length === 0 || busy.busy;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={headerHeight}
    >
      <View style={styles.header}>
        <NameInput value={name} onChangeText={setName} />
      </View>
      <DraggableFlatList
        data={items}
        keyExtractor={(i) => i.key}
        onDragEnd={({ data }) => setOrder(data)}
        renderItem={renderItem}
        containerStyle={styles.list}
      />
      {busy.busy && <ActivityIndicator style={styles.spinner} />}
      <View testID="actions" style={[styles.actions, { paddingBottom: 16 + insets.bottom }]}>
        <Pressable
          style={[styles.button, busy.busy && styles.disabled]}
          disabled={busy.busy}
          onPress={scan}
        >
          <Text style={styles.buttonText}>+ Chụp thêm</Text>
        </Pressable>
        <Pressable
          style={[styles.button, createDisabled && styles.disabled]}
          disabled={createDisabled}
          onPress={create}
        >
          <Text style={styles.buttonText}>Tạo PDF</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { padding: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  rowActive: { backgroundColor: '#eef4ff' },
  pageLabel: { flex: 1, fontSize: 16 },
  thumb: { width: 64, height: 88, backgroundColor: '#eee' },
  delete: { color: '#d1242f', fontSize: 15, fontWeight: '600', padding: 8 },
  list: { flex: 1 },
  spinner: { margin: 8 },
  actions: { flexDirection: 'row', gap: 12, padding: 16 },
  button: {
    flex: 1,
    backgroundColor: '#1f6feb',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  disabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
