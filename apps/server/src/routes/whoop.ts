import { randomBytes } from "node:crypto";

import { whoopStatusSchema, whoopSyncResultSchema, type WhoopStatus } from "@caretalk/contracts/health";
import { env } from "@caretalk/env/server";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { getRequiredUserId } from "../lib/auth";
import { HttpError, notFound } from "../lib/http-error";
import { healthRepository } from "../repositories/health-repository";
import { authorizeUrl, exchangeCode, getJson, revokeAccess } from "../whoop/client";
import { whoopConfig } from "../whoop/config";
import { decryptToken, encryptToken } from "../whoop/crypto";
import { whoopRepository } from "../whoop/repository";
import { syncConnection, syncWorkspace } from "../whoop/sync";

// WHOOP from the web app: start the OAuth flow, receive the callback, show
// status, sync on demand, disconnect. The MCP tools cover reading the data.
//
// /api/whoop/* are browser navigations (redirects), /api/v1/whoop is JSON for
// the connections page — the same split the auth routes use.

const STATE_TTL_MS = 10 * 60 * 1000;

const workspaceQuery = z.object({ workspaceId: z.string().min(1).max(200) });

function requireConfig() {
  const cfg = whoopConfig();
  if (!cfg) throw new HttpError(503, "WHOOP isn't configured on this server.", "WHOOP_NOT_CONFIGURED");
  return cfg;
}

const redirectUri = () => new URL("/api/whoop/callback", env.BETTER_AUTH_URL).toString();
const backToApp = (outcome: "connected" | "error") => `${env.CORS_ORIGIN.replace(/\/$/, "")}/connections?whoop=${outcome}`;

export const whoopRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/whoop/connect", async (request, reply) => {
    const cfg = requireConfig();
    const userId = await getRequiredUserId(request);
    const { workspaceId } = workspaceQuery.parse(request.query);
    await healthRepository.getWorkspace(userId, workspaceId);

    const state = randomBytes(24).toString("base64url");
    await whoopRepository.createOauthState({ state, userId, workspaceId, expiresAt: new Date(Date.now() + STATE_TTL_MS) });
    return reply.redirect(authorizeUrl(cfg, state, redirectUri()));
  });

  // No session check here: the browser arrives from WHOOP, and the state row
  // (created by a signed-in user, single-use, 10 minutes) is the binding.
  fastify.get("/api/whoop/callback", async (request, reply) => {
    const cfg = whoopConfig();
    const { code, state } = z.object({ code: z.string().optional(), state: z.string().optional() }).parse(request.query);
    if (!cfg || !code || !state) return reply.redirect(backToApp("error"));

    const pending = await whoopRepository.consumeOauthState(state);
    if (!pending) return reply.redirect(backToApp("error"));

    try {
      const tokens = await exchangeCode(cfg, code, redirectUri());
      const profile = (await getJson(cfg, tokens.accessToken, "/v2/user/profile/basic")) as { user_id?: number };
      const connection = await whoopRepository.upsertConnection({
        workspaceId: pending.workspaceId,
        externalUserId: profile.user_id == null ? null : String(profile.user_id),
        refreshTokenEnc: encryptToken(tokens.refreshToken, cfg.key),
        accessTokenEnc: encryptToken(tokens.accessToken, cfg.key),
        accessExpiresAt: tokens.expiresAt,
        scopes: tokens.scope,
      });
      // Backfill in the background; the page shows progress via status.
      void syncConnection(connection.id).catch((error) => request.log.error({ err: error }, "WHOOP backfill failed"));
      return reply.redirect(backToApp("connected"));
    } catch (error) {
      request.log.error({ err: error }, "WHOOP connect failed");
      return reply.redirect(backToApp("error"));
    }
  });

  fastify.get("/api/v1/whoop", async (request): Promise<WhoopStatus> => {
    const userId = await getRequiredUserId(request);
    const { workspaceId } = workspaceQuery.parse(request.query);
    if (!whoopConfig()) return { configured: false, connection: null };
    await healthRepository.getWorkspace(userId, workspaceId);
    const connection = await whoopRepository.getConnectionForWorkspace(workspaceId);
    return whoopStatusSchema.parse({
      configured: true,
      connection: connection && {
        status: connection.status,
        lastSyncedAt: connection.lastSyncedAt?.toISOString() ?? null,
        lastError: connection.lastError,
      },
    });
  });

  fastify.post("/api/v1/whoop/sync", async (request) => {
    requireConfig();
    const userId = await getRequiredUserId(request);
    const { workspaceId } = workspaceQuery.parse(request.body);
    return whoopSyncResultSchema.parse(await syncWorkspace(userId, workspaceId));
  });

  // Data already ingested stays: Caretalk is append-only by design.
  fastify.delete("/api/v1/whoop", async (request) => {
    const cfg = requireConfig();
    const userId = await getRequiredUserId(request);
    const { workspaceId } = workspaceQuery.parse(request.query);
    await healthRepository.getWorkspace(userId, workspaceId);
    const connection = await whoopRepository.getConnectionForWorkspace(workspaceId);
    if (!connection) throw notFound("WHOOP isn't connected for this workspace.");

    // Best effort at WHOOP: a token that's already dead still ends disconnected here.
    if (connection.accessTokenEnc) {
      await revokeAccess(cfg, decryptToken(connection.accessTokenEnc, cfg.key)).catch((error) =>
        request.log.warn({ err: error }, "WHOOP revoke failed"),
      );
    }
    await whoopRepository.revoke(connection.id);
    return { ok: true };
  });
};
