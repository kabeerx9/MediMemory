# WHOOP Ingest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pull WHOOP data into Caretalk's Postgres, derive one `daily_metrics` row per IST day, and expose it to MCP clients and the connections page.

**Architecture:** Everything lives in the `server` app, in a new
`apps/server/src/whoop/` module, split into small focused files:

| File | Responsibility |
|---|---|
| `crypto.ts` | token encryption |
| `client.ts` | the WHOOP HTTP client |
| `metrics.ts` | pure mapping from raw records to daily rows |
| `summary.ts` | the 7-day context block |
| `repository.ts` | database access |
| `sync.ts` | orchestration, with the advisory lock |
| `scheduler.ts` | running the sync on a timer |

Three thin layers sit on top:

- **HTTP routes:** `routes/whoop.ts`, which handles connect, callback, status,
  sync and disconnect.
- **MCP tools:** two new tools plus the context block, wired into `mcp/server.ts`.
- **Web:** a WHOOP card on the connections page.

**Tech Stack:** Fastify 5, Drizzle ORM (node-postgres), zod 4,
`@modelcontextprotocol/server`, vitest 4, React + TanStack Router, and
`node:crypto` AES-256-GCM.

**Spec:** `docs/superpowers/specs/2026-10-11-whoop-ingest-design.md`

## Global Constraints

- **Scopes:** `read:recovery read:sleep read:cycles read:workout read:body_measurement offline`.
- **URLs:**
  - Authorize: `https://api.prod.whoop.com/oauth/oauth2/auth`
  - Token: `https://api.prod.whoop.com/oauth/oauth2/token`
  - API base: `https://api.prod.whoop.com/developer`
- **Pagination:** `limit=25` plus `nextToken`.
- **Day boundaries:** IST (`Asia/Kolkata`, from `APP_TIMEZONE`).
- **Dating rules:**
  - Main sleep and its recovery count toward the local date of the sleep's `end`.
  - A cycle counts toward the wake date of its main sleep, matched on `sleep.cycle_id`.
  - With no main sleep yet, a cycle counts toward the local date of
    `start + 12h`, because cycles begin at sleep onset.
  - Workouts count toward the local date of their `start`.
  - Naps (`nap = true`) are ignored. When a date has several main sleeps, the
    longest `total_in_bed_time_milli` wins.
  - Records whose `score_state` isn't `SCORED` add nothing.
- **Sync timing:** every 3 hours, once at startup, and on demand. Each run
  re-fetches from `last_synced_at - 48h`.
- **Writes:** the WHOOP data never gets a write tool on the MCP surface.
- **Disconnect:** existing data is kept.
- **Disabled state:** without `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET` and
  `WHOOP_TOKEN_KEY` set, the feature is off. The routes return a clear 503,
  the scheduler doesn't start, and the MCP tools say WHOOP isn't configured.
- **Deviation from the spec:** WHOOP's OAuth docs don't mention PKCE. The
  connect flow uses a server-stored random `state` (CSRF protection) with a
  confidential client secret, and doesn't use PKCE.

## Review Focus

1. **A rotated refresh token is saved before it's used.** A crash after a
   refresh must never leave the database holding the dead token. *Test:* sync
   test "persists rotated refresh token".
2. **Re-running a sync over the same window doesn't duplicate anything.** *Test:*
   sync test "idempotent rerun".
3. **A sleep ending just after midnight IST lands on the IST date, not the UTC
   one.** *Test:* metrics test "IST boundary".
4. **A second sync while one is running is refused, not run twice.** *Test:* sync
   test "lock refuses concurrent run".
5. **An MCP caller can't read another user's metrics, even with a valid
   workspace id.** *Test:* tools test "rejects foreign workspace".

---

### Task 1: Env, schema, token crypto

**Files:**
- Modify: `packages/env/src/server.ts` (add WHOOP vars)
- Modify: `packages/db/src/schema/health.ts` (add 4 tables)
- Create: `apps/server/src/whoop/crypto.ts`
- Create: `apps/server/src/whoop/config.ts`
- Test: `apps/server/src/whoop/crypto.test.ts`

