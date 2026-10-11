import type { Memory, WhoopStatus } from "@caretalk/contracts/health";
import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Loader2, Minus, RefreshCw, Table2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { pickWhoopWorkspace, whoopStatusLine } from "@/features/connect/whoop-state";
import { healthApi } from "@/features/health/api";

import { MetricChart, shortDate } from "./metric-chart";
import { Ring } from "./ring";
import {
  addDays,
  eventMarkers,
  glanceStat,
  measurementSeriesInRange,
  pointsFor,
  rangeFor,
  recoveryBand,
  rollingAverage,
  strainLevel,
  type DayRow,
  type GlanceStat,
  type RecoveryBand,
} from "./shape";

// "My dashboard": today at a glance, then trends that put WHOOP numbers,
// charted lab values, and dated medication changes on one date axis. Read-only
// — chatting and saving happen in Claude / ChatGPT / Hermes over MCP.

const RANGES = [
  { days: 30, label: "30D" },
  { days: 90, label: "90D" },
  { days: 365, label: "1Y" },
] as const;

const BAND: Record<RecoveryBand, { color: string; label: string }> = {
  good: { color: "var(--wd-good)", label: "Green" },
  warning: { color: "var(--wd-warning)", label: "Yellow" },
  critical: { color: "var(--wd-critical)", label: "Red" },
};

