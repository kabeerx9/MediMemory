import { randomUUID } from "node:crypto";
import type {
  CreateChatMessageInput,
  CreateChatSessionInput,
  CreateDoctorQuestionInput,
  CreateMedicationInput,
  CreateReportFileInput,
  CreateSymptomInput,
  CreateTimelineEntryInput,
  CreateWorkspaceInput,
  ExtractedMemoryProposal,
  UpdateMemoryProposalInput,
  UpdateWorkspaceInput,
} from "@health-conversation/contracts/health";
import { db } from "@health-conversation/db";
import { user } from "@health-conversation/db/schema/auth";
import {
  chatMessages,
  chatSessions,
  doctorQuestions,
  healthSources,
  healthWorkspaces,
  medications,
  memoryProposalItems,
  memoryProposals,
  reportFiles,
  symptoms,
  timelineEntries,
  type SourceRef,
} from "@health-conversation/db/schema/health";
import { and, desc, eq, inArray } from "drizzle-orm";

import { notFound } from "../lib/http-error";

function iso(date: Date) {
  return date.toISOString();
}

function toWorkspace(row: typeof healthWorkspaces.$inferSelect) {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    name: row.name,
    description: row.description,
    diagnosis: row.diagnosis,
    currentStatusSummary: row.currentStatusSummary,
    currentMedications: row.currentMedications,
    currentSymptoms: row.currentSymptoms,
    recentChanges: row.recentChanges,
    latestReports: row.latestReports,
    upcomingAppointments: row.upcomingAppointments,
    openQuestions: row.openQuestions,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function toTimeline(row: typeof timelineEntries.$inferSelect) {
  return { ...row, entryType: row.entryType as never, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) };
}
function toMedication(row: typeof medications.$inferSelect) {
  return { ...row, status: row.status as "current" | "stopped" | "paused" | "unknown", createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) };
}
function toSymptom(row: typeof symptoms.$inferSelect) {
  return { ...row, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) };
}
function toQuestion(row: typeof doctorQuestions.$inferSelect) {
  return { ...row, status: row.status as "open" | "answered" | "archived", createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) };
}
function toReport(row: typeof reportFiles.$inferSelect) {
  return { ...row, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) };
}
function toChatSession(row: typeof chatSessions.$inferSelect) {
  return { ...row, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) };
}
function toChatMessage(row: typeof chatMessages.$inferSelect) {
  return { ...row, role: row.role as "user" | "assistant" | "system", createdAt: iso(row.createdAt) };
}
function toProposalItem(row: typeof memoryProposalItems.$inferSelect) {
  return {
    ...row,
    operation: row.operation as "create" | "update",
    targetType: row.targetType as "timeline" | "symptom" | "medication" | "doctor_question" | "report" | "current_status",
    confidence: row.confidence === null ? null : Number(row.confidence),
    createdAt: iso(row.createdAt),
  };
}
function toProposal(row: typeof memoryProposals.$inferSelect, items: Array<typeof memoryProposalItems.$inferSelect>) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    sourceId: row.sourceId,
    status: row.status as "draft" | "approved" | "rejected",
    shouldSave: row.shouldSave,
    proposalType: row.proposalType,
    proposedDate: row.proposedDate,
    title: row.title,
    summary: row.summary,
    missingDetails: row.missingDetails,
    doctorQuestions: row.doctorQuestions,
    currentStatusPatch: row.currentStatusPatch,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    items: items.map(toProposalItem),
  };
}

function withRefs<T extends { sourceRefs?: SourceRef[] }>(input: T) {
  return { ...input, sourceRefs: input.sourceRefs ?? [] };
}

