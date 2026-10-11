import { randomUUID } from "node:crypto";

import { db } from "@caretalk/db";
import { dailyMetrics, deviceConnections, whoopOauthStates, whoopRecords } from "@caretalk/db/schema/devices";
import { and, asc, eq, gt, gte, isNull, lt, lte, or, sql } from "drizzle-orm";

import { METRIC_KEYS, type DailyMetricValues, type RawRecord, type WhoopRecordType } from "./types";

// Data access for device connections, raw WHOOP records and derived daily
// metrics. Like the other repositories, callers pass ids they've already
// authorized; nothing here re-checks ownership.

export type DeviceConnection = typeof deviceConnections.$inferSelect;
export type DailyMetricRow = typeof dailyMetrics.$inferSelect;

export type FetchedRecord = RawRecord & { startsAt: Date | null; endsAt: Date | null; scoreState: string | null };

const UPSERT_CHUNK = 500;

function currentConnection(id: string, expectedRefreshEnc: string | null) {
  return and(
    eq(deviceConnections.id, id),
    eq(deviceConnections.status, "active"),
    expectedRefreshEnc === null ? isNull(deviceConnections.refreshTokenEnc) : eq(deviceConnections.refreshTokenEnc, expectedRefreshEnc),
  );
}

async function upsertChunk(connectionId: string, records: FetchedRecord[], fetchedAt: Date) {
  await db
    .insert(whoopRecords)
    .values(
      records.map((record) => ({
        id: randomUUID(),
        connectionId,
        type: record.type,
        whoopId: record.whoopId,
        startsAt: record.startsAt,
        endsAt: record.endsAt,
        scoreState: record.scoreState,
        payload: record.payload,
        fetchedAt,
      })),
    )
    .onConflictDoUpdate({
      target: [whoopRecords.connectionId, whoopRecords.type, whoopRecords.whoopId],
      set: {
        startsAt: sql`excluded.starts_at`,
        endsAt: sql`excluded.ends_at`,
        scoreState: sql`excluded.score_state`,
        payload: sql`excluded.payload`,
        fetchedAt: sql`excluded.fetched_at`,
      },
    });
}

