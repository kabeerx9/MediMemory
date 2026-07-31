import { Button } from "@caretalk/ui/components/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@caretalk/ui/components/sheet";
import type { ChatSession, Memory, Workspace } from "@caretalk/contracts/health";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, PanelRight, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { healthApi } from "@/features/health/api";
import { toUIMessages, type CaretalkUIMessage } from "@/features/health/chat-types";
import { MemoryRail } from "@/features/health/memory-rail";
import { SessionPicker } from "@/features/health/session-picker";
import { WorkspaceChat } from "@/features/health/workspace-chat";

export function WorkspaceShell({
  workspaceId,
  sessionParam,
  onSessionChange,
}: {
  workspaceId: string;
  sessionParam?: string;
  onSessionChange: (sessionId: string) => void;
}) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [railOpen, setRailOpen] = useState(false);

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<CaretalkUIMessage[] | null>(null);
  const settingUpSession = useRef(false);

  const refreshWorkspace = useCallback(async () => {
    const detail = await healthApi.getWorkspace(workspaceId);
    setWorkspace(detail.workspace);
    setMemories(detail.memories);
    setSessions(detail.chatSessions);
    return detail;
  }, [workspaceId]);

  // Initial load.
  useEffect(() => {
    setLoading(true);
    setError(null);
    setActiveSessionId(null);
    setInitialMessages(null);
    void refreshWorkspace()
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load workspace"))
      .finally(() => setLoading(false));
  }, [refreshWorkspace]);

  // Resolve which session is active: the search param if valid, else the
  // first existing session, else default-create one.
  useEffect(() => {
    if (loading || !workspace || settingUpSession.current) return;

    const validParam = sessionParam && sessions.some((session) => session.id === sessionParam);
    if (validParam && sessionParam !== activeSessionId) {
      setActiveSessionId(sessionParam);
      return;
    }
    if (validParam) return;

    if (sessions.length > 0) {
      const first = sessions[0];
      if (first) onSessionChange(first.id);
      return;
    }

    if (activeSessionId) return;

    settingUpSession.current = true;
    void healthApi
      .createSession(workspaceId)
      .then((session) => {
        setSessions((prev) => [session, ...prev]);
        onSessionChange(session.id);
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : "Could not start a chat");
      })
      .finally(() => {
        settingUpSession.current = false;
      });
  }, [loading, workspace, sessions, sessionParam, activeSessionId, workspaceId, onSessionChange]);

  // Load the message history for whichever session is now active.
  useEffect(() => {
    if (!activeSessionId) return;
    let cancelled = false;
    setInitialMessages(null);
    void healthApi
      .getSessionMessages(workspaceId, activeSessionId)
      .then((response) => {
        if (!cancelled) setInitialMessages(toUIMessages(response.messages));
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Could not load chat history");
          setInitialMessages([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, activeSessionId]);

  async function createSession() {
    try {
      const session = await healthApi.createSession(workspaceId);
      setSessions((prev) => [session, ...prev]);
      onSessionChange(session.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start a chat");
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
        Loading workspace…
      </div>
    );
  }

  if (error || !workspace) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-4">
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error ?? "Workspace not found."}
        </p>
      </div>
    );
  }

  const rail = (
    <MemoryRail
      memories={memories}
      onMemoriesChanged={() => void refreshWorkspace()}
      onWorkspaceUpdated={setWorkspace}
      workspace={workspace}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2.5 lg:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-[var(--surface-hover)] hover:text-foreground"
            to="/workspaces"
          >
            <ArrowLeft className="size-4" />
            <span className="sr-only">All workspaces</span>
          </Link>
          <h1 className="truncate font-display text-lg font-semibold tracking-tight">
            {workspace.name}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {activeSessionId ? (
            <SessionPicker
              currentSessionId={activeSessionId}
              onCreate={() => void createSession()}
              onSelect={onSessionChange}
              sessions={sessions}
            />
          ) : null}
          <Link params={{ workspaceId }} to="/workspaces/$workspaceId/import">
            <Button size="sm" variant="ghost">
              <Upload className="size-3.5" />
              Import
            </Button>
          </Link>
          <Button
            className="lg:hidden"
            onClick={() => setRailOpen(true)}
            size="icon-sm"
            variant="ghost"
          >
            <PanelRight className="size-4" />
            <span className="sr-only">Profile and memory</span>
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 flex-1 flex-col">
          {activeSessionId && initialMessages ? (
            <WorkspaceChat
              initialMessages={initialMessages}
              key={activeSessionId}
              onMemoryChange={() => void refreshWorkspace()}
              sessionId={activeSessionId}
              workspaceId={workspaceId}
            />
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
              Loading chat…
            </div>
          )}
        </div>

        <aside className="hidden w-[360px] shrink-0 border-l border-border lg:block">{rail}</aside>
      </div>

      <Sheet onOpenChange={setRailOpen} open={railOpen}>
        <SheetContent className="w-full p-0 sm:max-w-sm" side="right">
          <SheetHeader className="border-b border-border">
            <SheetTitle>Profile and memory</SheetTitle>
          </SheetHeader>
          {rail}
        </SheetContent>
      </Sheet>
    </div>
  );
}
