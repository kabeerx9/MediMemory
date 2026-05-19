import {
  chatSessionParamsSchema,
  createChatMessageInputSchema,
  createChatSessionInputSchema,
  createContextImportInputSchema,
  createDoctorQuestionInputSchema,
  createMedicationInputSchema,
  createReportFileInputSchema,
  createSymptomInputSchema,
  createTimelineEntryInputSchema,
  saveChatInputSchema,
  temporaryChatMemoryProposalInputSchema,
  temporaryChatTurnInputSchema,
  createWorkspaceInputSchema,
  deleteResponseSchema,
  idParamsSchema,
  proposalParamsSchema,
  updateDoctorQuestionInputSchema,
  updateMedicationInputSchema,
  updateMemoryProposalInputSchema,
  updateReportFileInputSchema,
  updateSymptomInputSchema,
  updateTimelineEntryInputSchema,
  updateWorkspaceInputSchema,
  workspaceDetailSchema,
  workspaceParamsSchema,
  workspacesResponseSchema,
} from "@health-conversation/contracts/health";
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

  fastify.post("/api/v1/workspaces/:workspaceId/timeline", async (request) => {
    const userId = await getRequiredUserId(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    return healthService.createTimeline(userId, workspaceId, createTimelineEntryInputSchema.parse(request.body));
  });
  fastify.patch("/api/v1/workspaces/:workspaceId/timeline/:id", async (request) => {
    const userId = await getRequiredUserId(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    const { id } = idParamsSchema.parse(request.params);
    return healthService.updateTimeline(userId, workspaceId, id, updateTimelineEntryInputSchema.parse(request.body));
  });
  fastify.delete("/api/v1/workspaces/:workspaceId/timeline/:id", async (request) => {
    const userId = await getRequiredUserId(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    const { id } = idParamsSchema.parse(request.params);
    return deleteResponseSchema.parse({ deleted: await healthService.deleteTimeline(userId, workspaceId, id) });
  });

  fastify.post("/api/v1/workspaces/:workspaceId/medications", async (request) => {
    const userId = await getRequiredUserId(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    return healthService.createMedication(userId, workspaceId, createMedicationInputSchema.parse(request.body));
  });
  fastify.patch("/api/v1/workspaces/:workspaceId/medications/:id", async (request) => {
    const userId = await getRequiredUserId(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    const { id } = idParamsSchema.parse(request.params);
    return healthService.updateMedication(userId, workspaceId, id, updateMedicationInputSchema.parse(request.body));
  });
  fastify.delete("/api/v1/workspaces/:workspaceId/medications/:id", async (request) => {
    const userId = await getRequiredUserId(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    const { id } = idParamsSchema.parse(request.params);
    return deleteResponseSchema.parse({ deleted: await healthService.deleteMedication(userId, workspaceId, id) });
  });

  fastify.post("/api/v1/workspaces/:workspaceId/symptoms", async (request) => {
    const userId = await getRequiredUserId(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    return healthService.createSymptom(userId, workspaceId, createSymptomInputSchema.parse(request.body));
  });
  fastify.patch("/api/v1/workspaces/:workspaceId/symptoms/:id", async (request) => {
    const userId = await getRequiredUserId(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    const { id } = idParamsSchema.parse(request.params);
    return healthService.updateSymptom(userId, workspaceId, id, updateSymptomInputSchema.parse(request.body));
  });
  fastify.delete("/api/v1/workspaces/:workspaceId/symptoms/:id", async (request) => {
    const userId = await getRequiredUserId(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    const { id } = idParamsSchema.parse(request.params);
    return deleteResponseSchema.parse({ deleted: await healthService.deleteSymptom(userId, workspaceId, id) });
  });

  fastify.post("/api/v1/workspaces/:workspaceId/doctor-questions", async (request) => {
    const userId = await getRequiredUserId(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    return healthService.createDoctorQuestion(userId, workspaceId, createDoctorQuestionInputSchema.parse(request.body));
  });
  fastify.patch("/api/v1/workspaces/:workspaceId/doctor-questions/:id", async (request) => {
    const userId = await getRequiredUserId(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    const { id } = idParamsSchema.parse(request.params);
    return healthService.updateDoctorQuestion(userId, workspaceId, id, updateDoctorQuestionInputSchema.parse(request.body));
  });
  fastify.delete("/api/v1/workspaces/:workspaceId/doctor-questions/:id", async (request) => {
    const userId = await getRequiredUserId(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    const { id } = idParamsSchema.parse(request.params);
    return deleteResponseSchema.parse({ deleted: await healthService.deleteDoctorQuestion(userId, workspaceId, id) });
  });

  fastify.post("/api/v1/workspaces/:workspaceId/reports", async (request) => {
    const userId = await getRequiredUserId(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    return healthService.createReport(userId, workspaceId, createReportFileInputSchema.parse(request.body));
  });
  fastify.patch("/api/v1/workspaces/:workspaceId/reports/:id", async (request) => {
    const userId = await getRequiredUserId(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    const { id } = idParamsSchema.parse(request.params);
    return healthService.updateReport(userId, workspaceId, id, updateReportFileInputSchema.parse(request.body));
  });
  fastify.delete("/api/v1/workspaces/:workspaceId/reports/:id", async (request) => {
    const userId = await getRequiredUserId(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    const { id } = idParamsSchema.parse(request.params);
    return deleteResponseSchema.parse({ deleted: await healthService.deleteReport(userId, workspaceId, id) });
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
