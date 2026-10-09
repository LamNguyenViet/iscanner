import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { HeaderBackButton } from 'expo-router/react-navigation';
import { usePasswordPrompt } from '../src/components/PasswordPrompt';
import { useErrorAlert } from '../src/errors/useErrorAlert';
import { useLocale } from '../src/i18n/LocaleContext';
import { useLibrary } from '../src/library/LibraryContext';
import { log } from '../src/logging/logger';
import { deleteFiles } from '../src/native/deleteFiles';
import { FileReadError, toAppError, type AppError } from '../src/errors/AppError';
import { readBytes } from '../src/native/readBytes';
import { clearSharedFiles, hasSharedFiles, readSharedFiles } from '../src/native/sharedPayloads';
import { unlockPdf } from '../src/pdf/mergePdfs';
import { importIncoming } from '../src/share/importIncoming';
import { clearPending, hasPendingImages, setPending } from '../src/share/incomingStore';
import { planIncoming } from '../src/share/plan';
import { incomingUriParam } from '../src/share/redirect';
import type { IncomingFile } from '../src/share/types';
import type { Palette } from '../src/theme/palette';
import { useTheme } from '../src/theme/ThemeContext';
import { openPdfWithPassword } from '../src/workflows/mergeWorkflow';
import { useForegroundCheck } from '../src/workflows/useForegroundCheck';

type Confirm = { pdf: IncomingFile; images: IncomingFile[]; bytes: Uint8Array; pageCount: number; password?: string };

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
  const { t } = useLocale();
  const showError = useErrorAlert();
  const { colors } = useTheme();
  const themed = useMemo(() => makeStyles(colors), [colors]);
  const { store, refresh } = useLibrary();
  const { ask, element: passwordPrompt } = usePasswordPrompt();
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [saving, setSaving] = useState(false);
  // One rule for the label and the saved name.
  const pdfName = confirm ? stripPdfExtension(confirm.pdf.name) || t.common.untitled : '';
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
      log.info('share.received', {
        pdf: files.filter((f) => f.kind === 'pdf').length,
        image: files.filter((f) => f.kind === 'image').length,
        rejected: skipped.length,
      });
      const plan = planIncoming(files);
      // Rejected files are listed once, whether or not anything usable remains. On the single-PDF path they
      // wait for the PDF's own result so a failure there joins them in the same popup.
      if (skipped.length > 0 && plan.kind !== 'single-pdf') showError(skipped);
      switch (plan.kind) {
        case 'none':
          // The per-file popup already said why; the notice is only for nothing received at all.
          if (skipped.length === 0) Alert.alert(t.incoming.noFiles);
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
          await prepareSinglePdf(plan.pdf, plan.images, skipped);
          return;
      }
    } catch (e) {
      if (!mounted.current) return;
      showError(e);
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

  const prepareSinglePdf = async (pdf: IncomingFile, images: IncomingFile[], skipped: AppError[]) => {
    setPending({ pdfs: [], images });
    undecided.current = pdf.uri;
    try {
      let bytes: Uint8Array;
      try {
        bytes = await readBytes(pdf.uri);
      } catch (e) {
        throw new FileReadError({ fileName: pdf.name, cause: e });
      }
      const opened = await openPdfWithPassword(bytes, pdf.name, ask, pdf.password);
      if (!mounted.current) return;
      if (opened === null) {
        // Password skipped: same as nothing usable.
        undecided.current = null;
        deleteFiles([pdf.uri]);
        if (skipped.length > 0) showError(skipped);
        if (!hasPendingImages()) Alert.alert(t.incoming.noFiles);
        continueAfterPdf();
        return;
      }
      if (skipped.length > 0) showError(skipped);
      setConfirm({ pdf, images, bytes, pageCount: opened.pageCount, password: opened.password });
    } catch (e) {
      if (!mounted.current) return;
      undecided.current = null;
      deleteFiles([pdf.uri]);
      showError([...skipped, toAppError(e)]);
      continueAfterPdf();
    }
  };

  const save = async () => {
    if (!confirm || saving) return;
    setSaving(true);
    let id: string;
    try {
      // A password-protected PDF is stored unlocked so the viewer and later merges need no password.
      const bytes =
        confirm.password === undefined ? confirm.bytes : await unlockPdf(confirm.bytes, confirm.password, confirm.pdf.name);
      const meta = await store.add(bytes, {
        name: pdfName,
        pageCount: confirm.pageCount,
        source: 'merge',
      });
      id = meta.id;
    } catch (e) {
      setSaving(false);
      showError(e);
      return;
    }
    undecided.current = null;
    log.info('incoming.saved');
    deleteFiles([confirm.pdf.uri]);
    // The document already exists; a failed refresh must not look like a failed save.
    await refresh().catch(() => {});
    router.replace(hasPendingImages() ? '/scan' : `/viewer/${id}`);
  };

  const mergeWithOthers = () => {
    if (!confirm || saving) return;
    undecided.current = null;
    setPending({
      pdfs: [confirm.password === undefined ? confirm.pdf : { ...confirm.pdf, password: confirm.password }],
      images: confirm.images,
    });
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
      <View style={[styles.center, themed.screen]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={[styles.status, themed.muted]}>{t.incoming.receiving}</Text>
        {passwordPrompt}
      </View>
    );
  }

  return (
    <View style={[styles.container, themed.screen]}>
      <Stack.Screen
        options={{
          headerBackVisible: false,
          headerLeft: (props) => <HeaderBackButton {...props} onPress={cancel} />,
        }}
      />
      <View style={styles.file}>
        <Text style={[styles.fileName, themed.text]} numberOfLines={2}>
          {pdfName}
        </Text>
        <Text style={[styles.pages, themed.muted]}>{t.format.pages(confirm.pageCount)}</Text>
      </View>
      {saving && <ActivityIndicator style={styles.spinner} color={colors.primary} />}
      <View style={styles.actions}>
        <Pressable
          role="button"
          style={[styles.button, themed.button, saving && styles.disabled]}
          disabled={saving}
          onPress={save}
        >
          <Text style={[styles.buttonText, themed.buttonText]}>{t.incoming.save}</Text>
        </Pressable>
        <Pressable
          role="button"
          style={[styles.button, styles.secondary, themed.secondary, saving && styles.disabled]}
          disabled={saving}
          onPress={mergeWithOthers}
        >
          <Text style={[styles.buttonText, themed.secondaryText]}>{t.incoming.mergeWithOthers}</Text>
        </Pressable>
      </View>
      {passwordPrompt}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  status: { fontSize: 16 },
  file: { paddingVertical: 24, gap: 8 },
  fileName: { fontSize: 18, fontWeight: '600' },
  pages: { fontSize: 15 },
  spinner: { margin: 8 },
  actions: { gap: 12, marginTop: 'auto', paddingBottom: 16 },
  button: {
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondary: { borderWidth: 1 },
  disabled: { opacity: 0.5 },
  buttonText: { fontSize: 16, fontWeight: '600' },
});

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { backgroundColor: c.background },
    text: { color: c.text },
    muted: { color: c.textMuted },
    button: { backgroundColor: c.primary },
    buttonText: { color: c.onPrimary },
    secondary: { backgroundColor: c.surface, borderColor: c.primary },
    secondaryText: { color: c.primary },
  });
