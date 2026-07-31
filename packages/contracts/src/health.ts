import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export const isoDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const sourceTypeSchema = z.enum(["chat_session", "import", "manual", "seed"]);

// Soft taxonomy: hints for filtering/display, not a validation gate. The model
// may emit values outside this list; they are coerced to "note" at the tool
// boundary rather than rejected.
export const memoryKindSchema = z.enum([
  "measurement",
  "medication",
  "symptom",
  "event",
  "appointment",
  "question",
  "note",
]);
export type MemoryKind = z.infer<typeof memoryKindSchema>;

export const chatRoleSchema = z.enum(["user", "assistant", "system"]);

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

export const workspaceSchema = z.object({
  id: z.string().min(1),
  ownerUserId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  profile: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Workspace = z.infer<typeof workspaceSchema>;

export const createWorkspaceInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).nullable().optional(),
  profile: z.string().trim().max(8000).nullable().optional(),
});
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceInputSchema>;

export const updateWorkspaceInputSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  profile: z.string().trim().max(8000).nullable().optional(),
});
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceInputSchema>;

export const workspacesResponseSchema = z.object({
  workspaces: z.array(workspaceSchema),
});

// ---------------------------------------------------------------------------
// Source (immutable raw input)
// ---------------------------------------------------------------------------

export const sourceSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  type: sourceTypeSchema,
  title: z.string().nullable(),
  content: z.string().nullable(),
  createdAt: z.string(),
});
export type Source = z.infer<typeof sourceSchema>;

// ---------------------------------------------------------------------------
// Memory (atomic fact, append-only with supersession)
// ---------------------------------------------------------------------------

export const memorySchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  content: z.string(),
  kind: memoryKindSchema,
  happenedOn: z.string().nullable(),
  sourceId: z.string().nullable(),
  excerpt: z.string().nullable(),
  supersededById: z.string().nullable(),
  supersededAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Memory = z.infer<typeof memorySchema>;

export const memoriesResponseSchema = z.object({
  memories: z.array(memorySchema),
});

// Manual creation/editing from the UI (the model writes through its tools,
// not through this input).
export const createMemoryInputSchema = z.object({
  content: z.string().trim().min(1).max(2000),
  kind: memoryKindSchema.default("note"),
  happenedOn: isoDateSchema.nullable().optional(),
});
export type CreateMemoryInput = z.infer<typeof createMemoryInputSchema>;

export const updateMemoryInputSchema = z.object({
  content: z.string().trim().min(1).max(2000).optional(),
  kind: memoryKindSchema.optional(),
  happenedOn: isoDateSchema.nullable().optional(),
});
export type UpdateMemoryInput = z.infer<typeof updateMemoryInputSchema>;

// ---------------------------------------------------------------------------
// Memory tools (the contract between the chat model and the write path).
// These are the inputSchemas for AI SDK `tool()` definitions on the server and
// the shape of tool parts rendered as chips on the client.
// ---------------------------------------------------------------------------

export const saveMemoryToolInputSchema = z.object({
  content: z
    .string()
    .min(1)
    .max(2000)
    .describe("One atomic, self-contained fact. Include the value and units for measurements."),
  kind: z
    .string()
    .describe("One of: measurement, medication, symptom, event, appointment, question, note."),
  happenedOn: isoDateSchema
    .nullable()
    .describe("Date the fact occurred (YYYY-MM-DD), if known. Null if undatable."),
  supersedesId: z
    .string()
    .nullable()
    .describe(
      "ID of an existing memory this fact replaces. Only for state changes (dose changed, symptom resolved). Never for new measurements — those accumulate.",
    ),
});
export type SaveMemoryToolInput = z.infer<typeof saveMemoryToolInputSchema>;

export const saveMemoryToolOutputSchema = z.object({
  id: z.string(),
  content: z.string(),
  kind: memoryKindSchema,
  happenedOn: z.string().nullable(),
  supersededId: z.string().nullable(),
  supersededContent: z.string().nullable(),
});
export type SaveMemoryToolOutput = z.infer<typeof saveMemoryToolOutputSchema>;

export const updateProfileToolInputSchema = z.object({
  profile: z
    .string()
    .min(1)
    .max(8000)
    .describe("The full replacement profile block (markdown). Rewrite, don't append."),
});
export type UpdateProfileToolInput = z.infer<typeof updateProfileToolInputSchema>;

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export const chatSessionSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  title: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ChatSession = z.infer<typeof chatSessionSchema>;

export const createChatSessionInputSchema = z.object({
  title: z.string().trim().max(180).nullable().optional(),
});
export type CreateChatSessionInput = z.infer<typeof createChatSessionInputSchema>;

// Wire format for persisted messages: AI SDK UIMessage parts stored verbatim.
export const chatMessageSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  sessionId: z.string().min(1),
  role: chatRoleSchema,
  parts: z.array(z.unknown()),
  createdAt: z.string(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

// ---------------------------------------------------------------------------
// Import (bulk path: same tool semantics, no live conversation)
// ---------------------------------------------------------------------------

export const importInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(60000),
});
export type ImportInput = z.infer<typeof importInputSchema>;

export const importResponseSchema = z.object({
  source: sourceSchema,
  memories: z.array(memorySchema),
  profileUpdated: z.boolean(),
});
export type ImportResponse = z.infer<typeof importResponseSchema>;

// ---------------------------------------------------------------------------
// Export (account-level dump: every workspace the user owns, with all
// memories including superseded ones — full fidelity, restorable)
// ---------------------------------------------------------------------------

export const exportFormatSchema = z.enum(["json", "markdown"]);
export type ExportFormat = z.infer<typeof exportFormatSchema>;

export const exportWorkspaceSchema = z.object({
  workspace: workspaceSchema,
  memories: z.array(memorySchema),
});
export type ExportWorkspace = z.infer<typeof exportWorkspaceSchema>;

export const exportResponseSchema = z.object({
  exportedAt: z.string(),
  workspaces: z.array(exportWorkspaceSchema),
});
export type ExportResponse = z.infer<typeof exportResponseSchema>;

// ---------------------------------------------------------------------------
// Route params
// ---------------------------------------------------------------------------

export const workspaceParamsSchema = z.object({ workspaceId: z.string().min(1) });
export const chatSessionParamsSchema = z.object({
  workspaceId: z.string().min(1),
  sessionId: z.string().min(1),
});
export const memoryParamsSchema = z.object({
  workspaceId: z.string().min(1),
  memoryId: z.string().min(1),
});

export const workspaceDetailSchema = z.object({
  workspace: workspaceSchema,
  memories: z.array(memorySchema),
  chatSessions: z.array(chatSessionSchema),
});
export type WorkspaceDetail = z.infer<typeof workspaceDetailSchema>;
