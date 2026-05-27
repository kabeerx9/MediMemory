import { env } from "@caretalk/env/web";
import type {
  CreateContextImportInput,
  CreateWorkspaceInput,
  MemoryProposal,
  TemporaryChatMessageInput,
  UpdateMemoryProposalInput,
  UpdateWorkspaceInput,
  WorkspaceDetail,
  HealthWorkspace,
} from "@caretalk/contracts/health";

type WorkspacesResponse = { workspaces: HealthWorkspace[] };
type ChatTurnResponse = { assistantMessage: { role: "assistant"; content: string } };

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const hasBody = init?.body !== undefined && init.body !== null;
  const response = await fetch(env.VITE_SERVER_URL + path, {
    ...init,
    credentials: "include",
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(typeof body.error === "string" ? body.error : "Request failed");
  }

  return response.json() as Promise<T>;
}

export const healthApi = {
  listWorkspaces: () => apiFetch<WorkspacesResponse>("/api/v1/workspaces"),
  createWorkspace: (input: CreateWorkspaceInput) => apiFetch<HealthWorkspace>("/api/v1/workspaces", { method: "POST", body: JSON.stringify(input) }),
  getWorkspace: (workspaceId: string) => apiFetch<WorkspaceDetail>("/api/v1/workspaces/" + workspaceId),
  updateWorkspace: (workspaceId: string, input: UpdateWorkspaceInput) => apiFetch<HealthWorkspace>("/api/v1/workspaces/" + workspaceId, { method: "PATCH", body: JSON.stringify(input) }),
  createChatSession: (workspaceId: string, title?: string | null) => apiFetch<{ id: string }>("/api/v1/workspaces/" + workspaceId + "/chat/sessions", { method: "POST", body: JSON.stringify({ title }) }),
  sendTemporaryChatTurn: (workspaceId: string, message: string, messages: TemporaryChatMessageInput[]) => apiFetch<ChatTurnResponse>("/api/v1/workspaces/" + workspaceId + "/chat/respond", { method: "POST", body: JSON.stringify({ message, messages }) }),
  saveChat: (workspaceId: string, title: string | null, messages: TemporaryChatMessageInput[]) => apiFetch<{ id: string }>("/api/v1/workspaces/" + workspaceId + "/chat/save", { method: "POST", body: JSON.stringify({ title, messages }) }),
  proposeFromTemporaryChat: (workspaceId: string, title: string, messages: TemporaryChatMessageInput[]) => apiFetch<MemoryProposal>("/api/v1/workspaces/" + workspaceId + "/chat/propose-memory", { method: "POST", body: JSON.stringify({ title, messages }) }),
  sendChatTurn: (workspaceId: string, sessionId: string, content: string) => apiFetch<ChatTurnResponse>("/api/v1/workspaces/" + workspaceId + "/chat/sessions/" + sessionId + "/respond", { method: "POST", body: JSON.stringify({ role: "user", content }) }),
  proposeFromChat: (workspaceId: string, sessionId: string) => apiFetch<MemoryProposal>("/api/v1/workspaces/" + workspaceId + "/chat/sessions/" + sessionId + "/propose-memory", { method: "POST" }),
  importTranscript: (workspaceId: string, input: CreateContextImportInput) => apiFetch<MemoryProposal>("/api/v1/workspaces/" + workspaceId + "/context-imports", { method: "POST", body: JSON.stringify(input) }),
  getProposal: (proposalId: string) => apiFetch<MemoryProposal>("/api/v1/memory-proposals/" + proposalId),
  updateProposal: (proposalId: string, input: UpdateMemoryProposalInput) => apiFetch<MemoryProposal>("/api/v1/memory-proposals/" + proposalId, { method: "PATCH", body: JSON.stringify(input) }),
  approveProposal: (proposalId: string) => apiFetch<MemoryProposal>("/api/v1/memory-proposals/" + proposalId + "/approve", { method: "POST" }),
};
