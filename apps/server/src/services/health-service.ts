import type {
  CreateChatMessageInput,
  CreateChatSessionInput,
  CreateContextImportInput,
  CreateWorkspaceInput,
  SaveChatInput,
  TemporaryChatMemoryProposalInput,
  TemporaryChatTurnInput,
  UpdateMemoryProposalInput,
  UpdateWorkspaceInput,
} from "@caretalk/contracts/health";

import { notFound } from "../lib/http-error";
import { healthRepository } from "../repositories/health-repository";
import { chatResponseService } from "./chat-response-service";
import { memoryExtractionService } from "./memory-extraction-service";

export const healthService = {
  listWorkspaces(userId: string) {
    return healthRepository.listWorkspaces(userId);
  },
  createWorkspace(userId: string, input: CreateWorkspaceInput) {
    return healthRepository.createWorkspace(userId, input);
  },
  updateWorkspace(userId: string, workspaceId: string, input: UpdateWorkspaceInput) {
    return healthRepository.updateWorkspace(userId, workspaceId, input);
  },
  getWorkspaceDetail(userId: string, workspaceId: string) {
    return healthRepository.getWorkspaceDetail(userId, workspaceId);
  },

  async createChatSession(userId: string, workspaceId: string, input: CreateChatSessionInput) {
    await healthRepository.getOwnedChildWorkspace(userId, workspaceId);
    return healthRepository.createChatSession(workspaceId, input);
  },

  async createChatMessage(userId: string, workspaceId: string, sessionId: string, input: CreateChatMessageInput) {
    const detail = await healthRepository.getWorkspaceDetail(userId, workspaceId);
    if (!detail.chatSessions.some((session) => session.id === sessionId)) {
      throw notFound("Chat session not found");
    }
    return healthRepository.createChatMessage(workspaceId, sessionId, input);
  },

  async sendChatTurn(userId: string, workspaceId: string, sessionId: string, input: CreateChatMessageInput) {
    const detail = await healthRepository.getWorkspaceDetail(userId, workspaceId);
    if (!detail.chatSessions.some((session) => session.id === sessionId)) {
      throw notFound("Chat session not found");
    }
    const userMessage = await healthRepository.createChatMessage(workspaceId, sessionId, { ...input, role: "user" });
    const content = await chatResponseService.answer({ workspace: detail, message: input.content });
    const assistantMessage = await healthRepository.createChatMessage(workspaceId, sessionId, { role: "assistant", content });
    return { userMessage, assistantMessage };
  },

  async sendTemporaryChatTurn(userId: string, workspaceId: string, input: TemporaryChatTurnInput) {
    const detail = await healthRepository.getWorkspaceDetail(userId, workspaceId);
    const content = await chatResponseService.answer({ workspace: detail, message: input.message, messages: input.messages });
    return { assistantMessage: { role: "assistant" as const, content } };
  },

  async saveChat(userId: string, workspaceId: string, input: SaveChatInput) {
    await healthRepository.getOwnedChildWorkspace(userId, workspaceId);
    const session = await healthRepository.createChatSession(workspaceId, { title: input.title ?? "Saved chat" });
    for (const message of input.messages) {
      await healthRepository.createChatMessage(workspaceId, session.id, message);
    }
    return session;
  },

  async proposeFromTemporaryChat(userId: string, workspaceId: string, input: TemporaryChatMemoryProposalInput) {
    const detail = await healthRepository.getWorkspaceDetail(userId, workspaceId);
    const transcript = input.messages.map((message) => message.role.toUpperCase() + ": " + message.content).join("\n\n");
    const source = await healthRepository.createSource(workspaceId, {
      type: "chat_message",
      title: input.title,
      content: null,
      metadata: { temporary: true, messageCount: input.messages.length },
    });
    const extracted = await memoryExtractionService.extractFromText({ workspace: detail, sourceTitle: input.title, text: transcript });
    return healthRepository.createProposal(workspaceId, source.id, extracted);
  },

  async importTranscript(userId: string, workspaceId: string, input: CreateContextImportInput) {
    const detail = await healthRepository.getWorkspaceDetail(userId, workspaceId);
    const source = await healthRepository.createSource(workspaceId, { type: "transcript_import", title: input.title, content: input.content });
    const extracted = await memoryExtractionService.extractFromText({ workspace: detail, sourceTitle: input.title, text: input.content });
    return healthRepository.createProposal(workspaceId, source.id, extracted);
  },

  async proposeFromChat(userId: string, workspaceId: string, sessionId: string) {
    const detail = await healthRepository.getWorkspaceDetail(userId, workspaceId);
    if (!detail.chatSessions.some((session) => session.id === sessionId)) {
      throw notFound("Chat session not found");
    }
    const messages = await healthRepository.listChatMessages(workspaceId, sessionId);
    const transcript = messages.map((message) => message.role.toUpperCase() + ": " + message.content).join("\n\n");
    const source = await healthRepository.createSource(workspaceId, { type: "chat_message", title: "Chat session memory proposal", content: transcript, metadata: { sessionId } });
    const extracted = await memoryExtractionService.extractFromText({ workspace: detail, sourceTitle: "Chat session memory proposal", text: transcript });
    return healthRepository.createProposal(workspaceId, source.id, extracted);
  },

  updateProposal(userId: string, proposalId: string, input: UpdateMemoryProposalInput) {
    return healthRepository.updateProposal(userId, proposalId, input);
  },

  async getProposal(userId: string, proposalId: string) {
    const proposal = await healthRepository.findProposalForUser(userId, proposalId);
    return healthRepository.getProposal(proposal.workspaceId, proposal.id);
  },

  approveProposal(userId: string, proposalId: string) {
    return healthRepository.approveProposal(userId, proposalId);
  },
};
