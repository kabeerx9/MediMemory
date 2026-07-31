import { randomUUID } from "node:crypto";
import type {
  CreateChatSessionInput,
  CreateMemoryInput,
  CreateWorkspaceInput,
  MemoryKind,
  UpdateMemoryInput,
  UpdateWorkspaceInput,
} from "@caretalk/contracts/health";
import { db } from "@caretalk/db";
import { chatMessages, chatSessions, memories, sources, workspaces } from "@caretalk/db/schema/health";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { notFound } from "../lib/http-error";

// Not part of the public contract types (no exported alias exists for these two
// enums) but must stay in lockstep with packages/contracts/src/health.ts.
type ChatRole = "user" | "assistant" | "system";
type SourceType = "chat_session" | "import" | "manual" | "seed";

function iso(date: Date) {
  return date.toISOString();
}

function toWorkspace(row: typeof workspaces.$inferSelect) {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    name: row.name,
    description: row.description,
    profile: row.profile,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function toSource(row: typeof sources.$inferSelect) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    type: row.type as SourceType,
    title: row.title,
    content: row.content,
    createdAt: iso(row.createdAt),
  };
}

function toMemory(row: typeof memories.$inferSelect) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    content: row.content,
    kind: row.kind as MemoryKind,
    happenedOn: row.happenedOn,
    sourceId: row.sourceId,
    excerpt: row.excerpt,
    supersededById: row.supersededById,
    supersededAt: row.supersededAt ? iso(row.supersededAt) : null,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function toChatSession(row: typeof chatSessions.$inferSelect) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    title: row.title,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function toChatMessage(row: typeof chatMessages.$inferSelect) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    sessionId: row.sessionId,
    role: row.role as ChatRole,
    parts: row.parts as unknown[],
    createdAt: iso(row.createdAt),
  };
}

// Active memories and the full memory list both sort by "what happened when",
// not "what was said when" — undated facts sink to the bottom rather than
// interleaving randomly with dated ones.
const memoryOrder = [sql`${memories.happenedOn} desc nulls last`, desc(memories.createdAt)];

