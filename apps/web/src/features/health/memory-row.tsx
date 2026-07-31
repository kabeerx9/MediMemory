import type { Memory, MemoryKind } from "@caretalk/contracts/health";
import { cn } from "@caretalk/ui/lib/utils";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { healthApi } from "@/features/health/api";
import { formatDate, kindMeta, memoryKinds } from "@/features/health/kind-meta";

export function MemoryRow({
  memory,
  workspaceId,
  onChanged,
}: {
  memory: Memory;
  workspaceId: string;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(memory.content);
  const [kind, setKind] = useState<MemoryKind>(memory.kind);
  const [happenedOn, setHappenedOn] = useState(memory.happenedOn ?? "");
  const [busy, setBusy] = useState(false);
  const superseded = Boolean(memory.supersededById);
  const meta = kindMeta[memory.kind] ?? kindMeta.note;
  const Icon = meta.icon;

  async function save() {
    setBusy(true);
    try {
      await healthApi.updateMemory(workspaceId, memory.id, {
        content: content.trim(),
        kind,
        happenedOn: happenedOn || null,
      });
      setEditing(false);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save memory");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await healthApi.deleteMemory(workspaceId, memory.id);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete memory");
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="space-y-2 rounded-lg border border-border bg-card/70 p-3">
        <textarea
          autoFocus
          className="min-h-16 w-full resize-none rounded-md border border-input bg-card px-2.5 py-2 text-sm leading-relaxed text-foreground outline-none focus-visible:border-ring"
          onChange={(event) => setContent(event.target.value)}
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
              onClick={() => setEditing(false)}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
              disabled={busy || !content.trim()}
              onClick={() => void save()}
              type="button"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group/row flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-[var(--surface-hover)]",
        busy && "opacity-50",
      )}
    >
      <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded", meta.badgeClass)}>
        <Icon className="size-3" />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm leading-snug text-foreground", superseded && "line-through opacity-60")}>
          {memory.content}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(memory.happenedOn)}</p>
      </div>
      <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100">
        <button
          className="rounded p-1 text-muted-foreground hover:bg-card hover:text-foreground"
          disabled={busy}
          onClick={() => setEditing(true)}
          type="button"
        >
          <Pencil className="size-3.5" />
          <span className="sr-only">Edit</span>
        </button>
        <button
          className="rounded p-1 text-muted-foreground hover:bg-card hover:text-destructive"
          disabled={busy}
          onClick={() => void remove()}
          type="button"
        >
          <Trash2 className="size-3.5" />
          <span className="sr-only">Delete</span>
        </button>
      </div>
    </div>
  );
}
