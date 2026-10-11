import { saveMemoryToolInputSchema } from "@caretalk/contracts/health";
import { db } from "@caretalk/db";
import { oauthClient } from "@caretalk/db/schema/auth";
import { env } from "@caretalk/env/server";
import { createMcpHandler, McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import { eq } from "drizzle-orm";
import type { JWTPayload } from "jose";
import { z } from "zod";

import { HttpError } from "../lib/http-error";
import { SAVE_MEMORY_DESCRIPTION, UPDATE_PROFILE_DESCRIPTION, saveMemory, writeProfile } from "../lib/memory-tools";
import { resolveTimeZone, todayIn } from "../lib/time";
import { connectionsRepository } from "../repositories/connections-repository";
import { healthRepository } from "../repositories/health-repository";
import { reportsRepository } from "../repositories/reports-repository";
import { reportsService } from "../services/reports-service";
import { syncWorkspace } from "../whoop/sync";
import { DAILY_METRIC_FIELDS, dailySummaryForWorkspace, getDailyMetricsForCaller } from "../whoop/tools";
import { buildMcpContext } from "./context";

// The MCP face of Caretalk. Claude/ChatGPT become the model; Caretalk stays
// the memory. Every tool runs as the user named by the verified access token
// (`sub`), and every workspace lookup goes through the same owner-scoped
// repository call the REST API uses — a tool can't reach a workspace the user
// doesn't own, whatever id the model passes.
//
// The tool surface mirrors the in-app chat's (save_memory / update_profile,
// same descriptions, same write path) plus what a guest model needs that the
// in-app model gets for free: listing workspaces, loading context on demand,
// searching history, and registering documents.

export type McpCaller = { userId: string; client: { id: string; name: string } | null };

const INSTRUCTIONS = [
  "Caretalk is the user's permanent health memory: one workspace per person or condition they track (often a family member), holding dated facts — lab values, medications and dose changes, symptoms, appointments, decisions — and a short current-state profile.",
  "Workflow: when the user talks about their own or a family member's health, call list_workspaces, pick the matching workspace (ask if unclear), and call get_workspace_context BEFORE answering. Answer from that memory.",
  "Then save every new durable fact the user tells you or that you read from a document, following the rules returned by get_workspace_context. Never save their questions, worries, or your explanations.",
  "For a shared report/photo/PDF: register_report first, save its facts with that reportId, and give the user the upload link for the original.",
  "Wearable data (WHOOP recovery, HRV, sleep, strain) is separate from saved facts: get_workspace_context shows a 7-day summary when a device is connected; call get_daily_metrics for day-by-day values. Never save wearable numbers with save_memory.",
].join("\n\n");

const workspaceIdSchema = z.string().min(1).describe("The workspace id, from list_workspaces.");

function text(value: string): CallToolResult {
  return { content: [{ type: "text", text: value }] };
}

/** JSON both as text (every client reads it) and structured (clients that can). */
function json(value: Record<string, unknown>): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }], structuredContent: value };
}

/**
 * Tool errors go back to the model as a readable result rather than a
 * protocol error, so it can correct itself ("workspace not found" → list
 * again) instead of the whole turn failing. Unexpected errors stay generic.
 */
async function guarded(run: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof HttpError) return { ...text(error.message), isError: true };
    console.error("MCP tool failed", error);
    return { ...text("Caretalk hit an internal error running this tool. Nothing was saved by this call."), isError: true };
  }
}

