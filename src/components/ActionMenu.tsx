import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocale } from '../i18n/LocaleContext';
import type { Palette } from '../theme/palette';
import { useTheme } from '../theme/ThemeContext';

export type ActionMenuItem = {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  selected?: boolean;
};

type Props = { visible: boolean; title: string; items: ActionMenuItem[]; onClose: () => void };

/** Modal menu used on Android, where Alert keeps only 3 buttons. */
export function ActionMenu({ visible, title, items, onClose }: Props) {
  const { colors } = useTheme();
  const { t } = useLocale();
  const themed = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.container, themed.container]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel={t.documentMenu.closeMenu}
        />
        <View style={[styles.sheet, themed.sheet]}>
          <Text style={[styles.title, themed.title]} numberOfLines={1}>
            {title}
          </Text>
          {items.map((item) => (
            <Pressable
              key={item.label}
              accessibilityRole="button"
              style={styles.item}
              onPress={item.onPress}
            >
              <Text style={[styles.itemText, item.destructive ? themed.destructive : themed.itemText]}>
                {item.selected ? `✓ ${item.label}` : item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  sheet: { borderRadius: 12, paddingVertical: 8 },
  title: { fontSize: 15, paddingHorizontal: 16, paddingVertical: 8 },
  item: { paddingHorizontal: 16, paddingVertical: 14 },
  itemText: { fontSize: 16 },
});

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    container: { backgroundColor: c.backdrop },
    sheet: { backgroundColor: c.surface },
    title: { color: c.textMuted },
    itemText: { color: c.text },
    destructive: { color: c.danger },
  });
