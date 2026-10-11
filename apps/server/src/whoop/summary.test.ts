import { describe, expect, it } from "vitest";

import { addDays, buildDailySummary, type SummaryRow } from "./summary";

const TODAY = "2026-10-20";

function row(daysAgo: number, values: Partial<SummaryRow>): SummaryRow {
  return { date: addDays(TODAY, -daysAgo), recoveryScore: null, hrvMs: null, restingHr: null, sleepMinutes: null, strain: null, ...values };
}

describe("addDays", () => {
  it("crosses month boundaries", () => {
    expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
  });
});

describe("buildDailySummary", () => {
  it("averages the last 7 days and compares with the 7 before", () => {
    const rows = [
      ...[0, 1, 2, 3, 4, 5, 6].map((d) => row(d, { recoveryScore: 70, hrvMs: 60, restingHr: 55, sleepMinutes: 420, strain: 12 })),
      ...[7, 8, 9, 10, 11, 12, 13].map((d) => row(d, { recoveryScore: 50, hrvMs: 60, restingHr: 58, sleepMinutes: 480, strain: 12 })),
    ];
    const text = buildDailySummary(rows, TODAY, "active").join("\n");
    expect(text).toContain("Recovery 70% (↑ from 50%)");
    expect(text).toContain("HRV 60 ms (→)");
    expect(text).toContain("Sleep 7.0 h (↓ from 8.0 h)");
    expect(text).toContain("7 of 7 days have data");
  });

  it("counts days without data and ignores rows outside the window", () => {
    const rows = [row(0, { recoveryScore: 60 }), row(3, { recoveryScore: 80 }), row(30, { recoveryScore: 10 })];
    const text = buildDailySummary(rows, TODAY, "active").join("\n");
    expect(text).toContain("Recovery 70%");
    expect(text).toContain("2 of 7 days have data");
  });

  it("says when there's no data yet", () => {
    expect(buildDailySummary([], TODAY, "active").join("\n")).toContain("No WHOOP data in the last 7 days");
  });

  it("flags a connection that needs reconnecting", () => {
    expect(buildDailySummary([], TODAY, "needs_reconnect").join("\n")).toMatch(/needs to be reconnected/);
  });
});
