import { z } from "zod";

export const isoDateSchema = z.string().trim().min(1).max(32);
export const sourceTypeSchema = z.enum(["manual", "chat_message", "transcript_import", "report_text", "seed"]);
export const timelineEntryTypeSchema = z.enum([
  "diagnosis_update",
  "symptom_update",
  "medication_change",
  "report",
  "doctor_visit",
  "appointment",
  "decision",
  "treatment",
  "lab_result",
  "note",
]);
export const medicationStatusSchema = z.enum(["current", "stopped", "paused", "unknown"]);
export const doctorQuestionStatusSchema = z.enum(["open", "answered", "archived"]);
export const chatRoleSchema = z.enum(["user", "assistant", "system"]);
export const memoryProposalStatusSchema = z.enum(["draft", "approved", "rejected"]);
export const proposalTargetTypeSchema = z.enum([
  "timeline",
  "symptom",
  "medication",
  "doctor_question",
  "report",
  "current_status",
]);
export const proposalOperationSchema = z.enum(["create", "update"]);

export const sourceRefSchema = z.object({
  sourceId: z.uuid(),
  excerpt: z.string().optional(),
});

export const healthWorkspaceSchema = z.object({
  id: z.uuid(),
  ownerUserId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  diagnosis: z.string().nullable(),
  currentStatusSummary: z.string().nullable(),
  currentMedications: z.string().nullable(),
  currentSymptoms: z.string().nullable(),
  recentChanges: z.string().nullable(),
  latestReports: z.string().nullable(),
  upcomingAppointments: z.string().nullable(),
  openQuestions: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createWorkspaceInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).nullable().optional(),
  diagnosis: z.string().trim().max(2000).nullable().optional(),
});

export const updateWorkspaceInputSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  diagnosis: z.string().trim().max(2000).nullable().optional(),
  currentStatusSummary: z.string().trim().max(4000).nullable().optional(),
  currentMedications: z.string().trim().max(4000).nullable().optional(),
  currentSymptoms: z.string().trim().max(4000).nullable().optional(),
  recentChanges: z.string().trim().max(4000).nullable().optional(),
  latestReports: z.string().trim().max(4000).nullable().optional(),
  upcomingAppointments: z.string().trim().max(4000).nullable().optional(),
  openQuestions: z.string().trim().max(4000).nullable().optional(),
});

export const healthSourceSchema = z.object({
  id: z.uuid(),
  workspaceId: z.uuid(),
  type: sourceTypeSchema,
  title: z.string().nullable(),
  content: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
});