**Interfaces produced:**
- Env vars:
  - `WHOOP_CLIENT_ID?`
  - `WHOOP_CLIENT_SECRET?`
  - `WHOOP_TOKEN_KEY?` (base64 of 32 bytes)
  - `WHOOP_API_BASE` (default `https://api.prod.whoop.com`)
  - `WHOOP_SYNC_INTERVAL_MS` (default 3h)
- `whoopConfig(): { clientId; clientSecret; key: Buffer; apiBase: string } | null`
- `encryptToken(plain: string, key: Buffer): string` and
  `decryptToken(blob: string, key: Buffer): string`
- Tables: `deviceConnections`, `whoopRecords`, `dailyMetrics` and
  `whoopOauthStates`. `whoopOauthStates` holds the state value, `userId`,
  `workspaceId` and `expiresAt`.

Steps:
- [ ] Write `crypto.test.ts` with three tests: the round-trip returns the
  original value, two encryptions of the same value differ (random IV), and a
  tampered value throws.
- [ ] Run it and confirm it fails.
- [ ] Implement AES-256-GCM. The blob format is `v1.<iv b64>.<tag b64>.<ct b64>`.
- [ ] Run it and confirm it passes.
- [ ] Add the env vars and the tables (columns as in the spec, plus the
  indexes), then run `pnpm check-types`.
- [ ] Run `pnpm db:push` against the local dev DB on :5434.
- [ ] Commit.

### Task 2: Metrics mapping (pure)

**Files:** create `apps/server/src/whoop/types.ts` and
`apps/server/src/whoop/metrics.ts`; test in `apps/server/src/whoop/metrics.test.ts`.

**Interfaces produced:**
- `type WhoopRecordType = "recovery" | "sleep" | "cycle" | "workout" | "body"`
- `type RawRecord = { type: WhoopRecordType; whoopId: string; payload: any }`
- `type DailyMetricValues = { recoveryScore, hrvMs, restingHr, spo2Pct, skinTempC, sleepMinutes, sleepPerformancePct, sleepEfficiencyPct, respiratoryRate, strain, kilojoules, avgHr, maxHr, steps, workoutCount, workoutStrainMax, weightKg }`.
  Every field is `number | null`.
- `computeDailyMetrics(records: RawRecord[], timeZone: string): Map<string /*YYYY-MM-DD*/, DailyMetricValues>`
- `datesTouched(records: RawRecord[], timeZone: string): Set<string>`
- `localDate(iso: string, timeZone: string): string`

Steps:
- [ ] Write the tests:
  - **IST boundary:** a sleep ending `2026-10-10T19:00:00Z` (00:30 IST) maps to `2026-10-11`.
  - **Naps:** a nap is ignored.
  - **Longest sleep wins:** the longer of two main sleeps is used.
  - **Unscored records:** a `PENDING_SCORE` recovery is ignored.
  - **Cycles with a sleep:** a cycle is dated by its sleep's wake date.
  - **Cycles without a sleep:** an orphan cycle starting `2026-10-11T17:30:00Z`
    (23:00 IST) maps to `2026-10-12`.
  - **Workouts:** count and max strain are computed per date.
  - **Body:** weight goes on the latest date that has other data, or on today
    if there's none.
  - **Missing fields:** a missing `spo2_percentage` gives null.
- [ ] Run them and confirm they fail.
- [ ] Implement.
- [ ] Run them and confirm they pass.
- [ ] Commit.

### Task 3: WHOOP HTTP client

**Files:** create `apps/server/src/whoop/client.ts`; test in
`apps/server/src/whoop/client.test.ts`, which uses a local `node:http` fake server.

**Interfaces produced:**
- `class WhoopAuthError extends Error`: thrown when a refresh or code exchange
  is rejected (400 or 401).
- `exchangeCode(cfg, code, redirectUri): Promise<TokenSet>` and
  `refreshTokens(cfg, refreshToken): Promise<TokenSet>`.
  `TokenSet = { accessToken; refreshToken; expiresAt: Date; scope: string }`.
