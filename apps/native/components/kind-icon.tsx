import type { MemoryKind } from "@caretalk/contracts/health";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Image } from "expo-image";

// One glyph per kind, rendered in ink rather than in a coloured badge.
//
// The old design gave every kind its own tinted circle, which meant six colours
// competing with the one colour that carries meaning here (teal = saved to
// memory). Kind is a quiet distinction; it gets shape, not hue.
//
// SF Symbols on iOS because they're the platform's own vocabulary and optically
// match the system font at any weight. Android falls back to Material
// Community, whose set covers the same medical concepts.

const SF: Record<MemoryKind, string> = {
  measurement: "waveform.path.ecg",
  medication: "pills",
  symptom: "thermometer.medium",
  event: "flag",
  appointment: "calendar",
  question: "questionmark.circle",
  note: "text.alignleft",
};

const MATERIAL: Record<MemoryKind, keyof typeof MaterialCommunityIcons.glyphMap> = {
  measurement: "pulse",
  medication: "pill",
  symptom: "thermometer",
  event: "flag-outline",
  appointment: "calendar-blank-outline",
  question: "help-circle-outline",
  note: "text-short",
};

export function KindIcon({
  kind,
  color,
  size = 14,
}: {
  kind: MemoryKind;
  color: string;
  size?: number;
}) {
  if (process.env.EXPO_OS === "ios") {
    return (
      <Image
        source={`sf:${SF[kind] ?? SF.note}`}
        tintColor={color as string}
        style={{ width: size, height: size }}
        accessibilityLabel={kind}
      />
    );
  }

  return (
    <MaterialCommunityIcons
      name={MATERIAL[kind] ?? MATERIAL.note}
      size={size}
      color={color}
      accessibilityLabel={kind}
    />
  );
}

/** Generic SF Symbol with a Material fallback, for chrome outside the kind set. */
export function Glyph({
  sf,
  md,
  color,
  size = 16,
}: {
  sf: string;
  md: keyof typeof MaterialCommunityIcons.glyphMap;
  color: string;
  size?: number;
}) {
  if (process.env.EXPO_OS === "ios") {
    return (
      <Image source={`sf:${sf}`} tintColor={color as string} style={{ width: size, height: size }} />
    );
  }
  return <MaterialCommunityIcons name={md} size={size} color={color} />;
}
