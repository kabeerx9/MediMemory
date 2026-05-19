import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@health-conversation/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@health-conversation/ui/components/card";
import { Input } from "@health-conversation/ui/components/input";
import { Label } from "@health-conversation/ui/components/label";
import type { MemoryProposal, TemporaryChatMessageInput, WorkspaceDetail, HealthWorkspace } from "@health-conversation/contracts/health";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { FileText, MessageSquarePlus, Plus, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { healthApi } from "@/features/health/api";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/dashboard")({
  component: RouteComponent,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      redirect({ to: "/login", throw: true });
    }
    return { session };
  },
});

type Tab = "status" | "timeline" | "meds" | "symptoms" | "reports" | "questions" | "chat";

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "status", label: "Current Status" },
  { id: "timeline", label: "Timeline" },
  { id: "meds", label: "Medications" },
  { id: "symptoms", label: "Symptoms" },
  { id: "reports", label: "Reports" },
  { id: "questions", label: "Doctor Questions" },
  { id: "chat", label: "Chat" },
];

function RouteComponent() {
  const { session } = Route.useRouteContext();
  const [workspaces, setWorkspaces] = useState<HealthWorkspace[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<WorkspaceDetail | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("status");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<MemoryProposal | null>(null);
  const [workspaceName, setWorkspaceName] = useState("Dad RCC Stage 4");
  const [workspaceDiagnosis, setWorkspaceDiagnosis] = useState("");

  const refreshWorkspaces = useCallback(async () => {
    const response = await healthApi.listWorkspaces();
    setWorkspaces(response.workspaces);
    setSelectedId((current) => current ?? response.workspaces[0]?.id ?? null);
  }, []);

  const refreshDetail = useCallback(async (workspaceId: string) => {
    const next = await healthApi.getWorkspace(workspaceId);
    setDetail(next);
  }, []);

  useEffect(() => {
    void refreshWorkspaces().catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load workspaces")).finally(() => setLoading(false));
  }, [refreshWorkspaces]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    void refreshDetail(selectedId).catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load workspace"));
  }, [refreshDetail, selectedId]);

  async function runAction(action: () => Promise<void>) {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      await refreshWorkspaces();
      await refreshDetail(selectedId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Action failed";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const workspace = await healthApi.createWorkspace({ name: workspaceName, diagnosis: workspaceDiagnosis || null });
      setSelectedId(workspace.id);
      setWorkspaceName("");
      setWorkspaceDiagnosis("");
      await refreshWorkspaces();
      await refreshDetail(workspace.id);
      toast.success("Workspace created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create workspace");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Shell title="MediMemory">Loading...</Shell>;

  return (
    <Shell title="MediMemory">
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Workspaces</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {workspaces.map((workspace) => (
                <button
                  key={workspace.id}
                  className={"w-full rounded-md border px-3 py-2 text-left text-sm " + (workspace.id === selectedId ? "border-blue-500 bg-blue-50 text-blue-950 dark:bg-blue-950 dark:text-blue-50" : "hover:bg-muted")}
                  onClick={() => setSelectedId(workspace.id)}
                  type="button"
                >
                  <div className="font-medium">{workspace.name}</div>
                  <div className="line-clamp-2 text-xs text-muted-foreground">{workspace.diagnosis || "No diagnosis/context yet"}</div>
                </button>
              ))}
              {workspaces.length === 0 ? <p className="text-sm text-muted-foreground">No workspaces yet.</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Create workspace</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={createWorkspace}>
                <Field label="Name"><Input value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} required /></Field>
                <Field label="Health context"><TextArea value={workspaceDiagnosis} onChange={(event) => setWorkspaceDiagnosis(event.target.value)} rows={3} /></Field>
                <Button className="w-full" disabled={busy} type="submit"><Plus className="mr-2 size-4" />Create</Button>
              </form>
            </CardContent>
          </Card>
        </aside>

        <section className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">Signed in as {session.data?.user.email}</p>
              <h1 className="text-2xl font-semibold tracking-tight">{detail?.workspace.name ?? "Select a workspace"}</h1>
            </div>
            {detail ? <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">Curated memory, not raw chat history</span> : null}
          </div>

          {error ? <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-100">{error}</div> : null}

          {detail ? (
            <>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {tabs.map((tab) => (
                  <button key={tab.id} className={"shrink-0 rounded-md border px-3 py-2 text-sm " + (activeTab === tab.id ? "bg-primary text-primary-foreground" : "hover:bg-muted")} onClick={() => setActiveTab(tab.id)} type="button">{tab.label}</button>
                ))}
              </div>

              {activeTab === "status" ? <StatusTab detail={detail} busy={busy} onSave={(input) => runAction(() => healthApi.updateWorkspace(detail.workspace.id, input).then(() => { toast.success("Status saved"); }))} /> : null}
              {activeTab === "timeline" ? <TimelineTab detail={detail} busy={busy} onAdd={(input) => runAction(() => healthApi.createTimeline(detail.workspace.id, input).then(() => { toast.success("Timeline entry added"); }))} /> : null}
              {activeTab === "meds" ? <MedicationTab detail={detail} busy={busy} onAdd={(input) => runAction(() => healthApi.createMedication(detail.workspace.id, input).then(() => { toast.success("Medication added"); }))} /> : null}
              {activeTab === "symptoms" ? <SymptomTab detail={detail} busy={busy} onAdd={(input) => runAction(() => healthApi.createSymptom(detail.workspace.id, input).then(() => { toast.success("Symptom added"); }))} /> : null}
              {activeTab === "reports" ? <ReportTab detail={detail} busy={busy} onAdd={(input) => runAction(() => healthApi.createReport(detail.workspace.id, input).then(() => { toast.success("Report text saved"); }))} /> : null}
              {activeTab === "questions" ? <QuestionTab detail={detail} busy={busy} onAdd={(input) => runAction(() => healthApi.createDoctorQuestion(detail.workspace.id, input).then(() => { toast.success("Question added"); }))} /> : null}
              {activeTab === "chat" ? <ChatTab detail={detail} busy={busy} onRefresh={() => refreshDetail(detail.workspace.id)} onProposal={setProposal} /> : null}
            </>
          ) : (
            <Card><CardContent className="py-10 text-center text-muted-foreground">Create or select a workspace to begin.</CardContent></Card>
          )}
        </section>
      </div>
      {proposal ? <ProposalReview proposal={proposal} busy={busy} onClose={() => setProposal(null)} onApprove={(updated) => runAction(async () => { const saved = await healthApi.updateProposal(updated.id, toProposalPatch(updated)); await healthApi.approveProposal(saved.id); setProposal(null); toast.success("Memory saved"); })} onChange={setProposal} /> : null}
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return <main className="min-h-0 overflow-y-auto bg-background px-4 py-5 lg:px-8"><div className="mx-auto max-w-7xl space-y-4"><h1 className="sr-only">{title}</h1>{children}</div></main>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={"min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring " + (props.className ?? "")} />;
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

function ChatTab({ detail, busy, onRefresh, onProposal }: { detail: WorkspaceDetail; busy: boolean; onRefresh: () => Promise<void>; onProposal: (proposal: MemoryProposal) => void }) {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<TemporaryChatMessageInput[]>([]);
  const [importTitle, setImportTitle] = useState("Transcript import");
  const [importText, setImportText] = useState("");

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
    try {
      const response = await healthApi.sendTemporaryChatTurn(detail.workspace.id, content, messages);
      setMessages([...nextMessages, response.assistantMessage]);
    } catch (err) {
      setMessages(messages);
      toast.error(err instanceof Error ? err.message : "Could not send message");
    }
  }

  async function propose() {
    if (messages.length === 0) return;
    const next = await healthApi.proposeFromTemporaryChat(detail.workspace.id, "Temporary chat memory proposal", messages);
    onProposal(next);
    await onRefresh();
  }

  async function saveChat() {
    if (messages.length === 0) return;
    await healthApi.saveChat(detail.workspace.id, "Saved workspace chat", messages);
    toast.success("Chat saved");
    await onRefresh();
  }

  async function importTranscript(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = await healthApi.importTranscript(detail.workspace.id, { title: importTitle, content: importText });
    setImportText("");
    onProposal(next);
    await onRefresh();
  }

  return <div className="grid gap-4 xl:grid-cols-[1fr_360px]"><Card><CardHeader><CardTitle>Workspace Chat</CardTitle></CardHeader><CardContent className="space-y-4"><div className="max-h-[460px] space-y-3 overflow-y-auto rounded-md border p-3">{messages.length === 0 ? <p className="text-sm text-muted-foreground">New temporary chat.</p> : messages.map((item, index) => <div key={index + item.role + item.content.slice(0, 12)} className={"rounded-md px-3 py-2 text-sm " + (item.role === "user" ? "ml-8 bg-blue-50 text-blue-950 dark:bg-blue-950 dark:text-blue-50" : "mr-8 bg-muted")}><div className="mb-1 text-xs font-medium uppercase text-muted-foreground">{item.role}</div><div className="whitespace-pre-wrap">{item.content}</div></div>)}</div><form className="space-y-3" onSubmit={send}><TextArea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Ask about the case, prepare doctor questions, or paste an update..." rows={5} /><div className="flex flex-wrap gap-2"><Button disabled={busy || !message.trim()} type="submit"><MessageSquarePlus className="mr-2 size-4" />Send</Button><Button disabled={busy || messages.length === 0} onClick={propose} type="button" variant="outline"><Sparkles className="mr-2 size-4" />Add to Context</Button><Button disabled={busy || messages.length === 0} onClick={saveChat} type="button" variant="outline"><Save className="mr-2 size-4" />Save Chat</Button><Button disabled={busy || messages.length === 0} onClick={() => setMessages([])} type="button" variant="outline"><Plus className="mr-2 size-4" />New Chat</Button></div></form></CardContent></Card><Card><CardHeader><CardTitle>Import transcript</CardTitle></CardHeader><CardContent><form className="space-y-3" onSubmit={importTranscript}><Field label="Title"><Input value={importTitle} onChange={(event) => setImportTitle(event.target.value)} /></Field><Field label="Transcript / notes"><TextArea value={importText} onChange={(event) => setImportText(event.target.value)} rows={10} required /></Field><Button disabled={busy || !importText.trim()} type="submit"><Sparkles className="mr-2 size-4" />Extract memory proposal</Button></form></CardContent></Card></div>;
}

function TwoColumn({ title, form, items }: { title: string; form: React.ReactNode; items: Array<{ title: string; meta: string; body: string }> }) {
  return <div className="grid gap-4 lg:grid-cols-[360px_1fr]"><Card><CardHeader><CardTitle>Add {title}</CardTitle></CardHeader><CardContent>{form}</CardContent></Card><Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent className="space-y-3">{items.length === 0 ? <p className="text-sm text-muted-foreground">Nothing saved yet.</p> : items.map((item, index) => <div key={item.title + index} className="rounded-md border p-3"><div className="font-medium">{item.title}</div>{item.meta ? <div className="text-xs text-muted-foreground">{item.meta}</div> : null}{item.body ? <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{item.body}</p> : null}</div>)}</CardContent></Card></div>;
}

function ProposalReview({ proposal, busy, onClose, onChange, onApprove }: { proposal: MemoryProposal; busy: boolean; onClose: () => void; onChange: (proposal: MemoryProposal) => void; onApprove: (proposal: MemoryProposal) => void }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"><div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border bg-background shadow-xl"><div className="sticky top-0 flex items-center justify-between border-b bg-background p-4"><div><h2 className="text-lg font-semibold">Review memory proposal</h2><p className="text-sm text-muted-foreground">Nothing is permanent until you approve it.</p></div><Button variant="outline" onClick={onClose}>Close</Button></div><div className="space-y-4 p-4"><Field label="Title"><Input value={proposal.title} onChange={(event) => onChange({ ...proposal, title: event.target.value })} /></Field><Field label="Summary"><TextArea value={proposal.summary} onChange={(event) => onChange({ ...proposal, summary: event.target.value })} /></Field><div className="grid gap-3 md:grid-cols-2"><Field label="Date"><Input value={proposal.proposedDate ?? ""} onChange={(event) => onChange({ ...proposal, proposedDate: event.target.value || null })} /></Field><Field label="Type"><Input value={proposal.proposalType} onChange={(event) => onChange({ ...proposal, proposalType: event.target.value })} /></Field></div><div className="space-y-2"><h3 className="font-medium">Proposed updates</h3>{proposal.items.map((item) => <label key={item.id} className="block rounded-md border p-3"><div className="flex items-start gap-3"><input checked={item.included} className="mt-1" onChange={(event) => onChange({ ...proposal, items: proposal.items.map((candidate) => candidate.id === item.id ? { ...candidate, included: event.target.checked } : candidate) })} type="checkbox" /><div className="min-w-0"><div className="text-sm font-medium">{item.targetType} - {item.operation}</div><pre className="mt-2 max-h-36 overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify(item.payload, null, 2)}</pre>{item.sourceExcerpt ? <p className="mt-2 text-xs text-muted-foreground">Source: {item.sourceExcerpt}</p> : null}</div></div></label>)}</div>{proposal.missingDetails.length > 0 ? <div><h3 className="font-medium">Missing details</h3><ul className="list-disc pl-5 text-sm text-muted-foreground">{proposal.missingDetails.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}{proposal.doctorQuestions.length > 0 ? <div><h3 className="font-medium">Doctor questions</h3><ul className="list-disc pl-5 text-sm text-muted-foreground">{proposal.doctorQuestions.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}<Button disabled={busy} onClick={() => onApprove(proposal)}><Save className="mr-2 size-4" />Approve and save memory</Button></div></div></div>;
}

function toProposalPatch(proposal: MemoryProposal) {
  return { title: proposal.title, summary: proposal.summary, proposalType: proposal.proposalType, proposedDate: proposal.proposedDate, missingDetails: proposal.missingDetails, doctorQuestions: proposal.doctorQuestions, currentStatusPatch: proposal.currentStatusPatch, items: proposal.items.map((item) => ({ id: item.id, included: item.included, payload: item.payload, sourceExcerpt: item.sourceExcerpt, confidence: item.confidence })) };
}

function labelize(value: string) {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
}
