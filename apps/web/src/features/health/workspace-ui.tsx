import type { FormEvent } from "react";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Button } from "@health-conversation/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@health-conversation/ui/components/card";
import { Input } from "@health-conversation/ui/components/input";
import { Label } from "@health-conversation/ui/components/label";
import type { HealthWorkspace, MemoryProposal, TemporaryChatMessageInput, WorkspaceDetail } from "@health-conversation/contracts/health";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { FileText, MessageSquarePlus, Plus, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { healthApi } from "@/features/health/api";

export const workspaceSections = [
  { to: "/workspaces/$workspaceId", label: "Overview" },
  { to: "/workspaces/$workspaceId/status", label: "Current Status" },
  { to: "/workspaces/$workspaceId/timeline", label: "Timeline" },
  { to: "/workspaces/$workspaceId/medications", label: "Medications" },
  { to: "/workspaces/$workspaceId/symptoms", label: "Symptoms" },
  { to: "/workspaces/$workspaceId/reports", label: "Reports" },
  { to: "/workspaces/$workspaceId/questions", label: "Doctor Questions" },
  { to: "/workspaces/$workspaceId/chat", label: "Chat" },
  { to: "/workspaces/$workspaceId/import", label: "Import" },
] as const;

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

  if (loading) return <PageShell>Loading...</PageShell>;

  return (
    <PageShell>
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Workspaces</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {workspaces.map((workspace) => (
                <Link
                  key={workspace.id}
                  className={"block w-full rounded-md border px-3 py-2 text-left text-sm " + (workspace.id === workspaceId ? "border-blue-500 bg-blue-50 text-blue-950 dark:bg-blue-950 dark:text-blue-50" : "hover:bg-muted")}
                  params={{ workspaceId: workspace.id }}
                  to="/workspaces/$workspaceId"
                >
                  <div className="font-medium">{workspace.name}</div>
                  <div className="line-clamp-2 text-xs text-muted-foreground">{workspace.diagnosis || "No diagnosis/context yet"}</div>
                </Link>
              ))}
              <Link className="inline-flex h-8 w-full shrink-0 items-center justify-center gap-1.5 border border-border px-2.5 text-xs font-medium hover:bg-muted" to="/workspaces/new">
                <Plus className="size-4" />New workspace
              </Link>
            </CardContent>
          </Card>
        </aside>

        <section className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              {userEmail ? <p className="text-sm text-muted-foreground">Signed in as {userEmail}</p> : null}
              <h1 className="text-2xl font-semibold tracking-tight">{detail?.workspace.name ?? "Workspace"}</h1>
            </div>
            {detail ? <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">Curated memory, not raw chat history</span> : null}
          </div>

          {error ? <ErrorMessage message={error} /> : null}

          {detail ? (
            <WorkspaceContext.Provider value={{ detail, refresh }}>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {workspaceSections.map((section) => (
                  <Link
                    key={section.to}
                    activeProps={{ className: "bg-primary text-primary-foreground" }}
                    className="shrink-0 rounded-md border px-3 py-2 text-sm hover:bg-muted"
                    params={{ workspaceId }}
                    to={section.to}
                  >
                    {section.label}
                  </Link>
                ))}
              </div>
              {pathname === "/workspaces/" + workspaceId ? <WorkspaceOverview detail={detail} /> : <Outlet />}
            </WorkspaceContext.Provider>
          ) : (
            <EmptyState>Create or select a workspace to begin.</EmptyState>
          )}
        </section>
      </div>
    </PageShell>
  );
}

export function PageShell({ children }: { children: React.ReactNode }) {
  return <main className="min-h-0 overflow-y-auto bg-background px-4 py-5 lg:px-8"><div className="mx-auto max-w-7xl space-y-4">{children}</div></main>;
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
      await navigate({ to: "/workspaces/$workspaceId/status", params: { workspaceId: workspace.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create workspace");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell>
      <div className="mx-auto max-w-2xl space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Create workspace</h1>
          <p className="text-sm text-muted-foreground">Set up one patient or health case before adding memory.</p>
        </div>
        <Card>
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
    { label: "Recent changes", value: detail.workspace.recentChanges },
    { label: "Upcoming appointments", value: detail.workspace.upcomingAppointments },
    { label: "Open questions", value: detail.workspace.openQuestions },
  ];
  const openQuestions = detail.doctorQuestions.filter((question) => question.status === "open").slice(0, 5);
  const latestTimeline = detail.timeline.slice(0, 5);

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <Card>
        <CardHeader><CardTitle>Overview</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {statusItems.map((item) => (
            <section key={item.label} className="border-b pb-3 last:border-b-0 last:pb-0">
              <h2 className="text-sm font-medium">{item.label}</h2>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{item.value || "Nothing saved yet."}</p>
            </section>
          ))}
        </CardContent>
      </Card>
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Needs attention</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {openQuestions.length === 0 ? <p className="text-sm text-muted-foreground">No open doctor questions.</p> : openQuestions.map((item) => <CompactItem key={item.id} title={item.question} body={item.context ?? ""} />)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Recent timeline</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {latestTimeline.length === 0 ? <p className="text-sm text-muted-foreground">No timeline entries yet.</p> : latestTimeline.map((item) => <CompactItem key={item.id} title={item.title} meta={item.entryDate} body={item.summary} />)}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function StatusPage({ detail, refresh }: WorkspaceRouteContext) {
  const [busy, setBusy] = useState(false);
  return <StatusTab detail={detail} busy={busy} onSave={(input) => runAction({ workspaceId: detail.workspace.id, setBusy, refresh, action: () => healthApi.updateWorkspace(detail.workspace.id, input), success: "Status saved" })} />;
}

export function TimelinePage({ detail, refresh }: WorkspaceRouteContext) {
  const [busy, setBusy] = useState(false);
  return <TimelineTab detail={detail} busy={busy} onAdd={(input) => runAction({ workspaceId: detail.workspace.id, setBusy, refresh, action: () => healthApi.createTimeline(detail.workspace.id, input), success: "Timeline entry added" })} />;
}

export function MedicationPage({ detail, refresh }: WorkspaceRouteContext) {
  const [busy, setBusy] = useState(false);
  return <MedicationTab detail={detail} busy={busy} onAdd={(input) => runAction({ workspaceId: detail.workspace.id, setBusy, refresh, action: () => healthApi.createMedication(detail.workspace.id, input), success: "Medication added" })} />;
}

export function SymptomPage({ detail, refresh }: WorkspaceRouteContext) {
  const [busy, setBusy] = useState(false);
  return <SymptomTab detail={detail} busy={busy} onAdd={(input) => runAction({ workspaceId: detail.workspace.id, setBusy, refresh, action: () => healthApi.createSymptom(detail.workspace.id, input), success: "Symptom added" })} />;
}

export function ReportPage({ detail, refresh }: WorkspaceRouteContext) {
  const [busy, setBusy] = useState(false);
  return <ReportTab detail={detail} busy={busy} onAdd={(input) => runAction({ workspaceId: detail.workspace.id, setBusy, refresh, action: () => healthApi.createReport(detail.workspace.id, input), success: "Report text saved" })} />;
}

export function QuestionPage({ detail, refresh }: WorkspaceRouteContext) {
  const [busy, setBusy] = useState(false);
  return <QuestionTab detail={detail} busy={busy} onAdd={(input) => runAction({ workspaceId: detail.workspace.id, setBusy, refresh, action: () => healthApi.createDoctorQuestion(detail.workspace.id, input), success: "Question added" })} />;
}

export function ChatPage({ detail, refresh }: WorkspaceRouteContext) {
  const navigate = useNavigate();
  return <ChatTab detail={detail} onRefresh={refresh} onProposal={(proposal) => navigate({ to: "/workspaces/$workspaceId/proposals/$proposalId", params: { workspaceId: detail.workspace.id, proposalId: proposal.id } })} />;
}

export function ImportPage({ detail, refresh }: WorkspaceRouteContext) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [importTitle, setImportTitle] = useState("Transcript import");
  const [importText, setImportText] = useState("");

  async function importTranscript(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const next = await healthApi.importTranscript(detail.workspace.id, { title: importTitle, content: importText });
      setImportText("");
      await refresh();
      await navigate({ to: "/workspaces/$workspaceId/proposals/$proposalId", params: { workspaceId: detail.workspace.id, proposalId: next.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not import transcript");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>Import transcript or notes</CardTitle></CardHeader>
      <CardContent>
        <form className="space-y-3" onSubmit={importTranscript}>
          <Field label="Title"><Input value={importTitle} onChange={(event) => setImportTitle(event.target.value)} /></Field>
          <Field label="Transcript / notes"><TextArea value={importText} onChange={(event) => setImportText(event.target.value)} rows={14} required /></Field>
          <Button disabled={busy || !importText.trim()} type="submit"><Sparkles className="mr-2 size-4" />Extract memory proposal</Button>
        </form>
      </CardContent>
    </Card>
  );
}

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

async function runAction({ action, refresh, setBusy, success }: { workspaceId: string; action: () => Promise<unknown>; refresh: () => Promise<void>; setBusy: (value: boolean) => void; success: string }) {
  setBusy(true);
  try {
    await action();
    await refresh();
    toast.success(success);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Action failed");
  } finally {
    setBusy(false);
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={"min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring " + (props.className ?? "")} />;
}

function ErrorMessage({ message }: { message: string }) {
  return <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-100">{message}</div>;
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <Card><CardContent className="py-10 text-center text-muted-foreground">{children}</CardContent></Card>;
}

function CompactItem({ title, meta, body }: { title: string; meta?: string; body: string }) {
  return <div className="rounded-md border p-3"><div className="font-medium">{title}</div>{meta ? <div className="text-xs text-muted-foreground">{meta}</div> : null}{body ? <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">{body}</p> : null}</div>;
}

function StatusTab({ detail, busy, onSave }: { detail: WorkspaceDetail; busy: boolean; onSave: (input: Record<string, string | null>) => void }) {
  const [form, setForm] = useState({
    diagnosis: detail.workspace.diagnosis ?? "",
    currentStatusSummary: detail.workspace.currentStatusSummary ?? "",
    currentMedications: detail.workspace.currentMedications ?? "",
    currentSymptoms: detail.workspace.currentSymptoms ?? "",
    recentChanges: detail.workspace.recentChanges ?? "",
    latestReports: detail.workspace.latestReports ?? "",
    upcomingAppointments: detail.workspace.upcomingAppointments ?? "",
    openQuestions: detail.workspace.openQuestions ?? "",
  });
  return <Card><CardHeader><CardTitle>Current Status</CardTitle></CardHeader><CardContent><form className="grid gap-3 lg:grid-cols-2" onSubmit={(event) => { event.preventDefault(); onSave(form); }}>
    {Object.entries(form).map(([key, value]) => <Field key={key} label={labelize(key)}><TextArea value={value} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} rows={4} /></Field>)}
    <div className="lg:col-span-2"><Button disabled={busy} type="submit"><Save className="mr-2 size-4" />Save current status</Button></div>
  </form></CardContent></Card>;
}

function TimelineTab({ detail, busy, onAdd }: { detail: WorkspaceDetail; busy: boolean; onAdd: (input: { entryDate: string; entryType: "note"; title: string; summary: string }) => void }) {
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  return <TwoColumn title="Timeline" form={<form className="space-y-3" onSubmit={(event) => { event.preventDefault(); onAdd({ entryDate, entryType: "note", title, summary }); setTitle(""); setSummary(""); }}><Field label="Date"><Input value={entryDate} onChange={(event) => setEntryDate(event.target.value)} /></Field><Field label="Title"><Input value={title} onChange={(event) => setTitle(event.target.value)} required /></Field><Field label="Summary"><TextArea value={summary} onChange={(event) => setSummary(event.target.value)} required /></Field><Button disabled={busy} type="submit"><Plus className="mr-2 size-4" />Add timeline entry</Button></form>} items={detail.timeline.map((entry) => ({ title: entry.title, meta: entry.entryDate + " - " + entry.entryType, body: entry.summary }))} />;
}

function MedicationTab({ detail, busy, onAdd }: { detail: WorkspaceDetail; busy: boolean; onAdd: (input: { name: string; dose?: string | null; status: "current" }) => void }) {
  const [name, setName] = useState("");
  const [dose, setDose] = useState("");
  return <TwoColumn title="Medications" form={<form className="space-y-3" onSubmit={(event) => { event.preventDefault(); onAdd({ name, dose: dose || null, status: "current" }); setName(""); setDose(""); }}><Field label="Medicine"><Input value={name} onChange={(event) => setName(event.target.value)} required /></Field><Field label="Dose"><Input value={dose} onChange={(event) => setDose(event.target.value)} /></Field><Button disabled={busy} type="submit"><Plus className="mr-2 size-4" />Add medication</Button></form>} items={detail.medications.map((med) => ({ title: med.name, meta: [med.dose, med.status].filter(Boolean).join(" - "), body: med.notes ?? med.sideEffects ?? "" }))} />;
}

function SymptomTab({ detail, busy, onAdd }: { detail: WorkspaceDetail; busy: boolean; onAdd: (input: { name: string; severity?: string | null; notes?: string | null }) => void }) {
  const [name, setName] = useState("");
  const [severity, setSeverity] = useState("");
  const [notes, setNotes] = useState("");
  return <TwoColumn title="Symptoms" form={<form className="space-y-3" onSubmit={(event) => { event.preventDefault(); onAdd({ name, severity: severity || null, notes: notes || null }); setName(""); setSeverity(""); setNotes(""); }}><Field label="Symptom"><Input value={name} onChange={(event) => setName(event.target.value)} required /></Field><Field label="Severity"><Input value={severity} onChange={(event) => setSeverity(event.target.value)} /></Field><Field label="Notes"><TextArea value={notes} onChange={(event) => setNotes(event.target.value)} /></Field><Button disabled={busy} type="submit"><Plus className="mr-2 size-4" />Add symptom</Button></form>} items={detail.symptoms.map((symptom) => ({ title: symptom.name, meta: symptom.severity ?? "", body: symptom.notes ?? symptom.pattern ?? "" }))} />;
}

function ReportTab({ detail, busy, onAdd }: { detail: WorkspaceDetail; busy: boolean; onAdd: (input: { filename: string; reportType?: string | null; reportDate?: string | null; textContent: string; summary?: string | null }) => void }) {
  const [filename, setFilename] = useState("");
  const [reportType, setReportType] = useState("");
  const [reportDate, setReportDate] = useState("");
  const [textContent, setTextContent] = useState("");
  const [summary, setSummary] = useState("");
  return <TwoColumn title="Reports" form={<form className="space-y-3" onSubmit={(event) => { event.preventDefault(); onAdd({ filename, reportType: reportType || null, reportDate: reportDate || null, textContent, summary: summary || null }); setFilename(""); setReportType(""); setReportDate(""); setTextContent(""); setSummary(""); }}><Field label="Filename"><Input value={filename} onChange={(event) => setFilename(event.target.value)} required /></Field><Field label="Report type"><Input value={reportType} onChange={(event) => setReportType(event.target.value)} /></Field><Field label="Report date"><Input value={reportDate} onChange={(event) => setReportDate(event.target.value)} /></Field><Field label="Summary"><TextArea value={summary} onChange={(event) => setSummary(event.target.value)} /></Field><Field label="Pasted report text"><TextArea value={textContent} onChange={(event) => setTextContent(event.target.value)} required rows={8} /></Field><Button disabled={busy} type="submit"><FileText className="mr-2 size-4" />Save report text</Button></form>} items={detail.reports.map((report) => ({ title: report.filename, meta: [report.reportDate, report.reportType].filter(Boolean).join(" - "), body: report.summary ?? report.textContent.slice(0, 260) }))} />;
}

function QuestionTab({ detail, busy, onAdd }: { detail: WorkspaceDetail; busy: boolean; onAdd: (input: { question: string; context?: string | null; status: "open" }) => void }) {
  const [question, setQuestion] = useState("");
  const [context, setContext] = useState("");
  return <TwoColumn title="Doctor Questions" form={<form className="space-y-3" onSubmit={(event) => { event.preventDefault(); onAdd({ question, context: context || null, status: "open" }); setQuestion(""); setContext(""); }}><Field label="Question"><TextArea value={question} onChange={(event) => setQuestion(event.target.value)} required /></Field><Field label="Context"><TextArea value={context} onChange={(event) => setContext(event.target.value)} /></Field><Button disabled={busy} type="submit"><Plus className="mr-2 size-4" />Add question</Button></form>} items={detail.doctorQuestions.map((item) => ({ title: item.question, meta: item.status, body: item.context ?? item.answer ?? "" }))} />;
}

function ChatTab({ detail, onRefresh, onProposal }: { detail: WorkspaceDetail; onRefresh: () => Promise<void>; onProposal: (proposal: MemoryProposal) => void }) {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<TemporaryChatMessageInput[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMessages([]);
    setMessage("");
  }, [detail.workspace.id]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = message.trim();
    if (!content) return;
    const nextMessages: TemporaryChatMessageInput[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setMessage("");
    setBusy(true);
    try {
      const response = await healthApi.sendTemporaryChatTurn(detail.workspace.id, content, messages);
      setMessages([...nextMessages, response.assistantMessage]);
    } catch (err) {
      setMessages(messages);
      toast.error(err instanceof Error ? err.message : "Could not send message");
    } finally {
      setBusy(false);
    }
  }

  async function propose() {
    if (messages.length === 0) return;
    setBusy(true);
    try {
      const next = await healthApi.proposeFromTemporaryChat(detail.workspace.id, "Temporary chat memory proposal", messages);
      onProposal(next);
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create proposal");
    } finally {
      setBusy(false);
    }
  }

  async function saveChat() {
    if (messages.length === 0) return;
    setBusy(true);
    try {
      await healthApi.saveChat(detail.workspace.id, "Saved workspace chat", messages);
      toast.success("Chat saved");
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save chat");
    } finally {
      setBusy(false);
    }
  }

  return <Card><CardHeader><CardTitle>Workspace Chat</CardTitle></CardHeader><CardContent className="space-y-4"><div className="max-h-[460px] space-y-3 overflow-y-auto rounded-md border p-3">{messages.length === 0 ? <p className="text-sm text-muted-foreground">New temporary chat.</p> : messages.map((item, index) => <div key={index + item.role + item.content.slice(0, 12)} className={"rounded-md px-3 py-2 text-sm " + (item.role === "user" ? "ml-8 bg-blue-50 text-blue-950 dark:bg-blue-950 dark:text-blue-50" : "mr-8 bg-muted")}><div className="mb-1 text-xs font-medium uppercase text-muted-foreground">{item.role}</div><div className="whitespace-pre-wrap">{item.content}</div></div>)}</div><form className="space-y-3" onSubmit={send}><TextArea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Ask about the case, prepare doctor questions, or paste an update..." rows={5} /><div className="flex flex-wrap gap-2"><Button disabled={busy || !message.trim()} type="submit"><MessageSquarePlus className="mr-2 size-4" />Send</Button><Button disabled={busy || messages.length === 0} onClick={propose} type="button" variant="outline"><Sparkles className="mr-2 size-4" />Add to Context</Button><Button disabled={busy || messages.length === 0} onClick={saveChat} type="button" variant="outline"><Save className="mr-2 size-4" />Save Chat</Button><Button disabled={busy || messages.length === 0} onClick={() => setMessages([])} type="button" variant="outline"><Plus className="mr-2 size-4" />New Chat</Button></div></form></CardContent></Card>;
}

function TwoColumn({ title, form, items }: { title: string; form: React.ReactNode; items: Array<{ title: string; meta: string; body: string }> }) {
  return <div className="grid gap-4 lg:grid-cols-[360px_1fr]"><Card><CardHeader><CardTitle>Add {title}</CardTitle></CardHeader><CardContent>{form}</CardContent></Card><Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent className="space-y-3">{items.length === 0 ? <p className="text-sm text-muted-foreground">Nothing saved yet.</p> : items.map((item, index) => <CompactItem key={item.title + index} title={item.title} meta={item.meta} body={item.body} />)}</CardContent></Card></div>;
}

function ProposalReview({ proposal, busy, onChange, onApprove }: { proposal: MemoryProposal; busy: boolean; onChange: (proposal: MemoryProposal) => void; onApprove: (proposal: MemoryProposal) => void }) {
  return <Card><CardHeader><CardTitle>Review memory proposal</CardTitle><p className="text-sm text-muted-foreground">Nothing is permanent until you approve it.</p></CardHeader><CardContent className="space-y-4"><Field label="Title"><Input value={proposal.title} onChange={(event) => onChange({ ...proposal, title: event.target.value })} /></Field><Field label="Summary"><TextArea value={proposal.summary} onChange={(event) => onChange({ ...proposal, summary: event.target.value })} /></Field><div className="grid gap-3 md:grid-cols-2"><Field label="Date"><Input value={proposal.proposedDate ?? ""} onChange={(event) => onChange({ ...proposal, proposedDate: event.target.value || null })} /></Field><Field label="Type"><Input value={proposal.proposalType} onChange={(event) => onChange({ ...proposal, proposalType: event.target.value })} /></Field></div><div className="space-y-2"><h3 className="font-medium">Proposed updates</h3>{proposal.items.map((item) => <label key={item.id} className="block rounded-md border p-3"><div className="flex items-start gap-3"><input checked={item.included} className="mt-1" onChange={(event) => onChange({ ...proposal, items: proposal.items.map((candidate) => candidate.id === item.id ? { ...candidate, included: event.target.checked } : candidate) })} type="checkbox" /><div className="min-w-0"><div className="text-sm font-medium">{item.targetType} - {item.operation}</div><pre className="mt-2 max-h-36 overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify(item.payload, null, 2)}</pre>{item.sourceExcerpt ? <p className="mt-2 text-xs text-muted-foreground">Source: {item.sourceExcerpt}</p> : null}</div></div></label>)}</div>{proposal.missingDetails.length > 0 ? <div><h3 className="font-medium">Missing details</h3><ul className="list-disc pl-5 text-sm text-muted-foreground">{proposal.missingDetails.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}{proposal.doctorQuestions.length > 0 ? <div><h3 className="font-medium">Doctor questions</h3><ul className="list-disc pl-5 text-sm text-muted-foreground">{proposal.doctorQuestions.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}<Button disabled={busy} onClick={() => onApprove(proposal)}><Save className="mr-2 size-4" />Approve and save memory</Button></CardContent></Card>;
}

function toProposalPatch(proposal: MemoryProposal) {
  return { title: proposal.title, summary: proposal.summary, proposalType: proposal.proposalType, proposedDate: proposal.proposedDate, missingDetails: proposal.missingDetails, doctorQuestions: proposal.doctorQuestions, currentStatusPatch: proposal.currentStatusPatch, items: proposal.items.map((item) => ({ id: item.id, included: item.included, payload: item.payload, sourceExcerpt: item.sourceExcerpt, confidence: item.confidence })) };
}

function labelize(value: string) {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
}
