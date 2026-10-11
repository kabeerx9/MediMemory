import type { Memory, WhoopStatus } from "@caretalk/contracts/health";
import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Loader2, Minus, RefreshCw, Table2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { pickWhoopWorkspace, whoopStatusLine } from "@/features/connect/whoop-state";
import { healthApi } from "@/features/health/api";

import { MedicationsPanel } from "./medications-panel";
import { MetricChart, shortDate } from "./metric-chart";
import { Ring } from "./ring";
import {
  addDays,
  currentMedications,
  eventMarkers,
  glanceStat,
  measurementSeriesInRange,
  pointsFor,
  rangeFor,
  recentEvents,
  recoveryBand,
  rollingAverage,
  strainLevel,
  type DayRow,
  type EventMarker,
  type GlanceStat,
  type RecoveryBand,
} from "./shape";

// "My dashboard": today at a glance, trends over a chosen range, and the
// medication side of the record in its own column. Read-only — chatting and
// saving happen in Claude / ChatGPT / Hermes over MCP.

const RANGES = [
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "1 year" },
] as const;

const EVENTS_WINDOW_DAYS = 90;

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

type Workout = Awaited<ReturnType<typeof healthApi.getWorkouts>>["workouts"][number];

export function DashboardPage() {
  const today = useMemo(localToday, []);
  const [rangeDays, setRangeDays] = useState<number>(30);
  const [showChanges, setShowChanges] = useState(false);
  const [workspace, setWorkspace] = useState<{ id: string; name: string } | null | undefined>(undefined);
  const [status, setStatus] = useState<WhoopStatus | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [rows, setRows] = useState<DayRow[] | null>(null);
  const [hermesRows, setHermesRows] = useState<DayRow[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [syncing, setSyncing] = useState(false);

  const range = useMemo(() => rangeFor(rangeDays, today), [rangeDays, today]);

  const loadMetrics = useCallback(
    async (workspaceId: string) => {
      // Six extra days so the first visible day already has a full 7-day average.
      // Workouts are optional: their failure must never blank the charts.
      const [response, workoutLog] = await Promise.all([
        healthApi.getDailyMetrics(workspaceId, addDays(range.from, -6), range.to),
        healthApi.getWorkouts(workspaceId, range.from, range.to).catch(() => ({ workouts: [] })),
      ]);
      setRows(response.days.filter((d) => d.source === "whoop") as DayRow[]);
      setHermesRows(response.days.filter((d) => d.source === "hermes") as DayRow[]);
      setWorkouts(workoutLog.workouts);
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
  const medications = useMemo(() => currentMedications(memories), [memories]);
  const events = useMemo(() => recentEvents(memories, today, EVENTS_WINDOW_DAYS), [memories, today]);
  const connection = status?.connection ?? null;
  const loading = workspace === undefined || (workspace && (status === null || rows === null));

  // The app shell clips its last child (overflow-hidden) so pages like chat can
  // manage their own scrolling; this outer frame takes that clip and the inner
  // element scrolls.
  return (
    <div className="flex min-h-0 flex-col">
      <div className="whoop-dash min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-x-10 gap-y-8 px-4 py-8 lg:grid-cols-[280px_minmax(0,1fr)] lg:py-10">
          <header className="flex flex-wrap items-end justify-between gap-4 lg:col-start-2">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              {new Date(`${today}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
            </h1>
            {connection?.status === "active" ? (
              <div className="flex items-center gap-3">
                <span className="text-xs text-[var(--wd-muted)]">{whoopStatusLine(connection)}</span>
                <button
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--wd-grid)] bg-[var(--wd-card)] px-3.5 py-1.5 text-xs font-medium transition-colors hover:border-[var(--wd-muted)] disabled:opacity-60"
                  disabled={syncing}
                  onClick={() => void sync()}
                  type="button"
                >
                  {syncing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                  Sync WHOOP
                </button>
              </div>
            ) : null}
          </header>

          {loading ? (
            <div className="h-64 animate-pulse rounded-2xl bg-[var(--wd-card)] lg:col-start-2" />
          ) : !workspace ? (
            <NotConnected />
          ) : (
            <>
              <div className="flex flex-col gap-4 lg:col-start-2">
                {connection?.status === "needs_reconnect" ? (
                  <p className="rounded-xl border border-[var(--wd-warning)]/40 bg-[var(--wd-card)] px-4 py-3 text-sm">
                    WHOOP needs reconnecting, so the numbers below may be out of date.{" "}
                    <Link className="font-medium underline" to="/connections">
                      Reconnect WHOOP
                    </Link>
                  </p>
                ) : null}
                {!connection || connection.status === "revoked" || !status?.configured ? (
                  <NotConnected compact />
                ) : null}
                <Glance hermesRows={hermesRows} rows={rows ?? []} today={today} />
              </div>

              {/* Mobile: right after Today. Desktop: a sticky left column. */}
              <aside className="lg:sticky lg:top-6 lg:col-start-1 lg:row-span-3 lg:row-start-1 lg:max-h-[calc(100svh-8rem)] lg:self-start lg:overflow-y-auto lg:pr-2">
                <div className="rounded-2xl bg-[var(--wd-card)] p-3 lg:bg-transparent lg:p-0">
                  <MedicationsPanel current={medications} events={events} />
                </div>
              </aside>

              <main className="flex min-w-0 flex-col gap-10 lg:col-start-2">
                <section className="flex flex-col gap-4" aria-labelledby="trends">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-lg font-semibold" id="trends">
                      Trends
                    </h2>
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--wd-muted)]">
                        <input
                          checked={showChanges}
                          className="size-3.5 accent-[var(--wd-strain)]"
                          onChange={(e) => setShowChanges(e.target.checked)}
                          type="checkbox"
                        />
                        Mark medication changes
                      </label>
                      <div className="inline-flex rounded-full bg-[var(--wd-card)] p-1" role="group" aria-label="Date range">
                        {RANGES.map((r) => (
                          <button
                            aria-pressed={rangeDays === r.days}
                            className={
                              "rounded-full px-3 py-1 text-xs font-medium transition-colors " +
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
                  </div>
                  <Charts hermesRows={hermesRows} markers={markers} range={range} rows={rows ?? []} showChanges={showChanges} />
                  <DataTable hermesRows={hermesRows} range={range} rows={rows ?? []} />
                </section>

                {measurements.length > 0 ? (
                  <section className="flex flex-col gap-4" aria-labelledby="record">
                    <div>
                      <h2 className="text-lg font-semibold" id="record">
                        Lab values
                      </h2>
                      <p className="text-sm text-[var(--wd-muted)]">Tests with at least two results in this range.</p>
                    </div>
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
                          showMarkers={showChanges}
                          title={humanize(m.metric)}
                          unit={m.unit ?? undefined}
                        />
                      ))}
                    </div>
                  </section>
                ) : null}

                {workouts.length > 0 ? <Workouts workouts={workouts} /> : null}
              </main>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function humanize(metric: string) {
  const text = metric.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function NotConnected({ compact }: { compact?: boolean }) {
  return (
    <div className={`rounded-2xl bg-[var(--wd-card)] ${compact ? "px-4 py-3 text-sm" : "px-6 py-12 text-center lg:col-start-2"}`}>
      <p className={compact ? "" : "text-lg font-semibold"}>Connect WHOOP to see recovery, sleep and strain here.</p>
      <Link
        className={`${compact ? "ml-1 underline" : "mt-5 inline-flex rounded-full bg-[var(--wd-ink)] px-5 py-2 text-sm font-medium text-[var(--wd-bg)]"}`}
        to="/connections"
      >
        Connect WHOOP
      </Link>
    </div>
  );
}

function Glance({ rows, hermesRows, today }: { rows: DayRow[]; hermesRows: DayRow[]; today: string }) {
  const recovery = glanceStat(rows, "recoveryScore");
  const strain = glanceStat(rows, "strain");
  const sleepPerf = glanceStat(rows, "sleepPerformancePct");
  const sleepMin = glanceStat(rows, "sleepMinutes");
  const band = recoveryBand(recovery?.value);
  const stale = (s: GlanceStat | null) => (s && s.date !== today ? `, ${shortDate(s.date)}` : "");

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
      {/* One strip, hairline-divided: six readings shouldn't be six boxes. */}
      <dl className="grid grid-cols-2 overflow-hidden rounded-2xl bg-[var(--wd-card)] sm:grid-cols-3 xl:grid-cols-6 [&>div]:border-[var(--wd-grid)] [&>div]:border-b [&>div]:border-r">
        <StatCell format={fmt.int} label="HRV" stat={glanceStat(rows, "hrvMs")} today={today} unit="ms" />
        <StatCell format={fmt.int} label="Resting HR" stat={glanceStat(rows, "restingHr")} today={today} unit="bpm" />
        <StatCell format={fmt.hours} label="Sleep" stat={sleepMin} today={today} unit="h" />
        <StatCell format={fmt.int} label="Steps" stat={glanceStat(rows, "steps")} today={today} />
        <StatCell format={fmt.int} label="Calories" stat={glanceStat(hermesRows, "caloriesKcal")} today={today} unit="kcal" />
        <StatCell format={fmt.one} label="Weight" stat={glanceStat(hermesRows, "weightKg")} today={today} unit="kg" />
      </dl>
    </section>
  );
}

function StatCell({
  label,
  stat,
  unit,
  format,
  today,
}: {
  label: string;
  stat: GlanceStat | null;
  unit?: string;
  format: (v: number) => string;
  today: string;
}) {
  const delta = stat?.delta ?? null;
  const flat = delta !== null && stat?.baseline ? Math.abs(delta / stat.baseline) < 0.02 : false;
  const Icon = delta === null || flat ? Minus : delta > 0 ? ArrowUp : ArrowDown;
  return (
    <div className="px-4 py-3.5">
      <dt className="text-xs text-[var(--wd-muted)]">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
        {stat ? format(stat.value) : "—"}
        {stat && unit ? <span className="ml-1 text-xs font-normal text-[var(--wd-muted)]">{unit}</span> : null}
      </dd>
      <dd className="mt-0.5 flex items-center gap-1 text-[11px] text-[var(--wd-muted)]">
        {!stat ? (
          "No reading yet"
        ) : stat.date !== today ? (
          `Last logged ${shortDate(stat.date)}`
        ) : delta !== null ? (
          <>
            <Icon aria-hidden className="size-3" />
            {flat ? "Same as avg" : `${format(Math.abs(delta))} vs avg`}
          </>
        ) : (
          "First week of data"
        )}
      </dd>
    </div>
  );
}

type ChartSpec = {
  key: string;
  title: string;
  unit?: string;
  color: string;
  format: (v: number) => string;
  transform?: (v: number) => number;
  domain?: [number, number];
  source: "whoop" | "hermes";
};

const CHARTS: ChartSpec[] = [
  { key: "recoveryScore", title: "Recovery", unit: "%", color: "var(--wd-neutral)", format: fmt.pct, domain: [0, 100], source: "whoop" },
  { key: "hrvMs", title: "HRV", unit: "ms", color: "var(--wd-neutral)", format: fmt.int, source: "whoop" },
  { key: "restingHr", title: "Resting heart rate", unit: "bpm", color: "var(--wd-neutral)", format: fmt.int, source: "whoop" },
  { key: "sleepMinutes", title: "Sleep", unit: "h", color: "var(--wd-sleep)", format: fmt.one, transform: (v) => v / 60, source: "whoop" },
  { key: "strain", title: "Day strain", color: "var(--wd-strain)", format: fmt.one, domain: [0, 21], source: "whoop" },
  { key: "steps", title: "Steps", color: "var(--wd-neutral)", format: fmt.int, source: "whoop" },
  { key: "caloriesKcal", title: "Calories", unit: "kcal", color: "var(--wd-neutral)", format: fmt.int, source: "hermes" },
  { key: "weightKg", title: "Weight", unit: "kg", color: "var(--wd-neutral)", format: fmt.one, source: "hermes" },
];

function Charts({
  rows,
  hermesRows,
  range,
  markers,
  showChanges,
}: {
  rows: DayRow[];
  hermesRows: DayRow[];
  range: { from: string; to: string };
  markers: EventMarker[];
  showChanges: boolean;
}) {
  const series = CHARTS.map((c) => {
    const daily = pointsFor(c.source === "whoop" ? rows : hermesRows, c.key)
      .filter((p) => p.date <= range.to)
      .map((p) => ({ date: p.date, value: c.transform ? c.transform(p.value) : p.value }));
    const visible = daily.filter((p) => p.date >= range.from).length;
    return { spec: c, daily, visible };
  });
  const shown = series.filter((s) => s.visible > 0);
  // Lower-case for mid-sentence use, but keep acronyms like HRV as written.
  const empty = series.filter((s) => s.visible === 0).map((s) => (s.spec.title === s.spec.title.toUpperCase() ? s.spec.title : s.spec.title.toLowerCase()));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-[var(--wd-muted)]">
        <span className="flex items-center gap-1.5">
          <svg aria-hidden height="8" width="8">
            <circle cx="4" cy="4" fill="var(--wd-muted)" r="4" />
          </svg>
          Each day
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
          Recovery green, yellow, red
        </span>
      </div>
      {shown.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2">
          {shown.map(({ spec, daily }) => (
            <MetricChart
              average={rollingAverage(daily, 7)}
              color={spec.color}
              daily={daily}
              domain={spec.domain}
              dotColor={spec.key === "recoveryScore" ? (v) => BAND[recoveryBand(v)!].color : undefined}
              format={spec.format}
              key={spec.key}
              markers={markers}
              range={range}
              showMarkers={showChanges}
              title={spec.title}
              unit={spec.unit}
            />
          ))}
        </div>
      ) : null}
      {empty.length > 0 ? (
        <p className="text-sm text-[var(--wd-muted)]">
          No {formatList(empty)} in this range yet. WHOOP fills these in after each night; calories and weight come from your evening check-in.
        </p>
      ) : null}
    </div>
  );
}

function formatList(items: string[]) {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} or ${items.at(-1)}`;
}

const WORKOUTS_SHOWN = 6;

function Workouts({ workouts }: { workouts: Workout[] }) {
  const [all, setAll] = useState(false);
  const sorted = [...workouts].sort((a, b) => b.local_date.localeCompare(a.local_date));
  const ordered = all ? sorted : sorted.slice(0, WORKOUTS_SHOWN);
  return (
    <section className="flex flex-col gap-3" aria-labelledby="workouts">
      <h2 className="text-lg font-semibold" id="workouts">
        Workouts
      </h2>
      <ol className="divide-y divide-[var(--wd-grid)] rounded-2xl bg-[var(--wd-card)]">
        {ordered.map((w) => (
          <li className="flex gap-4 px-4 py-3 text-sm" key={w.local_date}>
            <span className="w-12 shrink-0 text-xs text-[var(--wd-muted)] tabular-nums">{shortDate(w.local_date)}</span>
            <span className="min-w-0">
              <span
                className={`mr-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  w.status === "done"
                    ? "bg-[var(--wd-good)]/15 text-[var(--wd-ink)]"
                    : w.status === "skipped"
                      ? "bg-[var(--wd-track)] text-[var(--wd-muted)]"
                      : "bg-[var(--wd-warning)]/15 text-[var(--wd-ink)]"
                }`}
              >
                {w.status === "done" ? "Done" : w.status === "skipped" ? "Skipped" : "Not confirmed"}
              </span>
              <span className="line-clamp-2">{w.details ?? w.note ?? (w.day_number ? `Day ${w.day_number}` : "")}</span>
            </span>
          </li>
        ))}
      </ol>
      {sorted.length > WORKOUTS_SHOWN ? (
        <button
          className="self-start text-xs font-medium text-[var(--wd-muted)] hover:text-[var(--wd-ink)]"
          onClick={() => setAll((v) => !v)}
          type="button"
        >
          {all ? "Show fewer" : `Show all ${sorted.length}`}
        </button>
      ) : null}
    </section>
  );
}

const TABLE_COLUMNS: Array<{ key: string; label: string; format: (v: number) => string; source: "whoop" | "hermes" }> = [
  { key: "recoveryScore", label: "Recovery %", format: fmt.pct, source: "whoop" },
  { key: "hrvMs", label: "HRV ms", format: fmt.int, source: "whoop" },
  { key: "restingHr", label: "Resting HR", format: fmt.int, source: "whoop" },
  { key: "sleepMinutes", label: "Sleep h", format: fmt.hours, source: "whoop" },
  { key: "strain", label: "Strain", format: fmt.one, source: "whoop" },
  { key: "steps", label: "Steps", format: fmt.int, source: "whoop" },
  { key: "caloriesKcal", label: "kcal", format: fmt.int, source: "hermes" },
  { key: "weightKg", label: "Weight kg", format: fmt.one, source: "hermes" },
];

/** Every value behind the charts, for keyboard and screen-reader access. */
function DataTable({ rows, hermesRows, range }: { rows: DayRow[]; hermesRows: DayRow[]; range: { from: string; to: string } }) {
  const [open, setOpen] = useState(false);
  const dates = [...new Set([...rows, ...hermesRows].map((r) => r.date))]
    .filter((d) => d >= range.from && d <= range.to)
    .sort((a, b) => b.localeCompare(a));
  const lookup = (source: "whoop" | "hermes", date: string) => (source === "whoop" ? rows : hermesRows).find((r) => r.date === date);
  return (
    <div>
      <button
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--wd-muted)] hover:text-[var(--wd-ink)]"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <Table2 aria-hidden className="size-3.5" /> {open ? "Hide" : "Show"} the numbers as a table
      </button>
      {open ? (
        <div className="mt-3 overflow-x-auto rounded-2xl bg-[var(--wd-card)]">
          <table className="w-full min-w-[640px] text-sm tabular-nums">
            <thead>
              <tr className="text-left text-xs text-[var(--wd-muted)]">
                <th className="px-4 py-2.5 font-medium">Date</th>
                {TABLE_COLUMNS.map((c) => (
                  <th className="px-3 py-2.5 text-right font-medium" key={c.key}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--wd-grid)]">
              {dates.map((date) => (
                <tr key={date}>
                  <td className="px-4 py-2">{shortDate(date)}</td>
                  {TABLE_COLUMNS.map((c) => {
                    const value = lookup(c.source, date)?.[c.key];
                    return (
                      <td className="px-3 py-2 text-right" key={c.key}>
                        {typeof value === "number" ? c.format(value) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {dates.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-[var(--wd-muted)]" colSpan={TABLE_COLUMNS.length + 1}>
                    No readings in this range yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
