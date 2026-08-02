// Shared UI primitives for "The Thread".
//
// Screens compose these instead of hand-rolling controls, so spacing, radii,
// press states and haptics stay consistent. Two rules the primitives enforce:
// accent colour is never used for chrome (it means "saved to memory"), and
// every figure that could appear in a column is set in tabular numerals.

// SDK 55 still routes these through @react-navigation/native; the
// expo-router/react-navigation re-export only lands in SDK 56.
import { useTheme as useNavTheme } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from "react-native";

import { Glyph } from "@/components/kind-icon";
import { radius, space, type, type AppTheme } from "@/theme/tokens";

export function useTheme(): AppTheme {
  return useNavTheme().colors as unknown as AppTheme;
}

/** Light tap. iOS only — Android's generic vibration reads as an error buzz. */
export function tap(style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) {
  if (process.env.EXPO_OS === "ios") void Haptics.impactAsync(style);
}

/** Reserved for the moment a fact enters memory — the product's thesis. */
export function notifySaved() {
  if (process.env.EXPO_OS === "ios") {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/** Tracked-out uppercase. The only place letterspacing is spent. */
export function Eyebrow({ children, color }: { children: ReactNode; color?: string }) {
  const theme = useTheme();
  return (
    <Text style={[type.eyebrow, { color: color ?? theme.textFaint, textTransform: "uppercase" }]}>
      {children}
    </Text>
  );
}

/**
 * A measurement set as display type: figure large in tabular numerals, unit
 * small beside it. This pairing is the app's typographic voice — the data is
 * the display face, so no decorative headline is needed to carry personality.
 */
export function Reading({
  value,
  unit,
  color,
  size = "lg",
}: {
  value: string;
  unit?: string | null;
  color?: string;
  size?: "lg" | "sm";
}) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
      <Text selectable style={[size === "lg" ? type.reading : type.figure, { color: color ?? theme.text }]}>
        {value}
      </Text>
      {unit ? <Text style={[type.unit, { color: theme.textFaint }]}>{unit}</Text> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

export function Button({
  title,
  onPress,
  variant = "primary",
  loading,
  disabled,
  icon,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
  disabled?: boolean;
  icon?: { sf: string; md: string };
  style?: ViewStyle;
}) {
  const theme = useTheme();
  const inert = disabled || loading;

  const background =
    variant === "primary" ? theme.accent : variant === "secondary" ? theme.raised : "transparent";
  const foreground =
    variant === "primary"
      ? theme.onAccent
      : variant === "danger"
        ? theme.danger
        : variant === "ghost"
          ? theme.textMuted
          : theme.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inert, busy: loading }}
      disabled={inert}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [
        {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: space.sm,
          minHeight: 46,
          paddingHorizontal: space.lg,
          borderRadius: radius.md,
          borderCurve: "continuous",
          backgroundColor: background,
          borderWidth: variant === "secondary" ? 1 : 0,
          borderColor: theme.border,
          opacity: inert ? 0.45 : pressed ? 0.82 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={foreground as string} size="small" />
      ) : (
        <>
          {icon ? <Glyph sf={icon.sf} md={icon.md as never} color={foreground} size={16} /> : null}
          <Text style={[type.bodyStrong, { color: foreground }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  hint,
  ...props
}: TextInputProps & { label?: string; hint?: string }) {
  const theme = useTheme();

  return (
    <View style={{ gap: space.sm }}>
      {label ? <Eyebrow>{label}</Eyebrow> : null}
      <TextInput
        placeholderTextColor={theme.textFaint}
        {...props}
        style={[
          type.body,
          {
            color: theme.text,
            backgroundColor: theme.raised,
            borderWidth: 1,
            borderColor: theme.border,
            borderRadius: radius.md,
            borderCurve: "continuous",
            paddingHorizontal: space.md,
            paddingVertical: space.md,
            minHeight: 46,
          },
          props.multiline ? { minHeight: 104, textAlignVertical: "top" } : null,
          props.style,
        ]}
      />
      {hint ? (
        <Text selectable style={[type.caption, { color: theme.textFaint }]}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

export function Card({
  children,
  style,
  inset = true,
}: {
  children: ReactNode;
  style?: ViewStyle;
  inset?: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: theme.raised,
          borderWidth: 1,
          borderColor: theme.border,
          borderRadius: radius.lg,
          borderCurve: "continuous",
          padding: inset ? space.lg : 0,
          gap: space.md,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: space.md, paddingVertical: space.xl, alignItems: "flex-start" }}>
      <Text style={[type.title, { color: theme.text }]}>{title}</Text>
      <Text style={[type.body, { color: theme.textMuted }]}>{body}</Text>
      {action}
    </View>
  );
}

export function ErrorNote({ message }: { message: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        gap: space.sm,
        padding: space.md,
        borderRadius: radius.md,
        borderCurve: "continuous",
        borderWidth: 1,
        borderColor: theme.danger,
        backgroundColor: theme.raised,
      }}
    >
      <Glyph sf="exclamationmark.triangle" md="alert-outline" color={theme.danger} size={16} />
      <Text selectable style={[type.callout, { color: theme.danger, flex: 1 }]}>
        {message}
      </Text>
    </View>
  );
}

export function Divider() {
  const theme = useTheme();
  return <View style={{ height: 1, backgroundColor: theme.border }} />;
}

/** Row that presses like a native list cell. */
export function Row({
  children,
  onPress,
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
}) {
  const theme = useTheme();
  if (!onPress) return <View style={style}>{children}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [{ backgroundColor: pressed ? theme.sunken : "transparent" }, style]}
    >
      {children}
    </Pressable>
  );
}
