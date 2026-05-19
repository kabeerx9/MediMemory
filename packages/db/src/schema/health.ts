import { relations } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";

export type SourceRef = { sourceId: string; excerpt?: string };

const timestamps = {
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
};

export const healthWorkspaces = pgTable(
  "health_workspaces",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    diagnosis: text("diagnosis"),
    currentStatusSummary: text("current_status_summary"),
    currentMedications: text("current_medications"),
    currentSymptoms: text("current_symptoms"),
    recentChanges: text("recent_changes"),
    latestReports: text("latest_reports"),
    upcomingAppointments: text("upcoming_appointments"),
    openQuestions: text("open_questions"),
    ...timestamps,
  },
  (table) => [index("health_workspaces_owner_idx").on(table.ownerUserId)],
);

export const healthSources = pgTable(
  "health_sources",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => healthWorkspaces.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title"),
    content: text("content"),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("health_sources_workspace_idx").on(table.workspaceId)],
);

export const timelineEntries = pgTable(
  "timeline_entries",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => healthWorkspaces.id, { onDelete: "cascade" }),
    entryDate: text("entry_date").notNull(),
    entryType: text("entry_type").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    details: text("details"),
    sourceRefs: jsonb("source_refs").$type<SourceRef[]>().default([]).notNull(),
    ...timestamps,
  },
  (table) => [index("timeline_entries_workspace_idx").on(table.workspaceId)],
);

export const medications = pgTable(
  "medications",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => healthWorkspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    dose: text("dose"),
    status: text("status").notNull().default("current"),
    startDate: text("start_date"),
    stopDate: text("stop_date"),
    reasonStarted: text("reason_started"),
    reasonStopped: text("reason_stopped"),
    sideEffects: text("side_effects"),
    notes: text("notes"),
    sourceRefs: jsonb("source_refs").$type<SourceRef[]>().default([]).notNull(),
    ...timestamps,
  },
  (table) => [index("medications_workspace_idx").on(table.workspaceId)],
);

export const symptoms = pgTable(
  "symptoms",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => healthWorkspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    startDate: text("start_date"),
    severity: text("severity"),
    pattern: text("pattern"),
    possibleTrigger: text("possible_trigger"),
    relatedMedication: text("related_medication"),
    notes: text("notes"),
    sourceRefs: jsonb("source_refs").$type<SourceRef[]>().default([]).notNull(),
    ...timestamps,
  },
  (table) => [index("symptoms_workspace_idx").on(table.workspaceId)],
);

export const doctorQuestions = pgTable(
  "doctor_questions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => healthWorkspaces.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    context: text("context"),
    status: text("status").notNull().default("open"),
    answer: text("answer"),
    sourceRefs: jsonb("source_refs").$type<SourceRef[]>().default([]).notNull(),
    ...timestamps,
  },
  (table) => [index("doctor_questions_workspace_idx").on(table.workspaceId)],
);

export const reportFiles = pgTable(
  "report_files",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => healthWorkspaces.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    reportType: text("report_type"),
    reportDate: text("report_date"),
    textContent: text("text_content").notNull(),
    summary: text("summary"),
    sourceRefs: jsonb("source_refs").$type<SourceRef[]>().default([]).notNull(),
    ...timestamps,
  },
  (table) => [index("report_files_workspace_idx").on(table.workspaceId)],
);

export const chatSessions = pgTable(
  "chat_sessions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => healthWorkspaces.id, { onDelete: "cascade" }),
    title: text("title"),
    ...timestamps,
  },
  (table) => [index("chat_sessions_workspace_idx").on(table.workspaceId)],
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => healthWorkspaces.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("chat_messages_workspace_idx").on(table.workspaceId),
    index("chat_messages_session_idx").on(table.sessionId),
  ],
);

export const memoryProposals = pgTable(
  "memory_proposals",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => healthWorkspaces.id, { onDelete: "cascade" }),
    sourceId: text("source_id").references(() => healthSources.id, { onDelete: "set null" }),
    status: text("status").notNull().default("draft"),
    shouldSave: boolean("should_save").notNull().default(true),
    proposalType: text("proposal_type").notNull(),
    proposedDate: text("proposed_date"),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    missingDetails: jsonb("missing_details").$type<string[]>().default([]).notNull(),
    doctorQuestions: jsonb("doctor_questions").$type<string[]>().default([]).notNull(),
    currentStatusPatch: jsonb("current_status_patch").$type<Record<string, unknown> | null>(),
    ...timestamps,
  },
  (table) => [index("memory_proposals_workspace_idx").on(table.workspaceId)],
);

export const memoryProposalItems = pgTable(
  "memory_proposal_items",
  {
    id: text("id").primaryKey(),
    proposalId: text("proposal_id")
      .notNull()
      .references(() => memoryProposals.id, { onDelete: "cascade" }),
    targetType: text("target_type").notNull(),
    operation: text("operation").notNull().default("create"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    sourceExcerpt: text("source_excerpt"),
    confidence: text("confidence"),
    included: boolean("included").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("memory_proposal_items_proposal_idx").on(table.proposalId)],
);

export const healthWorkspaceRelations = relations(healthWorkspaces, ({ many, one }) => ({
  owner: one(user, { fields: [healthWorkspaces.ownerUserId], references: [user.id] }),
  sources: many(healthSources),
  timelineEntries: many(timelineEntries),
  medications: many(medications),
  symptoms: many(symptoms),
  doctorQuestions: many(doctorQuestions),
  reportFiles: many(reportFiles),
  chatSessions: many(chatSessions),
  memoryProposals: many(memoryProposals),
}));
