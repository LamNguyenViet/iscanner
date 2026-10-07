import { useMemo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useLocale } from '../i18n/LocaleContext';
import type { DocumentMeta } from '../library/types';
import type { Palette } from '../theme/palette';
import { useTheme } from '../theme/ThemeContext';
import { formatDate, formatSize } from '../utils/format';

type Props = {
  doc: DocumentMeta;
  onPress: () => void;
  onLongPress: () => void;
};

export function DocumentRow({ doc, onPress, onLongPress }: Props) {
  const { colors } = useTheme();
  const { t } = useLocale();
  const themed = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onLongPress={onLongPress}
      style={[styles.row, themed.row]}
    >
      <Text style={[styles.name, themed.name]} numberOfLines={1}>
        {doc.name}
      </Text>
      <Text style={[styles.meta, themed.meta]}>
        {`${formatDate(doc.createdAt, t)} · ${t.format.pages(doc.pageCount)} · ${formatSize(doc.sizeBytes)}`}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  name: { fontSize: 16, fontWeight: '600' },
  meta: { fontSize: 13, marginTop: 2 },
});

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    row: { borderBottomColor: c.border },
    name: { color: c.text },
    meta: { color: c.textMuted },
  });
