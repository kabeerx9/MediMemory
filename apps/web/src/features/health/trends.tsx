import type { Memory } from "@caretalk/contracts/health";
import { useMemo, useState } from "react";

// The payoff of longitudinal tracking: a value you can see move.
//
// Prose in `content` is still the record of truth — this reads the optional
// structured shadow (metric/value/unit) the model fills alongside it. Anything
// without a metric, a numeric value, or a date simply doesn't chart, which is
// the correct behaviour for "he felt tired on Tuesday".
//
// Rendered as a hand-rolled inline SVG rather than a chart library: two
// polylines and a baseline don't justify shipping ~50kB to a rail that's 360px
// wide.

type Point = { date: string; value: number; valueSecondary: number | null };
export type Series = { metric: string; unit: string | null; points: Point[] };

const MIN_POINTS = 2;

export function buildSeries(memories: Memory[]): Series[] {
  const byMetric = new Map<string, Series>();

  for (const memory of memories) {
    if (memory.supersededById) continue;
    if (!memory.metric || memory.value === null || !memory.happenedOn) continue;

    const existing = byMetric.get(memory.metric);
    const point: Point = {
      date: memory.happenedOn,
      value: memory.value,
      valueSecondary: memory.valueSecondary,
    };
    if (existing) {
      existing.points.push(point);
      // First non-null unit wins; a later blank shouldn't erase the label.
      existing.unit ??= memory.unit;
    } else {
      byMetric.set(memory.metric, {
        metric: memory.metric,
        unit: memory.unit,
        points: [point],
      });
    }
  }

  return Array.from(byMetric.values())
    .map((series) => ({
      ...series,
      points: [...series.points].sort((a, b) => a.date.localeCompare(b.date)),
    }))
    .filter((series) => series.points.length >= MIN_POINTS)
    .sort((a, b) => a.metric.localeCompare(b.metric));
}

export function TrendsSection({ memories }: { memories: Memory[] }) {
  const [open, setOpen] = useState(true);
  const series = useMemo(() => buildSeries(memories), [memories]);

  if (series.length === 0) return null;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Trends
        </h2>
        <button
          className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          {open ? "Hide" : `Show (${series.length})`}
        </button>
      </div>

      {open ? (
        <div className="space-y-1.5">
          {series.map((item) => (
            <TrendRow key={item.metric} series={item} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function TrendRow({ series }: { series: Series }) {
  const latest = series.points[series.points.length - 1];
  if (!latest) return null;

  const paired = series.points.some((point) => point.valueSecondary !== null);

  return (
    <div className="rounded-lg border border-border bg-card/60 px-2.5 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-xs font-medium text-foreground">
          {humanizeMetric(series.metric)}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatReading(latest, series.unit)}
        </span>
      </div>
      <Sparkline points={series.points} paired={paired} />
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{series.points[0]?.date}</span>
        <span>
          {series.points.length} readings · {latest.date}
        </span>
      </div>
    </div>
  );
}

const WIDTH = 300;
const HEIGHT = 32;

function Sparkline({ points, paired }: { points: Point[]; paired: boolean }) {
  // Both halves of a paired reading share one scale — systolic and diastolic
  // are only meaningful next to each other.
  const values = points.flatMap((point) =>
    point.valueSecondary !== null ? [point.value, point.valueSecondary] : [point.value],
  );
  const min = Math.min(...values);
  const max = Math.max(...values);
  // A flat series would divide by zero; draw it down the middle instead.
  const span = max - min || 1;

  const project = (pick: (point: Point) => number | null) =>
    points
      .map((point, index) => {
        const value = pick(point);
        if (value === null) return null;
        const x = points.length === 1 ? WIDTH / 2 : (index / (points.length - 1)) * WIDTH;
        const y = HEIGHT - ((value - min) / span) * HEIGHT;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .filter((entry): entry is string => entry !== null)
      .join(" ");

  return (
    <svg
      aria-hidden
      className="my-1 h-8 w-full"
      preserveAspectRatio="none"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
    >
      <polyline
        fill="none"
        points={project((point) => point.value)}
        stroke="var(--sentri-accent-violet-deep)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
      {paired ? (
        <polyline
          fill="none"
          points={project((point) => point.valueSecondary)}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity="0.35"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
    </svg>
  );
}

function formatReading(point: Point, unit: string | null) {
  const value =
    point.valueSecondary !== null ? `${point.value}/${point.valueSecondary}` : String(point.value);
  return unit ? `${value} ${unit}` : value;
}

function humanizeMetric(metric: string) {
  return metric.replace(/_/g, " ").replace(/^\w/, (character) => character.toUpperCase());
}
