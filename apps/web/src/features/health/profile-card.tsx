import type { Workspace } from "@caretalk/contracts/health";
import { Button } from "@caretalk/ui/components/button";
import { Textarea } from "@caretalk/ui/components/textarea";
import { useState } from "react";
import { toast } from "sonner";

import { healthApi } from "@/features/health/api";

export function ProfileCard({
  workspace,
  onUpdated,
}: {
  workspace: Workspace;
  onUpdated: (workspace: Workspace) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(workspace.profile ?? "");
  const [busy, setBusy] = useState(false);

  function startEditing() {
    setDraft(workspace.profile ?? "");
    setEditing(true);
  }

  async function save() {
    setBusy(true);
    try {
      const next = await healthApi.updateWorkspace(workspace.id, { profile: draft || null });
      onUpdated(next);
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save profile");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Profile
        </h2>
        {!editing ? (
          <button
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            onClick={startEditing}
            type="button"
          >
            Edit
          </button>
        ) : null}
      </div>

      {editing ? (
        <div className="space-y-2">
          <Textarea
            autoFocus
            className="min-h-32 text-sm"
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Diagnosis, current treatment, latest status, next appointment…"
            value={draft}
          />
          <div className="flex justify-end gap-2">
            <Button
              disabled={busy}
              onClick={() => setEditing(false)}
              size="sm"
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void save()} size="sm" type="button">
              Save
            </Button>
          </div>
        </div>
      ) : (
        <button
          className="w-full rounded-lg border border-transparent px-2.5 py-2 text-left text-sm leading-relaxed text-foreground transition-colors hover:border-border hover:bg-[var(--surface-hover)]"
          onClick={startEditing}
          type="button"
        >
          {workspace.profile ? (
            <div className="space-y-1">{renderProfileLines(workspace.profile)}</div>
          ) : (
            <p className="text-muted-foreground">
              No profile yet. Caretalk will draft one as it learns, or click to write it yourself.
            </p>
          )}
        </button>
      )}
    </section>
  );
}

// Line-based renderer for the model-written profile. The prompt constrains the
// profile to headings + bullets + plain lines, so a full markdown parser is
// overkill; anything unrecognized falls through as a plain paragraph.
function renderProfileLines(profile: string) {
  return profile.split("\n").map((line, index) => {
    const trimmed = line.trim();
    if (trimmed === "") return null;
    if (/^#{1,4}\s/.test(trimmed)) {
      return (
        <p key={index} className="pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground first:pt-0">
          {trimmed.replace(/^#{1,4}\s/, "")}
        </p>
      );
    }
    if (/^[-*]\s/.test(trimmed)) {
      return (
        <p key={index} className="pl-3 before:mr-1.5 before:content-['·']">
          {trimmed.replace(/^[-*]\s/, "")}
        </p>
      );
    }
    return <p key={index}>{trimmed}</p>;
  });
}
