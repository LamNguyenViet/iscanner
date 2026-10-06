import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { applyEdit, detectPageQuad, type Rotation } from '../imaging/enhance';
import { fullQuad, isFullQuad, isQuadUsable, orderQuad, type Quad } from '../imaging/geometry';
import { deleteFiles } from '../native/deleteFiles';
import type { Align, PageLayout } from '../pdf/layout';
import { containRect, CornerHandles, RotatedImage, rotatedSize, type Size } from './CornerHandles';
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

const FAILED = 'Không xử lý được ảnh';

const ALIGNS: { value: Align; label: string }[] = [
  { value: 'top', label: 'Trên' },
  { value: 'center', label: 'Giữa' },
  { value: 'bottom', label: 'Dưới' },
  { value: 'fill', label: 'Lấp đầy' },
];

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
    } catch {
      if (id === loadId.current) Alert.alert(FAILED);
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
    } catch {
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
      Alert.alert(FAILED);
      return;
    }
    if (rotation === 0 && isFullQuad(quad, size.width, size.height)) {
      onDone({ uri: currentUri, align });
      return;
    }
    setBusy(true);
    try {
      const uri = await applyEdit(currentUri, { quad: orderQuad(quad), rotation });
      // The retaken image was only an intermediate; the edited copy replaces it.
      if (retakenUri) void deleteFiles([retakenUri]);
      setBusy(false);
      onDone({ uri, align });
    } catch {
      setBusy(false);
      Alert.alert(FAILED);
    }
  };

  const onCanvasLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setCanvas({ width, height });
  };

  const displaySize = size ? rotatedSize(size, rotation) : null;
  const rect = displaySize ? containRect(displaySize, canvas) : null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={cancel}>
      <GestureHandlerRootView style={styles.root}>
        <View style={styles.topBar}>
          <Button label="Huỷ" onPress={cancel} disabled={busy} />
          <Text style={styles.title}>{`Trang ${pageNumber}`}</Text>
          <Button label="Xong" onPress={() => void done()} disabled={busy} testID="editor-done" primary />
        </View>

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
          {!loaded && !busy && <ActivityIndicator color="#fff" style={styles.centered} />}
        </View>

        <View style={styles.toolbar}>
          <Button
            label="Tự cắt sát"
            onPress={() => void detect(currentUri, false)}
            disabled={busy || !loaded}
            dark
          />
          <Button
            label="Toàn ảnh"
            onPress={() => size && setQuad(fullQuad(size.width, size.height))}
            disabled={busy || !loaded}
            dark
          />
          <Button
            label="Xoay ⟳"
            onPress={() => setRotation((r) => ((r + 90) % 360) as Rotation)}
            disabled={busy || !loaded}
            dark
          />
          <Button label="Chụp lại" onPress={() => void retake()} disabled={busy} dark />
        </View>

        <View style={styles.alignRow}>
          <View style={styles.alignButtons}>
            {ALIGNS.map((a) => (
              <Button
                key={a.value}
                label={a.label}
                onPress={() => setAlign(a.value)}
                disabled={busy}
                selected={align === a.value}
                dark
              />
            ))}
          </View>
          {displaySize && <PagePreview layout={layout} align={align} imageSize={displaySize} width={72} />}
        </View>

        {busy && (
          <View style={styles.busy} testID="editor-busy">
            <ActivityIndicator size="large" color="#fff" />
          </View>
        )}
      </GestureHandlerRootView>
    </Modal>
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
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, selected: !!selected }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, selected && styles.buttonSelected, disabled && styles.buttonDisabled]}
    >
      <Text style={[styles.buttonText, dark && styles.buttonTextDark, primary && styles.buttonTextPrimary]}>
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
  button: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 },
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
