import { describe, expect, it } from "vitest";

import { summarizeWorkout } from "./workouts";

const MIN = 60_000;

const scored = {
  id: "w-1",
  start: "2026-10-11T03:00:00.000Z",
  end: "2026-10-11T03:45:00.000Z",
  sport_name: "weightlifting",
  score_state: "SCORED",
  score: {
    strain: 9.8,
    average_heart_rate: 121,
    max_heart_rate: 168,
    zone_durations: {
      zone_zero_milli: 2 * MIN,
      zone_one_milli: 10 * MIN,
      zone_two_milli: 15 * MIN,
      zone_three_milli: 12 * MIN,
      zone_four_milli: 5 * MIN,
      zone_five_milli: 1 * MIN,
    },
  },
};

describe("summarizeWorkout", () => {
  it("turns a scored WHOOP workout into minutes per heart-rate zone, dated in IST", () => {
    expect(summarizeWorkout(scored, "Asia/Kolkata")).toEqual({
      id: "w-1",
      date: "2026-10-11",
      start: "2026-10-11T03:00:00.000Z",
      durationMinutes: 45,
      sport: "Weightlifting",
      strain: 9.8,
      avgHr: 121,
      maxHr: 168,
      zoneMinutes: [2, 10, 15, 12, 5, 1],
    });
  });

  it("dates a late-evening UTC workout on the next IST day", () => {
    const late = { ...scored, start: "2026-10-10T19:00:00.000Z", end: "2026-10-10T19:30:00.000Z" };
    expect(summarizeWorkout(late, "Asia/Kolkata")?.date).toBe("2026-10-11");
  });

  it("skips a workout that isn't scored yet", () => {
    expect(summarizeWorkout({ ...scored, score_state: "PENDING_SCORE" }, "Asia/Kolkata")).toBeNull();
  });

  it("keeps a workout without zone data, with empty zones", () => {
    const noZones = { ...scored, score: { ...scored.score, zone_durations: undefined } };
    expect(summarizeWorkout(noZones, "Asia/Kolkata")?.zoneMinutes).toEqual([0, 0, 0, 0, 0, 0]);
  });
});
