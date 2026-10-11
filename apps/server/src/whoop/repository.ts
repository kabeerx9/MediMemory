import { randomUUID } from "node:crypto";

import { db } from "@caretalk/db";
import { dailyMetrics, deviceConnections, whoopRecords } from "@caretalk/db/schema/devices";
import { and, asc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";

import { METRIC_KEYS, type DailyMetricValues, type RawRecord, type WhoopRecordType } from "./types";

// Data access for device connections, raw WHOOP records and derived daily
// metrics. Like the other repositories, callers pass ids they've already
// authorized; nothing here re-checks ownership.

export type DeviceConnection = typeof deviceConnections.$inferSelect;
export type DailyMetricRow = typeof dailyMetrics.$inferSelect;

export type FetchedRecord = RawRecord & { startsAt: Date | null; endsAt: Date | null; scoreState: string | null };

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

  async saveTokens(id: string, tokens: { refreshTokenEnc: string; accessTokenEnc: string; accessExpiresAt: Date }) {
    await db.update(deviceConnections).set(tokens).where(eq(deviceConnections.id, id));
  },

  async markStatus(id: string, status: "active" | "needs_reconnect" | "revoked", lastError: string | null) {
    await db.update(deviceConnections).set({ status, lastError }).where(eq(deviceConnections.id, id));
  },

  async markSynced(id: string, at: Date) {
    await db.update(deviceConnections).set({ lastSyncedAt: at, lastError: null }).where(eq(deviceConnections.id, id));
  },

  async revoke(id: string) {
    await db
      .update(deviceConnections)
      .set({ status: "revoked", refreshTokenEnc: null, accessTokenEnc: null, accessExpiresAt: null })
      .where(eq(deviceConnections.id, id));
  },

  async upsertRecords(connectionId: string, records: FetchedRecord[]) {
    if (records.length === 0) return;
    const fetchedAt = new Date();
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

  async getDailyMetrics(workspaceId: string, from: string, to: string): Promise<DailyMetricRow[]> {
    return db
      .select()
      .from(dailyMetrics)
      .where(and(eq(dailyMetrics.workspaceId, workspaceId), gte(dailyMetrics.date, from), lte(dailyMetrics.date, to)))
      .orderBy(asc(dailyMetrics.date), asc(dailyMetrics.source));
  },
};
