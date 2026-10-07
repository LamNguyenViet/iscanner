import { useState } from 'react';
import { ActionSheetIOS, Platform, Pressable, StyleSheet, Text } from 'react-native';
import type { ThemePreference } from '../theme/preference';
import { useTheme } from '../theme/ThemeContext';
import { ActionMenu } from './ActionMenu';

export const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Theo hệ thống' },
  { value: 'light', label: 'Sáng' },
  { value: 'dark', label: 'Tối' },
];

/** Header button that picks light, dark or system appearance. */
export function ThemeMenuButton() {
  const { colors, preference, setPreference } = useTheme();
  const [open, setOpen] = useState(false);

  const openMenu = () => {
    if (Platform.OS !== 'ios') {
      setOpen(true);
      return;
    }
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: 'Giao diện',
        options: [
          ...THEME_OPTIONS.map((o) => (o.value === preference ? `✓ ${o.label}` : o.label)),
          'Huỷ',
        ],
        cancelButtonIndex: THEME_OPTIONS.length,
      },
      (index) => {
        const option = THEME_OPTIONS[index];
        if (option) setPreference(option.value);
      },
    );
  };

  const choose = (value: ThemePreference) => {
    setOpen(false);
    setPreference(value);
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Giao diện"
        hitSlop={8}
        onPress={openMenu}
      >
        <Text style={[styles.icon, { color: colors.primary }]}>⚙︎</Text>
      </Pressable>
      <ActionMenu
        visible={open}
        title="Giao diện"
        onClose={() => setOpen(false)}
        items={[
          ...THEME_OPTIONS.map((o) => ({
            label: o.label,
            selected: o.value === preference,
            onPress: () => choose(o.value),
          })),
          { label: 'Huỷ', onPress: () => setOpen(false) },
        ]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  icon: { fontSize: 22, paddingHorizontal: 4 },
});