- `listAll(cfg, accessToken, path, params: {start?: string; end?: string}): Promise<any[]>`.
  It follows `next_token`, retries 429/5xx up to 3 times with backoff
  (base delay injectable for tests), and throws `WhoopUnauthorizedError` on 401.
- `getJson(cfg, accessToken, path)` and `getProfile`.
- `revokeAccess(cfg, accessToken): Promise<void>`
- `authorizeUrl(cfg, state, redirectUri): string`

Steps:
- [ ] Write the tests:
  - pagination over 2 pages
  - a 429 followed by success, which retries
  - a 401, which throws `WhoopUnauthorizedError`
  - a refresh sends the form body with `scope=offline`
  - a 400 on refresh throws `WhoopAuthError`
- [ ] Run them and confirm they fail.
- [ ] Implement.
- [ ] Run them and confirm they pass.
- [ ] Commit.

### Task 4: Repository + sync with lock

**Files:** create `apps/server/src/whoop/repository.ts` and
`apps/server/src/whoop/sync.ts`; test in
`apps/server/src/whoop/sync.postgres.test.ts`, which runs against Postgres and
the fake WHOOP server.

**Interfaces produced:**
- `syncConnection(connectionId: string, opts?: { now?: Date }): Promise<SyncResult>`.
  `SyncResult = { status: "ok" | "busy" | "needs_reconnect" | "error"; fetched: number; datesRecomputed: number; message?: string }`.
- `syncWorkspace(userId, workspaceId): Promise<SyncResult>`. It checks
  ownership and throws `notFound` if there's no connection.
- Repository functions:
  - `upsertConnection`
  - `getConnectionForWorkspace(workspaceId)`
  - `listActiveConnections()`
  - `upsertRecords(connectionId, records)`
  - `loadRecordsForDates(connectionId, dates, timeZone)`, which returns raw
    records whose dates touch the given ones, including joined sleeps for
    recoveries and cycles
  - `replaceDailyMetrics(workspaceId, "whoop", Map)`
  - `getDailyMetrics(workspaceId, from, to)`
  - `markStatus`

The lock is `pg_try_advisory_lock(hashtext('whoop:' || id))`, run on a
dedicated client from the pool and released in a `finally`. A token refresh
saves the new tokens **before** any data call.

Steps:
- [ ] Write the Postgres tests:
  - **Backfill:** the first sync stores records and daily rows.
  - **Idempotent re-run:** row counts don't change.
  - **Rotated refresh token:** the refresh token is persisted, and the fake
    server rejects the old one.
  - **Failed refresh:** a refresh 400 sets `needs_reconnect`.
  - **Lock:** with the lock held from another connection, the sync returns `busy`.
  - **Window:** after the first run, the second run requests
    `start = last_synced_at - 48h`.
- [ ] Run them with `RUN_DB_TESTS=1` and confirm they fail.
- [ ] Implement.
- [ ] Run them and confirm they pass.
- [ ] Commit.

### Task 5: Routes + scheduler

**Files:** create `apps/server/src/routes/whoop.ts` and
`apps/server/src/whoop/scheduler.ts`; modify `apps/server/src/app.ts` (register
the routes) and `apps/server/src/index.ts` (start the scheduler after
`listen`). Add the contracts schema `whoopStatusSchema` to
`packages/contracts/src/health.ts`.

**Routes:**

| Method | Path | Does |
|---|---|---|
| GET | `/api/whoop/connect?workspaceId=` | Session required. Checks you own the workspace, stores the state (10 minutes), and redirects to WHOOP |
| GET | `/api/whoop/callback?code&state` | Consumes the state once, exchanges the code, upserts the connection, starts a backfill in the background, then redirects to `${CORS_ORIGIN}/connections?whoop=connected` (or `whoop=error`) |
| GET | `/api/v1/whoop?workspaceId=` | Returns `{ configured, connection: null \| { status, lastSyncedAt, lastError } }` |
| POST | `/api/v1/whoop/sync` | Body `{workspaceId}`; returns `SyncResult` |
| DELETE | `/api/v1/whoop?workspaceId=` | Revokes access (best effort), deletes the tokens, sets `revoked` |

