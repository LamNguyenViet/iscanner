import Constants from 'expo-constants';
import { useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useErrorAlert } from '../src/errors/useErrorAlert';
import { useLocale } from '../src/i18n/LocaleContext';
import { expoFs } from '../src/library/expoFs';
import { exportLogs } from '../src/logging/exportLogs';
import { log } from '../src/logging/logger';
import { shareLogFile, writeLogExport } from '../src/native/shareLogs';
import type { LanguagePreference, ThemePreference } from '../src/settings/settings';
import type { Palette } from '../src/theme/palette';
import { useTheme } from '../src/theme/ThemeContext';

type Option<T> = { value: T; label: string };

export default function SettingsScreen() {
  const { colors, preference: theme, setPreference: setTheme } = useTheme();
  const { t, language: activeLanguage, preference: language, setPreference: setLanguage } = useLocale();
  const showError = useErrorAlert();
  const [working, setWorking] = useState(false);
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

  async function sendLogs() {
    if (working) return;
    setWorking(true);
    try {
      const result = await exportLogs({
        fs: expoFs,
        logger: log,
        meta: {
          app: Constants.expoConfig?.version ?? 'unknown',
          os: `${Platform.OS} ${Platform.Version}`,
          language: activeLanguage,
        },
        writeExport: writeLogExport,
      });
      if (!result) {
        Alert.alert(t.settings.noLogs);
        return;
      }
      await shareLogFile(result.uri);
      log.info('logs.exported', { files: result.files, bytes: result.bytes });
    } catch (e) {
      showError(e);
    } finally {
      setWorking(false);
    }
  }

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
      <View style={styles.group}>
        <Text style={styles.header}>{t.settings.support}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: working }}
          disabled={working}
          style={[styles.row, working && styles.rowDisabled]}
          onPress={sendLogs}
        >
          <Text style={styles.rowText}>{t.settings.sendLogs}</Text>
        </Pressable>
      </View>
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
    rowDisabled: { opacity: 0.5 },
    rowSelected: { color: c.primary, fontWeight: '600' },
  });
