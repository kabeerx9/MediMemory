import {
  chatSessionParamsSchema,
  createChatMessageInputSchema,
  createChatSessionInputSchema,
  createContextImportInputSchema,
  saveChatInputSchema,
  temporaryChatMemoryProposalInputSchema,
  temporaryChatTurnInputSchema,
  createWorkspaceInputSchema,
  proposalParamsSchema,
  updateMemoryProposalInputSchema,
  updateWorkspaceInputSchema,
  workspaceDetailSchema,
  workspaceParamsSchema,
  workspacesResponseSchema,
} from "@caretalk/contracts/health";
import type { FastifyPluginAsync } from "fastify";

import { getRequiredUserId } from "../lib/auth";
import { healthService } from "../services/health-service";

export const healthMemoryRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/v1/workspaces", async (request) => {
    const userId = await getRequiredUserId(request);
    return workspacesResponseSchema.parse({ workspaces: await healthService.listWorkspaces(userId) });
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

  fastify.post("/api/v1/workspaces/:workspaceId/chat/sessions", async (request) => {
    const userId = await getRequiredUserId(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    return healthService.createChatSession(userId, workspaceId, createChatSessionInputSchema.parse(request.body));
  });

  fastify.post("/api/v1/workspaces/:workspaceId/chat/respond", async (request) => {
    const userId = await getRequiredUserId(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    return healthService.sendTemporaryChatTurn(userId, workspaceId, temporaryChatTurnInputSchema.parse(request.body));
  });

  fastify.post("/api/v1/workspaces/:workspaceId/chat/save", async (request) => {
    const userId = await getRequiredUserId(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    return healthService.saveChat(userId, workspaceId, saveChatInputSchema.parse(request.body));
  });

  fastify.post("/api/v1/workspaces/:workspaceId/chat/propose-memory", async (request) => {
    const userId = await getRequiredUserId(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    return healthService.proposeFromTemporaryChat(userId, workspaceId, temporaryChatMemoryProposalInputSchema.parse(request.body));
  });

  fastify.post("/api/v1/workspaces/:workspaceId/chat/sessions/:sessionId/messages", async (request) => {
    const userId = await getRequiredUserId(request);
    const { workspaceId, sessionId } = chatSessionParamsSchema.parse(request.params);
    return healthService.createChatMessage(userId, workspaceId, sessionId, createChatMessageInputSchema.parse(request.body));
  });

  fastify.post("/api/v1/workspaces/:workspaceId/chat/sessions/:sessionId/respond", async (request) => {
    const userId = await getRequiredUserId(request);
    const { workspaceId, sessionId } = chatSessionParamsSchema.parse(request.params);
    return healthService.sendChatTurn(userId, workspaceId, sessionId, createChatMessageInputSchema.parse(request.body));
  });

  fastify.post("/api/v1/workspaces/:workspaceId/context-imports", async (request) => {
    const userId = await getRequiredUserId(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    return healthService.importTranscript(userId, workspaceId, createContextImportInputSchema.parse(request.body));
  });

  fastify.post("/api/v1/workspaces/:workspaceId/chat/sessions/:sessionId/propose-memory", async (request) => {
    const userId = await getRequiredUserId(request);
    const { workspaceId, sessionId } = chatSessionParamsSchema.parse(request.params);
    return healthService.proposeFromChat(userId, workspaceId, sessionId);
  });

  fastify.patch("/api/v1/memory-proposals/:proposalId", async (request) => {
    const userId = await getRequiredUserId(request);
    const { proposalId } = proposalParamsSchema.parse(request.params);
    return healthService.updateProposal(userId, proposalId, updateMemoryProposalInputSchema.parse(request.body));
  });

  fastify.get("/api/v1/memory-proposals/:proposalId", async (request) => {
    const userId = await getRequiredUserId(request);
    const { proposalId } = proposalParamsSchema.parse(request.params);
    return healthService.getProposal(userId, proposalId);
  });

  fastify.post("/api/v1/memory-proposals/:proposalId/approve", async (request) => {
    const userId = await getRequiredUserId(request);
    const { proposalId } = proposalParamsSchema.parse(request.params);
    return healthService.approveProposal(userId, proposalId);
  });
};
