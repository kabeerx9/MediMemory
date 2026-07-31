import type { Workspace } from "@caretalk/contracts/health";
import { Button } from "@caretalk/ui/components/button";
import { Input } from "@caretalk/ui/components/input";
import { Label } from "@caretalk/ui/components/label";
import { Textarea } from "@caretalk/ui/components/textarea";
import { useNavigate } from "@tanstack/react-router";
import { Copy, Download, Plus } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

import { healthApi } from "@/features/health/api";

export function WorkspacesListPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    void healthApi
      .listWorkspaces()
      .then((response) => setWorkspaces(response.workspaces))
      .catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Could not load workspaces"));
  }, []);

  async function goToWorkspace(workspace: Workspace) {
    await navigate({ params: { workspaceId: workspace.id }, to: "/workspaces/$workspaceId" });
  }

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-8 overflow-y-auto px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-3xl font-semibold tracking-tight">Workspaces</h1>
          <p className="text-sm text-muted-foreground">
            One workspace per person or health journey you're keeping track of.
          </p>
        </div>
        {workspaces?.length ? <ExportButtons /> : null}
      </div>

      {workspaces === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-6">
          {workspaces.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              No workspaces yet. Create one below to get started.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {workspaces.map((workspace) => (
                <button
                  key={workspace.id}
                  className="flex flex-col gap-1.5 rounded-xl border border-border bg-card/70 p-4 text-left transition-colors hover:border-[var(--sentri-accent-violet-deep)]/30 hover:bg-[var(--surface-hover)]"
                  onClick={() => void goToWorkspace(workspace)}
                  type="button"
                >
                  <span className="font-display text-lg font-semibold tracking-tight text-foreground">
                    {workspace.name}
                  </span>
                  <span className="line-clamp-2 text-sm text-muted-foreground">
                    {workspace.description || "No description yet."}
                  </span>
                  <span className="mt-1 text-xs text-muted-foreground">
                    Updated {new Date(workspace.updatedAt).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {creating ? (
        <CreateWorkspaceForm
          onCancel={() => setCreating(false)}
          onCreated={(workspace) => {
            setWorkspaces((prev) => (prev ? [workspace, ...prev] : [workspace]));
            void goToWorkspace(workspace);
          }}
        />
      ) : (
        <Button className="w-fit gap-2" onClick={() => setCreating(true)} variant="outline">
          <Plus className="size-4" />
          New workspace
        </Button>
      )}
    </div>
  );
}

function ExportButtons() {
  const [busy, setBusy] = useState<"copy" | "download" | null>(null);

  async function copyMarkdown() {
    if (busy) return;
    setBusy("copy");
    try {
      const markdown = await healthApi.exportAccountMarkdown();
      await navigator.clipboard.writeText(markdown);
      toast.success("Copied — paste it into any chat");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(null);
    }
  }

  async function downloadJson() {
    if (busy) return;
    setBusy("download");
    try {
      const data = await healthApi.exportAccount();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `caretalk-export-${data.exportedAt.slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex gap-2">
      <Button disabled={busy !== null} onClick={() => void copyMarkdown()} size="sm" variant="outline">
        <Copy className="size-3.5" />
        Copy for LLM
      </Button>
      <Button disabled={busy !== null} onClick={() => void downloadJson()} size="sm" variant="outline">
        <Download className="size-3.5" />
        Download JSON
      </Button>
    </div>
  );
}

function CreateWorkspaceForm({
  onCreated,
  onCancel,
}: {
  onCreated: (workspace: Workspace) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const workspace = await healthApi.createWorkspace({
        name: name.trim(),
        description: description.trim() || null,
      });
      onCreated(workspace);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create workspace");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4 rounded-xl border border-border bg-card/70 p-4" onSubmit={submit}>
      <div className="space-y-1.5">
        <Label htmlFor="workspace-name">Name</Label>
        <Input
          autoFocus
          id="workspace-name"
          onChange={(event) => setName(event.target.value)}
          placeholder="Dad, Mom's knee, my pregnancy…"
          required
          value={name}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="workspace-description">Description</Label>
        <Textarea
          id="workspace-description"
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Optional — a sentence of context."
          rows={2}
          value={description}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button disabled={busy} onClick={onCancel} type="button" variant="ghost">
          Cancel
        </Button>
        <Button disabled={busy || !name.trim()} type="submit">
          Create workspace
        </Button>
      </div>
    </form>
  );
}
