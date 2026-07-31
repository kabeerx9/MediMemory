import { randomUUID } from "node:crypto";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type {
  CreateChatSessionInput,
  CreateMemoryInput,
  CreateWorkspaceInput,
  ImportInput,
  UpdateMemoryInput,
  UpdateWorkspaceInput,
} from "@caretalk/contracts/health";
import { env } from "@caretalk/env/server";
import {
  convertToModelMessages,
  generateText,
  isStepCount,
  streamText,
  toUIMessageStream,
  type ToolSet,
  type UIMessage,
  type UIMessageChunk,
} from "ai";

import { HttpError } from "../lib/http-error";
import { buildMemoryTools } from "../lib/memory-tools";
import { buildSystemPrompt } from "../lib/system-prompt";
import { healthRepository } from "../repositories/health-repository";

function requireApiKey(): string {
  const apiKey = env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new HttpError(503, "OPENROUTER_API_KEY not configured", "AI_NOT_CONFIGURED");
  }
  return apiKey;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

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
  getWorkspace(userId: string, workspaceId: string) {
    return healthRepository.getWorkspace(userId, workspaceId);
  },
  getWorkspaceDetail(userId: string, workspaceId: string) {
    return healthRepository.getWorkspaceDetail(userId, workspaceId);
  },

  async exportAccount(userId: string) {
    return {
      exportedAt: new Date().toISOString(),
      workspaces: await healthRepository.exportAccount(userId),
    };
  },

  async createMemory(userId: string, workspaceId: string, input: CreateMemoryInput) {
    await healthRepository.getWorkspace(userId, workspaceId);
    return healthRepository.createMemory(workspaceId, input);
  },
  updateMemory(userId: string, workspaceId: string, memoryId: string, input: UpdateMemoryInput) {
    return healthRepository.updateMemory(userId, workspaceId, memoryId, input);
  },
  deleteMemory(userId: string, workspaceId: string, memoryId: string) {
    return healthRepository.deleteMemory(userId, workspaceId, memoryId);
  },

  async createChatSession(userId: string, workspaceId: string, input: CreateChatSessionInput) {
    await healthRepository.getWorkspace(userId, workspaceId);
    return healthRepository.createChatSession(workspaceId, input);
  },

  async listChatMessages(userId: string, workspaceId: string, sessionId: string) {
    await healthRepository.getWorkspace(userId, workspaceId);
    await healthRepository.getChatSession(workspaceId, sessionId);
    return healthRepository.listChatMessages(sessionId);
  },

  // Returns a UI-message chunk stream, not the raw streamText result: the
  // persistence step below needs the assembled UIMessage (parts, id) that only
  // toUIMessageStream's onFinish produces, so building that pipeline here (not
  // in the route) keeps the "what gets saved to chat_messages" decision in the
  // service layer rather than leaking it into route/transport code.
  async chatStream(
    userId: string,
    workspaceId: string,
    sessionId: string,
    uiMessages: UIMessage[],
  ): Promise<ReadableStream<UIMessageChunk>> {
    const workspace = await healthRepository.getWorkspace(userId, workspaceId);
    await healthRepository.getChatSession(workspaceId, sessionId);
    const apiKey = requireApiKey();

    const activeMemories = await healthRepository.listActiveMemories(workspaceId);
    const system = buildSystemPrompt({ workspace, activeMemories, today: today(), mode: "chat" });

    const openrouter = createOpenRouter({ apiKey });
    const result = streamText({
      model: openrouter.chat(env.AI_MODEL),
      system,
      messages: await convertToModelMessages(uiMessages),
      // Cast to the (portable, re-exported) ToolSet type rather than letting
      // TS infer buildMemoryTools' exact structural return type here: with
      // `composite: true`, an inferred type that embeds AI SDK internals not
      // reachable from a public entrypoint fails the "declaration must be
      // nameable" check (TS2883) — anchored at memory-tools.ts, a file this
      // change may not touch.
      tools: buildMemoryTools(workspaceId) as ToolSet,
      stopWhen: isStepCount(8),
    });

    return toUIMessageStream({
      stream: result.stream,
      originalMessages: uiMessages,
      generateMessageId: () => randomUUID(),
      onFinish: async ({ responseMessage }) => {
        const lastUserMessage = [...uiMessages].reverse().find((message) => message.role === "user");
        const toSave = [
          ...(lastUserMessage
            ? [{ id: lastUserMessage.id, role: "user" as const, parts: lastUserMessage.parts as unknown[] }]
            : []),
          { id: responseMessage.id, role: "assistant" as const, parts: responseMessage.parts as unknown[] },
        ];
        await healthRepository.saveChatMessages(workspaceId, sessionId, toSave);
      },
    });
  },

  async importDocument(userId: string, workspaceId: string, input: ImportInput) {
    const workspace = await healthRepository.getWorkspace(userId, workspaceId);
    const apiKey = requireApiKey();

    // Attached files are ephemeral: the source row records that a file was the
    // origin, but the bytes only exist for the duration of this model call.
    const source = await healthRepository.createSource(workspaceId, {
      type: "import",
      title: input.title,
      content:
        input.content ??
        (input.file ? `[Imported from file: ${input.file.name} — file not retained]` : null),
    });

    const activeMemories = await healthRepository.listActiveMemories(workspaceId);
    const system = buildSystemPrompt({ workspace, activeMemories, today: today(), mode: "import" });

    const userContent: Array<
      | { type: "text"; text: string }
      | { type: "image"; image: string }
      | { type: "file"; data: string; mediaType: string }
    > = [];
    if (input.file) {
      userContent.push(
        input.file.mediaType.startsWith("image/")
          ? { type: "image", image: input.file.dataUrl }
          : { type: "file", data: input.file.dataUrl, mediaType: input.file.mediaType },
      );
    }
    userContent.push({
      type: "text",
      text: [`Title: ${input.title}`, input.content].filter(Boolean).join("\n\n"),
    });

    const openrouter = createOpenRouter({ apiKey });
    const result = await generateText({
      model: openrouter.chat(env.AI_MODEL),
      system,
      messages: [{ role: "user", content: userContent }],
      tools: buildMemoryTools(workspaceId, { sourceId: source.id }) as ToolSet,
      // Bulk backfills can be 50+ facts; models often emit one save per step,
      // so keep generous headroom or long imports truncate silently.
      stopWhen: isStepCount(120),
    });

    const memories = await healthRepository.listMemoriesBySource(source.id);
    const profileUpdated = result.toolCalls.some((call) => call.toolName === "update_profile");

    return { source, memories, profileUpdated };
  },
};
