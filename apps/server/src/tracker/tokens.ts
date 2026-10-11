import { createHash, randomBytes, randomUUID } from "node:crypto";

import { db } from "@caretalk/db";
import { apiTokens } from "@caretalk/db/schema/tracker";
import { and, desc, eq, isNull } from "drizzle-orm";

import { notFound, unauthorized } from "../lib/http-error";
import { healthRepository } from "../repositories/health-repository";

// Personal access tokens for clients that can't do OAuth (the Hermes CLI).
// The token is shown once; only its sha256 is stored, so a database dump
// can't be replayed. Each token is bound to a single workspace.

const PREFIX = "ct_";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export type TokenCaller = { userId: string; workspaceId: string; tokenId: string };

export async function createApiToken(userId: string, workspaceId: string, name: string) {
  await healthRepository.getWorkspace(userId, workspaceId);
  const token = PREFIX + randomBytes(32).toString("base64url");
  const id = randomUUID();
  await db.insert(apiTokens).values({ id, userId, workspaceId, name, tokenHash: hash(token) });
  return { id, token };
}

export async function listApiTokens(userId: string) {
  const rows = await db
    .select()
    .from(apiTokens)
    .where(and(eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)))
    .orderBy(desc(apiTokens.createdAt));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    workspaceId: row.workspaceId,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  }));
}

export async function revokeApiToken(userId: string, id: string) {
  const rows = await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)))
    .returning({ id: apiTokens.id });
  if (rows.length === 0) throw notFound("Token not found");
}

/** Resolves `Authorization: Bearer ct_…` to its owner and workspace, or throws 401. */
export async function authenticateToken(header: string | undefined): Promise<TokenCaller> {
  const token = header?.match(/^Bearer\s+(ct_[A-Za-z0-9_-]+)$/)?.[1];
  if (!token) throw unauthorized("Missing or malformed API token");
  const [row] = await db
    .select()
    .from(apiTokens)
    .where(and(eq(apiTokens.tokenHash, hash(token)), isNull(apiTokens.revokedAt)))
    .limit(1);
  if (!row) throw unauthorized("Invalid or revoked API token");
  // Coarse last-used stamp: at most one write per token per minute.
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
    await db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, row.id));
  }
  return { userId: row.userId, workspaceId: row.workspaceId, tokenId: row.id };
}
