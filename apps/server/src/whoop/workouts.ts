import { db } from "@caretalk/db";
import { whoopRecords } from "@caretalk/db/schema/devices";
import { and, eq, gte, lt } from "drizzle-orm";

import { badRequest } from "../lib/http-error";
import { resolveTimeZone } from "../lib/time";
import { healthRepository } from "../repositories/health-repository";
import { localDate } from "./metrics";
import { whoopRepository } from "./repository";

// Per-workout heart-rate detail from WHOOP. The public API has no continuous
// heart-rate stream; per workout it gives average/max HR and time in zones
// 0–5, which is what this exposes for the dashboard.

export type WorkoutSummary = {
  id: string;
  date: string;
  start: string;
  durationMinutes: number | null;
  sport: string;
  strain: number | null;
  avgHr: number | null;
  maxHr: number | null;
  /** Minutes in zones 0–5, index = zone. */
  zoneMinutes: [number, number, number, number, number, number];
};

const ZONE_KEYS = ["zone_zero_milli", "zone_one_milli", "zone_two_milli", "zone_three_milli", "zone_four_milli", "zone_five_milli"] as const;
const MAX_RANGE_DAYS = 366;

const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

function titleCase(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function summarizeWorkout(payload: any, timeZone: string): WorkoutSummary | null {
  if (payload?.score_state !== "SCORED" || !payload.score || !payload.start) return null;
  const score = payload.score;
  const zones = score.zone_durations ?? {};
  const startMs = Date.parse(payload.start);
  const endMs = payload.end ? Date.parse(payload.end) : NaN;
  return {
    id: String(payload.id),
    date: localDate(payload.start, timeZone),
    start: new Date(startMs).toISOString(),
    durationMinutes: Number.isFinite(endMs) ? Math.round((endMs - startMs) / 60_000) : null,
    sport: titleCase(String(payload.sport_name ?? "Workout")),
    strain: num(score.strain),
    avgHr: num(score.average_heart_rate),
    maxHr: num(score.max_heart_rate),
    zoneMinutes: ZONE_KEYS.map((key) => Math.round((num(zones[key]) ?? 0) / 60_000)) as WorkoutSummary["zoneMinutes"],
  };
}

/** The owner's scored WHOOP workouts with local dates in [from, to], newest first. */
export async function listWorkoutsForCaller(userId: string, workspaceId: string, from: string, to: string): Promise<WorkoutSummary[]> {
  await healthRepository.getWorkspace(userId, workspaceId);
  if (from > to) throw badRequest("from must be on or before to.");
  if ((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 > MAX_RANGE_DAYS) {
    throw badRequest(`Ask for at most ${MAX_RANGE_DAYS} days at a time.`);
  }
  const connection = await whoopRepository.getConnectionForWorkspace(workspaceId);
  if (!connection) return [];
  const timeZone = resolveTimeZone(null);
  // A day of slack on each side in UTC, then filter by the exact local date.
  const rows = await db
    .select({ payload: whoopRecords.payload })
    .from(whoopRecords)
    .where(
      and(
        eq(whoopRecords.connectionId, connection.id),
        eq(whoopRecords.type, "workout"),
        gte(whoopRecords.startsAt, new Date(Date.parse(`${from}T00:00:00Z`) - 86_400_000)),
        lt(whoopRecords.startsAt, new Date(Date.parse(`${to}T00:00:00Z`) + 2 * 86_400_000)),
      ),
    );
  return rows
    .map((row) => summarizeWorkout(row.payload, timeZone))
    .filter((w): w is WorkoutSummary => w !== null && w.date >= from && w.date <= to)
    .sort((a, b) => b.start.localeCompare(a.start));
}
