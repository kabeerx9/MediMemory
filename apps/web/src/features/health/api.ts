import { env } from "@caretalk/env/web";
import type {
  ChatSession,
  ConnectionsResponse,
  CreateChatSessionInput,
  ExportResponse,
  CreateMemoryInput,
  CreateWorkspaceInput,
  ImportInput,
  ImportResponse,
  Memory,
  ProfileVersionsResponse,
  ReportsResponse,
  SourceFile,
  UploadLinkInfo,
  UpdateMemoryInput,
  UpdateWorkspaceInput,
  WhoopStatus,
  WhoopSyncResult,
  Workspace,
  WorkspaceDetail,
} from "@caretalk/contracts/health";

export const SERVER_URL = env.VITE_SERVER_URL;

// The browser's IANA zone, sent with every request that lets the model resolve
// a relative date. The server runs in UTC, so without this "yesterday" is the
// server's yesterday — off by a day for anyone far enough from Greenwich.
export function clientTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

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

  exportWorkspaceMarkdown: async (workspaceId: string): Promise<string> => {
    const response = await fetch(
      SERVER_URL + "/api/v1/workspaces/" + workspaceId + "/export?format=markdown",
      { credentials: "include" },
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

  listProfileVersions: (workspaceId: string) =>
    apiFetch<ProfileVersionsResponse>("/api/v1/workspaces/" + workspaceId + "/profile-versions"),

  restoreProfileVersion: (workspaceId: string, versionId: string) =>
    apiFetch<Workspace>(
      "/api/v1/workspaces/" + workspaceId + "/profile-versions/" + versionId + "/restore",
      { method: "POST", body: JSON.stringify({}) },
    ),

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

  listReports: (workspaceId: string) =>
    apiFetch<ReportsResponse>("/api/v1/workspaces/" + workspaceId + "/reports"),

  attachFile: (workspaceId: string, sourceId: string, file: File) =>
    apiFetch<SourceFile>("/api/v1/workspaces/" + workspaceId + "/reports/" + sourceId + "/files", {
      method: "POST",
      body: file,
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "X-File-Name": encodeURIComponent(file.name),
      },
    }),

  fileUrl: (workspaceId: string, fileId: string, options?: { download?: boolean }) =>
    SERVER_URL +
    "/api/v1/workspaces/" +
    workspaceId +
    "/files/" +
    fileId +
    (options?.download ? "?download=1" : ""),

  getConnections: () => apiFetch<ConnectionsResponse>("/api/v1/connections"),

  disconnect: (clientId: string) =>
    apiFetch<{ ok: true }>("/api/v1/connections/" + encodeURIComponent(clientId), { method: "DELETE" }),

  getDailyMetrics: (workspaceId: string, from: string, to: string) =>
    apiFetch<{ from: string; to: string; days: Array<{ date: string; source: string } & Record<string, number | boolean | string>> }>(
      "/api/v1/daily-metrics?" + new URLSearchParams({ workspaceId, from, to }).toString(),
    ),

  getWorkouts: (workspaceId: string, from: string, to: string) =>
    apiFetch<{ workouts: Array<{ local_date: string; day_number: number | null; note: string | null; status: string; details: string | null }> }>(
      "/api/v1/workouts?" + new URLSearchParams({ workspaceId, from, to }).toString(),
    ),

  listApiTokens: () =>
    apiFetch<{ tokens: Array<{ id: string; name: string; workspaceId: string; createdAt: string; lastUsedAt: string | null }> }>(
      "/api/v1/api-tokens",
    ),

  createApiToken: (workspaceId: string, name: string) =>
    apiFetch<{ id: string; token: string }>("/api/v1/api-tokens", { method: "POST", body: JSON.stringify({ workspaceId, name }) }),

  revokeApiToken: (id: string) => apiFetch<{ ok: true }>("/api/v1/api-tokens/" + encodeURIComponent(id), { method: "DELETE" }),

  getWhoop: (workspaceId: string) =>
    apiFetch<WhoopStatus>("/api/v1/whoop?workspaceId=" + encodeURIComponent(workspaceId)),

  syncWhoop: (workspaceId: string) =>
    apiFetch<WhoopSyncResult>("/api/v1/whoop/sync", { method: "POST", body: JSON.stringify({ workspaceId }) }),

  disconnectWhoop: (workspaceId: string) =>
    apiFetch<{ ok: true }>("/api/v1/whoop?workspaceId=" + encodeURIComponent(workspaceId), { method: "DELETE" }),

  // A full-page navigation, not a fetch: the server redirects on to WHOOP's consent page.
  whoopConnectUrl: (workspaceId: string) => SERVER_URL + "/api/whoop/connect?workspaceId=" + encodeURIComponent(workspaceId),

  getUploadLink: (token: string) => apiFetch<UploadLinkInfo>("/api/v1/uploads/" + encodeURIComponent(token)),
};

/**
 * Upload with progress through a one-time link. XHR rather than fetch: fetch
 * still has no upload progress, and on a phone with a 15 MB scan the bar is
 * the difference between "working" and "frozen".
 */
export function uploadWithLink(token: string, file: File, onProgress: (fraction: number) => void) {
  return new Promise<{ fileName: string; sizeBytes: number }>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", SERVER_URL + "/api/v1/uploads/" + encodeURIComponent(token));
    request.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    request.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onload = () => {
      let body: { error?: string; fileName?: string; sizeBytes?: number } = {};
      try {
        body = JSON.parse(request.responseText);
      } catch {
        // Non-JSON error page (e.g. a proxy's 413); fall through to the status.
      }
      if (request.status >= 200 && request.status < 300) {
        resolve({ fileName: body.fileName ?? file.name, sizeBytes: body.sizeBytes ?? file.size });
      } else {
        reject(new Error(body.error ?? (request.status === 413 ? "That file is too large." : "Upload failed")));
      }
    };
    request.onerror = () => reject(new Error("Network error — check your connection and try again."));
    request.send(file);
  });
}
