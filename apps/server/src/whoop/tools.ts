import { badRequest } from "../lib/http-error";
import { healthRepository } from "../repositories/health-repository";
import { whoopRepository } from "./repository";
import { addDays, buildDailySummary } from "./summary";
import { METRIC_KEYS } from "./types";

// What the MCP tools and the context block call. Plain functions so they're
// testable without an MCP transport; server.ts only adapts them.

const MAX_RANGE_DAYS = 366;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const EXTRA_KEYS = ["weightKg", "caloriesKcal", "exercised"] as const;
const ALL_KEYS = [...METRIC_KEYS, ...EXTRA_KEYS] as const;
export type DailyMetricField = (typeof ALL_KEYS)[number];
export const DAILY_METRIC_FIELDS = ALL_KEYS;

function daysBetween(from: string, to: string) {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
}

export async function getDailyMetricsForCaller(
  userId: string,
  workspaceId: string,
  input: { from: string; to: string; metrics?: DailyMetricField[] },
) {
  await healthRepository.getWorkspace(userId, workspaceId);
  const { from, to } = input;
  if (!DATE.test(from) || !DATE.test(to)) throw badRequest("from and to must be YYYY-MM-DD dates.");
  if (from > to) throw badRequest("from must be on or before to.");
  if (daysBetween(from, to) > MAX_RANGE_DAYS) throw badRequest(`Ask for at most ${MAX_RANGE_DAYS} days at a time.`);

  const fields: readonly DailyMetricField[] = input.metrics?.length ? input.metrics : ALL_KEYS;
  const rows = await whoopRepository.getDailyMetrics(workspaceId, from, to);
  // Nulls are dropped per row: a partly-scored day reads as "no value" rather
  // than a wall of nulls the model has to wade through.
  const days = rows.map((row) => {
    const out: Record<string, string | number | boolean> = { date: row.date, source: row.source };
    for (const field of fields) {
      const value = row[field];
      if (value !== null && value !== undefined) out[field] = value;
    }
    return out as { date: string; source: string } & Partial<Record<DailyMetricField, number | boolean>>;
  });
  return { from, to, days };
}

/** The context block for a workspace, or null when it has no WHOOP connection. */
export async function dailySummaryForWorkspace(workspaceId: string, today: string): Promise<string[] | null> {
  const connection = await whoopRepository.getConnectionForWorkspace(workspaceId);
  if (!connection) return null;
  const rows = (await whoopRepository.getDailyMetrics(workspaceId, addDays(today, -13), today)).filter((r) => r.source === "whoop");
  return buildDailySummary(rows, today, connection.status);
}

