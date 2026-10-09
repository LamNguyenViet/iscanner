import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Palette } from '../theme/palette';
import { useTheme } from '../theme/ThemeContext';

type Props = {
  visible: boolean;
  title: string;
  /** Accessibility label of the backdrop, which closes the sheet. */
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
};

/** A sheet that slides up from the bottom; the backdrop and Android back close it. */
export function BottomSheet({ visible, title, closeLabel, onClose, children }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const themed = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, themed.backdrop]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          onPress={onClose}
        />
        <View style={[styles.sheet, themed.sheet, { paddingBottom: 16 + insets.bottom }]}>
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
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingTop: 12 },
  title: { fontSize: 15, fontWeight: '600', paddingHorizontal: 20, paddingVertical: 8 },
});

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    backdrop: { backgroundColor: c.backdrop },
    sheet: { backgroundColor: c.surface },
    title: { color: c.textMuted },
  });