function localToday() {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

const fmt = {
  int: (v: number) => Math.round(v).toLocaleString(),
  one: (v: number) => v.toFixed(1),
  hours: (v: number) => (v / 60).toFixed(1),
  pct: (v: number) => `${Math.round(v)}`,
};

export function DashboardPage() {
  const today = useMemo(localToday, []);
  const [rangeDays, setRangeDays] = useState<number>(30);
  const [workspace, setWorkspace] = useState<{ id: string; name: string } | null | undefined>(undefined);
  const [status, setStatus] = useState<WhoopStatus | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [rows, setRows] = useState<DayRow[] | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [showTable, setShowTable] = useState(false);

  const range = useMemo(() => rangeFor(rangeDays, today), [rangeDays, today]);

  const loadMetrics = useCallback(
    async (workspaceId: string) => {
      // Six extra days so the first visible day already has a full 7-day average.
      const response = await healthApi.getDailyMetrics(workspaceId, addDays(range.from, -6), range.to);
      setRows(response.days.filter((d) => d.source === "whoop") as DayRow[]);
    },
    [range],
  );

  useEffect(() => {
    healthApi
      .listWorkspaces()
      .then(async ({ workspaces }) => {
        const picked = pickWhoopWorkspace(workspaces);
        setWorkspace(picked);
        if (!picked) return;
        const [whoop, detail] = await Promise.all([healthApi.getWhoop(picked.id), healthApi.getWorkspace(picked.id)]);
        setStatus(whoop);
        setMemories(detail.memories);
      })
      .catch((err: unknown) => {
        setWorkspace(null);
        toast.error(err instanceof Error ? err.message : "Could not load your dashboard");
      });
  }, []);

  useEffect(() => {
    if (workspace) loadMetrics(workspace.id).catch(() => toast.error("Could not load daily metrics"));
  }, [workspace, loadMetrics]);

  async function sync() {
    if (!workspace) return;
    setSyncing(true);
    try {
      const result = await healthApi.syncWhoop(workspace.id);
      if (result.status !== "ok") toast.message(result.message ?? "Sync didn't complete");
      const [whoop] = await Promise.all([healthApi.getWhoop(workspace.id), loadMetrics(workspace.id)]);
      setStatus(whoop);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  const markers = useMemo(() => eventMarkers(memories, range), [memories, range]);
  const measurements = useMemo(() => measurementSeriesInRange(memories, range), [memories, range]);
  const connection = status?.connection ?? null;

  return (
    <div className="whoop-dash min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:py-10">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.18em] text-[var(--wd-muted)] uppercase">My dashboard</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
              {new Date(`${today}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
            </h1>
          </div>
          {connection?.status === "active" ? (
            <div className="flex items-center gap-3">
              <span className="text-xs text-[var(--wd-muted)]">{whoopStatusLine(connection)}</span>
              <button
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--wd-grid)] bg-[var(--wd-card)] px-3.5 py-1.5 text-xs font-semibold tracking-wide uppercase transition-colors hover:border-[var(--wd-muted)] disabled:opacity-60"
                disabled={syncing}
                onClick={() => void sync()}
                type="button"
              >
                {syncing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                Sync
              </button>
            </div>
          ) : null}
        </header>

        {workspace === undefined || (workspace && (status === null || rows === null)) ? (
          <div className="h-64 animate-pulse rounded-2xl bg-[var(--wd-card)]" />
        ) : !workspace || !status?.configured || !connection || connection.status === "revoked" ? (
          <NotConnected />
        ) : (
          <>
            {connection.status === "needs_reconnect" ? (
              <p className="rounded-xl border border-[var(--wd-warning)]/40 bg-[var(--wd-card)] px-4 py-3 text-sm">
                WHOOP needs reconnecting — numbers below may be stale.{" "}
                <Link className="font-semibold underline" to="/connections">
                  Reconnect
                </Link>
              </p>
            ) : null}
            <Glance rows={rows ?? []} today={today} />
            <section className="flex flex-col gap-4" aria-labelledby="trends">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-[11px] font-semibold tracking-[0.18em] text-[var(--wd-muted)] uppercase" id="trends">
                  Trends
                </h2>
                <div className="inline-flex rounded-full bg-[var(--wd-card)] p-1" role="group" aria-label="Date range">
                  {RANGES.map((r) => (
                    <button
                      aria-pressed={rangeDays === r.days}
                      className={
                        "rounded-full px-3.5 py-1 text-xs font-semibold tracking-wide transition-colors " +
                        (rangeDays === r.days ? "bg-[var(--wd-ink)] text-[var(--wd-bg)]" : "text-[var(--wd-muted)] hover:text-[var(--wd-ink)]")
                      }
                      key={r.days}
                      onClick={() => setRangeDays(r.days)}
                      type="button"
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              <Legend hasMarkers={markers.length > 0} />
              <Charts markers={markers} range={range} rows={rows ?? []} />
            </section>

            {measurements.length > 0 ? (
              <section className="flex flex-col gap-4" aria-labelledby="measurements">
                <h2 className="text-[11px] font-semibold tracking-[0.18em] text-[var(--wd-muted)] uppercase" id="measurements">
                  From your record
                </h2>
                <div className="grid gap-3 md:grid-cols-2">
                  {measurements.map((m) => (
                    <MetricChart
                      // Lab values are sparse: a line through the readings, not a rolling mean.
                      average={m.points}
                      color="var(--wd-neutral)"
                      daily={m.points}
                      format={(v) => (Math.abs(v) >= 100 ? fmt.int(v) : fmt.one(v))}
                      key={m.metric}
                      markers={markers}
                      range={range}
                      title={m.metric.replace(/_/g, " ")}
                      unit={m.unit ?? undefined}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {markers.length > 0 ? <Timeline markers={markers} /> : null}

            <section>
              <button
                className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide text-[var(--wd-muted)] uppercase hover:text-[var(--wd-ink)]"
                onClick={() => setShowTable((v) => !v)}
                type="button"
              >
                <Table2 className="size-3.5" /> {showTable ? "Hide" : "Show"} data table
              </button>
              {showTable ? <DataTable range={range} rows={rows ?? []} /> : null}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function NotConnected() {
  return (
    <div className="rounded-2xl bg-[var(--wd-card)] px-6 py-12 text-center">
      <p className="text-lg font-semibold">Connect WHOOP to fill your dashboard</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-[var(--wd-muted)]">
        Recovery, sleep, strain and workouts sync every few hours and sit next to your medical record.
      </p>
      <Link
        className="mt-5 inline-flex rounded-full bg-[var(--wd-ink)] px-5 py-2 text-xs font-semibold tracking-wide text-[var(--wd-bg)] uppercase"
        to="/connections"
      >
        Go to connections
      </Link>
    </div>
  );
}

function Glance({ rows, today }: { rows: DayRow[]; today: string }) {
  const recovery = glanceStat(rows, "recoveryScore");
  const strain = glanceStat(rows, "strain");
  const sleepPerf = glanceStat(rows, "sleepPerformancePct");
  const sleepMin = glanceStat(rows, "sleepMinutes");
  const band = recoveryBand(recovery?.value);
  const stale = (s: GlanceStat | null) => (s && s.date !== today ? ` · ${shortDate(s.date)}` : "");

  return (
    <section className="flex flex-col gap-3" aria-label="Today at a glance">
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Ring
          caption={band ? `${BAND[band].label}${stale(recovery)}` : "After your first night"}
          color={band ? BAND[band].color : "var(--wd-track)"}
          fraction={recovery ? recovery.value / 100 : null}
          label="Recovery"
          value={recovery ? `${Math.round(recovery.value)}%` : "—"}
        />
        <Ring
          caption={strain ? `${strainLevel(strain.value)}${stale(strain)}` : "No activity yet"}
          color="var(--wd-strain)"
          fraction={strain ? strain.value / 21 : null}
          label="Strain"
          value={strain ? strain.value.toFixed(1) : "—"}
        />
        <Ring
          caption={sleepMin ? `${fmt.hours(sleepMin.value)} h asleep${stale(sleepMin)}` : "After your first night"}
          color="var(--wd-sleep)"
          fraction={sleepPerf ? sleepPerf.value / 100 : null}
          label="Sleep"
          value={sleepPerf ? `${Math.round(sleepPerf.value)}%` : "—"}
        />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <StatTile format={fmt.int} label="HRV" stat={glanceStat(rows, "hrvMs")} unit="ms" />
        <StatTile format={fmt.int} label="Resting HR" stat={glanceStat(rows, "restingHr")} unit="bpm" />
        <StatTile format={fmt.hours} label="Sleep" stat={sleepMin} unit="h" />
        <StatTile format={fmt.int} label="Steps" stat={glanceStat(rows, "steps")} />
      </div>
    </section>
  );
}

function StatTile({ label, stat, unit, format }: { label: string; stat: GlanceStat | null; unit?: string; format: (v: number) => string }) {
  const delta = stat?.delta ?? null;
  const flat = delta !== null && stat?.baseline ? Math.abs(delta / stat.baseline) < 0.02 : false;
  const Icon = delta === null || flat ? Minus : delta > 0 ? ArrowUp : ArrowDown;
  return (
    <div className="rounded-2xl bg-[var(--wd-card)] px-4 py-3.5">
      <p className="text-[11px] font-semibold tracking-[0.14em] text-[var(--wd-muted)] uppercase">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
        {stat ? format(stat.value) : "—"}
        {stat && unit ? <span className="ml-1 text-xs font-normal text-[var(--wd-muted)]">{unit}</span> : null}
      </p>
      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-[var(--wd-muted)]">
        {stat && delta !== null ? (
          <>
            <Icon className="size-3" aria-hidden />
            {flat ? "In line with" : `${format(Math.abs(delta))} ${delta > 0 ? "above" : "below"}`} 7-day avg
          </>
        ) : stat ? (
          "Building a 7-day baseline"
        ) : (
          "No reading yet"
        )}
      </p>
    </div>
  );
}

function Legend({ hasMarkers }: { hasMarkers: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-[var(--wd-muted)]">
      <span className="flex items-center gap-1.5">
        <svg aria-hidden height="8" width="8">
          <circle cx="4" cy="4" fill="var(--wd-muted)" r="4" />
        </svg>
        Daily reading
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-0.5 w-4 rounded bg-[var(--wd-muted)]" /> 7-day average
      </span>
      <span className="flex items-center gap-1.5">
        {(["good", "warning", "critical"] as const).map((b) => (
          <svg aria-hidden height="8" key={b} width="8">
            <circle cx="4" cy="4" fill={BAND[b].color} r="4" />
          </svg>
        ))}
        Recovery green / yellow / red
      </span>
      {hasMarkers ? (
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 border-l border-dashed border-[var(--wd-marker)]" /> Medication or event
        </span>
      ) : null}
    </div>
  );
}

const CHARTS: Array<{
  key: string;
  title: string;
  unit?: string;
  color: string;
  format: (v: number) => string;
  transform?: (v: number) => number;
  domain?: [number, number];
}> = [
  { key: "recoveryScore", title: "Recovery", unit: "%", color: "var(--wd-neutral)", format: fmt.pct, domain: [0, 100] },
  { key: "hrvMs", title: "HRV", unit: "ms", color: "var(--wd-neutral)", format: fmt.int },
  { key: "restingHr", title: "Resting heart rate", unit: "bpm", color: "var(--wd-neutral)", format: fmt.int },
  { key: "sleepMinutes", title: "Sleep", unit: "h", color: "var(--wd-sleep)", format: fmt.one, transform: (v) => v / 60 },
  { key: "strain", title: "Day strain", color: "var(--wd-strain)", format: fmt.one, domain: [0, 21] },
  { key: "steps", title: "Steps", color: "var(--wd-neutral)", format: fmt.int },
];

function Charts({ rows, range, markers }: { rows: DayRow[]; range: { from: string; to: string }; markers: ReturnType<typeof eventMarkers> }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {CHARTS.map((c) => {
        const daily = pointsFor(rows, c.key).map((p) => ({ date: p.date, value: c.transform ? c.transform(p.value) : p.value }));
        return (
          <MetricChart
            average={rollingAverage(daily, 7)}
            color={c.color}
            daily={daily}
            domain={c.domain}
            dotColor={c.key === "recoveryScore" ? (v) => BAND[recoveryBand(v)!].color : undefined}
            format={c.format}
            key={c.key}
            markers={markers}
            range={range}
            title={c.title}
            unit={c.unit}
          />
        );
      })}
    </div>
  );
}

function Timeline({ markers }: { markers: ReturnType<typeof eventMarkers> }) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby="timeline">
      <h2 className="text-[11px] font-semibold tracking-[0.18em] text-[var(--wd-muted)] uppercase" id="timeline">
        On the timeline
      </h2>
      <ol className="divide-y divide-[var(--wd-grid)] rounded-2xl bg-[var(--wd-card)]">
        {markers.map((m) => (
          <li className="flex gap-4 px-4 py-3 text-sm" key={m.id}>
            <span className="w-14 shrink-0 text-xs text-[var(--wd-muted)] tabular-nums">{shortDate(m.date)}</span>
            <span className="min-w-0">
              <span className="mr-1.5 text-[11px] font-semibold tracking-[0.1em] text-[var(--wd-muted)] uppercase">{m.kind}</span>
              {m.content}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

const TABLE_COLUMNS: Array<{ key: string; label: string; format: (v: number) => string }> = [
  { key: "recoveryScore", label: "Recovery %", format: fmt.pct },
  { key: "hrvMs", label: "HRV ms", format: fmt.int },
  { key: "restingHr", label: "RHR", format: fmt.int },
  { key: "sleepMinutes", label: "Sleep h", format: fmt.hours },
  { key: "sleepPerformancePct", label: "Sleep %", format: fmt.pct },
  { key: "strain", label: "Strain", format: fmt.one },
  { key: "steps", label: "Steps", format: fmt.int },
];

function DataTable({ rows, range }: { rows: DayRow[]; range: { from: string; to: string } }) {
  const visible = rows.filter((r) => r.date >= range.from && r.date <= range.to).sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="mt-3 overflow-x-auto rounded-2xl bg-[var(--wd-card)]">
      <table className="w-full min-w-[560px] text-sm tabular-nums">
        <thead>
          <tr className="text-left text-[11px] tracking-[0.1em] text-[var(--wd-muted)] uppercase">
            <th className="px-4 py-2.5 font-semibold">Date</th>
            {TABLE_COLUMNS.map((c) => (
              <th className="px-3 py-2.5 text-right font-semibold" key={c.key}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--wd-grid)]">
          {visible.map((row) => (
            <tr key={row.date}>
              <td className="px-4 py-2">{shortDate(row.date)}</td>
              {TABLE_COLUMNS.map((c) => (
                <td className="px-3 py-2 text-right" key={c.key}>
                  {typeof row[c.key] === "number" ? c.format(row[c.key] as number) : "—"}
                </td>
              ))}
            </tr>
          ))}
          {visible.length === 0 ? (
            <tr>
              <td className="px-4 py-6 text-center text-[var(--wd-muted)]" colSpan={TABLE_COLUMNS.length + 1}>
                No readings in this range
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
