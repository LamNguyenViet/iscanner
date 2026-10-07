import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  initialWindowMetrics,
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AppError, ImageProcessError } from '../errors/AppError';
import { useErrorAlert } from '../errors/useErrorAlert';
import { useLocale } from '../i18n/LocaleContext';
import { applyEdit, detectPageQuad, type Rotation } from '../imaging/enhance';
import {
  fullQuad,
  isFullQuad,
  isQuadUsable,
  orderQuad,
  warpSize,
  type Quad,
} from '../imaging/geometry';
import { deleteFiles } from '../native/deleteFiles';
import type { Align, PageLayout } from '../pdf/layout';
import {
  CornerHandles,
  editorImageRect,
  RotatedImage,
  rotatedSize,
  type Size,
} from './CornerHandles';
import { PagePreview } from './PagePreview';

export type ScanPage = { uri: string; align: Align };

type PageEditorProps = {
  visible: boolean;
  page: ScanPage;
  pageNumber: number;
  layout: PageLayout;
  onCancel: () => void;
  /** New uri (processed) or the same uri, plus the chosen align. */
  onDone: (page: ScanPage) => void;
  /** Returns a new normalized image uri, or null if cancelled. */
  onRetake: () => Promise<string | null>;
};

const ALIGNS: Align[] = ['top', 'center', 'bottom', 'fill'];

/** Full-screen editor for one scanned page: crop corners, rotate, retake and alignment. */
export function PageEditor({
  visible,
  page,
  pageNumber,
  layout,
  onCancel,
  onDone,
  onRetake,
}: PageEditorProps) {
  const { t } = useLocale();
  const showError = useErrorAlert();
  // Read through a ref so a live language change does not give `detect` a new identity (it would re-run
  // detection and wipe the user's corner edits).
  const showErrorRef = useRef(showError);
  showErrorRef.current = showError;
  const [currentUri, setCurrentUri] = useState(page.uri);
  const [retakenUri, setRetakenUri] = useState<string | null>(null);
  const [align, setAlign] = useState<Align>(page.align);
  const [rotation, setRotation] = useState<Rotation>(0);
  const [size, setSize] = useState<Size | null>(null);
  const [quad, setQuad] = useState<Quad | null>(null);
  const [busy, setBusy] = useState(false);
  const [canvas, setCanvas] = useState<Size>({ width: 0, height: 0 });
  const loadId = useRef(0);

  // Reset whenever the editor opens or is pointed at another page.
  useEffect(() => {
    if (!visible) return;
    setCurrentUri(page.uri);
    setRetakenUri(null);
    setAlign(page.align);
    setRotation(0);
  }, [visible, page.uri, page.align]);

  const detect = useCallback(async (uri: string, resetSize: boolean) => {
    const id = ++loadId.current;
    if (resetSize) {
      setSize(null);
      setQuad(null);
    }
    try {
      const result = await detectPageQuad(uri);
      if (id !== loadId.current) return;
      setSize(result.size);
      setQuad(result.quad);
    } catch (e) {
      if (id === loadId.current) showErrorRef.current(new ImageProcessError({ cause: e }));
    }
  }, []);

  useEffect(() => {
    if (visible) void detect(currentUri, true);
  }, [visible, currentUri, detect]);

  const loaded = size !== null && quad !== null;

  const cancel = () => {
    if (busy) return;
    if (retakenUri) void deleteFiles([retakenUri]);
    onCancel();
  };

  const retake = async () => {
    setBusy(true);
    let uri: string | null = null;
    try {
      uri = await onRetake();
    } catch (e) {
      // A cancelled scan resolves null; a throw is a real failure the user should hear about.
      if (__DEV__) console.warn('retake failed', e);
      showError(e instanceof AppError ? e : new ImageProcessError({ cause: e }));
      uri = null;
    } finally {
      setBusy(false);
    }
    if (!uri) return;
    if (retakenUri) void deleteFiles([retakenUri]);
    setRetakenUri(uri);
    setRotation(0);
    setCurrentUri(uri);
  };

  const done = async () => {
    if (!size || !quad) {
      // Nothing could be edited yet; keep the image and apply the alignment only.
      if (rotation === 0) onDone({ uri: currentUri, align });
      return;
    }
    if (!isQuadUsable(quad, size.width, size.height)) {
      showError(new ImageProcessError());
      return;
    }
    if (rotation === 0 && isFullQuad(quad, size.width, size.height)) {
      onDone({ uri: currentUri, align });
      return;
    }
    setBusy(true);
    try {
      const uri = await applyEdit(currentUri, {
        quad: orderQuad(quad),
        rotation,
      });
      // The retaken image was only an intermediate; the edited copy replaces it.
      if (retakenUri) void deleteFiles([retakenUri]);
      setBusy(false);
      onDone({ uri, align });
    } catch (e) {
      setBusy(false);
      showError(new ImageProcessError({ cause: e }));
    }
  };

  const onCanvasLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setCanvas({ width, height });
  };

  const displaySize = size ? rotatedSize(size, rotation) : null;
  const rect = displaySize ? editorImageRect(displaySize, canvas) : null;
  // The mini PDF preview shows the page as it will be cropped: the warped quad size when the
  // quad can be cropped to, otherwise the whole image.
  const previewSize =
    size && quad && isQuadUsable(quad, size.width, size.height)
      ? rotatedSize(warpSize(orderQuad(quad)), rotation)
      : displaySize;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={cancel}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <GestureHandlerRootView style={styles.root}>
          <StatusBar style="light" />
          <InsetView edge="top" testID="editor-header" style={styles.topBar}>
            <Button label={t.common.cancel} onPress={cancel} disabled={busy} />
            <Text style={styles.title}>{t.editor.title(pageNumber)}</Text>
            <Button
              label={t.editor.done}
              onPress={() => void done()}
              disabled={busy}
              testID="editor-done"
              primary
            />
          </InsetView>

          <View style={styles.canvas} onLayout={onCanvasLayout}>
            {size && quad && rect && (
              <>
                <RotatedImage
                  testID="editor-image"
                  uri={currentUri}
                  size={size}
                  rotation={rotation}
                  scale={rect.width / (displaySize as Size).width || 0}
                  left={rect.x}
                  top={rect.y}
                />
                <CornerHandles
                  imageRect={rect}
                  imageSize={size}
                  quad={quad}
                  onChange={setQuad}
                  rotation={rotation}
                  imageUri={currentUri}
                />
              </>
            )}
            {!loaded && !busy && (
              <ActivityIndicator color="#fff" style={styles.centered} />
            )}
          </View>

          <View style={styles.toolbar}>
            <Button
              label={t.editor.autoCrop}
              onPress={() => void detect(currentUri, false)}
              disabled={busy || !loaded}
              dark
            />
            <Button
              label={t.editor.fullImage}
              onPress={() => size && setQuad(fullQuad(size.width, size.height))}
              disabled={busy || !loaded}
              dark
            />
            <Button
              label={t.editor.rotate}
              onPress={() => setRotation((r) => ((r + 90) % 360) as Rotation)}
              disabled={busy || !loaded}
              dark
            />
            <Button
              label={t.editor.retake}
              onPress={() => void retake()}
              disabled={busy}
              dark
            />
          </View>

          <InsetView
            edge="bottom"
            testID="editor-align-row"
            style={styles.alignRow}
          >
            <View style={styles.alignButtons}>
              {ALIGNS.map((a) => (
                <Button
                  key={a}
                  label={t.layoutOptions.align[a]}
                  onPress={() => setAlign(a)}
                  disabled={busy}
                  selected={align === a}
                  dark
                />
              ))}
            </View>
            {previewSize && (
              <PagePreview
                layout={layout}
                align={align}
                imageSize={previewSize}
                width={72}
              />
            )}
          </InsetView>

          {busy && (
            <View style={styles.busy} testID="editor-busy">
              <ActivityIndicator size="large" color="#fff" />
            </View>
          )}
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </Modal>
  );
}

