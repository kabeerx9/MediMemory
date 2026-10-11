import type { UploadLinkInfo } from "@caretalk/contracts/health";
import { Button } from "@caretalk/ui/components/button";
import { Card, CardContent } from "@caretalk/ui/components/card";
import { cn } from "@caretalk/ui/lib/utils";
import { CheckCircle2, Clock3, FileText, ImageIcon, Link2Off, Loader2, UploadCloud, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { healthApi, uploadWithLink } from "@/features/health/api";
import { formatBytes } from "@/lib/format";

import { CaretalkMark, CenteredScreen } from "./connect-visuals";

const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

type Phase =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "ready"; info: UploadLinkInfo }
  | { kind: "uploading"; info: UploadLinkInfo; progress: number }
  | { kind: "done"; info: UploadLinkInfo; fileName: string }
  | { kind: "closed"; info: UploadLinkInfo };

// iOS often reports HEIC with an empty type, so the extension decides there.
function looksAccepted(file: File) {
  if (file.type === "application/pdf" || file.type.startsWith("image/")) return true;
  return /\.(pdf|heic|heif|jpe?g|png|webp)$/i.test(file.name);
}

export function UploadPage({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void healthApi
      .getUploadLink(token)
      .then((info) =>
        setPhase(info.status === "ready" ? { kind: "ready", info } : { kind: "closed", info }),
      )
      .catch(() => setPhase({ kind: "missing" }));
  }, [token]);

  function choose(picked: File | undefined) {
    if (!picked || (phase.kind !== "ready" && phase.kind !== "uploading")) return;
    setError(null);
    if (!looksAccepted(picked)) {
      setError("Choose a PDF or a photo (JPEG, PNG, WebP or HEIC).");
      return;
    }
    if (picked.size > phase.info.maxBytes) {
      setError(`That file is ${formatBytes(picked.size)} — the limit is ${formatBytes(phase.info.maxBytes)}.`);
      return;
    }
    setFile(picked);
  }

  async function upload() {
    if (!file || phase.kind !== "ready") return;
    const { info } = phase;
    setError(null);
    setPhase({ kind: "uploading", info, progress: 0 });
    try {
      const result = await uploadWithLink(token, file, (progress) =>
        setPhase({ kind: "uploading", info, progress }),
      );
      setPhase({ kind: "done", info, fileName: result.fileName });
    } catch (err) {
      setPhase({ kind: "ready", info });
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  }

  return (
    <CenteredScreen>
      <div className="mb-6 flex items-center justify-center gap-2.5">
        <CaretalkMark className="size-9 rounded-lg [&_svg]:size-4" />
        <span className="font-display text-lg font-semibold tracking-tight">Caretalk</span>
      </div>

      <Card variant="light">
        <CardContent className="space-y-6 pt-7">
          {phase.kind === "loading" ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Checking link…
            </div>
          ) : phase.kind === "missing" ? (
            <StatusBlock
              icon={<Link2Off className="size-5" />}
              title="This link doesn't work"
              body="It may have been copied incompletely. Ask the assistant for a new one, or attach the file from Reports in Caretalk."
            />
          ) : phase.kind === "closed" ? (
            phase.info.status === "used" ? (
              <StatusBlock
                icon={<CheckCircle2 className="size-5" />}
                title="Already attached"
                body={`The original for “${phase.info.reportTitle ?? "this report"}” is on file. Nothing else to do.`}
                tone="success"
              />
            ) : (
              <StatusBlock
                icon={<Clock3 className="size-5" />}
                title="This link has expired"
                body="Links work for 30 minutes. Ask the assistant for a new one, or attach the file from Reports in Caretalk."
              />
            )
          ) : phase.kind === "done" ? (
            <StatusBlock
              icon={<CheckCircle2 className="size-5" />}
              title="Original attached"
              body={`${phase.fileName} is saved with “${phase.info.reportTitle ?? "the report"}” in ${phase.info.workspaceName}. You can close this tab.`}
              tone="success"
            />
          ) : (
            <>
              <div className="space-y-1.5">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {phase.info.workspaceName}
                </p>
                <h1 className="font-display text-2xl font-semibold tracking-tight text-balance">
                  Attach the original
                </h1>
                <p className="text-sm text-muted-foreground">
                  for <span className="font-medium text-foreground">{phase.info.reportTitle ?? "this report"}</span>
                </p>
              </div>

              <input
                accept={ACCEPT}
                className="sr-only"
                onChange={(event) => {
                  choose(event.target.files?.[0]);
                  event.target.value = "";
                }}
                ref={inputRef}
                type="file"
              />

              {file ? (
                <div className="flex items-center gap-3 rounded-xl border border-border bg-[var(--surface-subtle)] p-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-card text-muted-foreground">
                    {file.type.startsWith("image/") || /\.hei[cf]$/i.test(file.name) ? (
                      <ImageIcon className="size-5" />
                    ) : (
                      <FileText className="size-5" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                  </div>
                  {phase.kind === "ready" ? (
                    <button
                      aria-label="Remove file"
                      className="rounded-md p-2 text-muted-foreground hover:bg-card hover:text-foreground"
                      onClick={() => setFile(null)}
                      type="button"
                    >
                      <X className="size-4" />
                    </button>
                  ) : null}
                </div>
              ) : (
                <button
                  className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border px-4 py-10 text-center transition-colors hover:border-[var(--sentri-accent-violet-deep)]/40 hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
                  onClick={() => inputRef.current?.click()}
                  type="button"
                >
                  <UploadCloud className="size-7 text-[var(--sentri-accent-violet-deep)] dark:text-sentri-lime" />
                  <span className="text-sm font-medium text-foreground">Choose a PDF or photo</span>
                  <span className="text-xs text-muted-foreground">Up to {formatBytes(phase.info.maxBytes)}</span>
                </button>
              )}

              {phase.kind === "uploading" ? (
                <div className="space-y-1.5" aria-live="polite">
                  <div
                    aria-label="Upload progress"
                    aria-valuemax={100}
                    aria-valuemin={0}
                    aria-valuenow={Math.round(phase.progress * 100)}
                    className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-subtle)]"
                    role="progressbar"
                  >
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-150"
                      style={{ width: `${Math.max(4, phase.progress * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    Uploading… {Math.round(phase.progress * 100)}%
                  </p>
                </div>
              ) : null}

              {error ? (
                <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}

              <Button
                className="w-full"
                disabled={!file || phase.kind === "uploading"}
                onClick={() => void upload()}
                size="lg"
              >
                {phase.kind === "uploading" ? <Loader2 className="animate-spin" /> : null}
                {phase.kind === "uploading" ? "Uploading" : "Attach original"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        This link works once. The file is stored privately with your Caretalk memory.
      </p>
    </CenteredScreen>
  );
}

function StatusBlock({
  icon,
  title,
  body,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  tone?: "neutral" | "success";
}) {
  return (
    <div className="space-y-3 py-4 text-center">
      <span
        className={cn(
          "mx-auto flex size-11 items-center justify-center rounded-full",
          tone === "success"
            ? "bg-[var(--sentri-accent-violet-deep)]/10 text-[var(--sentri-accent-violet-deep)] dark:text-sentri-lime"
            : "bg-[var(--surface-subtle)] text-muted-foreground",
        )}
      >
        {icon}
      </span>
      <h1 className="font-display text-xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm leading-relaxed text-muted-foreground text-pretty">{body}</p>
    </div>
  );
}
