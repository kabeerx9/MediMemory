import type { Report, ReportsResponse, SourceFile } from "@caretalk/contracts/health";
import { Button } from "@caretalk/ui/components/button";
import { cn } from "@caretalk/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Download,
  ExternalLink,
  FileText,
  FileWarning,
  ImageIcon,
  Loader2,
  Paperclip,
  Sparkles,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { healthApi } from "@/features/health/api";
import { formatBytes } from "@/lib/format";

const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

function formatWhen(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** Where a document came from, in the words the user would use. */
function originLabel(report: Report) {
  if (report.type === "import") return "Imported in Caretalk";
  return report.clientName ? `Shared with ${report.clientName}` : "Shared with an AI app";
}

export function ReportsPage({ workspaceId }: { workspaceId: string }) {
  const [data, setData] = useState<ReportsResponse | null>(null);

  const load = useCallback(
    () =>
      healthApi
        .listReports(workspaceId)
        .then(setData)
        .catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Could not load reports")),
    [workspaceId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const missing = data?.reports.filter((report) => report.files.length === 0).length ?? 0;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8">
        <header className="space-y-3">
          <Link
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            params={{ workspaceId }}
            to="/workspaces/$workspaceId"
          >
            <ArrowLeft className="size-3.5" />
            Back to workspace
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-1">
              <h1 className="font-display text-2xl font-semibold tracking-tight">Reports &amp; documents</h1>
              <p className="max-w-xl text-sm text-muted-foreground text-pretty">
                Every report you've imported here or shared with Claude or ChatGPT, with the facts saved from it and
                the original file.
              </p>
            </div>
            <Link params={{ workspaceId }} to="/workspaces/$workspaceId/import">
              <Button size="sm" variant="outline">
                <Upload className="size-3.5" />
                Import a report
              </Button>
            </Link>
          </div>
        </header>

        {data && !data.fileStorageEnabled ? (
          <p className="rounded-lg border border-border bg-[var(--surface-subtle)] px-3 py-2.5 text-sm text-muted-foreground">
            Original files aren't stored on this deployment yet, so only the saved facts are listed. They'll be kept
            once Caretalk runs on a server with file storage.
          </p>
        ) : null}

        {data === null ? (
          <div className="space-y-3">
            {[0, 1, 2].map((key) => (
              <div className="h-24 animate-pulse rounded-xl bg-[var(--surface-subtle)]" key={key} />
            ))}
          </div>
        ) : data.reports.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
            <FileText className="mx-auto size-6 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium text-foreground">No reports yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Import a lab report or scan here, or share one with Claude or ChatGPT — it'll show up with its facts
              and original.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {missing > 0 && data.fileStorageEnabled ? (
              <p className="text-xs text-muted-foreground">
                {missing} {missing === 1 ? "report is" : "reports are"} missing the original file.
              </p>
            ) : null}
            <ul className="space-y-3">
              {data.reports.map((report) => (
                <ReportCard
                  key={report.id}
                  onChanged={() => void load()}
                  report={report}
                  storageEnabled={data.fileStorageEnabled}
                  workspaceId={workspaceId}
                />
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function ReportCard({
  report,
  workspaceId,
  storageEnabled,
  onChanged,
}: {
  report: Report;
  workspaceId: string;
  storageEnabled: boolean;
  onChanged: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasFile = report.files.length > 0;

  async function attach(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      await healthApi.attachFile(workspaceId, report.id, file);
      toast.success("Original attached");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <li className="rounded-xl border border-border bg-card/70 p-4">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg",
            report.type === "import"
              ? "bg-[var(--surface-subtle)] text-muted-foreground"
              : "bg-[var(--sentri-accent-violet-deep)]/10 text-[var(--sentri-accent-violet-deep)] dark:text-sentri-lime",
          )}
        >
          {report.type === "import" ? <FileText className="size-4" /> : <Sparkles className="size-4" />}
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-sm font-medium leading-snug text-foreground">{report.title ?? "Untitled report"}</p>
          <p className="text-xs text-muted-foreground">
            {originLabel(report)} · {formatWhen(report.createdAt)} ·{" "}
            {report.memoryCount === 0 ? "no facts saved" : `${report.memoryCount} ${report.memoryCount === 1 ? "fact" : "facts"}`}
          </p>
        </div>
      </div>

      {hasFile ? (
        <ul className="mt-3 space-y-1.5">
          {report.files.map((file) => (
            <FileRow file={file} key={file.id} workspaceId={workspaceId} />
          ))}
        </ul>
      ) : storageEnabled ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 px-3 py-2">
          <span className="flex items-center gap-2 text-xs text-amber-900 dark:text-amber-200">
            <FileWarning className="size-3.5" />
            Original not attached
          </span>
          <input
            accept={ACCEPT}
            className="sr-only"
            onChange={(event) => {
              void attach(event.target.files?.[0]);
              event.target.value = "";
            }}
            ref={inputRef}
            type="file"
          />
          <Button disabled={uploading} onClick={() => inputRef.current?.click()} size="sm" variant="outline">
            {uploading ? <Loader2 className="animate-spin" /> : <Paperclip className="size-3.5" />}
            Attach original
          </Button>
        </div>
      ) : null}
    </li>
  );
}

function FileRow({ file, workspaceId }: { file: SourceFile; workspaceId: string }) {
  const isImage = file.mediaType.startsWith("image/");
  return (
    <li className="flex items-center gap-2.5 rounded-lg bg-[var(--surface-subtle)] px-3 py-2">
      {isImage ? (
        <ImageIcon className="size-4 shrink-0 text-muted-foreground" />
      ) : (
        <FileText className="size-4 shrink-0 text-muted-foreground" />
      )}
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{file.fileName}</span>
      <span className="hidden text-xs text-muted-foreground tabular-nums sm:inline">{formatBytes(file.sizeBytes)}</span>
      <a
        aria-label={`Open ${file.fileName}`}
        className="rounded-md p-1.5 text-muted-foreground hover:bg-card hover:text-foreground"
        href={healthApi.fileUrl(workspaceId, file.id)}
        rel="noreferrer"
        target="_blank"
      >
        <ExternalLink className="size-3.5" />
      </a>
      <a
        aria-label={`Download ${file.fileName}`}
        className="rounded-md p-1.5 text-muted-foreground hover:bg-card hover:text-foreground"
        href={healthApi.fileUrl(workspaceId, file.id, { download: true })}
      >
        <Download className="size-3.5" />
      </a>
    </li>
  );
}
