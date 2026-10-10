import { randomUUID } from "node:crypto";

import type { StoredFileMediaType } from "@caretalk/contracts/health";
import { db } from "@caretalk/db";
import { memories, sourceFiles, sources, uploadLinks, workspaces } from "@caretalk/db/schema/health";
import { and, count, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";

import { notFound } from "../lib/http-error";
import { toSource } from "./health-repository";

// Data access for document-like sources (imports, reports), their original
// files, external-app provenance rows, and one-time upload links. Every query
// takes a workspaceId that the caller has already authorized for the user —
// this layer scopes by it but doesn't re-check ownership.

function toSourceFile(row: typeof sourceFiles.$inferSelect) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    sourceId: row.sourceId,
    fileName: row.fileName,
    mediaType: row.mediaType as StoredFileMediaType,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt.toISOString(),
  };
}

export const reportsRepository = {
  /**
   * The provenance row for facts an external app saves without a specific
   * document. Insert-or-reuse on the partial unique index, so parallel tool
   * calls from one chat converge on a single row instead of racing.
   */
  async getOrCreateAppSource(workspaceId: string, client: { id: string; name: string }) {
    await db
      .insert(sources)
      .values({
        id: randomUUID(),
        workspaceId,
        type: "mcp",
        title: client.name,
        clientId: client.id,
        clientName: client.name,
      })
      .onConflictDoNothing({
        target: [sources.workspaceId, sources.clientId],
        where: sql`${sources.type} = 'mcp'`,
      });

    const [row] = await db
      .select()
      .from(sources)
      .where(and(eq(sources.workspaceId, workspaceId), eq(sources.type, "mcp"), eq(sources.clientId, client.id)))
      .limit(1);
    if (!row) throw new Error("app source upsert returned no row");
    return toSource(row);
  },

  async createReportSource(workspaceId: string, input: { title: string; client: { id: string; name: string } | null }) {
    const [row] = await db
      .insert(sources)
      .values({
        id: randomUUID(),
        workspaceId,
        type: "report",
        title: input.title,
        clientId: input.client?.id ?? null,
        clientName: input.client?.name ?? null,
      })
      .returning();
    if (!row) throw new Error("report insert returned no row");
    return toSource(row);
  },

  async getSource(workspaceId: string, sourceId: string) {
    const [row] = await db
      .select()
      .from(sources)
      .where(and(eq(sources.id, sourceId), eq(sources.workspaceId, workspaceId)))
      .limit(1);
    if (!row) throw notFound("Report not found");
    return toSource(row);
  },

  /** Imports and reports, newest first, with their files and fact counts. */
  async listReports(workspaceId: string) {
    const sourceRows = await db
      .select()
      .from(sources)
      .where(and(eq(sources.workspaceId, workspaceId), inArray(sources.type, ["import", "report"])))
      .orderBy(desc(sources.createdAt));
    if (sourceRows.length === 0) return [];

    const ids = sourceRows.map((row) => row.id);
    const [fileRows, countRows] = await Promise.all([
      db.select().from(sourceFiles).where(inArray(sourceFiles.sourceId, ids)).orderBy(sourceFiles.createdAt),
      db
        .select({ sourceId: memories.sourceId, total: count() })
        .from(memories)
        .where(inArray(memories.sourceId, ids))
        .groupBy(memories.sourceId),
    ]);

    const filesBySource = new Map<string, ReturnType<typeof toSourceFile>[]>();
    for (const row of fileRows) {
      const list = filesBySource.get(row.sourceId) ?? [];
      list.push(toSourceFile(row));
      filesBySource.set(row.sourceId, list);
    }
    const counts = new Map(countRows.map((row) => [row.sourceId, Number(row.total)]));

    return sourceRows.map((row) => {
      const { content: _content, ...source } = toSource(row);
      return {
        ...source,
        content: null,
        files: filesBySource.get(row.id) ?? [],
        memoryCount: counts.get(row.id) ?? 0,
      };
    });
  },

  /** Reports created by an external app that still have no original attached. */
  async listReportsMissingOriginals(workspaceId: string) {
    const rows = await db
      .select({ id: sources.id, title: sources.title, createdAt: sources.createdAt })
      .from(sources)
      .leftJoin(sourceFiles, eq(sourceFiles.sourceId, sources.id))
      .where(and(eq(sources.workspaceId, workspaceId), eq(sources.type, "report"), isNull(sourceFiles.id)))
      .orderBy(desc(sources.createdAt))
      .limit(20);
    return rows.map((row) => ({ id: row.id, title: row.title, createdAt: row.createdAt.toISOString() }));
  },

  async insertFile(input: {
    id: string;
    workspaceId: string;
    sourceId: string;
    fileName: string;
    mediaType: StoredFileMediaType;
    sizeBytes: number;
    sha256: string;
    storageKey: string;
  }) {
    const [row] = await db.insert(sourceFiles).values(input).returning();
    if (!row) throw new Error("file insert returned no row");
    return toSourceFile(row);
  },

  async getFile(workspaceId: string, fileId: string) {
    const [row] = await db
      .select()
      .from(sourceFiles)
      .where(and(eq(sourceFiles.id, fileId), eq(sourceFiles.workspaceId, workspaceId)))
      .limit(1);
    if (!row) throw notFound("File not found");
    return { ...toSourceFile(row), storageKey: row.storageKey };
  },

  async createUploadLink(input: { tokenHash: string; workspaceId: string; sourceId: string; expiresAt: Date }) {
    await db.insert(uploadLinks).values(input);
  },

  /** Link + the names the upload page shows. Null when the token is unknown. */
  async findUploadLink(tokenHash: string) {
    const [row] = await db
      .select({
        link: uploadLinks,
        reportTitle: sources.title,
        workspaceName: workspaces.name,
      })
      .from(uploadLinks)
      .innerJoin(sources, eq(sources.id, uploadLinks.sourceId))
      .innerJoin(workspaces, eq(workspaces.id, uploadLinks.workspaceId))
      .where(eq(uploadLinks.tokenHash, tokenHash))
      .limit(1);
    return row ?? null;
  },

  /**
   * Atomically spends a link. The conditional UPDATE is the whole guarantee:
   * of two concurrent uploads on one token, exactly one sees a returned row.
   */
  async claimUploadLink(tokenHash: string, now: Date = new Date()) {
    const [row] = await db
      .update(uploadLinks)
      .set({ usedAt: now })
      .where(and(eq(uploadLinks.tokenHash, tokenHash), isNull(uploadLinks.usedAt), gt(uploadLinks.expiresAt, now)))
      .returning();
    return row ?? null;
  },

  /** Gives a claimed link back when storing the file failed after the claim. */
  async releaseUploadLink(tokenHash: string) {
    await db.update(uploadLinks).set({ usedAt: null }).where(eq(uploadLinks.tokenHash, tokenHash));
  },
};
