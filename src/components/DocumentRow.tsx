import { Pressable, StyleSheet, Text } from 'react-native';
import type { DocumentMeta } from '../library/types';
import { formatDate, formatSize } from '../utils/format';

type Props = {
  doc: DocumentMeta;
  onPress: () => void;
  onLongPress: () => void;
};

export function DocumentRow({ doc, onPress, onLongPress }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onLongPress={onLongPress}
      style={styles.row}
    >
      <Text style={styles.name} numberOfLines={1}>
        {doc.name}
      </Text>
      <Text style={styles.meta}>
        {`${formatDate(doc.createdAt)} · ${doc.pageCount} trang · ${formatSize(doc.sizeBytes)}`}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  name: { fontSize: 16, fontWeight: '600' },
  meta: { fontSize: 13, color: '#666', marginTop: 2 },
});
