import type { FormEvent } from "react";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Badge } from "@health-conversation/ui/components/badge";
import { Button } from "@health-conversation/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@health-conversation/ui/components/card";
import { Input } from "@health-conversation/ui/components/input";
import { Label } from "@health-conversation/ui/components/label";
import { Textarea } from "@health-conversation/ui/components/textarea";
import type { HealthWorkspace, MemoryProposal, WorkspaceDetail } from "@health-conversation/contracts/health";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@health-conversation/ui/components/sidebar";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { Plus, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Eyebrow } from "@/components/brand";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { healthApi } from "@/features/health/api";
import { WorkspaceChat } from "@/features/health/workspace-chat";
import { isWorkspaceChatRoute } from "@/features/health/workspace-nav";

export { workspaceSections } from "@/features/health/workspace-nav";

const WorkspaceContext = createContext<WorkspaceRouteContext | null>(null);

export function WorkspaceShell({ workspaceId, userEmail }: { workspaceId: string; userEmail?: string | null }) {
  const [workspaces, setWorkspaces] = useState<HealthWorkspace[]>([]);
  const [detail, setDetail] = useState<WorkspaceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  const refresh = useCallback(async () => {
    const [workspaceResponse, workspaceDetail] = await Promise.all([
      healthApi.listWorkspaces(),
      healthApi.getWorkspace(workspaceId),
    ]);
    setWorkspaces(workspaceResponse.workspaces);
    setDetail(workspaceDetail);
  }, [workspaceId]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    void refresh()
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load workspace"))
      .finally(() => setLoading(false));
  }, [refresh]);

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center starfield text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <SidebarProvider className="flex min-h-0 min-w-0 flex-1">
      <WorkspaceSidebar workspaces={workspaces} workspaceId={workspaceId} />
      <SidebarInset className="starfield flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 flex-wrap items-start gap-3 border-b border-border px-4 py-4 lg:px-8">
          <SidebarTrigger className="mt-0.5" />
          <div className="min-w-0 flex-1 space-y-1">
            {userEmail ? <Eyebrow className="normal-case tracking-normal">{userEmail}</Eyebrow> : null}
            <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              {detail?.workspace.name ?? "Workspace"}
            </h1>
          </div>
          {detail ? <Badge variant="violet">Curated memory · not raw chat</Badge> : null}
        </header>

        {error ? (
          <div className="px-4 py-3 lg:px-8">
            <ErrorMessage message={error} />
          </div>
        ) : null}

        {detail ? (
          <WorkspaceContext.Provider value={{ detail, refresh }}>
            {isWorkspaceChatRoute(pathname, workspaceId) ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <Outlet />
              </div>
            ) : (
              <div className="mx-auto w-full max-w-7xl flex-1 space-y-5 overflow-y-auto px-4 py-6 lg:px-8">
                {pathname === "/workspaces/" + workspaceId ? (
                  <WorkspaceOverview detail={detail} />
                ) : (
                  <Outlet />
                )}
              </div>
            )}
          </WorkspaceContext.Provider>
        ) : (
          <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-8">
            <EmptyState>Create or select a workspace to begin.</EmptyState>
          </div>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}


export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="starfield min-h-0 flex-1 overflow-y-auto px-4 py-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-4">{children}</div>
    </main>
  );
}

export function NewWorkspacePage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceDiagnosis, setWorkspaceDiagnosis] = useState("");
  const [description, setDescription] = useState("");

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const workspace = await healthApi.createWorkspace({
        name: workspaceName,
        diagnosis: workspaceDiagnosis || null,
        description: description || null,
      });
      toast.success("Workspace created");
      await navigate({ to: "/workspaces/$workspaceId/add", params: { workspaceId: workspace.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create workspace");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell>
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="space-y-2">
          <Eyebrow>New workspace</Eyebrow>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Create workspace</h1>
          <p className="text-sm text-muted-foreground">Set up one patient or health case before adding memory.</p>
        </div>
        <Card variant="light">
          <CardContent className="pt-6">
            <form className="space-y-4" onSubmit={createWorkspace}>
              <Field label="Name"><Input value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} required /></Field>
              <Field label="Diagnosis or health context"><TextArea value={workspaceDiagnosis} onChange={(event) => setWorkspaceDiagnosis(event.target.value)} rows={4} /></Field>
              <Field label="Description"><TextArea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} /></Field>
              <Button disabled={busy} type="submit"><Plus className="mr-2 size-4" />Create workspace</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}

