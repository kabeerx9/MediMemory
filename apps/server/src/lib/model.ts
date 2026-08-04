import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { env } from "@caretalk/env/server";

import { HttpError } from "./http-error";

// Model construction for the two AI paths.
//
// Prompt caching: the system prompt is rules + profile + the ENTIRE active
// memory list, re-sent on every turn and growing for the life of the workspace.
// It is also byte-identical between turns until a memory changes — the exact
// shape prompt caching exists for. OpenRouter's top-level `cache_control`
// directive turns on Anthropic automatic caching, which discounts the cached
// prefix by ~90%. The 1h TTL covers a normal sitting; a cache miss costs
// nothing but the usual price.
//
// Only Anthropic models honour it, so it is gated on the slug rather than sent
// blindly to every provider.

export type AiPath = "chat" | "import";
export type ReasoningEffort = "xhigh" | "high" | "medium" | "low" | "minimal" | "none";

export function buildChatExtraBody(sessionId: string, reasoningEffort: ReasoningEffort) {
  return {
    session_id: sessionId,
    reasoning: { effort: reasoningEffort },
  };
}

export function modelIdFor(path: AiPath): string {
  const override = path === "chat" ? env.AI_CHAT_MODEL : env.AI_IMPORT_MODEL;
  return override ?? env.AI_MODEL;
}

function requireApiKey(): string {
  const apiKey = env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new HttpError(503, "OPENROUTER_API_KEY not configured", "AI_NOT_CONFIGURED");
  }
  return apiKey;
}

export function supportsPromptCache(modelId: string): boolean {
  return env.AI_PROMPT_CACHE && modelId.startsWith("anthropic/");
}

/** Builds the language model for a path, applying cache + key policy. */
export function buildModel(path: AiPath, options?: { sessionId?: string }) {
  const apiKey = requireApiKey();
  const modelId = modelIdFor(path);
  const openrouter = createOpenRouter({ apiKey });

  const extraBody =
    path === "chat" && options?.sessionId && env.AI_CHAT_REASONING_EFFORT
      ? buildChatExtraBody(options.sessionId, env.AI_CHAT_REASONING_EFFORT)
      : options?.sessionId
        ? { session_id: options.sessionId }
        : undefined;

  return openrouter.chat(
    modelId,
    {
      ...(supportsPromptCache(modelId)
        ? { cache_control: { type: "ephemeral" as const, ttl: "1h" as const } }
        : {}),
      ...(extraBody ? { extraBody } : {}),
      usage: { include: true },
    },
  );
}