export function buildMcpServer(caller: McpCaller) {
  const { userId } = caller;
  const server = new McpServer({ name: "caretalk", title: "Caretalk", version: "1.0.0" }, { instructions: INSTRUCTIONS });

  // Workspace ownership check, then the facts get attributed: to the report
  // they came from when the model names one, otherwise to this app.
  const resolveSource = async (workspaceId: string, reportId: string | null | undefined) => {
    if (reportId) {
      const report = await reportsRepository.getSource(workspaceId, reportId);
      return report.id;
    }
    if (!caller.client) return null;
    return (await reportsRepository.getOrCreateAppSource(workspaceId, caller.client)).id;
  };

  server.registerTool(
    "list_workspaces",
    {
      title: "List tracked people",
      description:
        "List the people/conditions the user tracks in Caretalk (one workspace each). Call this first whenever the user talks about their own or a family member's health, then load the matching workspace with get_workspace_context before answering.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    () =>
      guarded(async () => {
        const workspaces = await healthRepository.listWorkspaces(userId);
        return json({
          workspaces: workspaces.map((workspace) => ({
            id: workspace.id,
            name: workspace.name,
            description: workspace.description,
            updatedAt: workspace.updatedAt,
          })),
        });
      }),
  );

  server.registerTool(
    "get_workspace_context",
    {
      title: "Load health memory",
      description:
        "Load everything Caretalk knows about one workspace: the current profile, every active memory with its id, and the rules for what to save. Call before answering any health question about this person and before saving anything — answers must be grounded in it, and superseding needs the ids.",
      inputSchema: z.object({ workspaceId: workspaceIdSchema }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ workspaceId }) =>
      guarded(async () => {
        const workspace = await healthRepository.getWorkspace(userId, workspaceId);
        // No per-request zone from an external app: the deployment's zone is
        // the user's (single-user instance), which beats the server's UTC.
        const timeZone = resolveTimeZone(null);
        const today = todayIn(timeZone);
        const [activeMemories, reportsMissingOriginals, dailySummary] = await Promise.all([
          healthRepository.listActiveMemories(workspaceId),
          reportsService.fileStorageEnabled ? reportsRepository.listReportsMissingOriginals(workspaceId) : [],
          dailySummaryForWorkspace(workspaceId, today),
        ]);
        return text(buildMcpContext({ workspace, activeMemories, today, timeZone, reportsMissingOriginals, dailySummary }));
      }),
  );

  server.registerTool(
    "save_memory",
    {
      title: "Save a health fact",
      description: `${SAVE_MEMORY_DESCRIPTION} Load the workspace with get_workspace_context first in this conversation. For a fact read from a document registered with register_report, pass its reportId.`,
      inputSchema: saveMemoryToolInputSchema.extend({
        workspaceId: workspaceIdSchema,
        reportId: z
          .string()
          .nullable()
          .optional()
          .describe("The reportId from register_report when this fact came from that document; otherwise null."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    ({ workspaceId, reportId, ...input }) =>
      guarded(async () => {
        await healthRepository.getWorkspace(userId, workspaceId);
        const sourceId = await resolveSource(workspaceId, reportId);
        const saved = await saveMemory(workspaceId, input, { sourceId });
        return json({ saved });
      }),
  );

  server.registerTool(
    "update_profile",
    {
      title: "Update current-state profile",
      description: UPDATE_PROFILE_DESCRIPTION,
      inputSchema: z.object({
        workspaceId: workspaceIdSchema,
        profile: z.string().min(1).max(8000).describe("The full replacement profile block (markdown). Rewrite, don't append."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    ({ workspaceId, profile }) =>
      guarded(async () => {
        await healthRepository.getWorkspace(userId, workspaceId);
        // Versioned like every other profile write, so a bad rewrite from an
        // external app is one click to undo in the History panel.
        await writeProfile(workspaceId, profile, "model");
        return json({ ok: true, profile });
      }),
  );

  server.registerTool(
    "search_memories",
    {
      title: "Search full history",
      description:
        "Search this workspace's full history, including superseded facts that get_workspace_context leaves out. Use it for 'what was the dose before?', the complete series of one metric, or details from a date range. Active facts are already in get_workspace_context — don't search for those.",
      inputSchema: z.object({
        workspaceId: workspaceIdSchema,
        query: z.string().max(200).nullable().optional().describe("Words that must all appear in the fact, e.g. 'metformin'."),
        metric: z.string().max(60).nullable().optional().describe("Exact metric slug for a full series, e.g. 'creatinine'."),
        kind: z.string().nullable().optional().describe("measurement | medication | symptom | event | appointment | question | note"),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().describe("Earliest happenedOn, YYYY-MM-DD."),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().describe("Latest happenedOn, YYYY-MM-DD."),
        includeSuperseded: z.boolean().optional().describe("Include facts later replaced (old doses, resolved symptoms). Default true."),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ workspaceId, includeSuperseded, ...filters }) =>
      guarded(async () => {
        await healthRepository.getWorkspace(userId, workspaceId);
        const results = await healthRepository.searchMemories(workspaceId, {
          ...filters,
          includeSuperseded: includeSuperseded ?? true,
        });
        return json({
          count: results.length,
          memories: results.map((memory) => ({
            id: memory.id,
            happenedOn: memory.happenedOn,
            kind: memory.kind,
            content: memory.content,
            metric: memory.metric,
            value: memory.value,
            valueSecondary: memory.valueSecondary,
            unit: memory.unit,
            superseded: memory.supersededById !== null,
          })),
        });
      }),
  );

  server.registerTool(
    "register_report",
    {
      title: "Register a shared document",
      description:
        "Call once when the user shares a medical document (lab report, scan, prescription, discharge summary) as a photo or PDF, BEFORE saving its facts. Pass the returned reportId to every save_memory for facts read from it. Returns a one-time upload link (valid 30 minutes): show it to the user so they can attach the original file — you cannot upload files yourself.",
      inputSchema: z.object({
        workspaceId: workspaceIdSchema,
        title: z.string().trim().min(1).max(200).describe("Short name with date if known, e.g. 'CBC + KFT — 12 Oct 2026'."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    ({ workspaceId, title }) =>
      guarded(async () => {
        await healthRepository.getWorkspace(userId, workspaceId);
        const report = await reportsRepository.createReportSource(workspaceId, { title, client: caller.client });
        if (!reportsService.fileStorageEnabled) {
          return json({
            reportId: report.id,
            uploadUrl: null,
            note: "Original files can't be stored on this server yet; save the facts with this reportId anyway.",
          });
        }
        const link = await reportsService.createUploadLink(workspaceId, report.id, env.CORS_ORIGIN);
        return json({ reportId: report.id, uploadUrl: link.url, uploadUrlExpiresAt: link.expiresAt });
      }),
  );

  server.registerTool(
    "create_workspace",
    {
      title: "Start tracking someone new",
      description:
        "Create a new workspace — ONLY when the user explicitly asks to start tracking a new person or condition. Never create one just to file a fact; ask which existing workspace it belongs to instead.",
      inputSchema: z.object({
        name: z.string().trim().min(1).max(120).describe("Who or what is tracked, e.g. 'Dad — kidney cancer'."),
        description: z.string().trim().max(2000).nullable().optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    ({ name, description }) =>
      guarded(async () => {
        const workspace = await healthRepository.createWorkspace(userId, { name, description: description ?? null });
        return json({ workspace: { id: workspace.id, name: workspace.name } });
      }),
  );

  server.registerTool(
    "get_daily_metrics",
    {
      title: "Read daily wearable metrics",
      description:
        "Day-by-day wearable data (WHOOP) for a workspace: recovery %, HRV (ms), resting HR, SpO2, skin temp, sleep minutes/performance/efficiency, respiratory rate, day strain, kJ, heart rate, steps, workouts. One row per local date and source; missing values are omitted. Use for trends and for linking body data to dated facts (medication changes, symptoms). Max 366 days per call.",
      inputSchema: z.object({
        workspaceId: workspaceIdSchema,
        from: z.string().describe("First date, YYYY-MM-DD (inclusive)."),
        to: z.string().describe("Last date, YYYY-MM-DD (inclusive)."),
        metrics: z.array(z.enum(DAILY_METRIC_FIELDS)).optional().describe("Only these fields; omit for all."),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ workspaceId, ...input }) => guarded(async () => json(await getDailyMetricsForCaller(userId, workspaceId, input))),
  );

  server.registerTool(
    "sync_daily_metrics",
    {
      title: "Sync wearable data now",
      description:
        "Pull the latest data from the workspace's connected WHOOP right away instead of waiting for the scheduled sync (every 3 hours). Use when the user says today's numbers are missing or stale.",
      inputSchema: z.object({ workspaceId: workspaceIdSchema }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    ({ workspaceId }) => guarded(async () => json(await syncWorkspace(userId, workspaceId))),
  );

  return server;
}

// Client display names come from the OAuth registration ("Claude",
// "ChatGPT"). Cached per process: a name lookup per tool call is a query we
// don't need, and a stale name only affects a provenance label.
const clientNames = new Map<string, string>();

async function resolveClient(claims: JWTPayload): Promise<McpCaller["client"]> {
  const clientId =
    (typeof claims.azp === "string" && claims.azp) ||
    (typeof claims.client_id === "string" && claims.client_id) ||
    null;
  if (!clientId) return null;

  let name = clientNames.get(clientId);
  if (!name) {
    const [row] = await db
      .select({ name: oauthClient.name })
      .from(oauthClient)
      .where(eq(oauthClient.clientId, clientId))
      .limit(1);
    name = row?.name?.trim() || "External app";
    clientNames.set(clientId, name);
  }
  return { id: clientId, name };
}

// One handler for the process; the factory builds a fresh, caller-bound
// McpServer per request (the stateless pattern — nothing to clean up, and
// no state shared between users or requests). Default `legacy: "stateless"`
// keeps 2025-era clients working next to 2026-07-28 ones.
const handler = createMcpHandler(async ({ authInfo }) => {
  const caller = authInfo?.extra?.caller as McpCaller | undefined;
  if (!caller) throw new Error("MCP request reached the server without a verified caller");
  return buildMcpServer(caller);
});

function invalidToken(description: string, resourceMetadataUrl: string): Response {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: description }, id: null }),
    {
      status: 401,
      headers: {
        "content-type": "application/json",
        // Same challenge shape as a missing token, so the client re-runs the
        // OAuth flow instead of failing silently.
        "www-authenticate": `Bearer error="invalid_token", error_description="${description}", resource_metadata="${resourceMetadataUrl}"`,
      },
    },
  );
}

/**
 * Runs after the JWT is verified (signature, issuer, audience, expiry).
 * Adds the one check a stateless JWT can't make: the user hasn't since
 * disconnected this app. Without it, Disconnect would only take effect when
 * the current access token expired.
 */
export async function mcpHttpHandler(
  request: Request,
  claims: JWTPayload,
  resourceMetadataUrl: string,
): Promise<Response> {
  if (typeof claims.sub !== "string" || claims.sub.length === 0) {
    return invalidToken("Token has no subject", resourceMetadataUrl);
  }
  const client = await resolveClient(claims);
  if (!client || !(await connectionsRepository.isConnected(claims.sub, client.id))) {
    return invalidToken("This app was disconnected from Caretalk", resourceMetadataUrl);
  }
  const caller: McpCaller = { userId: claims.sub, client };
  const scopes = typeof claims.scope === "string" ? claims.scope.split(" ").filter(Boolean) : [];
  return handler.fetch(request, {
    authInfo: {
      token: request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "",
      clientId: caller.client?.id ?? "unknown",
      scopes,
      extra: { caller },
    },
  });
}
