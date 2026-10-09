import Constants from 'expo-constants';
import { useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from '../src/components/BottomSheet';
import { OptionList, type Option } from '../src/components/OptionList';
import { useErrorAlert } from '../src/errors/useErrorAlert';
import { useLocale } from '../src/i18n/LocaleContext';
import { expoFs } from '../src/library/expoFs';
import { exportLogs } from '../src/logging/exportLogs';
import { log } from '../src/logging/logger';
import { currentAppBuild } from '../src/native/appBuild';
import { shareLogFile, writeLogExport } from '../src/native/shareLogs';
import type { LanguagePreference, ThemePreference } from '../src/settings/settings';
import type { Palette } from '../src/theme/palette';
import { useTheme } from '../src/theme/ThemeContext';
import { useUpdate } from '../src/update/UpdateContext';

type Sheet = 'theme' | 'language' | 'updates' | 'logs' | null;

export default function SettingsScreen() {
  const { colors, preference: theme, setPreference: setTheme } = useTheme();
  const { t, language: activeLanguage, preference: language, setPreference: setLanguage } = useLocale();
  const showError = useErrorAlert();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [working, setWorking] = useState(false);
  const [checking, setChecking] = useState(false);
  const { checkNow } = useUpdate();
  const { version, build } = currentAppBuild();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const close = () => setSheet(null);

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
  const labelOf = <T extends string>(options: Option<T>[], value: T) =>
    options.find((o) => o.value === value)?.label ?? '';

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

  async function checkForUpdate() {
    if (checking) return;
    setChecking(true);
    try {
      const result = await checkNow();
      close();
      if (result === 'none') Alert.alert(t.update.upToDate);
      else if (result === 'failed') Alert.alert(t.update.checkFailed);
    } finally {
      setChecking(false);
    }
  }

  const row = (title: string, value: string, open: Sheet, last = false) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${title}, ${value}` : title}
      style={[styles.row, !last && styles.rowDivider]}
      onPress={() => setSheet(open)}
    >
      <Text style={styles.rowTitle}>{title}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );

  const actionButton = (label: string, busy: boolean, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: busy }}
      disabled={busy}
      style={[styles.action, busy && styles.disabled]}
      onPress={onPress}
    >
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={layout.content}>
      <View style={styles.group}>
        <Text style={styles.header}>{t.settings.general}</Text>
        <View style={styles.card}>
          {row(t.settings.appearance, labelOf(themeOptions, theme), 'theme')}
          {row(t.settings.language, labelOf(languageOptions, language), 'language', true)}
        </View>
      </View>
      <View style={styles.group}>
        <Text style={styles.header}>{t.settings.support}</Text>
        <View style={styles.card}>
          {row(t.settings.updates, `${version} (${build})`, 'updates')}
          {row(t.settings.logs, '', 'logs', true)}
        </View>
      </View>

      <BottomSheet
        visible={sheet === 'theme'}
        title={t.settings.appearance}
        closeLabel={t.settings.closeSheet}
        onClose={close}
      >
        <OptionList
          options={themeOptions}
          value={theme}
          onSelect={(v) => {
            setTheme(v);
            close();
          }}
        />
      </BottomSheet>
      <BottomSheet
        visible={sheet === 'language'}
        title={t.settings.language}
        closeLabel={t.settings.closeSheet}
        onClose={close}
      >
        <OptionList
          options={languageOptions}
          value={language}
          onSelect={(v) => {
            setLanguage(v);
            close();
          }}
        />
      </BottomSheet>
      <BottomSheet
        visible={sheet === 'updates'}
        title={t.settings.updates}
        closeLabel={t.settings.closeSheet}
        onClose={close}
      >
        <Text style={styles.sheetText}>{t.settings.version(version, build)}</Text>
        {actionButton(t.settings.checkUpdate, checking, checkForUpdate)}
      </BottomSheet>
      <BottomSheet
        visible={sheet === 'logs'}
        title={t.settings.logs}
        closeLabel={t.settings.closeSheet}
        onClose={close}
      >
        <Text style={styles.sheetText}>{t.settings.logsHint}</Text>
        {actionButton(t.settings.sendLogs, working, sendLogs)}
      </BottomSheet>
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
    card: { backgroundColor: c.surface, borderRadius: 12, overflow: 'hidden' },
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 8 },
    rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
    rowTitle: { fontSize: 16, color: c.text },
    rowValue: { flex: 1, textAlign: 'right', fontSize: 15, color: c.textMuted },
    chevron: { fontSize: 20, color: c.textMuted },
    sheetText: { fontSize: 15, color: c.text, paddingHorizontal: 20, paddingVertical: 8 },
    action: {
      marginHorizontal: 20,
      marginTop: 8,
      borderRadius: 8,
      paddingVertical: 14,
      alignItems: 'center',
      backgroundColor: c.primary,
    },
    actionText: { fontSize: 16, fontWeight: '600', color: c.onPrimary },
    disabled: { opacity: 0.5 },
  });
