import { useState } from "react";

import type { healthApi } from "@/features/health/api";

import { shortDate } from "./metric-chart";
import { zoneBar } from "./shape";

// WHOOP's per-workout heart-rate detail. The public API has no continuous
// heart-rate line, but it does give time in each zone; one bar per session
// shows how hard it was. Minutes are also written out, so colour is never
// the only carrier of the number.

type WhoopWorkout = Awaited<ReturnType<typeof healthApi.getWhoopWorkouts>>["workouts"][number];

const SHOWN = 5;
const ZONE_NAMES = ["", "Zone 1", "Zone 2", "Zone 3", "Zone 4", "Zone 5"];

export function WhoopWorkouts({ workouts }: { workouts: WhoopWorkout[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? workouts : workouts.slice(0, SHOWN);
  return (
    <section className="flex flex-col gap-3" aria-labelledby="hr-zones">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold" id="hr-zones">
            Heart rate in workouts
          </h2>
          <p className="text-sm text-[var(--wd-muted)]">Time in each heart-rate zone, from WHOOP. Zone 5 is the hardest.</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-[var(--wd-muted)]" aria-hidden>
          Zone
          {[1, 2, 3, 4, 5].map((z) => (
            <span className="flex items-center gap-1" key={z}>
              <span className="inline-block size-2.5 rounded-sm" style={{ background: `var(--wd-z${z})` }} />
              {z}
            </span>
          ))}
        </div>
      </div>
      <ol className="divide-y divide-[var(--wd-grid)] rounded-2xl bg-[var(--wd-card)]">
        {shown.map((w) => {
          const bar = zoneBar(w.zoneMinutes);
          return (
            <li className="flex flex-col gap-2 px-4 py-3" key={w.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="text-sm">
                  <span className="mr-2 text-xs text-[var(--wd-muted)] tabular-nums">{shortDate(w.date)}</span>
                  <span className="font-medium">{w.sport}</span>
                  {w.durationMinutes !== null ? <span className="text-[var(--wd-muted)]"> · {w.durationMinutes} min</span> : null}
                </p>
                <p className="text-xs text-[var(--wd-muted)] tabular-nums">
                  {w.strain !== null ? `Strain ${w.strain.toFixed(1)}` : null}
                  {w.avgHr !== null ? ` · avg ${Math.round(w.avgHr)} bpm` : null}
                  {w.maxHr !== null ? ` · max ${Math.round(w.maxHr)} bpm` : null}
                </p>
              </div>
              {bar.segments.length > 0 ? (
                <>
                  <div
                    aria-label={`Heart-rate zones: ${bar.segments.map((s) => `${ZONE_NAMES[s.zone]} ${s.minutes} min`).join(", ")}`}
                    className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full"
                    role="img"
                  >
                    {bar.segments.map((s) => (
                      <span
                        className="h-full first:rounded-l-full last:rounded-r-full"
                        key={s.zone}
                        style={{ width: `${s.share * 100}%`, background: `var(--wd-z${s.zone})` }}
                        title={`${ZONE_NAMES[s.zone]}: ${s.minutes} min`}
                      />
                    ))}
                  </div>
                  <p className="text-[11px] text-[var(--wd-muted)] tabular-nums">
                    {bar.segments.map((s) => `Z${s.zone} ${s.minutes} min`).join("  ·  ")}
                  </p>
                </>
              ) : (
                <p className="text-[11px] text-[var(--wd-muted)]">No heart-rate zone data for this session.</p>
              )}
            </li>
          );
        })}
      </ol>
      {workouts.length > SHOWN ? (
        <button
          className="self-start text-xs font-medium text-[var(--wd-muted)] hover:text-[var(--wd-ink)]"
          onClick={() => setAll((v) => !v)}
          type="button"
        >
          {all ? "Show fewer" : `Show all ${workouts.length}`}
        </button>
      ) : null}
    </section>
  );
}
