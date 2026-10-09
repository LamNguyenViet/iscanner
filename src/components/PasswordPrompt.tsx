import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocale } from '../i18n/LocaleContext';
import type { Palette } from '../theme/palette';
import { useTheme } from '../theme/ThemeContext';

type Props = {
  visible: boolean;
  fileName: string;
  wrongBefore: boolean;
  onSubmit: (password: string) => void;
  onSkip: () => void;
};

/** Centred dialog asking for a PDF password; back or a backdrop tap skips the file. */
export function PasswordPrompt({ visible, fileName, wrongBefore, onSubmit, onSkip }: Props) {
  const { colors } = useTheme();
  const { t } = useLocale();
  const themed = useMemo(() => makeStyles(colors), [colors]);
  const [value, setValue] = useState('');
  // Gate on emptiness only; the password itself is passed back untrimmed.
  const empty = value.length === 0;
  const submit = () => {
    if (!empty) onSubmit(value);
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onSkip}>
      <View style={[styles.container, themed.container]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onSkip}
          accessible={false}
          importantForAccessibility="no"
        />
        <View style={[styles.card, themed.card]}>
          <Text style={[styles.title, themed.title]}>{t.pdfPassword.title}</Text>
          <Text style={[styles.body, themed.body]}>{t.pdfPassword.body(fileName)}</Text>
          <TextInput
            style={[styles.input, themed.input]}
            value={value}
            onChangeText={setValue}
            placeholder={t.pdfPassword.placeholder}
            placeholderTextColor={colors.textMuted}
            accessibilityLabel={t.pdfPassword.placeholder}
            secureTextEntry
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="password"
            returnKeyType="done"
            onSubmitEditing={submit}
          />
          {wrongBefore ? <Text style={[styles.wrong, themed.wrong]}>{t.pdfPassword.wrong}</Text> : null}
          <View style={styles.buttons}>
            <Pressable accessibilityRole="button" style={styles.button} onPress={onSkip}>
              <Text style={[styles.buttonText, themed.skipText]}>{t.pdfPassword.skip}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: empty }}
              disabled={empty}
              style={[styles.button, empty && styles.disabled]}
              onPress={submit}
            >
              <Text style={[styles.buttonText, themed.openText]}>{t.pdfPassword.open}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Imperative wrapper: `await ask(file, wrongBefore)` resolves the password, or null when skipped. */
export function usePasswordPrompt(): {
  ask(fileName: string, wrongBefore: boolean): Promise<string | null>;
  element: ReactElement | null;
} {
  const [pending, setPending] = useState<{ id: number; fileName: string; wrongBefore: boolean } | null>(null);
  const resolver = useRef<((v: string | null) => void) | null>(null);
  const counter = useRef(0);

  const finish = useCallback((value: string | null) => {
    const r = resolver.current;
    resolver.current = null;
    setPending(null);
    r?.(value);
  }, []);

  const ask = useCallback((fileName: string, wrongBefore: boolean) => {
    // A new ask supersedes a pending one.
    resolver.current?.(null);
    return new Promise<string | null>((resolve) => {
      resolver.current = resolve;
      counter.current += 1;
      setPending({ id: counter.current, fileName, wrongBefore });
    });
  }, []);

  useEffect(
    () => () => {
      const r = resolver.current;
      resolver.current = null;
      r?.(null);
    },
    [],
  );

  const element = pending ? (
    <PasswordPrompt
      key={pending.id}
      visible
      fileName={pending.fileName}
      wrongBefore={pending.wrongBefore}
      onSubmit={finish}
      onSkip={() => finish(null)}
    />
  ) : null;
  return { ask, element };
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  card: { borderRadius: 12, padding: 16 },
  title: { fontSize: 17, fontWeight: '600', marginBottom: 8 },
  body: { fontSize: 15, marginBottom: 12 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  wrong: { fontSize: 14, marginTop: 8 },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 16 },
  button: { paddingHorizontal: 12, paddingVertical: 10 },
  buttonText: { fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.4 },
});

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    container: { backgroundColor: c.backdrop },
    card: { backgroundColor: c.surface },
    title: { color: c.text },
    body: { color: c.textMuted },
    input: { color: c.text, borderColor: c.border },
    wrong: { color: c.danger },
    skipText: { color: c.textMuted },
    openText: { color: c.primary },
  });
