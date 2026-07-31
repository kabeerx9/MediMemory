import type {
  SaveMemoryToolInput,
  SaveMemoryToolOutput,
  UpdateProfileToolInput,
} from "@caretalk/contracts/health";
import type { UIDataTypes, UIMessage } from "ai";

// Mirrors apps/web/src/features/health/chat-types.ts — the server persists
// AI SDK UIMessage parts verbatim, so both clients share the same wire shape.
export type CaretalkUITools = {
  save_memory: { input: SaveMemoryToolInput; output: SaveMemoryToolOutput };
  update_profile: { input: UpdateProfileToolInput; output: { profile: string } };
};

export type CaretalkUIMessage = UIMessage<unknown, UIDataTypes, CaretalkUITools>;

export function toUIMessages(
  rows: Array<{ id: string; role: string; parts: unknown[] }>,
): CaretalkUIMessage[] {
  return rows.map((row) => ({
    id: row.id,
    role: row.role as CaretalkUIMessage["role"],
    parts: row.parts as CaretalkUIMessage["parts"],
  }));
}

// useChat surfaces failed responses as the raw body text; our API errors are
// JSON envelopes ({error, code}), so unwrap them before showing to the user.
export function friendlyChatError(err: Error): string {
  try {
    const parsed = JSON.parse(err.message) as { error?: string; code?: string };
    if (parsed.code === "AI_NOT_CONFIGURED") {
      return "Chat needs an API key — add OPENROUTER_API_KEY to apps/server/.env and restart the server.";
    }
    if (parsed.error) return parsed.error;
  } catch {
    // not JSON — fall through
  }
  return err.message || "Something went wrong.";
}