/** A View padded by the system-bar inset on one edge (the Modal is its own window). */
function InsetView({
  edge,
  style,
  testID,
  children,
}: {
  edge: 'top' | 'bottom';
  style: StyleProp<ViewStyle>;
  testID?: string;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const flat = StyleSheet.flatten(style) ?? {};
  const base = (edge === 'top' ? flat.paddingTop : flat.paddingBottom) as
    number | undefined;
  const pad = (base ?? 0) + insets[edge];
  return (
    <View
      testID={testID}
      style={[
        style,
        edge === 'top' ? { paddingTop: pad } : { paddingBottom: pad },
      ]}
    >
      {children}
    </View>
  );
}

function Button({
  label,
  onPress,
  disabled,
  testID,
  primary,
  selected,
  dark,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
  primary?: boolean;
  selected?: boolean;
  dark?: boolean;
}) {
  return (
    <Pressable
      testID={testID}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, selected: !!selected }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        selected && styles.buttonSelected,
        disabled && styles.buttonDisabled,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          dark && styles.buttonTextDark,
          primary && styles.buttonTextPrimary,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#111' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingTop: 12,
    paddingBottom: 8,
  },
  title: { color: '#fff', fontSize: 16, fontWeight: '600' },
  canvas: { flex: 1, margin: 16 },
  centered: { ...StyleSheet.absoluteFill },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#333',
  },
  alignRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 16,
    minHeight: 120,
  },
  alignButtons: { flexDirection: 'row', flexWrap: 'wrap', flex: 1 },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: 8,
  },
  buttonSelected: { backgroundColor: '#1a73e8' },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { fontSize: 16, color: '#fff' },
  buttonTextDark: { color: '#eee', fontSize: 14 },
  buttonTextPrimary: { color: '#8ab4f8', fontWeight: '600' },
  busy: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
