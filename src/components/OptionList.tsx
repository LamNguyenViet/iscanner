import { useMemo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import type { Palette } from '../theme/palette';
import { useTheme } from '../theme/ThemeContext';

export type Option<T> = { value: T; label: string };

type Props<T extends string> = {
  options: Option<T>[];
  value: T;
  onSelect: (value: T) => void;
};

/** One row per choice; the current choice is marked with ✓. */
export function OptionList<T extends string>({ options, value, onSelect }: Props<T>) {
  const { colors } = useTheme();
  const themed = useMemo(() => makeStyles(colors), [colors]);
  return (
    <>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityLabel={o.label}
            accessibilityState={{ selected }}
            style={styles.row}
            onPress={() => onSelect(o.value)}
          >
            <Text style={[styles.text, themed.text, selected && themed.selected]}>
              {selected ? `✓ ${o.label}` : o.label}
            </Text>
          </Pressable>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 20, paddingVertical: 14 },
  text: { fontSize: 16 },
});

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    text: { color: c.text },
    selected: { color: c.primary, fontWeight: '600' },
  });
