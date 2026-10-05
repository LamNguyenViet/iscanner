import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  visible: boolean;
  title: string;
  onRename: () => void;
  onShare: () => void;
  onDelete: () => void;
  onClose: () => void;
};

/** Action menu for a document (used on Android, where Alert keeps only 3 buttons). */
export function DocumentActions({ visible, title, onRename, onShare, onDelete, onClose }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.container}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Đóng menu"
        />
        <View style={styles.sheet}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Item label="Đổi tên" onPress={onRename} />
          <Item label="Chia sẻ" onPress={onShare} />
          <Item label="Xoá" onPress={onDelete} destructive />
          <Item label="Huỷ" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

function Item({
  label,
  onPress,
  destructive,
}: {
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" style={styles.item} onPress={onPress}>
      <Text style={[styles.itemText, destructive && styles.destructive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: { backgroundColor: '#fff', borderRadius: 12, paddingVertical: 8 },
  title: { fontSize: 15, color: '#666', paddingHorizontal: 16, paddingVertical: 8 },
  item: { paddingHorizontal: 16, paddingVertical: 14 },
  itemText: { fontSize: 16, color: '#1f1f1f' },
  destructive: { color: '#d1242f' },
});
