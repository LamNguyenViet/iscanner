import { useEffect, useMemo, useRef, useState } from 'react';
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
import { PageEditor, type ScanPage } from '../src/components/PageEditor';
import { SegmentedControl } from '../src/components/SegmentedControl';
import { normalizePage } from '../src/imaging/enhance';
import { useLibrary } from '../src/library/LibraryContext';
import { deleteFiles } from '../src/native/deleteFiles';
import { readBytes } from '../src/native/readBytes';
import {
  DEFAULT_LAYOUT,
  type Align,
  type Margin,
  type PageLayout,
  type PageSize,
} from '../src/pdf/layout';
import { scanDocuments } from '../src/scanner/scanner';
import { takeImages } from '../src/share/incomingStore';
import type { Palette } from '../src/theme/palette';
import { useTheme } from '../src/theme/ThemeContext';
import { defaultName, sanitizeName } from '../src/utils/format';
import { useBusy } from '../src/workflows/useBusy';
import { createScanDocument } from '../src/workflows/scanWorkflow';
import { useOrderedList, type Keyed } from '../src/workflows/useOrderedList';

const PAGE_SIZES: { value: PageSize; label: string }[] = [
  { value: 'a4', label: 'A4' },
  { value: 'letter', label: 'Letter' },
  { value: 'image', label: 'Theo ảnh' },
];

const MARGINS: { value: Margin; label: string }[] = [
  { value: 'none', label: 'Không' },
  { value: 'small', label: 'Nhỏ' },
  { value: 'medium', label: 'Vừa' },
];

const ALIGN_LABELS: Record<Align, string> = {
  top: 'Trên',
  center: 'Giữa',
  bottom: 'Dưới',
  fill: 'Lấp đầy',
};

/**
 * Normalizes each image in turn. Raw files that were normalized are deleted; a page
 * that fails keeps its raw image.
 */
async function normalizeAll(uris: string[]): Promise<string[]> {
  const pages: string[] = [];
  const normalizedRaw: string[] = [];
  for (const uri of uris) {
    try {
      pages.push(await normalizePage(uri));
      normalizedRaw.push(uri);
    } catch (e) {
      console.warn('normalizePage failed; keeping the raw image', e);
      pages.push(uri);
    }
  }
  if (normalizedRaw.length > 0) deleteFiles(normalizedRaw);
  return pages;
}

