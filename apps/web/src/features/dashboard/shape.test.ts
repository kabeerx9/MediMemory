import { describe, expect, test } from "vitest";

import { eventMarkers, glanceStat, measurementSeriesInRange, rangeFor, recoveryBand, niceTicks, rollingAverage, strainLevel } from "./shape";

describe("rangeFor", () => {
  test("covers the last N days including today", () => {
    expect(rangeFor(30, "2026-10-11")).toEqual({ from: "2026-09-12", to: "2026-10-11" });
  });
});

describe("recoveryBand", () => {
  test("follows WHOOP's green / yellow / red thresholds", () => {
    expect(recoveryBand(67)).toBe("good");
    expect(recoveryBand(66)).toBe("warning");
    expect(recoveryBand(34)).toBe("warning");
    expect(recoveryBand(33)).toBe("critical");
    expect(recoveryBand(null)).toBeNull();
  });
});

describe("rollingAverage", () => {
  test("averages over the trailing 7 calendar days, not the last 7 points", () => {
    const points = [
      { date: "2026-10-01", value: 10 },
      { date: "2026-10-02", value: 20 },
      // gap: 3rd–8th missing
      { date: "2026-10-09", value: 30 },
    ];
    expect(rollingAverage(points, 7)).toEqual([
      { date: "2026-10-01", value: 10 },
      { date: "2026-10-02", value: 15 },
      // Oct 3–9 window only holds the 9th
      { date: "2026-10-09", value: 30 },
    ]);
  });
});

describe("glanceStat", () => {
  const rows = [
    { date: "2026-10-04", hrvMs: 50 },
    { date: "2026-10-05", hrvMs: 54 },
    { date: "2026-10-10", hrvMs: 52 },
    { date: "2026-10-11", hrvMs: 62 },
  ];

  test("compares the latest value with the average of the 7 days before it", () => {
    expect(glanceStat(rows, "hrvMs")).toEqual({ date: "2026-10-11", value: 62, baseline: 52, delta: 10 });
  });

  test("has no baseline when there's nothing earlier", () => {
    expect(glanceStat([{ date: "2026-10-11", hrvMs: 62 }], "hrvMs")).toEqual({ date: "2026-10-11", value: 62, baseline: null, delta: null });
  });

  test("is null when the metric was never recorded", () => {
    expect(glanceStat(rows, "strain")).toBeNull();
  });
});

const memory = (over: Record<string, unknown>) => ({
  id: "m",
  content: "fact",
  kind: "note",
  happenedOn: "2026-10-05",
  supersededById: null,
  metric: null,
  value: null,
  valueSecondary: null,
  unit: null,
  ...over,
});

describe("eventMarkers", () => {
  test("keeps dated medication and event facts inside the range, oldest first", () => {
    const memories = [
      memory({ id: "a", kind: "medication", content: "Metformin 500mg → 1000mg", happenedOn: "2026-10-08" }),
      memory({ id: "b", kind: "event", content: "Started WHOOP", happenedOn: "2026-10-02" }),
      memory({ id: "c", kind: "symptom", happenedOn: "2026-10-03" }),
      memory({ id: "d", kind: "medication", happenedOn: "2026-08-01" }),
      memory({ id: "e", kind: "medication", happenedOn: null }),
    ];
    expect(eventMarkers(memories as never, { from: "2026-10-01", to: "2026-10-11" }).map((m) => m.id)).toEqual(["b", "a"]);
  });

  test("still shows a medication fact that was later superseded — the change itself happened", () => {
    const memories = [memory({ id: "old", kind: "medication", supersededById: "new", happenedOn: "2026-10-04" })];
    expect(eventMarkers(memories as never, { from: "2026-10-01", to: "2026-10-11" })).toHaveLength(1);
  });
});

describe("measurementSeriesInRange", () => {
  test("drops a metric with fewer than two readings in range — one dot isn't a trend", () => {
    const memories = [memory({ id: "1", kind: "measurement", metric: "weight", value: 82, unit: "kg", happenedOn: "2026-10-02" })];
    expect(measurementSeriesInRange(memories as never, { from: "2026-10-01", to: "2026-10-11" })).toEqual([]);
  });

  test("keeps active measurement readings within the range, grouped by metric", () => {
    const memories = [
      memory({ id: "1", kind: "measurement", metric: "weight", value: 82, unit: "kg", happenedOn: "2026-10-02" }),
      memory({ id: "2", kind: "measurement", metric: "weight", value: 81, unit: "kg", happenedOn: "2026-10-09" }),
      memory({ id: "3", kind: "measurement", metric: "hba1c", value: 6.1, unit: "%", happenedOn: "2026-06-01" }),
    ];
    expect(measurementSeriesInRange(memories as never, { from: "2026-10-01", to: "2026-10-11" })).toEqual([
      { metric: "weight", unit: "kg", points: [{ date: "2026-10-02", value: 82 }, { date: "2026-10-09", value: 81 }] },
    ]);
  });
});

describe("strainLevel", () => {
  test("uses WHOOP's light / moderate / high / all-out bands", () => {
    expect(strainLevel(9.9)).toBe("Light");
    expect(strainLevel(10)).toBe("Moderate");
    expect(strainLevel(14)).toBe("High");
    expect(strainLevel(18)).toBe("All out");
  });
});

describe("niceTicks", () => {
  test("picks round values inside the domain", () => {
    expect(niceTicks(0, 21)).toEqual([0, 10, 20]);
    expect(niceTicks(2_900, 13_000)).toEqual([5_000, 7_500, 10_000, 12_500]);
    expect(niceTicks(5.4, 8.6)).toEqual([6, 7, 8]);
  });
});
