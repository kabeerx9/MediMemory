import {
  chatSessionParamsSchema,
  createChatSessionInputSchema,
  createMemoryInputSchema,
  createWorkspaceInputSchema,
  exportFormatSchema,
  exportResponseSchema,
  importInputSchema,
  importResponseSchema,
  memoryParamsSchema,
  updateMemoryInputSchema,
  updateWorkspaceInputSchema,
  workspaceDetailSchema,
  workspaceParamsSchema,
  workspacesResponseSchema,
} from "@caretalk/contracts/health";
import { env } from "@caretalk/env/server";
import { pipeUIMessageStreamToResponse, type UIMessage } from "ai";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { getRequiredUserId } from "../lib/auth";
import { buildExportMarkdown } from "../lib/export-markdown";
import { healthService } from "../services/health-service";

// Loose on purpose: `parts` is a large discriminated union owned by the `ai`
// package, not something this route should re-validate part-by-part. We only
// guarantee the envelope shape useChat's DefaultChatTransport actually sends.
const uiMessageInputSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["system", "user", "assistant"]),
  parts: z.array(z.unknown()),
});
const chatStreamInputSchema = z.object({ messages: z.array(uiMessageInputSchema) });

const exportQuerySchema = z.object({ format: exportFormatSchema.default("json") });

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
    const { workspaceId, sessionId } = chatSessionParamsSchema.parse(request.params);
    const { messages } = chatStreamInputSchema.parse(request.body);

    const stream = await healthService.chatStream(userId, workspaceId, sessionId, messages as unknown as UIMessage[]);

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
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    const result = await healthService.importDocument(userId, workspaceId, importInputSchema.parse(request.body));
    return importResponseSchema.parse(result);
  });
};
