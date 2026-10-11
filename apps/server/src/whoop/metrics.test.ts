import { describe, expect, it } from "vitest";

import { computeDailyMetrics, localDate } from "./metrics";
import type { RawRecord } from "./types";

const TZ = "Asia/Kolkata";
const MIN = 60_000;

function sleep(id: string, opts: { cycleId: number; start: string; end: string; nap?: boolean; sleepMin?: number; scored?: boolean }): RawRecord {
  const total = (opts.sleepMin ?? 420) * MIN;
  return {
    type: "sleep",
    whoopId: id,
    payload: {
      id,
      cycle_id: opts.cycleId,
      start: opts.start,
      end: opts.end,
      nap: opts.nap ?? false,
      score_state: opts.scored === false ? "PENDING_SCORE" : "SCORED",
      score: {
        stage_summary: {
          total_in_bed_time_milli: total + 30 * MIN,
          total_awake_time_milli: 30 * MIN,
          total_no_data_time_milli: 0,
          total_light_sleep_time_milli: total / 2,
          total_slow_wave_sleep_time_milli: total / 4,
          total_rem_sleep_time_milli: total / 4,
          sleep_cycle_count: 4,
          disturbance_count: 3,
        },
        respiratory_rate: 15.2,
        sleep_performance_percentage: 88,
        sleep_efficiency_percentage: 93,
      },
    },
  };
}

function recovery(sleepId: string, cycleId: number, score: Record<string, unknown> | null, state = "SCORED"): RawRecord {
  return { type: "recovery", whoopId: sleepId, payload: { sleep_id: sleepId, cycle_id: cycleId, score_state: state, score } };
}

function cycle(id: number, start: string, strain = 12.4, steps = 8000): RawRecord {
  return {
    type: "cycle",
    whoopId: String(id),
    payload: {
      id,
      start,
      score_state: "SCORED",
      step_count: steps,
      score: { strain, kilojoule: 9000, average_heart_rate: 70, max_heart_rate: 160 },
    },
  };
}

function workout(id: string, start: string, strain: number, state = "SCORED"): RawRecord {
  return { type: "workout", whoopId: id, payload: { id, start, score_state: state, score: { strain } } };
}

const fullRecovery = { recovery_score: 67, hrv_rmssd_milli: 54.3, resting_heart_rate: 58, spo2_percentage: 96.5, skin_temp_celsius: 33.4 };

describe("localDate", () => {
  it("uses the IST calendar day, not UTC", () => {
    // 19:00Z is 00:30 the next day in IST.
    expect(localDate("2026-10-10T19:00:00Z", TZ)).toBe("2026-10-11");
  });
});

describe("computeDailyMetrics", () => {
  it("dates a sleep and its recovery by the IST wake-up day", () => {
    const records = [
      sleep("s1", { cycleId: 1, start: "2026-10-10T13:00:00Z", end: "2026-10-10T19:00:00Z" }),
      recovery("s1", 1, fullRecovery),
    ];
    const day = computeDailyMetrics(records, TZ).get("2026-10-11");
    expect(day?.recoveryScore).toBe(67);
    expect(day?.hrvMs).toBe(54.3);
    expect(day?.sleepMinutes).toBe(420);
    expect(day?.sleepPerformancePct).toBe(88);
  });

  it("ignores naps", () => {
    const records = [sleep("nap", { cycleId: 1, start: "2026-10-11T08:00:00Z", end: "2026-10-11T08:40:00Z", nap: true })];
    expect(computeDailyMetrics(records, TZ).size).toBe(0);
  });

  it("uses the longest main sleep when a day has two", () => {
    const records = [
      sleep("short", { cycleId: 1, start: "2026-10-10T17:00:00Z", end: "2026-10-10T20:00:00Z", sleepMin: 150 }),
      sleep("long", { cycleId: 1, start: "2026-10-10T21:00:00Z", end: "2026-10-11T02:00:00Z", sleepMin: 280 }),
    ];
    expect(computeDailyMetrics(records, TZ).get("2026-10-11")?.sleepMinutes).toBe(280);
  });

  it("ignores records that aren't scored yet", () => {
    const records = [
      sleep("s1", { cycleId: 1, start: "2026-10-10T17:00:00Z", end: "2026-10-11T01:00:00Z", scored: false }),
      recovery("s1", 1, null, "PENDING_SCORE"),
      workout("w1", "2026-10-11T06:00:00Z", 9, "PENDING_SCORE"),
    ];
    expect(computeDailyMetrics(records, TZ).size).toBe(0);
  });

  it("dates a cycle by the wake-up day of its main sleep", () => {
    // The cycle starts at sleep onset, 23:00 IST on the 10th; its day is the 11th.
    const records = [
      cycle(7, "2026-10-10T17:30:00Z", 14.1, 9100),
      sleep("s1", { cycleId: 7, start: "2026-10-10T17:30:00Z", end: "2026-10-11T01:30:00Z" }),
    ];
    const metrics = computeDailyMetrics(records, TZ);
    expect(metrics.get("2026-10-10")).toBeUndefined();
    expect(metrics.get("2026-10-11")?.strain).toBe(14.1);
    expect(metrics.get("2026-10-11")?.steps).toBe(9100);
  });

  it("dates a cycle with no sleep yet by its start plus twelve hours", () => {
    // 23:00 IST on the 11th: the day it belongs to is the 12th.
    const metrics = computeDailyMetrics([cycle(8, "2026-10-11T17:30:00Z")], TZ);
    expect(metrics.get("2026-10-12")?.strain).toBe(12.4);
  });

  it("counts workouts per day and keeps the hardest strain", () => {
    const records = [workout("w1", "2026-10-11T01:00:00Z", 8.2), workout("w2", "2026-10-11T12:00:00Z", 13.5)];
    const day = computeDailyMetrics(records, TZ).get("2026-10-11");
    expect(day?.workoutCount).toBe(2);
    expect(day?.workoutStrainMax).toBe(13.5);
  });

  it("leaves optional recovery fields null when WHOOP omits them", () => {
    const { spo2_percentage: _spo2, skin_temp_celsius: _temp, ...partial } = fullRecovery;
    const records = [
      sleep("s1", { cycleId: 1, start: "2026-10-10T17:00:00Z", end: "2026-10-11T01:00:00Z" }),
      recovery("s1", 1, partial),
    ];
    const day = computeDailyMetrics(records, TZ).get("2026-10-11");
    expect(day?.spo2Pct).toBeNull();
    expect(day?.skinTempC).toBeNull();
    expect(day?.recoveryScore).toBe(67);
  });

  it("skips a recovery whose sleep isn't available to date it", () => {
    expect(computeDailyMetrics([recovery("missing", 1, fullRecovery)], TZ).size).toBe(0);
  });
});
