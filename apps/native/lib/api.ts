import type {
  ChatSession,
  CreateChatSessionInput,
  CreateMemoryInput,
  CreateWorkspaceInput,
  ExportResponse,
  ImportInput,
  ImportResponse,
  Memory,
  UpdateMemoryInput,
  UpdateWorkspaceInput,
  Workspace,
  WorkspaceDetail,
} from "@caretalk/contracts/health";
import { env } from "@caretalk/env/native";

import { authClient } from "@/lib/auth-client";

export const SERVER_URL = env.EXPO_PUBLIC_SERVER_URL;

// The device's IANA zone, sent with every request that lets the model resolve a
// relative date. The server runs in UTC; without this, a reading logged at 1am
// local gets stamped with the previous calendar day.
export function clientTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

type WorkspacesResponse = { workspaces: Workspace[] };
type MessagesResponse = { messages: Array<{ id: string; role: string; parts: unknown[] }> };

// Unlike the web client, native fetch does not have access to the browser
// cookie jar — better-auth's expo plugin persists the session separately
// (SecureStore) and exposes it as a cookie string via getCookie(). Every
// request must attach it manually.
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const hasBody = init?.body !== undefined && init.body !== null;
  const response = await fetch(SERVER_URL + path, {
    ...init,
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      Cookie: authClient.getCookie(),
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
      headers: { Cookie: authClient.getCookie() },
    });
    if (!response.ok) throw new Error("Export failed");
    return response.text();
  },

  exportWorkspaceMarkdown: async (workspaceId: string): Promise<string> => {
    const response = await fetch(
      SERVER_URL + "/api/v1/workspaces/" + workspaceId + "/export?format=markdown",
      { headers: { Cookie: authClient.getCookie() } },
    );
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
      body: JSON.stringify({ timeZone: clientTimeZone(), ...input }),
    }),
};
