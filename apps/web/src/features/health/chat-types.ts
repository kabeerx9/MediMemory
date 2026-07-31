import type {
  SaveMemoryToolInput,
  SaveMemoryToolOutput,
  UpdateProfileToolInput,
} from "@caretalk/contracts/health";
import type { UIDataTypes, UIMessage } from "ai";

// Typed tool set for the chat UI. The server persists AI SDK UIMessage parts
// verbatim (see ChatMessage.parts in the contract), so this is just the
// client-side view over the same wire shape — declared here so `part.type ===
// "tool-save_memory"` narrows `part.output` to SaveMemoryToolOutput instead
// of `unknown`.
export type CaretalkUITools = {
  save_memory: { input: SaveMemoryToolInput; output: SaveMemoryToolOutput };
  update_profile: { input: UpdateProfileToolInput; output: { profile: string } };
};

export type CaretalkUIMessage = UIMessage<unknown, UIDataTypes, CaretalkUITools>;

// The GET .../messages endpoint returns persisted rows shaped like
// ChatMessage (id, role, parts: unknown[]). Parts are stored verbatim as
// UIMessage parts, so this is a type-level cast, not a runtime transform.
export function toUIMessages(
  rows: Array<{ id: string; role: string; parts: unknown[] }>,
): CaretalkUIMessage[] {
  return rows.map((row) => ({
    id: row.id,
    role: row.role as CaretalkUIMessage["role"],
    parts: row.parts as CaretalkUIMessage["parts"],
  }));
}
