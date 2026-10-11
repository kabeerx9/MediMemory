import { boolean, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { workspaces } from "./health";

// Hermes's daily check-in tracker, moved here from its own SQLite file. The
// shapes mirror that store one-to-one (the Hermes CLI keeps its validation and
// workflow; only storage moved), keyed by workspace + local date. Confirmed
// check-ins are also projected into daily_metrics (source 'hermes') for the
// dashboard and MCP clients.

const tz = { withTimezone: true } as const;

export const trackerCheckins = pgTable(
  "tracker_checkins",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    localDate: text("local_date").notNull(),
    caloriesKcal: integer("calories_kcal").notNull(),
    exercised: boolean("exercised").notNull(),
    steps: integer("steps"),
    weightTenthsKg: integer("weight_tenths_kg"),
    note: text("note"),
    createdAt: timestamp("created_at", tz).notNull(),
    updatedAt: timestamp("updated_at", tz).notNull(),
    confirmedAt: timestamp("confirmed_at", tz).notNull(),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.localDate] })],
);

// pending → confirmed lifecycle that drives the 21:00 prompt and the reminder.
export const trackerCheckinState = pgTable(
  "tracker_checkin_state",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    localDate: text("local_date").notNull(),
    status: text("status").notNull(),
    promptedAt: timestamp("prompted_at", tz).notNull(),
    reminderSentAt: timestamp("reminder_sent_at", tz),
    completedAt: timestamp("completed_at", tz),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.localDate] })],
);

export const workoutLogs = pgTable(
  "workout_logs",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    localDate: text("local_date").notNull(),
    dayNumber: integer("day_number"),
    note: text("note"),
    // unknown | done | skipped
    status: text("status").notNull(),
    details: text("details"),
    planId: text("plan_id"),
    createdAt: timestamp("created_at", tz).notNull(),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.localDate] })],
);

// AI-proposed workout plans. payloadJson is the client's canonical JSON,
// stored byte-for-byte: idempotency compares it exactly, and the history
// fingerprint inside it is computed by the Python client.
export const workoutPlans = pgTable(
  "workout_plans",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    planId: text("plan_id").notNull(),
    localDate: text("local_date").notNull(),
    horizonEnd: text("horizon_end").notNull(),
    historyFingerprint: text("history_fingerprint").notNull(),
    payloadJson: text("payload_json").notNull(),
    // The client's own UTC ISO string, kept verbatim: Python writes
    // microseconds and a JS Date would truncate them to milliseconds,
    // changing a value the client compares and orders by.
    createdAtUtc: text("created_at_utc").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.planId] }),
    index("workout_plans_window_idx").on(table.workspaceId, table.localDate, table.horizonEnd),
  ],
);

// Personal access tokens for non-OAuth clients (the Hermes CLI). Bound to one
// workspace; only a sha256 of the token is stored, the token itself is shown
// once at creation.
export const apiTokens = pgTable(
  "api_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    createdAt: timestamp("created_at", tz).defaultNow().notNull(),
    lastUsedAt: timestamp("last_used_at", tz),
    revokedAt: timestamp("revoked_at", tz),
  },
  (table) => [uniqueIndex("api_tokens_hash_idx").on(table.tokenHash), index("api_tokens_user_idx").on(table.userId)],
);
