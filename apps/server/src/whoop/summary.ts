// The short "how has the body been doing" block every chat gets for free.
// Deliberately small (~5 lines): it's injected into every get_workspace_context
// call, and its job is to make the model notice a trend worth pulling the
// detail for with get_daily_metrics — not to replace that tool.

export type SummaryRow = {
  date: string;
  recoveryScore: number | null;
  hrvMs: number | null;
  restingHr: number | null;
  sleepMinutes: number | null;
  strain: number | null;
};

const WINDOW_DAYS = 7;
// Changes smaller than this (relative) read as flat — day-to-day noise in
// HRV and recovery is large, and an arrow on every 1% wiggle would be noise.
const FLAT_THRESHOLD = 0.03;

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function average(rows: SummaryRow[], pick: (row: SummaryRow) => number | null): number | null {
  const values = rows.map(pick).filter((v): v is number => v !== null);
  return values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;
}

function describeMetric(label: string, current: number | null, previous: number | null, format: (v: number) => string) {
  if (current === null) return null;
  if (previous === null || previous === 0) return `${label} ${format(current)}`;
  const change = (current - previous) / Math.abs(previous);
  if (Math.abs(change) < FLAT_THRESHOLD) return `${label} ${format(current)} (→)`;
  return `${label} ${format(current)} (${change > 0 ? "↑" : "↓"} from ${format(previous)})`;
}

export function buildDailySummary(rows: SummaryRow[], today: string, status: string): string[] {
  const start = addDays(today, -(WINDOW_DAYS - 1));
  const prevStart = addDays(today, -(2 * WINDOW_DAYS - 1));
  const current = rows.filter((r) => r.date >= start && r.date <= today);
  const previous = rows.filter((r) => r.date >= prevStart && r.date < start);

  const lines = [`## Daily tracking — last ${WINDOW_DAYS} days (WHOOP, ${start} to ${today})`];
  if (status !== "active") {
    lines.push(`- The WHOOP connection ${status === "revoked" ? "was disconnected" : "needs to be reconnected"} — data may be stale. The user can fix it in Caretalk → Connections.`);
  }

  if (current.length === 0) {
    lines.push("- No WHOOP data in the last 7 days.");
    return lines;
  }

  const parts = [
    describeMetric("Recovery", average(current, (r) => r.recoveryScore), average(previous, (r) => r.recoveryScore), (v) => `${Math.round(v)}%`),
    describeMetric("HRV", average(current, (r) => r.hrvMs), average(previous, (r) => r.hrvMs), (v) => `${Math.round(v)} ms`),
    describeMetric("Resting HR", average(current, (r) => r.restingHr), average(previous, (r) => r.restingHr), (v) => `${Math.round(v)} bpm`),
    describeMetric("Sleep", average(current, (r) => r.sleepMinutes), average(previous, (r) => r.sleepMinutes), (v) => `${(v / 60).toFixed(1)} h`),
    describeMetric("Strain", average(current, (r) => r.strain), average(previous, (r) => r.strain), (v) => v.toFixed(1)),
  ].filter(Boolean);

  lines.push(`- 7-day averages vs the 7 days before: ${parts.join(", ")}.`);
  lines.push(`- ${new Set(current.map((r) => r.date)).size} of ${WINDOW_DAYS} days have data.`);
  lines.push("- Call get_daily_metrics for day-by-day values or longer ranges before drawing conclusions.");
  return lines;
}
