import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { HeaderBackButton } from 'expo-router/react-navigation';
import { useLibrary } from '../src/library/LibraryContext';
import { deleteFiles } from '../src/native/deleteFiles';
import { readBytes } from '../src/native/readBytes';
import { clearSharedFiles, hasSharedFiles, readSharedFiles } from '../src/native/sharedPayloads';
import { getPdfPageCount } from '../src/pdf/mergePdfs';
import { importIncoming } from '../src/share/importIncoming';
import { clearPending, hasPendingImages, setPending } from '../src/share/incomingStore';
import { planIncoming } from '../src/share/plan';
import { incomingUriParam } from '../src/share/redirect';
import type { IncomingFile } from '../src/share/types';
import { useForegroundCheck } from '../src/workflows/useForegroundCheck';

type Confirm = { pdf: IncomingFile; images: IncomingFile[]; bytes: Uint8Array; pageCount: number };

const NO_FILES = 'Không có file PDF hoặc ảnh hợp lệ';

/**
 * Back to the library. On a warm share the stack is [index, incoming]: pop to it instead of stacking a
 * second library; on a cold start (incoming is the root) dismissTo replaces the screen.
 */
function goHome() {
  router.dismissTo('/');
}

/** After the PDF step: the scan review takes the shared images, otherwise back to the library. */
function continueAfterPdf() {
  if (hasPendingImages()) router.replace('/scan');
  else goHome();
}

function stripPdfExtension(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

export default function Incoming() {
  const params = useLocalSearchParams<{ uri?: string }>();
  const { store, refresh } = useLibrary();
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [saving, setSaving] = useState(false);
  const started = useRef(false);
  // True from the start of a receive until its result is shown (or it navigated away).
  const receiving = useRef(false);
  const savingRef = useRef(false);
  savingRef.current = saving;
  const mounted = useRef(true);
  // The single PDF copy waiting for the user's choice; deleted if the screen is left without one.
  const undecided = useRef<string | null>(null);

  useEffect(
    () => () => {
      mounted.current = false;
      if (undecided.current) {
        // No choice was made: the images waiting for the scan review go with the PDF.
        const pending = clearPending();
        deleteFiles([undecided.current, ...pending.map((f) => f.uri)]);
      }
    },
    [],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    receive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // fromShare: read the waiting share even if this screen was opened for a file URI.
  const receive = async (fromShare = false) => {
    receiving.current = true;
    try {
      const uri = fromShare ? undefined : incomingUriParam(params.uri);
      const sources = uri ? [{ uri }] : await readSharedFiles();
      try {
        clearSharedFiles();
      } catch {
        // nothing to clear
      }
      // A new share replaces anything still pending from a previous one.
      const previous = clearPending();
      if (previous.length > 0) deleteFiles(previous.map((f) => f.uri));
      const { files, skipped } = await importIncoming(sources);
      if (!mounted.current) {
        if (files.length > 0) deleteFiles(files.map((f) => f.uri));
        return;
      }
      const plan = planIncoming(files);
      // With nothing usable the no-files alert says it all.
      if (skipped.length > 0 && plan.kind !== 'none') {
        Alert.alert(`Bỏ qua ${skipped.length} file không hỗ trợ hoặc quá lớn`);
      }
      switch (plan.kind) {
        case 'none':
          Alert.alert(NO_FILES);
          goHome();
          return;
        case 'merge':
          setPending({ pdfs: plan.pdfs, images: plan.images });
          router.replace('/merge');
          return;
        case 'scan':
          setPending({ pdfs: [], images: plan.images });
          router.replace('/scan');
          return;
        case 'single-pdf':
          await prepareSinglePdf(plan.pdf, plan.images);
          return;
      }
    } catch {
      if (!mounted.current) return;
      Alert.alert(NO_FILES);
      goHome();
    } finally {
      receiving.current = false;
    }
  };

  // A share that arrives while this screen is open does not remount it (navigating to the open route
  // is a no-op), so read it here: it replaces the file waiting for a choice.
  useForegroundCheck(() => {
    if (receiving.current || savingRef.current || !hasSharedFiles()) return;
    if (undecided.current) {
      deleteFiles([undecided.current]);
      undecided.current = null;
    }
    setConfirm(null);
    receive(true);
  });

  const prepareSinglePdf = async (pdf: IncomingFile, images: IncomingFile[]) => {
    setPending({ pdfs: [], images });
    undecided.current = pdf.uri;
    try {
      const bytes = await readBytes(pdf.uri);
      const pageCount = await getPdfPageCount(bytes);
      if (!mounted.current) return;
      setConfirm({ pdf, images, bytes, pageCount });
    } catch {
      if (!mounted.current) return;
      undecided.current = null;
      deleteFiles([pdf.uri]);
      Alert.alert('Không đọc được file');
      continueAfterPdf();
    }
  };

  const save = async () => {
    if (!confirm || saving) return;
    setSaving(true);
    let id: string;
    try {
      const meta = await store.add(confirm.bytes, {
        name: stripPdfExtension(confirm.pdf.name),
        pageCount: confirm.pageCount,
        source: 'merge',
      });
      id = meta.id;
    } catch {
      setSaving(false);
      Alert.alert('Có lỗi xảy ra');
      return;
    }
    undecided.current = null;
    deleteFiles([confirm.pdf.uri]);
    // The document already exists; a failed refresh must not look like a failed save.
    await refresh().catch(() => {});
    router.replace(hasPendingImages() ? '/scan' : `/viewer/${id}`);
  };

  const mergeWithOthers = () => {
    if (!confirm || saving) return;
    undecided.current = null;
    setPending({ pdfs: [confirm.pdf], images: confirm.images });
    router.replace('/merge');
  };

  const cancel = () => {
    if (!confirm || saving) return;
    undecided.current = null;
    deleteFiles([confirm.pdf.uri]);
    continueAfterPdf();
  };

  // Android hardware back on the confirm view behaves like the header back button.
  const cancelRef = useRef(cancel);
  cancelRef.current = cancel;
  const confirming = confirm !== null;
  useEffect(() => {
    if (!confirming) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      cancelRef.current();
      return true;
    });
    return () => sub.remove();
  }, [confirming]);

  if (!confirm) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.status}>Đang nhận file…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerBackVisible: false,
          headerLeft: (props) => <HeaderBackButton {...props} onPress={cancel} />,
        }}
      />
      <View style={styles.file}>
        <Text style={styles.fileName} numberOfLines={2}>
          {confirm.pdf.name}
        </Text>
        <Text style={styles.pages}>{confirm.pageCount} trang</Text>
      </View>
      {saving && <ActivityIndicator style={styles.spinner} />}
      <View style={styles.actions}>
        <Pressable
          role="button"
          style={[styles.button, saving && styles.disabled]}
          disabled={saving}
          onPress={save}
        >
          <Text style={styles.buttonText}>Lưu vào thư viện</Text>
        </Pressable>
        <Pressable
          role="button"
          style={[styles.button, styles.secondary, saving && styles.disabled]}
          disabled={saving}
          onPress={mergeWithOthers}
        >
          <Text style={[styles.buttonText, styles.secondaryText]}>Gộp với file khác</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#fff',
  },
  status: { fontSize: 16, color: '#666' },
  file: { paddingVertical: 24, gap: 8 },
  fileName: { fontSize: 18, fontWeight: '600' },
  pages: { color: '#666', fontSize: 15 },
  spinner: { margin: 8 },
  actions: { gap: 12, marginTop: 'auto', paddingBottom: 16 },
  button: {
    backgroundColor: '#1f6feb',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#1f6feb' },
  disabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryText: { color: '#1f6feb' },
});
