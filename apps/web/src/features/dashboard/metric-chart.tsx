import { useEffect, useMemo, useRef, useState } from "react";

import { niceTicks, type DateRange, type EventMarker, type Point } from "./shape";

// One small-multiple: a single metric over the shared date range. Daily
// readings are dots, the 7-day average is the line — one hue, so the chart's
// title carries identity and no legend box is needed. Medication changes and
// events are neutral dashed rules on the same x, so a dose change lines up
// with whatever moved after it. Hover or arrow keys move a crosshair that
// snaps to the nearest day with something on it.

const HEIGHT = 156;
const M = { top: 12, right: 10, bottom: 22, left: 38 };

function dayIndex(date: string, from: string) {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function shortDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
}

function niceDomain(values: number[], fixed?: [number, number]): [number, number] {
  if (fixed) return fixed;
  if (values.length === 0) return [0, 1];
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const pad = (max - min) * 0.12;
  return [min - pad, max + pad];
}

export function MetricChart({
  title,
  unit,
  format,
  daily,
  average,
  range,
  color,
  dotColor,
  markers,
  domain,
}: {
  title: string;
  unit?: string;
  format: (value: number) => string;
  daily: Point[];
  average: Point[];
  range: DateRange;
  color: string;
  dotColor?: (value: number) => string;
  markers: EventMarker[];
  domain?: [number, number];
}) {
  const wrapper = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(560);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const element = wrapper.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => entry && setWidth(Math.max(240, entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const inRange = (p: { date: string }) => p.date >= range.from && p.date <= range.to;
  const points = useMemo(() => daily.filter(inRange), [daily, range]);
  const avg = useMemo(() => average.filter(inRange), [average, range]);
  const totalDays = dayIndex(range.to, range.from) + 1;
  const innerW = width - M.left - M.right;
  const innerH = HEIGHT - M.top - M.bottom;
  const [y0, y1] = niceDomain([...points, ...avg].map((p) => p.value), domain);

  const x = (date: string) => M.left + (totalDays <= 1 ? innerW / 2 : (dayIndex(date, range.from) / (totalDays - 1)) * innerW);
  const y = (value: number) => M.top + innerH - ((value - y0) / (y1 - y0)) * innerH;

  // Days the crosshair can land on: any reading or marker.
  const stops = useMemo(
    () => [...new Set([...points.map((p) => p.date), ...markers.map((m) => m.date)])].sort(),
    [points, markers],
  );

  function nearest(clientX: number) {
    const rect = wrapper.current?.getBoundingClientRect();
    if (!rect || stops.length === 0) return null;
    const px = clientX - rect.left;
    let best = stops[0]!;
    for (const stop of stops) if (Math.abs(x(stop) - px) < Math.abs(x(best) - px)) best = stop;
    return best;
  }

  function onKey(event: React.KeyboardEvent) {
    if (stops.length === 0) return;
    const index = active ? stops.indexOf(active) : stops.length;
    if (event.key === "ArrowLeft") setActive(stops[Math.max(0, index - 1)] ?? null);
    else if (event.key === "ArrowRight") setActive(stops[Math.min(stops.length - 1, index + 1)] ?? null);
    else if (event.key === "Escape") setActive(null);
    else return;
    event.preventDefault();
  }

  const reading = active ? points.find((p) => p.date === active) : undefined;
  const smoothed = active ? avg.find((p) => p.date === active) : undefined;
  const events = active ? markers.filter((m) => m.date === active) : [];
  const latest = points.at(-1);
  const dense = points.length > 90;
  const linePath = avg.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const ticks = niceTicks(y0, y1);
  const xLabels = [range.from, addMid(range), range.to];

  return (
    <section className="rounded-2xl bg-[var(--wd-card)] p-4">
      <header className="mb-1 flex items-baseline justify-between gap-3">
        <h3 className="text-[11px] font-semibold tracking-[0.14em] text-[var(--wd-muted)] uppercase">{title}</h3>
        <p className="text-sm font-semibold tabular-nums">
          {latest ? format(latest.value) : "—"}
          {latest && unit ? <span className="ml-1 text-xs font-normal text-[var(--wd-muted)]">{unit}</span> : null}
        </p>
      </header>

      <div
        aria-label={`${title}: ${points.length} readings between ${shortDate(range.from)} and ${shortDate(range.to)}. Use arrow keys to step through days.`}
        className="relative outline-none focus-visible:ring-2 focus-visible:ring-[var(--wd-strain)]/50 rounded-lg"
        onBlur={() => setActive(null)}
        onKeyDown={onKey}
        onPointerLeave={() => setActive(null)}
        onPointerMove={(event) => setActive(nearest(event.clientX))}
        ref={wrapper}
        role="img"
        tabIndex={0}
      >
        {points.length === 0 ? (
          <div className="flex items-center justify-center text-xs text-[var(--wd-muted)]" style={{ height: HEIGHT }}>
            No readings in this range yet
          </div>
        ) : (
          <svg aria-hidden className="block" height={HEIGHT} width={width}>
            {ticks.map((tick) => (
              <g key={tick}>
                <line stroke="var(--wd-grid)" x1={M.left} x2={width - M.right} y1={y(tick)} y2={y(tick)} />
                <text fill="var(--wd-faint)" fontSize="10" textAnchor="end" x={M.left - 6} y={y(tick) + 3}>
                  {format(tick)}
                </text>
              </g>
            ))}
            {xLabels.map((date, i) => (
              <text
                fill="var(--wd-faint)"
                fontSize="10"
                key={`${date}-${i}`}
                textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}
                x={i === 0 ? M.left : i === 2 ? width - M.right : x(date)}
                y={HEIGHT - 6}
              >
                {shortDate(date)}
              </text>
            ))}
            {markers.map((m) => (
              <g key={m.id}>
                <line
                  stroke="var(--wd-marker)"
                  strokeDasharray="3 3"
                  x1={x(m.date)}
                  x2={x(m.date)}
                  y1={M.top}
                  y2={M.top + innerH}
                />
                <path d={`M${x(m.date) - 4},${M.top - 6} L${x(m.date) + 4},${M.top - 6} L${x(m.date)},${M.top}`} fill="var(--wd-marker)" />
              </g>
            ))}
            {avg.length > 1 ? (
              <path d={linePath} fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
            ) : null}
            {points.map((p) => (
              <circle
                cx={x(p.date)}
                cy={y(p.value)}
                fill={dotColor ? dotColor(p.value) : color}
                fillOpacity={dotColor ? 1 : 0.45}
                key={p.date}
                r={dense ? 2.5 : 4}
                stroke="var(--wd-card)"
                strokeWidth={dense ? 1 : 2}
              />
            ))}
            {active ? (
              <line stroke="var(--wd-ink)" strokeOpacity="0.5" x1={x(active)} x2={x(active)} y1={M.top} y2={M.top + innerH} />
            ) : null}
          </svg>
        )}

        {active ? (
          <div
            className="pointer-events-none absolute top-1 z-10 w-max max-w-[240px] rounded-lg border border-[var(--wd-grid)] bg-[var(--wd-card)] px-3 py-2 text-xs shadow-lg"
            style={{ left: Math.max(0, Math.min(x(active) - 60, width - 244)) }}
          >
            <p className="text-[var(--wd-muted)]">{shortDate(active)}</p>
            {reading ? (
              <p className="mt-0.5">
                <span className="text-sm font-semibold tabular-nums">{format(reading.value)}</span>
                {unit ? <span className="ml-1 text-[var(--wd-muted)]">{unit}</span> : null}
              </p>
            ) : null}
            {smoothed ? (
              <p className="flex items-center gap-1.5 text-[var(--wd-muted)]">
                <span className="inline-block h-0.5 w-3 rounded" style={{ background: color }} />
                7-day avg <span className="font-medium text-[var(--wd-ink)] tabular-nums">{format(smoothed.value)}</span>
              </p>
            ) : null}
            {events.map((e) => (
              <p className="mt-1 border-t border-[var(--wd-grid)] pt-1 leading-snug" key={e.id}>
                <span className="text-[var(--wd-muted)] capitalize">{e.kind}: </span>
                {e.content}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function addMid(range: DateRange) {
  const mid = (Date.parse(`${range.from}T00:00:00Z`) + Date.parse(`${range.to}T00:00:00Z`)) / 2;
  return new Date(mid).toISOString().slice(0, 10);
}
