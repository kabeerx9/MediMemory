import { randomUUID } from "node:crypto";
import type {
  CreateChatSessionInput,
  CreateMemoryInput,
  CreateWorkspaceInput,
  ImportInput,
  UpdateMemoryInput,
  UpdateWorkspaceInput,
} from "@caretalk/contracts/health";
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

import { importContentHash } from "../lib/import-hash";
import { buildMemoryTools } from "../lib/memory-tools";
import { buildModel } from "../lib/model";
import { buildSystemPrompt } from "../lib/system-prompt";
import { resolveTimeZone, todayIn } from "../lib/time";
import { healthRepository } from "../repositories/health-repository";

// A chat turn can legitimately carry several facts ("bp was 138/86, he skipped
// the evening dose, and the cardiologist moved to the 12th") and models emit
// roughly one save per step. Eight steps truncated those messages silently —
// the earlier facts landed, the last ones vanished with no error anywhere.
const CHAT_MAX_STEPS = 20;
// Bulk backfills can be 50+ facts, so keep generous headroom here or long
// imports stop halfway.
const IMPORT_MAX_STEPS = 120;

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

  listProfileVersions(userId: string, workspaceId: string) {
    return healthRepository.listProfileVersions(userId, workspaceId);
  },
  restoreProfileVersion(userId: string, workspaceId: string, versionId: string) {
    return healthRepository.restoreProfileVersion(userId, workspaceId, versionId);
  },

  async exportAccount(userId: string) {
    return {
      exportedAt: new Date().toISOString(),
      workspaces: await healthRepository.exportAccount(userId),
    };
  },

  async exportWorkspace(userId: string, workspaceId: string) {
    return {
      exportedAt: new Date().toISOString(),
      workspaces: await healthRepository.exportWorkspace(userId, workspaceId),
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
    timeZoneCandidate?: string,
  ): Promise<ReadableStream<UIMessageChunk>> {
    const workspace = await healthRepository.getWorkspace(userId, workspaceId);
    await healthRepository.getChatSession(workspaceId, sessionId);
    const model = buildModel("chat", { sessionId });

    const timeZone = resolveTimeZone(timeZoneCandidate);
    const activeMemories = await healthRepository.listActiveMemories(workspaceId);
    const system = buildSystemPrompt({
      workspace,
      activeMemories,
      today: todayIn(timeZone),
      timeZone,
      mode: "chat",
    });

    // Persist the user's message BEFORE the model runs, not in onFinish.
    // Tool calls commit to Postgres mid-stream, so if the client disconnects or
    // the function times out, the old ordering left facts in the memory rail
    // with no conversation explaining them and no chip to undo from. Writing
    // the prompt up front means the transcript can lose the reply, never the
    // question.
    const lastUserMessage = [...uiMessages].reverse().find((message) => message.role === "user");
    if (lastUserMessage) {
      await healthRepository.saveChatMessages(workspaceId, sessionId, [
        {
          id: lastUserMessage.id,
          role: "user" as const,
          parts: lastUserMessage.parts as unknown[],
        },
      ]);
    }

    const result = streamText({
      model,
      system,
      messages: await convertToModelMessages(uiMessages),
      // Cast to the (portable, re-exported) ToolSet type rather than letting
      // TS infer buildMemoryTools' exact structural return type here: with
      // `composite: true`, an inferred type that embeds AI SDK internals not
      // reachable from a public entrypoint fails the "declaration must be
      // nameable" check (TS2883) — anchored at memory-tools.ts, a file this
      // change may not touch.
      tools: buildMemoryTools(workspaceId) as ToolSet,
      stopWhen: isStepCount(CHAT_MAX_STEPS),
    });

    return toUIMessageStream({
      stream: result.stream,
      originalMessages: uiMessages,
      generateMessageId: () => randomUUID(),
      onFinish: async ({ responseMessage }) => {
        // Swallow-and-log rather than throw: this runs after the response has
        // been streamed to the browser, so throwing here can't surface an error
        // to the user — it only produces an unhandled rejection that hides why
        // a reply went missing on reload.
        try {
          await healthRepository.saveChatMessages(workspaceId, sessionId, [
            {
              id: responseMessage.id,
              role: "assistant" as const,
              parts: responseMessage.parts as unknown[],
            },
          ]);
        } catch (error) {
          console.error("Failed to persist assistant message", {
            workspaceId,
            sessionId,
            messageId: responseMessage.id,
            error,
          });
        }
      },
    });
  },

  async importDocument(userId: string, workspaceId: string, input: ImportInput) {
    const workspace = await healthRepository.getWorkspace(userId, workspaceId);
    const model = buildModel("import");

    // Idempotency check before any model spend. Re-importing a document the
    // model has already read would duplicate every fact in it, and nothing
    // downstream can tell the copies apart — the injected list makes duplicate
    // detection advisory, not enforced.
    const contentHash = importContentHash(input);
    if (!input.force) {
      const existing = await healthRepository.findSourceByHash(workspaceId, contentHash);
      if (existing) {
        return {
          source: existing,
          memories: await healthRepository.listMemoriesBySource(existing.id),
          profileUpdated: false,
          duplicateOf: existing.id,
        };
      }
    }

    // Attached files are ephemeral: the source row records that a file was the
    // origin, but the bytes only exist for the duration of this model call.
    const source = await healthRepository.createSource(workspaceId, {
      type: "import",
      title: input.title,
      content:
        input.content ??
        (input.file ? `[Imported from file: ${input.file.name} — file not retained]` : null),
      // A forced re-import intentionally leaves the hash off: the unique index
      // is on (workspace, hash), so stamping it twice would collide, and the
      // original row stays the one that answers "have I imported this?".
      contentHash: input.force ? null : contentHash,
    });

    const timeZone = resolveTimeZone(input.timeZone);
    const activeMemories = await healthRepository.listActiveMemories(workspaceId);
    const system = buildSystemPrompt({
      workspace,
      activeMemories,
      today: todayIn(timeZone),
      timeZone,
      mode: "import",
    });

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

    const result = await generateText({
      model,
      system,
      messages: [{ role: "user", content: userContent }],
      tools: buildMemoryTools(workspaceId, { sourceId: source.id }) as ToolSet,
      stopWhen: isStepCount(IMPORT_MAX_STEPS),
    });

    const memories = await healthRepository.listMemoriesBySource(source.id);
    const profileUpdated = result.toolCalls.some((call) => call.toolName === "update_profile");

    return { source, memories, profileUpdated, duplicateOf: null };
  },
};