The scheduler is `startWhoopScheduler(): () => void`. It does nothing if WHOOP
isn't configured. Otherwise it runs once immediately and then on an interval,
and runs connections one after another, never in parallel.

Steps:
- [ ] Write the test `routes/whoop.test.ts`:
  - with WHOOP unconfigured, the status route reports `configured: false`
  - the callback rejects an unknown state with a redirect to `whoop=error`

  Both use Fastify `inject` with the session helper mocked via `vi.mock("../lib/auth")`.
- [ ] Implement.
- [ ] Run the tests and confirm they pass.
- [ ] Run type-checks.
- [ ] Commit.

### Task 6: MCP tools + context block

**Files:**
- Create: `apps/server/src/whoop/summary.ts` and `apps/server/src/whoop/tools.ts`
  (the tool logic as plain functions)
- Modify: `apps/server/src/mcp/server.ts`, `apps/server/src/mcp/context.ts`
- Test: `apps/server/src/whoop/summary.test.ts` (unit) and
  `apps/server/src/whoop/tools.postgres.test.ts`

**Interfaces produced:**
- `buildDailySummary(rows: DailyMetricRow[], today: string, status: string): string[]`.
  It returns the "Daily tracking — last 7 days" lines: the 7-day averages, the
  change against the previous 7 days, the number of missing days, and the
  status if it isn't active.
- `getDailyMetricsForCaller(userId, workspaceId, from, to, metrics?)`. It
  throws a 400 when the range is over 366 days or `from > to`.
- `dailySummaryForWorkspace(workspaceId, today): Promise<string[] | null>`.
  It returns null when there's no connection.
- `buildMcpContext` gains an optional `dailySummary?: string[] | null`.

**MCP tools:**
- `get_daily_metrics`: read-only.
- `sync_daily_metrics`: runs a sync, so it isn't read-only, but it's
  idempotent and touches no external state.

Steps:
- [ ] Write the tests:
  - **Unit:** the averages, the trend arrow, missing days, and no block when
    there are no rows but a connection exists (it says "no data yet").
  - **Postgres:** a foreign workspace is rejected, a range over 366 days is
    rejected, and the rows are returned in date order.
- [ ] Implement and wire into `server.ts`. Update `INSTRUCTIONS` with one
  sentence on daily metrics.
- [ ] Run the tests and confirm they pass.
- [ ] Commit.

### Task 7: Web connections card

**Files:**
- Modify: `apps/web/src/features/health/api.ts` (add `getWhoop`,
  `syncWhoop`, `disconnectWhoop` and `whoopConnectUrl`)
- Modify: `apps/web/src/features/connect/connections-page.tsx` (add a
  "Devices" section with a WHOOP card)

The card's states:
- Not configured: hidden, with a small note.
- Not connected: a **Connect WHOOP** link to the server's connect URL.
- Active: the last sync time, **Sync now** and **Disconnect**.
- `needs_reconnect`: a warning plus **Reconnect**.

The workspace is the one named "Me", or the first workspace if there's no "Me".
It reads the `?whoop=` query to show a toast.

Steps:
- [ ] Implement.
- [ ] Run `pnpm check-types`.
- [ ] Run the web tests.
- [ ] Commit.

### Task 8: Deploy + smoke test

- [ ] Run the full `pnpm test` and `RUN_DB_TESTS=1` suites, plus check-types.
- [ ] Build the server bundle and the web app, following the Obsidian note's
  redeploy steps.
- [ ] Back up the production DB (`pg_dump`) before pushing the schema, then run
  `drizzle-kit push` through the tunnel.
- [ ] Add the env vars on the VPS, rsync the builds, restart `caretalk`, and
  check the health and status routes.
- [ ] After Kabeer creates the WHOOP app and adds its credentials: connect the
  band, sync, check the row counts, and run one MCP `get_workspace_context`
  that shows the block.
