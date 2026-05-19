import type { FormEvent, KeyboardEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@health-conversation/ui/components/button";
import type { MemoryProposal, TemporaryChatMessageInput, WorkspaceDetail } from "@health-conversation/contracts/health";
import { Bot, Loader2, RotateCcw, Save, Send, Sparkles, User } from "lucide-react";
import { toast } from "sonner";

import { healthApi } from "@/features/health/api";

const STARTER_PROMPTS = [
  "Summarize the current memory",
  "What changed recently?",
  "Help me understand the latest saved context",
] as const;

export function WorkspaceChat({
  detail,
  onRefresh,
  onProposal,
}: {
  detail: WorkspaceDetail;
  onRefresh: () => Promise<void>;
  onProposal: (proposal: MemoryProposal) => void;
}) {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<TemporaryChatMessageInput[]>([]);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setMessages([]);
    setDraft("");
  }, [detail.workspace.id]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior, block: "end" });
  }, []);

  useEffect(() => {
    scrollToBottom(messages.length > 0 ? "smooth" : "auto");
  }, [messages, busy, scrollToBottom]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [draft]);

  async function submitMessage(content: string) {
    const trimmed = content.trim();
    if (!trimmed || busy) return;

    const prior = messages;
    const nextMessages: TemporaryChatMessageInput[] = [...prior, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setDraft("");
    setBusy(true);

    try {
      const response = await healthApi.sendTemporaryChatTurn(detail.workspace.id, trimmed, prior);
      setMessages([...nextMessages, response.assistantMessage]);
    } catch (err) {
      setMessages(prior);
      setDraft(trimmed);
      toast.error(err instanceof Error ? err.message : "Could not send message");
    } finally {
      setBusy(false);
      textareaRef.current?.focus();
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitMessage(draft);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitMessage(draft);
    }
  }

  async function propose() {
    if (messages.length === 0) return;
    setBusy(true);
    try {
      const next = await healthApi.proposeFromTemporaryChat(
        detail.workspace.id,
        "Temporary chat memory proposal",
        messages,
      );
      onProposal(next);
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create proposal");
    } finally {
      setBusy(false);
    }
  }

  async function saveChat() {
    if (messages.length === 0) return;
    setBusy(true);
    try {
      await healthApi.saveChat(detail.workspace.id, "Saved workspace chat", messages);
      toast.success("Chat saved");
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save chat");
    } finally {
      setBusy(false);
    }
  }

  function newChat() {
    if (busy) return;
    setMessages([]);
    setDraft("");
    textareaRef.current?.focus();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-background/60 px-4 py-2 backdrop-blur-sm lg:px-6">
        <p className="text-sm text-muted-foreground">
          Ask about the saved memory. Nothing changes unless you choose to save details.
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button disabled={busy} onClick={newChat} size="sm" type="button" variant="ghost">
            <RotateCcw className="size-3.5" />
            New
          </Button>
          <Button disabled={busy || messages.length === 0} onClick={() => void saveChat()} size="sm" type="button" variant="ghost">
            <Save className="size-3.5" />
            Save
          </Button>
          <Button disabled={busy || messages.length === 0} onClick={() => void propose()} size="sm" type="button" variant="secondary">
            <Sparkles className="size-3.5" />
            Save useful details
          </Button>
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto scroll-smooth">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 lg:px-6">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-6 py-12 text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-[var(--sentri-accent-violet-deep)]">
                <Bot className="size-7 text-sentri-lime" />
              </div>
              <div className="space-y-2">
                <h2 className="font-display text-2xl font-semibold tracking-tight">
                  Ask about {detail.workspace.name}
                </h2>
                <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                  Chat uses your curated workspace memory — not raw dumps. Ask for summaries, doctor
                  questions, or help structuring an update.
                </p>
              </div>
              <div className="grid w-full max-w-lg gap-2 sm:grid-cols-1">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    className="rounded-xl border border-border bg-card/80 px-4 py-3 text-left text-sm text-foreground transition-colors hover:border-sentri-lime/40 hover:bg-[var(--surface-hover)] disabled:opacity-50"
                    disabled={busy}
                    onClick={() => void submitMessage(prompt)}
                    type="button"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((item, index) => (
              <ChatMessage key={`${index}-${item.role}-${item.content.slice(0, 24)}`} message={item} />
            ))
          )}

          {busy ? <TypingIndicator /> : null}
          <div ref={bottomRef} className="h-px shrink-0" aria-hidden />
        </div>
      </div>

      <div className="shrink-0 border-t border-border bg-background/90 p-3 backdrop-blur-md lg:p-4">
        <form className="mx-auto w-full max-w-3xl" onSubmit={onSubmit}>
          <div className="flex items-end gap-2 rounded-2xl border border-border bg-card p-2 shadow-card-light ring-1 ring-black/5 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30 dark:ring-white/5">
            <textarea
              ref={textareaRef}
              className="max-h-[200px] min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2.5 text-base leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
              disabled={busy}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Message MediMemory…"
              rows={1}
              value={draft}
            />
            <Button
              className="mb-0.5 mr-0.5 size-10 shrink-0 rounded-xl"
              disabled={busy || !draft.trim()}
              size="icon"
              type="submit"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              <span className="sr-only">Send</span>
            </Button>
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Enter to send · Shift+Enter for new line
          </p>
        </form>
      </div>
    </div>
  );
}

function ChatMessage({ message }: { message: TemporaryChatMessageInput }) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end gap-3">
        <div className="max-w-[min(85%,42rem)] rounded-2xl rounded-br-md bg-[var(--surface-chat-user)] px-4 py-3 text-[15px] leading-relaxed text-foreground ring-1 ring-sentri-lime/25">
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
          <User className="size-4 text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--sentri-accent-violet-deep)]">
        <Bot className="size-4 text-sentri-lime" />
      </div>
      <div className="min-w-0 flex-1 space-y-1 pt-0.5">
        <p className="text-xs font-medium text-muted-foreground">MediMemory</p>
        <div className="text-[15px] leading-relaxed text-foreground">
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--sentri-accent-violet-deep)]">
        <Bot className="size-4 text-sentri-lime" />
      </div>
      <div className="flex items-center gap-1 rounded-2xl border border-border bg-[var(--surface-chat-assistant)] px-4 py-3">
        <span className="size-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms]" />
        <span className="size-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]" />
        <span className="size-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]" />
      </div>
    </div>
  );
}
