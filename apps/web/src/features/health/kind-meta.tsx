import type { MemoryKind } from "@caretalk/contracts/health";
import {
  Activity,
  CalendarDays,
  FileText,
  HelpCircle,
  Pill,
  Stethoscope,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

export type KindMeta = {
  label: string;
  icon: LucideIcon;
  badgeClass: string;
};

// Low-saturation, differentiated hues per kind. Same mapping used everywhere
// a kind shows up (chat chips, memory rail, manual add form) so the taxonomy
// stays legible without competing with the teal accent.
export const kindMeta: Record<MemoryKind, KindMeta> = {
  measurement: {
    label: "Measurement",
    icon: Activity,
    badgeClass: "bg-teal-600/10 text-teal-800 dark:bg-teal-400/10 dark:text-teal-300",
  },
  medication: {
    label: "Medication",
    icon: Pill,
    badgeClass: "bg-indigo-600/10 text-indigo-800 dark:bg-indigo-400/10 dark:text-indigo-300",
  },
  symptom: {
    label: "Symptom",
    icon: TriangleAlert,
    badgeClass: "bg-amber-600/10 text-amber-800 dark:bg-amber-400/10 dark:text-amber-300",
  },
  event: {
    label: "Event",
    icon: CalendarDays,
    badgeClass: "bg-stone-600/10 text-stone-800 dark:bg-stone-400/10 dark:text-stone-300",
  },
  appointment: {
    label: "Appointment",
    icon: Stethoscope,
    badgeClass: "bg-violet-600/10 text-violet-800 dark:bg-violet-400/10 dark:text-violet-300",
  },
  question: {
    label: "Question",
    icon: HelpCircle,
    badgeClass: "bg-rose-600/10 text-rose-800 dark:bg-rose-400/10 dark:text-rose-300",
  },
  note: {
    label: "Note",
    icon: FileText,
    badgeClass: "bg-neutral-600/10 text-neutral-800 dark:bg-neutral-400/10 dark:text-neutral-300",
  },
};

export const memoryKinds = Object.keys(kindMeta) as MemoryKind[];

export function formatDate(value: string | null): string {
  if (!value) return "Undated";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