export const healthRepository = {
  async listWorkspaces(userId: string) {
    const rows = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.ownerUserId, userId))
      .orderBy(desc(workspaces.updatedAt));
    return rows.map(toWorkspace);
  },

  async createWorkspace(userId: string, input: CreateWorkspaceInput) {
    const [row] = await db
      .insert(workspaces)
      .values({
        id: randomUUID(),
        ownerUserId: userId,
        name: input.name,
        description: input.description ?? null,
        profile: input.profile ?? null,
      })
      .returning();
    if (!row) throw notFound("Workspace not created");
    return toWorkspace(row);
  },

  async updateWorkspace(userId: string, workspaceId: string, input: UpdateWorkspaceInput) {
    const [row] = await db
      .update(workspaces)
      .set(input)
      .where(and(eq(workspaces.id, workspaceId), eq(workspaces.ownerUserId, userId)))
      .returning();
    if (!row) throw notFound("Workspace not found");
    return toWorkspace(row);
  },

  async getWorkspace(userId: string, workspaceId: string) {
    const [row] = await db
      .select()
      .from(workspaces)
      .where(and(eq(workspaces.id, workspaceId), eq(workspaces.ownerUserId, userId)))
      .limit(1);
    if (!row) throw notFound("Workspace not found");
    return toWorkspace(row);
  },

  async getWorkspaceDetail(userId: string, workspaceId: string) {
    const workspace = await this.getWorkspace(userId, workspaceId);

    const [memoryRows, sessionRows] = await Promise.all([
      db.select().from(memories).where(eq(memories.workspaceId, workspaceId)).orderBy(...memoryOrder),
      db
        .select()
        .from(chatSessions)
        .where(eq(chatSessions.workspaceId, workspaceId))
        .orderBy(desc(chatSessions.updatedAt)),
    ]);

    return {
      workspace,
      memories: memoryRows.map(toMemory),
      chatSessions: sessionRows.map(toChatSession),
    };
  },

  async listActiveMemories(workspaceId: string) {
    const rows = await db
      .select()
      .from(memories)
      .where(and(eq(memories.workspaceId, workspaceId), isNull(memories.supersededById)))
      .orderBy(...memoryOrder);
    return rows.map(toMemory);
  },

  async createMemory(workspaceId: string, input: CreateMemoryInput) {
    const [row] = await db
      .insert(memories)
      .values({
        id: randomUUID(),
        workspaceId,
        content: input.content,
        kind: input.kind,
        happenedOn: input.happenedOn ?? null,
      })
      .returning();
    if (!row) throw notFound("Memory not created");
    return toMemory(row);
  },

  async updateMemory(userId: string, workspaceId: string, memoryId: string, input: UpdateMemoryInput) {
    await this.getWorkspace(userId, workspaceId);
    const [row] = await db
      .update(memories)
      .set(input)
      .where(and(eq(memories.id, memoryId), eq(memories.workspaceId, workspaceId)))
      .returning();
    if (!row) throw notFound("Memory not found");
    return toMemory(row);
  },

  // Hard delete, doubling as the "undo" path for a save_memory chip: whatever
  // fact this memory superseded goes back to being active, since the fact that
  // closed it out no longer exists.
  async deleteMemory(userId: string, workspaceId: string, memoryId: string) {
    await this.getWorkspace(userId, workspaceId);
    return db.transaction(async (tx) => {
      await tx
        .update(memories)
        .set({ supersededById: null, supersededAt: null })
        .where(and(eq(memories.supersededById, memoryId), eq(memories.workspaceId, workspaceId)));

      const [deleted] = await tx
        .delete(memories)
        .where(and(eq(memories.id, memoryId), eq(memories.workspaceId, workspaceId)))
        .returning();
      if (!deleted) throw notFound("Memory not found");
      return toMemory(deleted);
    });
  },

  async createSource(workspaceId: string, input: { type: SourceType; title?: string | null; content?: string | null }) {
    const [row] = await db
      .insert(sources)
      .values({
        id: randomUUID(),
        workspaceId,
        type: input.type,
        title: input.title ?? null,
        content: input.content ?? null,
      })
      .returning();
    if (!row) throw notFound("Source not created");
    return toSource(row);
  },

  async createChatSession(workspaceId: string, input: CreateChatSessionInput) {
    const [row] = await db
      .insert(chatSessions)
      .values({ id: randomUUID(), workspaceId, title: input.title ?? null })
      .returning();
    if (!row) throw notFound("Chat session not created");
    return toChatSession(row);
  },

  async getChatSession(workspaceId: string, sessionId: string) {
    const [row] = await db
      .select()
      .from(chatSessions)
      .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.workspaceId, workspaceId)))
      .limit(1);
    if (!row) throw notFound("Chat session not found");
    return toChatSession(row);
  },

  async listChatMessages(sessionId: string) {
    const rows = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(chatMessages.createdAt);
    return rows.map(toChatMessage);
  },

  // Upsert by id: useChat re-sends the full message list on every request, so
  // without this the same user/assistant turn would be inserted repeatedly.
  async saveChatMessages(
    workspaceId: string,
    sessionId: string,
    messages: Array<{ id?: string; role: ChatRole; parts: unknown[] }>,
  ) {
    const saved = [];
    for (const message of messages) {
      const [row] = await db
        .insert(chatMessages)
        .values({
          id: message.id ?? randomUUID(),
          workspaceId,
          sessionId,
          role: message.role,
          parts: message.parts,
        })
        .onConflictDoUpdate({
          target: chatMessages.id,
          set: { role: message.role, parts: message.parts },
        })
        .returning();
      if (row) saved.push(toChatMessage(row));
    }
    await db.update(chatSessions).set({ updatedAt: new Date() }).where(eq(chatSessions.id, sessionId));
    return saved;
  },

  async listMemoriesBySource(sourceId: string) {
    const rows = await db.select().from(memories).where(eq(memories.sourceId, sourceId)).orderBy(memories.createdAt);
    return rows.map(toMemory);
  },
};
