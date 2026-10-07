import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Palette } from '../theme/palette';
import { useTheme } from '../theme/ThemeContext';

type SegmentedControlProps<T extends string> = {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
};

/** A labelled row of mutually exclusive options. */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
}: SegmentedControlProps<T>) {
  const { colors } = useTheme();
  const themed = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.row}>
      <Text style={[styles.label, themed.label]}>{label}</Text>
      <View style={[styles.segments, themed.segments, disabled && styles.disabled]}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled }}
              disabled={disabled}
              onPress={() => onChange(option.value)}
              style={[styles.segment, selected && themed.segmentSelected]}
            >
              <Text
                style={[
                  styles.segmentText,
                  themed.segmentText,
                  selected && styles.segmentTextSelected,
                  selected && themed.segmentTextSelected,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  label: { width: 72, fontSize: 15 },
  segments: {
    flex: 1,
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  segment: { flex: 1, paddingVertical: 8, alignItems: 'center' },
  segmentText: { fontSize: 14 },
  segmentTextSelected: { fontWeight: '600' },
  disabled: { opacity: 0.4 },
});

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    label: { color: c.textMuted },
    segments: { borderColor: c.primary },
    segmentSelected: { backgroundColor: c.primary },
    segmentText: { color: c.primary },
    segmentTextSelected: { color: c.onPrimary },
  });
