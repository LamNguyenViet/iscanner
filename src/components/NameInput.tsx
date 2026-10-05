import { StyleSheet, Text, TextInput, View } from 'react-native';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
};

export function NameInput({ value, onChangeText, placeholder, autoFocus = false }: Props) {
  return (
    <View>
      <Text style={styles.label}>Tên tài liệu</Text>
      <TextInput
        accessibilityLabel="Tên tài liệu"
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        maxLength={100}
        autoFocus={autoFocus}
        selectTextOnFocus
      />
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, color: '#555', marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
  },
});
