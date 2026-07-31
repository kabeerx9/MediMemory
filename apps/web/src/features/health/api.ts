import { env } from "@caretalk/env/web";
import type {
  ChatSession,
  CreateChatSessionInput,
  ExportResponse,
  CreateMemoryInput,
  CreateWorkspaceInput,
  ImportInput,
  ImportResponse,
  Memory,
  UpdateMemoryInput,
  UpdateWorkspaceInput,
  Workspace,
  WorkspaceDetail,
} from "@caretalk/contracts/health";

export const SERVER_URL = env.VITE_SERVER_URL;

type WorkspacesResponse = { workspaces: Workspace[] };
type MessagesResponse = { messages: Array<{ id: string; role: string; parts: unknown[] }> };

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const hasBody = init?.body !== undefined && init.body !== null;
  const response = await fetch(SERVER_URL + path, {
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

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const healthApi = {
  listWorkspaces: () => apiFetch<WorkspacesResponse>("/api/v1/workspaces"),

  exportAccount: () => apiFetch<ExportResponse>("/api/v1/export"),

  exportAccountMarkdown: async (): Promise<string> => {
    const response = await fetch(SERVER_URL + "/api/v1/export?format=markdown", {
      credentials: "include",
    });
    if (!response.ok) throw new Error("Export failed");
    return response.text();
  },

  createWorkspace: (input: CreateWorkspaceInput) =>
    apiFetch<Workspace>("/api/v1/workspaces", { method: "POST", body: JSON.stringify(input) }),

  getWorkspace: (workspaceId: string) =>
    apiFetch<WorkspaceDetail>("/api/v1/workspaces/" + workspaceId),

  updateWorkspace: (workspaceId: string, input: UpdateWorkspaceInput) =>
    apiFetch<Workspace>("/api/v1/workspaces/" + workspaceId, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),

  createMemory: (workspaceId: string, input: CreateMemoryInput) =>
    apiFetch<Memory>("/api/v1/workspaces/" + workspaceId + "/memories", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  updateMemory: (workspaceId: string, memoryId: string, input: UpdateMemoryInput) =>
    apiFetch<Memory>("/api/v1/workspaces/" + workspaceId + "/memories/" + memoryId, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),

  deleteMemory: (workspaceId: string, memoryId: string) =>
    apiFetch<void>("/api/v1/workspaces/" + workspaceId + "/memories/" + memoryId, {
      method: "DELETE",
    }),

  createSession: (workspaceId: string, input?: CreateChatSessionInput) =>
    apiFetch<ChatSession>("/api/v1/workspaces/" + workspaceId + "/sessions", {
      method: "POST",
      body: JSON.stringify(input ?? {}),
    }),

  getSessionMessages: (workspaceId: string, sessionId: string) =>
    apiFetch<MessagesResponse>(
      "/api/v1/workspaces/" + workspaceId + "/sessions/" + sessionId + "/messages",
    ),

  chatUrl: (workspaceId: string, sessionId: string) =>
    SERVER_URL + "/api/v1/workspaces/" + workspaceId + "/sessions/" + sessionId + "/chat",

  importContent: (workspaceId: string, input: ImportInput) =>
    apiFetch<ImportResponse>("/api/v1/workspaces/" + workspaceId + "/import", {
      method: "POST",
      body: JSON.stringify(input),
    }),
};
