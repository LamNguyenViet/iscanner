import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';
import { router } from 'expo-router';
import { NameInput } from '../src/components/NameInput';
import { useLibrary } from '../src/library/LibraryContext';
import { pickPdfs } from '../src/native/pickPdfs';
import { readBytes } from '../src/native/readBytes';
import { defaultName, sanitizeName } from '../src/utils/format';
import {
  createMergedDocument,
  loadPickedPdfs,
  type LoadedPdf,
} from '../src/workflows/mergeWorkflow';
import { useBusy } from '../src/workflows/useBusy';
import { useOrderedList, type Keyed } from '../src/workflows/useOrderedList';

export default function Merge() {
  const { store, refresh } = useLibrary();
  const { items, append, remove, setOrder } = useOrderedList<LoadedPdf>();
  const busy = useBusy();
  const [name, setName] = useState(() => defaultName('merge', new Date()));
  const started = useRef(false);
  const count = useRef(0);
  count.current = items.length;

  const backIfEmpty = () => {
    if (count.current === 0) router.back();
  };

  const pick = async () => {
    try {
      const result = await busy.run(async () => {
        const picked = await pickPdfs();
        if (picked.length === 0) return null;
        return loadPickedPdfs({ readBytes }, picked);
      });
      if (result === undefined) return;
      if (result === null) {
        backIfEmpty();
        return;
      }
      if (result.loaded.length > 0) append(result.loaded);
      if (result.failed.length > 0) {
        Alert.alert(
          'Không đọc được file',
          result.failed.join('\n') + '\nFile có thể bị hỏng hoặc có mật khẩu.',
        );
      }
      if (result.loaded.length === 0) backIfEmpty();
    } catch {
      Alert.alert('Không đọc được file', 'Không thể đọc file PDF đã chọn.');
      backIfEmpty();
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    pick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const merge = async () => {
    let meta;
    try {
      meta = await busy.run(() =>
        createMergedDocument(
          { readBytes, library: store },
          items.map((i) => i.value),
          sanitizeName(name, defaultName('merge', new Date())),
        ),
      );
    } catch {
      Alert.alert('Không thể tạo PDF');
      return;
    }
    if (!meta) return;
    // The document already exists; a failed refresh must not look like a failed merge.
    await refresh().catch(() => {});
    router.replace(`/viewer/${meta.id}`);
  };

  const renderItem = ({ item, drag, isActive }: RenderItemParams<Keyed<LoadedPdf>>) => (
    <Pressable
      style={[styles.row, isActive && styles.rowActive]}
      onLongPress={drag}
      disabled={isActive}
    >
      <Text style={styles.fileName} numberOfLines={1}>
        {item.value.name}
      </Text>
      <Text style={styles.pages}>{item.value.pageCount} trang</Text>
      <Pressable onPress={() => remove(item.key)}>
        <Text style={styles.delete}>Xoá</Text>
      </Pressable>
    </Pressable>
  );

  const mergeDisabled = items.length < 2 || busy.busy;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <NameInput value={name} onChangeText={setName} />
        {items.length < 2 && <Text style={styles.hint}>Chọn ít nhất 2 file PDF</Text>}
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
          role="button"
          style={[styles.button, busy.busy && styles.disabled]}
          disabled={busy.busy}
          onPress={pick}
        >
          <Text style={styles.buttonText}>+ Thêm file</Text>
        </Pressable>
        <Pressable
          role="button"
          style={[styles.button, mergeDisabled && styles.disabled]}
          disabled={mergeDisabled}
          onPress={merge}
        >
          <Text style={styles.buttonText}>Gộp PDF</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { padding: 16, gap: 8 },
  hint: { color: '#666', fontSize: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  rowActive: { backgroundColor: '#eef4ff' },
  fileName: { flex: 1, fontSize: 16 },
  pages: { color: '#666', fontSize: 14 },
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
