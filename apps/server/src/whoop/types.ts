export type WhoopRecordType = "recovery" | "sleep" | "cycle" | "workout" | "body";

/** A WHOOP API object as stored in whoop_records.payload. */
export type RawRecord = {
  type: WhoopRecordType;
  whoopId: string;
  // Untyped on purpose: this is WHOOP's JSON verbatim, read defensively.
  payload: any;
};

export const METRIC_KEYS = [
  "recoveryScore",
  "hrvMs",
  "restingHr",
  "spo2Pct",
  "skinTempC",
  "sleepMinutes",
  "sleepPerformancePct",
  "sleepEfficiencyPct",
  "respiratoryRate",
  "strain",
  "kilojoules",
  "avgHr",
  "maxHr",
  "steps",
  "workoutCount",
  "workoutStrainMax",
] as const;

export type MetricKey = (typeof METRIC_KEYS)[number];

export type DailyMetricValues = Record<MetricKey, number | null>;