export function WorkspaceOverview({ detail }: { detail: WorkspaceDetail }) {
  const statusItems = [
    { label: "Diagnosis", value: detail.workspace.diagnosis },
    { label: "Current status", value: detail.workspace.currentStatusSummary },
    { label: "Current medications", value: detail.workspace.currentMedications },
    { label: "Current symptoms", value: detail.workspace.currentSymptoms },
    { label: "Recent changes", value: detail.workspace.recentChanges },
    { label: "Latest reports", value: detail.workspace.latestReports },
    { label: "Upcoming appointments", value: detail.workspace.upcomingAppointments },
    { label: "Open questions", value: detail.workspace.openQuestions },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <Eyebrow>Memory</Eyebrow>
          <h2 className="font-display text-3xl font-semibold tracking-tight">Saved health memory</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            This is the organized memory built from approved updates. Add messy notes separately and let MediMemory sort them.
          </p>
        </div>
        <Link
          className="inline-flex h-8 items-center justify-center gap-1.5 bg-primary px-2.5 text-xs font-medium text-primary-foreground"
          params={{ workspaceId: detail.workspace.id }}
          to="/workspaces/$workspaceId/add"
        >
          <Sparkles className="size-4" />
          Add to memory
        </Link>
      </div>

      <Card variant="feature">
        <CardHeader><CardTitle>Current picture</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {statusItems.map((item) => (
            <section key={item.label} className="rounded-xl border border-border bg-card/70 p-4">
              <h3 className="text-sm font-medium">{item.label}</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{item.value || "Nothing saved yet."}</p>
            </section>
          ))}
        </CardContent>
      </Card>

      <MemorySection
        empty="No timeline entries yet."
        items={detail.timeline.map((entry) => ({ title: entry.title, meta: entry.entryDate + " · " + entry.entryType, body: entry.summary }))}
        title="Timeline"
      />
      <MemorySection
        empty="No medications saved yet."
        items={detail.medications.map((med) => ({ title: med.name, meta: [med.dose, med.status].filter(Boolean).join(" · "), body: med.notes ?? med.sideEffects ?? "" }))}
        title="Medications"
      />
      <MemorySection
        empty="No symptoms saved yet."
        items={detail.symptoms.map((symptom) => ({ title: symptom.name, meta: symptom.severity ?? "", body: symptom.notes ?? symptom.pattern ?? "" }))}
        title="Symptoms"
      />
      <MemorySection
        empty="No reports saved yet."
        items={detail.reports.map((report) => ({ title: report.filename, meta: [report.reportDate, report.reportType].filter(Boolean).join(" · "), body: report.summary ?? report.textContent.slice(0, 260) }))}
        title="Reports"
      />
      <MemorySection
        empty="No doctor questions saved yet."
        items={detail.doctorQuestions.map((item) => ({ title: item.question, meta: item.status, body: item.context ?? item.answer ?? "" }))}
        title="Doctor questions"
      />
    </div>
  );
}

export function ChatPage({ detail, refresh }: WorkspaceRouteContext) {
  const navigate = useNavigate();
  return (
    <WorkspaceChat
      detail={detail}
      onProposal={(proposal) =>
        navigate({
          to: "/workspaces/$workspaceId/review/$proposalId",
          params: { workspaceId: detail.workspace.id, proposalId: proposal.id },
        })
      }
      onRefresh={refresh}
    />
  );
}

const addMemoryKinds = [
  { id: "quick", label: "Quick update", title: "Quick memory update", placeholder: "Dad had more fatigue today. Appetite was lower. Doctor changed the steroid dose..." },
  { id: "notes", label: "Doctor notes / transcript", title: "Doctor notes", placeholder: "Paste visit notes, WhatsApp updates, call transcripts, or anything you want organized..." },
  { id: "report", label: "Report", title: "Report text", placeholder: "Paste the report text or important findings..." },
] as const;

type AddMemoryKind = (typeof addMemoryKinds)[number]["id"];