export const whoopRepository = {
  async getConnection(id: string): Promise<DeviceConnection | null> {
    const [row] = await db.select().from(deviceConnections).where(eq(deviceConnections.id, id));
    return row ?? null;
  },

  async getConnectionForWorkspace(workspaceId: string, provider = "whoop"): Promise<DeviceConnection | null> {
    const [row] = await db
      .select()
      .from(deviceConnections)
      .where(and(eq(deviceConnections.workspaceId, workspaceId), eq(deviceConnections.provider, provider)));
    return row ?? null;
  },

  async listActiveConnections(provider = "whoop"): Promise<DeviceConnection[]> {
    return db
      .select()
      .from(deviceConnections)
      .where(and(eq(deviceConnections.provider, provider), eq(deviceConnections.status, "active")));
  },

  /** Connect or reconnect: fresh tokens, status back to active, history kept. */
  async upsertConnection(input: {
    workspaceId: string;
    externalUserId: string | null;
    refreshTokenEnc: string;
    accessTokenEnc: string;
    accessExpiresAt: Date;
    scopes: string;
  }): Promise<DeviceConnection> {
    const values = { ...input, status: "active", lastError: null };
    const [row] = await db
      .insert(deviceConnections)
      .values({ id: randomUUID(), provider: "whoop", ...values })
      .onConflictDoUpdate({ target: [deviceConnections.workspaceId, deviceConnections.provider], set: values })
      .returning();
    return row!;
  },

  // The writes a sync makes are conditional on the connection still being the
  // one it started with: active, holding the refresh token it read. A
  // disconnect or reconnect that lands mid-sync (neither takes the sync lock)
  // then wins, instead of being overwritten by a run working from stale state.
  // Each returns whether the row was still current.

  async saveTokens(
    id: string,
    expectedRefreshEnc: string,
    tokens: { refreshTokenEnc: string; accessTokenEnc: string; accessExpiresAt: Date },
  ): Promise<boolean> {
    const rows = await db
      .update(deviceConnections)
      .set(tokens)
      .where(currentConnection(id, expectedRefreshEnc))
      .returning({ id: deviceConnections.id });
    return rows.length > 0;
  },

  async markNeedsReconnect(id: string, expectedRefreshEnc: string | null, lastError: string): Promise<boolean> {
    const rows = await db
      .update(deviceConnections)
      .set({ status: "needs_reconnect", lastError })
      .where(currentConnection(id, expectedRefreshEnc))
      .returning({ id: deviceConnections.id });
    return rows.length > 0;
  },

  /** Records a failed run without touching status: the connection itself is fine. */
  async markError(id: string, lastError: string) {
    await db
      .update(deviceConnections)
      .set({ lastError })
      .where(and(eq(deviceConnections.id, id), eq(deviceConnections.status, "active")));
  },

  async markSynced(id: string, at: Date) {
    await db
      .update(deviceConnections)
      .set({ lastSyncedAt: at, lastError: null })
      .where(and(eq(deviceConnections.id, id), eq(deviceConnections.status, "active")));
  },

  async revoke(id: string) {
    await db
      .update(deviceConnections)
      .set({ status: "revoked", refreshTokenEnc: null, accessTokenEnc: null, accessExpiresAt: null })
      .where(eq(deviceConnections.id, id));
  },

  async upsertRecords(connectionId: string, records: FetchedRecord[]) {
    const fetchedAt = new Date();
    // Chunked: one statement may bind at most 65,535 parameters (9 per row),
    // and a multi-year first backfill is well past that.
    for (let i = 0; i < records.length; i += UPSERT_CHUNK) {
      await upsertChunk(connectionId, records.slice(i, i + UPSERT_CHUNK), fetchedAt);
    }
  },

  /** Records starting at or after `since` (all when null), plus undated ones (body). */
  async loadRecords(connectionId: string, since: Date | null): Promise<RawRecord[]> {
    const rows = await db
      .select({ type: whoopRecords.type, whoopId: whoopRecords.whoopId, payload: whoopRecords.payload })
      .from(whoopRecords)
      .where(
        and(
          eq(whoopRecords.connectionId, connectionId),
          since ? or(gte(whoopRecords.startsAt, since), isNull(whoopRecords.startsAt)) : undefined,
        ),
      );
    return rows.map((row) => ({ ...row, type: row.type as WhoopRecordType }));
  },

  /**
   * Replace every derived row for this source from `fromDate` on. Deleting
   * first means a day whose records were re-scored as unscorable (or deleted
   * upstream) disappears instead of keeping stale numbers.
   */
  async replaceDailyMetrics(workspaceId: string, source: string, fromDate: string, days: Map<string, DailyMetricValues>) {
    await db.transaction(async (tx) => {
      await tx
        .delete(dailyMetrics)
        .where(and(eq(dailyMetrics.workspaceId, workspaceId), eq(dailyMetrics.source, source), gte(dailyMetrics.date, fromDate)));
      const rows = [...days]
        .filter(([date, values]) => date >= fromDate && METRIC_KEYS.some((k) => values[k] !== null))
        .map(([date, values]) => ({
          id: randomUUID(),
          workspaceId,
          date,
          source,
          ...values,
          steps: values.steps === null ? null : Math.round(values.steps),
          workoutCount: values.workoutCount,
          computedAt: new Date(),
        }));
      if (rows.length > 0) await tx.insert(dailyMetrics).values(rows);
    });
  },

  async createOauthState(input: { state: string; userId: string; workspaceId: string; expiresAt: Date }) {
    // Expired states are dead weight; sweep them whenever a new flow starts.
    await db.delete(whoopOauthStates).where(lt(whoopOauthStates.expiresAt, new Date()));
    await db.insert(whoopOauthStates).values(input);
  },

  /** Single use: the row is deleted as it's read, so a replayed callback finds nothing. */
  async consumeOauthState(state: string): Promise<{ userId: string; workspaceId: string } | null> {
    const [row] = await db
      .delete(whoopOauthStates)
      .where(and(eq(whoopOauthStates.state, state), gt(whoopOauthStates.expiresAt, new Date())))
      .returning({ userId: whoopOauthStates.userId, workspaceId: whoopOauthStates.workspaceId });
    return row ?? null;
  },

  async getDailyMetrics(workspaceId: string, from: string, to: string): Promise<DailyMetricRow[]> {
    return db
      .select()
      .from(dailyMetrics)
      .where(and(eq(dailyMetrics.workspaceId, workspaceId), gte(dailyMetrics.date, from), lte(dailyMetrics.date, to)))
      .orderBy(asc(dailyMetrics.date), asc(dailyMetrics.source));
  },
};
