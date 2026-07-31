import type { ImportFile, ImportResponse } from "@caretalk/contracts/health";
import { importFileMediaTypeSchema } from "@caretalk/contracts/health";
import { Button } from "@caretalk/ui/components/button";
import { Input } from "@caretalk/ui/components/input";
import { Label } from "@caretalk/ui/components/label";
import { Textarea } from "@caretalk/ui/components/textarea";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, FileText, NotebookPen, Paperclip, Sparkles, X } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";
import { toast } from "sonner";

import { healthApi } from "@/features/health/api";
import { formatDate, kindMeta } from "@/features/health/kind-meta";

// Raw-file cap. Base64 inflates ~4/3 and the server (Vercel) rejects request
// bodies over ~4.5MB, so 3MB raw is the safe ceiling.
const MAX_FILE_BYTES = 3 * 1024 * 1024;

export function ImportPage({ workspaceId }: { workspaceId: string }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<ImportFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function pickFile(picked: File | undefined) {
    if (!picked) return;
    const mediaType = importFileMediaTypeSchema.safeParse(picked.type);
    if (!mediaType.success) {
      toast.error("Only PDF, PNG, JPEG, or WebP files are supported.");
      return;
    }
    if (picked.size > MAX_FILE_BYTES) {
      toast.error("File is too large — the limit is 3MB. Try a smaller scan or paste the text.");
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Could not read file"));
      reader.readAsDataURL(picked);
    });
    setFile({ name: picked.name, mediaType: mediaType.data, dataUrl });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if ((!content.trim() && !file) || busy) return;
    setBusy(true);
    try {
      const response = await healthApi.importContent(workspaceId, {
        title: title.trim() || (file ? file.name : "Imported notes"),
        content: content.trim() || undefined,
        file: file ?? undefined,
      });
      setResult(response);
      setContent("");
      setTitle("");
      setFile(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not import");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col gap-6 overflow-y-auto px-4 py-8">
      <div className="space-y-1">
        <Link
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          params={{ workspaceId }}
          to="/workspaces/$workspaceId"
        >
          <ArrowLeft className="size-3.5" />
          Back to workspace
        </Link>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Import notes</h1>
        <p className="text-sm text-muted-foreground">
          Paste a doctor's note or attach a report — a PDF or a photo of it. Caretalk will pull out
          the durable facts and save them the same way it would in conversation. The file itself is
          read once and never stored.
        </p>
      </div>

      <form className="space-y-4" onSubmit={submit}>
        <div className="space-y-1.5">
          <Label htmlFor="import-title">Title</Label>
          <Input
            id="import-title"
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Cardiology visit, March 3"
            value={title}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="import-content">Content</Label>
          <Textarea
            id="import-content"
            className="min-h-56"
            onChange={(event) => setContent(event.target.value)}
            placeholder={
              file ? "Optional — add context about the attached file…" : "Paste the note or transcript here…"
            }
            required={!file}
            value={content}
          />
        </div>
        <div className="space-y-2">
          <input
            ref={fileInputRef}
            accept="application/pdf,image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(event) => {
              void pickFile(event.target.files?.[0]);
              event.target.value = "";
            }}
            type="file"
          />
          {file ? (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card/70 px-3 py-2 text-sm">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-foreground">{file.name}</span>
              <button
                aria-label="Remove file"
                className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                onClick={() => setFile(null)}
                type="button"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ) : (
            <Button
              onClick={() => fileInputRef.current?.click()}
              size="sm"
              type="button"
              variant="outline"
            >
              <Paperclip className="mr-1.5 size-3.5" />
              Attach report (PDF or photo)
            </Button>
          )}
        </div>
        <Button disabled={busy || (!content.trim() && !file)} type="submit">
          <Sparkles className="mr-2 size-4" />
          {busy ? "Saving…" : "Save to memory"}
        </Button>
      </form>

      {result ? (
        <div className="space-y-3 border-t border-border pt-6">
          <h2 className="text-sm font-medium text-foreground">What Caretalk saved</h2>
          {result.profileUpdated ? (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
              <NotebookPen className="size-3.5" />
              Profile updated
            </div>
          ) : null}
          {result.memories.length === 0 ? (
            <p className="text-sm text-muted-foreground">No new facts were found in that text.</p>
          ) : (
            <div className="space-y-2">
              {result.memories.map((memory) => {
                const meta = kindMeta[memory.kind] ?? kindMeta.note;
                const Icon = meta.icon;
                return (
                  <div
                    key={memory.id}
                    className="flex items-start gap-2.5 rounded-lg border border-border bg-card/70 px-3 py-2.5 text-sm"
                  >
                    <span
                      className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md ${meta.badgeClass}`}
                    >
                      <Icon className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="text-[15px] leading-snug text-foreground">{memory.content}</span>{" "}
                      <span className="text-xs text-muted-foreground">
                        {formatDate(memory.happenedOn)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