export const healthRepository = {
  async findUserByEmail(email: string) {
    const [row] = await db.select().from(user).where(eq(user.email, email)).limit(1);
    return row ?? null;
  },

  async listWorkspaces(ownerUserId: string) {
    const rows = await db.select().from(healthWorkspaces).where(eq(healthWorkspaces.ownerUserId, ownerUserId)).orderBy(desc(healthWorkspaces.updatedAt));
    return rows.map(toWorkspace);
  },

  async createWorkspace(ownerUserId: string, input: CreateWorkspaceInput) {
    const [row] = await db.insert(healthWorkspaces).values({ id: randomUUID(), ownerUserId, name: input.name, description: input.description ?? null, diagnosis: input.diagnosis ?? null }).returning();
    if (!row) throw notFound("Workspace not created");
    return toWorkspace(row);
  },

  async updateWorkspace(ownerUserId: string, workspaceId: string, input: UpdateWorkspaceInput) {
    const [row] = await db.update(healthWorkspaces).set(input).where(and(eq(healthWorkspaces.id, workspaceId), eq(healthWorkspaces.ownerUserId, ownerUserId))).returning();
    if (!row) throw notFound("Workspace not found");
    return toWorkspace(row);
  },

  async getWorkspace(ownerUserId: string, workspaceId: string) {
    const [row] = await db.select().from(healthWorkspaces).where(and(eq(healthWorkspaces.id, workspaceId), eq(healthWorkspaces.ownerUserId, ownerUserId))).limit(1);
    return row ? toWorkspace(row) : null;
  },

  async getWorkspaceDetail(ownerUserId: string, workspaceId: string) {
    const workspace = await this.getWorkspace(ownerUserId, workspaceId);
    if (!workspace) throw notFound("Workspace not found");

    const [timeline, medicationRows, symptomRows, questionRows, reportRows, sessionRows, messageRows, proposalRows] = await Promise.all([
      db.select().from(timelineEntries).where(eq(timelineEntries.workspaceId, workspaceId)).orderBy(desc(timelineEntries.entryDate), desc(timelineEntries.createdAt)),
      db.select().from(medications).where(eq(medications.workspaceId, workspaceId)).orderBy(desc(medications.createdAt)),
      db.select().from(symptoms).where(eq(symptoms.workspaceId, workspaceId)).orderBy(desc(symptoms.createdAt)),
      db.select().from(doctorQuestions).where(eq(doctorQuestions.workspaceId, workspaceId)).orderBy(desc(doctorQuestions.createdAt)),
      db.select().from(reportFiles).where(eq(reportFiles.workspaceId, workspaceId)).orderBy(desc(reportFiles.createdAt)),
      db.select().from(chatSessions).where(eq(chatSessions.workspaceId, workspaceId)).orderBy(desc(chatSessions.updatedAt)),
      db.select().from(chatMessages).where(eq(chatMessages.workspaceId, workspaceId)).orderBy(desc(chatMessages.createdAt)).limit(30),
      db.select().from(memoryProposals).where(eq(memoryProposals.workspaceId, workspaceId)).orderBy(desc(memoryProposals.createdAt)).limit(10),
    ]);

    const proposalIds = proposalRows.map((proposal) => proposal.id);
    const itemRows = proposalIds.length === 0 ? [] : await db.select().from(memoryProposalItems).where(inArray(memoryProposalItems.proposalId, proposalIds));

    return {
      workspace,
      timeline: timeline.map(toTimeline),
      medications: medicationRows.map(toMedication),
      symptoms: symptomRows.map(toSymptom),
      doctorQuestions: questionRows.map(toQuestion),
      reports: reportRows.map(toReport),
      chatSessions: sessionRows.map(toChatSession),
      recentMessages: messageRows.reverse().map(toChatMessage),
      proposals: proposalRows.map((proposal) => toProposal(proposal, itemRows.filter((item) => item.proposalId === proposal.id))),
    };
  },

  async createSource(workspaceId: string, input: { type: string; title?: string | null; content?: string | null; metadata?: Record<string, unknown> | null }) {
    const [row] = await db.insert(healthSources).values({ id: randomUUID(), workspaceId, type: input.type, title: input.title ?? null, content: input.content ?? null, metadata: input.metadata ?? null }).returning();
    if (!row) throw notFound("Source not created");
    return { ...row, createdAt: iso(row.createdAt) };
  },

  async createTimeline(workspaceId: string, input: CreateTimelineEntryInput) {
    const [row] = await db.insert(timelineEntries).values({ id: randomUUID(), workspaceId, ...withRefs(input), details: input.details ?? null }).returning();
    if (!row) throw notFound("Timeline entry not created");
    return toTimeline(row);
  },

  async createMedication(workspaceId: string, input: CreateMedicationInput) {
    const [row] = await db.insert(medications).values({ id: randomUUID(), workspaceId, ...withRefs(input) }).returning();
    if (!row) throw notFound("Medication not created");
    return toMedication(row);
  },

  async createSymptom(workspaceId: string, input: CreateSymptomInput) {
    const [row] = await db.insert(symptoms).values({ id: randomUUID(), workspaceId, ...withRefs(input) }).returning();
    if (!row) throw notFound("Symptom not created");
    return toSymptom(row);
  },

  async createDoctorQuestion(workspaceId: string, input: CreateDoctorQuestionInput) {
    const [row] = await db.insert(doctorQuestions).values({ id: randomUUID(), workspaceId, ...withRefs(input) }).returning();
    if (!row) throw notFound("Doctor question not created");
    return toQuestion(row);
  },

  async createReport(workspaceId: string, input: CreateReportFileInput) {
    const source = await this.createSource(workspaceId, { type: "report_text", title: input.filename, content: input.textContent, metadata: { reportType: input.reportType ?? null, reportDate: input.reportDate ?? null } });
    const sourceRefs = input.sourceRefs ?? [{ sourceId: source.id }];
    const [row] = await db.insert(reportFiles).values({ id: randomUUID(), workspaceId, ...input, reportType: input.reportType ?? null, reportDate: input.reportDate ?? null, summary: input.summary ?? null, sourceRefs }).returning();
    if (!row) throw notFound("Report not created");
    return toReport(row);
  },

  async createChatSession(workspaceId: string, input: CreateChatSessionInput) {
    const [row] = await db.insert(chatSessions).values({ id: randomUUID(), workspaceId, title: input.title ?? null }).returning();
    if (!row) throw notFound("Chat session not created");
    return toChatSession(row);
  },
  async createChatMessage(workspaceId: string, sessionId: string, input: CreateChatMessageInput) {
    const [row] = await db.insert(chatMessages).values({ id: randomUUID(), workspaceId, sessionId, role: input.role, content: input.content }).returning();
    if (!row) throw notFound("Chat message not created");
    await db.update(chatSessions).set({ updatedAt: new Date() }).where(eq(chatSessions.id, sessionId));
    return toChatMessage(row);
  },
  async listChatMessages(workspaceId: string, sessionId: string) {
    const rows = await db.select().from(chatMessages).where(and(eq(chatMessages.workspaceId, workspaceId), eq(chatMessages.sessionId, sessionId))).orderBy(chatMessages.createdAt);
    return rows.map(toChatMessage);
  },

  async createProposal(workspaceId: string, sourceId: string | null, extracted: ExtractedMemoryProposal) {
    const proposalId = randomUUID();
    const [proposal] = await db.insert(memoryProposals).values({
      id: proposalId,
      workspaceId,
      sourceId,
      shouldSave: extracted.shouldSave,
      proposalType: extracted.proposalType,
      proposedDate: extracted.date,
      title: extracted.title,
      summary: extracted.summary,
      missingDetails: extracted.missingDetails,
      doctorQuestions: extracted.doctorQuestions,
      currentStatusPatch: extracted.currentStatusPatch,
    }).returning();
    if (!proposal) throw notFound("Proposal not created");

    if (extracted.items.length > 0) {
      await db.insert(memoryProposalItems).values(extracted.items.map((item) => ({
        id: randomUUID(),
        proposalId,
        targetType: item.targetType,
        operation: item.operation,
        payload: item.payload,
        sourceExcerpt: item.sourceExcerpt ?? null,
        confidence: item.confidence === undefined || item.confidence === null ? null : String(item.confidence),
        included: true,
      })));
    }

    return this.getProposal(workspaceId, proposalId);
  },

  async getProposal(workspaceId: string, proposalId: string) {
    const [proposal] = await db.select().from(memoryProposals).where(and(eq(memoryProposals.workspaceId, workspaceId), eq(memoryProposals.id, proposalId))).limit(1);
    if (!proposal) throw notFound("Proposal not found");
    const items = await db.select().from(memoryProposalItems).where(eq(memoryProposalItems.proposalId, proposal.id));
    return toProposal(proposal, items);
  },

  async findProposalForUser(ownerUserId: string, proposalId: string) {
    const [row] = await db.select({ proposal: memoryProposals, workspace: healthWorkspaces }).from(memoryProposals).innerJoin(healthWorkspaces, eq(healthWorkspaces.id, memoryProposals.workspaceId)).where(and(eq(memoryProposals.id, proposalId), eq(healthWorkspaces.ownerUserId, ownerUserId))).limit(1);
    if (!row) throw notFound("Proposal not found");
    return row.proposal;
  },

  async updateProposal(ownerUserId: string, proposalId: string, input: UpdateMemoryProposalInput) {
    const proposal = await this.findProposalForUser(ownerUserId, proposalId);
    const { items, ...proposalPatch } = input;
    if (Object.keys(proposalPatch).length > 0) {
      await db.update(memoryProposals).set(proposalPatch).where(eq(memoryProposals.id, proposal.id));
    }
    if (items) {
      for (const item of items) {
        const patch: Partial<typeof memoryProposalItems.$inferInsert> = {};
        if (item.included !== undefined) patch.included = item.included;
        if (item.payload !== undefined) patch.payload = item.payload;
        if (item.sourceExcerpt !== undefined) patch.sourceExcerpt = item.sourceExcerpt;
        if (item.confidence !== undefined) patch.confidence = item.confidence === null ? null : String(item.confidence);
        if (Object.keys(patch).length > 0) {
          await db.update(memoryProposalItems).set(patch).where(and(eq(memoryProposalItems.id, item.id), eq(memoryProposalItems.proposalId, proposal.id)));
        }
      }
    }
    return this.getProposal(proposal.workspaceId, proposal.id);
  },

  async approveProposal(ownerUserId: string, proposalId: string) {
    const proposal = await this.findProposalForUser(ownerUserId, proposalId);
    const full = await this.getProposal(proposal.workspaceId, proposal.id);
    if (full.status === "approved") return full;
    const sourceRefs = proposal.sourceId ? [{ sourceId: proposal.sourceId }] : [];

    for (const item of full.items.filter((candidate) => candidate.included)) {
      const payload = item.payload;
      const refs = item.sourceExcerpt && proposal.sourceId ? [{ sourceId: proposal.sourceId, excerpt: item.sourceExcerpt }] : sourceRefs;
      if (item.targetType === "timeline") {
        await this.createTimeline(proposal.workspaceId, { entryDate: String(payload.entryDate ?? payload.date ?? full.proposedDate ?? new Date().toISOString().slice(0, 10)), entryType: normalizeTimelineEntryType(payload.entryType), title: String(payload.title ?? full.title), summary: String(payload.summary ?? full.summary), details: payload.details == null ? null : String(payload.details), sourceRefs: refs });
      } else if (item.targetType === "symptom") {
        await this.createSymptom(proposal.workspaceId, { name: String(payload.name ?? payload.symptom ?? full.title), startDate: payload.startDate == null ? null : String(payload.startDate), severity: payload.severity == null ? null : String(payload.severity), pattern: payload.pattern == null ? null : String(payload.pattern), possibleTrigger: payload.possibleTrigger == null ? null : String(payload.possibleTrigger), relatedMedication: payload.relatedMedication == null ? null : String(payload.relatedMedication), notes: payload.notes == null ? String(payload.summary ?? full.summary) : String(payload.notes), sourceRefs: refs });
      } else if (item.targetType === "medication") {
        await this.createMedication(proposal.workspaceId, { name: String(payload.name ?? payload.medication ?? full.title), dose: payload.dose == null ? null : String(payload.dose), status: String(payload.status ?? "current") as never, startDate: payload.startDate == null ? null : String(payload.startDate), stopDate: payload.stopDate == null ? null : String(payload.stopDate), reasonStarted: payload.reasonStarted == null ? null : String(payload.reasonStarted), reasonStopped: payload.reasonStopped == null ? null : String(payload.reasonStopped), sideEffects: payload.sideEffects == null ? null : String(payload.sideEffects), notes: payload.notes == null ? null : String(payload.notes), sourceRefs: refs });
      } else if (item.targetType === "doctor_question") {
        await this.createDoctorQuestion(proposal.workspaceId, { question: String(payload.question ?? full.title), context: payload.context == null ? String(payload.summary ?? full.summary) : String(payload.context), status: "open", sourceRefs: refs });
      } else if (item.targetType === "report") {
        await this.createReport(proposal.workspaceId, { filename: String(payload.filename ?? payload.title ?? full.title), reportType: payload.reportType == null ? null : String(payload.reportType), reportDate: payload.reportDate == null ? full.proposedDate : String(payload.reportDate), textContent: String(payload.textContent ?? payload.summary ?? full.summary), summary: payload.summary == null ? full.summary : String(payload.summary), sourceRefs: refs });
      } else if (item.targetType === "current_status") {
        await this.updateWorkspace(ownerUserId, proposal.workspaceId, normalizeStatusPatch(payload));
      }
    }

    if (full.currentStatusPatch) {
      await this.updateWorkspace(ownerUserId, proposal.workspaceId, normalizeStatusPatch(full.currentStatusPatch));
    }

    await db.update(memoryProposals).set({ status: "approved" }).where(eq(memoryProposals.id, proposal.id));
    return this.getProposal(proposal.workspaceId, proposal.id);
  },

  async getOwnedChildWorkspace(ownerUserId: string, workspaceId: string) {
    const workspace = await this.getWorkspace(ownerUserId, workspaceId);
    if (!workspace) throw notFound("Workspace not found");
    return workspace;
  },
};

function normalizeTimelineEntryType(value: unknown) {
  const allowed = ["diagnosis_update", "symptom_update", "medication_change", "report", "doctor_visit", "appointment", "decision", "treatment", "lab_result", "note"] as const;
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) return value as (typeof allowed)[number];
  if (value === "test" || value === "ecg" || value === "scan") return "report";
  return "note";
}

function normalizeStatusPatch(payload: Record<string, unknown>) {
  const allowed = ["currentStatusSummary", "currentMedications", "currentSymptoms", "recentChanges", "latestReports", "upcomingAppointments", "openQuestions", "diagnosis", "description"] as const;
  const patch: Record<string, string | null> = {};
  for (const key of allowed) {
    if (payload[key] !== undefined) patch[key] = payload[key] == null ? null : String(payload[key]);
  }
  return patch;
}
