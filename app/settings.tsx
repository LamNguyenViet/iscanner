import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocale } from '../src/i18n/LocaleContext';
import type { LanguagePreference, ThemePreference } from '../src/settings/settings';
import type { Palette } from '../src/theme/palette';
import { useTheme } from '../src/theme/ThemeContext';

type Option<T> = { value: T; label: string };

export default function SettingsScreen() {
  const { colors, preference: theme, setPreference: setTheme } = useTheme();
  const { t, preference: language, setPreference: setLanguage } = useLocale();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const themeOptions: Option<ThemePreference>[] = [
    { value: 'system', label: t.settings.system },
    { value: 'light', label: t.settings.light },
    { value: 'dark', label: t.settings.dark },
  ];
  const languageOptions: Option<LanguagePreference>[] = [
    { value: 'system', label: t.settings.system },
    { value: 'vi', label: t.settings.vietnamese },
    { value: 'en', label: t.settings.english },
  ];

  function group<T extends string>(
    title: string,
    options: Option<T>[],
    current: T,
    onSelect: (value: T) => void,
  ) {
    return (
      <View style={styles.group}>
        <Text style={styles.header}>{title}</Text>
        {options.map((o) => {
          const selected = o.value === current;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={styles.row}
              onPress={() => onSelect(o.value)}
            >
              <Text style={[styles.rowText, selected && styles.rowSelected]}>
                {selected ? `✓ ${o.label}` : o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={layout.content}>
      {group(t.settings.appearance, themeOptions, theme, setTheme)}
      {group(t.settings.language, languageOptions, language, setLanguage)}
    </ScrollView>
  );
}

const layout = StyleSheet.create({
  content: { padding: 16, gap: 24 },
});

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    group: { gap: 8 },
    header: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', color: c.textMuted },
    row: { backgroundColor: c.surface, padding: 14, borderRadius: 8 },
    rowText: { fontSize: 16, color: c.text },
    rowSelected: { color: c.primary, fontWeight: '600' },
  });
