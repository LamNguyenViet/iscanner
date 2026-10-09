import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Palette } from '../theme/palette';
import { useTheme } from '../theme/ThemeContext';

/** iOS runs onClosed from Modal.onDismiss; this timer covers a dismissal callback that never comes. */
export const IOS_DISMISS_FALLBACK_MS = 600;

type Props = {
  visible: boolean;
  title: string;
  /** Accessibility label of the backdrop, which closes the sheet. */
  closeLabel: string;
  onClose: () => void;
  /**
   * Called once after the sheet has finished closing. iOS cannot present an Alert or share sheet
   * while a Modal is still dismissing, so follow-up UI belongs here.
   */
  onClosed?: () => void;
  children: ReactNode;
};

/** A sheet that slides up from the bottom; the backdrop and Android back close it. */
export function BottomSheet({ visible, title, closeLabel, onClose, onClosed, children }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const themed = useMemo(() => makeStyles(colors), [colors]);
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;
  const wasVisible = useRef(visible);
  const notified = useRef(true);

  const notify = useCallback(() => {
    if (notified.current) return;
    notified.current = true;
    onClosedRef.current?.();
  }, []);

  useEffect(() => {
    if (visible) {
      wasVisible.current = true;
      notified.current = false;
      return;
    }
    if (!wasVisible.current) return;
    wasVisible.current = false;
    const id = setTimeout(notify, Platform.OS === 'ios' ? IOS_DISMISS_FALLBACK_MS : 0);
    return () => clearTimeout(id);
  }, [visible, notify]);

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="slide"
      onRequestClose={onClose}
      onDismiss={Platform.OS === 'ios' ? notify : undefined}
    >
      <View style={[styles.container, themed.backdrop]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          onPress={onClose}
        />
        <View
          accessibilityViewIsModal
          onAccessibilityEscape={onClose}
          style={[styles.sheet, themed.sheet, { paddingBottom: 16 + insets.bottom }]}
        >
          <Text style={[styles.title, themed.title]} accessibilityRole="header">
            {title}
          </Text>
          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'flex-end' },
  sheet: { maxHeight: '85%', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingTop: 12 },
  title: { fontSize: 15, fontWeight: '600', paddingHorizontal: 20, paddingVertical: 8 },
});

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    backdrop: { backgroundColor: c.backdrop },
    sheet: { backgroundColor: c.surface },
    title: { color: c.textMuted },
  });
