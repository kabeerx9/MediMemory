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
import {
  chatMessages,
  chatSessions,
  memories,
  profileVersions,
  sources,
  workspaces,
} from "@caretalk/db/schema/health";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { notFound } from "../lib/http-error";
import { normalizeMetric, writeProfile } from "../lib/memory-tools";

// Not part of the public contract types (no exported alias exists for these two
// enums) but must stay in lockstep with packages/contracts/src/health.ts.
type ChatRole = "user" | "assistant" | "system";
type SourceType = "chat_session" | "import" | "manual" | "seed";
type ProfileChangedBy = "model" | "user" | "restore";

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
    contentHash: row.contentHash,
    createdAt: iso(row.createdAt),
  };
}

function toProfileVersion(row: typeof profileVersions.$inferSelect) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    profile: row.profile,
    changedBy: row.changedBy as ProfileChangedBy,
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
    metric: row.metric,
    value: row.value,
    valueSecondary: row.valueSecondary,
    unit: row.unit,
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

  // Profile edits are split out of the generic patch so the manual rail edit
  // gets the same version snapshot the model's update_profile tool does —
  // otherwise "restore" would only ever undo the model, and a hand-edit could
  // still erase a good profile with no way back.
  async updateWorkspace(userId: string, workspaceId: string, input: UpdateWorkspaceInput) {
    await this.getWorkspace(userId, workspaceId);
    const { profile, ...rest } = input;

    if (profile !== undefined) {
      await writeProfile(workspaceId, profile, "user");
    }

    if (Object.keys(rest).length === 0) {
      return this.getWorkspace(userId, workspaceId);
    }

    const [row] = await db
      .update(workspaces)
      .set(rest)
      .where(and(eq(workspaces.id, workspaceId), eq(workspaces.ownerUserId, userId)))
      .returning();
    if (!row) throw notFound("Workspace not found");
    return toWorkspace(row);
  },

  async listProfileVersions(userId: string, workspaceId: string) {
    await this.getWorkspace(userId, workspaceId);
    const rows = await db
      .select()
      .from(profileVersions)
      .where(eq(profileVersions.workspaceId, workspaceId))
      .orderBy(desc(profileVersions.createdAt))
      .limit(50);
    return rows.map(toProfileVersion);
  },

  // Restoring is itself a profile write, so the version being replaced is
  // snapshotted first — you can always roll forward again out of a mistaken
  // rollback.
  async restoreProfileVersion(userId: string, workspaceId: string, versionId: string) {
    await this.getWorkspace(userId, workspaceId);
    const [version] = await db
      .select()
      .from(profileVersions)
      .where(and(eq(profileVersions.id, versionId), eq(profileVersions.workspaceId, workspaceId)))
      .limit(1);
    if (!version) throw notFound("Profile version not found");

    const row = await writeProfile(workspaceId, version.profile, "restore");
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

  // Single-workspace export. Returned as a one-element list so it shares the
  // exportResponse shape (and the markdown builder) with the account export.
  async exportWorkspace(userId: string, workspaceId: string) {
    const workspace = await this.getWorkspace(userId, workspaceId);
    const memoryRows = await db
      .select()
      .from(memories)
      .where(eq(memories.workspaceId, workspaceId))
      .orderBy(...memoryOrder);
    return [{ workspace, memories: memoryRows.map(toMemory) }];
  },

  // Two queries total regardless of workspace count (workspaces, then all
  // their memories via inArray), grouped in memory — not one memory query per
  // workspace.
  async exportAccount(userId: string) {
    const workspaceRows = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.ownerUserId, userId))
      .orderBy(desc(workspaces.updatedAt));
    if (workspaceRows.length === 0) return [];

    const memoryRows = await db
      .select()
      .from(memories)
      .where(inArray(memories.workspaceId, workspaceRows.map((row) => row.id)))
      .orderBy(...memoryOrder);

    const byWorkspace = new Map<string, ReturnType<typeof toMemory>[]>();
    for (const row of memoryRows) {
      const list = byWorkspace.get(row.workspaceId);
      if (list) {
        list.push(toMemory(row));
      } else {
        byWorkspace.set(row.workspaceId, [toMemory(row)]);
      }
    }

    return workspaceRows.map((row) => ({
      workspace: toWorkspace(row),
      memories: byWorkspace.get(row.id) ?? [],
    }));
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
        metric: normalizeMetric(input.metric),
        value: input.value ?? null,
        valueSecondary: input.valueSecondary ?? null,
        unit: input.unit ?? null,
      })
      .returning();
    if (!row) throw notFound("Memory not created");
    return toMemory(row);
  },

  async updateMemory(userId: string, workspaceId: string, memoryId: string, input: UpdateMemoryInput) {
    await this.getWorkspace(userId, workspaceId);
    const [row] = await db
      .update(memories)
      .set(input.metric !== undefined ? { ...input, metric: normalizeMetric(input.metric) } : input)
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

  async createSource(
    workspaceId: string,
    input: {
      type: SourceType;
      title?: string | null;
      content?: string | null;
      contentHash?: string | null;
    },
  ) {
    const [row] = await db
      .insert(sources)
      .values({
        id: randomUUID(),
        workspaceId,
        type: input.type,
        title: input.title ?? null,
        content: input.content ?? null,
        contentHash: input.contentHash ?? null,
      })
      .returning();
    if (!row) throw notFound("Source not created");
    return toSource(row);
  },

  async findSourceByHash(workspaceId: string, contentHash: string) {
    const [row] = await db
      .select()
      .from(sources)
      .where(and(eq(sources.workspaceId, workspaceId), eq(sources.contentHash, contentHash)))
      .limit(1);
    return row ? toSource(row) : null;
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
  //
  // setWhere pins the update to this session: message ids arrive from the
  // client, and without the guard a replayed or hand-crafted id would rewrite a
  // message belonging to a different session (or another user's workspace).
  //
  // When the guard blocks the update, Postgres returns no row — the colliding
  // message is NOT ours to touch. Dropping it there would trade corruption for
  // silent data loss, so the message is re-inserted under a server-generated id
  // instead. The client keeps its own local id; the next reload reads the new
  // one. In practice this only fires on a hand-crafted id, since the AI SDK
  // generates UUIDs.
  async saveChatMessages(
    workspaceId: string,
    sessionId: string,
    messages: Array<{ id?: string; role: ChatRole; parts: unknown[] }>,
  ) {
    const saved = [];
    for (const message of messages) {
      const values = {
        workspaceId,
        sessionId,
        role: message.role,
        parts: message.parts,
      };

      const [row] = await db
        .insert(chatMessages)
        .values({ id: message.id ?? randomUUID(), ...values })
        .onConflictDoUpdate({
          target: chatMessages.id,
          set: { role: message.role, parts: message.parts },
          setWhere: and(
            eq(chatMessages.sessionId, sessionId),
            eq(chatMessages.workspaceId, workspaceId),
          ),
        })
        .returning();

      if (row) {
        saved.push(toChatMessage(row));
        continue;
      }

      const [reinserted] = await db
        .insert(chatMessages)
        .values({ id: randomUUID(), ...values })
        .returning();
      if (reinserted) saved.push(toChatMessage(reinserted));
    }
    await db.update(chatSessions).set({ updatedAt: new Date() }).where(eq(chatSessions.id, sessionId));
    return saved;
  },

  async listMemoriesBySource(sourceId: string) {
    const rows = await db.select().from(memories).where(eq(memories.sourceId, sourceId)).orderBy(memories.createdAt);
    return rows.map(toMemory);
  },
};
