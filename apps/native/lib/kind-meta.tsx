import type { MemoryKind } from "@caretalk/contracts/health";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";

import { useColorScheme } from "@/lib/use-color-scheme";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

export type KindMeta = {
  label: string;
  icon: IoniconName;
  bg: string;
  fg: string;
};

// Kind hues exist to make a long timeline scannable — you should be able to
// pick medication changes out of a year of entries without reading. They lean
// warm to sit on the app's paper canvas, with the brand teal reserved for
// measurements (the most common kind).
//
// Two records rather than one: a fixed foreground would be unreadable in one
// of the two schemes. Use `useKindMeta()` in components.
export const kindMeta: Record<MemoryKind, KindMeta> = {
  measurement: { label: "Measurement", icon: "pulse-outline", bg: "rgba(15,118,110,0.12)", fg: "#0f766e" },
  medication: { label: "Medication", icon: "medkit-outline", bg: "rgba(126,34,206,0.12)", fg: "#7e22ce" },
  symptom: { label: "Symptom", icon: "warning-outline", bg: "rgba(194,65,12,0.12)", fg: "#c2410c" },
  event: { label: "Event", icon: "calendar-outline", bg: "rgba(87,83,78,0.12)", fg: "#57534e" },
  appointment: { label: "Appointment", icon: "medical-outline", bg: "rgba(161,98,7,0.12)", fg: "#a16207" },
  question: { label: "Question", icon: "help-circle-outline", bg: "rgba(190,18,60,0.12)", fg: "#be123c" },
  note: { label: "Note", icon: "document-text-outline", bg: "rgba(120,113,108,0.12)", fg: "#78716c" },
};

export const kindMetaDark: Record<MemoryKind, KindMeta> = {
  measurement: { label: "Measurement", icon: "pulse-outline", bg: "rgba(94,234,212,0.14)", fg: "#5eead4" },
  medication: { label: "Medication", icon: "medkit-outline", bg: "rgba(216,180,254,0.14)", fg: "#d8b4fe" },
  symptom: { label: "Symptom", icon: "warning-outline", bg: "rgba(253,186,116,0.14)", fg: "#fdba74" },
  event: { label: "Event", icon: "calendar-outline", bg: "rgba(214,211,209,0.12)", fg: "#d6d3d1" },
  appointment: { label: "Appointment", icon: "medical-outline", bg: "rgba(252,211,77,0.14)", fg: "#fcd34d" },
  question: { label: "Question", icon: "help-circle-outline", bg: "rgba(253,164,175,0.14)", fg: "#fda4af" },
  note: { label: "Note", icon: "document-text-outline", bg: "rgba(214,211,209,0.10)", fg: "#c7c2bb" },
};

export function useKindMeta(): Record<MemoryKind, KindMeta> {
  const { colorScheme } = useColorScheme();
  return colorScheme === "dark" ? kindMetaDark : kindMeta;
}

export const memoryKinds = Object.keys(kindMeta) as MemoryKind[];

export function formatDate(value: string | null): string {
  if (!value) return "Undated";
  const parts = value.split("-").map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (!year || !month || !day) return value;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// "Today" / "Yesterday" / "March 3, 2026" — timeline group headers read as
// human time, not ISO strings.
export function formatGroupDate(value: string | null, today = new Date()): string {
  if (!value) return "Undated";
  const parts = value.split("-").map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (!year || !month || !day) return value;

  const date = new Date(Date.UTC(year, month - 1, day));
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.round((todayUtc - date.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";

  return date.toLocaleDateString(undefined, {
    year: date.getUTCFullYear() === today.getFullYear() ? undefined : "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
