import { useChat } from "@ai-sdk/react";
import { Button } from "@caretalk/ui/components/button";
import { DefaultChatTransport } from "ai";
import { ArrowUp, Loader2, MessageCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { clientTimeZone, healthApi } from "@/features/health/api";
import type { CaretalkUIMessage } from "@/features/health/chat-types";
import { SaveMemoryChip, UpdateProfileChip } from "@/features/health/memory-chip";

const starterPrompts = [
  "Dad's blood pressure this morning was 138/86.",
  "Started 10mg of amlodipine today, once daily.",
  "What should I ask the cardiologist next visit?",
] as const;

export function WorkspaceChat({
  workspaceId,
  sessionId,
  initialMessages,
  onMemoryChange,
}: {
  workspaceId: string;
  sessionId: string;
  initialMessages: CaretalkUIMessage[];
  onMemoryChange: () => void;
}) {
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const seenToolCalls = useRef(new Set<string>());

  const transport = useMemo(
    () =>
      new DefaultChatTransport<CaretalkUIMessage>({
        api: healthApi.chatUrl(workspaceId, sessionId),
        credentials: "include",
        // Rides every turn rather than being captured once at mount: a laptop
        // that travels (or crosses into DST) should date facts by where the
        // user is now, not where the tab was opened.
        body: () => ({ timeZone: clientTimeZone() }),
      }),
    [workspaceId, sessionId],
  );

  const { messages, sendMessage, status, error } = useChat<CaretalkUIMessage>({
    id: sessionId,
    messages: initialMessages,
    transport,
    onError: (err) => toast.error(friendlyChatError(err)),
  });

  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    let didSave = false;
    for (const message of messages) {
      for (const part of message.parts) {
        if (
          (part.type === "tool-save_memory" || part.type === "tool-update_profile") &&
          part.state === "output-available" &&
          !seenToolCalls.current.has(part.toolCallId)
        ) {
          seenToolCalls.current.add(part.toolCallId);
          didSave = true;
        }
      }
    }
    if (didSave) onMemoryChange();
  }, [messages, onMemoryChange]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [draft]);

  function submit() {
    const trimmed = draft.trim();
    if (!trimmed || busy) return;
    setDraft("");
    void sendMessage({ text: trimmed });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center gap-5 py-16 text-center">
              <div className="flex size-11 items-center justify-center rounded-full bg-[var(--sentri-accent-violet-deep)]/10">
                <MessageCircle className="size-5 text-[var(--sentri-accent-violet-deep)]" />
              </div>
              <div className="space-y-1.5">
                <h2 className="font-display text-xl font-semibold tracking-tight">
                  Tell Caretalk what happened
                </h2>
                <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                  It will remember — measurements, medications, symptoms, and questions for the
                  doctor, saved as you talk.
                </p>
              </div>
              <div className="grid w-full gap-2">
                {starterPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    className="rounded-lg border border-border bg-card/60 px-3.5 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:border-[var(--sentri-accent-violet-deep)]/30 hover:text-foreground"
                    onClick={() => void sendMessage({ text: prompt })}
                    type="button"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages
              .filter((message) => message.role !== "system")
              .map((message) => (
                <ChatMessageView key={message.id} message={message} workspaceId={workspaceId} />
              ))
          )}

          {status === "submitted" ? <TypingIndicator /> : null}
          {error ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {friendlyChatError(error)}
            </p>
          ) : null}
          <div ref={bottomRef} className="h-px shrink-0" aria-hidden />
        </div>
      </div>

      <div className="shrink-0 border-t border-border bg-background px-4 py-3">
        <form
          className="mx-auto flex w-full max-w-2xl items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <textarea
            ref={textareaRef}
            className="max-h-[200px] min-h-[44px] flex-1 resize-none rounded-lg border border-input bg-card px-3 py-2.5 text-[15px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            disabled={busy}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            placeholder="Message Caretalk…"
            rows={1}
            value={draft}
          />
          <Button
            className="size-10 shrink-0 rounded-lg"
            disabled={!busy && !draft.trim()}
            size="icon"
            type="submit"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
            <span className="sr-only">Send</span>
          </Button>
        </form>
      </div>
    </div>
  );
}

function ChatMessageView({
  message,
  workspaceId,
}: {
  message: CaretalkUIMessage;
  workspaceId: string;
}) {
  const isUser = message.role === "user";

  return (
    <div className={isUser ? "flex justify-end" : "flex flex-col gap-2"}>
      {message.parts.map((part, index) => {
        if (part.type === "text") {
          if (!part.text) return null;
          return isUser ? (
            <div
              key={index}
              className="max-w-[85%] rounded-2xl rounded-br-md bg-[var(--surface-chat-user)] px-4 py-2.5 text-[15px] leading-relaxed text-foreground"
            >
              <p className="whitespace-pre-wrap">{part.text}</p>
            </div>
          ) : (
            <p key={index} className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
              {part.text}
            </p>
          );
        }

        if (part.type === "tool-save_memory" && part.state === "output-available") {
          return (
            <SaveMemoryChip key={part.toolCallId} output={part.output} workspaceId={workspaceId} />
          );
        }

        if (part.type === "tool-update_profile" && part.state === "output-available") {
          return <UpdateProfileChip key={part.toolCallId} />;
        }

        return null;
      })}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 text-muted-foreground">
      <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:0ms]" />
      <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:150ms]" />
      <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:300ms]" />
    </div>
  );
}

// useChat surfaces failed responses as the raw body text; our API errors are
// JSON envelopes ({error, code}), so unwrap them before showing to the user.
function friendlyChatError(err: Error) {
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
