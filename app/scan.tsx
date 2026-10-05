import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';
import { router } from 'expo-router';
import { NameInput } from '../src/components/NameInput';
import { useLibrary } from '../src/library/LibraryContext';
import { readBytes } from '../src/native/readBytes';
import { scanDocuments } from '../src/scanner/scanner';
import { defaultName, sanitizeName } from '../src/utils/format';
import { useBusy } from '../src/workflows/useBusy';
import { createScanDocument } from '../src/workflows/scanWorkflow';
import { useOrderedList, type Keyed } from '../src/workflows/useOrderedList';

export default function Scan() {
  const { store, refresh } = useLibrary();
  const { items, append, remove, setOrder } = useOrderedList<string>();
  const busy = useBusy();
  const [name, setName] = useState(() => defaultName('scan', new Date()));
  const started = useRef(false);
  const count = useRef(0);
  count.current = items.length;

  const backIfEmpty = () => {
    if (count.current === 0) router.back();
  };

  const showPermissionAlert = () =>
    Alert.alert('Cần quyền camera', undefined, [
      {
        text: 'Mở Cài đặt',
        onPress: () => {
          Linking.openSettings().catch(() => {});
          backIfEmpty();
        },
      },
      { text: 'Huỷ', style: 'cancel', onPress: backIfEmpty },
    ]);

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
        Alert.alert('Không thể scan tài liệu');
        backIfEmpty();
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
    try {
      const meta = await busy.run(() =>
        createScanDocument(
          { readBytes, library: store },
          items.map((i) => i.value),
          sanitizeName(name, defaultName('scan', new Date())),
        ),
      );
      if (!meta) return;
      await refresh();
      router.replace(`/viewer/${meta.id}`);
    } catch {
      Alert.alert('Không thể tạo PDF');
    }
  };

  const renderItem = ({ item, drag, isActive }: RenderItemParams<Keyed<string>>) => (
    <Pressable
      style={[styles.row, isActive && styles.rowActive]}
      onLongPress={drag}
      disabled={isActive}
    >
      <Text style={styles.pageLabel}>Trang {items.findIndex((i) => i.key === item.key) + 1}</Text>
      <Image source={{ uri: item.value }} style={styles.thumb} />
      <Pressable onPress={() => remove(item.key)}>
        <Text style={styles.delete}>Xoá</Text>
      </Pressable>
    </Pressable>
  );

  const createDisabled = items.length === 0 || busy.busy;

  return (
    <View style={styles.container}>
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
      <View style={styles.actions}>
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
    </View>
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
