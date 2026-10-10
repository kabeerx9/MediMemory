import { createHash, randomBytes, randomUUID } from "node:crypto";

import { mcpResourceUrl } from "@caretalk/auth";
import { db } from "@caretalk/db";
import { user } from "@caretalk/db/schema/auth";
import { memories, sources } from "@caretalk/db/schema/health";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../app";

// The whole external-app path, through the real Fastify app and real
// Postgres: dynamic client registration → authorize → consent → token
// exchange (PKCE) → MCP tool calls as that user. This is the flow Claude and
// ChatGPT run when the user adds the connector; the unit of trust is "a token
// minted here only ever reaches its own user's workspaces".
//
//   RUN_DB_TESTS=1 pnpm -F server test
const enabled = process.env.RUN_DB_TESTS === "1";
const describeDb = enabled ? describe : describe.skip;

const app = buildApp();
const REDIRECT_URI = "https://claude.ai/api/mcp/auth_callback";
const runId = randomUUID().slice(0, 8);

type Session = { userId: string; cookie: string };

function cookieHeader(setCookie: string | string[] | undefined): string {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return list.map((cookie) => cookie.split(";")[0]).join("; ");
}

async function signUp(label: string): Promise<Session> {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/sign-up/email",
    headers: { "content-type": "application/json", origin: "http://localhost:3001" },
    payload: { email: `mcp-${label}-${runId}@example.test`, password: "correct-horse-battery", name: label },
  });
  expect(response.statusCode, response.body).toBe(200);
  return { userId: response.json().user.id, cookie: cookieHeader(response.headers["set-cookie"]) };
}

async function registerClient(name: string) {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/oauth2/register",
    headers: { "content-type": "application/json" },
    payload: {
      client_name: name,
      redirect_uris: [REDIRECT_URI],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
  });
  expect(response.statusCode, response.body).toBeLessThan(300);
  return response.json().client_id as string;
}

/** Runs authorize → consent → token for one user, the way an MCP client does. */
async function authorize(session: Session, clientId: string) {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomUUID();

  const authorizeResponse = await app.inject({
    method: "GET",
    url: "/api/auth/oauth2/authorize",
    query: {
      response_type: "code",
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      scope: "openid offline_access",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      resource: mcpResourceUrl,
    },
    headers: { cookie: session.cookie },
  });
  expect(authorizeResponse.statusCode, authorizeResponse.body).toBe(302);
  const consentUrl = new URL(String(authorizeResponse.headers.location));
  expect(consentUrl.pathname).toBe("/oauth/consent");

  const consentResponse = await app.inject({
    method: "POST",
    url: "/api/auth/oauth2/consent",
    headers: { cookie: session.cookie, "content-type": "application/json" },
    payload: { accept: true, oauth_query: consentUrl.search.slice(1) },
  });
  expect(consentResponse.statusCode, consentResponse.body).toBe(200);
  const redirect = new URL(consentResponse.json().url ?? consentResponse.json().redirect_uri);
  expect(redirect.searchParams.get("state")).toBe(state);
  const code = redirect.searchParams.get("code");
  expect(code).toBeTruthy();

  const tokenResponse = await app.inject({
    method: "POST",
    url: "/api/auth/oauth2/token",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    payload: new URLSearchParams({
      grant_type: "authorization_code",
      code: code ?? "",
      redirect_uri: REDIRECT_URI,
      client_id: clientId,
      code_verifier: verifier,
      resource: mcpResourceUrl,
    }).toString(),
  });
  expect(tokenResponse.statusCode, tokenResponse.body).toBe(200);
  return tokenResponse.json() as { access_token: string; refresh_token?: string; token_type: string };
}

let rpcId = 0;
async function mcp(token: string | null, method: string, params: Record<string, unknown> = {}) {
  const response = await app.inject({
    method: "POST",
    url: "/api/mcp",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-06-18",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    payload: { jsonrpc: "2.0", id: ++rpcId, method, params },
  });
  // Stateless 2025-era responses may come back as a one-event SSE stream.
  const body = response.body.startsWith("event:") || response.body.startsWith("data:")
    ? response.body.split("\n").find((line) => line.startsWith("data:"))?.slice(5).trim() ?? "{}"
    : response.body;
  return { status: response.statusCode, headers: response.headers, body: body ? JSON.parse(body) : null };
}

async function callTool(token: string, name: string, args: Record<string, unknown>) {
  const { status, body } = await mcp(token, "tools/call", { name, arguments: args });
  expect(status, JSON.stringify(body)).toBe(200);
  const result = body.result as { isError?: boolean; content: Array<{ text: string }>; structuredContent?: any };
  return result;
}