export const timelineEntrySchema = z.object({
  id: z.uuid(),
  workspaceId: z.uuid(),
  entryDate: z.string(),
  entryType: timelineEntryTypeSchema,
  title: z.string(),
  summary: z.string(),
  details: z.string().nullable(),
  sourceRefs: z.array(sourceRefSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createTimelineEntryInputSchema = z.object({
  entryDate: isoDateSchema,
  entryType: timelineEntryTypeSchema.default("note"),
  title: z.string().trim().min(1).max(180),
  summary: z.string().trim().min(1).max(3000),
  details: z.string().trim().max(8000).nullable().optional(),
  sourceRefs: z.array(sourceRefSchema).optional(),
});
export const updateTimelineEntryInputSchema = createTimelineEntryInputSchema.partial().refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const medicationSchema = z.object({
  id: z.uuid(),
  workspaceId: z.uuid(),
  name: z.string(),
  dose: z.string().nullable(),
  status: medicationStatusSchema,
  startDate: z.string().nullable(),
  stopDate: z.string().nullable(),
  reasonStarted: z.string().nullable(),
  reasonStopped: z.string().nullable(),
  sideEffects: z.string().nullable(),
  notes: z.string().nullable(),
  sourceRefs: z.array(sourceRefSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createMedicationInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  dose: z.string().trim().max(120).nullable().optional(),
  status: medicationStatusSchema.default("current"),
  startDate: isoDateSchema.nullable().optional(),
  stopDate: isoDateSchema.nullable().optional(),
  reasonStarted: z.string().trim().max(2000).nullable().optional(),
  reasonStopped: z.string().trim().max(2000).nullable().optional(),
  sideEffects: z.string().trim().max(3000).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  sourceRefs: z.array(sourceRefSchema).optional(),
});
export const updateMedicationInputSchema = createMedicationInputSchema.partial().refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const symptomSchema = z.object({
  id: z.uuid(),
  workspaceId: z.uuid(),
  name: z.string(),
  startDate: z.string().nullable(),
  severity: z.string().nullable(),
  pattern: z.string().nullable(),
  possibleTrigger: z.string().nullable(),
  relatedMedication: z.string().nullable(),
  notes: z.string().nullable(),
  sourceRefs: z.array(sourceRefSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createSymptomInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  startDate: isoDateSchema.nullable().optional(),
  severity: z.string().trim().max(80).nullable().optional(),
  pattern: z.string().trim().max(2000).nullable().optional(),
  possibleTrigger: z.string().trim().max(2000).nullable().optional(),
  relatedMedication: z.string().trim().max(160).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  sourceRefs: z.array(sourceRefSchema).optional(),
});
export const updateSymptomInputSchema = createSymptomInputSchema.partial().refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const doctorQuestionSchema = z.object({
  id: z.uuid(),
  workspaceId: z.uuid(),
  question: z.string(),
  context: z.string().nullable(),
  status: doctorQuestionStatusSchema,
  answer: z.string().nullable(),
  sourceRefs: z.array(sourceRefSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createDoctorQuestionInputSchema = z.object({
  question: z.string().trim().min(1).max(500),
  context: z.string().trim().max(2000).nullable().optional(),
  status: doctorQuestionStatusSchema.default("open"),
  answer: z.string().trim().max(3000).nullable().optional(),
  sourceRefs: z.array(sourceRefSchema).optional(),
});
export const updateDoctorQuestionInputSchema = createDoctorQuestionInputSchema.partial().refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const reportFileSchema = z.object({
  id: z.uuid(),
  workspaceId: z.uuid(),
  filename: z.string(),
  reportType: z.string().nullable(),
  reportDate: z.string().nullable(),
  textContent: z.string(),
  summary: z.string().nullable(),
  sourceRefs: z.array(sourceRefSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createReportFileInputSchema = z.object({
  filename: z.string().trim().min(1).max(240),
  reportType: z.string().trim().max(120).nullable().optional(),
  reportDate: isoDateSchema.nullable().optional(),
  textContent: z.string().trim().min(1).max(60000),
  summary: z.string().trim().max(6000).nullable().optional(),
  sourceRefs: z.array(sourceRefSchema).optional(),
});
export const updateReportFileInputSchema = createReportFileInputSchema.partial().refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const chatSessionSchema = z.object({
  id: z.uuid(),
  workspaceId: z.uuid(),
  title: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const chatMessageSchema = z.object({
  id: z.uuid(),
  workspaceId: z.uuid(),
  sessionId: z.uuid(),
  role: chatRoleSchema,
  content: z.string(),
  createdAt: z.string(),
});

export const createChatSessionInputSchema = z.object({
  title: z.string().trim().max(180).nullable().optional(),
});
export const createChatMessageInputSchema = z.object({
  role: chatRoleSchema.default("user"),
  content: z.string().trim().min(1).max(30000),
});

export const proposalItemPayloadSchema = z.record(z.string(), z.unknown());
export const memoryProposalItemSchema = z.object({
  id: z.uuid(),
  proposalId: z.uuid(),
  targetType: proposalTargetTypeSchema,
  operation: proposalOperationSchema,
  payload: proposalItemPayloadSchema,
  sourceExcerpt: z.string().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  included: z.boolean(),
  createdAt: z.string(),
});

export const memoryProposalSchema = z.object({
  id: z.uuid(),
  workspaceId: z.uuid(),
  sourceId: z.uuid().nullable(),
  status: memoryProposalStatusSchema,
  shouldSave: z.boolean(),
  proposalType: z.string(),
  proposedDate: z.string().nullable(),
  title: z.string(),
  summary: z.string(),
  missingDetails: z.array(z.string()),
  doctorQuestions: z.array(z.string()),
  currentStatusPatch: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  items: z.array(memoryProposalItemSchema),
});

export const extractedMemoryProposalSchema = z.object({
  shouldSave: z.boolean(),
  proposalType: z.string().min(1),
  date: z.string().nullable(),
  title: z.string().min(1),
  summary: z.string().min(1),
  items: z.array(z.object({
    targetType: proposalTargetTypeSchema,
    operation: proposalOperationSchema.default("create"),
    payload: proposalItemPayloadSchema,
    sourceExcerpt: z.string().nullable().optional(),
    confidence: z.number().min(0).max(1).nullable().optional(),
  })),
  missingDetails: z.array(z.string()),
  doctorQuestions: z.array(z.string()),
  currentStatusPatch: z.record(z.string(), z.unknown()).nullable(),
});

export const createContextImportInputSchema = z.object({
  title: z.string().trim().min(1).max(180).default("Transcript import"),
  content: z.string().trim().min(1).max(100000),
});

export const updateMemoryProposalInputSchema = z.object({
  shouldSave: z.boolean().optional(),
  proposalType: z.string().trim().min(1).max(120).optional(),
  proposedDate: z.string().trim().max(32).nullable().optional(),
  title: z.string().trim().min(1).max(240).optional(),
  summary: z.string().trim().min(1).max(6000).optional(),
  missingDetails: z.array(z.string().trim().min(1).max(240)).optional(),
  doctorQuestions: z.array(z.string().trim().min(1).max(500)).optional(),
  currentStatusPatch: z.record(z.string(), z.unknown()).nullable().optional(),
  items: z.array(z.object({
    id: z.uuid(),
    included: z.boolean().optional(),
    payload: proposalItemPayloadSchema.optional(),
    sourceExcerpt: z.string().trim().max(2000).nullable().optional(),
    confidence: z.number().min(0).max(1).nullable().optional(),
  })).optional(),
});

export const workspaceDetailSchema = z.object({
  workspace: healthWorkspaceSchema,
  timeline: z.array(timelineEntrySchema),
  medications: z.array(medicationSchema),
  symptoms: z.array(symptomSchema),
  doctorQuestions: z.array(doctorQuestionSchema),
  reports: z.array(reportFileSchema),
  chatSessions: z.array(chatSessionSchema),
  recentMessages: z.array(chatMessageSchema),
  proposals: z.array(memoryProposalSchema),
});

export const workspacesResponseSchema = z.object({
  workspaces: z.array(healthWorkspaceSchema),
});
export const idParamsSchema = z.object({ id: z.uuid() });
export const workspaceParamsSchema = z.object({ workspaceId: z.uuid() });
export const chatSessionParamsSchema = z.object({ workspaceId: z.uuid(), sessionId: z.uuid() });
export const proposalParamsSchema = z.object({ proposalId: z.uuid() });
export const deleteResponseSchema = z.object({ deleted: z.boolean() });

export type HealthWorkspace = z.infer<typeof healthWorkspaceSchema>;
export type WorkspaceDetail = z.infer<typeof workspaceDetailSchema>;
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceInputSchema>;
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceInputSchema>;
export type TimelineEntry = z.infer<typeof timelineEntrySchema>;
export type CreateTimelineEntryInput = z.infer<typeof createTimelineEntryInputSchema>;
export type UpdateTimelineEntryInput = z.infer<typeof updateTimelineEntryInputSchema>;
export type Medication = z.infer<typeof medicationSchema>;
export type CreateMedicationInput = z.infer<typeof createMedicationInputSchema>;
export type UpdateMedicationInput = z.infer<typeof updateMedicationInputSchema>;
export type Symptom = z.infer<typeof symptomSchema>;
export type CreateSymptomInput = z.infer<typeof createSymptomInputSchema>;
export type UpdateSymptomInput = z.infer<typeof updateSymptomInputSchema>;
export type DoctorQuestion = z.infer<typeof doctorQuestionSchema>;
export type CreateDoctorQuestionInput = z.infer<typeof createDoctorQuestionInputSchema>;
export type UpdateDoctorQuestionInput = z.infer<typeof updateDoctorQuestionInputSchema>;
export type ReportFile = z.infer<typeof reportFileSchema>;
export type CreateReportFileInput = z.infer<typeof createReportFileInputSchema>;
export type UpdateReportFileInput = z.infer<typeof updateReportFileInputSchema>;
export type ChatSession = z.infer<typeof chatSessionSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type CreateChatSessionInput = z.infer<typeof createChatSessionInputSchema>;
export type CreateChatMessageInput = z.infer<typeof createChatMessageInputSchema>;
export type MemoryProposal = z.infer<typeof memoryProposalSchema>;
export type ExtractedMemoryProposal = z.infer<typeof extractedMemoryProposalSchema>;
export type UpdateMemoryProposalInput = z.infer<typeof updateMemoryProposalInputSchema>;
export type CreateContextImportInput = z.infer<typeof createContextImportInputSchema>;
export type SourceRef = z.infer<typeof sourceRefSchema>;
