import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useLocale } from '../i18n/LocaleContext';
import { useTheme } from '../theme/ThemeContext';

/** The ⚙︎ header button that opens Settings. */
export function SettingsButton() {
  const { colors } = useTheme();
  const { t } = useLocale();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t.settings.title}
      hitSlop={8}
      onPress={() => router.push('/settings')}
    >
      <Text style={[styles.icon, { color: colors.primary }]}>⚙︎</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  icon: { fontSize: 22, paddingHorizontal: 4 },
});
