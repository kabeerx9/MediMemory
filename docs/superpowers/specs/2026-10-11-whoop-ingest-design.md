# WHOOP ingest — design

Date: 2026-10-11 · Status: draft for review · Piece 1 of 3 of the personal health hub

## Goal

Make Caretalk the single store for Kabeer's health data. Piece 1 brings WHOOP
(5.0 band) data into Caretalk's Postgres and exposes it to every MCP client
(Claude, ChatGPT, Hermes). Later pieces build on it:

1. **WHOOP ingest** (this spec): connection, sync, `daily_metrics`, MCP read access.
2. **Dashboard**: a read-only "today at a glance" page and a trends page in the
   Caretalk web app, reading `daily_metrics` and measurement memories.
3. **Hermes as a Caretalk client**: Hermes connects over MCP, writes daily
   check-ins to `daily_metrics` (`source = 'hermes'`), takes reports from
   Telegram through an upload tool, and `health.db` and its copies are retired.

Scope: one user (Kabeer), the **Me** workspace. Family view is out of scope.

## Product rules

- **Web app:** shows data and manages connections (Connect WHOOP, connected
  AI apps). It has no chat and no report upload. Those happen through MCP clients.
- **Writes:** every data write goes through Caretalk's server code paths, never
  direct SQL from another agent.
- **WHOOP data in chat:** loads a short summary automatically and fetches
  detail on demand (option A below).

## Data model

All three tables live in `packages/db/src/schema/health.ts` and follow the
existing conventions: text ids and the `timestamps` helper. Every row is
reached through an owned workspace.

### `device_connections`
One row per connected device source.

| column | notes |
|---|---|
| `id` | text pk |
| `workspace_id` | fk → workspaces, cascade |
| `provider` | `'whoop'` |
| `external_user_id` | WHOOP `user_id`, for diagnostics |
| `refresh_token_enc` | AES-256-GCM ciphertext (iv + tag + data, base64); key `WHOOP_TOKEN_KEY` in server env |
| `access_token_enc`, `access_expires_at` | cached access token, nullable |
| `scopes` | text |
| `status` | `active` · `needs_reconnect` · `revoked` |
| `last_synced_at`, `last_error` | nullable |

Unique index on (`workspace_id`, `provider`).

### `whoop_records`
Raw WHOOP API objects, kept for reprocessing and audit.

| column | notes |
|---|---|
| `id` | text pk |
| `connection_id` | fk → device_connections, cascade |
| `type` | `recovery` · `sleep` · `cycle` · `workout` · `body` |
| `whoop_id` | the record's WHOOP id. Recovery uses its sleep UUID; body uses a fixed `'body'` |
| `starts_at`, `ends_at` | timestamptz, nullable |
| `score_state` | `SCORED` · `PENDING_SCORE` · `UNSCORABLE` |
| `payload` | jsonb, the object exactly as returned |
| `fetched_at` | timestamptz |

Unique index on (`connection_id`, `type`, `whoop_id`). A re-fetch upserts the
row, so a late re-score replaces it instead of adding a duplicate.

### `daily_metrics`
One typed row per day per source. **Always derived**: it is rebuilt from source
records and never edited by hand.

| column | notes |
|---|---|
| `id` | text pk |
| `workspace_id` | fk → workspaces, cascade |
| `date` | `YYYY-MM-DD` in the user's time zone (Asia/Kolkata) |
| `source` | `'whoop'` now; `'hermes'` in piece 3 |
| `recovery_score`, `hrv_ms`, `resting_hr`, `spo2_pct`, `skin_temp_c` | from recovery |
| `sleep_minutes`, `sleep_performance_pct`, `sleep_efficiency_pct`, `respiratory_rate` | from the main (non-nap) sleep |
| `strain`, `kilojoules`, `avg_hr`, `max_hr`, `steps` | from cycle |
| `workout_count`, `workout_strain_max` | from workouts |
| `weight_kg` | WHOOP body measurement; Hermes in piece 3 |
| `calories_kcal`, `exercised` | nullable, reserved for piece 3 |
| `computed_at` | timestamptz |

Unique index on (`workspace_id`, `date`, `source`). Every metric column is
nullable, because a day can be partly scored.

## Date attribution (IST)

- **Recovery and main sleep:** the local date of the sleep's `end`, i.e. the
  morning you woke.
- **Cycle (strain, kJ, heart rate, steps):** the local date of the cycle's `start`.
- **Workouts:** the local date of the workout's `start`.
- **Naps:** sleeps with `nap = true` count toward neither sleep minutes nor
  recovery. If there are several non-nap sleeps on one date, the longest wins.
- **Unscored records:** records whose `score_state` isn't `SCORED` add nothing.
  The day's fields stay null until a later sync re-fetches them.

## WHOOP connection flow

1. On the connections page in the web app, **Connect WHOOP** calls
   `GET /api/whoop/connect`. That creates a `state` value (CSRF + PKCE, stored
   server-side for 10 minutes, bound to the user and workspace) and redirects to
   `https://api.prod.whoop.com/oauth/oauth2/auth` with these scopes:
   `read:recovery read:sleep read:cycles read:workout read:body_measurement offline`.
