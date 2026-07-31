import type { SaveMemoryToolOutput } from "@caretalk/contracts/health";
import { cn } from "@caretalk/ui/lib/utils";
import { NotebookPen, Undo2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { healthApi } from "@/features/health/api";
import { formatDate, kindMeta } from "@/features/health/kind-meta";

const entrance =
  "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-300";

// The signature "I saw it save that" moment: every save_memory tool call in
// the transcript renders as one of these, with a quiet undo affordance. No
// other part of the chat competes visually with this.
export function SaveMemoryChip({
  output,
  workspaceId,
  onUndone,
}: {
  output: SaveMemoryToolOutput;
  workspaceId: string;
  onUndone?: () => void;
}) {
  const [undone, setUndone] = useState(false);
  const [busy, setBusy] = useState(false);
  const meta = kindMeta[output.kind] ?? kindMeta.note;
  const Icon = meta.icon;

  async function undo() {
    if (busy || undone) return;
    setBusy(true);
    try {
      await healthApi.deleteMemory(workspaceId, output.id);
      setUndone(true);
      onUndone?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not undo");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={cn(
        "group/chip flex max-w-full items-start gap-2.5 rounded-lg border border-border bg-card/70 px-3 py-2.5 text-sm",
        entrance,
        undone && "opacity-50",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md",
          meta.badgeClass,
        )}
      >
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className={cn("text-[15px] leading-snug text-foreground", undone && "line-through")}>
            {output.content}
          </span>
          <span className="text-xs text-muted-foreground">{formatDate(output.happenedOn)}</span>
        </div>
        {output.supersededContent ? (
          <p className="truncate text-xs text-muted-foreground">
            Replaces: <span className="italic">{output.supersededContent}</span>
          </p>
        ) : null}
      </div>
      {!undone ? (
        <button
          className="shrink-0 rounded-md px-2 py-1 text-xs text-muted-foreground opacity-0 transition-opacity hover:bg-[var(--surface-hover)] hover:text-foreground disabled:pointer-events-none group-hover/chip:opacity-100 focus-visible:opacity-100"
          disabled={busy}
          onClick={() => void undo()}
          type="button"
        >
          <span className="inline-flex items-center gap-1">
            <Undo2 className="size-3" />
            Undo
          </span>
        </button>
      ) : (
        <span className="shrink-0 text-xs text-muted-foreground">Undone</span>
      )}
    </div>
  );
}

export function UpdateProfileChip() {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground",
        entrance,
      )}
    >
      <NotebookPen className="size-3.5" />
      Profile updated
    </div>
  );
}