export function AddToMemoryPage({ detail, refresh }: WorkspaceRouteContext) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<AddMemoryKind>("quick");
  const selectedKind = addMemoryKinds.find((item) => item.id === kind) ?? addMemoryKinds[0];
  const [title, setTitle] = useState<string>(selectedKind.title);
  const [content, setContent] = useState("");

  function selectKind(nextKind: AddMemoryKind) {
    const next = addMemoryKinds.find((item) => item.id === nextKind) ?? addMemoryKinds[0];
    setKind(next.id);
    setTitle(next.title);
  }

  async function addToMemory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const next = await healthApi.importTranscript(detail.workspace.id, { title, content });
      setContent("");
      await refresh();
      await navigate({ to: "/workspaces/$workspaceId/review/$proposalId", params: { workspaceId: detail.workspace.id, proposalId: next.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create memory review");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="space-y-1">
        <Eyebrow>Add to memory</Eyebrow>
        <h2 className="font-display text-3xl font-semibold tracking-tight">Drop in the messy update</h2>
        <p className="text-sm text-muted-foreground">
          Paste what happened. MediMemory will propose organized changes before anything is saved.
        </p>
      </div>

      <Card variant="feature">
        <CardContent className="pt-6">
          <form className="space-y-5" onSubmit={addToMemory}>
            <div className="grid gap-2 sm:grid-cols-3">
              {addMemoryKinds.map((item) => (
                <button
                  key={item.id}
                  className={
                    "rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors " +
                    (item.id === kind ? "border-sentri-lime bg-sentri-lime/10 text-foreground" : "border-border bg-card/70 text-muted-foreground hover:bg-[var(--surface-hover)]")
                  }
                  onClick={() => selectKind(item.id)}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>

            <Field label="Title"><Input value={title} onChange={(event) => setTitle(event.target.value)} required /></Field>
            <Field label="Update"><TextArea value={content} onChange={(event) => setContent(event.target.value)} placeholder={selectedKind.placeholder} rows={14} required /></Field>
            <Button disabled={busy || !content.trim()} type="submit"><Sparkles className="mr-2 size-4" />Review memory changes</Button>
        </form>
      </CardContent>
    </Card>
    </div>
  );
}

export const ImportPage = AddToMemoryPage;

export function ProposalPage({ workspaceId, proposalId }: { workspaceId: string; proposalId: string }) {
  const navigate = useNavigate();
  const [proposal, setProposal] = useState<MemoryProposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void healthApi.getProposal(proposalId)
      .then(setProposal)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load proposal"));
  }, [proposalId]);

  if (error) return <ErrorMessage message={error} />;
  if (!proposal) return <Card><CardContent className="py-10 text-center text-muted-foreground">Loading proposal...</CardContent></Card>;

  return (
    <ProposalReview
      busy={busy}
      onApprove={async (updated) => {
        setBusy(true);
        try {
          const saved = await healthApi.updateProposal(updated.id, toProposalPatch(updated));
          await healthApi.approveProposal(saved.id);
          toast.success("Memory saved");
          await navigate({ to: "/workspaces/$workspaceId", params: { workspaceId } });
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Could not approve proposal");
        } finally {
          setBusy(false);
        }
      }}
      onChange={setProposal}
      proposal={proposal}
    />
  );
}

export type WorkspaceRouteContext = {
  detail: WorkspaceDetail;
  refresh: () => Promise<void>;
};

export function useWorkspaceRouteContext() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("Workspace route context is unavailable");
  }
  return context;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

function TextArea(props: React.ComponentProps<typeof Textarea>) {
  return <Textarea {...props} />;
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-sentri-pink/40 bg-sentri-pink/10 px-3 py-2 text-sm text-sentri-pink">
      {message}
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <Card><CardContent className="py-10 text-center text-muted-foreground">{children}</CardContent></Card>;
}

function CompactItem({ title, meta, body }: { title: string; meta?: string; body: string }) {
  return <div className="rounded-md border p-3"><div className="font-medium">{title}</div>{meta ? <div className="text-xs text-muted-foreground">{meta}</div> : null}{body ? <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">{body}</p> : null}</div>;
}

function MemorySection({ empty, items, title }: { empty: string; items: Array<{ title: string; meta: string; body: string }>; title: string }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : items.map((item, index) => <CompactItem key={item.title + index} title={item.title} meta={item.meta} body={item.body} />)}
      </CardContent>
    </Card>
  );
}

