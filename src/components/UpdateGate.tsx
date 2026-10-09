import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocale } from "../i18n/LocaleContext";
import { currentAppBuild } from "../native/appBuild";
import { useUpdate } from "../update/UpdateContext";
import type { Palette } from "../theme/palette";
import { useTheme } from "../theme/ThemeContext";

/** Renders the app, plus a blocking overlay for a forced update or a prompt for an optional one. */
export function UpdateGate({ children }: { children?: ReactNode }) {
  const { decision, busy, startUpdate, cancel, snooze } = useUpdate();
  const { t, language } = useLocale();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [hintSeen, setHintSeen] = useState(false);
  const force = decision.kind === "force";

  useEffect(() => {
    if (!force) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, [force]);

  useEffect(() => {
    if (decision.kind !== "optional") return;
    Alert.alert(t.update.optionalTitle, t.update.optionalBody, [
      { text: t.update.later, style: "cancel", onPress: () => void snooze() },
      { text: t.update.updateNow, onPress: () => void startUpdate() },
    ]);
    // One prompt per check result; the decision object changes with every check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decision]);

  const size = decision.target?.size;
  const mb = size ? Math.max(1, Math.round(size / (1024 * 1024))) : undefined;
  const { version, build } = currentAppBuild();

  function press() {
    setHintSeen(true);
    void startUpdate();
  }

  return (
    <>
      <View
        style={styles.content}
        importantForAccessibility={force ? "no-hide-descendants" : "auto"}
        accessibilityElementsHidden={force}
      >
        {children}
      </View>
      {force ? (
        <View style={styles.overlay} accessibilityViewIsModal>
          <Text style={styles.title}>{t.update.forceTitle}</Text>
          <Text style={styles.body}>
            {decision.message?.[language] ?? t.update.forceBody}
          </Text>
          <Text style={styles.meta}>{t.update.current(version, build)}</Text>
          {Platform.OS === "android" && !hintSeen && !busy ? (
            <Text style={styles.meta}>{t.update.installHint}</Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            style={[styles.button, busy && styles.disabled]}
            onPress={press}
          >
            <Text style={styles.buttonText}>{t.update.updateNow}</Text>
          </Pressable>
          {busy ? (
            <View style={styles.busy}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.meta}>{t.update.downloading(mb)}</Text>
              <Pressable accessibilityRole="button" onPress={cancel}>
                <Text style={styles.link}>{t.common.cancel}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}
      {!force && busy ? (
        <View
          testID="update-banner-host"
          style={styles.bannerHost}
          pointerEvents="box-none"
        >
          <View style={styles.banner}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.bannerText}>{t.update.downloading(mb)}</Text>
            <Pressable accessibilityRole="button" onPress={cancel} hitSlop={8}>
              <Text style={styles.link}>{t.common.cancel}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    content: { flex: 1 },
    overlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: c.background,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      gap: 16,
    },
    title: {
      fontSize: 22,
      fontWeight: "700",
      color: c.text,
      textAlign: "center",
    },
    body: { fontSize: 16, color: c.text, textAlign: "center" },
    meta: { fontSize: 14, color: c.textMuted, textAlign: "center" },
    button: {
      backgroundColor: c.primary,
      paddingVertical: 14,
      paddingHorizontal: 32,
      borderRadius: 8,
    },
    buttonText: { color: c.onPrimary, fontSize: 16, fontWeight: "600" },
    disabled: { opacity: 0.5 },
    link: { fontSize: 14, fontWeight: "600", color: c.primary },
    bannerHost: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      padding: 16,
    },
    banner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 12,
      borderRadius: 8,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    bannerText: { flex: 1, fontSize: 14, color: c.text },
    busy: { alignItems: "center", gap: 8 },
  });
