import { Pressable, StyleSheet, Text, View } from 'react-native';

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
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.segments, disabled && styles.disabled]}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled }}
              disabled={disabled}
              onPress={() => onChange(option.value)}
              style={[styles.segment, selected && styles.segmentSelected]}
            >
              <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
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
  label: { width: 72, fontSize: 15, color: '#333' },
  segments: {
    flex: 1,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#1f6feb',
    borderRadius: 8,
    overflow: 'hidden',
  },
  segment: { flex: 1, paddingVertical: 8, alignItems: 'center' },
  segmentSelected: { backgroundColor: '#1f6feb' },
  segmentText: { fontSize: 14, color: '#1f6feb' },
  segmentTextSelected: { color: '#fff', fontWeight: '600' },
  disabled: { opacity: 0.4 },
});
