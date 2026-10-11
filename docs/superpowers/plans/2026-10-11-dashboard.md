# Personal Dashboard Plan (piece 2 of 3)

**Goal:** `/dashboard`: a read-only "today at a glance" view plus trends that put WHOOP daily metrics, charted medical measurements, and dated medication/event facts on one date axis.

**Design (agreed in chat, user waived written-spec review):**
- **Workspace:** "Me", or the first workspace if there's no "Me" (same picker as the WHOOP card).
- **Glance:**
  - recovery hero number with a WHOOP band: good ≥67, warning 34–66, critical <34, always shown with a text label
  - HRV, resting HR, sleep hours plus performance, strain, steps, each with its change against the 7-day average
  - last-synced time and Sync now
- **Trends:**
  - a 30 / 90 / 365-day preset row, above the charts and scoping all of them
  - small multiples on a shared x domain: recovery, HRV, resting HR, sleep, strain, steps; daily dots plus a 7-day rolling average line in one hue
  - charted measurements from memories in range
- **Links:** medication/event memories in range drawn as neutral vertical markers on every chart; hovering shows the fact.
- **Interaction:** hover/keyboard crosshair tooltip on each chart; a table view toggle.
- **Server:** `GET /api/v1/daily-metrics?workspaceId&from&to`, read-only and owner-checked, reusing `getDailyMetricsForCaller`.
- **No new dependencies:** hand-rolled SVG, like `features/health/trends.tsx`.

## Tasks
1. Server endpoint plus an ownership test (Postgres) — `apps/server/src/routes/whoop.ts`, `routes/whoop.postgres.test.ts`.
2. Pure data shaping, test-first — `apps/web/src/features/dashboard/shape.ts`:
   - `rangeFor`
   - `rollingAverage` (calendar-day window, not index)
   - `glanceStat` (latest value vs the average of the previous 7 days)
   - `recoveryBand`
   - `eventMarkers` (medication/event memories in range)
   - `measurementSeriesInRange`
3. Components — `features/dashboard/{dashboard-page,metric-chart,glance}.tsx`; route `routes/dashboard.tsx`; a header link.
4. Visual check in a browser with seeded local data, in light and dark themes; then deploy.
