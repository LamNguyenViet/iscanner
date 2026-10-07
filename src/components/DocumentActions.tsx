import { useLocale } from '../i18n/LocaleContext';
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
  const { t } = useLocale();
  return (
    <ActionMenu
      visible={visible}
      title={title}
      onClose={onClose}
      items={[
        { label: t.documentMenu.rename, onPress: onRename },
        { label: t.documentMenu.share, onPress: onShare },
        { label: t.documentMenu.delete, onPress: onDelete, destructive: true },
        { label: t.common.cancel, onPress: onClose },
      ]}
    />
  );
}
