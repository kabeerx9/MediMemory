import { todayIn } from "../lib/time";
import { METRIC_KEYS, type DailyMetricValues, type RawRecord } from "./types";

// WHOOP records → one row of numbers per local calendar day.
//
// The day a number belongs to is the day you'd look for it in the WHOOP app:
//   - main sleep and its recovery → the morning you woke up (sleep end)
//   - a cycle (strain, kJ, steps) → that same wake-up day. Cycles start at
//     sleep onset, so dating by cycle start would push most days' strain onto
//     the previous evening's date. A cycle whose sleep hasn't landed yet is
//     dated by start + 12h, which lands on the right day for any onset
//     between noon and midnight.
//   - workouts → the day they started
// Naps never count, and nothing unscored contributes: those fields stay null
// until a later sync re-fetches the scored record.

const HALF_DAY_MS = 12 * 60 * 60 * 1000;

export function localDate(iso: string, timeZone: string): string {
  return todayIn(timeZone, new Date(iso));
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function emptyDay(): DailyMetricValues {
  return Object.fromEntries(METRIC_KEYS.map((key) => [key, null])) as DailyMetricValues;
}

const scored = (record: RawRecord) => record.payload?.score_state === "SCORED" && record.payload?.score;

function sleepMinutes(score: any): number | null {
  const stages = score?.stage_summary;
  const parts = [stages?.total_light_sleep_time_milli, stages?.total_slow_wave_sleep_time_milli, stages?.total_rem_sleep_time_milli].map(num);
  if (parts.some((part) => part === null)) return null;
  return Math.round((parts as number[]).reduce((sum, part) => sum + part, 0) / 60_000);
}

export function computeDailyMetrics(records: RawRecord[], timeZone: string): Map<string, DailyMetricValues> {
  const days = new Map<string, DailyMetricValues>();
  const day = (date: string) => {
    let values = days.get(date);
    if (!values) days.set(date, (values = emptyDay()));
    return values;
  };

  // Main sleeps date everything else, scored or not — an unscored sleep still
  // says which morning its cycle belongs to.
  const mainSleeps = records.filter((r) => r.type === "sleep" && r.payload?.nap === false && r.payload?.end);
  const sleepDateById = new Map<string, string>();
  const sleepDateByCycle = new Map<string, string>();
  for (const sleep of mainSleeps) {
    const date = localDate(sleep.payload.end, timeZone);
    sleepDateById.set(String(sleep.payload.id ?? sleep.whoopId), date);
    if (sleep.payload.cycle_id != null) sleepDateByCycle.set(String(sleep.payload.cycle_id), date);
  }

  // Longest scored main sleep per day wins.
  const bestSleep = new Map<string, { inBed: number; score: any }>();
  for (const sleep of mainSleeps.filter(scored)) {
    const date = localDate(sleep.payload.end, timeZone);
    const inBed = num(sleep.payload.score.stage_summary?.total_in_bed_time_milli) ?? 0;
    const current = bestSleep.get(date);
    if (!current || inBed > current.inBed) bestSleep.set(date, { inBed, score: sleep.payload.score });
  }
  for (const [date, { score }] of bestSleep) {
    const values = day(date);
    values.sleepMinutes = sleepMinutes(score);
    values.sleepPerformancePct = num(score.sleep_performance_percentage);
    values.sleepEfficiencyPct = num(score.sleep_efficiency_percentage);
    values.respiratoryRate = num(score.respiratory_rate);
  }

  for (const recovery of records.filter((r) => r.type === "recovery" && scored(r))) {
    const date = sleepDateById.get(String(recovery.payload.sleep_id));
    if (!date) continue;
    const score = recovery.payload.score;
    const values = day(date);
    values.recoveryScore = num(score.recovery_score);
    values.hrvMs = num(score.hrv_rmssd_milli);
    values.restingHr = num(score.resting_heart_rate);
    values.spo2Pct = num(score.spo2_percentage);
    values.skinTempC = num(score.skin_temp_celsius);
  }

  for (const cycle of records.filter((r) => r.type === "cycle" && scored(r) && r.payload?.start)) {
    const date =
      sleepDateByCycle.get(String(cycle.payload.id ?? cycle.whoopId)) ??
      localDate(new Date(Date.parse(cycle.payload.start) + HALF_DAY_MS).toISOString(), timeZone);
    const score = cycle.payload.score;
    const values = day(date);
    values.strain = num(score.strain);
    values.kilojoules = num(score.kilojoule);
    values.avgHr = num(score.average_heart_rate);
    values.maxHr = num(score.max_heart_rate);
    values.steps = num(cycle.payload.step_count);
  }

  for (const workout of records.filter((r) => r.type === "workout" && scored(r) && r.payload?.start)) {
    const values = day(localDate(workout.payload.start, timeZone));
    values.workoutCount = (values.workoutCount ?? 0) + 1;
    const strain = num(workout.payload.score.strain);
    if (strain !== null) values.workoutStrainMax = Math.max(values.workoutStrainMax ?? strain, strain);
  }

  return days;
}