function ProposalReview({ proposal, busy, onChange, onApprove }: { proposal: MemoryProposal; busy: boolean; onChange: (proposal: MemoryProposal) => void; onApprove: (proposal: MemoryProposal) => void }) {
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="space-y-1">
        <Eyebrow>Review</Eyebrow>
        <h2 className="font-display text-3xl font-semibold tracking-tight">Review memory changes</h2>
        <p className="text-sm text-muted-foreground">Choose what should be saved. Nothing changes until you approve.</p>
      </div>

      <Card variant="feature">
        <CardContent className="space-y-4 pt-6">
          <Field label="Title"><Input value={proposal.title} onChange={(event) => onChange({ ...proposal, title: event.target.value })} /></Field>
          <Field label="Summary"><TextArea value={proposal.summary} onChange={(event) => onChange({ ...proposal, summary: event.target.value })} rows={4} /></Field>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Date"><Input value={proposal.proposedDate ?? ""} onChange={(event) => onChange({ ...proposal, proposedDate: event.target.value || null })} /></Field>
            <Field label="Kind"><Input value={proposal.proposalType} onChange={(event) => onChange({ ...proposal, proposalType: event.target.value })} /></Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Proposed changes</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {proposal.currentStatusPatch ? (
            <div className="rounded-xl border border-border bg-card/70 p-4">
              <div className="mb-3">
                <div className="text-sm font-semibold">Current picture</div>
                <div className="text-xs text-muted-foreground">Update memory summary</div>
              </div>
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                {Object.entries(proposal.currentStatusPatch).map(([key, value]) => (
                  <div key={key} className="rounded-lg bg-muted/50 p-3">
                    <dt className="text-xs font-medium uppercase text-muted-foreground">{labelize(key)}</dt>
                    <dd className="mt-1 whitespace-pre-wrap text-foreground">{formatPayloadValue(value)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
          {proposal.items.length === 0 ? <p className="text-sm text-muted-foreground">No structured changes were found.</p> : null}
          {proposal.items.map((item) => (
            <label key={item.id} className="block rounded-xl border border-border bg-card/70 p-4">
              <div className="flex items-start gap-3">
                <input
                  checked={item.included}
                  className="mt-1"
                  onChange={(event) => onChange({ ...proposal, items: proposal.items.map((candidate) => candidate.id === item.id ? { ...candidate, included: event.target.checked } : candidate) })}
                  type="checkbox"
                />
                <div className="min-w-0 flex-1 space-y-3">
                  <div>
                    <div className="text-sm font-semibold">{targetLabel(item.targetType)}</div>
                    <div className="text-xs text-muted-foreground">{item.operation === "create" ? "Add new memory" : "Update memory"}</div>
                  </div>
                  <dl className="grid gap-2 text-sm sm:grid-cols-2">
                    {Object.entries(item.payload).map(([key, value]) => (
                      <div key={key} className="rounded-lg bg-muted/50 p-3">
                        <dt className="text-xs font-medium uppercase text-muted-foreground">{labelize(key)}</dt>
                        <dd className="mt-1 whitespace-pre-wrap text-foreground">{formatPayloadValue(value)}</dd>
                      </div>
                    ))}
                  </dl>
                  {item.sourceExcerpt ? <p className="rounded-lg border border-border p-3 text-xs text-muted-foreground">Source: {item.sourceExcerpt}</p> : null}
                </div>
              </div>
            </label>
          ))}
        </CardContent>
      </Card>

      {proposal.missingDetails.length > 0 ? (
        <Card>
          <CardHeader><CardTitle>Missing details</CardTitle></CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">{proposal.missingDetails.map((item) => <li key={item}>{item}</li>)}</ul>
          </CardContent>
        </Card>
      ) : null}

      {proposal.doctorQuestions.length > 0 ? (
        <Card>
          <CardHeader><CardTitle>Questions found</CardTitle></CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">{proposal.doctorQuestions.map((item) => <li key={item}>{item}</li>)}</ul>
          </CardContent>
        </Card>
      ) : null}

      <div className="sticky bottom-0 flex justify-end border-t border-border bg-background/90 py-4 backdrop-blur">
        <Button disabled={busy} onClick={() => onApprove(proposal)}><Save className="mr-2 size-4" />Approve and save memory</Button>
      </div>
    </div>
  );
}

function toProposalPatch(proposal: MemoryProposal) {
  return { title: proposal.title, summary: proposal.summary, proposalType: proposal.proposalType, proposedDate: proposal.proposedDate, missingDetails: proposal.missingDetails, doctorQuestions: proposal.doctorQuestions, currentStatusPatch: proposal.currentStatusPatch, items: proposal.items.map((item) => ({ id: item.id, included: item.included, payload: item.payload, sourceExcerpt: item.sourceExcerpt, confidence: item.confidence })) };
}

function labelize(value: string) {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
}

function targetLabel(value: MemoryProposal["items"][number]["targetType"]) {
  const labels: Record<MemoryProposal["items"][number]["targetType"], string> = {
    current_status: "Current picture",
    doctor_question: "Doctor question",
    medication: "Medication",
    report: "Report",
    symptom: "Symptom",
    timeline: "Timeline",
  };
  return labels[value];
}

function formatPayloadValue(value: unknown) {
  if (value == null) return "Not specified";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}
