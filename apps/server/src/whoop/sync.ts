import { createHash } from "node:crypto";

import { db } from "@caretalk/db";

import { notFound } from "../lib/http-error";
import { resolveTimeZone } from "../lib/time";
import { healthRepository } from "../repositories/health-repository";
import { getJson, listAll, refreshTokens, WhoopApiError, WhoopAuthError, WhoopUnauthorizedError } from "./client";
import { whoopConfig, type WhoopConfig } from "./config";
import { decryptToken, encryptToken } from "./crypto";
import { computeDailyMetrics, localDate } from "./metrics";
import { whoopRepository, type DeviceConnection, type FetchedRecord } from "./repository";
import type { WhoopRecordType } from "./types";

// One sync run for one connection:
//   lock → valid access token → fetch window → upsert raw → rebuild days → stamp
//
// Two invariants carry the design:
//   - WHOOP rotates the refresh token on every refresh and kills the old one,
//     so the new pair is committed BEFORE the access token is used. A crash
//     after that point costs nothing; a crash before it never happened.
//   - Runs for one connection never overlap (scheduler tick vs "Sync now" vs
//     an MCP call): a session-level advisory lock on a dedicated pool client.
//     A second caller gets "busy" instead of racing the same refresh token.

export type SyncResult = {
  status: "ok" | "busy" | "needs_reconnect" | "error";
  fetched: number;
  datesRecomputed: number;
  message?: string;
};

const OVERLAP_MS = 48 * 60 * 60 * 1000;
// Records loaded before the window start so every day inside it can be
// joined (a recovery to its sleep, a cycle to its wake-up day).
const JOIN_MARGIN_MS = 3 * 24 * 60 * 60 * 1000;
const ACCESS_TOKEN_SLACK_MS = 60 * 1000;

const COLLECTIONS: Array<{ type: Exclude<WhoopRecordType, "body">; path: string }> = [
  { type: "cycle", path: "/v2/cycle" },
  { type: "sleep", path: "/v2/activity/sleep" },
  { type: "recovery", path: "/v2/recovery" },
  { type: "workout", path: "/v2/activity/workout" },
];

/** Stable 48-bit advisory-lock key for a connection (fits a JS number and a pg bigint). */
export function lockKey(connectionId: string): number {
  return createHash("sha256").update(`whoop:${connectionId}`).digest().readUIntBE(0, 6);
}

function toFetched(type: WhoopRecordType, payload: any): FetchedRecord {
  // Recoveries have no start of their own; created_at (≈ wake-up) keeps them
  // inside the same load window as the sleep they're joined to.
  const start = type === "recovery" ? payload.created_at : payload.start;
  return {
    type,
    whoopId: type === "recovery" ? String(payload.sleep_id) : type === "body" ? "body" : String(payload.id),
    payload,
    startsAt: start ? new Date(start) : null,
    endsAt: payload.end ? new Date(payload.end) : null,
    scoreState: payload.score_state ?? null,
  };
}

class ReconnectRequired extends Error {}
/** The connection was disconnected or reconnected while this run was working. */
class ConnectionChanged extends Error {}

type RunOptions = { retryDelayMs?: number };

/**
 * A short, safe description for last_error and logs. Drizzle's query errors
 * embed every bound parameter — raw WHOOP health JSON, encrypted tokens — so
 * the wrapped message must never be stored or returned.
 */
export function describeSyncError(error: unknown): string {
  if (error instanceof WhoopApiError) return `WHOOP returned ${error.status}`;
  const cause = error instanceof Error ? (error.cause as { code?: unknown } | undefined) : undefined;
  if (cause && typeof cause.code === "string") return `Database error ${cause.code}`;
  if (error instanceof Error && error.name === "DrizzleQueryError") return "Database error";
  if (error instanceof TypeError) return "Network error reaching WHOOP";
  return error instanceof Error ? error.name : "Unknown error";
}

async function freshAccessToken(cfg: WhoopConfig, connection: DeviceConnection, now: Date, force: boolean): Promise<string> {
  if (!force && connection.accessTokenEnc && connection.accessExpiresAt && connection.accessExpiresAt.getTime() > now.getTime() + ACCESS_TOKEN_SLACK_MS) {
    return decryptToken(connection.accessTokenEnc, cfg.key);
  }
  const expected = connection.refreshTokenEnc;
  if (!expected) throw new ReconnectRequired("No refresh token stored");
  try {
    const tokens = await refreshTokens(cfg, decryptToken(expected, cfg.key));
    const saved = {
      refreshTokenEnc: encryptToken(tokens.refreshToken, cfg.key),
      accessTokenEnc: encryptToken(tokens.accessToken, cfg.key),
      accessExpiresAt: tokens.expiresAt,
    };
    if (!(await whoopRepository.saveTokens(connection.id, expected, saved))) throw new ConnectionChanged();
    Object.assign(connection, saved);
    return tokens.accessToken;
  } catch (error) {
    if (error instanceof WhoopAuthError) throw new ReconnectRequired(error.message);
    throw error;
  }
}

