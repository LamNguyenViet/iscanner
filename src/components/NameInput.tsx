import { useMemo } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { Palette } from '../theme/palette';
import { useTheme } from '../theme/ThemeContext';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
};

export function NameInput({ value, onChangeText, placeholder, autoFocus = false }: Props) {
  const { colors } = useTheme();
  const themed = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View>
      <Text style={[styles.label, themed.label]}>Tên tài liệu</Text>
      <TextInput
        accessibilityLabel="Tên tài liệu"
        style={[styles.input, themed.input]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        maxLength={100}
        autoFocus={autoFocus}
        selectTextOnFocus
      />
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
  },
});

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    label: { color: c.textMuted },
    input: { borderColor: c.border, color: c.text },
  });
