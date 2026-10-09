import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocale } from '../i18n/LocaleContext';
import type { DocumentMeta } from '../library/types';
import type { Palette } from '../theme/palette';
import { useTheme } from '../theme/ThemeContext';
import { formatDate, formatSize } from '../utils/format';

type Props = {
  doc: DocumentMeta;
  onPress: () => void;
  onLongPress: () => void;
  /** Opens the per-document menu; hidden while selecting. */
  onMore?: () => void;
  /** Set while the library is in selection mode. */
  selected?: boolean;
  selecting?: boolean;
};

export function DocumentRow({ doc, onPress, onLongPress, onMore, selected = false, selecting = false }: Props) {
  const { colors } = useTheme();
  const { t } = useLocale();
  const themed = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={[styles.row, themed.row]}>
      <Pressable
        accessibilityRole={selecting ? 'checkbox' : 'button'}
        accessibilityLabel={doc.name}
        accessibilityState={selecting ? { checked: selected } : undefined}
        onPress={onPress}
        onLongPress={onLongPress}
        style={styles.main}
      >
        {selecting && (
          <Text style={[styles.check, selected ? themed.checkOn : themed.checkOff]}>
            {selected ? '☑' : '☐'}
          </Text>
        )}
        <View style={styles.text}>
          <Text style={[styles.name, themed.name]} numberOfLines={1}>
            {doc.name}
          </Text>
          <Text style={[styles.meta, themed.meta]}>
            {`${formatDate(doc.createdAt, t)} · ${t.format.pages(doc.pageCount)} · ${formatSize(doc.sizeBytes)}`}
          </Text>
        </View>
      </Pressable>
      {!selecting && onMore && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.library.moreActions}
          onPress={onMore}
          hitSlop={8}
          style={styles.more}
        >
          <Text style={[styles.moreText, themed.meta]}>⋯</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingLeft: 16,
  },
  check: { fontSize: 22, marginRight: 12 },
  text: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600' },
  meta: { fontSize: 13, marginTop: 2 },
  more: { paddingHorizontal: 16, paddingVertical: 12 },
  moreText: { fontSize: 22 },
});

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    row: { borderBottomColor: c.border },
    name: { color: c.text },
    meta: { color: c.textMuted },
    checkOn: { color: c.primary },
    checkOff: { color: c.textMuted },
  });