async function fetchWindow(cfg: WhoopConfig, accessToken: string, start: Date | null, opts: RunOptions): Promise<FetchedRecord[]> {
  const params = start ? { start: start.toISOString() } : {};
  const records: FetchedRecord[] = [];
  for (const { type, path } of COLLECTIONS) {
    for (const payload of await listAll(cfg, accessToken, path, params, opts)) records.push(toFetched(type, payload));
  }
  // Body measurements are kept raw but feed no metric: a failure here must
  // never block the data that matters. 401s still surface (token problem).
  try {
    records.push(toFetched("body", await getJson(cfg, accessToken, "/v2/user/measurement/body", opts)));
  } catch (error) {
    if (!(error instanceof WhoopApiError)) throw error;
  }
  return records;
}

async function runLocked(cfg: WhoopConfig, connection: DeviceConnection, now: Date, opts: RunOptions): Promise<SyncResult> {
  const windowStart = connection.lastSyncedAt ? new Date(connection.lastSyncedAt.getTime() - OVERLAP_MS) : null;

  let fetched: FetchedRecord[];
  try {
    const token = await freshAccessToken(cfg, connection, now, false);
    try {
      fetched = await fetchWindow(cfg, token, windowStart, opts);
    } catch (error) {
      if (!(error instanceof WhoopUnauthorizedError)) throw error;
      fetched = await fetchWindow(cfg, await freshAccessToken(cfg, connection, now, true), windowStart, opts);
    }
  } catch (error) {
    if (error instanceof ReconnectRequired || error instanceof WhoopUnauthorizedError) {
      // Only if nobody reconnected meanwhile — a fresh connection stays active.
      if (await whoopRepository.markNeedsReconnect(connection.id, connection.refreshTokenEnc, "WHOOP rejected the stored credentials")) {
        return { status: "needs_reconnect", fetched: 0, datesRecomputed: 0, message: "WHOOP needs to be reconnected." };
      }
      throw new ConnectionChanged();
    }
    throw error;
  }

  await whoopRepository.upsertRecords(connection.id, fetched);

  const timeZone = resolveTimeZone(null);
  const loaded = await whoopRepository.loadRecords(
    connection.id,
    windowStart ? new Date(windowStart.getTime() - JOIN_MARGIN_MS) : null,
  );
  const days = computeDailyMetrics(loaded, timeZone);
  const fromDate = windowStart ? localDate(windowStart.toISOString(), timeZone) : "0000-00-00";
  await whoopRepository.replaceDailyMetrics(connection.workspaceId, "whoop", fromDate, days);
  await whoopRepository.markSynced(connection.id, now);

  return { status: "ok", fetched: fetched.length, datesRecomputed: [...days.keys()].filter((d) => d >= fromDate).length };
}

export async function syncConnection(
  connectionId: string,
  opts: { cfg?: WhoopConfig; now?: Date } & RunOptions = {},
): Promise<SyncResult> {
  const cfg = opts.cfg ?? whoopConfig();
  if (!cfg) return { status: "error", fetched: 0, datesRecomputed: 0, message: "WHOOP isn't configured on this server." };
  const now = opts.now ?? new Date();

  const client = await db.$client.connect();
  // A checked-out pg client has no error listener; without this, Postgres
  // dropping the session mid-run (restart, terminate) is an uncaught 'error'
  // event that kills the whole server. The session lock dies with it.
  let clientError: Error | undefined;
  client.on("error", (error) => {
    clientError = error;
  });
  const key = lockKey(connectionId);
  try {
    const { rows } = await client.query<{ locked: boolean }>("select pg_try_advisory_lock($1) as locked", [key]);
    if (!rows[0]?.locked) return { status: "busy", fetched: 0, datesRecomputed: 0, message: "A WHOOP sync is already running." };
    try {
      const connection = await whoopRepository.getConnection(connectionId);
      if (!connection) throw notFound("WHOOP connection not found");
      if (connection.status !== "active") {
        return { status: "needs_reconnect", fetched: 0, datesRecomputed: 0, message: `WHOOP connection is ${connection.status}.` };
      }
      return await runLocked(cfg, connection, now, { retryDelayMs: opts.retryDelayMs });
    } catch (error) {
      if (error instanceof Error && "statusCode" in error) throw error;
      if (error instanceof ConnectionChanged) {
        return { status: "busy", fetched: 0, datesRecomputed: 0, message: "The WHOOP connection changed during the sync." };
      }
      const message = describeSyncError(error);
      const detail = error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
      console.error("WHOOP sync failed", { connectionId, message, detail: detail.slice(0, 200) });
      await whoopRepository.markError(connectionId, message).catch(() => {});
      return { status: "error", fetched: 0, datesRecomputed: 0, message: "WHOOP sync failed; it will retry on the next run." };
    } finally {
      if (!clientError) await client.query("select pg_advisory_unlock($1)", [key]).catch((error: Error) => (clientError = error));
    }
  } finally {
    client.release(clientError);
  }
}

/** Owner-checked sync for the routes and MCP tools. */
export async function syncWorkspace(userId: string, workspaceId: string): Promise<SyncResult> {
  await healthRepository.getWorkspace(userId, workspaceId);
  const connection = await whoopRepository.getConnectionForWorkspace(workspaceId);
  if (!connection) throw notFound("WHOOP isn't connected for this workspace.");
  return syncConnection(connection.id);
}
