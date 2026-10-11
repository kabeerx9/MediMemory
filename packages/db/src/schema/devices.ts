import { boolean, doublePrecision, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { workspaces } from "./health";

// Wearable data (WHOOP today). Kept apart from `memories`: a daily recovery
// score is a time series, not a fact the model should reason over one row at
// a time. All timestamps here are timestamptz — sync windows and token expiry
// are absolute instants, and the server's local zone must not leak into them.

const tz = { withTimezone: true } as const;

export const deviceConnections = pgTable(
  "device_connections",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    externalUserId: text("external_user_id"),
    // AES-256-GCM blobs (see apps/server/src/whoop/crypto.ts). Nulled on
    // disconnect; the connection row stays so ingested data keeps its owner.
    refreshTokenEnc: text("refresh_token_enc"),
    accessTokenEnc: text("access_token_enc"),
    accessExpiresAt: timestamp("access_expires_at", tz),
    scopes: text("scopes"),
    // active | needs_reconnect | revoked
    status: text("status").notNull().default("active"),
    lastSyncedAt: timestamp("last_synced_at", tz),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", tz).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", tz)
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("device_connections_workspace_provider_idx").on(table.workspaceId, table.provider)],
);

// Raw WHOOP objects exactly as the API returned them: the audit trail and
// the input to every daily_metrics rebuild. A re-fetch upserts on the natural
// key, so a late re-score replaces the row instead of duplicating it.
export const whoopRecords = pgTable(
  "whoop_records",
  {
    id: text("id").primaryKey(),
    connectionId: text("connection_id")
      .notNull()
      .references(() => deviceConnections.id, { onDelete: "cascade" }),
    // recovery | sleep | cycle | workout | body
    type: text("type").notNull(),
    whoopId: text("whoop_id").notNull(),
    startsAt: timestamp("starts_at", tz),
    endsAt: timestamp("ends_at", tz),
    scoreState: text("score_state"),
    payload: jsonb("payload").notNull(),
    fetchedAt: timestamp("fetched_at", tz).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("whoop_records_natural_idx").on(table.connectionId, table.type, table.whoopId),
    index("whoop_records_starts_idx").on(table.connectionId, table.startsAt),
  ],
);

// One derived row per (workspace, local date, source). Always rebuilt from
// source records, never edited: a mapping bug is fixed by fixing the code
// and re-deriving. Every metric is nullable — a day can be partly scored.
export const dailyMetrics = pgTable(
  "daily_metrics",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    // whoop | hermes
    source: text("source").notNull(),
    recoveryScore: doublePrecision("recovery_score"),
    hrvMs: doublePrecision("hrv_ms"),
    restingHr: doublePrecision("resting_hr"),
    spo2Pct: doublePrecision("spo2_pct"),
    skinTempC: doublePrecision("skin_temp_c"),
    sleepMinutes: doublePrecision("sleep_minutes"),
    sleepPerformancePct: doublePrecision("sleep_performance_pct"),
    sleepEfficiencyPct: doublePrecision("sleep_efficiency_pct"),
    respiratoryRate: doublePrecision("respiratory_rate"),
    strain: doublePrecision("strain"),
    kilojoules: doublePrecision("kilojoules"),
    avgHr: doublePrecision("avg_hr"),
    maxHr: doublePrecision("max_hr"),
    steps: integer("steps"),
    workoutCount: integer("workout_count"),
    workoutStrainMax: doublePrecision("workout_strain_max"),
    weightKg: doublePrecision("weight_kg"),
    // Reserved for Hermes check-ins (piece 3).
    caloriesKcal: doublePrecision("calories_kcal"),
    exercised: boolean("exercised"),
    computedAt: timestamp("computed_at", tz).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("daily_metrics_natural_idx").on(table.workspaceId, table.date, table.source)],
);

// Single-use OAuth `state` for the WHOOP connect flow: binds the callback to
// the signed-in user and the workspace they started from, and expires fast.
export const whoopOauthStates = pgTable("whoop_oauth_states", {
  state: text("state").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", tz).notNull(),
});
