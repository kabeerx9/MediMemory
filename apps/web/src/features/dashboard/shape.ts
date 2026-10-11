import type { Memory } from "@caretalk/contracts/health";

// Pure data shaping for the dashboard: everything the charts and the glance
// row compute, kept out of the components so it can be tested on its own.

export type DayRow = { date: string; source?: string } & { [metric: string]: number | boolean | string | null | undefined };
export type Point = { date: string; value: number };
export type DateRange = { from: string; to: string };

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The last `days` calendar days, ending today (inclusive). */
export function rangeFor(days: number, today: string): DateRange {
  return { from: addDays(today, -(days - 1)), to: today };
}

export type RecoveryBand = "good" | "warning" | "critical";

/** WHOOP's own bands: green 67–100, yellow 34–66, red 0–33. */
export function recoveryBand(score: number | null | undefined): RecoveryBand | null {
  if (score === null || score === undefined) return null;
  if (score >= 67) return "good";
  if (score >= 34) return "warning";
  return "critical";
}

/**
 * Trailing average over calendar days, not points: a week with three
 * readings averages those three, and a gap doesn't pull older days in.
 */
export function rollingAverage(points: Point[], windowDays: number): Point[] {
  return points.map((point) => {
    const start = addDays(point.date, -(windowDays - 1));
    const window = points.filter((p) => p.date >= start && p.date <= point.date);
    return { date: point.date, value: window.reduce((sum, p) => sum + p.value, 0) / window.length };
  });
}

export function pointsFor(rows: DayRow[], metric: string): Point[] {
  return rows
    .filter((row) => typeof row[metric] === "number")
    .map((row) => ({ date: row.date, value: row[metric] as number }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export type GlanceStat = { date: string; value: number; baseline: number | null; delta: number | null };

/** The latest reading, against the average of the 7 days before it. */
export function glanceStat(rows: DayRow[], metric: string): GlanceStat | null {
  const points = pointsFor(rows, metric);
  const latest = points.at(-1);
  if (!latest) return null;
  const start = addDays(latest.date, -7);
  const before = points.filter((p) => p.date >= start && p.date < latest.date);
  const baseline = before.length ? before.reduce((sum, p) => sum + p.value, 0) / before.length : null;
  return { date: latest.date, value: latest.value, baseline, delta: baseline === null ? null : latest.value - baseline };
}

export type EventMarker = { id: string; date: string; kind: string; content: string };

const MARKER_KINDS = new Set(["medication", "event"]);

/**
 * Dated medication changes and events, for lining up against body data.
 * Superseded rows stay: "dose went from 500 to 1000 on the 8th" is exactly the
 * moment worth seeing, even though the 500 fact is no longer current.
 */
export function eventMarkers(memories: Memory[], range: DateRange): EventMarker[] {
  return memories
    .filter((m) => MARKER_KINDS.has(m.kind) && m.happenedOn && m.happenedOn >= range.from && m.happenedOn <= range.to)
    .map((m) => ({ id: m.id, date: m.happenedOn!, kind: m.kind, content: m.content }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export type MeasurementSeries = { metric: string; unit: string | null; points: Point[] };

/** Charted medical measurements (weight, glucose…) within the range. Current readings only. */
export function measurementSeriesInRange(memories: Memory[], range: DateRange): MeasurementSeries[] {
  const byMetric = new Map<string, MeasurementSeries>();
  for (const m of memories) {
    if (m.supersededById || !m.metric || m.value === null || !m.happenedOn) continue;
    if (m.happenedOn < range.from || m.happenedOn > range.to) continue;
    const series = byMetric.get(m.metric) ?? { metric: m.metric, unit: m.unit, points: [] };
    series.unit ??= m.unit;
    series.points.push({ date: m.happenedOn, value: m.value });
    byMetric.set(m.metric, series);
  }
  return [...byMetric.values()]
    .filter((s) => s.points.length >= 2)
    .map((s) => ({ ...s, points: s.points.sort((a, b) => a.date.localeCompare(b.date)) }))
    .sort((a, b) => a.metric.localeCompare(b.metric));
}

/** WHOOP's day-strain bands on its 0–21 scale. */
export function strainLevel(strain: number): "Light" | "Moderate" | "High" | "All out" {
  if (strain >= 18) return "All out";
  if (strain >= 14) return "High";
  if (strain >= 10) return "Moderate";
  return "Light";
}

/**
 * Round axis values inside [min, max]: steps of 1, 2, 2.5 or 5 × 10ⁿ, picking
 * the step whose tick count lands closest to `target` (ties go to more ticks).
 */
export function niceTicks(min: number, max: number, target = 3): number[] {
  if (!(max > min)) return [min];
  const magnitude = 10 ** Math.floor(Math.log10((max - min) / target));
  let best: number[] = [];
  for (const factor of [1, 2, 2.5, 5, 10]) {
    const step = factor * magnitude;
    const ticks: number[] = [];
    for (let t = Math.ceil(min / step) * step; t <= max + 1e-9; t += step) ticks.push(Number(t.toFixed(10)));
    const better = Math.abs(ticks.length - target) < Math.abs(best.length - target);
    const tieMore = Math.abs(ticks.length - target) === Math.abs(best.length - target) && ticks.length > best.length;
    if (ticks.length >= 2 && (best.length === 0 || better || tieMore)) best = ticks;
  }
  return best.length ? best : [min, max];
}

/** Medications in force: active (not superseded) medication facts, newest first; undated last. */
export function currentMedications(memories: Memory[]): Memory[] {
  return memories
    .filter((m) => m.kind === "medication" && !m.supersededById)
    .sort((a, b) => (b.happenedOn ?? "").localeCompare(a.happenedOn ?? ""));
}

/** Recent events (visits, procedures, diagnoses) from the last `days`, newest first. Medications have their own list. */
export function recentEvents(memories: Memory[], today: string, days: number): Memory[] {
  const from = addDays(today, -(days - 1));
  return memories
    .filter((m) => m.kind === "event" && m.happenedOn && m.happenedOn >= from && m.happenedOn <= today)
    .sort((a, b) => b.happenedOn!.localeCompare(a.happenedOn!));
}

/** Y-axis domain: padded min/max, or `fixed`. A lone reading gets ±10% so the axis reads sensibly. */
export function valueDomain(values: number[], fixed?: [number, number]): [number, number] {
  if (fixed) return fixed;
  if (values.length === 0) return [0, 1];
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    const pad = Math.max(Math.abs(min) * 0.1, 1);
    return [min - pad, max + pad];
  }
  const pad = (max - min) * 0.12;
  min -= pad;
  max += pad;
  return [min, max];
}
