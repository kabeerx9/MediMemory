import type { Memory, MemoryKind, Workspace } from "@caretalk/contracts/health";
import { Button } from "@caretalk/ui/components/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
} from "@caretalk/ui/components/sidebar";
import { ChartNoAxesColumnIncreasing, Clock3, Database, FileText, Plus, UserRound } from "lucide-react";
import { type CSSProperties, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { healthApi } from "@/features/health/api";
import { kindMeta, memoryKinds } from "@/features/health/kind-meta";
import { MemoryRow } from "@/features/health/memory-row";
import { ProfileCard } from "@/features/health/profile-card";
import { TrendsSection } from "@/features/health/trends";

export type MemoryGroup = { date: string | null; items: Memory[] };
export type MemoryKindGroup = { kind: MemoryKind; items: Memory[] };
type ContextSection = "overview" | "timeline" | "trends" | "memories";

const contextSections: Array<{
  id: ContextSection;
  label: string;
  description: string;
  icon: typeof UserRound;
}> = [
  { id: "overview", label: "Overview", description: "Current patient briefing", icon: UserRound },
  { id: "timeline", label: "Timeline", description: "History organized by date", icon: Clock3 },
  { id: "trends", label: "Trends", description: "Measurements over time", icon: ChartNoAxesColumnIncreasing },
  { id: "memories", label: "Memories", description: "All saved health facts", icon: Database },
];

function visibleMemories(memories: Memory[], showHistory: boolean) {
  return memories.filter((memory) => showHistory || !memory.supersededById);
}

export function groupMemoriesByDate(memories: Memory[], showHistory: boolean): MemoryGroup[] {
  const map = new Map<string | null, Memory[]>();
  for (const memory of visibleMemories(memories, showHistory)) {
    const key = memory.happenedOn;
    const list = map.get(key);
    if (list) {
      list.push(memory);
    } else {
      map.set(key, [memory]);
    }
  }
  const dated = Array.from(map.entries()).filter(
    (entry): entry is [string, Memory[]] => entry[0] !== null,
  );
  dated.sort((a, b) => b[0].localeCompare(a[0]));
  const groups: MemoryGroup[] = dated.map(([date, items]) => ({ date, items }));
  const undated = map.get(null);
  if (undated?.length) groups.push({ date: null, items: undated });
  return groups;
}

export function groupMemoriesByKind(memories: Memory[], showHistory: boolean): MemoryKindGroup[] {
  const visible = visibleMemories(memories, showHistory);
  return memoryKinds.flatMap((kind) => {
    const items = visible
      .filter((memory) => memory.kind === kind)
      .sort((a, b) => (b.happenedOn ?? "").localeCompare(a.happenedOn ?? ""));
    return items.length > 0 ? [{ kind, items }] : [];
  });
}

export function MemoryRail({
  workspace,
  memories,
  onWorkspaceUpdated,
  onMemoriesChanged,
}: {
  workspace: Workspace;
  memories: Memory[];
  onWorkspaceUpdated: (workspace: Workspace) => void;
  onMemoriesChanged: () => void;
}) {
  const [section, setSection] = useState<ContextSection>("overview");
  const [showHistory, setShowHistory] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const supersededCount = useMemo(
    () => memories.filter((memory) => memory.supersededById).length,
    [memories],
  );
  const activeCount = memories.length - supersededCount;
  const dateGroups = useMemo(
    () => groupMemoriesByDate(memories, showHistory),
    [memories, showHistory],
  );
  const kindGroups = useMemo(
    () => groupMemoriesByKind(memories, showHistory),
    [memories, showHistory],
  );
  const selectedSection = contextSections.find((item) => item.id === section) ?? contextSections[0];

  return (
    <SidebarProvider
      className="h-full min-h-0 w-full overflow-hidden"
      style={{ "--sidebar-width": "100%" } as CSSProperties}
    >
      <Sidebar
        aria-label="Patient context"
        className="min-h-0 w-full border-0"
        collapsible="none"
        side="right"
      >
        <SidebarHeader className="gap-3 px-4 pb-3 pt-4">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <UserRound className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Patient context
              </p>
              <p className="truncate font-display text-base font-semibold text-foreground">
                {workspace.name}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Updated {formatUpdatedAt(workspace.updatedAt)}
              </p>
            </div>
          </div>

          <nav aria-label="Patient context">
            <SidebarMenu className="grid grid-cols-2 gap-1">
              {contextSections.map((item) => {
                const Icon = item.icon;
                const count = item.id === "timeline" || item.id === "memories" ? activeCount : null;
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      aria-pressed={section === item.id}
                      className="h-9 rounded-md px-2.5 text-xs"
                      isActive={section === item.id}
                      onClick={() => {
                        contentRef.current?.scrollTo({ top: 0 });
                        setSection(item.id);
                      }}
                      tooltip={item.description}
                      type="button"
                    >
                      <Icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                    {count !== null ? <SidebarMenuBadge>{count}</SidebarMenuBadge> : null}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </nav>
        </SidebarHeader>

        <SidebarSeparator />

        <SidebarContent ref={contentRef} className="overflow-y-auto overscroll-contain">
          <SidebarGroup className="p-4">
            <SidebarGroupLabel className="h-auto px-0 pb-3 text-[10px] font-semibold uppercase tracking-[0.16em]">
              {selectedSection.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              {section === "overview" ? (
                <section data-context-panel="overview">
                  <ProfileCard onUpdated={onWorkspaceUpdated} workspace={workspace} />
                </section>
              ) : null}
              {section === "timeline" ? (
                <MemoryTimeline
                  groups={dateGroups}
                  onChanged={onMemoriesChanged}
                  onToggleHistory={() => setShowHistory((value) => !value)}
                  showHistory={showHistory}
                  supersededCount={supersededCount}
                  workspaceId={workspace.id}
                />
              ) : null}
              {section === "trends" ? (
                <section data-context-panel="trends">
                  <TrendsSection memories={memories} />
                </section>
              ) : null}
              {section === "memories" ? (
                <MemoryLibrary
                  groups={kindGroups}
                  onChanged={onMemoriesChanged}
                  onToggleHistory={() => setShowHistory((value) => !value)}
                  showHistory={showHistory}
                  supersededCount={supersededCount}
                  workspaceId={workspace.id}
                />
              ) : null}
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarSeparator />

        <SidebarFooter className="gap-1.5 p-3">
          <AddMemoryForm workspaceId={workspace.id} onCreated={onMemoriesChanged} />
          <CopyWorkspaceButton workspaceId={workspace.id} />
        </SidebarFooter>
      </Sidebar>
    </SidebarProvider>
  );
}

function MemoryTimeline({
  groups,
  workspaceId,
  onChanged,
  showHistory,
  supersededCount,
  onToggleHistory,
}: {
  groups: MemoryGroup[];
  workspaceId: string;
  onChanged: () => void;
  showHistory: boolean;
  supersededCount: number;
  onToggleHistory: () => void;
}) {
  return (
    <section className="space-y-3" data-context-panel="timeline">
      <HistoryToggle
        onToggle={onToggleHistory}
        showHistory={showHistory}
        supersededCount={supersededCount}
      />
      {groups.length === 0 ? (
        <MemoryEmptyState />
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <div key={group.date ?? "undated"} className="relative space-y-1 border-l border-border pl-3">
              <span className="absolute -left-1 top-1.5 size-2 rounded-full bg-primary ring-4 ring-sidebar" />
              <p className="px-2 text-xs font-medium text-muted-foreground">
                {group.date ? formatGroupDate(group.date) : "Undated"}
              </p>
              <MemoryRows items={group.items} onChanged={onChanged} workspaceId={workspaceId} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function MemoryLibrary({
  groups,
  workspaceId,
  onChanged,
  showHistory,
  supersededCount,
  onToggleHistory,
}: {
  groups: MemoryKindGroup[];
  workspaceId: string;
  onChanged: () => void;
  showHistory: boolean;
  supersededCount: number;
  onToggleHistory: () => void;
}) {
  return (
    <section className="space-y-3" data-context-panel="memories">
      <HistoryToggle
        onToggle={onToggleHistory}
        showHistory={showHistory}
        supersededCount={supersededCount}
      />
      {groups.length === 0 ? (
        <MemoryEmptyState />
      ) : (
        <div className="space-y-5">
          {groups.map((group) => {
            const meta = kindMeta[group.kind];
            const Icon = meta.icon;
            return (
              <div key={group.kind} className="space-y-1">
                <div className="flex items-center gap-2 px-2 text-xs font-medium text-muted-foreground">
                  <Icon className="size-3.5" />
                  <span>{meta.label}</span>
                  <span className="ml-auto tabular-nums">{group.items.length}</span>
                </div>
                <MemoryRows items={group.items} onChanged={onChanged} workspaceId={workspaceId} />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function MemoryRows({
  items,
  workspaceId,
  onChanged,
}: {
  items: Memory[];
  workspaceId: string;
  onChanged: () => void;
}) {
  return (
    <div className="space-y-0.5">
      {items.map((memory) => (
        <MemoryRow
          key={memory.id}
          memory={memory}
          onChanged={onChanged}
          workspaceId={workspaceId}
        />
      ))}
    </div>
  );
}

function HistoryToggle({
  supersededCount,
  showHistory,
  onToggle,
}: {
  supersededCount: number;
  showHistory: boolean;
  onToggle: () => void;
}) {
  if (supersededCount === 0) return null;
  return (
    <div className="flex items-center justify-between rounded-md bg-sidebar-accent/60 px-2.5 py-2 text-xs text-muted-foreground">
      <span>{supersededCount} earlier {supersededCount === 1 ? "version" : "versions"}</span>
      <button className="font-medium text-foreground hover:underline" onClick={onToggle} type="button">
        {showHistory ? "Hide" : "Show"}
      </button>
    </div>
  );
}

function MemoryEmptyState() {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-border px-4 py-8 text-center">
      <FileText className="mb-2 size-5 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">No health facts saved yet</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        Add an update below or mention it in chat and Caretalk will remember it here.
      </p>
    </div>
  );
}

// Copies just this workspace's active memories — scoped so the paste target
// (an external chat) gets one person's history, not the whole account.
function CopyWorkspaceButton({ workspaceId }: { workspaceId: string }) {
  const [busy, setBusy] = useState(false);

  async function copy() {
    if (busy) return;
    setBusy(true);
    try {
      const markdown = await healthApi.exportWorkspaceMarkdown(workspaceId);
      await navigator.clipboard.writeText(markdown);
      toast.success("Copied — paste it into any chat");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      className="w-full justify-start"
      disabled={busy}
      onClick={() => void copy()}
      size="sm"
      type="button"
      variant="ghost"
    >
      Copy for LLM
    </Button>
  );
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "recently";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

function formatGroupDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function AddMemoryForm({
  workspaceId,
  onCreated,
}: {
  workspaceId: string;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [kind, setKind] = useState<MemoryKind>("note");
  const [happenedOn, setHappenedOn] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!content.trim() || busy) return;
    setBusy(true);
    try {
      await healthApi.createMemory(workspaceId, {
        content: content.trim(),
        kind,
        happenedOn: happenedOn || null,
      });
      setContent("");
      setHappenedOn("");
      setKind("note");
      setOpen(false);
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add memory");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button className="w-full justify-start gap-2" onClick={() => setOpen(true)} size="sm" variant="outline">
        <Plus className="size-3.5" />
        Add memory
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card/70 p-3">
      <textarea
        autoFocus
        className="min-h-16 w-full resize-none rounded-md border border-input bg-card px-2.5 py-2 text-sm leading-relaxed text-foreground outline-none focus-visible:border-ring"
        onChange={(event) => setContent(event.target.value)}
        placeholder="What happened?"
        value={content}
      />
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="rounded-md border border-input bg-card px-2 py-1 text-xs text-foreground outline-none"
          onChange={(event) => setKind(event.target.value as MemoryKind)}
          value={kind}
        >
          {memoryKinds.map((option) => (
            <option key={option} value={option}>
              {kindMeta[option].label}
            </option>
          ))}
        </select>
        <input
          className="rounded-md border border-input bg-card px-2 py-1 text-xs text-foreground outline-none"
          onChange={(event) => setHappenedOn(event.target.value)}
          type="date"
          value={happenedOn}
        />
        <div className="ml-auto flex gap-1.5">
          <button
            className="rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:bg-[var(--surface-hover)]"
            disabled={busy}
            onClick={() => setOpen(false)}
            type="button"
          >
            Cancel
          </button>
          <button
            className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
            disabled={busy || !content.trim()}
            onClick={() => void submit()}
            type="button"
          >
            Save memory
          </button>
        </div>
      </div>
    </div>
  );
}
