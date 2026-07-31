import type { Memory, MemoryKind, Workspace } from "@caretalk/contracts/health";
import { Button } from "@caretalk/ui/components/button";
import { Separator } from "@caretalk/ui/components/separator";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { healthApi } from "@/features/health/api";
import { kindMeta, memoryKinds } from "@/features/health/kind-meta";
import { MemoryRow } from "@/features/health/memory-row";
import { ProfileCard } from "@/features/health/profile-card";

type MemoryGroup = { date: string | null; items: Memory[] };

function groupMemories(memories: Memory[], showHistory: boolean): MemoryGroup[] {
  const visible = memories.filter((memory) => showHistory || !memory.supersededById);
  const map = new Map<string | null, Memory[]>();
  for (const memory of visible) {
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
  const [showHistory, setShowHistory] = useState(false);
  const supersededCount = useMemo(
    () => memories.filter((memory) => memory.supersededById).length,
    [memories],
  );
  const groups = useMemo(() => groupMemories(memories, showHistory), [memories, showHistory]);

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto px-4 py-5">
      <AddMemoryForm workspaceId={workspace.id} onCreated={onMemoriesChanged} />

      <ProfileCard onUpdated={onWorkspaceUpdated} workspace={workspace} />

      <Separator />

      <section className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Memory
          </h2>
          <div className="flex items-center gap-3">
            <CopyWorkspaceButton workspaceId={workspace.id} />
            {supersededCount > 0 ? (
              <button
                className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                onClick={() => setShowHistory((value) => !value)}
                type="button"
              >
                {showHistory ? "Hide history" : "Show history"}
              </button>
            ) : null}
          </div>
        </div>

        {groups.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            Nothing saved yet. Say what happened in the chat and Caretalk will remember it here.
          </p>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <div key={group.date ?? "undated"} className="space-y-1">
                <p className="px-2 text-xs font-medium text-muted-foreground">
                  {group.date ? formatGroupDate(group.date) : "Undated"}
                </p>
                <div className="space-y-0.5">
                  {group.items.map((memory) => (
                    <MemoryRow
                      key={memory.id}
                      memory={memory}
                      onChanged={onMemoriesChanged}
                      workspaceId={workspace.id}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
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
    <button
      className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
      disabled={busy}
      onClick={() => void copy()}
      type="button"
    >
      Copy for LLM
    </button>
  );
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
