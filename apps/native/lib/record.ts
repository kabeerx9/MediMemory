import type { Memory, MemoryKind } from "@caretalk/contracts/health";

// Shaping the record for display. Kept out of components so the Record tab and
// the Trends tab can't drift into two different ideas of what "a series" or
// "active" means.

export const memoryKinds: MemoryKind[] = [
  "measurement",
  "medication",
  "symptom",
  "event",
  "appointment",
  "question",
  "note",
];

export const kindLabel: Record<MemoryKind, string> = {
  measurement: "Measurement",
  medication: "Medication",
  symptom: "Symptom",
  event: "Event",
  appointment: "Appointment",
  question: "For the doctor",
  note: "Note",
};

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/**
 * Parses a YYYY-MM-DD as a LOCAL calendar date.
 *
 * `new Date("2026-03-14")` parses as UTC midnight, which renders as the 13th
 * anywhere west of Greenwich — the same class of bug the server-side timezone
 * fix addressed. These strings are calendar days, never instants.
 */
function parseDay(value: string): Date | null {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

export function formatDay(value: string | null): string {
  if (!value) return "Undated";
  const date = parseDay(value);
  if (!date) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Month heading on the thread — the year only when it isn't the current one. */
export function formatMonth(value: string | null): string {
  if (!value) return "Undated";
  const date = parseDay(value);
  if (!date) return value;
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, {
    month: "long",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ---------------------------------------------------------------------------
// The thread
// ---------------------------------------------------------------------------

export type ThreadEntry = {
  memory: Memory;
  /** Facts this one replaced, newest first — drawn as forks off its node. */
  superseded: Memory[];
};

export type ThreadSection = { month: string; entries: ThreadEntry[] };

/**
 * Builds the thread: active facts newest-first, each carrying the chain of
 * facts it replaced.
 *
 * The chain is resolved by walking `supersededById` backwards from the active
 * row, so a dose that moved 5 → 10 → 20 renders as one node with two forks
 * rather than three unrelated rows. That chain IS the feature — it's why the
 * schema supersedes instead of updating in place.
 */
export function buildThread(memories: Memory[], showHistory: boolean): ThreadSection[] {
  const byId = new Map(memories.map((memory) => [memory.id, memory]));
  // Who did each row supersede? The link points forward (old → new), so invert.
  const replacedBy = new Map<string, Memory>();
  for (const memory of memories) {
    if (memory.supersededById) replacedBy.set(memory.supersededById, memory);
  }

  const active = memories.filter((memory) => !memory.supersededById);

  const entries: ThreadEntry[] = active.map((memory) => {
    const superseded: Memory[] = [];
    if (showHistory) {
      let previous = replacedBy.get(memory.id);
      // Guard against a cycle in the chain rather than hanging the render.
      let hops = 0;
      while (previous && hops < 50) {
        superseded.push(previous);
        previous = replacedBy.get(previous.id);
        hops += 1;
      }
    }
    return { memory, superseded };
  });

  entries.sort(compareByWhenItHappened);

  const sections: ThreadSection[] = [];
  for (const entry of entries) {
    const month = formatMonth(entry.memory.happenedOn);
    const current = sections[sections.length - 1];
    if (current && current.month === month) {
      current.entries.push(entry);
    } else {
      sections.push({ month, entries: [entry] });
    }
  }

  void byId;
  return sections;
}

// Sorted by when it HAPPENED, not when it was reported — you braindump days
// late, and the record is a history of the person, not of your typing.
// Undated facts sink rather than interleaving at random.
function compareByWhenItHappened(a: ThreadEntry, b: ThreadEntry) {
  const dayA = a.memory.happenedOn;
  const dayB = b.memory.happenedOn;
  if (dayA && dayB && dayA !== dayB) return dayB.localeCompare(dayA);
  if (dayA && !dayB) return -1;
  if (!dayA && dayB) return 1;
  return b.memory.createdAt.localeCompare(a.memory.createdAt);
}

// ---------------------------------------------------------------------------
// Trends
// ---------------------------------------------------------------------------

export type Series = {
  metric: string;
  unit: string | null;
  points: Array<{ date: string; value: number; valueSecondary: number | null }>;
};

const MIN_POINTS = 2;

/**
 * Groups chartable readings by metric, oldest first.
 *
 * Only rows the model tagged with a metric, a numeric value AND a date can be
 * charted. Everything else stays in the record as prose — `content` is
 * authoritative, this is the optional structured shadow.
 */
export function buildSeries(memories: Memory[]): Series[] {
  const byMetric = new Map<string, Series>();

  for (const memory of memories) {
    if (memory.supersededById) continue;
    if (!memory.metric || memory.value === null || !memory.happenedOn) continue;

    const point = {
      date: memory.happenedOn,
      value: memory.value,
      valueSecondary: memory.valueSecondary,
    };
    const existing = byMetric.get(memory.metric);
    if (existing) {
      existing.points.push(point);
      existing.unit ??= memory.unit;
    } else {
      byMetric.set(memory.metric, { metric: memory.metric, unit: memory.unit, points: [point] });
    }
  }

  return Array.from(byMetric.values())
    .map((series) => ({
      ...series,
      points: [...series.points].sort((a, b) => a.date.localeCompare(b.date)),
    }))
    .filter((series) => series.points.length >= MIN_POINTS)
    .sort((a, b) => a.metric.localeCompare(b.metric));
}

export function humanizeMetric(metric: string): string {
  return metric.replace(/_/g, " ").replace(/^\w/, (character) => character.toUpperCase());
}

/** Formats a reading, collapsing a paired value to systolic/diastolic. */
export function formatReading(point: { value: number; valueSecondary: number | null }): string {
  return point.valueSecondary !== null ? `${point.value}/${point.valueSecondary}` : String(point.value);
}