2. `GET /api/whoop/callback`:
   1. Verify the `state`.
   2. Exchange the code at `/oauth/oauth2/token`.
   3. Fetch the profile (`external_user_id`).
   4. Upsert the connection as `active`.
   5. Start a full backfill in the background.
   6. Redirect to the connections page.
3. The page shows the status, the last sync time, **Sync now**, and **Disconnect**.
   Disconnect calls `DELETE /v2/user/access`, deletes both tokens, and sets
   `revoked`. Already-ingested data is **kept**. Deleting WHOOP data is out of scope.
4. The redirect URI `https://<host>/api/whoop/callback` is registered in the
   WHOOP developer dashboard. Kabeer creates the app; the client id and secret
   go in the server `.env` as `WHOOP_CLIENT_ID` and `WHOOP_CLIENT_SECRET`.

### Token rotation safety
WHOOP rotates the refresh token on every refresh, which invalidates the old one.
- **Lock:** each refresh runs inside a Postgres advisory lock keyed on the
  connection id.
- **Order:** the new refresh token and access token are committed **before** the
  access token is used.
- **Failure:** if the refresh fails (400/401), the status becomes
  `needs_reconnect` and the error is recorded. Syncs stop until Kabeer
  reconnects. The status is shown on the connections page and in the MCP
  context block.

## Sync

- **Where it runs:** an in-process scheduler in `caretalk.service`, which is a
  single instance. It runs at startup, then every 3 hours.
- **Other triggers:** **Sync now** in the web app, and the MCP tool `sync_daily_metrics`.
- **Overlap guard:** `pg_try_advisory_lock` per connection. If a sync is already
  running, the new request returns "already syncing".
- **Window:** from `last_synced_at - 48h` (or the beginning of history on first
  sync) to now. It covers `cycle`, `recovery`, `activity/sleep` and
  `activity/workout`, with `limit=25` following `next_token`. Body measurements
  are fetched once per run.
- **Per page:** records are upserted into `whoop_records`.
- **After fetching:** `daily_metrics` is recomputed for every local date
  touched by a fetched record. Then `last_synced_at` is set to the run's start time.
- **Webhooks:** not used. They would add a public endpoint plus signature
  checks, and polling is still needed for cycles and to catch missed events.

## MCP surface

- **`get_workspace_context`:** for a workspace that has a WHOOP connection, the
  context gains a **"Daily tracking — last 7 days"** block (about 5 lines). It
  shows the 7-day average recovery, HRV, resting HR, sleep hours, and strain,
  the change against the previous 7 days, the number of days with no data, and
  the connection status if it isn't `active`. Workspaces without a connection
  don't get the block.
- **`get_daily_metrics({ workspaceId, from, to, metrics? })`** (new, read-only):
  returns one row per date and source. The range is capped at 366 days, and the
  ownership check matches the existing tools.
- **`sync_daily_metrics({ workspaceId })`** (new): runs a sync now and returns a
  summary (records fetched, dates recomputed, status).
- **Writes:** no MCP tool writes `daily_metrics` directly. The Hermes write tool
  comes in piece 3.

## Error handling

| Situation | Behaviour |
|---|---|
| 401 on a data call | One refresh, then retry once; if the refresh fails → `needs_reconnect` |
| 429 / 5xx | Exponential backoff, at most 3 tries, then stop the run. The next run's 48-hour overlap fills the gap |
| A payload that won't parse into metrics | Keep the raw row, log it, skip that date's metric; the other dates still compute |
| A `PENDING_SCORE` record | Stored; contributes nothing until it's re-scored |
| Server restart mid-sync | The lock is released when the session ends; the next run redoes the overlap window |

## Testing

- **Unit:** `whoop → daily_metrics` mapping from fixture payloads for every
  record type. Cases:
  - the IST boundary (a sleep ending at 00:30 IST vs 23:30 UTC)
  - naps excluded
  - the longest main sleep wins
  - `PENDING_SCORE` ignored
  - missing optional fields
- **Postgres** (`*.postgres.test.ts`), sync against a fake WHOOP HTTP server:
  - pagination
  - an idempotent re-run (no duplicate rows)
  - the rotated refresh token is saved before use
  - a refresh failure → `needs_reconnect`
  - a concurrent sync is refused by the lock
  - token encryption round-trip
- **MCP:**
  - `get_daily_metrics` rejects a workspace the caller doesn't own and caps the range
  - the context block appears only when a connection exists
- **Smoke test on the VPS:**
  1. Connect the real band.
  2. Check the row counts.
  3. Run one Claude chat that reads the 7-day block.

## Deployment

- **Schema:** pushed with `drizzle-kit push` over the SSH tunnel, as in the
  existing redeploy steps.
- **Environment:** new variables `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET` and
  `WHOOP_TOKEN_KEY` (32 random bytes, base64) in
  `/home/ubuntu/apps/caretalk/.env`. The nightly backup already copies
  `server.env`. Without `WHOOP_TOKEN_KEY` the stored tokens can't be decrypted
  (just reconnect).
- **Memory:** the sync adds no new process and fits the existing 250 MB cap.

## Out of scope

- Webhooks
- Deleting WHOOP data
- Family devices
- The dashboard UI (piece 2)
- Hermes writes and Telegram report intake (piece 3)
- Moving to a real domain. When that happens, the WHOOP redirect URI changes too.