export default function Scan() {
  const { store, refresh } = useLibrary();
  const { items, append, remove, setOrder, update } = useOrderedList<ScanPage>();
  const busy = useBusy();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const themed = useMemo(() => makeStyles(colors), [colors]);
  const headerHeight = useHeaderHeight();
  const [name, setName] = useState(() => defaultName('scan', new Date()));
  const [layout, setLayout] = useState<PageLayout>(DEFAULT_LAYOUT);
  const [processing, setProcessing] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const started = useRef(false);
  const mounted = useRef(true);
  const count = useRef(0);
  count.current = items.length;
  // Scanned images are temporary files: delete them once used or abandoned.
  const pageUris = useRef<string[]>([]);
  pageUris.current = items.map((i) => i.value.uri);
  const created = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (!created.current) deleteFiles(pageUris.current);
    };
  }, []);

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

  const scanFrom = async (getUris: () => Promise<string[]>) => {
    try {
      const uris = await busy.run(async () => {
        const scanned = await getUris();
        if (scanned.length === 0) return scanned;
        setProcessing(true);
        try {
          return await normalizeAll(scanned);
        } finally {
          if (mounted.current) setProcessing(false);
        }
      });
      if (uris === undefined) return;
      if (uris.length === 0) {
        backIfEmpty();
        return;
      }
      if (!mounted.current) {
        // The screen was left while processing; nothing will use these images.
        deleteFiles(uris);
        return;
      }
      append(uris.map((uri) => ({ uri, align: 'center' as const })));
    } catch (e) {
      if (e instanceof Error && e.message === 'CAMERA_PERMISSION') {
        showPermissionAlert();
      } else {
        showScanErrorAlert();
      }
    }
  };

  const scan = () => scanFrom(() => scanDocuments());

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const pending = takeImages();
    if (pending.length > 0) {
      scanFrom(async () => pending.map((f) => f.uri));
    } else {
      scan();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async () => {
    let meta;
    try {
      meta = await busy.run(() =>
        createScanDocument(
          { readBytes, library: store },
          items.map((i) => i.value),
          sanitizeName(name, defaultName('scan', new Date())),
          layout,
        ),
      );
    } catch {
      Alert.alert('Không thể tạo PDF');
      return;
    }
    if (!meta) return;
    created.current = true;
    deleteFiles(items.map((i) => i.value.uri));
    // The document already exists; a failed refresh must not look like a failed create.
    await refresh().catch(() => {});
    router.replace(`/viewer/${meta.id}`);
  };

  const removePage = (item: Keyed<ScanPage>) => {
    remove(item.key);
    deleteFiles([item.value.uri]);
  };

  const finishEdit = (item: Keyed<ScanPage>, page: ScanPage) => {
    setEditingKey(null);
    update(item.key, page);
    // The editor never deletes the page it was given; a replaced image is ours to remove.
    if (page.uri !== item.value.uri) deleteFiles([item.value.uri]);
  };

  // Retakes a single page for the editor: normalized first image, extras discarded.
  const retake = async (): Promise<string | null> => {
    const uris = await scanDocuments({ maxPages: 1 });
    if (uris.length === 0) return null;
    const [first, ...extra] = uris;
    if (extra.length > 0) deleteFiles(extra);
    try {
      const normalized = await normalizePage(first);
      deleteFiles([first]);
      return normalized;
    } catch (e) {
      console.warn('normalizePage failed; keeping the raw image', e);
      return first;
    }
  };

  const renderItem = ({ item, drag, isActive }: RenderItemParams<Keyed<ScanPage>>) => (
    <Pressable
      style={[styles.row, themed.row, isActive && themed.rowActive]}
      onLongPress={drag}
      disabled={isActive}
    >
      <View style={styles.pageInfo}>
        <Text style={[styles.pageLabel, themed.pageLabel]}>Trang {items.findIndex((i) => i.key === item.key) + 1}</Text>
        <Text style={[styles.alignLabel, themed.alignLabel]}>{ALIGN_LABELS[item.value.align]}</Text>
      </View>
      {/* Inner Pressables become the touch responder, so each must start the drag itself. */}
      <Pressable
        accessibilityLabel="Sửa trang"
        onPress={() => setEditingKey(item.key)}
        onLongPress={drag}
      >
        <Image
          source={{ uri: item.value.uri }}
          style={[styles.thumb, themed.thumb]}
          resizeMethod="resize"
          testID="thumb"
        />
      </Pressable>
      <Pressable onPress={() => setEditingKey(item.key)} onLongPress={drag}>
        <Text style={[styles.edit, themed.edit]}>Sửa</Text>
      </Pressable>
      <Pressable onPress={() => removePage(item)} onLongPress={drag}>
        <Text style={[styles.delete, themed.delete]}>Xoá</Text>
      </Pressable>
    </Pressable>
  );

  const createDisabled = items.length === 0 || busy.busy;
  const editingIndex = items.findIndex((i) => i.key === editingKey);
  const editing = editingIndex >= 0 ? items[editingIndex] : null;

  return (
    <KeyboardAvoidingView
      style={[styles.container, themed.container]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={headerHeight}
    >
      <View style={styles.header}>
        <NameInput value={name} onChangeText={setName} />
        <SegmentedControl
          label="Khổ giấy"
          options={PAGE_SIZES}
          value={layout.pageSize}
          onChange={(pageSize) => setLayout((l) => ({ ...l, pageSize }))}
        />
        <SegmentedControl
          label="Lề"
          options={MARGINS}
          value={layout.margin}
          onChange={(margin) => setLayout((l) => ({ ...l, margin }))}
          disabled={layout.pageSize === 'image'}
        />
      </View>
      <DraggableFlatList
        data={items}
        keyExtractor={(i) => i.key}
        onDragEnd={({ data }) => setOrder(data)}
        renderItem={renderItem}
        containerStyle={styles.list}
      />
      {busy.busy && !processing && <ActivityIndicator style={styles.spinner} color={colors.primary} />}
      <View testID="actions" style={[styles.actions, { paddingBottom: 16 + insets.bottom }]}>
        <Pressable
          accessibilityRole="button"
          style={[styles.button, themed.button, busy.busy && styles.disabled]}
          disabled={busy.busy}
          onPress={scan}
        >
          <Text style={[styles.buttonText, themed.buttonText]}>+ Chụp thêm</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={[styles.button, themed.button, createDisabled && styles.disabled]}
          disabled={createDisabled}
          onPress={create}
        >
          <Text style={[styles.buttonText, themed.buttonText]}>Tạo PDF</Text>
        </Pressable>
      </View>
      {processing && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.overlayText}>Đang xử lý ảnh…</Text>
        </View>
      )}
      {editing && (
        <PageEditor
          visible
          page={editing.value}
          pageNumber={editingIndex + 1}
          layout={layout}
          onCancel={() => setEditingKey(null)}
          onDone={(page) => finishEdit(editing, page)}
          onRetake={retake}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  pageInfo: { flex: 1 },
  pageLabel: { fontSize: 16 },
  alignLabel: { fontSize: 13, marginTop: 2 },
  thumb: { width: 64, height: 88 },
  edit: { fontSize: 15, fontWeight: '600', padding: 8 },
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
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  // The processing overlay stays a dark scrim with white text in both themes.
  overlayText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    container: { backgroundColor: c.background },
    row: { backgroundColor: c.surface },
    rowActive: { backgroundColor: c.surfaceActive },
    pageLabel: { color: c.text },
    alignLabel: { color: c.textMuted },
    thumb: { backgroundColor: c.placeholder },
    edit: { color: c.primary },
    delete: { color: c.danger },
    button: { backgroundColor: c.primary },
    buttonText: { color: c.onPrimary },
  });