describeDb("MCP over OAuth, end to end", () => {
  let owner: Session;
  let stranger: Session;
  let ownerToken: string;
  let strangerToken: string;
  let workspaceId: string;

  beforeAll(async () => {
    await app.ready();
    owner = await signUp("owner");
    stranger = await signUp("stranger");
    const clientId = await registerClient("Claude");
    ownerToken = (await authorize(owner, clientId)).access_token;
    strangerToken = (await authorize(stranger, clientId)).access_token;

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/workspaces",
      headers: { cookie: owner.cookie, "content-type": "application/json" },
      payload: { name: "Dad — RCC" },
    });
    workspaceId = created.json().id;
  });

  afterAll(async () => {
    // Cascades take workspaces, memories, sources, and OAuth rows with them.
    await db.delete(user).where(inArray(user.id, [owner.userId, stranger.userId]));
    await app.close();
  });

  it("challenges an anonymous request with the resource metadata URL", async () => {
    const { status, headers } = await mcp(null, "tools/list");
    expect(status).toBe(401);
    expect(String(headers["www-authenticate"])).toContain("/.well-known/oauth-protected-resource");
  });

  it("rejects a tampered token", async () => {
    const tampered = `${ownerToken.slice(0, -4)}AAAA`;
    expect((await mcp(tampered, "tools/list")).status).toBe(401);
  });

  it("issues a JWT bound to the MCP resource and the user", async () => {
    const payload = JSON.parse(Buffer.from(ownerToken.split(".")[1] ?? "", "base64url").toString());
    expect(payload.sub).toBe(owner.userId);
    expect([payload.aud].flat()).toContain(mcpResourceUrl);
  });

  it("lists the tools", async () => {
    const { status, body } = await mcp(ownerToken, "tools/list");
    expect(status).toBe(200);
    const names = (body.result.tools as Array<{ name: string }>).map((tool) => tool.name).sort();
    expect(names).toEqual([
      "create_workspace",
      "get_workspace_context",
      "list_workspaces",
      "register_report",
      "save_memory",
      "search_memories",
      "update_profile",
    ]);
  });

  it("only shows the caller's own workspaces", async () => {
    const mine = await callTool(ownerToken, "list_workspaces", {});
    expect(mine.structuredContent.workspaces.map((w: { id: string }) => w.id)).toEqual([workspaceId]);
    const theirs = await callTool(strangerToken, "list_workspaces", {});
    expect(theirs.structuredContent.workspaces).toEqual([]);
  });

  it("refuses to read or write another user's workspace", async () => {
    const read = await callTool(strangerToken, "get_workspace_context", { workspaceId });
    expect(read.isError).toBe(true);

    const write = await callTool(strangerToken, "save_memory", {
      workspaceId,
      content: "Injected fact",
      kind: "note",
      happenedOn: null,
      supersedesId: null,
      metric: null,
      value: null,
      valueSecondary: null,
      unit: null,
    });
    expect(write.isError).toBe(true);
    const rows = await db.select().from(memories).where(eq(memories.workspaceId, workspaceId));
    expect(rows.map((row) => row.content)).not.toContain("Injected fact");
  });

  it("saves a fact attributed to the connected app, visible in context", async () => {
    const saved = await callTool(ownerToken, "save_memory", {
      workspaceId,
      content: "Creatinine 1.4 mg/dL",
      kind: "measurement",
      happenedOn: "2026-10-08",
      supersedesId: null,
      metric: "Creatinine",
      value: 1.4,
      valueSecondary: null,
      unit: "mg/dL",
    });
    expect(saved.isError).toBeFalsy();
    expect(saved.structuredContent.saved.metric).toBe("creatinine");

    const [row] = await db.select().from(memories).where(eq(memories.id, saved.structuredContent.saved.id));
    const [source] = await db.select().from(sources).where(eq(sources.id, row?.sourceId ?? ""));
    expect(source?.type).toBe("mcp");
    expect(source?.clientName).toBe("Claude");

    const context = await callTool(ownerToken, "get_workspace_context", { workspaceId });
    expect(context.content[0]?.text).toContain("Creatinine 1.4 mg/dL");
    expect(context.content[0]?.text).toContain("## Memory rules");
  });

  it("reuses one provenance row per app under parallel saves", async () => {
    await Promise.all(
      [1, 2, 3].map((n) =>
        callTool(ownerToken, "save_memory", {
          workspaceId,
          content: `Parallel fact ${n}`,
          kind: "note",
          happenedOn: null,
          supersedesId: null,
          metric: null,
          value: null,
          valueSecondary: null,
          unit: null,
        }),
      ),
    );
    const appSources = await db.select().from(sources).where(eq(sources.workspaceId, workspaceId));
    expect(appSources.filter((source) => source.type === "mcp")).toHaveLength(1);
  });

  it("registers a report and links its facts to it", async () => {
    const registered = await callTool(ownerToken, "register_report", { workspaceId, title: "KFT — 8 Oct 2026" });
    const { reportId, uploadUrl } = registered.structuredContent;
    expect(reportId).toBeTruthy();
    if (uploadUrl !== null) expect(uploadUrl).toMatch(/\/upload\/[A-Za-z0-9_-]{40,}$/);

    const saved = await callTool(ownerToken, "save_memory", {
      workspaceId,
      reportId,
      content: "Urea 42 mg/dL",
      kind: "measurement",
      happenedOn: "2026-10-08",
      supersedesId: null,
      metric: "urea",
      value: 42,
      valueSecondary: null,
      unit: "mg/dL",
    });
    const [row] = await db.select().from(memories).where(eq(memories.id, saved.structuredContent.saved.id));
    expect(row?.sourceId).toBe(reportId);
  });

  it("finds superseded history through search", async () => {
    const first = await callTool(ownerToken, "save_memory", {
      workspaceId,
      content: "Started metformin 500 mg daily",
      kind: "medication",
      happenedOn: "2026-01-10",
      supersedesId: null,
      metric: null,
      value: null,
      valueSecondary: null,
      unit: null,
    });
    await callTool(ownerToken, "save_memory", {
      workspaceId,
      content: "Metformin increased to 1000 mg daily",
      kind: "medication",
      happenedOn: "2026-06-02",
      supersedesId: first.structuredContent.saved.id,
      metric: null,
      value: null,
      valueSecondary: null,
      unit: null,
    });

    const context = await callTool(ownerToken, "get_workspace_context", { workspaceId });
    expect(context.content[0]?.text).not.toContain("Started metformin 500 mg daily");

    const history = await callTool(ownerToken, "search_memories", { workspaceId, query: "metformin" });
    const found = history.structuredContent.memories as Array<{ content: string; superseded: boolean }>;
    expect(found).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ content: "Started metformin 500 mg daily", superseded: true }),
        expect.objectContaining({ content: "Metformin increased to 1000 mg daily", superseded: false }),
      ]),
    );
  });
});
