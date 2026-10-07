import { ActionMenu } from './ActionMenu';

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
    <ActionMenu
      visible={visible}
      title={title}
      onClose={onClose}
      items={[
        { label: 'Đổi tên', onPress: onRename },
        { label: 'Chia sẻ', onPress: onShare },
        { label: 'Xoá', onPress: onDelete, destructive: true },
        { label: 'Huỷ', onPress: onClose },
      ]}
    />
  );
}
