import {
  chatRequestSchema,
  chatSessionParamsSchema,
  createChatSessionInputSchema,
  createMemoryInputSchema,
  createWorkspaceInputSchema,
  exportFormatSchema,
  exportResponseSchema,
  importInputSchema,
  importResponseSchema,
  memoryParamsSchema,
  profileVersionParamsSchema,
  profileVersionsResponseSchema,
  updateMemoryInputSchema,
  updateWorkspaceInputSchema,
  workspaceDetailSchema,
  workspaceParamsSchema,
  workspacesResponseSchema,
} from "@caretalk/contracts/health";
import { env } from "@caretalk/env/server";
import { pipeUIMessageStreamToResponse, type UIMessage } from "ai";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";

import { getRequiredUserId } from "../lib/auth";
import { buildExportMarkdown } from "../lib/export-markdown";
import { HttpError } from "../lib/http-error";
import { RateLimiter } from "../lib/rate-limit";
import { healthService } from "../services/health-service";

const exportQuerySchema = z.object({ format: exportFormatSchema.default("json") });

// Shared by the two routes that call a metered model API. Reads are unmetered
// and stay unlimited.
const aiLimiter = new RateLimiter(env.AI_RATE_LIMIT, env.AI_RATE_LIMIT_WINDOW_MS);

function enforceAiRateLimit(userId: string, request: FastifyRequest) {
  const result = aiLimiter.check(userId);
  if (!result.allowed) {
    request.log.warn({ userId }, "AI rate limit hit");
    throw new HttpError(
      429,
      `Too many AI requests — try again in ${result.retryAfterSeconds}s.`,
      "RATE_LIMITED",
    );
  }
}

export const healthMemoryRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/v1/workspaces", async (request) => {
    const userId = await getRequiredUserId(request);
    return workspacesResponseSchema.parse({ workspaces: await healthService.listWorkspaces(userId) });
  });

  // Account-wide export. json = full fidelity (all memories, superseded
  // included); markdown = active-only LLM context meant for pasting into an
  // external chat.
  fastify.get("/api/v1/export", async (request, reply) => {
    const userId = await getRequiredUserId(request);
    const { format } = exportQuerySchema.parse(request.query);
    const data = exportResponseSchema.parse(await healthService.exportAccount(userId));
    if (format === "markdown") {
      return reply.type("text/markdown; charset=utf-8").send(buildExportMarkdown(data));
    }
    return data;
  });

  // Per-workspace export — the common case: one person's history, sized to
  // paste into an external chat without dragging in other workspaces.
  fastify.get("/api/v1/workspaces/:workspaceId/export", async (request, reply) => {
    const userId = await getRequiredUserId(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    const { format } = exportQuerySchema.parse(request.query);
    const data = exportResponseSchema.parse(await healthService.exportWorkspace(userId, workspaceId));
    if (format === "markdown") {
      return reply.type("text/markdown; charset=utf-8").send(buildExportMarkdown(data));
    }
    return data;
  });

  fastify.post("/api/v1/workspaces", async (request) => {
    const userId = await getRequiredUserId(request);
    return healthService.createWorkspace(userId, createWorkspaceInputSchema.parse(request.body));
  });

  fastify.get("/api/v1/workspaces/:workspaceId", async (request) => {
    const userId = await getRequiredUserId(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    return workspaceDetailSchema.parse(await healthService.getWorkspaceDetail(userId, workspaceId));
  });

  fastify.patch("/api/v1/workspaces/:workspaceId", async (request) => {
    const userId = await getRequiredUserId(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    return healthService.updateWorkspace(userId, workspaceId, updateWorkspaceInputSchema.parse(request.body));
  });

  // Profile history. The profile is model-rewritten and injected into every
  // prompt, so a silent bad rewrite degrades every later turn — these two
  // routes are the way back.
  fastify.get("/api/v1/workspaces/:workspaceId/profile-versions", async (request) => {
    const userId = await getRequiredUserId(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    return profileVersionsResponseSchema.parse({
      versions: await healthService.listProfileVersions(userId, workspaceId),
    });
  });

  fastify.post(
    "/api/v1/workspaces/:workspaceId/profile-versions/:versionId/restore",
    async (request) => {
      const userId = await getRequiredUserId(request);
      const { workspaceId, versionId } = profileVersionParamsSchema.parse(request.params);
      return healthService.restoreProfileVersion(userId, workspaceId, versionId);
    },
  );

  fastify.post("/api/v1/workspaces/:workspaceId/memories", async (request) => {
    const userId = await getRequiredUserId(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    return healthService.createMemory(userId, workspaceId, createMemoryInputSchema.parse(request.body));
  });

  fastify.patch("/api/v1/workspaces/:workspaceId/memories/:memoryId", async (request) => {
    const userId = await getRequiredUserId(request);
    const { workspaceId, memoryId } = memoryParamsSchema.parse(request.params);
    return healthService.updateMemory(userId, workspaceId, memoryId, updateMemoryInputSchema.parse(request.body));
  });

  fastify.delete("/api/v1/workspaces/:workspaceId/memories/:memoryId", async (request) => {
    const userId = await getRequiredUserId(request);
    const { workspaceId, memoryId } = memoryParamsSchema.parse(request.params);
    return healthService.deleteMemory(userId, workspaceId, memoryId);
  });

  fastify.post("/api/v1/workspaces/:workspaceId/sessions", async (request) => {
    const userId = await getRequiredUserId(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    return healthService.createChatSession(userId, workspaceId, createChatSessionInputSchema.parse(request.body));
  });

  fastify.get("/api/v1/workspaces/:workspaceId/sessions/:sessionId/messages", async (request) => {
    const userId = await getRequiredUserId(request);
    const { workspaceId, sessionId } = chatSessionParamsSchema.parse(request.params);
    const messages = await healthService.listChatMessages(userId, workspaceId, sessionId);
    return { messages: messages.map((message) => ({ id: message.id, role: message.role, parts: message.parts })) };
  });

  fastify.post("/api/v1/workspaces/:workspaceId/sessions/:sessionId/chat", async (request, reply) => {
    const userId = await getRequiredUserId(request);
    enforceAiRateLimit(userId, request);
    const { workspaceId, sessionId } = chatSessionParamsSchema.parse(request.params);
    const { messages, timeZone } = chatRequestSchema.parse(request.body);

    const stream = await healthService.chatStream(
      userId,
      workspaceId,
      sessionId,
      messages as unknown as UIMessage[],
      timeZone,
    );

    // reply.hijack() bypasses Fastify's onSend pipeline entirely, so the
    // Access-Control-* headers @fastify/cors set on the reply object during its
    // onRequest hook never get flushed to the raw response. Set them by hand so
    // useChat (credentials: "include", cross-origin) can still read the stream.
    reply.raw.setHeader("Access-Control-Allow-Origin", env.CORS_ORIGIN);
    reply.raw.setHeader("Access-Control-Allow-Credentials", "true");
    reply.raw.setHeader("Vary", "Origin");
    reply.hijack();

    await pipeUIMessageStreamToResponse({ response: reply.raw, stream });
  });

  fastify.post("/api/v1/workspaces/:workspaceId/import", async (request) => {
    const userId = await getRequiredUserId(request);
    enforceAiRateLimit(userId, request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    const result = await healthService.importDocument(userId, workspaceId, importInputSchema.parse(request.body));
    return importResponseSchema.parse(result);
  });
};
