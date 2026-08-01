import type { ProfileVersion, Workspace } from "@caretalk/contracts/health";
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
  const [history, setHistory] = useState<ProfileVersion[] | null>(null);

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
      if (history) void loadHistory();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save profile");
    } finally {
      setBusy(false);
    }
  }

  async function loadHistory() {
    try {
      const response = await healthApi.listProfileVersions(workspace.id);
      setHistory(response.versions);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load profile history");
    }
  }

  async function restore(versionId: string) {
    setBusy(true);
    try {
      const next = await healthApi.restoreProfileVersion(workspace.id, versionId);
      onUpdated(next);
      await loadHistory();
      toast.success("Profile restored");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not restore profile");
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
          <div className="flex items-center gap-3">
            <button
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              onClick={() => (history ? setHistory(null) : void loadHistory())}
              type="button"
            >
              {history ? "Hide history" : "History"}
            </button>
            <button
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              onClick={startEditing}
              type="button"
            >
              Edit
            </button>
          </div>
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

      {history && !editing ? <ProfileHistory busy={busy} onRestore={restore} versions={history} /> : null}
    </section>
  );
}

// Each entry is the profile as it stood BEFORE that change — restoring one
// rolls back to the text the change replaced. Restore is itself versioned, so
// there's no way to strand yourself.
function ProfileHistory({
  versions,
  busy,
  onRestore,
}: {
  versions: ProfileVersion[];
  busy: boolean;
  onRestore: (versionId: string) => void;
}) {
  if (versions.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
        No earlier versions yet — the profile hasn't changed since it was written.
      </p>
    );
  }

  return (
    <ul className="space-y-1.5">
      {versions.map((version) => (
        <li
          key={version.id}
          className="space-y-1 rounded-lg border border-border bg-card/60 px-2.5 py-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {new Date(version.createdAt).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
              {" · replaced by "}
              {changedByLabel[version.changedBy]}
            </span>
            <button
              className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
              disabled={busy}
              onClick={() => onRestore(version.id)}
              type="button"
            >
              Restore
            </button>
          </div>
          <p className="line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-foreground/80">
            {version.profile ?? "(empty)"}
          </p>
        </li>
      ))}
    </ul>
  );
}

const changedByLabel: Record<ProfileVersion["changedBy"], string> = {
  model: "Caretalk",
  user: "you",
  restore: "a restore",
};

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
