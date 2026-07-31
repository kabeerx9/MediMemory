// Shared UI primitives. Screens compose these instead of hand-rolling
// buttons/cards, so spacing, radii, press states and safe-area handling stay
// consistent across the app.

import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  type TextStyle,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { type AppTheme, darkTheme, lightTheme, radius, space, type } from "@/lib/theme";
import { useColorScheme } from "@/lib/use-color-scheme";

export function useTheme(): AppTheme {
  const { colorScheme } = useColorScheme();
  return colorScheme === "dark" ? darkTheme : lightTheme;
}

/**
 * Safe-area aware screen container.
 *
 * Screens pushed onto a Stack with a header only need the bottom inset — the
 * header already clears the notch. Headerless screens pass `edges` including
 * "top". Never hardcode a status-bar height.
 */
export function Screen({
  children,
  edges = ["bottom"],
  scroll = false,
  contentStyle,
  style,
}: {
  children: ReactNode;
  edges?: Array<"top" | "bottom">;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const pad = {
    paddingTop: edges.includes("top") ? insets.top : 0,
    paddingBottom: edges.includes("bottom") ? insets.bottom : 0,
  };

  if (scroll) {
    return (
      <ScrollView
        style={[{ flex: 1, backgroundColor: theme.canvas }, style]}
        contentContainerStyle={[
          { padding: space.lg, paddingBottom: pad.paddingBottom + space.xxl, gap: space.lg },
          contentStyle,
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    );
  }

  return (
    <View style={[{ flex: 1, backgroundColor: theme.canvas }, pad, style]}>{children}</View>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  label,
  onPress,
  variant = "primary",
  icon,
  loading = false,
  disabled = false,
  full = false,
  style,
  ...rest
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
} & Omit<PressableProps, "style" | "children" | "onPress" | "disabled">) {
  const theme = useTheme();
  const isDisabled = disabled || loading;

  const surface: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: theme.primary, fg: theme.onPrimary },
    secondary: { bg: "transparent", fg: theme.text, border: theme.border },
    ghost: { bg: "transparent", fg: theme.primary },
    danger: { bg: theme.dangerSoft, fg: theme.danger },
  };
  const s = surface[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: variant === "primary" && pressed ? theme.primaryPressed : s.bg,
          borderColor: s.border ?? "transparent",
          borderWidth: s.border ? 1 : 0,
          opacity: isDisabled ? 0.45 : pressed && variant !== "primary" ? 0.6 : 1,
          alignSelf: full ? "stretch" : "flex-start",
        },
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={s.fg} size="small" />
      ) : (
        <>
          {icon ? <Ionicons color={s.fg} name={icon} size={17} /> : null}
          <Text style={[type.bodyStrong as TextStyle, { color: s.fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Card({
  children,
  style,
  muted = false,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  muted?: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: muted ? theme.surfaceMuted : theme.surface, borderColor: theme.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function PressableCard({
  children,
  onPress,
  style,
}: {
  children: ReactNode;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: pressed ? theme.surfaceMuted : theme.surface,
          borderColor: theme.border,
        },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

export function Field({
  label,
  hint,
  style,
  ...inputProps
}: { label?: string; hint?: string; style?: StyleProp<ViewStyle> } & TextInputProps) {
  const theme = useTheme();
  return (
    <View style={[{ gap: space.sm }, style]}>
      {label ? (
        <Text style={[type.label as TextStyle, { color: theme.textMuted }]}>{label}</Text>
      ) : null}
      <TextInput
        placeholderTextColor={theme.textFaint}
        style={[
          styles.input,
          type.body as TextStyle,
          {
            backgroundColor: theme.surface,
            borderColor: theme.hairline,
            color: theme.text,
            minHeight: inputProps.multiline ? 120 : 48,
            textAlignVertical: inputProps.multiline ? "top" : "center",
          },
        ]}
        {...inputProps}
      />
      {hint ? (
        <Text style={[type.caption as TextStyle, { color: theme.textFaint }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <Text style={[type.eyebrow as TextStyle, { color: theme.textMuted, textTransform: "uppercase" }]}>
      {children}
    </Text>
  );
}

export function EmptyState({
  icon = "sparkles-outline",
  title,
  body,
  action,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: theme.primarySoft }]}>
        <Ionicons color={theme.primary} name={icon} size={22} />
      </View>
      <Text style={[type.title as TextStyle, { color: theme.text, textAlign: "center" }]}>
        {title}
      </Text>
      <Text
        style={[
          type.callout as TextStyle,
          { color: theme.textMuted, textAlign: "center", maxWidth: 300 },
        ]}
      >
        {body}
      </Text>
      {action ? <View style={{ marginTop: space.sm }}>{action}</View> : null}
    </View>
  );
}

export function ErrorNote({ message }: { message: string }) {
  const theme = useTheme();
  return (
    <View
      style={[styles.errorNote, { backgroundColor: theme.dangerSoft, borderColor: theme.danger }]}
    >
      <Ionicons color={theme.danger} name="alert-circle-outline" size={16} />
      <Text style={[type.callout as TextStyle, { color: theme.danger, flex: 1 }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    minHeight: 50,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
  },
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.xs,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  empty: {
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.xxl,
    paddingHorizontal: space.lg,
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  errorNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
  },
});
