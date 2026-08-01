import { relations } from "drizzle-orm";
import {
  doublePrecision,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

const timestamps = {
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
};

export const workspaces = pgTable(
  "workspaces",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    // Model-maintained "core memory" block, always injected into chat context.
    // Rewritten in full by the update_profile tool; user-editable in the UI.
    profile: text("profile"),
    ...timestamps,
  },
  (table) => [index("workspaces_owner_idx").on(table.ownerUserId)],
);

// Immutable raw inputs (pasted transcripts, imports). Never mutated after insert:
// this is the audit trail and the reprocessing input if extraction improves.
export const sources = pgTable(
  "sources",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title"),
    content: text("content"),
    // sha256 of the import payload (text and/or file bytes). The import path is
    // expensive and non-idempotent — re-running the same document would extract
    // every fact a second time — so this is the dedup key. Postgres treats NULLs
    // as distinct in a unique index, so pre-existing rows (and non-import
    // sources) never collide.
    contentHash: text("content_hash"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("sources_workspace_idx").on(table.workspaceId),
    uniqueIndex("sources_workspace_hash_idx").on(table.workspaceId, table.contentHash),
  ],
);

// Every profile change appends the PREVIOUS text here before overwriting.
// The profile is otherwise the one destructive write in the system (both the
// update_profile tool and manual edits fully replace it) while it is also the
// block injected into every prompt — a bad rewrite silently degrades every
// later turn with nothing to diff against.
export const profileVersions = pgTable(
  "profile_versions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    // Nullable: the snapshot taken before the first-ever profile is written.
    profile: text("profile"),
    // Who overwrote it: "model" (update_profile tool) | "user" (rail edit) |
    // "restore" (rollback to an earlier version).
    changedBy: text("changed_by").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("profile_versions_workspace_idx").on(table.workspaceId, table.createdAt)],
);

// One atomic fact per row, append-only. A fact is never edited by the model or
// deleted on change — it is superseded: the new row points nowhere, the old row
// gets supersededById set. "Active memory" = rows where supersededById IS NULL.
export const memories = pgTable(
  "memories",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    // Soft tag, not a validation gate: measurement | medication | symptom |
    // event | appointment | question | note. Unknown values are tolerated.
    kind: text("kind").notNull().default("note"),
    // When the fact occurred (YYYY-MM-DD) — distinct from createdAt (when the
    // user told us). Braindumps arrive days late; conflating the two breaks
    // "what was true in March" queries (bitemporal split).
    happenedOn: text("happened_on"),
    // Optional structured shadow of a measurement, filled by the model alongside
    // the prose. `content` stays authoritative and human-readable; these exist
    // only so a series can be charted ("hemoglobin over two years"), which is
    // impossible when every value is locked inside a sentence. Null on every
    // non-measurement memory.
    metric: text("metric"),
    value: doublePrecision("value"),
    // Second half of a paired reading — diastolic for blood pressure. Keeps
    // "138/86" one memory instead of splitting a single observation in two.
    valueSecondary: doublePrecision("value_secondary"),
    unit: text("unit"),
    sourceId: text("source_id").references(() => sources.id, { onDelete: "set null" }),
    excerpt: text("excerpt"),
    supersededById: text("superseded_by_id").references((): AnyPgColumn => memories.id, {
      onDelete: "set null",
    }),
    supersededAt: timestamp("superseded_at"),
    ...timestamps,
  },
  (table) => [
    index("memories_workspace_idx").on(table.workspaceId),
    index("memories_active_idx").on(table.workspaceId, table.supersededById),
    index("memories_metric_idx").on(table.workspaceId, table.metric),
  ],
);

export const chatSessions = pgTable(
  "chat_sessions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title"),
    ...timestamps,
  },
  (table) => [index("chat_sessions_workspace_idx").on(table.workspaceId)],
);

// Stores full AI SDK UIMessage parts (text + tool calls) so memory-saved chips
// survive a reload, not just the flattened text.
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    parts: jsonb("parts").$type<unknown[]>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("chat_messages_workspace_idx").on(table.workspaceId),
    index("chat_messages_session_idx").on(table.sessionId),
  ],
);

export const workspaceRelations = relations(workspaces, ({ many, one }) => ({
  owner: one(user, { fields: [workspaces.ownerUserId], references: [user.id] }),
  sources: many(sources),
  memories: many(memories),
  chatSessions: many(chatSessions),
  profileVersions: many(profileVersions),
}));

export const profileVersionRelations = relations(profileVersions, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [profileVersions.workspaceId],
    references: [workspaces.id],
  }),
}));

export const memoryRelations = relations(memories, ({ one }) => ({
  workspace: one(workspaces, { fields: [memories.workspaceId], references: [workspaces.id] }),
  source: one(sources, { fields: [memories.sourceId], references: [sources.id] }),
  supersededBy: one(memories, { fields: [memories.supersededById], references: [memories.id] }),
}));

export const chatSessionRelations = relations(chatSessions, ({ many, one }) => ({
  workspace: one(workspaces, { fields: [chatSessions.workspaceId], references: [workspaces.id] }),
  messages: many(chatMessages),
}));
